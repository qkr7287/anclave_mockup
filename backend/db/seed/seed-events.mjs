// seed-events.mjs — event_logs 시드. 엔티티 상태(XID·고온) + 서비스 배포/운영 활동.
// 4.5 내 할당 자원·4.21 이벤트 관제용. 텔레메트리 백필처럼 결정적(고정 시각·멱등 truncate).
// 실행: npm run seed:events  (엔티티 시드가 먼저 끝나 있어야 함)
import pg from 'pg'

const MIN = 60_000

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query('truncate event_logs')

  // 기준 시각은 텔레메트리 백필 끝(최신 raw)에 맞춰 — 그래야 "최근"으로 보임.
  const base = (await client.query('select max(ts) m from telemetry_raw')).rows[0].m
  const now = base ? new Date(base).getTime() : Date.now()

  const rows = []
  let n = 0
  const add = (sev, status, gpu, srv, msg, minAgo) =>
    rows.push([`ev-${String(++n).padStart(3, '0')}`, sev, status, gpu, srv, msg, new Date(now - minAgo * MIN).toISOString()])

  // 1) 장애/경고 — 엔티티 상태에서
  const gpus = (await client.query(`select id, server_id, model, health, xid from gpus`)).rows
  for (const g of gpus) {
    if (g.xid) add('critical', 'open', g.id, g.server_id, `XID ${g.xid} — ${g.model} 응답 없음(드라이버). 점검 모드 전환`, 12)
    if (g.id === 'srv-04-gpu0') add('warn', 'open', g.id, g.server_id, `${g.model} 온도 78°C — 경고 임계 근접`, 34)
    if (g.health === 'inactive') add('info', 'resolved', g.id, g.server_id, `${g.model} 유휴 노드 — 미할당`, 95)
  }

  // 2) 서비스 배포/운영 — 할당된 서비스에서 (cluster=gpu 직결, mig=슬라이스)
  const svcs = (await client.query(
    `select s.id, s.name, s.model_id, g.id gpu_id, g.server_id
       from services s left join gpus g on g.assigned_service_id = s.id
      order by s.id`)).rows
  svcs.forEach((s, i) => {
    add('info', 'resolved', s.gpu_id, s.server_id, `${s.name}(${s.model_id ?? '모델'}) 배포 완료`, 70 + i * 18)
    if (i % 2 === 0) add('info', 'resolved', s.gpu_id, s.server_id, `${s.name} 토큰 사용량 80% 임계 근접`, 50 + i * 12)
  })

  // 3) 일반 운영 이벤트
  add('info', 'resolved', null, null, '사용자 인증 서버에 연결되었습니다.', 180)
  add('info', 'resolved', null, null, 'SSH 세션이 연결되었습니다.', 240)

  for (const r of rows)
    await client.query(
      `insert into event_logs(id, severity, status, gpu_id, server_id, message, created_at)
       values($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`, r)

  const c = (await client.query('select count(*) n, count(*) filter (where severity in (\'warn\',\'critical\')) warns from event_logs')).rows[0]
  console.log(`✓ event_logs seeded — ${c.n} rows (warn/critical ${c.warns})`)
  await client.end()
}

main().catch((e) => { console.error('events seed failed:', e); process.exit(1) })
