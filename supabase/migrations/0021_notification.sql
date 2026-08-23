-- =============================================================================
-- 일머리(Ilmeori) — 0021 알림
--
-- 설계: docs/plans/2026-08-23-쪽지-알림-design.md §4 · §7 · §8
--
-- ── 이 표의 한 문장 ─────────────────────────────────────────────────────────
--
--   **처리해야 사라지는 것은 알림이 아니다.**
--
-- 이 앱에는 「내가 움직여야 하는 것」을 모으는 자리가 이미 셋 있다 — 홈의
-- 히어로, 결재함의 「지금 내 차례」, 홈의 인계 알림. 알림창이 네 번째가 되면
-- 「그래서 어딜 봐야 하지」가 다시 생기고, 그것이 1차 심사에서 지적받은 그
-- 증상이다.
--
-- 그래서 담는 것은 **사건**뿐이다. 읽으면 끝나는 것.
--
--   mention           댓글에서 나를 불렀다
--   note              쪽지가 왔다 · 답장이 왔다
--   work_touched      내 업무가 움직였다
--   approval_decided  내가 올린 문서가 결재/반려됐다
--
-- 「지금 내 차례 결재」는 **여기 없다.** 그것은 상태다 — 읽었다고 사라지지
-- 않고 서명해야 사라진다. 알림에 넣으면 읽음 처리된 순간 목록에서 사라지는데
-- 일은 그대로 남는다. 모든 알림 시스템이 실패하는 지점이 거기다.
--
-- 넷째만 결재에서 온다. 상신은 상태지만 **반려는 사건**이기 때문이다 —
-- 결재함은 문서 목록일 뿐 「반려됐다」고 소리치지 않는다.
--
-- ── 왜 activity 와 다른 표인가 ──────────────────────────────────────────────
--
-- `activity` 는 append-only 감사 기록이고 스키마에 「사후 조작이 불가능하다」고
-- 적혀 있다. 알림은 **배달** 기록이다 — 읽으면 소멸해도 되는 것.
-- 한 표에 넣으면 감사 기록에 read_at 이 붙는다.
--
-- ── 소음이 이 기능을 죽인다 ─────────────────────────────────────────────────
--
-- activity 는 7갈래로 뛴다. 6명짜리 업무 하나가 하루에 알림 스무 줄을 만들면
-- 아무도 안 본다. 규칙 셋으로 자른다(app.notify).
--
--   ① 내가 한 일은 나에게 안 간다
--   ② 안 읽은 것이 있으면 묶는다 — count 를 올린다
--   ③ mention·note 는 안 묶는다 — 사람이 나를 부른 것은 한 건씩 다 보여야 한다
--
-- ── 지우지 않는다 ───────────────────────────────────────────────────────────
--
-- 정리 작업(스케줄러)을 붙이지 않는다. 실제로 아픈 것은 표 크기가 아니라 조회
-- 속도이고 그건 아래 색인 둘로 끝난다. 1,000명이 하루 5건씩 받아도 연 180만
-- 행이다. 화면이 상한을 걸고(드롭다운 10 · 목록 100) **그 사실을 적는다** —
-- 결재함이 이미 쓰는 규약이다.
-- =============================================================================

create type notification_kind as enum (
  'mention',
  'note',
  'work_touched',
  'approval_decided'
);

