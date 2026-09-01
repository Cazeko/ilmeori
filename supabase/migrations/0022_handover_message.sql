-- =============================================================================
-- 일머리(Ilmeori) — 0022 인계자와 인수자가 인계 건에서 주고받는 문답
--
-- ── 왜 필요한가 ─────────────────────────────────────────────────────────────
--
-- 인터뷰가 말한 고통은 「전임자에게 20~30번 전화한다」이다(Q10). 이 제품은
-- 그 답을 「그 업무의 대화에 적으세요」로 두었고, 그건 지금도 맞다 — 개인
-- 쪽지로 오간 말은 두 사람에게서 끝나고, 다음 인계에서 또 스무 번 전화하게
-- 만드는 것이 정확히 그 구조다.
--
-- 그런데 실제로 물어보려면 이렇게 해야 했다.
--
--   인계서를 읽다 막힌다 → 인계 화면을 떠난다 → 그 업무를 찾는다
--   → 대화 탭을 연다 → 무엇을 묻고 싶었는지 **다시 적는다**
--
-- 클릭 수가 문제가 아니다(인계 화면에서 두 번이다). **질문이 생기는 자리와
-- 묻는 자리가 다른 것**이 문제다. 도착하면 맥락을 한 번 잃는다.
--
-- ── 그러면 쪽지와 무엇이 다른가 ─────────────────────────────────────────────
--
-- 쪽지는 **사람에게** 간다. 여기 쌓이는 글은 **인계 건에** 붙는다. 차이는 셋이다.
--
--   · 두 당사자가 **같은 것을 본다.** 한쪽만 가진 사본이 없다.
--   · 인계가 끝난 뒤에도 남는다 — 지우지도 고치지도 못한다.
--   · 다음에 이 인계서를 여는 사람이 문답을 그대로 읽는다.
--
-- 그래서 이 표는 「두 사람의 대화방」이 아니라 **인계서에 딸린 문답란**이다.
-- 이름을 `handover_message` 로 둔 것은 그 자리를 가리키는 가장 짧은 말이라서다.
--
-- ── 서식에는 안 실린다 ──────────────────────────────────────────────────────
--
-- 별지 제12호서식의 칸은 일곱이고 그건 법이 정한 것이다. 여기 오간 문답을
-- 여덟 번째 칸으로 끼워 넣으면 그건 이미 그 서식이 아니다(0014 와 같은 판단).
-- 화면과 한/글 파일 어디에도 이 글은 서식 안으로 들어가지 않는다.
--
-- ── 고치지도 지우지도 못한다 ────────────────────────────────────────────────
--
-- 0014 의 보충은 실행 전에 한해 지울 수 있다. 아직 아무 권한도 옮겨 가지 않은
-- 초안에서 한 줄을 빼는 것은 기록을 지우는 것이 아니라 오타를 고치는 것이기
-- 때문이다. 문답은 다르다 — **주고받은 말**이라 한쪽이 자기 줄만 지우면 남은
-- 쪽의 대답이 허공에 뜬다. 「다음 인계서가 이 문답을 읽는다」가 이 표의 존재
-- 이유인데, 반쪽만 남은 문답은 안 읽느니만 못하다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 알림 갈래 하나 늘리기
--
-- 있는 갈래를 빌려 쓰지 않는다. `note` 로 적으면 알림이 「쪽지가 왔다」고
-- 말하면서 쪽지함이 아닌 곳으로 보내고, `work_touched` 는 업무 하나를 가리키는
-- 갈래라 인계 건에는 가리킬 업무가 없다(여러 건이다). 알림이 거짓말을 하느니
-- 갈래를 하나 더한다.
--
-- 이 값을 **같은 트랜잭션 안에서 쓰지 않는다.** 아래 트리거 함수는 문자열
-- 리터럴로 들고 있다가 실행할 때 풀므로, 정의 시점에는 이 값이 필요 없다.
-- -----------------------------------------------------------------------------

alter type notification_kind add value if not exists 'handover_message';

-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists handover_message (
  id          uuid primary key default gen_random_uuid(),
  handover_id uuid not null references handover(id) on delete cascade,
  author_id   uuid not null references profile(id),
  body        text not null,
  created_at  timestamptz not null default now(),

  -- 0014 와 **같은 판정**이다. 걷어낼 문자를 나열하지 않고 「눈에 보이는 글자가
  -- 하나라도 있는가」로 묻는다 — 나열하면 반드시 빠진다(전각 공백 U+3000,
  -- 붙여넣기로 들어오는 nbsp U+00A0, BOM U+FEFF).
  --
  -- 상한은 앱(HANDOVER_MESSAGE_MAX)과 같은 값이다. 한쪽만 있으면 반드시 어긋난다.
  -- 문답 한 줄에 1000자는 넉넉하다 — 그보다 길어질 말이면 업무의 대화에 적고
  -- 여기서는 그 업무를 가리키는 편이 맞다.
  constraint handover_message_body_check check (
    body ~ '[^[:space:] ﻿]' and length(body) <= 1000
  )
);

comment on table handover_message is
  '인계 건에 딸린 문답. 인계자와 인수자만 읽고 쓰며, 별지 제12호서식에는 실리지 않는다.';

comment on column handover_message.created_at is
  '적은 시각. 고치는 길이 없으므로 이 값은 언제나 사실이다.';

