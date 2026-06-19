-- 0005 — 모델 사용법(usage_guide) 컬럼. (0004 이후 마이그레이션, 멱등)
-- 목적: 모델 상세 '사용법'(curl 예시 등)을 DB에 저장. 신청(model_requests)에도 두어 반입 시 모델로 매핑.
--       프론트는 usage_guide 가 있으면 그대로(pre-wrap·mono) 표시, 비면 자동생성 curl 폴백.
--
-- ※ 가동 DB 수동 적용:  node --env-file=.env db/apply-sql.mjs db/init/0005_model_usage_guide.sql

alter table models         add column if not exists usage_guide text;
alter table model_requests add column if not exists usage_guide text;
