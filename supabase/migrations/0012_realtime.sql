-- =============================================================================
-- 일머리(Ilmeori) — 0012 실시간 공유 체계
--
-- 남이 고치면 즉시 보인다. 지금 누가 같이 보고 있는지 보인다.
--
-- ── 무엇을 보내는가 ─────────────────────────────────────────────────────────
--
-- 내용을 보내지 않는다. "이 업무에서 뭔가 바뀌었으니 다시 읽어라"라는 신호만
-- 보낸다. 업무 제목도, 문서 본문도, 파일 이름도, 대화 한 줄도 싣지 않는다.
--
-- 이유는 broadcast 의 권한 판정 방식 때문이다. 표의 RLS 정책은 행마다 평가되지만
-- broadcast 는 **채널에 들어올 때 한 번** 판정하고 끝난다. 행 단위 필터가 없으므로,
-- 페이로드에 넣은 것은 그 채널에 있는 모두에게 그대로 간다.
--   → realtime.broadcast_changes() 를 쓰지 않는 이유가 이것이다.
--     그 함수는 바뀐 행 전체(record/old_record)를 페이로드에 싣는다.
--
-- 그래서 화면에 실제로 보일 데이터는 언제나 서버 렌더가 RLS 를 통과해 가져온다.
-- **신호는 화면을 그리지 않는다. 그리는 것은 언제나 서버다.**
--
-- ── 누가 들을 수 있는가 ─────────────────────────────────────────────────────
--
-- 토픽 이름이 곧 권한 경계다.  work:<work.id>
--
-- realtime.messages 의 정책이 app.can_read_work() 를 부른다. 업무 화면을 여는
-- 판정과 **같은 함수**다. 업무를 볼 수 없는 사람은 웹소켓으로도 그 업무의
-- 신호를 받지 못하고, 접속자 목록에도 들어오지 못한다.
--
-- ── realtime 스키마에는 아무것도 만들지 않는다 ──────────────────────────────
--
-- Supabase 는 realtime 스키마를 잠가 두었다. create table/function 은 물론
-- alter table realtime.messages enable row level security 도 permission denied 로
-- 실패한다(이미 켜져 있다). 여기서 realtime 에 하는 일은 **정책 두 개**뿐이다.
--
--   ⚠ 검사 하네스(PGlite)에는 realtime 스텁이 들어 있다(verify.mjs 등 세 곳).
--     그 스텁 SQL 을 이 파일로 옮기면 로컬은 초록불인데 실물 배포가 죽는다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 토픽 이름 → 업무 id
--
-- 정책 안에서 맨몸으로 캐스팅하면(  split_part(realtime.topic(), ':', 2)::uuid  )
-- 토픽이 'lobby' 같은 값일 때 캐스트 예외가 나고 판정 질의 전체가 실패한다.
-- Postgres 는 and 의 평가 순서를 보장하지 않으므로 like 가드를 앞에 둬도 안전하지
-- 않다. 모양이 아니면 null 을 돌려주는 함수로 봉인한다.
--
-- app.can_read_work(null) 은 false 다(그런 업무가 없으므로). 그래서 모르는 토픽은
-- 자동으로 닫힌다 — 규칙을 한 군데 더 적지 않아도 된다.
-- -----------------------------------------------------------------------------
create or replace function app.topic_work_id(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_id text;
begin
  if p_topic is null or left(p_topic, 5) <> 'work:' then
    return null;
  end if;
  v_id := substring(p_topic from 6);
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_id::uuid;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 2. realtime.messages 정책 — 듣기와 접속자 표시
--
-- Realtime 은 채널에 들어오려는 사람의 권한을 이렇게 판정한다.
--   관리자 권한으로 topic·extension 만 채운 행을 하나 넣어 보고
--   → 그 사람의 역할로 select 가 되는지(듣기) / insert 가 되는지(쓰기) 확인하고
--   → 롤백한다.
--
-- 그래서 정책 조건에서 payload·event·private 칸을 참조하면 안 된다.
-- 판정용 행에는 그 칸들이 비어 있어 조용히 어긋난다. 봐도 되는 것은
-- realtime.topic() 과 extension 둘뿐이다.
--
-- extension 목록에 'broadcast' 가 반드시 있어야 한다. 접속자 표시만 쓸 생각이어도,
-- broadcast 의 읽기 판정이 false 면 채널 참가 자체가 거부된다.
-- -----------------------------------------------------------------------------

-- 듣기 — 이 업무를 볼 수 있는 사람만.
drop policy if exists work_topic_read on realtime.messages;
create policy work_topic_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and app.can_read_work(app.topic_work_id((select realtime.topic())))
  );

