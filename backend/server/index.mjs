// Hono backend — DB(Postgres) 앞의 얇은 REST. SQL 직접(방식 A · 외부 플랫폼 X).
// 브라우저는 PG에 직접 못 붙으므로 여기서 감싼다. 적재 워커는 별도(2단계 B).
// 실행: npm run dev:server  (.env 의 DATABASE_URL 사용, 기본 포트 8787)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 })

// range → (tier, interval, bucket_sec). raw 5초/6h · hourly 1시간/35d. bucket 으로 ~150점 다운샘플.
const RANGE = {
  '1h': ['raw', '1 hour', 30], '3h': ['raw', '3 hours', 90], '6h': ['raw', '6 hours', 150],
  '12h': ['hourly', '12 hours', 3600], '24h': ['hourly', '24 hours', 3600],
  '7d': ['hourly', '7 days', 21600], '30d': ['hourly', '30 days', 86400],
}
// 밴드 차트 — range → (tier, bucket_sec, window). 권장 페어 고정(10m→10s·2h→60s·1d→30m·30d→6h).
const BAND_RANGE = {
  '10m': ['raw', 10, '10 minutes'], '2h': ['raw', 60, '2 hours'],
  '1d': ['1m', 1800, '1 day'], '30d': ['hourly', 21600, '30 days'],
}
// epoch 버킷팅(Plain PG): bucket_sec 정수 상수 → floor 정렬. (RANGE/BAND_RANGE 값만 사용 = 안전)
const BUCKET = (b) => `to_timestamp(floor(extract(epoch from ts)/${b})*${b})`
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
  const [tier, span, bucket] = RANGE[range] ?? RANGE['1h']
  const fn = agg === 'sum' ? 'sum' : 'avg'
  const { rows } = await pool.query(
    `select ${BUCKET(bucket)} ts, round(${fn}(value)::numeric, 2)::float8 v
       from telemetry_${tier}
      where kind = $1 and metric = $2 and ts >= now() - interval '${span}'
      group by 1 order by 1`,
    [kind, metric])
  return c.json(rows)
})

// 멀티메트릭 집계 — 여러 metric 을 ts별 한 행으로 pivot (차트당 1호출). 관제 차트용.
// 예: /api/telemetry/series?kind=gpu&metrics=power,temp&range=3h&agg=avg → [{ts, power, temp}]
app.get('/api/telemetry/series', async (c) => {
  const { kind, id, metrics, range = '1h', agg = 'avg' } = c.req.query()
  if (!KINDS.has(kind) || !metrics) return c.json({ error: 'kind/metrics required' }, 400)
  const ms = metrics.split(',').map((s) => s.trim()).filter(Boolean)
  if (!ms.length || !ms.every((m) => METRICS.has(m))) return c.json({ error: 'invalid metric' }, 400)
  const [tier, span, bucket] = RANGE[range] ?? RANGE['1h']
  const fn = agg === 'sum' ? 'sum' : 'avg'
  // metric 은 화이트리스트 통과분만 → alias 안전. 값 매칭은 파라미터 바인딩.
  const cols = ms.map((m, i) => `round(${fn}(value) filter (where metric = $${i + 2})::numeric, 2)::float8 "${m}"`).join(', ')
  const params = [kind, ...ms]
  // id 지정 시 그 엔티티만(4.5 내 GPU/서버), 없으면 kind 전체 집계(4.7 관제).
  let idClause = ''
  if (id) { params.push(id); idClause = ` and id = $${params.length}` }
  params.push(ms)
  const { rows } = await pool.query(
    `select ${BUCKET(bucket)} ts, ${cols}
       from telemetry_${tier}
      where kind = $1${idClause} and metric = any($${params.length}) and ts >= now() - interval '${span}'
      group by 1 order by 1`,
    params)
  return c.json(rows)
})

// 이벤트 로그 — 4.5/4.21. gpuId/serverId 지정 시 해당 대상만.
app.get('/api/events', async (c) => {
  const { gpuId, serverId, limit = '20' } = c.req.query()
  const params = []
  let where = ''
  if (gpuId) { params.push(gpuId); where = `where gpu_id = $${params.length}` }
  else if (serverId) { params.push(serverId); where = `where server_id = $${params.length}` }
  params.push(Math.min(Number(limit) || 20, 100))
  const { rows } = await pool.query(
    `select id, severity, status, message, gpu_id "gpuId", server_id "serverId", created_at "createdAt"
       from event_logs ${where} order by created_at desc limit $${params.length}`,
    params)
  return c.json(rows)
})

// 단일 시리즈 — 특정 엔티티의 한 지표 시계열
app.get('/api/telemetry', async (c) => {
  const { kind, id, metric, range = '1h' } = c.req.query()
  if (!KINDS.has(kind) || !id || !metric) return c.json({ error: 'kind/id/metric required' }, 400)
  const [tier, span, bucket] = RANGE[range] ?? RANGE['1h']
  const { rows } = await pool.query(
    `select ${BUCKET(bucket)} ts, round(avg(value)::numeric, 2)::float8 v
       from telemetry_${tier}
      where kind = $1 and id = $2 and metric = $3 and ts >= now() - interval '${span}'
      group by 1 order by 1`,
    [kind, id, metric])
  return c.json(rows)
})

