-- 0006 — 서버(gpu_servers) 호스트 물리 스펙. (0005 이후 마이그레이션, 멱등)
-- 목적: 변경·확장·회수 마법사/resource-map 서버 상세의 자원 자동 산정·표시 단일 진실원.
--       /api/servers 서버 레벨에 ramGb/storageGb/cpuCores 노출.
--
-- ※ 가동 DB 수동 적용:  node --env-file=.env db/apply-sql.mjs db/init/0006_server_host_spec.sql

alter table gpu_servers
  add column if not exists ram_gb     integer,
  add column if not exists storage_gb integer,
  add column if not exists cpu_cores  integer;

-- host 기준 값(41/63 = 32GB·16core, 그 외 = 16GB·8core, 저장 공통 2048GB). 재실행 안전(동일값).
update gpu_servers set
  ram_gb     = case when host in ('192.168.0.41', '192.168.0.63') then 32 else 16 end,
  storage_gb = 2048,
  cpu_cores  = case when host in ('192.168.0.41', '192.168.0.63') then 16 else 8 end;
