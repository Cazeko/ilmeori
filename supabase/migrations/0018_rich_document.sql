-- =============================================================================
-- 일머리(Ilmeori) — 0018 서식 문서
--
-- 문서 한 벌이 「항목 + 평문」에서 「블록 배열」이 된다. 문단마다 자기가 무엇인지
-- 알고 있고(제목·큰항목·글머리표·표·근거), 글자마다 서식이 붙는다.
-- 저장되는 모양의 명세는 src/lib/editor/model.ts 에, 편집 신호의 명세는
-- src/lib/editor/wire.ts 에 있다. 이 파일은 그 둘을 DB 쪽에서 받는다.
--
-- ── 이 파일에서 제일 중요한 것은 2절이다 ───────────────────────────────────
--
-- 편집기는 **몇 초마다 자동 저장한다.** 0003·0006·0009 의 이력 트리거와 0012 의
-- broadcast 트리거는 「사람이 저장 단추를 누른다」를 전제로 만든 것이다. 칸만
-- 더하고 그대로 두면 업무 이력이 「문서를 고쳤습니다」로 뒤덮여 인수인계에
-- 쓸모없어지고, 그 업무를 열어 둔 사람 전원의 화면이 몇 초마다 다시 그려진다.
-- 그래서 이 파일의 절반은 **얼마나 자주 남길 것인가**에 대한 것이다.
-- 없애는 쪽으로 가면 반대편 낭떠러지가 있다 — 본문을 누가 언제 고쳤는지가
-- 감사에서 통째로 사라진다. 2절이 그 사이를 어디에 두었는지 적는다.
--
-- ── 0012 의 규칙에 예외를 하나 낸다 ────────────────────────────────────────
--
-- 0012 는 「신호에 내용을 싣지 않는다」고 못박았다. doc:<문서> 채널은 그 규칙의
-- 명시적 예외다 — 글자 단위로 합치려면 글자를 보내는 수밖에 없다. 예외의 값을
-- 치르는 방법(권한을 열람이 아니라 **편집**으로 좁히고, 주기적 재합류로 시한을
-- 건다)은 wire.ts 머리말에 적혀 있다. 이 파일은 그중 권한을 좁히는 쪽을 세운다.
--
--   ⚠ 검사 하네스(PGlite)에는 realtime 스텁이 따로 있다(supabase/realtime-stub.mjs).
--     0012 머리말과 같은 경고다 — 그 스텁 SQL 을 이 파일로 옮기면 로컬은
--     초록불인데 실물 배포가 permission denied 로 죽는다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. document 표에 본문을 담는다
--
-- doc_section 을 지우지 않는다. 서식 문서로 옮기는 것은 되돌릴 수 없고(블록에서
-- 항목 경계를 복원할 방법이 없다), 옮긴 결과가 마음에 들지 않는 사람이 돌아갈
-- 자리가 있어야 한다. 그래서 항목은 **얼어붙은 안전망**으로 남는다.
-- (src/lib/actions/rich-doc.ts 의 convertToRichDoc 이 같은 약속을 앱 쪽에서 지킨다)
--
-- 크기 제한을 DB 에 거는 이유. 편집기가 폭주하면(붙여넣기 한 번이 수천 블록이 된다)
-- 서버 액션의 검사만으로는 늦다 — 액션을 거치지 않는 요청이 PostgREST 로 그대로
-- 들어올 수 있고, 그때 막는 것은 여기뿐이다. 2MB 는 model.ts 의 상한
-- (블록 2000개 × 문단당 20000자)보다 훨씬 앞에서 걸린다. 먼저 걸리는 쪽이 DB 라야
-- 「저장했습니다」라고 말한 뒤에 데이터가 없는 상태가 생기지 않는다.
-- -----------------------------------------------------------------------------

alter table document
  add column if not exists blocks            jsonb,
  add column if not exists blocks_rev        bigint not null default 0,
  add column if not exists blocks_updated_by uuid references profile(id),
  add column if not exists blocks_updated_at timestamptz;

