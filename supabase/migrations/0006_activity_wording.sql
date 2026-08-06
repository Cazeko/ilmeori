-- =============================================================================
-- 일머리(Ilmeori) — 0006 이력 문구 다듬기
--
-- 이력 타임라인은 화면에서 이렇게 읽힌다.
--
--   정유진   17:41   [내용]
--   「2. 부서별 역할 분담」을 고쳤습니다
--
-- 사람 이름이 앞에 따로 붙으므로, 문장은 그 사람을 주어로 이어지는
-- **능동형**이어야 자연스럽다. 그런데 트리거가 남기던 문장은 피동형이었다.
--
--   정유진   진행상태가 진행중 → 검토 (으)로 변경되었습니다.
--
-- 주어와 서술이 어긋나고, "(으)로"·"이(가)" 처럼 조사를 괄호로 얼버무린
-- 흔적이 그대로 보인다. 행정 문서에서 흔한 표기이지만, 이건 문서가 아니라
-- 사람이 하루에 수십 번 훑는 목록이다.
--
-- 문장을 능동형으로 바꾸고, 조사는 받침을 보고 고르게 했다.
-- 이력은 이 제품이 파는 것 자체라, 여기 읽히는 문장이 곧 제품의 인상이다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 조사 고르기
--
-- 한글 음절의 유니코드 값에서 받침 유무를 계산한다.
--   음절 = 0xAC00 + (초성 × 588) + (중성 × 28) + 종성
-- 이므로 (값 - 0xAC00) % 28 이 0이면 받침이 없다.
--
-- 한글이 아닌 글자로 끝나면(영문·숫자·확장자 등) 받침 없는 쪽으로 읽는
-- 관행을 따른다. "xlsx를", "pdf를" 처럼.
-- -----------------------------------------------------------------------------
create or replace function app.josa(word text, with_jong text, without_jong text)
returns text
language plpgsql
immutable
set search_path = pg_temp
as $fn$
declare
  cp int;
begin
  if word is null or word = '' then
    return without_jong;
  end if;
  cp := ascii(right(word, 1));
  if cp between 44032 and 55203 then      -- 가 ~ 힣
    if (cp - 44032) % 28 = 0 then
      return without_jong;
    end if;
    return with_jong;
  end if;
  return without_jong;
end
$fn$;

revoke all on function app.josa(text, text, text) from public, anon;

comment on function app.josa(text, text, text) is
  '앞 낱말의 받침에 따라 조사를 고른다. app.josa(제목, ''을'', ''를'')';

-- -----------------------------------------------------------------------------
-- 업무
-- -----------------------------------------------------------------------------
create or replace function app.trg_work_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status_label constant jsonb :=
    '{"todo":"대기","doing":"진행중","review":"검토","done":"완료"}'::jsonb;
  v_old text;
  v_new text;
  v_to  text;
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.id, 'work.created', '업무를 만들었습니다');
    return new;
  end if;

  if new.status is distinct from old.status then
    v_old := v_status_label ->> old.status::text;
    v_new := v_status_label ->> new.status::text;
    perform app.log_activity(
      new.id, 'work.status_changed',
      format('상태를 %s에서 %s%s 바꿨습니다',
             v_old, v_new, app.josa(v_new, '으로', '로')),
      jsonb_build_object('before', old.status, 'after', new.status)
    );
  end if;

  if new.owner_id is distinct from old.owner_id then
    select p.name || ' ' || coalesce(p.position, '')
      into v_to
    from public.profile p where p.id = new.owner_id;
    perform app.log_activity(
      new.id, 'work.transferred',
      format('주담당을 %s에게 넘겼습니다', coalesce(btrim(v_to), '다른 사람')),
      jsonb_build_object('before', old.owner_id, 'after', new.owner_id)
    );
  end if;

  if new.title is distinct from old.title then
    perform app.log_activity(
      new.id, 'work.updated', '업무 제목을 고쳤습니다',
      jsonb_build_object('before', old.title, 'after', new.title));
  elsif new.due_date is distinct from old.due_date then
    perform app.log_activity(
      new.id, 'work.updated',
      case when new.due_date is null then '마감일을 지웠습니다'
           else format('마감일을 %s로 바꿨습니다',
                       to_char(new.due_date, 'YYYY년 FMMM월 FMDD일')) end,
      jsonb_build_object('before', old.due_date, 'after', new.due_date));
  elsif new.visibility is distinct from old.visibility then
    perform app.log_activity(
      new.id, 'work.updated', '공개 범위를 바꿨습니다',
      jsonb_build_object('before', old.visibility, 'after', new.visibility));
  elsif new.description is distinct from old.description then
    perform app.log_activity(
      new.id, 'work.updated', '설명을 고쳤습니다',
      jsonb_build_object('before', old.description, 'after', new.description));
  end if;

  return new;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 참여자
