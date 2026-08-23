-- =============================================================================
-- 일머리(Ilmeori) — 0020 댓글에서 사람 부르기
--
-- 설계: docs/plans/2026-08-23-쪽지-알림-design.md §5「멘션」
--
-- ── 왜 표를 하나 두는가 ─────────────────────────────────────────────────────
--
-- `comment.body` 에 `@김서연` 이라고 적고 읽을 때 파싱하는 길도 있다. 두 가지가
-- 깨진다 — 김씨가 둘이면 누구인지 모르고, 본문을 고치면 부른 사람이 조용히
-- 바뀐다. 부른 것은 **사실**이므로 사실대로 저장한다.
--
-- 그리고 이 표가 알림(0021)의 입력이 된다. 본문을 훑어 알림을 만들면 같은
-- 파싱을 두 곳에서 하게 되고, 두 벌은 반드시 어긋난다.
--
-- ── 부를 수 있는 사람은 그 업무의 참여자다 ──────────────────────────────────
--
-- `can_read_work` 로 열지 않는다. 그 함수는 전 직원 공개(city) 업무에서 **전
-- 직원**을 통과시키므로, 부를 수 있는 사람이 1,700명이 된다. 부른다는 것은
-- 「당신이 이 일에 관여한다」는 말이고, 그 말이 맞는 범위는 참여자다.
--
-- 화면도 참여자만 보여 준다(comment-thread 의 mention-box). DB 와 화면이 같은
-- 규칙을 말하므로 어긋날 자리가 없다.
--
-- ── 지운 댓글의 부름은 어떻게 되는가 ────────────────────────────────────────
--
-- 남는다. 댓글 삭제는 `deleted_at` 에 시각을 적는 것이라 행이 그대로 있고,
-- 이 표는 그 행에 매달린다. 「부른 적 없다」와 「부른 기록이 없다」는 다른
-- 말이다(comment 삭제 주석과 같은 판단).
-- =============================================================================

create table comment_mention (
  comment_id uuid not null references comment(id) on delete cascade,
  profile_id uuid not null references profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);

comment on table comment_mention is
  '댓글에서 부른 사람. 본문 파싱이 아니라 고른 사실을 저장한다 — 동명이인과 본문 수정 때문이다.';

-- 「나를 부른 것」을 최근 순으로 찾는 길. 알림(0021)이 이 색인을 탄다.
create index comment_mention_profile_idx on comment_mention (profile_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 보조 함수
-- -----------------------------------------------------------------------------

-- 이 사람이 그 업무의 참여자인가. can_read_work 와 달리 **auth.uid() 를 안
-- 본다** — 부르는 사람이 아니라 불리는 사람을 재기 때문이다.
create or replace function app.is_work_member(p_work_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.work_member m
    where m.work_id = p_work_id and m.profile_id = p_profile_id
  )
$$;

-- 이 댓글이 매달린 업무. 정책 안에서 comment 를 직접 읽으면 comment 의 정책이
-- 또 걸려 판정이 두 겹이 된다.
create or replace function app.comment_work(p_comment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select work_id from public.comment where id = p_comment_id
$$;

-- 이 댓글을 내가 썼는가.
create or replace function app.is_comment_author(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.comment c
    where c.id = p_comment_id and c.author_id = (select auth.uid())
  )
$$;

-- -----------------------------------------------------------------------------
-- 권한과 정책
-- -----------------------------------------------------------------------------

alter table comment_mention enable row level security;

grant select, insert on comment_mention to authenticated;
-- 고치는 길도 지우는 길도 없다. 부른 것은 사실이고 사실은 안 바뀐다.
-- (댓글 자체를 지우면 그 사실은 comment.deleted_at 에 남는다)
revoke update, delete on comment_mention from authenticated;

-- 댓글을 볼 수 있으면 누가 불렸는지도 본다. 부름은 대화의 일부다.
create policy comment_mention_select on comment_mention
  for select to authenticated
  using (app.can_read_work(app.comment_work(comment_id)));

-- 부르는 것은 **글쓴이만**, 그리고 **참여자만** 부를 수 있다.
create policy comment_mention_insert on comment_mention
  for insert to authenticated
  with check (
    app.is_comment_author(comment_id)
    and app.is_work_member(app.comment_work(comment_id), profile_id)
  );
