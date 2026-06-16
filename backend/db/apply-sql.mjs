// 범용 SQL 적용 — 가동 DB 에 .sql 파일 실행(init 재실행 안 되는 마이그레이션용).
// 사용: node --env-file=.env db/apply-sql.mjs db/init/0002_change_requests.sql
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
const file = process.argv[2]
if (!file) { console.error('usage: node db/apply-sql.mjs <path-to-sql>'); process.exit(1) }
const sql = readFileSync(resolve(process.cwd(), file), 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query(sql)
console.log('applied:', file)
await c.end()
