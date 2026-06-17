-- 0004 — 모델 신청(model_requests) 명세 필드 보강. (0003 이후 마이그레이션, 멱등)
-- 목적: 신청 폼 입력(모델 설명/라이선스/태그)을 저장하고, 반입 승인(카탈로그 Model 등록) 시
--       그 값을 models.description/license/addons 로 매핑 → 등록 후 모델 상세에 신청값 그대로 표시.
--
-- ※ 가동 DB 수동 적용:  node --env-file=.env db/apply-sql.mjs db/init/0004_model_request_fields.sql
--   신규 컨테이너는 0001→…→0004 파일명 순 자동 적용.

alter table model_requests
  add column if not exists description text,
  add column if not exists license     text,
  add column if not exists addons      text[] not null default '{}';
