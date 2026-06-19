// 클라이언트 서비스 API 키 신청 9건 백필(라이브 DB). 멱등(id on conflict do nothing).
// approved=키 발급(usage 랭킹 반영) · pending=API 신청 관리 노출.
// 실행: cd backend && node --env-file=.env db/_backfill_api_requests.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const { requests } = JSON.parse(readFileSync(resolve(here, '../../app/scripts/api-requests.backfill.json'), 'utf-8'))

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
let n = 0
for (const r of requests) {
  const { rowCount } = await c.query(
    `insert into api_requests(id, requester_user_id, service_id, client_service_name, target_service_url,
        purpose, scale, status, api_key, created_at, processed_at, processed_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (id) do nothing`,
    [r.id, r.requesterUserId, r.serviceId, r.clientServiceName, r.targetServiceUrl ?? null,
      r.purpose ?? null, r.scale ?? null, r.status, r.apiKey ?? null, r.createdAt,
      r.processedAt ?? null, r.processedBy ?? null])
  n += rowCount
}
const { rows } = await c.query(
  `select status, count(*) n from api_requests where client_service_name is not null group by status order by status`)
console.log(`✓ api_requests backfill — inserted ${n}/${requests.length}; by status:`, rows)
await c.end()