// ───── 밴드 계약 번역 레이어 — 화면 가상 메트릭 → 실시리즈 집계 ─────
// cluster(4.7 관제): kind=cluster 의 가상 metric 을 (실kind, 실metric) cross-entity 평균으로.
const CLUSTER_AVG = {
  srvUtil: ['server', 'cpu_util'], gpuUtil: ['gpu', 'sm'], avg: ['gpu', 'sm'],
  vramUtil: ['gpu', 'vram'], power: ['gpu', 'power'], temp: ['gpu', 'temp'],
  in: ['server', 'net_in'], out: ['server', 'net_out'],
}
const ACTIVE_SM = 5 // 활성 GPU 판정 임계(작업률 %) — used/activeGpu/idle 산출
// server 별칭(4.3 부하추이): cpu/mem → *_util(그 서버), gpu → 그 서버 소속 GPU 들의 sm 평균
const SERVER_ALIAS = { cpu: 'cpu_util', mem: 'mem_util' }

// 집계 시계열 — ts별 엔티티 평균(v)의 버킷 평균선 + avg 중심 밴드.
// 밴드 = avg ± (avg*0.05 기본 + 버킷 내 평균변동). 이종 GPU 산포/장애 0 을 섞지 않아
// 평균선을 좁게 감싸는 "예쁜" Bollinger 밴드(5176 목 스타일). cluster·단일 동일.
async function aggSeries(tier, bucket, win, srcKind, srcMetric, ids) {
  const params = [srcKind, srcMetric]
  let idClause = ''
  if (ids) { params.push(ids); idClause = ` and id = any($${params.length})` }
  const { rows } = await pool.query(
    `with per_ts as (
       select ts, avg(value) v from telemetry_${tier}
       where kind = $1 and metric = $2${idClause} and ts >= now() - interval '${win}'
       group by ts),
     bkt as (
       select ${BUCKET(bucket)} ts, avg(v) a, max(v) - min(v) drift from per_ts group by 1)
     select ts, round(a::numeric,2)::float8 avg,
            round(greatest(0, a - (a*0.05 + drift*0.6))::numeric,2)::float8 min,
            round((a + (a*0.05 + drift*0.6))::numeric,2)::float8 max
       from bkt order by ts`, params)
  return rows
}

// 활성 GPU 수 시계열: ts별 sm>임계 GPU 수 → 버킷 avg/min/max.
async function usedSeries(tier, bucket, win) {
  const { rows } = await pool.query(
    `with per_ts as (
       select ts, count(distinct id) filter (where value > ${ACTIVE_SM})::float8 v
       from telemetry_${tier} where kind = 'gpu' and metric = 'sm' and ts >= now() - interval '${win}'
       group by ts)
     select ${BUCKET(bucket)} ts, round(avg(v)::numeric,1)::float8 avg,
            min(v)::float8 min, max(v)::float8 max
       from per_ts group by 1 order by 1`)
  return rows
}

// metric 시리즈를 평탄 행으로 병합: row[m]=avg, row[m_min], row[m_max]
function mergeSeries(out, key, rows, map = (r) => r) {
  for (const r0 of rows) {
    const r = map(r0)
    const k = r0.ts.toISOString()
    const row = out.get(k) ?? { ts: k }
    row[key] = r.avg
    row[`${key}_min`] = r.min
    row[`${key}_max`] = r.max
    out.set(k, row)
  }
}

