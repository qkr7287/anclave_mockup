-- Anclave DB 스키마 — 정본 app/src/data/types.ts(§13) + 화면↔데이터 매핑 확정 반영.
-- 컨테이너 최초 기동 시 docker-entrypoint-initdb.d 로 자동 실행.
-- 텔레메트리(사용률·온도·전력·토큰)는 엔티티 컬럼이 아니라 별도 시계열 테이블(맨 아래).

-- ============================================================
-- 공유 도메인 (union 타입 → DOMAIN + CHECK, enum 보다 변경 쉬움)
-- ============================================================
create domain status        as text check (value in ('pending','approved','rejected'));
create domain server_health as text check (value in ('normal','warn','danger','inactive'));
create domain gpu_health    as text check (value in ('normal','danger','inactive'));
create domain role_t        as text check (value in ('admin','user'));

-- ============================================================
-- 핵심 엔티티
-- ============================================================
create table users (
  id            text primary key,
  username      text not null unique,
  name          text not null,
  role          role_t not null,
  email         text not null,
  has_hosting   boolean not null default false,
  initial_route text not null
);

create table models (
  id              text primary key,
  name            text not null,
  kind            text not null check (kind in ('LLM','Code','Vision-Language','Image','STT','Embedding')),
  description     text,
  addons          text[] not null default '{}',
  license         text,
  recommended_gpu text,
  params          text,
  usage_rank      int,
  usage_count     int not null default 0,
  -- 모델별 권장 자원 요건(4.10a 심사 "자원 제한" 추천 기준) — 프론트 Model 싱크
  req_vram_gb     int,
  req_ram_gb      int,
  req_storage_gb  int,
  req_cpu_cores   int
);

create table services (
  id               text primary key,
  name             text not null,
  kind             text,
  has_api          boolean not null default false,
  model_id         text references models(id),
  service_url      text,
  test_url         text,
  description      text,
  manual_url       text,
  owner_user_id    text not null references users(id),
  deployer_user_id text references users(id),
  tags             text[] not null default '{}',
  usage_count      int not null default 0,
  usage_rank       int,
  listed           boolean not null default true   -- 매핑 ④확정: 마켓 게시 여부(게시 승인 시 true)
);

-- ============================================================
-- 함대(인벤토리) 3계층 — 자원맵 4.2→4.3→4.4
-- 텔레메트리 필드(temp·cpu_util·sm_util·power 등)는 컬럼 없음 → 시계열 테이블
-- ============================================================
create table gpu_servers (
  id                 text primary key,
  name               text not null,
  rack               text,
  host               text,
  network            text,
  note               text,
  health             server_health not null default 'normal',
  hosted_service_ids text[] not null default '{}',
  hosted_user_ids    text[] not null default '{}'
);

create table gpus (
  id                  text primary key,
  server_id           text not null references gpu_servers(id) on delete cascade,
  name                text,
  model               text,
  arch                text,
  vram_gb             int,
  mig_capable         boolean not null default false,
  serial              text,
  interconnect        text,
  health              gpu_health not null default 'normal',
  alloc_mode          text check (alloc_mode in ('cluster','mig')),
  assigned_user_id    text references users(id),
  assigned_service_id text references services(id),
  xid                 text
);
create index on gpus (server_id);

create table gpu_requests (
  id                text primary key,
  requester_user_id text not null references users(id),
  capacity          numeric not null,
  capacity_unit     text check (capacity_unit in ('card','slice')),
  models            text[] not null default '{}',
  env               text,
  addons            text[] not null default '{}',
  service_name      text,
  purpose           text,
  attachment_url    text,
  status            status not null default 'pending',
  reject_reason     text,
  created_at        timestamptz not null default now(),
  -- 신청 상세·심사(4.6a/4.10a) 확장 + 승인 시 확정 자원 제한 — 프론트 GpuRequest 싱크(전부 nullable)
  period               text,
  priority             text,
  admin_memo           text,
  processed_at         timestamptz,
  processed_by         text,
  allocated_server_id  text,
  allocated_gpu_id     text,
  allocated_slice_id   text,
  allocated_ram_gb     int,
  allocated_storage_gb int,
  allocated_cpu_cores  int,
  -- 4.6b 신규 신청 폼 수집 필드(프론트 request-new) — 전부 nullable. start_date 는 'YYYY-MM-DD' 문자열이라 text.
  team        text,
  start_date  text,
  security    text,
  scale       text,
  remark      text
);
create index on gpu_requests (status, created_at desc);
create index on gpu_requests (requester_user_id);

