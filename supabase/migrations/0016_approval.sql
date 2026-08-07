-- =============================================================================
-- 일머리(Ilmeori) — 0016 결재
--
-- ── 왜 결재를 담는가 ────────────────────────────────────────────────────────
--
-- 자문(공립학교 2년 근무 · 현재 2개 부서 리드, 2026-08-07)에서 나온 첫 문장이
-- 「결재라인 어디갔어」였다. 종이컵 하나를 사도 결재를 올린다. 그러니까
-- **결재가 없으면 이 제품을 열어 볼 이유 자체가 없다.**
--
-- ── 온나라와 자리를 어떻게 나누는가 ─────────────────────────────────────────
--
-- 「행정업무의 운영 및 혁신에 관한 규정」 시행규칙 제3조제3항은 문서 서식을 나눈다.
--
--   별지 제1호서식  발신하는 문서            → 온나라의 자리다. GPKI 서명이 붙는다
--   별지 제2호서식  보고서·계획서·검토서 등
--                   **발신할 필요가 없는 내부결재문서에만 사용**  → 여기가 우리 자리다
--   별지 제12호서식 업무인계·인수서          → 이미 만들었다(0001)
--
-- 그래서 이 표들은 **최종 결재권자의 법적 서명을 받지 않는다.** 받는 것은
-- 같은 규칙 제4조제6항이 말하는 결문의 「검토·협조」층 — 실무자와 중간결재자가
-- 실제로 주고받는 확인이다. 대외로 나가는 문서는 여기서 만든 것을 온나라로
-- 넘겨 거기서 서명한다(0017 의 내보내기 경로는 2차예선에서 붙인다).
--
-- ── 이 파일이 하는 일 ───────────────────────────────────────────────────────
--
-- 표와 열거형만 만든다. 누가 무엇을 할 수 있는지는 0017 이 정한다.
-- 표와 열거형은 스키마 없이(public) 만든다. app 은 RLS 보조 함수 전용이다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 직급 서열
--
-- 결재선 자동 생성이 이 한 칸에서 나온다. 자문의 말은 이랬다 —
-- 「결재란에 하나하나 입력하는 게 아니라, 바빠 죽겠으니 빠바바밥 해야 하고」.
--
-- profile.position(주무관/팀장/과장)은 **사람이 읽는 문자열**이고 표기가 흔들린다
-- (「팀장」/「○○팀장」/「팀장(직무대리)」). 서열 판정을 문자열에 맡기면 조직이
-- 개편될 때마다 결재선이 조용히 어긋난다. 숫자를 따로 둔다.
-- -----------------------------------------------------------------------------

alter table profile add column if not exists rank smallint not null default 50;

alter table profile drop constraint if exists profile_rank_check;
alter table profile add constraint profile_rank_check
  check (rank in (10, 20, 30, 40, 50));

comment on column profile.rank is
  '결재 서열. 10 시장 / 20 국장·실장 / 30 과장 / 40 팀장 / 50 주무관. 작을수록 위다.';

-- 인사정보 변조 차단(0003)에 새 칸을 더한다. 같은 이름으로 다시 정의해
-- 이 파일 하나로 최신 상태가 되게 한다(0011 이 0007 에 했던 방식).
--
-- 이 칸이 열려 있으면 주무관이 자기 rank 를 10 으로 적어 넣고 남의 결재선
-- 맨 윗칸에 자기를 올릴 수 있다. 결재란에 찍히는 직위는 서열에서 나오므로
-- 그건 곧 문서 위조다.
create or replace function app.trg_profile_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if (select auth.uid()) is null then
    return new;   -- 서버(service_role)·마이그레이션 경로는 허용
  end if;
  if new.department_id is distinct from old.department_id
     or new.position   is distinct from old.position
     or new.rank       is distinct from old.rank
     or new.email      is distinct from old.email
     or new.is_active  is distinct from old.is_active
     or new.is_demo    is distinct from old.is_demo then
    raise exception '소속·직급·계정 상태는 본인이 변경할 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 2. 이력에 결재 사건을 더한다
--
-- 새 이력 표를 만들지 않는다. 결재는 업무에서 일어나는 일이고, 업무의 이력은
-- activity 하나다. 두 벌로 나누면 「이 업무에 무슨 일이 있었나」를 두 곳에서
-- 합쳐 읽어야 하고, 인계서 초안을 뽑는 코드도 두 곳을 알아야 한다.
--
-- ⚠ alter type ... add value 로 더한 값은 **같은 트랜잭션 안에서 쓸 수 없다.**
--   그래서 여기서는 값만 더하고, 그 값을 실제로 넣는 함수는 0017 에 둔다.
--   (plpgsql 함수 본문 안의 문자열은 만들 때 평가되지 않으므로 정의는 괜찮다)
-- -----------------------------------------------------------------------------