// 밴드 시계열 — 각 버킷의 avg(가운데점) + min/max(밴드). Bollinger 스타일. 4.7/4.3.
// 예: /api/telemetry/band?kind=gpu&id=srv-08-gpu1&metrics=sm,temp&range=2h → [{ts, sm, sm_min, sm_max, ...}]
app.get('/api/telemetry/band', async (c) => {
  const { kind, id, metrics, range = '10m' } = c.req.query()
  if (!metrics) return c.json({ error: 'kind/metrics required' }, 400)
  const ms = metrics.split(',').map((s) => s.trim()).filter(Boolean)
  if (!ms.length) return c.json({ error: 'invalid metric' }, 400)
  const [tier, bucket, win] = BAND_RANGE[range] ?? BAND_RANGE['10m']

  // ① cluster 가상 kind — 화면 metric 을 실시리즈 집계로 번역(4.7 관제)
  if (kind === 'cluster') {
    const known = (m) => CLUSTER_AVG[m] || ['used', 'activeGpu', 'total', 'idle'].includes(m)
    if (!ms.every(known)) return c.json({ error: 'invalid metric' }, 400)
    const out = new Map()
    let used = null
    for (const m of ms) {
      if (CLUSTER_AVG[m]) {
        const [sk, sm] = CLUSTER_AVG[m]
        mergeSeries(out, m, await aggSeries(tier, bucket, win, sk, sm, null))
      } else if (m === 'used' || m === 'activeGpu') {
        used ??= await usedSeries(tier, bucket, win)
        mergeSeries(out, m, used)
      }
    }
    if (ms.includes('total') || ms.includes('idle')) {
      const total = (await pool.query(`select count(*)::int n from gpus`)).rows[0].n
      used ??= await usedSeries(tier, bucket, win)
      if (ms.includes('total')) mergeSeries(out, 'total', used, () => ({ avg: total, min: total, max: total }))
      const pct = (u) => Math.round(((total - u) / Math.max(1, total)) * 1000) / 10
      if (ms.includes('idle')) mergeSeries(out, 'idle', used, (r) => ({ avg: pct(r.avg), min: pct(r.max), max: pct(r.min) }))
    }
    return c.json([...out.values()].sort((a, b) => a.ts.localeCompare(b.ts)))
  }

  // ② server 별칭 — cpu/mem/gpu(4.3 부하추이): 그 서버 + 소속 GPU 평균
  if (kind === 'server' && id && ms.some((m) => SERVER_ALIAS[m] || m === 'gpu')) {
    if (!ms.every((m) => SERVER_ALIAS[m] || m === 'gpu')) return c.json({ error: 'invalid metric' }, 400)
    const out = new Map()
    for (const m of ms) {
      if (m === 'gpu') {
        const ids = (await pool.query(`select id from gpus where server_id = $1`, [id])).rows.map((r) => r.id)
        mergeSeries(out, m, ids.length ? await aggSeries(tier, bucket, win, 'gpu', 'sm', ids) : [])
      } else {
        mergeSeries(out, m, await aggSeries(tier, bucket, win, 'server', SERVER_ALIAS[m], [id]))
      }
    }
    return c.json([...out.values()].sort((a, b) => a.ts.localeCompare(b.ts)))
  }

  // ③ 기본 경로 — 실 kind/metric 직접 조회
  if (!KINDS.has(kind) || !ms.every((m) => METRICS.has(m))) return c.json({ error: 'invalid kind/metric' }, 400)
  const isRaw = tier === 'raw'
  // raw 소스: avg/min/max(value). rollup(1m/hourly) 소스: avg(value)/min(v_min)/max(v_max).
  const cols = ms.map((m, i) => {
    const mi = `$${i + 2}`
    const f = (agg, col) => `round(${agg}(${col}) filter (where metric = ${mi})::numeric, 2)::float8`
    return isRaw
      ? `${f('avg', 'value')} "${m}", ${f('min', 'value')} "${m}_min", ${f('max', 'value')} "${m}_max"`
      : `${f('avg', 'value')} "${m}", ${f('min', 'v_min')} "${m}_min", ${f('max', 'v_max')} "${m}_max"`
  }).join(', ')
  const params = [kind, ...ms]
  let idClause = ''
  if (id) { params.push(id); idClause = ` and id = $${params.length}` }
  params.push(ms)
  const { rows } = await pool.query(
    `select ${BUCKET(bucket)} ts, ${cols}
       from telemetry_${tier}
      where kind = $1${idClause} and metric = any($${params.length}) and ts >= now() - interval '${win}'
      group by 1 order by 1`,
    params)
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
// gpu_requests projection (snake→camel) — 목록/단건/POST/PATCH 공유(프론트 GpuRequest 타입 일치).
const GR_COLS = `id, requester_user_id "requesterUserId", capacity, capacity_unit "capacityUnit",
  models, env, addons, service_name "serviceName", purpose, attachment_url "attachmentUrl",
  status, reject_reason "rejectReason", created_at "createdAt",
  period, priority, admin_memo "adminMemo", processed_at "processedAt", processed_by "processedBy",
  allocated_server_id "allocatedServerId", allocated_gpu_id "allocatedGpuId", allocated_slice_id "allocatedSliceId",
  allocated_ram_gb "allocatedRamGb", allocated_storage_gb "allocatedStorageGb", allocated_cpu_cores "allocatedCpuCores",
  team, start_date "startDate", security, scale, remark`

app.get('/api/gpu-requests', async (c) => {
  const { user } = c.req.query()
  const { rows } = await pool.query(
    `select ${GR_COLS}
       from gpu_requests
      where ($1::text is null or requester_user_id = $1)
      order by created_at desc`,
    [user || null])
  return c.json(rows)
})

// 단건 조회 (4.10a 심사 상세)
app.get('/api/gpu-requests/:id', async (c) => {
  const { rows } = await pool.query(`select ${GR_COLS} from gpu_requests where id = $1`, [c.req.param('id')])
  if (!rows.length) return c.json({ error: 'not found' }, 404)
  return c.json(rows[0])
})

// 승인/반려 (4.10a) — pending→approved/rejected 전이 가드, processed_at 은 서버 now()(클라 값 불신).
app.patch('/api/gpu-requests/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({}))
  if (b.action !== 'approve' && b.action !== 'reject')
    return c.json({ error: 'action must be approve or reject' }, 400)
  if (b.action === 'reject' && !b.rejectReason)
    return c.json({ error: 'rejectReason required' }, 400)
  const cur = await pool.query(`select status from gpu_requests where id = $1`, [id])
  if (!cur.rows.length) return c.json({ error: 'not found' }, 404)
  if (cur.rows[0].status !== 'pending') return c.json({ error: 'already processed' }, 409)

  const { rows } = b.action === 'approve'
    ? await pool.query(
        `update gpu_requests set status='approved', processed_at=now(),
            processed_by=$2, admin_memo=$3,
            allocated_server_id=$4, allocated_gpu_id=$5, allocated_slice_id=$6,
            allocated_ram_gb=$7, allocated_storage_gb=$8, allocated_cpu_cores=$9
          where id=$1 returning ${GR_COLS}`,
        [id, b.processedBy ?? null, b.adminMemo ?? null,
          b.allocatedServerId ?? null, b.allocatedGpuId ?? null, b.allocatedSliceId ?? null,
          b.allocatedRamGb ?? null, b.allocatedStorageGb ?? null, b.allocatedCpuCores ?? null])
    : await pool.query(
        `update gpu_requests set status='rejected', processed_at=now(),
            processed_by=$2, reject_reason=$3, admin_memo=$4
          where id=$1 returning ${GR_COLS}`,
        [id, b.processedBy ?? null, b.rejectReason, b.adminMemo ?? null])
  return c.json(rows[0])
})

// 신규 GPU 자원 신청(4.6b) — status='pending', id 서버 생성. created_at 은 DB default(클라 값 불신).
app.post('/api/gpu-requests', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (!b.requesterUserId) return c.json({ error: 'requesterUserId required' }, 400)
  const id = `gr-${Date.now().toString(36)}`
  const { rows } = await pool.query(
    `insert into gpu_requests(
        id, requester_user_id, capacity, capacity_unit, models, env, addons,
        service_name, purpose, attachment_url, status,
        period, priority, team, start_date, security, scale, remark)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13,$14,$15,$16,$17)
     returning ${GR_COLS}`,
    [id, b.requesterUserId, b.capacity ?? 1, b.capacityUnit ?? 'card', b.models ?? [], b.env ?? null, b.addons ?? [],
     b.serviceName ?? null, b.purpose ?? null, b.attachmentUrl ?? null,
     b.period ?? null, b.priority ?? 'normal', b.team ?? null, b.startDate ?? null, b.security ?? null, b.scale ?? null, b.remark ?? null])
  return c.json(rows[0], 201)
})