create table mig_slices (
  id            text primary key,
  gpu_id        text not null references gpus(id) on delete cascade,
  profile       text not null,
  units         int not null,
  gb            int not null,
  owner_user_id text references users(id),
  model_id      text references models(id),
  container_id  text,
  health        server_health,
  request_id    text references gpu_requests(id),
  status        text not null default 'active' check (status in ('active','reclaimed'))  -- 매핑 ②확정: 회수 soft(이력 보존)
);
create index on mig_slices (gpu_id);
create index on mig_slices (owner_user_id);

-- ============================================================
-- 신청 · 승인
-- ============================================================
create table api_requests (
  id                 text primary key,
  requester_user_id  text not null references users(id),
  service_id         text not null references services(id),
  model              text,
  target_service_url text,
  status             status not null default 'pending',
  api_key            text,            -- 승인 시 발급
  reject_reason      text,
  created_at         timestamptz not null default now(),
  purpose            text,            -- 사용 목적(소유자 검토용)
  processed_by       text,            -- 승인/반려한 소유자 users.id
  processed_at       timestamptz
);
create index on api_requests (service_id, status);

create table gpu_change_requests (
  id                text primary key,
  requester_user_id text not null references users(id),
  type              text not null check (type in ('migrate','change','expand','reclaim')),
  reason            text,
  status            status not null default 'pending',
  reject_reason     text,
  created_at        timestamptz not null default now()
);

create table publish_requests (
  id                text primary key,
  requester_user_id text not null references users(id),
  service_name      text not null,
  service_url       text,
  demo_url          text,
  meta              text,
  status            status not null default 'pending',
  reject_reason     text,
  created_at        timestamptz not null default now(),
  admin_memo        text,
  processed_by      text,            -- 승인/반려한 관리자 users.id
  processed_at      timestamptz
);

-- 모델 신청 관리(4.14 재정의) — 사용자 등록 신청 + 관리자 반입/보안점검/등록을 한 엔티티에.
-- 프론트 ModelRequest 와 1:1. (구 model_imports 대체)
create table model_requests (
  id                  text primary key,
  requester_user_id   text not null,   -- FK 없음(정본 시드가 비정규 user id 포함) — 지시서 plain text
  model_name          text not null,
  kind                text,
  source              text,
  reason              text,
  status              status not null default 'pending',
  stage               text not null default 'requested'
                        check (stage in ('requested','scanning','scanned','deployed','rejected')),
  created_at          timestamptz not null default now(),
  reject_reason       text,
  processed_at        timestamptz,
  processed_by        text,
  file_name           text,
  format              text check (format in ('safetensors','other')),
  scan                text check (scan in ('pass','fail','pending')),
  checksum            text,
  registered_model_id text references models(id) on delete set null  -- 모델 회수 시 참조 자동 정리
);
create index on model_requests (status, created_at desc);
create index on model_requests (requester_user_id);

-- ============================================================
-- 로그 · 알림 · 게시판
-- ============================================================
create table event_logs (
  id         text primary key,
  severity   text not null check (severity in ('critical','warn','info','recovered')),
  status     text not null default 'open' check (status in ('open','resolved')),
  gpu_id     text references gpus(id),
  server_id  text references gpu_servers(id),
  message    text not null,
  created_at timestamptz not null default now(),
  read       boolean not null default false,
  assignee   text,
  action     text,
  resolution text
);
create index on event_logs (status, created_at desc);

create table notifications (
  id         text primary key,
  category   text not null check (category in ('alloc','health','reclaim')),
  message    text not null,
  created_at timestamptz not null default now(),
  read       boolean not null default false,
  link       text
);

create table audit_logs (
  id            text primary key,
  actor_user_id text not null references users(id),
  action        text not null,
  target        text,
  ip            text,
  created_at    timestamptz not null default now()
);

