// 7서비스 전면 통일 재시드 — docker-compose down -v 권한 차단 대체.
// market_services.service_id 컬럼 보강(ALTER) 후 전체 데이터 테이블 truncate.
// 이어서 npm run seed / seed:telemetry / seed:events 로 새 seed.json 재적재.
import pg from 'pg'

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query('alter table market_services add column if not exists service_id text')
const { rows } = await c.query(`select tablename from pg_tables where schemaname = 'public'`)
const names = rows.map((r) => `"${r.tablename}"`).join(', ')
await c.query(`truncate ${names} restart identity cascade`)
console.log(`✓ market_services.service_id ensured; truncated ${rows.length} tables`)
await c.end()