// 카탈로그용 전체 모델 — 자원요건(req_*) 포함. 4.10a 자원 제한 추천 기준.
// models projection (snake→camel) — GET 카탈로그 / POST 배포 등록 공유.
const MODEL_COLS = `id, name, kind, description, addons, license, recommended_gpu "recommendedGpu",
  params, usage_rank "usageRank", usage_count "usageCount",
  req_vram_gb "reqVramGb", req_ram_gb "reqRamGb", req_storage_gb "reqStorageGb", req_cpu_cores "reqCpuCores"`

app.get('/api/models', async (c) => {
  const { rows } = await pool.query(`select ${MODEL_COLS} from models order by usage_rank`)
  return c.json(rows)
})

// 배포 시 카탈로그 등록 — 모델 1건 insert. id 미지정 시 'lm-'+base36. usage_rank=max+1·usage_count=0.
// ※ model_requests.registered_model_id FK → 배포는 반드시 이 POST(모델 insert) 먼저, 그 다음 PATCH 로 registeredModelId 기록.
app.post('/api/models', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (!b.name) return c.json({ error: 'name required' }, 400)
  const id = b.id || `lm-${Date.now().toString(36)}`
  const rank = (await pool.query(`select coalesce(max(usage_rank), 0) + 1 n from models`)).rows[0].n
  const { rows } = await pool.query(
    `insert into models(id, name, kind, description, addons, license, recommended_gpu, params,
        usage_rank, usage_count, req_vram_gb, req_ram_gb, req_storage_gb, req_cpu_cores)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13)
     returning ${MODEL_COLS}`,
    [id, b.name, b.kind ?? null, b.description ?? null, b.addons ?? [], b.license ?? null,
      b.recommendedGpu ?? null, b.params ?? null, rank,
      b.reqVramGb ?? null, b.reqRamGb ?? null, b.reqStorageGb ?? null, b.reqCpuCores ?? null])
  return c.json(rows[0], 201)
})

// model_requests projection (snake→camel) — GET 목록 / POST / PATCH 공유.
const MR_COLS = `id, requester_user_id "requesterUserId", model_name "modelName", kind, source, reason,
  status, stage, created_at "createdAt", reject_reason "rejectReason",
  processed_at "processedAt", processed_by "processedBy",
  file_name "fileName", format, scan, checksum, registered_model_id "registeredModelId"`

// PATCH 동적 SET 화이트리스트(camelCase 바디 → snake 컬럼) — 들어온 키만 갱신.
const MR_PATCH = {
  stage: 'stage', status: 'status', fileName: 'file_name', format: 'format',
  scan: 'scan', checksum: 'checksum', processedAt: 'processed_at',
  processedBy: 'processed_by', rejectReason: 'reject_reason', registeredModelId: 'registered_model_id',
}

// 모델 회수/취소 — 카탈로그에서 제거. registered_model_id FK 는 ON DELETE SET NULL 로 자동 정리.
// 서비스에 묶인 모델은 회수 불가(409). 없는 id 는 404(idempotent 성격).
app.delete('/api/models/:id', async (c) => {
  const id = c.req.param('id')
  const inUse = (await pool.query(`select count(*)::int n from services where model_id = $1`, [id])).rows[0].n
  if (inUse > 0) return c.json({ error: 'model in use by services' }, 409)
  const { rowCount } = await pool.query(`delete from models where id = $1`, [id])
  if (!rowCount) return c.json({ error: 'not found' }, 404)
  return c.json({ deleted: id })
})

// 모델 신청 관리(4.14) — user 없으면 전체(공유 테이블), 있으면 그 사람 것만. created_at desc.
app.get('/api/model-requests', async (c) => {
  const { user } = c.req.query()
  const { rows } = await pool.query(
    `select ${MR_COLS}
       from model_requests
      where ($1::text is null or requester_user_id = $1)
      order by created_at desc`,
    [user || null])
  return c.json(rows)
})

// 단계 전환·반입 처리 — 들어온 키만 동적 SET(화이트리스트). 부분 업데이트.
// 배포 흐름: POST /api/models 로 모델 insert 후 여기서 registeredModelId+stage='deployed' 기록(FK 순서).
app.patch('/api/model-requests/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({}))
  const sets = [], vals = []
  for (const [k, col] of Object.entries(MR_PATCH))
    if (k in b) { vals.push(b[k]); sets.push(`${col} = $${vals.length}`) }
  if (!sets.length) return c.json({ error: 'no updatable fields' }, 400)
  vals.push(id)
  const { rows } = await pool.query(
    `update model_requests set ${sets.join(', ')} where id = $${vals.length} returning ${MR_COLS}`, vals)
  if (!rows.length) return c.json({ error: 'not found' }, 404)
  return c.json(rows[0])
})