create table board_posts (
  id         text primary key,
  tab        text not null check (tab in ('notice','qna','manual')),
  title      text not null,
  body       text,
  author_id  text references users(id),
  answered   boolean not null default false,
  created_at timestamptz not null default now()
);

-- 활성화 누적(서비스별 사용량 카운터). 분 단위 추이는 텔레메트리(service.tokens)에서.
create table activation_stats (
  service_id       text not null references services(id),
  model_id         text references models(id),
  consumer_user_id text not null references users(id),
  tokens           bigint not null default 0,
  calls            bigint not null default 0,
  period           text not null,
  primary key (service_id, consumer_user_id, period)
);

-- API 키 사용 누적(connections). 호출 sparkline 추이는 텔레메트리.
create table api_key_usage (
  key_id      text primary key,
  service_id  text references services(id),
  connections int not null default 0
);

-- ============================================================
-- 설정 · 운영 (정적성 — 시드 1회 적재 후 거의 불변)
-- ============================================================
create table access_policies (
  id       text primary key,
  role     role_t not null,
  resource text not null,
  allow    boolean not null default false
);

create table infra_integrations (
  id       text primary key,
  kind     text not null check (kind in ('dcgm','prometheus','metrics','orchestrator')),
  name     text not null,
  endpoint text,
  status   text not null check (status in ('connected','down'))
);

-- ============================================================
-- 마켓플레이스 표시 전용 서비스(4.17 카드/상세) — 기존 services(svc-*)와 완전 별개. 읽기 전용.
-- ============================================================
create table market_services (
  id            text primary key,
  name          text not null,
  kind          text,
  provider      text,
  model         text,
  api           text,
  owner         text,
  rating        numeric,
  status        text,
  hue           int,
  icon          text,
  response_time text,
  tier          text,
  monthly_req   text,
  usage         text,
  usage_num     int,
  delta         text,
  up            boolean,
  req_full      text,
  success       text,
  delta_pct     text,
  last_call     text,
  tags          jsonb,
  description   text,            -- 응답 키는 'desc'(SQL 예약어 회피)
  overview      text,
  api_desc      text,
  features      jsonb,
  ops_notes     jsonb,
  service_url   text,
  demo_url      text,
  thumbnail     text,
  screenshots   jsonb
);
create index on market_services (usage_num desc);

-- ============================================================
-- 텔레메트리 (시계열) — long format. 측정 대상 4종 = server|gpu|slice|service
-- 정책(보존): latest(5초 upsert) / raw(5초·6시간) / 1m(1분 집계·2일) / hourly(1시간 집계·35일)
-- 밴드 차트용으로 1m·hourly 는 v_min/v_max 사전집계. 적재·롤업·보존청소는 backend 워커.
-- ============================================================
create table telemetry_latest (
  kind       text not null,    -- server | gpu | slice | service
  id         text not null,    -- 대상 엔티티 id
  metric     text not null,    -- cpu_util | mem_util | net_in | net_out | sm | vram | temp | power | usage | tokens | calls
  value      real not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id, metric)
);

-- raw: 5초 원본 (보존 6시간)
create table telemetry_raw (
  ts     timestamptz not null,
  kind   text not null,
  id     text not null,
  metric text not null,
  value  real not null
);
create index on telemetry_raw (kind, id, metric, ts desc);

-- 1m: 1분 사전집계 avg/min/max (보존 2일)
create table telemetry_1m (
  ts     timestamptz not null,   -- 분 버킷 시작
  kind   text not null,
  id     text not null,
  metric text not null,
  value  real not null,          -- 1분 평균
  v_min  real not null,
  v_max  real not null,
  primary key (kind, id, metric, ts)
);
create index on telemetry_1m (kind, id, metric, ts desc);

-- hourly: 1시간 집계 avg/min/max (보존 35일). value=avg 는 기존 엔드포인트 호환 유지.
create table telemetry_hourly (
  ts     timestamptz not null,   -- 시간 버킷 시작
  kind   text not null,
  id     text not null,
  metric text not null,
  value  real not null,          -- 해당 시간 평균
  v_min  real not null,
  v_max  real not null,
  primary key (kind, id, metric, ts)
);
