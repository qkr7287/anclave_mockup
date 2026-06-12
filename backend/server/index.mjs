// Hono backend — DB(Postgres) 앞의 얇은 REST. SQL 직접(방식 A · 외부 플랫폼 X).
// 브라우저는 PG에 직접 못 붙으므로 여기서 감싼다. 적재 워커는 별도(2단계 B).
// 실행: npm run dev:server  (.env 의 DATABASE_URL 사용, 기본 포트 8787)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 })

// range → (tier, interval). raw=1분/48h, hourly=1시간/30일.
const RANGE = {
  '1h': ['raw', '1 hour'], '3h': ['raw', '3 hours'], '6h': ['raw', '6 hours'], '12h': ['raw', '12 hours'],
  '24h': ['hourly', '24 hours'], '7d': ['hourly', '7 days'], '30d': ['hourly', '30 days'],
}
const KINDS = new Set(['server', 'gpu', 'slice', 'service'])
const METRICS = new Set(['cpu_util', 'mem_util', 'net_in', 'net_out', 'temp', 'sm', 'vram', 'power', 'usage', 'tokens', 'calls'])

const app = new Hono()
app.use('/*', cors())

// health — DB 연결 확인
app.get('/', async (c) => {
  try { await pool.query('select 1'); return c.json({ ok: true, db: true }) }
  catch (e) { return c.json({ ok: true, db: false, error: String(e) }, 503) }
})

// 집계 시계열 — 같은 kind+metric 전체를 ts별 avg|sum (관제 클러스터 차트용)
app.get('/api/telemetry/agg', async (c) => {
  const { kind, metric, range = '1h', agg = 'avg' } = c.req.query()
  if (!KINDS.has(kind) || !metric) return c.json({ error: 'kind/metric required' }, 400)
  const [tier, span] = RANGE[range] ?? RANGE['1h']
  const fn = agg === 'sum' ? 'sum' : 'avg'
  const { rows } = await pool.query(
    `select ts, round(${fn}(value)::numeric, 2)::float8 v
       from telemetry_${tier}
      where kind = $1 and metric = $2 and ts >= now() - interval '${span}'
      group by ts order by ts`,
    [kind, metric])
  return c.json(rows)
})

// 멀티메트릭 집계 — 여러 metric 을 ts별 한 행으로 pivot (차트당 1호출). 관제 차트용.
// 예: /api/telemetry/series?kind=gpu&metrics=power,temp&range=3h&agg=avg → [{ts, power, temp}]
app.get('/api/telemetry/series', async (c) => {
  const { kind, metrics, range = '1h', agg = 'avg' } = c.req.query()
  if (!KINDS.has(kind) || !metrics) return c.json({ error: 'kind/metrics required' }, 400)
  const ms = metrics.split(',').map((s) => s.trim()).filter(Boolean)
  if (!ms.length || !ms.every((m) => METRICS.has(m))) return c.json({ error: 'invalid metric' }, 400)
  const [tier, span] = RANGE[range] ?? RANGE['1h']
  const fn = agg === 'sum' ? 'sum' : 'avg'
  // metric 은 화이트리스트 통과분만 → alias 안전. 값 매칭은 파라미터 바인딩.
  const cols = ms.map((m, i) => `round(${fn}(value) filter (where metric = $${i + 2})::numeric, 2)::float8 "${m}"`).join(', ')
  const { rows } = await pool.query(
    `select ts, ${cols}
       from telemetry_${tier}
      where kind = $1 and metric = any($${ms.length + 2}) and ts >= now() - interval '${span}'
      group by ts order by ts`,
    [kind, ...ms, ms])
  return c.json(rows)
})

// 단일 시리즈 — 특정 엔티티의 한 지표 시계열
app.get('/api/telemetry', async (c) => {
  const { kind, id, metric, range = '1h' } = c.req.query()
  if (!KINDS.has(kind) || !id || !metric) return c.json({ error: 'kind/id/metric required' }, 400)
  const [tier, span] = RANGE[range] ?? RANGE['1h']
  const { rows } = await pool.query(
    `select ts, round(value::numeric, 2)::float8 v
       from telemetry_${tier}
      where kind = $1 and id = $2 and metric = $3 and ts >= now() - interval '${span}'
      order by ts`,
    [kind, id, metric])
  return c.json(rows)
})

// 현재값 스냅샷 — kind 전체의 최신값(KPI/배지용)
app.get('/api/telemetry/latest', async (c) => {
  const { kind } = c.req.query()
  if (!KINDS.has(kind)) return c.json({ error: 'kind required' }, 400)
  const { rows } = await pool.query(
    `select id, metric, round(value::numeric, 2)::float8 v, updated_at
       from telemetry_latest where kind = $1 order by id, metric`,
    [kind])
  return c.json(rows)
})

// GPU 자원 신청 — user 지정 시 그 사람 신청만(B/C), 없으면 전체(A). 4.6 자원 신청현황.
app.get('/api/gpu-requests', async (c) => {
  const { user } = c.req.query()
  const { rows } = await pool.query(
    `select id, requester_user_id "requesterUserId", capacity, capacity_unit "capacityUnit",
            models, service_name "serviceName", purpose,
            status, reject_reason "rejectReason", created_at "createdAt"
       from gpu_requests
      where ($1::text is null or requester_user_id = $1)
      order by created_at desc`,
    [user || null])
  return c.json(rows)
})

// 내 할당 — user 의 게시된 서비스 + 각 서비스가 올라간 gpu/server. 4.5 내 할당 자원.
app.get('/api/allocations', async (c) => {
  const { user } = c.req.query()
  if (!user) return c.json({ error: 'user required' }, 400)
  const { rows } = await pool.query(
    `select s.id "serviceId", s.name "serviceName", s.model_id "modelId", s.usage_count "usageCount",
            g.id "gpuId", g.server_id "serverId", g.model "gpuModel", g.vram_gb "vramGb", g.alloc_mode "allocMode",
            srv.host "serverHost"
       from services s
       left join gpus g on g.assigned_service_id = s.id
       left join gpu_servers srv on srv.id = g.server_id
      where s.owner_user_id = $1
      order by s.id`,
    [user])
  return c.json(rows)
})

const port = Number(process.env.PORT || 8787)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' },
  (info) => console.log(`✓ backend on http://0.0.0.0:${info.port}`))