// 모델 신청 삭제 — 4.13 등록 취소(deleteRequest). model_requests 는 참조받는 FK 없어 단순 삭제.
app.delete('/api/model-requests/:id', async (c) => {
  const id = c.req.param('id')
  const { rowCount } = await pool.query(`delete from model_requests where id = $1`, [id])
  if (!rowCount) return c.json({ error: 'not found' }, 404)
  return c.json({ deleted: id })
})

// 신규 모델 등록 신청 — stage=requested·status=pending. 바디 검증(필수: requesterUserId·modelName·reason).
app.post('/api/model-requests', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (!b.requesterUserId || !b.modelName || !b.reason)
    return c.json({ error: 'requesterUserId, modelName, reason required' }, 400)
  const id = `mr-${Date.now().toString(36)}`
  const { rows } = await pool.query(
    `insert into model_requests(id, requester_user_id, model_name, kind, source, reason, status, stage)
     values($1, $2, $3, $4, $5, $6, 'pending', 'requested')
     returning ${MR_COLS}`,
    [id, b.requesterUserId, b.modelName, b.kind ?? null, b.source ?? null, b.reason])
  return c.json(rows[0], 201)
})

// ── 마켓플레이스(g8): 게시 신청(publish_requests) · API 키 신청(api_requests) ──
// gpu-requests 패턴 미러: GET 목록/단건 · POST 생성 · PATCH {action} 승인/반려. created_at/processed_at 서버 now().

const PR_COLS = `id, requester_user_id "requesterUserId", service_name "serviceName", service_url "serviceUrl",
  demo_url "demoUrl", meta, status, reject_reason "rejectReason", admin_memo "adminMemo",
  processed_by "processedBy", processed_at "processedAt", created_at "createdAt"`

app.get('/api/publish-requests', async (c) => {
  const { rows } = await pool.query(`select ${PR_COLS} from publish_requests order by created_at desc`)
  return c.json(rows)
})
app.get('/api/publish-requests/:id', async (c) => {
  const { rows } = await pool.query(`select ${PR_COLS} from publish_requests where id = $1`, [c.req.param('id')])
  if (!rows.length) return c.json({ error: 'not found' }, 404)
  return c.json(rows[0])
})
app.post('/api/publish-requests', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (!b.requesterUserId || !b.serviceName) return c.json({ error: 'requesterUserId, serviceName required' }, 400)
  const id = `pr-${Date.now().toString(36)}`
  const { rows } = await pool.query(
    `insert into publish_requests(id, requester_user_id, service_name, service_url, demo_url, meta, status)
     values($1,$2,$3,$4,$5,$6,'pending') returning ${PR_COLS}`,
    [id, b.requesterUserId, b.serviceName, b.serviceUrl ?? null, b.demoUrl ?? null, b.meta ?? null])
  return c.json(rows[0], 201)
})
app.patch('/api/publish-requests/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({}))
  if (b.action !== 'approve' && b.action !== 'reject') return c.json({ error: 'action must be approve or reject' }, 400)
  if (b.action === 'reject' && !b.rejectReason) return c.json({ error: 'rejectReason required' }, 400)
  const cur = await pool.query(`select status from publish_requests where id = $1`, [id])
  if (!cur.rows.length) return c.json({ error: 'not found' }, 404)
  const { rows } = b.action === 'approve'
    ? await pool.query(
        `update publish_requests set status='approved', processed_at=now(), processed_by=$2, admin_memo=$3
          where id=$1 returning ${PR_COLS}`,
        [id, b.processedBy ?? null, b.adminMemo ?? null])
    : await pool.query(
        `update publish_requests set status='rejected', processed_at=now(), processed_by=$2, reject_reason=$3, admin_memo=$4
          where id=$1 returning ${PR_COLS}`,
        [id, b.processedBy ?? null, b.rejectReason, b.adminMemo ?? null])
  return c.json(rows[0])
})

const AR_COLS = `id, requester_user_id "requesterUserId", service_id "serviceId", model,
  target_service_url "targetServiceUrl", purpose, status, api_key "apiKey",
  reject_reason "rejectReason", processed_by "processedBy", processed_at "processedAt", created_at "createdAt"`

app.get('/api/api-requests', async (c) => {
  const { rows } = await pool.query(`select ${AR_COLS} from api_requests order by created_at desc`)
  return c.json(rows)
})
app.get('/api/api-requests/:id', async (c) => {
  const { rows } = await pool.query(`select ${AR_COLS} from api_requests where id = $1`, [c.req.param('id')])
  if (!rows.length) return c.json({ error: 'not found' }, 404)
  return c.json(rows[0])
})
app.post('/api/api-requests', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (!b.requesterUserId || !b.serviceId) return c.json({ error: 'requesterUserId, serviceId required' }, 400)
  const id = `ar-${Date.now().toString(36)}`
  const { rows } = await pool.query(
    `insert into api_requests(id, requester_user_id, service_id, model, target_service_url, purpose, status)
     values($1,$2,$3,$4,$5,$6,'pending') returning ${AR_COLS}`,
    [id, b.requesterUserId, b.serviceId, b.model ?? null, b.targetServiceUrl ?? null, b.purpose ?? null])
  return c.json(rows[0], 201)
})
app.patch('/api/api-requests/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({}))
  if (b.action !== 'approve' && b.action !== 'reject') return c.json({ error: 'action must be approve or reject' }, 400)
  if (b.action === 'reject' && !b.rejectReason) return c.json({ error: 'rejectReason required' }, 400)
  if (b.action === 'approve' && !b.apiKey) return c.json({ error: 'apiKey required' }, 400)
  const cur = await pool.query(`select status from api_requests where id = $1`, [id])
  if (!cur.rows.length) return c.json({ error: 'not found' }, 404)
  const { rows } = b.action === 'approve'
    ? await pool.query(
        `update api_requests set status='approved', processed_at=now(), processed_by=$2, api_key=$3
          where id=$1 returning ${AR_COLS}`,
        [id, b.processedBy ?? null, b.apiKey])
    : await pool.query(
        `update api_requests set status='rejected', processed_at=now(), processed_by=$2, reject_reason=$3
          where id=$1 returning ${AR_COLS}`,
        [id, b.processedBy ?? null, b.rejectReason])
  return c.json(rows[0])
})

