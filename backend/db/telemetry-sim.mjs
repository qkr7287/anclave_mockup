// 텔레메트리 시뮬레이션 공통 — seed-telemetry(백필) + worker(실시간) 공유.
// 결정적 생성(Math.random 미사용): (시리즈키, ts) 해시 노이즈로 재실행해도 동일.
const SEC = 1000, HOUR = 3_600_000

// 모델별 TDP(W) — power 시뮬 기준
const TDP = {
  'NVIDIA RTX PRO 4500 Blackwell': 200, 'RTX 5070': 250, 'RTX 2060 SUPER': 175,
  'RTX 2070 SUPER': 215, 'RTX 2060': 160, 'RTX 3060 Ti': 200, 'GTX 1070': 150, 'RTX 2070': 175,
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// 결정적 노이즈 [0,1) — (시리즈키, ts) FNV 해시.
function noise(key, t) {
  let h = 2166136261 >>> 0
  const s = key + ':' + t
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}

// (kind, metric, 상태) → 곡선 파라미터 {base, dayAmp, jitter, floor, ceil}
export function profileFor(s) {
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

// 한 시점의 값: baseline + 일주기 + 주간추세 + 결정적 노이즈.
export function valueAt(s, prof, t, smooth) {
  const d = new Date(t)
  const hod = d.getUTCHours() + d.getUTCMinutes() / 60
  const day = Math.sin(2 * Math.PI * (hod - 9) / 24)
  const week = 0.4 * Math.sin(2 * Math.PI * t / (7 * 24 * HOUR))
  const jit = smooth ? prof.jitter * 0.3 : prof.jitter
  const n = noise(s.key, t) * 2 - 1
  const v = prof.base + prof.dayAmp * (day + week) + jit * n
  return Math.round(clamp(v, prof.floor, prof.ceil) * 100) / 100
}

// 버킷 [t0,t1) 을 stepSec 간격 샘플 → avg/min/max. 밴드(1m·hourly) 사전집계.
export function bucketAgg(s, prof, t0, t1, stepSec, smooth) {
  let sum = 0, cnt = 0, mn = Infinity, mx = -Infinity
  for (let t = t0; t < t1; t += stepSec * SEC) {
    const v = valueAt(s, prof, t, smooth)
    sum += v; cnt++
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const r = (x) => Math.round(x * 100) / 100
  return { avg: r(sum / cnt), min: r(mn), max: r(mx) }
}

// 엔티티 → 시리즈 구성(prof 미리 계산). 측정 대상 4종, 대상이 직접 쌓는 지표만.
export async function loadSeries(db) {
  const gpus = (await db.query(`select id,model,health,assigned_service_id,xid from gpus`)).rows
  const servers = (await db.query(`select id,health from gpu_servers`)).rows
  const slices = (await db.query(`select id,health from mig_slices`)).rows
  const services = (await db.query(`select id,usage_count from services`)).rows

  const series = []
  const add = (kind, id, metric, ent) => {
    const s = { kind, id, metric, key: `${kind}|${id}|${metric}`, ...ent }
    s.prof = profileFor(s)
    series.push(s)
  }
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

  return series
}
