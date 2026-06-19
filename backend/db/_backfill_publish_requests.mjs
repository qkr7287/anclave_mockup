// 정휘선 게시 서비스 → 승인 게시 신청 이력 백필(라이브 DB). market_services 내용 복사 → 게시 신청 상세 == 마켓 상세.
// stale 게시 신청(pr-01 에듀캣·pr-02 도라지) 제거 후 pr-bf-<svc> 4건 생성. 멱등.
// 실행: cd backend && node --env-file=.env db/_backfill_publish_requests.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const meta = JSON.parse(readFileSync(resolve(here, '../../app/scripts/publish-requests.backfill.json'), 'utf-8'))

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
// stale 제거(미게시 전환된 에듀캣 등 옛 게시 신청)
if (meta.removeStale?.length) {
  const r = await c.query('delete from publish_requests where id = any($1)', [meta.removeStale])
  console.log('stale 제거:', r.rowCount, meta.removeStale.join(','))
}
let n = 0
for (const [svcId, it] of Object.entries(meta.items)) {
  const svc = (await c.query('select name from services where id=$1', [svcId])).rows[0]
  const mk = (await c.query(
    'select overview, api_desc, features, tags, service_url, demo_url, demo_note from market_services where service_id=$1', [svcId])).rows[0]
  if (!svc) { console.warn(`  ! ${svcId} 서비스 없음 — skip`); continue }
  const id = 'pr-bf-' + svcId.replace(/^svc-/, '')
  const { rowCount } = await c.query(
    `insert into publish_requests(id, requester_user_id, service_name, service_url, demo_url,
        overview, api_desc, features, tags, visibility, demo_note,
        status, created_at, processed_at, processed_by, admin_memo)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,'public',$10,'approved',$11,$12,$13,'게시 승인 완료')
     on conflict (id) do nothing`,
    [id, meta.requesterUserId, svc.name, mk?.service_url ?? null, mk?.demo_url ?? null,
      mk?.overview ?? null, mk?.api_desc ?? null, mk?.features ?? [], mk?.tags ?? [], mk?.demo_note ?? null,
      it.created, it.processed, meta.processedBy])
  if (rowCount) n++
  console.log(`  ${rowCount ? '+' : '-'} ${id} (${svc.name})`)
}
const { rows } = await c.query(
  "select requester_user_id, service_name, status from publish_requests where requester_user_id='u-jhs' order by service_name")
console.log(`✓ 정휘선 게시 신청:`, rows.map((r) => `${r.service_name}(${r.status})`).join(', '))
await c.end()