// ── 마켓플레이스 표시 전용 서비스(4.17) — 읽기 전용. description 컬럼은 'desc' 키로 반환. jsonb 는 자동 파싱. ──
const MS_COLS = `id, name, kind, provider, model, api, owner, rating, status, hue, icon,
  response_time "responseTime", tier, monthly_req "monthlyReq", usage, usage_num "usageNum",
  delta, up, req_full "reqFull", success, delta_pct "deltaPct", last_call "lastCall",
  tags, description "desc", overview, api_desc "apiDesc", features, ops_notes "opsNotes",
  service_url "serviceUrl", demo_url "demoUrl", thumbnail, screenshots`

app.get('/api/market-services', async (c) => {
  const { rows } = await pool.query(`select ${MS_COLS} from market_services order by usage_num desc`)
  return c.json(rows)
})
app.get('/api/market-services/:id', async (c) => {
  const { rows } = await pool.query(`select ${MS_COLS} from market_services where id = $1`, [c.req.param('id')])
  if (!rows.length) return c.json({ error: 'not found' }, 404)
  return c.json(rows[0])
})

// 서비스 사용량(랭킹 요약 + 사용량 추이) — 랭킹 사용자 = 그 서비스에 키 승인받은 실제 조직(배포자 제외).
// 후보 user 중 serviceId 기반 deterministic 선택(승인자 간주). 수치(requests/tokens/days)는 목업.
const RANK_TAGS = ['Production', 'Team', 'Analytics', 'Batch', 'Internal', 'Core']
const DEPT_HUE = {
  '대표이사': 330, '사업기획본부': 280, '기술개발본부': 212,
  '서비스 기술개발팀': 152, '시스템 통합개발팀': 30, '시스템 관리': 196,
}

