// worker.mjs — 실시간 텔레메트리 적재·롤업·보존청소. 결정적 생성(telemetry-sim 공유, seed 와 동일 함수).
// 5초: 현재값 raw insert + latest upsert / 1분: raw→1m / 1시간: 1m→hourly / 보존청소.
// 실행: npm run worker  (DB·엔티티 시드가 끝나 있어야 함)
import pg from 'pg'
import { valueAt, loadSeries } from './telemetry-sim.mjs'

const SEC = 1000
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })

let SERIES = []

// 5초: 전 시리즈 현재값 → raw insert + latest upsert (t=now, 결정적)
async function tick5s() {
  if (!SERIES.length) return
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const rawVals = [], latVals = []
  for (const s of SERIES) {
    const v = valueAt(s, s.prof, now, false)
    rawVals.push(iso, s.kind, s.id, s.metric, v)
    latVals.push(s.kind, s.id, s.metric, v)
  }
  const rawPh = SERIES.map((_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(',')
  await pool.query(`insert into telemetry_raw(ts,kind,id,metric,value) values ${rawPh}`, rawVals)
  const latPh = SERIES.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(',')
  await pool.query(
    `insert into telemetry_latest(kind,id,metric,value) values ${latPh}
     on conflict (kind,id,metric) do update set value=excluded.value, updated_at=now()`, latVals)
}

// 1분: 직전 1분 raw → telemetry_1m rollup (avg/min/max)
async function rollup1m() {
  await pool.query(
    `insert into telemetry_1m(ts,kind,id,metric,value,v_min,v_max)
     select date_trunc('minute', ts), kind, id, metric, avg(value), min(value), max(value)
       from telemetry_raw
      where ts >= date_trunc('minute', now()) - interval '1 minute' and ts < date_trunc('minute', now())
      group by 1, kind, id, metric
     on conflict (kind,id,metric,ts) do update
       set value=excluded.value, v_min=excluded.v_min, v_max=excluded.v_max`)
}

// 1시간: 직전 1시간 telemetry_1m → telemetry_hourly rollup
async function rollup1h() {
  await pool.query(
    `insert into telemetry_hourly(ts,kind,id,metric,value,v_min,v_max)
     select date_trunc('hour', ts), kind, id, metric, avg(value), min(v_min), max(v_max)
       from telemetry_1m
      where ts >= date_trunc('hour', now()) - interval '1 hour' and ts < date_trunc('hour', now())
      group by 1, kind, id, metric
     on conflict (kind,id,metric,ts) do update
       set value=excluded.value, v_min=excluded.v_min, v_max=excluded.v_max`)
}

// 보존청소: raw>6h, 1m>2d, hourly>35d
async function cleanup() {
  await pool.query(`delete from telemetry_raw where ts < now() - interval '6 hours'`)
  await pool.query(`delete from telemetry_1m where ts < now() - interval '2 days'`)
  await pool.query(`delete from telemetry_hourly where ts < now() - interval '35 days'`)
}

async function main() {
  const client = await pool.connect()
  SERIES = await loadSeries(client)
  client.release()
  console.log(`✓ worker started — ${SERIES.length} series · raw 5s / rollup 1m·1h / 보존청소`)
  await tick5s()
  setInterval(() => tick5s().catch((e) => console.error('tick5s', e)), 5 * SEC)
  setInterval(() => rollup1m().then(cleanup).catch((e) => console.error('rollup1m', e)), 60 * SEC)
  setInterval(() => rollup1h().catch((e) => console.error('rollup1h', e)), 60 * 60 * SEC)
}

main().catch((e) => { console.error('worker failed:', e); process.exit(1) })