create table notification (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references profile(id) on delete cascade,
  kind         notification_kind not null,
  work_id      uuid references work(id) on delete cascade,
  /** comment.id · note.thread_id · approval.id — 앱이 kind 와 함께 주소를 만든다. */
  target_id    uuid,
  actor_id     uuid references profile(id),
  /** 사람이 읽는 한 줄. activity.summary 와 같은 규약이다. */
  summary      text not null,
  /** 묶인 개수. work_touched 만 1보다 커진다. */
  count        int not null default 1,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

comment on table notification is
  '알림. 사건만 담는다 — 처리해야 사라지는 것(내 차례 결재 등)은 여기 없다.';

-- 목록: 나에게 온 것을 최근 순으로.
create index notification_recipient_idx on notification (recipient_id, created_at desc);
-- 배지: 안 읽은 수 세기. 부분 색인이라 읽은 것이 아무리 쌓여도 안 커진다.
create index notification_unread_idx on notification (recipient_id)
  where read_at is null;

-- -----------------------------------------------------------------------------
-- 만드는 길은 이 함수 하나뿐이다
-- -----------------------------------------------------------------------------

create or replace function app.notify(
  p_recipient uuid,
  p_kind      notification_kind,
  p_work      uuid,
  p_target    uuid,
  p_summary   text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := (select auth.uid());
begin
  -- 마이그레이션·시드 경로에서는 알림을 만들지 않는다. 시드를 넣을 때마다
  -- 계정마다 수백 줄이 쌓이면 첫 화면이 소음으로 시작한다(0011 과 같은 판단).
  if me is null then
    return;
  end if;

  if p_recipient is null then
    return;
  end if;

  -- ① 내가 한 일은 나에게 안 간다.
  if p_recipient = me then
    return;
  end if;

  -- ② 안 읽은 것이 있으면 묶는다. ③ 사람이 부른 것은 안 묶는다.
  if p_kind = 'work_touched' then
    update public.notification
       set count = count + 1, created_at = now(), actor_id = coalesce(me, actor_id)
     where recipient_id = p_recipient
       and kind = 'work_touched'
       and work_id is not distinct from p_work
       and read_at is null;
    if found then
      return;
    end if;
  end if;

  insert into public.notification
    (recipient_id, kind, work_id, target_id, actor_id, summary)
  values
    (p_recipient, p_kind, p_work, p_target, me, p_summary);
end;
$$;

revoke execute on function app.notify(uuid, notification_kind, uuid, uuid, text)
  from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 어디서 생기는가
-- -----------------------------------------------------------------------------

-- ① 부름 — 한 건씩 다 간다.
create or replace function app.trg_mention_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w uuid := app.comment_work(new.comment_id);
  who text;
begin
  select btrim(p.name || ' ' || coalesce(p.position, '')) into who
  from public.profile p where p.id = (select auth.uid());

  perform app.notify(
    new.profile_id, 'mention', w, new.comment_id,
    format('%s 님이 대화에서 회원님을 불렀습니다.', coalesce(who, '누군가'))
  );
  return new;
end;
$$;

create trigger trg_mention_notify
  after insert on comment_mention
  for each row execute function app.trg_mention_notify();

-- ② 쪽지 — 받는 사람에게. 실 단위가 아니라 통 단위로 간다.
create or replace function app.trg_note_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who text;
begin
  select btrim(p.name || ' ' || coalesce(p.position, '')) into who
  from public.profile p where p.id = new.author_id;

  perform app.notify(
    new.recipient_id, 'note', new.work_id, new.thread_id,
    format('%s 님이 쪽지를 보냈습니다.', coalesce(who, '누군가'))
  );
  return new;
end;
$$;

create trigger trg_note_notify
  after insert on note
  for each row execute function app.trg_note_notify();

-- ③ 내 업무가 움직였다 — 참여자 전원에게, 묶어서.
--
-- activity 한 곳에만 건다. 표마다 트리거를 달면 갈래가 늘 때마다 빠뜨린다.
-- 요약은 activity 가 이미 사람이 읽는 한 줄로 만들어 두었으므로 그대로 쓴다.
create or replace function app.trg_activity_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
begin
  for m in
    select profile_id from public.work_member where work_id = new.work_id
  loop
    perform app.notify(m.profile_id, 'work_touched', new.work_id, null, new.summary);
  end loop;
  return new;
end;
$$;

create trigger trg_activity_notify
  after insert on activity
  for each row execute function app.trg_activity_notify();

-- ④ 내가 올린 문서가 결재/반려됐다.
--
-- 상신은 넣지 않는다 — 그것은 상태이고 결재함이 이미 말한다. 끝난 것만 사건이다.
create or replace function app.trg_approval_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.state = old.state then
    return new;
  end if;
  if new.state not in ('completed', 'rejected') then
    return new;
  end if;

  perform app.notify(
    new.drafter_id, 'approval_decided', new.work_id, new.id,
    case new.state
      when 'completed' then format('「%s」 결재가 끝났습니다.', new.title)
      else format('「%s」이(가) 반려되었습니다.', new.title)
    end
  );
  return new;
end;
$$;

create trigger trg_approval_notify
  after update on approval
  for each row execute function app.trg_approval_notify();

-- -----------------------------------------------------------------------------
-- 권한과 정책
-- -----------------------------------------------------------------------------

alter table notification enable row level security;

grant select, update on notification to authenticated;
-- 만드는 길은 app.notify 하나뿐이다. 사람이 남에게 알림을 꽂아 넣을 수 없다.
revoke insert, delete on notification from authenticated;

create policy notification_select on notification
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- 고칠 수 있는 것은 read_at 하나다. 칸 잠금은 아래 트리거가 본다.
create policy notification_update on notification
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create or replace function app.trg_notification_field_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- **사람이 고치는 것만 본다.**
  --
  -- 0011 처럼 `auth.uid() is null` 로 갈랐더니 앱 전체가 멈췄다. `app.notify`
  -- 가 묶기를 위해 `count` 를 올리는데, 그 함수는 security definer 라 세션의
  -- auth.uid() 를 그대로 들고 있다 — 즉 사람의 수정과 구별되지 않는다.
  -- 그래서 이 잠금이 **자기가 만든 길을 자기가 막았고**, 알림과 아무 상관 없는
  -- 업무·문서 수정까지 통째로 실패했다(activity 트리거가 알림을 만들다 터진다).
  --
  -- security definer 는 auth.uid() 는 안 바꾸지만 `current_user` 는 바꾼다.
  -- 사람의 요청은 언제나 authenticated 로 들어오고, app.notify 안에서는
  -- 이 함수의 소유자다. 그 차이로 가른다.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.recipient_id is distinct from old.recipient_id
     or new.kind      is distinct from old.kind
     or new.work_id   is distinct from old.work_id
     or new.target_id is distinct from old.target_id
     or new.actor_id  is distinct from old.actor_id
     or new.summary   is distinct from old.summary
     or new.count     is distinct from old.count
     or new.created_at is distinct from old.created_at
  then
    raise exception '알림은 읽음 표시 말고는 고칠 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$fn$;

create trigger trg_notification_field_guard
  before update on notification
  for each row execute function app.trg_notification_field_guard();
