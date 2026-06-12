// seed-telemetry.mjs — 텔레메트리 백필 시뮬레이션 (로드맵 ② A안 · 1회 실행).
// 과거 48h(raw 1분) · 30일(hourly 1시간) · 현재값(latest)을 결정적으로 생성·적재.
// 엔티티 상태(xid/idle/normal) 반영 + 일주기 sin + 결정적 노이즈로 "예쁜" 정상범위.
// 실행: npm run seed:telemetry  (엔티티 시드(npm run seed)가 먼저 끝나 있어야 함)
// 멱등: 시작 시 telemetry_* 를 truncate 후 전량 재생성.
import pg from 'pg'

const MIN = 60_000, HOUR = 3_600_000
const RAW_SPAN_H = 48, HOURLY_SPAN_D = 30
const CHUNK = 1000

// 모델별 TDP(W) — power 시뮬 기준
const TDP = {
  'NVIDIA RTX PRO 4500 Blackwell': 200, 'RTX 5070': 250, 'RTX 2060 SUPER': 175,
  'RTX 2070 SUPER': 215, 'RTX 2060': 160, 'RTX 3060 Ti': 200, 'GTX 1070': 150, 'RTX 2070': 175,
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// 결정적 노이즈 [0,1) — (시리즈키, ts) FNV 해시. 재실행해도 동일 값.
function noise(key, t) {
  let h = 2166136261 >>> 0
  const s = key + ':' + t
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}

// (kind, metric, 상태) → 곡선 파라미터 {base, dayAmp, jitter, floor, ceil}
function profileFor(s) {
  const { kind, metric, state, model, hot, usage } = s
  const P = (base, dayAmp, jitter, floor, ceil) => ({ base, dayAmp, jitter, floor, ceil })

  if (state === 'down' || state === 'xid') {          // 응답없음/점검 → 거의 0
    if (metric === 'power') return P(12, 0, 3, 0, 30)
    if (metric === 'temp') return P(0, 0, 0, 0, 0)
    return P(0, 0, 1, 0, 4)
  }
  if (state === 'idle') {                              // 유휴(미할당)
    switch (metric) {
      case 'sm': case 'usage': return P(1.5, 0, 1.5, 0, 6)
      case 'vram': return P(2, 0, 2, 0, 6)
      case 'temp': return kind === 'gpu' ? P(35, 2, 2, 30, 42) : P(22, 1, 1, 20, 26)
      case 'power': return P((TDP[model] || 180) * 0.1, 0, 4, 8, 40)
      case 'cpu_util': return P(6, 2, 3, 1, 14)
      case 'mem_util': return P(24, 2, 3, 18, 34)
      case 'net_in': case 'net_out': return P(8, 4, 4, 0, 25)
      default: return P(0, 0, 0, 0, 0)                 // tokens/calls
    }
  }
  switch (metric) {                                    // active(정상 부하)
    case 'sm': case 'usage': return P(56, 18, 7, 5, 96)
    case 'vram': return P(70, 10, 5, 20, 95)
    case 'temp':
      return kind === 'gpu'
        ? (hot ? P(77, 6, 3, 68, 86) : P(63, 8, 3, 48, 78))
        : P(25, 2, 1.5, 21, 31)
    case 'power': { const t = TDP[model] || 180; return P(t * 0.62, t * 0.16, t * 0.05, t * 0.2, t * 0.98) }
    case 'cpu_util': return P(34, 15, 6, 6, 82)
    case 'mem_util': return P(54, 9, 5, 30, 88)
    case 'net_in': return P(190, 120, 40, 10, 480)
    case 'net_out': return P(150, 100, 35, 8, 430)
    case 'tokens': { const b = (usage || 0) / 600; return P(b, b * 0.45, b * 0.18, 0, b * 2) }
    case 'calls': { const b = (usage || 0) / 2500; return P(b, b * 0.45, b * 0.2, 0, b * 2.2) }
    default: return P(40, 10, 5, 0, 100)
  }
}

// 한 시점의 값: baseline + 일주기 + 주간추세 + 결정적 노이즈. smooth=hourly(노이즈 약).
function valueAt(s, prof, t, smooth) {
  const d = new Date(t)
  const hod = d.getUTCHours() + d.getUTCMinutes() / 60
  const day = Math.sin(2 * Math.PI * (hod - 9) / 24)
  const week = 0.4 * Math.sin(2 * Math.PI * t / (7 * 24 * HOUR))
  const jit = smooth ? prof.jitter * 0.3 : prof.jitter
  const n = noise(s.key, t) * 2 - 1
  const v = prof.base + prof.dayAmp * (day + week) + jit * n
  return Math.round(clamp(v, prof.floor, prof.ceil) * 100) / 100
}

async function insertChunked(client, table, cols, rows) {
  const w = cols.length
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK)
    const ph = part.map((_, r) => `(${cols.map((_, c) => `$${r * w + c + 1}`).join(',')})`).join(',')
    await client.query(`insert into ${table}(${cols.join(',')}) values ${ph}`, part.flat())
  }
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const gpus = (await client.query(`select id,model,health,assigned_service_id,xid from gpus`)).rows
  const servers = (await client.query(`select id,health from gpu_servers`)).rows
  const slices = (await client.query(`select id,health from mig_slices`)).rows
  const services = (await client.query(`select id,usage_count from services`)).rows

  // --- 시리즈 구성 (다대다는 대상이 직접 쌓는 지표만; 파생은 화면에서) ---
  const series = []
  const add = (kind, id, metric, ent) => series.push({ kind, id, metric, key: `${kind}|${id}|${metric}`, ...ent })

  for (const g of gpus) {
    const state = g.xid ? 'xid' : g.health === 'inactive' ? 'idle' : g.health === 'danger' ? 'down' : 'active'
    const ent = { state, model: g.model, hot: g.id === 'srv-04-gpu0' }
    for (const m of ['sm', 'vram', 'temp', 'power']) add('gpu', g.id, m, ent)
  }
  for (const sv of servers) {
    const state = sv.health === 'inactive' ? 'idle' : sv.health === 'danger' ? 'down' : 'active'
    for (const m of ['cpu_util', 'mem_util', 'net_in', 'net_out', 'temp']) add('server', sv.id, m, { state })
  }
  for (const sl of slices) {
    const state = sl.health === 'inactive' ? 'idle' : 'active'
    for (const m of ['usage', 'vram']) add('slice', sl.id, m, { state })
  }
  for (const sc of services)
    for (const m of ['tokens', 'calls']) add('service', sc.id, m, { state: 'active', usage: sc.usage_count })

  // --- 멱등: 전량 재생성 ---
  await client.query('truncate telemetry_raw, telemetry_hourly, telemetry_latest')

  const now = Date.now()
  const t0raw = now - RAW_SPAN_H * HOUR
  const t0hr = now - HOURLY_SPAN_D * 24 * HOUR

  const rawRows = [], hrRows = [], latestRows = []
  for (const s of series) {
    const prof = profileFor(s)
    for (let t = t0raw; t <= now; t += MIN)
      rawRows.push([new Date(t).toISOString(), s.kind, s.id, s.metric, valueAt(s, prof, t, false)])
    for (let t = t0hr; t <= now; t += HOUR)
      hrRows.push([new Date(t).toISOString(), s.kind, s.id, s.metric, valueAt(s, prof, t, true)])
    latestRows.push([s.kind, s.id, s.metric, valueAt(s, prof, now, false)])
  }

  await insertChunked(client, 'telemetry_raw', ['ts', 'kind', 'id', 'metric', 'value'], rawRows)
  await insertChunked(client, 'telemetry_hourly', ['ts', 'kind', 'id', 'metric', 'value'], hrRows)
  for (let i = 0; i < latestRows.length; i += CHUNK) {
    const part = latestRows.slice(i, i + CHUNK)
    const ph = part.map((_, r) => `($${r * 4 + 1},$${r * 4 + 2},$${r * 4 + 3},$${r * 4 + 4})`).join(',')
    await client.query(
      `insert into telemetry_latest(kind,id,metric,value) values ${ph}
       on conflict (kind,id,metric) do update set value=excluded.value, updated_at=now()`,
      part.flat())
  }

  const c = (await client.query(`select
    (select count(*) from telemetry_latest) latest,
    (select count(*) from telemetry_raw) raw,
    (select count(*) from telemetry_hourly) hourly`)).rows[0]
  console.log(`✓ telemetry seeded — series=${series.length}, raw_span=${RAW_SPAN_H}h, hourly_span=${HOURLY_SPAN_D}d`)
  console.log('counts:', c)
  await client.end()
}

main().catch((e) => { console.error('telemetry seed failed:', e); process.exit(1) })
