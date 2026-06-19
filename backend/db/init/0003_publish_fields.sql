-- 0003 — 게시 신청(publish_requests) 입력 필드 보강 + 마켓 데모안내. (0002 이후 마이그레이션, 멱등)
-- 목적: 신청서에 적은 소개/API설명/기능/태그/공개범위/데모안내를 저장하고,
--       게시 승인 시 그 값으로 market_services(4.17 상세)에 매핑 → "신청한 그대로 마켓에 표시".
--
-- ※ 가동 DB 수동 적용:  node --env-file=.env db/apply-sql.mjs db/init/0003_publish_fields.sql
--   신규 컨테이너는 0001→0002→0003 파일명 순 자동 적용.

alter table publish_requests
  add column if not exists overview   text,
  add column if not exists api_desc   text,
  add column if not exists features   text[] not null default '{}',
  add column if not exists tags       text[] not null default '{}',
  add column if not exists visibility text,          -- 공개범위(public|internal 등) — 게시 노출 제어
  add column if not exists demo_note  text;          -- 데모 안내(접속/계정 등)

-- 마켓 상세에 '데모 안내' 표시용(overview/api_desc/features/tags 는 기존 컬럼).
alter table market_services
  add column if not exists demo_note text;
