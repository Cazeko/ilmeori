-- =============================================================================
-- 일머리(Ilmeori) — 0019 쪽지
--
-- 설계는 docs/plans/2026-08-23-쪽지-알림-design.md 에 있다. 여기에는 그 결정이
-- **DB 에서 어떻게 강제되는지**만 적는다.
--
-- ── 쪽지는 메신저가 아니다 ──────────────────────────────────────────────────
--
-- 이 제품이 파는 문장은 「평소 협업의 부산물이 곧 인수인계서가 된다」이다.
-- 카톡형 DM 을 넣는다는 것은 그 부산물이 빠져나가는 통로를 스스로 파는 일이다 —
-- DM 에 쌓인 "그거 왜 그렇게 했냐면요"는 인계서에 한 줄도 안 실린다.
--
-- 그래서 쪽지에 조건을 하나 건다. **work_id 가 not null 이다.**
-- 업무를 못 고르면 쪽지도 못 보낸다. 제약이 아니라 주장이다.
--
-- ── 쪽지가 하는 일: 부서 밖 사람에게 묻기 ───────────────────────────────────
--
-- 댓글은 공개 범위 안에서만 보인다. 참여자가 아닌 사람에게는 닿지 않는다.
-- 「부서 간 협업」을 판다면서 부서 밖 사람에게 말 걸 방법이 없었다.
--
-- 그 구멍을 메우면 논지가 깎이는 게 아니라 뒤집힌다 — 카톡으로 물으면 답이
-- 카톡에 남지만, 쪽지로 물으면 그 문답이 업무에 붙어 인계서까지 간다.
--
-- ── 그래서 쪽지는 비밀이 아니다 (읽는 사람을 셋으로 둔다) ───────────────────
--
-- 처음에는 SELECT 를 당사자 둘로만 잡았다. 그러면 위 문장이 **거짓이 된다** —
-- 주담당이 인계서를 뽑을 때 그 문답을 못 읽으니까. 그래서 셋으로 연다.
--
--   보낸 사람 · 받은 사람 · **그 업무를 읽을 수 있는 사람**
--
-- 즉 쪽지는 사적 대화가 아니라 **업무 기록**이다. 「공개로 남기기 곤란한 말」은
-- 애초에 쪽지의 용도가 아니라고 설계에서 잘라 두었으므로(§2) 어긋나지 않는다.
-- 반대 방향은 열지 않는다 — 받은 사람은 여전히 그 업무를 못 본다(§3).
-- 묻는 것과 열어 주는 것은 다른 일이다.
--
-- ── 고칠 수 있는 칸은 둘뿐이다 ──────────────────────────────────────────────
--
-- 0011 이 work 에 한 것과 같은 짜임이다. 정책은 「누가」만 보고 「어느 칸」은
-- 못 본다. 그래서 칸 잠금 트리거를 따로 둔다.
--
--   read_at     받은 사람만. null → 값 한 번뿐 (되돌지 않는다)
--   deleted_at  보낸 사람만. null → 값 한 번뿐
--
-- read_at 이 되돌지 않는 이유: 그 값이 **보낸 사람 화면에 보인다**(「보냄」 →
-- 「읽음」). 받은 사람이 되돌릴 수 있으면 보낸 사람이 보는 표시가 거짓이 된다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table note (
  id           uuid primary key default gen_random_uuid(),

  -- ★ 이 not null 이 이 파일의 전부다. 위 머리글 참조.
  work_id      uuid not null references work(id) on delete cascade,

  -- 첫 쪽지의 id. 답장이 같은 실에 묶인다. 비우고 넣으면 아래 트리거가
  -- 자기 id 를 채운다 — 뿌리 쪽지는 thread_id = id 다.
  thread_id    uuid not null,

  author_id    uuid not null references profile(id),
  recipient_id uuid not null references profile(id),

  body         text not null,
  read_at      timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),

  -- 자기 자신에게는 못 보낸다. 메모장이 아니다.
  constraint note_not_self check (author_id <> recipient_id),
  -- 댓글(240자)보다 넉넉하다. 맥락 없이 묻는 쪽지는 답을 못 받는다.
  constraint note_body_len check (char_length(body) between 1 and 1000)
);

