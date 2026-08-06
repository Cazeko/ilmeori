-- =============================================================================
-- 일머리(Ilmeori) — 0009 문서 이력의 빈자리
--
-- 화면에서 문서를 실제로 고칠 수 있게 되자 이력에 구멍이 세 개 드러났다.
-- 세 개 모두 "고쳤는데 아무 기록도 남지 않는다" 또는 "기록이 사실과 다르다" 쪽이다.
--
-- 이 제품이 하는 말은 「이력은 사람이 남기기로 결정해서 남는 것이 아니라
-- 데이터가 바뀌면 DB가 반드시 남긴다」이다. 그 말에 예외가 있으면 말이 아니라 광고다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 잠금만 잡았다 푼 것은 '수정'이 아니다
--
-- doc_section 의 updated_at 은 0001의 공용 트리거(app.touch_updated_at)가 갱신한다.
-- 그런데 편집 잠금을 잡는 것도 doc_section 의 UPDATE 다. 그래서 편집 버튼을 눌렀다가
-- 취소만 해도 「마지막 수정」이 방금으로 밀리고, updated_by 는 그대로라
-- 화면에는 「이전 사람 이름 · 방금」이라는 있지도 않은 사실이 찍힌다.
--
-- 내용이 그대로면 시각도 그대로여야 한다. 0003의 trg_section_version 이 같은 기준으로
-- 버전을 만들지 않고 넘어가므로, 두 트리거가 같은 것을 '수정'으로 본다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_section_touch()
returns trigger
language plpgsql
as $fn$
begin
  if new.heading    is not distinct from old.heading
     and new.body   is not distinct from old.body
     and new.sort_order is not distinct from old.sort_order then
    -- 잠금 칸만 움직였다. 손대지 않은 것으로 둔다.
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
    return new;
  end if;

  new.updated_at := now();
  return new;
end
$fn$;

drop trigger if exists trg_doc_section_touch on doc_section;

create trigger trg_doc_section_touch
  before update on doc_section
  for each row execute function app.trg_section_touch();

-- -----------------------------------------------------------------------------
-- 2. 문서 항목을 지우면 아무 기록도 남지 않았다
--
-- 0003의 trg_section_version 은 after update 뿐이다. 항목을 지우면 activity 에
-- 한 줄도 남지 않고, 그 항목의 doc_version 만 section_id = null 로 떠돈다.
-- 인수인계 감사에서 「누가 그 항목을 없앴는가」는 「누가 고쳤는가」만큼 자주 묻는 질문이다.
--
-- activity_kind 에 새 값을 만들지 않고 section.updated 를 쓴다. 열거형에 값을 더하려면
-- alter type 이 필요하고, 그것은 같은 트랜잭션 안에서 쓸 수 없어 배포 절차가 한 겹 늘어난다.
-- 사람이 읽는 것은 summary 문장이고, 타임라인의 색 분류(ACTIVITY_TONE)도 '내용'으로 같다.
-- 기계가 구분해야 할 때를 위해 detail.deleted 를 함께 남긴다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_section_delete_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_work_id uuid;
  v_name    text;
begin
  select work_id into v_work_id from public.document where id = old.document_id;

  -- 문서째 사라지는 중이면 남길 곳이 없다. 문서 삭제는 그 자체로 이미 기록된다.
  if v_work_id is null then
    return old;
  end if;

  v_name := coalesce(nullif(btrim(old.heading), ''), '제목 없는 항목');

  perform app.log_activity(
    v_work_id, 'section.updated',
    format('문서 항목 「%s」%s 지웠습니다', v_name, app.josa(v_name, '을', '를')),
    jsonb_build_object(
      'document_id', old.document_id,
      'section_id',  old.id,
      'deleted',     true));

  return old;
end
$fn$;

drop trigger if exists trg_section_delete_activity on doc_section;

create trigger trg_section_delete_activity
  after delete on doc_section
  for each row execute function app.trg_section_delete_activity();

-- -----------------------------------------------------------------------------
-- 3. 문서 이름을 바꿔도 기록되지 않았다
--
-- 0003·0006의 trg_document_activity 는 insert 와 delete 만 본다.
-- 문서 제목은 그 문서가 무엇인지를 정하는 값이라, 조용히 바뀌면 안 된다.
-- activity_kind 의 'document.updated' 는 처음부터 정의되어 있었는데 쓰는 곳이 없었다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_document_updated()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.title is not distinct from old.title then
    return new;
  end if;

  perform app.log_activity(
    new.work_id, 'document.updated',
    format('문서 이름을 「%s」에서 「%s」%s 바꿨습니다',
           old.title, new.title, app.josa(new.title, '으로', '로')),
    jsonb_build_object('before', old.title, 'after', new.title));

  return new;
end
$fn$;

drop trigger if exists trg_document_updated on document;

create trigger trg_document_updated
  after update on document
  for each row execute function app.trg_document_updated();

revoke all on function app.trg_section_touch()           from public, anon, authenticated;
revoke all on function app.trg_section_delete_activity() from public, anon, authenticated;
revoke all on function app.trg_document_updated()        from public, anon, authenticated;