-- -----------------------------------------------------------------------------
create or replace function app.trg_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role_label constant jsonb := '{"owner":"소유","editor":"편집","viewer":"열람"}'::jsonb;
  v_who  text;
  v_old  text;
  v_new  text;
begin
  select btrim(p.name || ' ' || coalesce(p.position, ''))
    into v_who
  from public.profile p
  where p.id = coalesce(new.profile_id, old.profile_id);
  v_who := coalesce(v_who, '알 수 없는 사람');

  if tg_op = 'INSERT' then
    v_new := v_role_label ->> new.role::text;
    perform app.log_activity(
      new.work_id, 'member.added',
      format('%s%s %s자로 추가했습니다', v_who, app.josa(v_who, '을', '를'), v_new),
      jsonb_build_object('profile_id', new.profile_id, 'role', new.role));
    return new;

  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    v_old := v_role_label ->> old.role::text;
    v_new := v_role_label ->> new.role::text;
    perform app.log_activity(
      new.work_id, 'member.role_changed',
      format('%s의 권한을 %s에서 %s%s 바꿨습니다',
             v_who, v_old, v_new, app.josa(v_new, '으로', '로')),
      jsonb_build_object('profile_id', new.profile_id, 'before', old.role, 'after', new.role));
    return new;

  elsif tg_op = 'DELETE' then
    perform app.log_activity(
      old.work_id, 'member.removed',
      format('%s의 참여를 해제했습니다', v_who),
      jsonb_build_object('profile_id', old.profile_id));
    return old;
  end if;

  return coalesce(new, old);
end
$fn$;

-- -----------------------------------------------------------------------------
-- 문서 · 섹션 · 대화 · 첨부
-- -----------------------------------------------------------------------------
create or replace function app.trg_document_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(
      new.work_id, 'document.created',
      format('문서 「%s」%s 만들었습니다', new.title, app.josa(new.title, '을', '를')));
    return new;
  end if;
  perform app.log_activity(
    old.work_id, 'document.deleted',
    format('문서 「%s」%s 지웠습니다', old.title, app.josa(old.title, '을', '를')));
  return old;
end
$fn$;

create or replace function app.trg_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.work_id, 'comment.created', '대화를 남겼습니다',
      jsonb_build_object('comment_id', new.id));
    return new;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    perform app.log_activity(new.work_id, 'comment.deleted', '대화를 지웠습니다',
      jsonb_build_object('comment_id', new.id));
  end if;
  return new;
end
$fn$;

create or replace function app.trg_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(
      new.work_id, 'attachment.added',
      format('「%s」%s 올렸습니다', new.file_name, app.josa(new.file_name, '을', '를')),
      jsonb_build_object('attachment_id', new.id, 'file_name', new.file_name));
    return new;
  end if;
  perform app.log_activity(
    old.work_id, 'attachment.removed',
    format('「%s」%s 지웠습니다', old.file_name, app.josa(old.file_name, '을', '를')));
  return old;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 문서 항목 — 저장할 때마다 판을 남기는 그 트리거다.