comment on table note is
  '쪽지. 업무를 물고 다니는 문의이고 메신저가 아니다 — work_id 가 not null 인 이유가 그것이다.';

-- 쪽지함은 「나에게 온 것」을 최근 순으로 훑는다.
create index note_recipient_idx on note (recipient_id, created_at desc);
-- 보낸함, 그리고 「읽음」 표시를 보러 오는 길.
create index note_author_idx on note (author_id, created_at desc);
-- 업무 상세의 「바깥에 물어본 것」.
create index note_work_idx on note (work_id, created_at);
-- 실 하나를 통째로 펴는 길.
create index note_thread_idx on note (thread_id, created_at);

-- -----------------------------------------------------------------------------
-- 2. 실 묶기
-- -----------------------------------------------------------------------------

-- thread_id 를 비워 넣으면 자기 id 로 채운다(= 새 실의 뿌리).
-- 값을 주면 그 실에 붙는 답장이고, 아래 3번이 그 실에 낄 자격을 본다.
create or replace function app.trg_note_thread()
returns trigger
language plpgsql
as $$
begin
  if new.thread_id is null then
    new.thread_id := new.id;
  end if;
  return new;
end;
$$;

create trigger trg_note_thread
  before insert on note
  for each row execute function app.trg_note_thread();

-- -----------------------------------------------------------------------------
-- 3. 남의 실에 끼어들지 못한다
-- -----------------------------------------------------------------------------
--
-- 정책은 author_id = auth.uid() 만 본다. thread_id 는 안 본다. 그러면 업무를
-- 읽을 수 있는 사람이 남의 실 id 를 적어 넣어 그 실에 자기 글을 얹을 수 있다.
-- 받은 사람 화면에서는 그것이 원래 대화의 일부처럼 보인다.
--
-- 답장은 **그 실의 두 사람 사이에서만** 오간다. 뿌리 쪽지의 (보낸 사람, 받은
-- 사람) 쌍과 같은 쌍이어야 하고, 같은 업무여야 한다.
create or replace function app.trg_note_thread_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  root record;
begin
  -- 뿌리 쪽지다. 검사할 실이 없다.
  if new.thread_id = new.id then
    return new;
  end if;

  select author_id, recipient_id, work_id into root
  from public.note where id = new.thread_id;

  if root is null then
    raise exception '없는 쪽지 실입니다.' using errcode = 'foreign_key_violation';
  end if;

  if new.work_id is distinct from root.work_id then
    raise exception '쪽지 실은 업무를 옮겨 다닐 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 두 사람이 같아야 한다. 누가 보내고 누가 받는지는 뒤바뀔 수 있다 —
  -- 답장이 곧 방향이 뒤집힌 쪽지다.
  if not (
    (new.author_id = root.author_id and new.recipient_id = root.recipient_id)
    or (new.author_id = root.recipient_id and new.recipient_id = root.author_id)
  ) then
    raise exception '이 쪽지 실의 당사자가 아닙니다.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger trg_note_thread_guard
  before insert on note
  for each row execute function app.trg_note_thread_guard();

-- -----------------------------------------------------------------------------
-- 4. 칸 잠금 — read_at 과 deleted_at 만, 각자의 주인만
-- -----------------------------------------------------------------------------

create or replace function app.trg_note_field_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  me uuid := (select auth.uid());
begin
  -- 마이그레이션·시드 경로는 통과시킨다(0011 과 같은 판단).
  if me is null then
    return new;
  end if;

  if new.work_id      is distinct from old.work_id
     or new.thread_id is distinct from old.thread_id
     or new.author_id is distinct from old.author_id
     or new.recipient_id is distinct from old.recipient_id
     or new.body      is distinct from old.body
     or new.created_at is distinct from old.created_at
  then
    raise exception '쪽지는 보낸 뒤에 고칠 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.read_at is distinct from old.read_at then
    if old.read_at is not null then
      raise exception '읽음 표시는 되돌릴 수 없습니다.'
        using errcode = 'insufficient_privilege';
    end if;
    if me <> old.recipient_id then
      raise exception '받은 사람만 읽음으로 표시할 수 있습니다.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null then
      raise exception '이미 지운 쪽지입니다.'
        using errcode = 'insufficient_privilege';
    end if;
    if me <> old.author_id then
      raise exception '보낸 사람만 쪽지를 지울 수 있습니다.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$fn$;

