// 가동 DB 의 models.description/usage_guide 를 model-content.json 정본으로 갱신(멱등).
// seed-db 는 on-conflict-do-nothing 이라 기존 모델 행을 갱신 못함 → 이 스크립트로 UPDATE.
// 실행: cd backend && node --env-file=.env db/_update_models_content.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const content = JSON.parse(readFileSync(resolve(here, '../../app/scripts/model-content.json'), 'utf-8'))

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
let n = 0
for (const [id, { description, usageGuide }] of Object.entries(content)) {
  const { rowCount } = await c.query(
    `update models set description = $2, usage_guide = $3 where id = $1`,
    [id, description ?? null, usageGuide ?? null])
  if (rowCount) n++
  else console.warn(`  ! model ${id} not found (skipped)`)
}
console.log(`✓ updated ${n}/${Object.keys(content).length} models (description + usage_guide)`)
await c.end()
