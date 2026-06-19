// seed-telemetry.mjs — 텔레메트리 백필 (raw 5초/6h · 1m 1분/2d · hourly 1시간/35d + v_min/v_max).
// 결정적 생성은 telemetry-sim.mjs 공유(worker 와 동일). 멱등: truncate 후 전량 재생성.
// 실행: npm run seed:telemetry  (엔티티 시드(npm run seed)가 먼저 끝나 있어야 함)
import pg from 'pg'
import { valueAt, bucketAgg, loadSeries } from '../telemetry-sim.mjs'

const SEC = 1000, MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000
const RAW_SPAN_H = 6, M1_SPAN_D = 2, HOURLY_SPAN_D = 35
const CHUNK = 1000

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
  const series = await loadSeries(client)

  await client.query('truncate telemetry_raw, telemetry_1m, telemetry_hourly, telemetry_latest')
  const now = Date.now()
  const rawRows = [], m1Rows = [], hrRows = [], latestRows = []
  for (const s of series) {
    const prof = s.prof
    // raw: 5초 간격, 과거 6시간
    for (let t = now - RAW_SPAN_H * HOUR; t <= now; t += 5 * SEC)
      rawRows.push([new Date(t).toISOString(), s.kind, s.id, s.metric, valueAt(s, prof, t, false)])
    // 1m: 1분 버킷(내부 5초 12점) avg/min/max, 과거 2일
    for (let b = now - M1_SPAN_D * DAY; b <= now; b += MIN) {
      const a = bucketAgg(s, prof, b, b + MIN, 5, false)
      m1Rows.push([new Date(b).toISOString(), s.kind, s.id, s.metric, a.avg, a.min, a.max])
    }
    // hourly: 1시간 버킷(내부 1분 60점) avg/min/max, 과거 35일
    for (let b = now - HOURLY_SPAN_D * DAY; b <= now; b += HOUR) {
      const a = bucketAgg(s, prof, b, b + HOUR, 60, false)
      hrRows.push([new Date(b).toISOString(), s.kind, s.id, s.metric, a.avg, a.min, a.max])
    }
    latestRows.push([s.kind, s.id, s.metric, valueAt(s, prof, now, false)])
  }

  await insertChunked(client, 'telemetry_raw', ['ts', 'kind', 'id', 'metric', 'value'], rawRows)
  await insertChunked(client, 'telemetry_1m', ['ts', 'kind', 'id', 'metric', 'value', 'v_min', 'v_max'], m1Rows)
  await insertChunked(client, 'telemetry_hourly', ['ts', 'kind', 'id', 'metric', 'value', 'v_min', 'v_max'], hrRows)
  for (let i = 0; i < latestRows.length; i += CHUNK) {
    const part = latestRows.slice(i, i + CHUNK)
    const ph = part.map((_, r) => `($${r * 4 + 1},$${r * 4 + 2},$${r * 4 + 3},$${r * 4 + 4})`).join(',')
    await client.query(
      `insert into telemetry_latest(kind,id,metric,value) values ${ph}
       on conflict (kind,id,metric) do update set value=excluded.value, updated_at=now()`,
      part.flat())
  }

  const c = (await client.query(`select
    (select count(*) from telemetry_latest) latest, (select count(*) from telemetry_raw) raw,
    (select count(*) from telemetry_1m) m1, (select count(*) from telemetry_hourly) hourly`)).rows[0]
  console.log(`✓ telemetry seeded — series=${series.length} · raw=${RAW_SPAN_H}h/5s · 1m=${M1_SPAN_D}d · hourly=${HOURLY_SPAN_D}d`)
  console.log('counts:', c)
  await client.end()
}

main().catch((e) => { console.error('telemetry seed failed:', e); process.exit(1) })