comment on column document.blocks is
  '서식 문서의 본문(블록 배열). null 이면 아직 「항목 + 평문」 문서다. '
  '모양은 DB 가 보장하지 않는다 — 읽는 쪽이 반드시 parseRichDoc() 를 거친다.';

comment on column document.blocks_rev is
  '저장할 때마다 1 오른다. 늦게 저장한 사람이 앞사람 글을 통째로 덮어쓰는 것을 '
  '이 값으로 막는다(4절).';

-- 이미 걸려 있으면 다시 만든다. 이 파일을 두 번 돌려도 같은 상태여야 한다.
alter table document drop constraint if exists document_blocks_size;
alter table document add constraint document_blocks_size
  check (blocks is null or pg_column_size(blocks) < 2 * 1024 * 1024);

-- blocks_updated_by 를 트리거로 강제하지 않는다.
-- 위조하려면 이미 편집 권한이 있어야 하는데, 그 사람은 blocks 자체를 마음대로 쓸 수
-- 있다. 즉 새로 새는 것이 없다. doc_section.updated_by 와 같은 층위이고, 규칙을
-- 한 벌 더 만들면 자동 저장마다 도는 트리거만 한 겹 늘어난다.

-- -----------------------------------------------------------------------------
-- 2. 자동 저장이 이력과 신호를 밀어내지 않게
--
-- ── 2-1. 활동 이력 — 없애는 것이 아니라 한 번으로 묶는다 ───────────────────
--
-- document 에 걸린 기존 이력 트리거는 둘이고, 둘 다 blocks 만 바뀐 UPDATE 에서는
-- 아무것도 남기지 않는다(읽고 확인했다).
--
--   0003 trg_document_activity  after insert or delete — UPDATE 에 아예 걸려 있지 않다
--   0009 trg_document_updated   after update 지만 첫 줄이
--                               `if new.title is not distinct from old.title then return new`
--
-- doc_version(문서 이력 스냅샷)도 마찬가지다. 판을 만드는 것은 0003·0006 의
-- trg_section_version 이고 그것은 doc_section 의 UPDATE 에만 걸린다. 그래서
-- **rich-doc.ts 는 저장할 때 doc_section 을 건드리지 않는다** — 평문을 항목에
-- 되받아 적으면 자동 저장 한 번마다 doc_version 한 판과 activity 한 줄이 쌓인다.
-- 이 파일이 막으려는 폭주가 정확히 그것이다.
--
-- 여기까지가 처음 판단이었고, 그대로 두었더니 반대쪽으로 넘어가 있었다.
-- 서식 문서로 옮긴 뒤로는 **본문을 누가 언제 고쳤는지가 이력에서 통째로 사라진다.**
-- 자동 저장 200회를 돌려 보면 activity·doc_version·신호가 모두 0이고, 남는 것은
-- blocks_updated_by/at 한 쌍(마지막 저장자)뿐이다. 0009 는 「이력은 사람이
-- 남기기로 결정해서 남는 것이 아니라 데이터가 바뀌면 DB가 반드시 남긴다」로
-- 시작한다. 그 말에 예외가 있으면 말이 아니라 광고다. 저장이 잦다는 것은
-- **덜 남길 이유**이지 한 줄도 남기지 않을 이유가 아니다.
--
-- 그래서 0013 이 열람 로그에 쓴 방법을 그대로 가져온다 — **10분을 한 번으로 센다.**
-- 하루 여덟 시간 편집이 11,520줄이 아니라 48줄이 된다. 사람이 읽는 이력에서
-- 「오전 내내 이 문서를 고쳤다」는 그 해상도면 충분하고, 그보다 잘게 남기면
-- 그건 이력이 아니라 로그다. 잘게 남긴 로그는 인계서에서 아무도 읽지 않는다.
--
--   ⚠ 함정 하나. 이 판정의 exists 는 security definer 함수 안에서 돈다. activity 는
--     force rls 이고 0002 의 select 정책은 to authenticated 뿐이라, 그대로 두면
--     **언제나 0행**이 되어 묶기가 조용히 죽고 자동 저장마다 한 줄이 쌓인다.
--     0013 이 access_log 에서 겪은 그 함정이다. 정책을 한 줄 더한다.
--
-- 어긋나면 빨간불이 켜지도록 supabase/rls.test.mjs 에 세 가지를 못박아 두었다 —
-- 「연달아 저장해도 이력은 한 줄」·「제목 변경은 지금까지처럼 남는다」·
-- 「10분이 지나면 다시 한 줄」.
-- -----------------------------------------------------------------------------

