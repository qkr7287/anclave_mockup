// seed-events.mjs — event_logs 시드(4.5 내 할당 자원 · 4.21 이벤트 관제).
// 정책: 멱등(truncate 후 재생성) · 결정적(고정 시드 RNG + 기준시각=max(telemetry_raw.ts)).
// 서비스 이벤트는 그 서비스의 "할당 GPU/서버"(승인·active gpu_request) 에 귀속 → gpu_id/server_id 채움.
// 실행: npm run seed:events  (엔티티+텔레메트리 시드가 먼저 끝나 있어야 함)
import pg from 'pg'

const MIN = 60_000

// 고정 시드 PRNG(mulberry32) — 재실행 시 동일 결과.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(0xa11ce5)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const jit = (n) => Math.round(n + (rand() * 8 - 4)) // ±4분 지터

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query('truncate event_logs')

  // 기준 시각 = 텔레메트리 백필 끝(최신 raw) → "최근"으로 보임.
  const base = (await client.query('select max(ts) m from telemetry_raw')).rows[0].m
  const now = base ? new Date(base).getTime() : Date.now()

  // ── 데이터 로드 ──
  const models = Object.fromEntries(
    (await client.query('select id, name from models')).rows.map((m) => [m.id, m.name]))
  const gpus = (await client.query('select id, server_id, model, health, xid, vram_gb from gpus')).rows
  const gpuById = Object.fromEntries(gpus.map((g) => [g.id, g]))

  // 서비스 → 할당 GPU/서버 (/api/allocations 와 동일 링크: 승인·active gpu_request 우선, assigned_service_id 폴백)
  const alloc = (await client.query(
    `select s.id, s.name, s.model_id, s.usage_count,
            coalesce(req.allocated_gpu_id, ag.id) gpu_id,
            coalesce(req.allocated_server_id, ag.server_id) server_id
       from services s
       left join lateral (
         select gr.allocated_gpu_id, gr.allocated_server_id from gpu_requests gr
          where gr.service_name = s.name and gr.status='approved' and gr.active=true and gr.allocated_gpu_id is not null
          order by gr.processed_at desc nulls last, gr.created_at desc limit 1
       ) req on true
       left join gpus ag on ag.assigned_service_id = s.id
      order by s.usage_count desc nulls last, s.id`)).rows

  // 텔레메트리 최신값(현재 수치) — gpu temp/power, slice/gpu vram
  const tl = (await client.query(
    `select kind, id, metric, value from telemetry_latest where metric in ('temp','power','sm','vram','usage')`)).rows
  const tget = (kind, id, metric) =>
    tl.find((r) => r.kind === kind && r.id === id && r.metric === metric)?.value
  const gpuTemp = (id) => Math.round(tget('gpu', id, 'temp') ?? 0)
  const gpuPower = (id) => Math.round(tget('gpu', id, 'power') ?? 0)
  const gpuVram = (id) => Math.round(tget('gpu', id, 'vram') ?? 0)

  // 승인된 변경요청 → 대상 서비스(연계 이벤트용)
  const crs = (await client.query(
    `select cr.id, cr.type, cr.status, gr.service_name, gr.allocated_gpu_id, gr.allocated_server_id
       from gpu_change_requests cr join gpu_requests gr on gr.id = cr.target_request_id
      where cr.status='approved'`)).rows

  // ── 이벤트 누적 ──
  const rows = []
  let n = 0
  const add = (sev, status, gpu, srv, msg, minAgo, extra = {}) =>
    rows.push([
      `ev-${String(++n).padStart(3, '0')}`, sev, status, gpu ?? null, srv ?? null, msg,
      new Date(now - Math.max(1, minAgo) * MIN).toISOString(),
      extra.read ?? false, extra.assignee ?? null, extra.action ?? null, extra.resolution ?? null,
    ])
  const svcByGpu = (gpuId) => alloc.filter((s) => s.gpu_id === gpuId)
  const mName = (s) => models[s.model_id] ?? '모델'

  // 1) GPU 상태 — XID 장애(critical, 기존 유지) · 고온 · 유휴
  for (const g of gpus) {
    if (g.xid) {
      add('critical', 'open', g.id, g.server_id,
        `XID ${g.xid} — ${g.model} 응답 없음(드라이버 hang). 점검 모드 전환`, jit(14),
        { assignee: 'u-admin', action: '드라이버 재로드 점검' })
    }
    const temp = gpuTemp(g.id)
    if (temp > 75) {
      add('warn', 'open', g.id, g.server_id,
        `${g.model} 온도 ${temp}°C — 경고 임계(75°C) 초과`, jit(28),
        { assignee: 'u-admin', action: '쿨링/팬 점검' })
    } else if (temp >= 68) {
      // 과거 고온 → 복구 페어(현실적 타임라인)
      add('warn', 'resolved', g.id, g.server_id, `${g.model} 온도 ${temp + 6}°C 상승 감지`, jit(70))
      add('recovered', 'resolved', g.id, g.server_id, `${g.model} 온도 정상화(${temp}°C)`, jit(52),
        { resolution: '쿨링 정상 · 부하 분산' })
    }
    if (gpuPower(g.id) >= 180) {
      add('info', 'resolved', g.id, g.server_id, `${g.model} 전력 ${gpuPower(g.id)}W — 고부하 구간`, jit(40))
    }
    if (g.health === 'inactive') {
      add('info', 'resolved', g.id, g.server_id, `${g.model} 유휴 노드 — 미할당(가용)`, jit(110))
    }
  }

  // 2) 서비스 배포/운영 — 할당 GPU/서버에 귀속. 모든 할당 GPU에 분포.
  alloc.forEach((s, i) => {
    if (!s.gpu_id) { // GPU 미할당 서비스
      add('info', 'resolved', null, null, `${s.name} 배포 대기 — GPU 미할당`, jit(80 + i * 10))
      return
    }
    // 배포 완료(모델명 포함)
    add('info', 'resolved', s.gpu_id, s.server_id,
      `${s.name}(${mName(s)}) 모델 배포 완료`, jit(64 + i * 17))
    // 일부 재기동
    if (i % 2 === 0) {
      add('info', 'resolved', s.gpu_id, s.server_id, `${s.name} 컨테이너 재기동 완료`, jit(34 + i * 9))
    }
    // 토큰 사용량 임계 — 상위 사용량 서비스일수록 높게
    const pct = 72 + Math.floor(rand() * 22) // 72~93
    if (pct >= 85) {
      add('warn', 'open', s.gpu_id, s.server_id,
        `${s.name} 토큰 사용량 ${pct}% — 임계 근접`, jit(22 + i * 7),
        { assignee: s.id ? 'u-admin' : null, action: '쿼터 상향 검토' })
    } else if (i % 3 !== 1) {
      add('info', 'resolved', s.gpu_id, s.server_id,
        `${s.name} 토큰 사용량 ${pct}% — 정상 범위`, jit(46 + i * 6))
    }
  })

  // 2b) 헬스 복구 페어(현실적 타임라인) — 상위 서비스의 과거 지연 → 복구(recovered). 보장 생성.
  alloc.filter((s) => s.gpu_id).slice(0, 2).forEach((s, i) => {
    add('warn', 'resolved', s.gpu_id, s.server_id,
      `${s.name} 추론 지연(p95 +${2 + i}.${3 + i}s) 발생`, jit(92 + i * 16),
      { assignee: 'u-admin', action: '오토스케일 트리거' })
    add('recovered', 'resolved', s.gpu_id, s.server_id,
      `${s.name} 추론 지연 해소 — 정상화`, jit(72 + i * 16),
      { resolution: '오토스케일 · 부하 분산 적용' })
  })

  // 3) VRAM 임계 — 각 할당 GPU에서 가장 사용량 큰 서비스 기준(데이터 기반, MIG/cluster 공통)
  const allocGpuIds = [...new Set(alloc.filter((s) => s.gpu_id).map((s) => s.gpu_id))]
  for (const gid of allocGpuIds) {
    const vram = gpuVram(gid)
    const top = svcByGpu(gid)[0]
    if (!top) continue
    const vpct = vram >= 80 ? vram : 86 + Math.floor(rand() * 8) // 실값 우선, 낮으면 모델 적재 가정 86~93
    if (vpct >= 88) {
      add('warn', 'open', gid, gpuById[gid]?.server_id, `${top.name} VRAM ${vpct}% — 임계 근접`, jit(18),
        { assignee: 'u-admin', action: '배치 크기/캐시 점검' })
    } else {
      add('info', 'resolved', gid, gpuById[gid]?.server_id, `${top.name} VRAM ${vpct}% — 정상`, jit(58))
    }
  }

  // 4) 변경요청 연계(승인) — 예: cr-04 에듀캣 확장
  for (const cr of crs) {
    const verb = cr.type === 'expand' ? '슬라이스 확장' : cr.type === 'change' ? '자원 변경' : cr.type === 'reclaim' ? '회수' : '이전'
    add('info', 'resolved', cr.allocated_gpu_id, cr.allocated_server_id,
      `${cr.service_name} ${verb} 승인 적용 완료`, jit(26),
      { resolution: `변경요청 ${cr.id} 처리` })
  }

  // 5) 일반 운영(엔티티 무관)
  add('info', 'resolved', null, null, '사용자 인증 서버에 연결되었습니다.', jit(180))
  add('info', 'resolved', null, null, 'SSH 세션이 연결되었습니다.', jit(240))

  // ── 적재 ──
  for (const r of rows)
    await client.query(
      `insert into event_logs(id, severity, status, gpu_id, server_id, message, created_at, read, assignee, action, resolution)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (id) do nothing`, r)

  const c = (await client.query(
    `select count(*) n,
            count(*) filter (where severity in ('warn','critical')) warns,
            count(*) filter (where gpu_id='srv-01-gpu0') s1,
            count(*) filter (where gpu_id='srv-08-gpu0') s8
       from event_logs`)).rows[0]
  console.log(`✓ event_logs seeded — ${c.n} rows (warn/critical ${c.warns}) · srv-01-gpu0 ${c.s1} · srv-08-gpu0 ${c.s8}`)
  await client.end()
}

main().catch((e) => { console.error('events seed failed:', e); process.exit(1) })