-- 쓰기 — 접속자 표시(presence)를 위해 필요하다.
--
-- postgres 를 함께 적는 이유: 아래 트리거는 security definer 라 소유자(postgres)
-- 역할로 realtime.messages 에 넣는다. 이 프로젝트의 postgres 에는 bypassrls 가
-- 없다(0004 주석 참조 — force rls 에 소유자가 막혔던 적이 있다). 역할을 적지
-- 않으면 신호가 조용히 사라진다. realtime.send() 는 실패를 예외로 올리지 않고
-- warning 한 줄만 남기기 때문에, 이 실수는 화면이 조용한 것과 구분되지 않는다.
--
-- 브라우저도 이 정책으로 broadcast 를 보낼 수 있다. 막지 않은 것은 판정 방식
-- 때문이다 — 쓰기만 따로 좁히면 채널 참가가 거부될 위험이 있고, 위조해 봤자
-- "다시 읽어라"가 한 번 더 갈 뿐이다(내용이 없으므로). 다시 읽은 화면은 여전히
-- RLS 를 통과한 것만 보여 준다.
drop policy if exists work_topic_write on realtime.messages;
create policy work_topic_write on realtime.messages
  for insert to authenticated, postgres
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and app.can_read_work(app.topic_work_id((select realtime.topic())))
  );

-- -----------------------------------------------------------------------------
-- 3. 신호를 보내는 트리거
--
-- 서버 액션이 아니라 DB 에 붙인다. 이력(activity)을 트리거가 남기는 것과 같은
-- 이유다 — 개발자가 빠뜨릴 수 없고, 앱을 거치지 않은 변경도 새어 나가지 않는다.
-- 액션 27개 중 하나에만 broadcast 호출을 빠뜨리면, 그 화면만 조용히 멈춘다.
--
-- 이력을 남기지 않는 변경(문서 항목 잠금·잠금 해제)도 여기서는 신호가 나간다.
-- 「○○○ 편집 중」이 상대 화면에 곧바로 뜨는 것이 이 기능의 핵심이라서다.
--
-- ⚠ for each row 여야 한다. for each statement 로 달면 new/old 가 없어
--   함수가 예외를 던지고, 그 예외가 **업무 트랜잭션 자체를 되돌린다.**
--   실시간이 안 되는 것으로 끝나지 않고 저장이 안 되는 사고가 된다.
-- -----------------------------------------------------------------------------
create or replace function app.broadcast_work_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_work_id uuid;
  v_kind    text := tg_argv[0];