-- 0013 §머리말과 같은 이유다. postgres 역할은 애플리케이션이 쓰지 않는다 —
-- 서버 코드는 언제나 사용자 세션으로 붙는다. 여기서 여는 범위는 아래 함수가
-- 이미 하고 있는 일(자기가 방금 쓸 이력이 이미 있는지 보기) 안쪽이다.
drop policy if exists activity_select_definer on activity;
create policy activity_select_definer on activity
  for select to postgres using (true);

create or replace function app.trg_document_blocks_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- 항목 문서가 서식 문서가 되는 순간은 한 번뿐인 사건이라 창으로 묶지 않는다.
  -- 이 한 줄이 없으면 인계서에서 「항목이 왜 여기서 멈춰 있는가」의 답이 사라진다.
  if old.blocks is null and new.blocks is not null then
    perform app.log_activity(
      new.work_id, 'document.updated',
      format('문서 「%s」%s 서식 문서로 옮겼습니다',
             new.title, app.josa(new.title, '을', '를')),
      jsonb_build_object('document_id', new.id, 'blocks', true, 'converted', true));
    return new;
  end if;

  -- 같은 사람이 같은 문서를 10분 안에 이어서 고친 것은 한 번의 편집으로 본다.
  -- actor 가 없는 경로(서비스 롤)도 자기들끼리 묶이도록 is not distinct from 이다.
  if exists (
    select 1 from public.activity a
    where a.work_id  = new.work_id
      and a.actor_id is not distinct from (select auth.uid())
      and a.kind     = 'document.updated'
      and a.detail ->> 'blocks'      = 'true'
      and a.detail ->> 'document_id' = new.id::text
      and a.created_at > now() - interval '10 minutes'
  ) then
    return new;
  end if;

  perform app.log_activity(
    new.work_id, 'document.updated',
    format('문서 「%s」의 본문을 고쳤습니다', new.title),
    jsonb_build_object('document_id', new.id, 'blocks', true));

  return new;
end
$fn$;

-- 판정을 WHEN 절에만 둔다. 함수 안에 같은 조건을 한 번 더 적으면 두 벌이 되고,
-- 두 벌은 반드시 어긋난다(0002 원칙 3). 대신 이 함수는 **이 트리거 전용**이다 —
-- WHEN 없이 다른 곳에 달면 제목만 바꾼 UPDATE 에도 본문 이력이 남는다.
drop trigger if exists trg_document_blocks_activity on document;

create trigger trg_document_blocks_activity
  after update on document
  for each row
  when (new.blocks_rev is distinct from old.blocks_rev)
  execute function app.trg_document_blocks_activity();