create trigger trg_note_field_guard
  before update on note
  for each row execute function app.trg_note_field_guard();

-- -----------------------------------------------------------------------------
-- 5. 이력 — 무엇을 물었는지는 안 적는다
-- -----------------------------------------------------------------------------
--
-- activity.summary 는 그 업무를 읽을 수 있는 사람 전부가 본다. 쪽지 본문은
-- 그보다 좁게 열려 있으므로(당사자 + 업무 독자) 요약에 본문을 넣지 않는다.
-- 「누구에게 물었다」까지만 적는다.

-- ⚠ `alter type ... add value` 는 **같은 트랜잭션 안에서 그 값을 쓸 수 없다.**
--   여기서는 함수 본문에 문자열로만 있고(실행 시점에 캐스팅된다) 이 파일이 쪽지를
--   한 건도 넣지 않으므로 안전하다. 이 파일을 쪼개 돌리더라도 순서만 지키면 된다.
alter type activity_kind add value if not exists 'note.sent';
alter type activity_kind add value if not exists 'note.answered';

create or replace function app.trg_note_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who text;
begin
  select coalesce(p.name || ' ' || coalesce(p.position, ''), '상대') into who
  from public.profile p where p.id = new.recipient_id;

  if new.thread_id = new.id then
    perform app.log_activity(new.work_id, 'note.sent',
      format('%s 님에게 쪽지로 물었습니다.', btrim(who)),
      jsonb_build_object('note_id', new.id, 'thread_id', new.thread_id));
  else
    perform app.log_activity(new.work_id, 'note.answered',
      format('%s 님과의 쪽지에 답이 오갔습니다.', btrim(who)),
      jsonb_build_object('note_id', new.id, 'thread_id', new.thread_id));
  end if;
  return new;
end;
$$;

create trigger trg_note_activity
  after insert on note
  for each row execute function app.trg_note_activity();

-- -----------------------------------------------------------------------------
-- 6. 권한과 정책
-- -----------------------------------------------------------------------------

alter table note enable row level security;

grant select, insert, update on note to authenticated;
-- 지우는 길은 없다. deleted_at 에 시각을 적을 뿐이다 — 행을 지우면 지웠다는
-- 사실도 함께 사라진다(comment 와 같은 판단).
revoke delete on note from authenticated;

-- 읽는 사람 셋. 위 머리글 참조.
create policy note_select on note
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or app.can_read_work(work_id)
  );

-- 내가 이 실의 당사자인가. 답장할 자격을 여기서 본다.
--
-- 뿌리 쪽지를 넣을 때는 thread_id 가 아직 없는 id(= 자기 자신)이므로 언제나
-- false 다. 그래서 아래 정책에서 「새 실이면 업무를 읽을 수 있어야 하고,
-- 답장이면 그 실의 당사자여야 한다」가 자연스럽게 갈린다.
create or replace function app.in_note_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.note n
    where n.thread_id = p_thread_id
      and ((select auth.uid()) in (n.author_id, n.recipient_id))
  )
$$;

-- 보내는 사람은 언제나 자기 이름으로만 쓴다. 그 위에 조건이 하나 갈린다.
--
--   새 실   → **자기가 볼 수 있는 업무**여야 한다. 못 보는 업무를 걸어 두고
--             물으면 그 업무의 존재가 새어 나간다
--   답장    → **그 실의 당사자**면 된다
--
-- 답장에 can_read_work 를 걸었다가 RLS 시험에서 잡혔다. 받은 사람은 그 업무를
-- 못 보는 것이 이 설계의 핵심인데(§3), 그 조건을 답장에도 걸면 **물음을 받은
-- 사람이 답을 못 한다.** 기능의 존재 이유가 정책 한 줄에 막혀 있었다.
create policy note_insert on note
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (app.can_read_work(work_id) or app.in_note_thread(thread_id))
  );

-- 고칠 수 있는 칸은 4번 트리거가 정한다. 여기서는 「남의 쪽지는 아예 못 건드린다」
-- 까지만 본다. 업무 독자는 읽을 수만 있고 읽음·삭제 표시는 못 한다.
create policy note_update on note
  for update to authenticated
  using (
    author_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  )
  with check (
    author_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  );
