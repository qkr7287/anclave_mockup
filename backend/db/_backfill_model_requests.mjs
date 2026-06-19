// 카탈로그 7모델 → 정휘선(u-jhs) 신청·배포 이력 백필(라이브 DB).
// description/usageGuide/license/addons 는 models 에서 그대로 복사(신청 상세 == 모델 상세).
// 멱등: 해당 model 에 이미 registered_model_id 가 걸린 model_request 가 있으면 skip.
// 실행: cd backend && node --env-file=.env db/_backfill_model_requests.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const meta = JSON.parse(readFileSync(resolve(here, '../../app/scripts/model-requests.backfill.json'), 'utf-8'))

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
let added = 0, skipped = 0
for (const [modelId, it] of Object.entries(meta.items)) {
  const m = (await c.query(
    'select id, name, kind, description, usage_guide, license, addons from models where id=$1', [modelId])).rows[0]
  if (!m) { console.warn(`  ! model ${modelId} 없음 — skip`); skipped++; continue }
  // 멱등: 이미 이 모델로 배포된 신청이 있으면 skip(stale 포함)
  const exists = (await c.query(
    'select id from model_requests where registered_model_id=$1 limit 1', [modelId])).rows[0]
  if (exists) { console.log(`  - ${modelId}(${m.name}) skip — 기존 신청 ${exists.id} 점유`); skipped++; continue }
  await c.query(
    `insert into model_requests(id, requester_user_id, model_name, kind, source, reason,
        description, license, addons, usage_guide, status, stage, created_at,
        processed_at, processed_by, file_name, format, scan, checksum, registered_model_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved','deployed',$11,$12,$13,$14,'safetensors','pass',$15,$16)
     on conflict (id) do nothing`,
    [`mr-bf-${modelId}`, meta.requesterUserId, m.name, m.kind, it.source, it.reason,
      m.description ?? null, m.license ?? null, m.addons ?? [], m.usage_guide ?? null, it.created,
      it.deployed, meta.processedBy, `${it.slug}.safetensors`, it.checksum, modelId])
  console.log(`  + ${modelId}(${m.name}) → mr-bf-${modelId}`)
  added++
}
console.log(`✓ backfill done — added ${added}, skipped ${skipped}`)
await c.end()