revoke all on function app.trg_document_blocks_activity() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2-2. broadcast — 갈래를 나누지 않고 아예 보내지 않는다
--
-- 0012 의 trg_document_broadcast 는 document 의 모든 UPDATE 에 신호를 쏜다.
-- work:<업무> 토픽의 신호 한 건은 「화면을 통째로 다시 읽어라」는 뜻이고
-- (src/components/work/work-live.tsx), 자동 저장은 몇 초마다다.
--
-- 갈래를 새로 만들어(kind='blocks') 보내는 쪽도 생각했지만 소용이 없다.
-- work-live.tsx 는 **갈래를 못 읽은 신호도 한 건으로 세어** 화면을 다시 부른다
-- (모르는 갈래를 조용히 버리면 「변경 N건」이 실제보다 작아지기 때문이다 —
-- 그쪽이 옳다). 즉 신호를 보내는 한 화면은 다시 그려진다.
--
-- 그래서 blocks 만 바뀐 UPDATE 에서는 신호를 내지 않는다. **doc: 채널에 들어와
-- 있는 사람끼리는** 이미 글자 단위로 서로를 보고 있으므로, 그 사람들에게 저장은
-- 「채널에 이미 반영된 것을 굳히는 일」이고 신호를 한 번 더 낼 이유가 없다.
--
-- 문제는 그 채널 밖이다. 잃는 것과 얻는 것을 정직하게 적어 둔다.
--   잃는 것 ① 편집 권한이 없는 열람자의 화면에는 자동 저장이 즉시 반영되지 않는다.
--              (doc: 채널은 편집자만 들어온다. 3절) 열람자는 새로고침하거나,
--              대화·첨부·항목 등 다른 신호에 묻어 최신본을 본다.
--   잃는 것 ② **스크립트 없이 문단을 고치는 길(src/lib/actions/rich-doc-blocks.ts)의
--              저장도 조용해진다.** 그 길은 같은 칸(document.blocks)에 쓰면서도
--              doc: 채널에는 아예 들어오지 않는다 — 그 채널은 브라우저가 돌아야
--              열린다. 그래서 열려 있는 서식 편집기는 그 문단 수정을 **알 방법이
--              없고**, 지금 그 사이를 막는 것은 blocks_rev 하나뿐이다.
--              무JS 쪽은 판이 밀리면 저장을 포기하지만(rich.stale), 편집기 쪽은
--              판을 맞춰 다시 저장하므로 그 문단 수정이 덮인다.
--              ⇒ 사람에게 그 사실을 말하는 것으로 메운다. feedback.ts 의
--                rich.stale_retry 가 「함께 편집 중이 아닌 사람이 고친 곳은 이
--                화면에 없으니 새로고침해서 확인하라」고 적는다. 신호를 켜도
--                편집기는 남의 문단을 합칠 수단이 없으므로(CRDT 밖에서 온 값이다)
--                **켜는 것으로는 이 구멍이 메워지지 않는다.** 진짜로 메우려면
--                무JS 저장도 CRDT 연산으로 들어와야 하고, 그건 이 판의 일이 아니다.
--   얻는 것 — 같은 업무를 열어 둔 사람의 화면이 몇 초마다 튀지 않는다. 그리고
--             0013 이 한 번으로 묶어 둔 열람 로그가 자동 저장마다 다시 밀리지 않는다.
--
-- 판정을 blocks 값이 아니라 **blocks_rev** 로 하는 이유가 둘 있다.
--   1) 싸다. blocks 를 비교하면 자동 저장마다 최대 2MB 를 두 번 읽어야 한다.
--   2) 칸을 새로 더했을 때 안전한 쪽으로 틀린다. 새 칸이 바뀌면 blocks_rev 는
--      그대로이므로 신호가 **나간다** — 빠뜨려서 화면이 조용히 멈추는 쪽보다 낫다.
--
-- 나머지 두 조건은 조용해지면 안 되는 변경들이다.
--   · 제목    — 한 문장으로 제목과 본문을 같이 고치는 요청이 언젠가 들어와도
--               문서 이름 변경은 남의 화면에 보여야 한다.
--   · 첫 전환 — 항목 문서가 서식 문서가 되는 순간(convertToRichDoc)은 화면이
--               통째로 달라지는 변경이다. 이때 blocks_rev 는 0에서 1로 오르므로
--               위 조건만으로는 조용히 지나간다. `is null` 검사는 널 비트만 보므로
--               2MB 를 읽지 않는다 — 자동 저장 경로에 값이 붙지 않는다.
-- -----------------------------------------------------------------------------

drop trigger if exists trg_document_broadcast on document;

create trigger trg_document_broadcast
  after insert or delete on document
  for each row execute function app.broadcast_work_touch('document');

drop trigger if exists trg_document_broadcast_update on document;

create trigger trg_document_broadcast_update
  after update on document
  for each row
  when (
    new.blocks_rev is not distinct from old.blocks_rev
    or new.title is distinct from old.title
    or (old.blocks is null and new.blocks is not null)
  )
  execute function app.broadcast_work_touch('document');

