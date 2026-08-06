-- =============================================================================
-- 이음(Ieum) — 0001 스키마
-- 부서 간 협업 업무공유 플랫폼 / 2026 화성시 AI·DATA 공모전 N7
--
-- 설계 원칙
--   1) 1급 객체는 '업무(work)'다. 문서·대화·이력·권한이 모두 업무에 매달린다.
--   2) 권한은 애플리케이션이 아니라 DB(RLS)가 강제한다. → 0002_rls.sql
--   3) 이력은 append-only이며 애플리케이션 코드로 우회할 수 없다. → 0003_triggers.sql
-- =============================================================================

create extension if not exists "pgcrypto";

-- RLS 보조 함수 전용 스키마. PostgREST에 노출하지 않는다(= 클라이언트가 직접 호출 불가).
create schema if not exists app;
revoke all on schema app from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 열거형
-- -----------------------------------------------------------------------------

-- 업무 진행상태. '지연'은 저장하지 않고 (due_date < now() and status <> 'done')로 파생한다.
create type work_status as enum ('todo', 'doing', 'review', 'done');

-- 업무별 참여자 역할. 과제 요구사항 '접근권한 관리'의 핵심.
create type member_role as enum ('owner', 'editor', 'viewer');

-- 업무 공개 범위
create type work_visibility as enum (
  'private',     -- 참여자만
  'department',  -- 소관 부서 전체 열람 가능
  'city'         -- 전 부서 열람 가능
);

create type activity_kind as enum (
  'work.created', 'work.updated', 'work.status_changed', 'work.transferred',
  'member.added', 'member.role_changed', 'member.removed',
  'document.created', 'document.updated', 'document.deleted',
  'section.updated',
  'comment.created', 'comment.deleted',
  'attachment.added', 'attachment.removed',
  'handover.started', 'handover.completed'
);

create type access_kind as enum ('work.viewed', 'document.viewed', 'attachment.downloaded');

create type handover_status as enum ('draft', 'generated', 'confirmed', 'completed');

-- -----------------------------------------------------------------------------
-- 조직
-- -----------------------------------------------------------------------------

