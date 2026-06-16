-- 0002 — 변경·확장·회수 요청 확장 + 할당 active 플래그(0001 이후 마이그레이션). 멱등(IF NOT EXISTS).
-- 설계: "할당 = 승인된 gpu_requests 행"이 단일 진실원천. 변경요청은 target_request_id 로 그 행을 참조,
--       승인 시 그 행의 allocated_* 를 트랜잭션으로 갱신(회수는 active=false).
--
-- ※ 이미 컨테이너가 떠 있으면 docker-entrypoint init 은 재실행되지 않는다. 가동 DB 에 수동 적용:
--     node --env-file=.env db/apply-sql.mjs db/init/0002_change_requests.sql
--   (또는) docker exec -i anclave-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/init/0002_change_requests.sql
--   신규 컨테이너는 0001 다음 0002 가 파일명 순서로 자동 적용된다.

alter table gpu_change_requests
  add column if not exists target_request_id text references gpu_requests(id),
  add column if not exists after_server_id    text,
  add column if not exists after_gpu_id        text,
  add column if not exists after_slice_id      text,
  add column if not exists after_ram_gb        int,
  add column if not exists after_storage_gb    int,
  add column if not exists after_cpu_cores     int,
  add column if not exists after_extra         jsonb,   -- 확장 추가자원 레이블 배열 등
  add column if not exists processed_at         timestamptz,
  add column if not exists processed_by         text,
  add column if not exists admin_memo           text;

-- 회수(reclaim) 시 할당 비활성 표시(status 도메인 변경 회피).
alter table gpu_requests
  add column if not exists active boolean not null default true;
