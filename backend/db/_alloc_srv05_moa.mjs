// srv-05(192.168.0.165) 할당 보강 — 신규 서비스 '그룹웨어 모아'(svc-moa, owner 이은혜) 배치.
// seed-db 는 on-conflict-do-nothing 이라 가동 DB 의 기존 srv-05 행을 갱신하지 못함 → 타깃 UPDATE/INSERT.
// 텔레메트리 이력 보존을 위해 truncate 하지 않는다(전체 재시드 대체). 멱등(재실행 안전).
// 실행: cd backend && node --env-file=.env db/_alloc_srv05_moa.mjs
import pg from 'pg'

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  await c.query('begin')

  // 1) 소유자 hasHosting (이은혜는 두투리·그룹웨어모아 2서비스 운영)
  await c.query(`update users set has_hosting = true where id = 'u-leh'`)

  // 2) 신규 서비스(svc-moa) — 멱등 upsert
  await c.query(
    `insert into services(id, name, kind, has_api, model_id, service_url, test_url, description, owner_user_id, tags, usage_count, usage_rank, listed, models)
     values('svc-moa','그룹웨어 모아','사내 업무 도우미', true,'m12',
            'http://svc.anclave.local/moa','http://svc.anclave.local/moa/playground',
            '사내 그룹웨어의 공지·일정·문서를 한곳에 모아 요약·검색해주는 업무 비서.',
            'u-leh', array['그룹웨어','업무비서'], 8200, 8, true, array['m12'])
     on conflict (id) do update set
       name=excluded.name, kind=excluded.kind, has_api=excluded.has_api, model_id=excluded.model_id,
       service_url=excluded.service_url, test_url=excluded.test_url, description=excluded.description,
       owner_user_id=excluded.owner_user_id, tags=excluded.tags, usage_count=excluded.usage_count,
       usage_rank=excluded.usage_rank, listed=excluded.listed, models=excluded.models`)

  // 3) srv-05 GPU 엔티티 컬럼(폴백 경로 + seed-db 일관) — 할당·health
  await c.query(
    `update gpus set assigned_service_id='svc-moa', assigned_user_id='u-leh', health='normal'
       where id='srv-05-gpu0'`)

  // 4) gpu_servers srv-05 — health/note/hosted 집계(seed-db note 규칙: 단일 비-MIG → '<model> · 단일 할당')
  await c.query(
    `update gpu_servers set health='normal', note='RTX 2060 · 단일 할당',
            hosted_service_ids=array['svc-moa'], hosted_user_ids=array['u-leh']
       where id='srv-05'`)

  // 5) 할당 진실원(approved+active gpu_requests) — gr-08. /api/servers 가 이 행으로 owner/service 채움.
  await c.query(
    `insert into gpu_requests(id, requester_user_id, capacity, capacity_unit, models, env, addons,
        service_name, purpose, status, created_at, period, priority, processed_at, processed_by,
        allocated_server_id, allocated_gpu_id, allocated_ram_gb, allocated_storage_gb, allocated_cpu_cores, active)
     values('gr-08','u-leh',1,'card',array['m12'],'Ubuntu 22.04 · CUDA 12.4',array['API'],
        '그룹웨어 모아','그룹웨어 모아 서비스 운영','approved','2026-05-22 10:00','6개월','normal',
        '2026-05-23 09:40','u-admin','srv-05','srv-05-gpu0',10,20,6,true)
     on conflict (id) do update set
       status='approved', active=true, allocated_server_id='srv-05', allocated_gpu_id='srv-05-gpu0',
       service_name='그룹웨어 모아', requester_user_id='u-leh'`)

  // 6) 마켓 표시(4.17) — 서비스↔마켓 1:1 유지(선택). 카드 메타 멱등 upsert.
  await c.query(
    `insert into market_services(id, name, kind, provider, model, api, owner, owner_user_id, service_id,
        rating, status, hue, icon, response_time, tier, monthly_req, usage, usage_num, delta, up,
        req_full, success, delta_pct, last_call, tags, description, overview, api_desc, features, ops_notes,
        service_url, demo_url, thumbnail, screenshots)
     values('moa','그룹웨어 모아','사내 업무 도우미','서비스 기술개발팀','Qwen2.5 7B','REST API','이은혜','u-leh','svc-moa',
        4.4,'정상',100,'Squares2X2Icon','1.4s','Standard','8.2K','8.2K',8200,'▲ 5%',true,
        '8,180건','99.00%','+5.0%','3분 전',
        $1::jsonb,'사내 그룹웨어의 공지·일정·문서를 한곳에 모아 요약·검색해주는 업무 비서.',
        '그룹웨어 모아는 사내 그룹웨어에 흩어진 공지·일정·문서·메일을 한곳에 모아 AI가 요약하고 자연어로 검색·응답해주는 업무 비서입니다.',
        'REST 엔드포인트로 문서 색인·자연어 질의·요약을 제공합니다.',
        $2::jsonb, $3::jsonb, '', '', '/services/moa/thumb.webp', $4::jsonb)
     on conflict (id) do nothing`,
    [JSON.stringify(['그룹웨어','업무비서','검색']),
     JSON.stringify(['공지·일정·문서 통합 모아보기','자연어 검색·요약','일정 브리핑','권한 기반 접근','대화형 질의']),
     JSON.stringify(['사내 그룹웨어 연동 후 색인합니다.','권한 기반으로 검색 범위가 제한됩니다.','요약 결과는 원문 출처를 함께 제공합니다.']),
     JSON.stringify(['/services/moa/01.webp','/services/moa/02.webp','/services/moa/03.webp'])])

  await c.query('commit')
  const { rows } = await c.query(
    `select s.id health_srv, s.health, s.note, g.assigned_service_id, g.health gpu_health,
            (select count(*) from gpu_requests where id='gr-08' and active) gr08
       from gpu_servers s join gpus g on g.server_id=s.id where s.id='srv-05'`)
  console.log('✓ srv-05 할당 보강 완료:', rows[0])
} catch (e) {
  await c.query('rollback')
  console.error('migration failed (rolled back):', e)
  process.exit(1)
} finally {
  await c.end()
}