create index if not exists handover_message_handover_id_created_at_idx
  on handover_message (handover_id, created_at);

-- -----------------------------------------------------------------------------
-- 2. 권한과 정책
--
-- 0005 의 이벤트 트리거가 새 표에 RLS 를 자동으로 켜지만 여기서도 명시한다.
-- 자동에 기대면 그 트리거가 사라진 환경에서 이 표만 조용히 열린다.
-- -----------------------------------------------------------------------------

alter table handover_message enable row level security;
alter table handover_message force row level security;

grant select, insert on handover_message to authenticated;

-- 고치는 길도 지우는 길도 두지 않는다. 정책은 실수로 열릴 수 있고 권한은 그렇지 않다.
revoke update, delete on handover_message from authenticated;
revoke all on handover_message from anon;

-- 읽기는 당사자 둘. 인계 문서를 볼 수 있는 사람과 정확히 같은 집합이다
-- (handover_select 와 같은 조건) — 문답만 더 넓게 열리면 안 된다.
drop policy if exists handover_message_select on handover_message;
create policy handover_message_select on handover_message
  for select to authenticated
  using (exists (
    select 1 from handover h
    where h.id = handover_message.handover_id
      and (h.from_profile_id = (select auth.uid())
           or h.to_profile_id = (select auth.uid()))
  ));

-- 쓰기도 당사자 둘. **0014 와 갈리는 자리다** — 보충은 인계자만 쓰지만
-- 문답은 양쪽이 쓴다. 묻는 사람이 인수자이기 때문이다.
--
-- 그리고 **완료된 뒤에도 쓸 수 있다.** 0011 의 잠금(trg_lock_completed_handover)이
-- 지키는 것은 인계서의 내용이고, 문답은 서식에 실리지 않는다. 오히려 인계가
-- 끝난 다음이 물어볼 일이 가장 많은 때다 — 그때 닫으면 이 표가 있을 이유가 없다.
drop policy if exists handover_message_insert on handover_message;
create policy handover_message_insert on handover_message
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from handover h
      where h.id = handover_message.handover_id
        and (h.from_profile_id = (select auth.uid())
             or h.to_profile_id = (select auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- 3. 한 인계 건에 쌓을 수 있는 수
--
-- 앱에도 같은 상한이 있다(HANDOVER_MESSAGE_LIMIT). 앱 쪽은 넘겼을 때 사용자에게
-- 읽을 수 있는 말을 해 주기 위한 것이고, 실제로 막는 것은 여기다 — 서버 액션은
-- 폼을 거치지 않고 부를 수 있고, 정책에 걸린 삽입은 오류가 아니라 0행으로
-- 조용히 끝나므로 정책으로는 이 판정을 할 수 없다.
--
-- 상한이 없으면 한쪽이 상대의 화면을 못 쓰게 만들 수 있고, 지우는 길이 없으므로
-- 되돌릴 수도 없다. 200줄이면 실제 문답에는 넉넉하다(0014 의 30 보다 큰 이유는
-- 저것이 문서에 실리는 문단이고 이것은 주고받는 말이기 때문이다).
-- -----------------------------------------------------------------------------

create or replace function app.trg_handover_message_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.handover_message
  where handover_id = new.handover_id;

  if v_count >= 200 then
    raise exception '이 인계의 문답을 더 담을 수 없습니다. 한 건에 200개까지입니다.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$fn$;

revoke all on function app.trg_handover_message_limit() from public, anon, authenticated;

drop trigger if exists trg_handover_message_limit on handover_message;

create trigger trg_handover_message_limit
  before insert on handover_message
  for each row execute function app.trg_handover_message_limit();

-- -----------------------------------------------------------------------------
-- 4. 알림 — 상대에게, 한 건씩
--
-- 묶지 않는다. 0021 이 적어 둔 규칙 그대로다 — 「사람이 나를 부른 것은 한 건씩
-- 다 보여야 한다」. 인계 문답은 언제나 상대가 나에게 하는 말이므로 부름과 같다.
--
-- work_id 는 null 이다. 인계는 업무 여럿을 한꺼번에 넘기는 일이라 가리킬 업무가
-- 하나로 정해지지 않는다. **없는 것을 아무거나 골라 적지 않는다** — 알림을
-- 누르면 인계 화면으로 간다(src/lib/notification.ts).
-- -----------------------------------------------------------------------------

create or replace function app.trg_handover_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  other uuid;
  who   text;
begin
  -- 받을 사람은 이 인계의 **반대편**이다.
  select case when h.from_profile_id = new.author_id
              then h.to_profile_id
              else h.from_profile_id
         end
    into other
  from public.handover h
  where h.id = new.handover_id;

  select btrim(p.name || ' ' || coalesce(p.position, '')) into who
  from public.profile p where p.id = new.author_id;

  perform app.notify(
    other, 'handover_message', null, new.handover_id,
    format('%s 님이 인계·인수 문답에 글을 남겼습니다.', coalesce(who, '누군가'))
  );
  return new;
end
$fn$;

revoke all on function app.trg_handover_message_notify() from public, anon, authenticated;

drop trigger if exists trg_handover_message_notify on handover_message;

create trigger trg_handover_message_notify
  after insert on handover_message
  for each row execute function app.trg_handover_message_notify();