function hashStr(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function seededRng(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
function usageOf(id, usageNum, candidates) {
  const rng = seededRng(hashStr(id))
  const want = 4 + Math.floor(rng() * 3) // 4~6
  // Fisher-Yates(rng) 셔플 → want 명 선택(승인자). 후보 부족 시 전부.
  const pool = candidates.slice()
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  const picked = pool.slice(0, Math.min(want, pool.length))
  const raw = picked.map(() => 0.3 + rng())
  const rawSum = raw.reduce((a, b) => a + b, 0)
  const tokenPerReq = 360 + rng() * 220
  let rows = picked.map((u, i) => {
    const requests = Math.max(1, Math.round((raw[i] / rawSum) * usageNum))
    return {
      keyId: `sk-${id.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`,
      owner: u.name, tag: RANK_TAGS[i % RANK_TAGS.length],
      team: u.department, teamHue: DEPT_HUE[u.department] ?? 200,
      requests, tokens: Math.round(requests * tokenPerReq), deltaPct: 0, spark: [],
    }
  }).sort((a, b) => b.requests - a.requests)
  rows.forEach((r) => {
    r.deltaPct = Math.round((rng() * 32 - 9) * 10) / 10
    const sb = hashStr(r.keyId) % 9
    r.spark = Array.from({ length: 7 }, (_, k) => 0.4 + 0.4 * Math.abs(Math.sin(k * 0.7 + sb)) + rng() * 0.22)
  })
  const base = hashStr(id) % 7
  const days = []
  for (let d = 0; d < 7; d++) {
    const dayFactor = 0.72 + 0.46 * (d / 6) + 0.12 * Math.sin(d + base)
    const perKey = rows.map((r) => Math.max(0, Math.round((r.requests / 7) * dayFactor * (0.72 + rng() * 0.56))))
    const total = perKey.reduce((a, v) => a + v, 0)
    const concurrent = Math.max(1, Math.round(total / (1700 + rng() * 700)))
    days.push({ label: `5.${16 + d}`, perKey, total, concurrent })
  }
  return { keyCount: rows.length, rows, days }
}

app.get('/api/market-services/:id/usage', async (c) => {
  const id = c.req.param('id')
  const ms = (await pool.query('select usage_num, owner_user_id from market_services where id = $1', [id])).rows
  if (!ms.length) return c.json({ error: 'not found' }, 404)
  // 후보 = 실제 사용자(관리자·배포자 제외) — 그 서비스 키 승인자로 간주(deterministic).
  const candidates = (await pool.query(
    `select id, name, department from users
      where role = 'user' and id <> 'u-admin' and ($1::text is null or id <> $1) order by id`,
    [ms[0].owner_user_id])).rows
  return c.json(usageOf(id, Number(ms[0].usage_num), candidates))
})

// 전체 서비스 — 모델 상세 '이 모델을 쓰는 서비스' 콤보차트(N:M models) 등. camelCase.
// model(단일)은 호환용 deprecated, models[0]=model.
app.get('/api/services', async (c) => {
  const { rows } = await pool.query(
    `select id, name, kind, has_api "hasApi", model_id "model", models,
            service_url "serviceUrl", test_url "testUrl", description, manual_url "manualUrl",
            owner_user_id "ownerUserId", deployer_user_id "deployerUserId", tags,
            usage_count "usageCount", usage_rank "usageRank", listed
       from services order by usage_rank`)
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

// ── GPU 할당(승인된 gpu_requests) + 변경·확장·회수 ──
// 할당 = status=approved · allocated_* 채워진 · active 인 gpu_requests 행(단일 진실원천, 별도 테이블 없음).
// 변경요청은 target_request_id 로 그 행을 참조, 승인 시 그 행의 allocated_* 를 트랜잭션 갱신(회수=active false).

// AllocSpec projection(서버 host·GPU name join) — my-allocations / before·after 공용.
const ALLOC_SELECT = (a) => `${a}.id "requestId", ${a}.allocated_server_id "serverId", srv.host "serverHost",
  ${a}.allocated_gpu_id "gpuId", ${a}.allocated_slice_id "sliceId", g.name "gpuLabel",
  ${a}.allocated_ram_gb "ramGb", ${a}.allocated_storage_gb "storageGb", ${a}.allocated_cpu_cores "cpuCores"`
const CR_RAW = `id, requester_user_id, type, reason, status, reject_reason, created_at, processed_at, processed_by,
  admin_memo, target_request_id, after_server_id, after_gpu_id, after_slice_id, after_ram_gb, after_storage_gb,
  after_cpu_cores, after_extra`

async function allocSpec(requestId) {
  if (!requestId) return null
  const { rows } = await pool.query(
    `select ${ALLOC_SELECT('gr')} from gpu_requests gr
       left join gpu_servers srv on srv.id = gr.allocated_server_id
       left join gpus g on g.id = gr.allocated_gpu_id
      where gr.id = $1`, [requestId])
  return rows[0] ?? null
}
async function afterSpec(cr) {
  if (cr.type === 'reclaim') return null
  const srv = cr.after_server_id ? (await pool.query('select host from gpu_servers where id=$1', [cr.after_server_id])).rows[0] : null
  const g = cr.after_gpu_id ? (await pool.query('select name from gpus where id=$1', [cr.after_gpu_id])).rows[0] : null
  return {
    requestId: cr.target_request_id,
    serverId: cr.after_server_id, serverHost: srv?.host ?? null,
    gpuId: cr.after_gpu_id, sliceId: cr.after_slice_id, gpuLabel: g?.name ?? null,
    ramGb: cr.after_ram_gb, storageGb: cr.after_storage_gb, cpuCores: cr.after_cpu_cores,
    extra: cr.after_extra,
  }
}
async function assembleCR(cr) {
  return {
    id: cr.id, requesterUserId: cr.requester_user_id, type: cr.type, reason: cr.reason,
    status: cr.status, rejectReason: cr.reject_reason, createdAt: cr.created_at,
    processedAt: cr.processed_at, processedBy: cr.processed_by, adminMemo: cr.admin_memo,
    targetRequestId: cr.target_request_id,
    before: await allocSpec(cr.target_request_id),
    after: await afterSpec(cr),
  }
}
async function fetchCR(id) {
  const { rows } = await pool.query(`select ${CR_RAW} from gpu_change_requests where id = $1`, [id])
  return rows.length ? await assembleCR(rows[0]) : null
}

// 내 할당 자원 — 승인·할당된 내 gpu_requests(AllocSpec). 변경 마법사 '대상 할당'과 동일 형태.
app.get('/api/my-allocations', async (c) => {
  const { user } = c.req.query()
  if (!user) return c.json({ error: 'user required' }, 400)
  const { rows } = await pool.query(
    `select ${ALLOC_SELECT('gr')} from gpu_requests gr
       left join gpu_servers srv on srv.id = gr.allocated_server_id
       left join gpus g on g.id = gr.allocated_gpu_id
      where gr.requester_user_id = $1 and gr.status = 'approved'
        and gr.allocated_server_id is not null and gr.active = true
      order by gr.id`, [user])
  return c.json(rows)
})

// 변경·확장·회수 요청 목록 — user 있으면 본인, 없으면 전체(관리자). pending 우선·최신순. before/after 중첩.
app.get('/api/gpu-change-requests', async (c) => {
  const { user } = c.req.query()
  const { rows } = await pool.query(
    `select ${CR_RAW} from gpu_change_requests
      where ($1::text is null or requester_user_id = $1)
      order by (status = 'pending') desc, created_at desc`, [user || null])
  const out = []
  for (const r of rows) out.push(await assembleCR(r))
  return c.json(out)
})
app.get('/api/gpu-change-requests/:id', async (c) => {
  const row = await fetchCR(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})
app.post('/api/gpu-change-requests', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (!b.requesterUserId || !b.type || !b.targetRequestId)
    return c.json({ error: 'requesterUserId, type, targetRequestId required' }, 400)
  const id = 'cr-' + Date.now().toString(36)
  await pool.query(
    `insert into gpu_change_requests(id, requester_user_id, type, target_request_id, reason, status,
        after_server_id, after_gpu_id, after_slice_id, after_ram_gb, after_storage_gb, after_cpu_cores, after_extra)
     values($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12)`,
    [id, b.requesterUserId, b.type, b.targetRequestId, b.reason ?? null,
      b.afterServerId ?? null, b.afterGpuId ?? null, b.afterSliceId ?? null,
      b.afterRamGb ?? null, b.afterStorageGb ?? null, b.afterCpuCores ?? null,
      b.afterExtra ? JSON.stringify(b.afterExtra) : null])
  return c.json(await fetchCR(id), 201)
})

// ★ 승인/반려 — 트랜잭션. 승인 시 대상 할당(gpu_requests) allocated_* 갱신(회수=active false + 자원 해제).
app.patch('/api/gpu-change-requests/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({}))
  if (b.action !== 'approve' && b.action !== 'reject') return c.json({ error: 'action must be approve or reject' }, 400)
  if (b.action === 'reject' && !b.rejectReason) return c.json({ error: 'rejectReason required' }, 400)
  if (!(await pool.query('select id from gpu_change_requests where id=$1', [id])).rows.length)
    return c.json({ error: 'not found' }, 404)

  const client = await pool.connect()
  try {
    await client.query('begin')
    if (b.action === 'approve') {
      // 0) 확정 after_*(관리자 조정값 우선) + 처리정보
      await client.query(
        `update gpu_change_requests set status='approved', processed_at=now(), processed_by=$2, admin_memo=$3,
            after_server_id=coalesce($4,after_server_id), after_gpu_id=coalesce($5,after_gpu_id),
            after_slice_id=coalesce($6,after_slice_id), after_ram_gb=coalesce($7,after_ram_gb),
            after_storage_gb=coalesce($8,after_storage_gb), after_cpu_cores=coalesce($9,after_cpu_cores),
            after_extra=coalesce($10,after_extra)
          where id=$1`,
        [id, b.processedBy ?? null, b.adminMemo ?? null, b.afterServerId ?? null, b.afterGpuId ?? null,
          b.afterSliceId ?? null, b.afterRamGb ?? null, b.afterStorageGb ?? null, b.afterCpuCores ?? null,
          b.afterExtra ? JSON.stringify(b.afterExtra) : null])
      const cr = (await client.query('select * from gpu_change_requests where id=$1', [id])).rows[0]
      // 1) 대상 할당 갱신
      if (['change', 'expand', 'migrate'].includes(cr.type)) {
        await client.query(
          `update gpu_requests set
              allocated_ram_gb=coalesce($2,allocated_ram_gb), allocated_storage_gb=coalesce($3,allocated_storage_gb),
              allocated_cpu_cores=coalesce($4,allocated_cpu_cores), allocated_server_id=coalesce($5,allocated_server_id),
              allocated_gpu_id=coalesce($6,allocated_gpu_id), allocated_slice_id=coalesce($7,allocated_slice_id)
            where id=$1`,
          [cr.target_request_id, cr.after_ram_gb, cr.after_storage_gb, cr.after_cpu_cores,
            cr.after_server_id, cr.after_gpu_id, cr.after_slice_id])
        // (server/gpu 변경 시 신규 GPU 물리 재배치는 현 단계 범위 밖 — allocated_gpu_id 만 반영)
      } else if (cr.type === 'reclaim') {
        const tgt = (await client.query('select allocated_gpu_id, allocated_slice_id from gpu_requests where id=$1', [cr.target_request_id])).rows[0]
        await client.query('update gpu_requests set active=false where id=$1', [cr.target_request_id])
        if (tgt?.allocated_gpu_id) await client.query('update gpus set assigned_service_id=null where id=$1', [tgt.allocated_gpu_id])
        if (tgt?.allocated_slice_id) await client.query("update mig_slices set status='reclaimed' where id=$1", [tgt.allocated_slice_id])
      }
    } else {
      await client.query(
        `update gpu_change_requests set status='rejected', processed_at=now(), processed_by=$2, reject_reason=$3, admin_memo=$4 where id=$1`,
        [id, b.processedBy ?? null, b.rejectReason, b.adminMemo ?? null])
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    client.release()
    return c.json({ error: e.message }, 500)
  }
  client.release()
  return c.json(await fetchCR(id))
})

// 변경요청 삭제(정리용) — 참조받는 FK 없어 단순 삭제. 없으면 404.
app.delete('/api/gpu-change-requests/:id', async (c) => {
  const id = c.req.param('id')
  const { rowCount } = await pool.query('delete from gpu_change_requests where id = $1', [id])
  if (!rowCount) return c.json({ error: 'not found' }, 404)
  return c.json({ deleted: id })
})

// 내 서비스 토큰 사용량 — user 소유 서비스들의 tokens 시계열(9버킷) + 합계. 4.5 토큰차트.
app.get('/api/service-tokens', async (c) => {
  const { user } = c.req.query()
  if (!user) return c.json({ error: 'user required' }, 400)
  const svcs = (await pool.query(`select id, name, model_id "modelId" from services where owner_user_id = $1 order by id`, [user])).rows
  const ids = svcs.map((s) => s.id)
  if (!ids.length) return c.json({ services: [], bars: [], max: 1, total: 0, calls: 0 })
  const rows = (await pool.query(
    `select id, ts, value from telemetry_hourly
      where kind='service' and metric='tokens' and id = any($1) and ts >= now() - interval '24 hours'
      order by ts`, [ids])).rows
  const tsList = [...new Set(rows.map((r) => r.ts.toISOString()))].slice(-9)
  const bars = tsList.map((ts) => svcs.map((s) => {
    const r = rows.find((x) => x.id === s.id && x.ts.toISOString() === ts)
    return Math.round(r ? Number(r.value) : 0)
  }))
  const max = Math.max(1, ...bars.flat())
  const lt = (await pool.query(
    `select metric, sum(value) v from telemetry_latest where kind='service' and id = any($1) and metric in ('tokens','calls') group by metric`, [ids])).rows
  const total = Math.round(Number(lt.find((x) => x.metric === 'tokens')?.v ?? 0))
  const calls = Math.round(Number(lt.find((x) => x.metric === 'calls')?.v ?? 0))
  return c.json({ services: svcs, bars, max, total, calls })
})

const port = Number(process.env.PORT || 8787)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' },
  (info) => console.log(`✓ backend on http://0.0.0.0:${info.port}`))