alter type activity_kind add value if not exists 'approval.submitted';
alter type activity_kind add value if not exists 'approval.signed';
alter type activity_kind add value if not exists 'approval.rejected';
alter type activity_kind add value if not exists 'approval.completed';
alter type activity_kind add value if not exists 'approval.withdrawn';

-- -----------------------------------------------------------------------------
-- 3. 결재유형 8종
--
-- 법정 용어를 그대로 쓴다. 「승인」이나 「검토자」 같은 사기업 낱말로 바꾸면
-- 공무원이 화면을 보고 무엇을 하는 칸인지 다시 배워야 한다.
-- -----------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'approval_kind') then
    create type approval_kind as enum (
      'draft',        -- 기안     문서를 만든 사람. 상신하는 순간 이 칸에 서명이 찍힌다
      'review',       -- 결재     중간결재자
      'final',        -- 최종결재 결재선의 마지막
      'delegated',    -- 전결     위임받아 대신 끝낸다. 이 칸이 찍히면 문서가 끝난다
      'acting',       -- 대결     결재권자 부재 시 대신 결재한다
      'concur_seq',   -- 순차협조 앞 순서가 끝나야 내 차례가 온다
      'concur_par',   -- 병렬협조 줄을 서지 않는다. 언제든 처리할 수 있다
      'post_report'   -- 사후보고 문서가 끝난 뒤에 보고한다
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'approval_state') then
    create type approval_state as enum (
      'drafting',     -- 기안 중  아직 기안자만 본다
      'in_progress',  -- 진행 중  결재선이 돌고 있다
      'completed',    -- 완결
      'rejected',     -- 반려
      'withdrawn'     -- 회수     기안자가 되가져갔다. 아무도 서명하기 전에만 가능하다
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. 결재 문서
--
-- 업무에 매달린다(work_id). 결재함은 이것을 모아 보는 화면일 뿐이고, 문서의
-- 집은 업무다. 브리티웍스가 결재를 별도 메뉴가 아니라 메일 업무 포털 안에
-- 넣어 둔 것과 같은 판단이다.
-- -----------------------------------------------------------------------------

create table if not exists approval (
  id            uuid primary key default gen_random_uuid(),
  work_id       uuid not null references work(id) on delete cascade,

  -- 별지 제2호서식이 담는 문서 갈래.
  form          text not null,

  -- 문서번호. 상신하는 순간 붙고 그 뒤로는 움직이지 않는다.
  --   HS-협조-20260808-0001
  doc_no        text unique,

  title         text not null,
  body          text not null default '',

  -- 보존연한(년). 「공공기록물 관리에 관한 법률 시행령」 제26조의 1·3·5·10·30년.
  -- 준영구·영구는 숫자가 아니라 이 칸에 담기지 않는다. 그 둘이 필요한 문서는
  -- 애초에 발신문서(별지 제1호서식)이고 온나라의 자리다.
  retention     smallint,

  -- 일반 / 대외비. 「비밀」은 이 시스템에 담지 않는다 — 비밀문서는 별도 관리
  -- 체계(보안업무규정)를 따르고, 그것을 흉내 내는 것이 가장 위험한 거짓말이다.
  security      text not null default 'normal',

  state         approval_state not null default 'drafting',
  drafter_id    uuid not null references profile(id),
  created_at    timestamptz not null default now(),

  -- 결재가 끝난 시각. 완결·반려·회수 모두 여기에 남는다.
  -- 「completed_at」이라 이름 붙이면 반려된 문서의 그 칸이 거짓말을 한다.
  closed_at     timestamptz,

  constraint approval_form_check
    check (form in ('report', 'plan', 'review', 'cooperation')),

  constraint approval_security_check
    check (security in ('normal', 'confidential')),

  constraint approval_retention_check
    check (retention is null or retention in (1, 3, 5, 10, 30)),

  -- 제목이 비어 있는 결재는 결재함에서 구분되지 않는다.
  -- 공백 판정을 낱말 부류([[:space:]])에 맡기지 않는 이유는 0015 에 적었다 —
  -- 어떤 글자를 공백으로 볼지는 DB 로케일이 정하고,
  -- 글자를 그대로 소스에 심으면 나중에 누가 하나를 지워도 아무도 모른다.
  -- 생김새가 아니라 코드포인트로 적는다.
  constraint approval_title_check
    check (
      title ~ '[^\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'
      and length(title) <= 200
    ),

  constraint approval_body_check
    check (length(body) <= 20000),

  -- 문서번호는 상신과 함께 태어난다. 기안 중인 문서에는 번호가 없고,
  -- 상신된 문서에는 반드시 있다.
  constraint approval_doc_no_check
    check ((state = 'drafting') = (doc_no is null)),

  -- 끝난 문서에만 끝난 시각이 있다.
  constraint approval_closed_at_check
    check ((state in ('completed', 'rejected', 'withdrawn')) = (closed_at is not null))
);

comment on table approval is
  '내부결재문서(시행규칙 별지 제2호서식). 발신문서는 담지 않는다 — 그건 온나라의 자리다.';
comment on column approval.doc_no is
  '상신 시각에 app.next_doc_no() 가 붙인다. 사람이 적는 칸이 아니다.';
comment on column approval.closed_at is
  '결재가 끝난 시각. 어떻게 끝났는지는 state 가 말한다(완결·반려·회수).';

-- -----------------------------------------------------------------------------
-- 5. 결재란
--
-- flex·네이버웍스·하이웍스 세 제품이 공통으로 쓰는 문법이다. 한 줄에 한 사람,
-- 왼쪽에서 오른쪽으로 올라간다.
-- -----------------------------------------------------------------------------

create table if not exists approval_step (
  id           uuid primary key default gen_random_uuid(),
  approval_id  uuid not null references approval(id) on delete cascade,
  seq          smallint not null,
  kind         approval_kind not null,
  approver_id  uuid not null references profile(id),

  -- 서명 당시의 직위를 글자로 박는다.
  --
  -- profile 을 조인해 그리면 인사이동 뒤에 옛 문서의 결재란이 바뀐다.
  -- 작년에 팀장으로 결재한 사람이 올해 과장이 되면, 작년 문서의 결재란이
  -- 「과장」으로 바뀌어 인쇄된다. 그건 문서 위조다.
  position     text not null,

  signed_at    timestamptz,
  rejected_at  timestamptz,

  -- 「의견 있음」 — 시행규칙 제4조. 서명 옆에 표시하고 본문 아래에 편다.
  opinion      text,

  unique (approval_id, seq),

  -- 한 사람이 한 문서에 두 칸을 갖지 않는다. 기안자가 곧 전결권자인 경우에도
  -- 칸은 하나다 — 온나라도 기안자를 결재선에 다시 넣지 않는다.
  unique (approval_id, approver_id),

  constraint approval_step_seq_check      check (seq >= 1),
  constraint approval_step_position_check check (length(btrim(position)) between 1 and 40),
  constraint approval_step_opinion_check  check (opinion is null or length(opinion) <= 500),

  -- 같은 칸에 서명과 반려가 함께 있을 수 없다.
  constraint approval_step_decision_check
    check (not (signed_at is not null and rejected_at is not null))
);

comment on table approval_step is
  '결재선 한 칸. 서명은 절차(public.sign_approval)로만 찍힌다 — UPDATE 권한 자체가 없다.';
comment on column approval_step.position is
  '서명 당시 직위. profile 을 조인하지 않는 이유는 인사이동이다.';

-- -----------------------------------------------------------------------------
-- 6. 인덱스
--
-- RLS 정책이 매 행마다 평가되므로 인덱스가 곧 성능이다(0001 의 같은 말).
-- -----------------------------------------------------------------------------

create index if not exists approval_work_idx     on approval (work_id, created_at desc);
create index if not exists approval_drafter_idx  on approval (drafter_id, created_at desc);
create index if not exists approval_state_idx    on approval (state);

-- 결재함 「대기」 — 내 칸 중 아직 처리하지 않은 것. 이 화면이 가장 자주 열린다.
create index if not exists approval_step_todo_idx
  on approval_step (approver_id)
  where signed_at is null and rejected_at is null;

create index if not exists approval_step_approver_idx on approval_step (approver_id);

-- 기안란은 한 문서에 하나뿐이다.
--
-- 검토에서 나온 것이다. unique (approval_id, approver_id) 는 **다른 사람** 이름으로
-- 기안란을 하나 더 만드는 것을 막지 못한다. 그러면 상신 절차의
-- `select ... where kind = 'draft'` 가 둘 중 아무거나 집어 서명하고, 남은 기안란은
-- 아무도 처리할 수 없는 칸이 되어 그 문서는 영원히 완결되지 않는다.
-- 부분 인덱스로 표 층에서 못박는다.
create unique index if not exists approval_step_one_draft_idx
  on approval_step (approval_id)
  where kind = 'draft';
