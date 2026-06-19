-- 0007 — API 키 신청에 '사용 서비스명'(클라이언트) + 규모. (0006 이후 마이그레이션, 멱등)
-- 목적: 게시 서비스(도라지 등)의 키를 신청한 클라이언트 서비스명을 저장 →
--       API 신청 관리 목록 + 서비스 사용량 랭킹(rows[].serviceName) 표시.
--
-- ※ 가동 DB 수동 적용:  node --env-file=.env db/apply-sql.mjs db/init/0007_api_request_client.sql

alter table api_requests
  add column if not exists client_service_name text,  -- 키 사용처(클라이언트 서비스명)
  add column if not exists scale                text;  -- 예상 호출 규모