-- -----------------------------------------------------------------------------
-- 3. doc:<문서> 채널 — 편집자만 들어온다
--
-- 0012 §1 과 **같은 방어 방식**이다. 정책 안에서 맨몸으로 캐스팅하면
-- (  split_part(realtime.topic(), ':', 2)::uuid  ) 토픽이 'lobby' 같은 값일 때
-- 캐스트 예외가 나고 판정 질의 전체가 실패한다. Postgres 는 and 의 평가 순서를
-- 보장하지 않으므로 like 가드를 앞에 둬도 안전하지 않다. 모양이 아니면 null 을
-- 돌려주는 함수로 봉인한다.
--
-- app.can_edit_document(null) 은 false 다(그런 문서가 없으므로). 그래서 모르는
-- 토픽은 자동으로 닫힌다. 'work:...' 토픽도 여기서는 null 로 떨어지므로, 아래
-- 정책이 늘어나도 0012 의 판정이 넓어지지 않는다 — 두 정책은 서로 겹치지 않는다.
-- (같은 명령의 permissive 정책은 OR 로 합쳐진다. 겹치면 넓어진다)
-- -----------------------------------------------------------------------------

create or replace function app.topic_document_id(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_id text;
begin
  if p_topic is null or left(p_topic, 4) <> 'doc:' then
    return null;
  end if;
  v_id := substring(p_topic from 5);
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_id::uuid;
end
$fn$;

-- 이 문서를 **고칠 수 있는가**. 열람이 아니다.
--
-- 부서 공개 업무를 구경하러 들어온 사람은 can_read_work 는 통과하지만 이 채널에는
-- 못 들어온다. 이 채널에는 아직 저장되지 않은 남의 글이 글자 단위로 흐르고,
-- broadcast 는 채널에 들어올 때 한 번 판정하고 끝나므로(0012 머리말) 한 번
-- 들여보내면 그 뒤로는 걸러 낼 방법이 없다.
create or replace function app.can_edit_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.document d
    where d.id = p_document_id and app.can_edit_work(d.work_id)
  )
$$;

-- 0012 §2 의 함정 둘을 그대로 피한다.
--   (1) 정책 조건에서 payload·event·private 을 참조하지 않는다. Realtime 이 채널
--       참가를 판정할 때 넣어 보는 행에는 topic 과 extension 만 들어 있어서,
--       그 칸들을 보면 실물에서 참가가 조용히 거부된다.
--   (2) extension 목록에 'broadcast' 가 있어야 한다. 접속자 표시만 쓸 생각이어도
--       broadcast 의 읽기 판정이 false 면 채널 참가 자체가 거부된다.
drop policy if exists doc_topic_read on realtime.messages;
create policy doc_topic_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and app.can_edit_document(app.topic_document_id((select realtime.topic())))
  );

-- 쓰기 — 편집 연산과 커서를 보내는 길이고, 접속자 표시(presence)도 쓰기다.
--
-- 0012 와 달리 postgres 를 적지 않는다. 거기서 postgres 가 필요했던 이유는
-- security definer 트리거가 realtime.messages 에 직접 넣기 때문인데, 이 채널로는
-- DB 가 아무것도 보내지 않는다. 보내는 것은 브라우저뿐이다. 필요 없는 역할을
-- 적어 두면 다음 사람이 「트리거가 있나 보다」라고 읽는다.
--
-- 읽기와 쓰기의 판정이 같다. 이 채널에 들어온 사람은 아무 값이나 보낼 수 있다는
-- 뜻이고, 실제로 그렇다 — 그래서 받는 쪽은 전부 wire.ts 의 readOps 를 통과시키고
-- 모양이 아니면 조용히 버린다. 위조해도 남의 DB 는 바뀌지 않는다. 저장은
-- 서버 액션(saveRichDoc)과 4절의 판 검사를 거친다.
drop policy if exists doc_topic_write on realtime.messages;
create policy doc_topic_write on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and app.can_edit_document(app.topic_document_id((select realtime.topic())))
  );