begin
  -- 표마다 업무를 가리키는 칸이 다르다.
  --   work            → id
  --   대부분          → work_id
  --   doc_section     → document 를 거쳐야 한다 (아래 별도 함수)
  -- delete 에는 new 가 없고 insert 에는 old 가 없다.
  if tg_table_name = 'work' then
    v_work_id := coalesce(new.id, old.id);
  else
    v_work_id := coalesce(new.work_id, old.work_id);
  end if;

  if v_work_id is not null then
    perform realtime.send(
      jsonb_build_object(
        'kind',    v_kind,
        'work_id', v_work_id,
        'actor',   (select auth.uid()),
        'at',      to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      'work.touched',
      'work:' || v_work_id::text,
      true                                  -- private 채널로만 간다
    );
  end if;

  -- after 트리거의 반환값은 무시된다. 아무것도 바꾸지 않는다는 뜻으로 null.
  return null;
end
$fn$;

-- 문서 항목은 work_id 를 직접 들고 있지 않다. 문서를 한 번 거친다.
create or replace function app.broadcast_section_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_work_id uuid;
begin
  select d.work_id into v_work_id
  from public.document d
  where d.id = coalesce(new.document_id, old.document_id);

  if v_work_id is not null then
    perform realtime.send(
      jsonb_build_object(
        'kind',    'section',
        'work_id', v_work_id,
        'actor',   (select auth.uid()),
        'at',      to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      'work.touched',
      'work:' || v_work_id::text,
      true
    );
  end if;

  return null;
end
$fn$;

-- 페이로드에 actor 를 넣는 것에 대하여.
--   uuid 하나뿐이고, 그 사람이 무엇을 했는지는 들어 있지 않다. 받는 쪽은 이미
--   이 업무를 볼 수 있는 사람이고, 화면을 다시 읽으면 이력에서 이름까지 본다.
--   즉 새로 새는 것이 없다. 쓰는 곳은 하나다 — **내가 한 변경이면 다시 읽지
--   않는다.** 방금 저장하고 돌아온 화면을 한 번 더 부르지 않기 위해서다.

drop trigger if exists trg_work_broadcast on work;
create trigger trg_work_broadcast
  after update on work
  for each row execute function app.broadcast_work_touch('work');

drop trigger if exists trg_member_broadcast on work_member;
create trigger trg_member_broadcast
  after insert or update or delete on work_member
  for each row execute function app.broadcast_work_touch('member');

drop trigger if exists trg_document_broadcast on document;
create trigger trg_document_broadcast
  after insert or update or delete on document
  for each row execute function app.broadcast_work_touch('document');

drop trigger if exists trg_section_broadcast on doc_section;
create trigger trg_section_broadcast
  after insert or update or delete on doc_section
  for each row execute function app.broadcast_section_touch();

drop trigger if exists trg_comment_broadcast on comment;
create trigger trg_comment_broadcast
  after insert or update or delete on comment
  for each row execute function app.broadcast_work_touch('comment');

drop trigger if exists trg_attachment_broadcast on attachment;
create trigger trg_attachment_broadcast
  after insert or delete on attachment
  for each row execute function app.broadcast_work_touch('attachment');

-- -----------------------------------------------------------------------------
-- 4. 함수 실행 권한 — 0011 과 같은 규칙
--
-- 새로 만든 함수는 기본값이 PUBLIC EXECUTE 다. 0004 §3 의 회수 루프는 그때
-- 존재하던 함수만 돌았고, §2 의 기본권한 회수는 public 스키마에만 걸린다.
-- 여기서 명시하지 않으면 topic_work_id 는 authenticated 에게 **PUBLIC 을 통해서만**
-- 실행 권한을 얻는다. 나중에 0004 를 한 번 더 돌리는 것만으로 그 권한이 사라지고,
-- 그 순간 모든 채널 참가가 permission denied 로 죽는다.
-- (정책 평가는 평가하는 역할의 실행 권한을 검사한다 — 0004 §3 에 적힌 그 사고다)
-- -----------------------------------------------------------------------------
revoke all on function app.topic_work_id(text) from public, anon;
grant execute on function app.topic_work_id(text) to authenticated;

-- 트리거 함수는 아무도 직접 부를 수 없다(trigger functions can only be called as
-- triggers). 그래도 회수한다 — 다음 사람이 이 파일을 본보기로 삼기 때문이다.
revoke all on function app.broadcast_work_touch() from public, anon, authenticated;
revoke all on function app.broadcast_section_touch() from public, anon, authenticated;

-- 이력(activity)에는 달지 않는다. 위 표들이 바뀌면 이력도 같은 트랜잭션에서
-- 함께 쌓이므로, 달면 변경 한 번에 신호가 두 번 나간다.
--
-- 시드(supabase/seed/demo.sql)는 이 표들의 사용자 트리거를 끄고 넣었다 켠다.
-- 그래서 시드를 다시 채우는 동안에는 신호가 나가지 않는다 — 의도한 대로다.