create table department (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                    -- 예: 자원순환과
  parent_id   uuid references department(id),          -- 실/국
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

comment on table department is '화성시 조직도 기반 부서. parent_id로 실·국 → 과 계층을 표현한다.';

-- profile.id = auth.users.id 로 맞춰 auth.uid()를 그대로 쓴다(조회 1회 절감 + RLS 단순화).
create table profile (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  department_id uuid references department(id),
  position      text,                                   -- 직급: 주무관/팀장/과장
  email         text not null,
  avatar_url    text,
  is_active     boolean not null default true,          -- 퇴직·휴직 시 false
  is_demo       boolean not null default false,         -- 심사용 데모 계정 표식
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column profile.is_demo is
  '심사위원 원클릭 체험용 계정. 데모 계정은 쓰기 범위를 별도로 제한할 수 있다.';

-- -----------------------------------------------------------------------------
-- 업무 (1급 객체)
-- -----------------------------------------------------------------------------

create table work (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  status        work_status not null default 'todo',
  visibility    work_visibility not null default 'department',
  department_id uuid not null references department(id),
  owner_id      uuid not null references profile(id),   -- 주담당자
  due_date      date,
  -- 연간 주기 소환: 작년 같은 업무를 가리킨다. "작년 이맘때 전임자가 무엇을 했는가".
  fiscal_year        int not null default extract(year from now()),
  previous_year_work_id uuid references work(id) on delete set null,
  archived_at   timestamptz,
  created_by    uuid not null references profile(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column work.previous_year_work_id is
  '전년도 동일 업무. 인수인계 시 후임자가 작년 진행 내역을 그대로 물려받는 경로.';

create table work_member (
  work_id    uuid not null references work(id) on delete cascade,
  profile_id uuid not null references profile(id) on delete cascade,
  role       member_role not null default 'viewer',
  added_by   uuid references profile(id),
  created_at timestamptz not null default now(),
  primary key (work_id, profile_id)
);

comment on table work_member is
  '업무별 접근권한. 부서 경계를 넘는 협업은 이 테이블에 참여자를 추가해 이뤄진다.';

-- -----------------------------------------------------------------------------
-- 문서 (공동편집)
-- -----------------------------------------------------------------------------

create table document (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references work(id) on delete cascade,
  title      text not null,
  created_by uuid not null references profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 섹션 단위 분할 편집. 편집 중인 섹션만 잠기므로 충돌이 원천적으로 발생하지 않는다.
-- (2차예선에서 Yjs 기반 동시 타이핑으로 확장 예정)
create table doc_section (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references document(id) on delete cascade,
  sort_order    int  not null default 0,
  heading       text,
  body          text not null default '',
  locked_by     uuid references profile(id),
  locked_at     timestamptz,
  updated_by    uuid references profile(id),
  updated_at    timestamptz not null default now()
);

comment on column doc_section.locked_at is
  '편집 잠금 시각. 만료(예: 5분) 처리는 app.section_lock_active()가 판단한다.';

-- 변경이력: 저장할 때마다 남기는 스냅샷
create table doc_version (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references document(id) on delete cascade,
  section_id  uuid references doc_section(id) on delete set null,
  version_no  int  not null,
  heading     text,
  body        text not null,
  author_id   uuid not null references profile(id),
  created_at  timestamptz not null default now(),
  unique (document_id, version_no)
);

-- -----------------------------------------------------------------------------
-- 대화 · 첨부
-- -----------------------------------------------------------------------------

create table comment (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references work(id) on delete cascade,
  author_id  uuid not null references profile(id),
  body       text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table attachment (
  id            uuid primary key default gen_random_uuid(),
  work_id       uuid not null references work(id) on delete cascade,
  storage_path  text not null unique,                   -- private 버킷 경로. 공개 URL 없음.
  file_name     text not null,
  mime_type     text not null,
  byte_size     bigint not null,
  uploaded_by   uuid not null references profile(id),
  created_at    timestamptz not null default now()
);

comment on table attachment is
  'Storage private 버킷 메타데이터. 실제 접근은 단기 만료 signed URL로만 이뤄진다.';

-- -----------------------------------------------------------------------------
-- 이력 (append-only)
-- -----------------------------------------------------------------------------

-- 트리거(SECURITY DEFINER)만 기록한다. 사용자에게 INSERT/UPDATE/DELETE 정책을 부여하지 않으므로
-- 애플리케이션 코드를 우회하거나 위조할 수 없다. → 0002_rls.sql, 0003_triggers.sql
create table activity (
  id         bigint generated always as identity primary key,
  work_id    uuid not null references work(id) on delete cascade,
  actor_id   uuid references profile(id),
  kind       activity_kind not null,
  summary    text not null,                             -- 사람이 읽는 한 줄
  detail     jsonb not null default '{}'::jsonb,        -- before/after diff
  created_at timestamptz not null default now()
);

comment on table activity is
  '협업 이력. append-only. UPDATE/DELETE 정책이 존재하지 않아 사후 조작이 불가능하다.';

-- 열람 로그. 공문서는 "누가 수정했는가"만큼 "누가 열람했는가"가 중요하다.
-- SELECT에는 트리거를 걸 수 없으므로 public.log_access() RPC로만 기록된다.
create table access_log (
  id         bigint generated always as identity primary key,
  work_id    uuid references work(id) on delete cascade,
  target_id  uuid,
  actor_id   uuid references profile(id),
  kind       access_kind not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 인수인계
-- -----------------------------------------------------------------------------

create table handover (
  id             uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references profile(id),  -- 전임자
  to_profile_id   uuid not null references profile(id),  -- 후임자
  status         handover_status not null default 'draft',
  -- AI가 생성한 사무인계인수서 초안. 최종본은 사람이 확인·수정한 뒤 확정한다.
  document_draft text,
  ai_model       text,                                   -- 생성 모델 기록(재현성·감사 목적)
  generated_at   timestamptz,
  confirmed_at   timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  check (from_profile_id <> to_profile_id)
);

comment on column handover.document_draft is
  'AI 생성 초안. 원칙: AI는 축적된 협업 이력을 문서로 조립할 뿐, 없는 내용을 만들지 않는다.';

create table handover_item (
  handover_id uuid not null references handover(id) on delete cascade,
  work_id     uuid not null references work(id) on delete cascade,
  transferred boolean not null default false,
  primary key (handover_id, work_id)
);

-- -----------------------------------------------------------------------------
-- 인덱스 (RLS 정책이 매 행마다 평가되므로 인덱스가 곧 성능이다)
-- -----------------------------------------------------------------------------

create index on profile (department_id);
create index on work (department_id);
create index on work (owner_id);
create index on work (status);
create index on work (due_date) where archived_at is null;
create index on work (previous_year_work_id);
create index on work_member (profile_id);           -- RLS: "내가 참여한 업무" 조회 경로
create index on document (work_id);
create index on doc_section (document_id, sort_order);
create index on doc_version (document_id, created_at desc);
create index on comment (work_id, created_at desc);
create index on attachment (work_id);
create index on activity (work_id, created_at desc);
create index on access_log (work_id, created_at desc);
create index on handover (from_profile_id);
create index on handover (to_profile_id);

-- -----------------------------------------------------------------------------
-- updated_at 자동 갱신
-- -----------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profile_touch     before update on profile     for each row execute function app.touch_updated_at();
create trigger trg_work_touch        before update on work        for each row execute function app.touch_updated_at();
create trigger trg_document_touch    before update on document    for each row execute function app.touch_updated_at();
create trigger trg_doc_section_touch before update on doc_section for each row execute function app.touch_updated_at();