-- -----------------------------------------------------------------------------
-- 4. 저장의 원자성 — 함수를 만들지 않는다
--
-- 두 사람이 각자 저장할 때 늦은 쪽이 앞사람 글을 통째로 덮어쓰면 안 된다.
-- 막는 데 필요한 것은 한 문장이다.
--
--   update document
--      set blocks = ?, blocks_rev = ?, blocks_updated_by = ?, blocks_updated_at = now()
--    where id = ? and work_id = ? and blocks_rev = ?          -- 내가 본 판
--   returning blocks_rev
--
-- 한 문장이므로 원자적이다. 두 요청이 같은 판을 들고 동시에 들어오면, 먼저
-- 잡은 쪽이 커밋한 뒤 나머지 하나는 잠금이 풀린 자리에서 조건을 다시 보고
-- (EvalPlanQual) blocks_rev 가 이미 올라간 것을 발견해 0행으로 끝난다.
--
-- 함수(rich_doc_save)를 만들지 않은 이유.
--   · 이 문장은 document_update 정책을 그대로 통과한다. security definer 함수로
--     감싸면 RLS 를 우회하게 되고, 그 안에서 권한을 **다시 적어야 한다.**
--     같은 규칙이 두 벌이 되는 그 자리다(0002 원칙 3, db.ts 머리말).
--   · security invoker 함수로 만들면 규칙은 한 벌로 남지만, 얻는 것이
--     「0행의 이유를 한 번에 돌려주는 것」뿐이다. 그건 액션이 질의 한 번 더로
--     한다(rich-doc.ts 의 diagnose). PostgREST 에 함수를 하나 더 노출하는 값을
--     치를 만큼이 아니다.
--
-- 0행이 「권한 없음」인지 「판이 밀림」인지는 여기서 구분되지 않는다. 구분은
-- rich-doc.ts 가 한다 — 그 문서의 blocks_rev 를 한 번 더 읽어 보고,
--   읽히는데 판이 다르면        → 판이 밀렸다(rich.stale_retry, 현재 판을 함께 돌려준다)
--   읽히는데 판이 같으면        → 정책이 막았다(denied)
--   아예 안 읽히면              → 그 사이 사라졌거나 볼 수 없게 됐다(stale)
-- 로 가른다. PostgREST 가 정책에 걸린 UPDATE 를 오류가 아니라 0행으로 돌려주기
-- 때문에 필요한 절차다(guard.ts 의 changed 주석과 같은 이야기다).
--
-- ⚠ 판이 밀렸을 때 **현재 판을 돌려주는 것이 이 설계의 전부**다. 그 값을 받는
--   쪽이 버리면 CAS 는 「덮어쓰기를 막는 장치」가 아니라 「진 사람을 영영 막는
--   장치」가 된다 — 진 탭은 판이 영원히 뒤처져 그 뒤로 한 글자도 저장하지 못한다.
--   실제로 그렇게 되어 있었다. 지금은 편집기가 성공·실패를 가리지 않고 서버가 준
--   판을 받아 다음 저장에 싣는다(rich-doc-editor.tsx 의 nextRev, tests/rich-save.test.mjs).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 5. 함수 실행 권한 — 0012 §4 와 같은 규칙
--
-- 새로 만든 함수는 기본값이 PUBLIC EXECUTE 다. 0004 §3 의 회수 루프는 그때
-- 존재하던 함수만 돌았고, §2 의 기본권한 회수는 public 스키마에만 걸린다.
-- 여기서 명시하지 않으면 두 함수는 authenticated 에게 **PUBLIC 을 통해서만**
-- 실행 권한을 얻는다. 나중에 0004 를 한 번 더 돌리는 것만으로 그 권한이 사라지고,
-- 그 순간 편집 채널 참가가 전부 permission denied 로 죽는다.
-- (정책 평가는 평가하는 역할의 실행 권한을 검사한다)
-- -----------------------------------------------------------------------------
revoke all on function app.topic_document_id(text) from public, anon;
grant execute on function app.topic_document_id(text) to authenticated;

revoke all on function app.can_edit_document(uuid) from public, anon;
grant execute on function app.can_edit_document(uuid) to authenticated;