-- 잠금과 버전 번호 계산은 손대지 않고 문장만 바꾼다.
-- -----------------------------------------------------------------------------
create or replace function app.trg_section_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_work_id uuid;
  v_next    int;
  v_head    text;
begin
  if new.body is not distinct from old.body and new.heading is not distinct from old.heading then
    return new;   -- 잠금만 잡았다 푼 경우 등 내용 변화 없음 → 버전 생성 안 함
  end if;

  select work_id into v_work_id from public.document where id = new.document_id;

  -- 같은 문서에 대한 동시 저장 직렬화
  perform pg_advisory_xact_lock(hashtextextended(new.document_id::text, 0));
  select coalesce(max(version_no), 0) + 1 into v_next
  from public.doc_version where document_id = new.document_id;

  insert into public.doc_version (document_id, section_id, version_no, heading, body, author_id)
  values (new.document_id, new.id, v_next, new.heading, new.body,
          coalesce(new.updated_by, (select auth.uid())));

  -- 판 번호(v3)는 문장에서 뺐다. 목록을 훑을 때 읽히는 정보가 아니고,
  -- 필요하면 detail 에 남아 있어 언제든 꺼낼 수 있다.
  v_head := coalesce(new.heading, '제목 없는 항목');
  perform app.log_activity(
    v_work_id, 'section.updated',
    format('「%s」%s 고쳤습니다', v_head, app.josa(v_head, '을', '를')),
    jsonb_build_object('document_id', new.document_id, 'section_id', new.id, 'version_no', v_next));

  return new;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 인계 실행 — 0003 원본에서 문장 한 줄만 바꾼 것이다.
-- 권한 확인·소유권 이전·이력 기록 로직은 그대로다.
-- -----------------------------------------------------------------------------
create or replace function public.execute_handover(p_handover_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from  uuid;
  v_to    uuid;
  v_status handover_status;
  v_work  uuid;
  v_count int := 0;
  v_to_name text;
begin
  select from_profile_id, to_profile_id, status
    into v_from, v_to, v_status
  from public.handover where id = p_handover_id
  for update;

  if v_from is null then
    raise exception '인계 정보를 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if v_from <> (select auth.uid()) then
    raise exception '본인이 시작한 인계만 실행할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  if v_status = 'completed' then
    raise exception '이미 완료된 인계입니다.' using errcode = 'check_violation';
  end if;
  if v_status <> 'confirmed' then
    raise exception '인계서 확인이 완료되지 않았습니다.' using errcode = 'check_violation';
  end if;

  select name into v_to_name from public.profile where id = v_to;

  for v_work in
    select hi.work_id from public.handover_item hi
    where hi.handover_id = p_handover_id and not hi.transferred
  loop
    -- 전임자가 여전히 소유자인지 재확인 (인계서 작성 후 권한이 바뀌었을 수 있다)
    if not exists (
      select 1 from public.work_member
      where work_id = v_work and profile_id = v_from and role = 'owner'
    ) then
      continue;
    end if;

    insert into public.work_member (work_id, profile_id, role, added_by)
    values (v_work, v_to, 'owner', v_from)
    on conflict (work_id, profile_id) do update set role = 'owner';

    update public.work set owner_id = v_to where id = v_work;

    -- 전임자는 열람 권한으로 남긴다 (마지막 소유자 가드는 위에서 후임을 먼저 넣어 통과)
    update public.work_member set role = 'viewer'
    where work_id = v_work and profile_id = v_from;

    update public.handover_item set transferred = true
    where handover_id = p_handover_id and work_id = v_work;

    perform app.log_activity(
      v_work, 'handover.completed',
      format('업무를 %s에게 인계했습니다', coalesce(v_to_name, '후임자')),
      jsonb_build_object('handover_id', p_handover_id, 'from', v_from, 'to', v_to));

    v_count := v_count + 1;
  end loop;

  update public.handover
  set status = 'completed', completed_at = now()
  where id = p_handover_id;

  return v_count;
end;
$fn$;
