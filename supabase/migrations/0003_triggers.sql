-- =============================================================================
-- 이음(Ieum) — 0003 이력 자동기록 · 감사 · 인계 실행
--
-- 핵심 설계
--   이력은 애플리케이션이 "남기기로 결정"해서 남는 것이 아니라,
--   데이터가 바뀌면 DB가 반드시 남긴다. 개발자가 로깅을 빠뜨릴 수 없고,
--   사용자가 위조하거나 지울 수도 없다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 기록기 (SECURITY DEFINER → activity RLS 우회. 사용자에겐 INSERT 정책이 없다)
-- -----------------------------------------------------------------------------

create or replace function app.log_activity(
  p_work_id uuid,
  p_kind    activity_kind,
  p_summary text,
  p_detail  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity (work_id, actor_id, kind, summary, detail)
  values (p_work_id, (select auth.uid()), p_kind, p_summary, coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke execute on function app.log_activity(uuid, activity_kind, text, jsonb) from anon, authenticated;

-- -----------------------------------------------------------------------------
-- work
-- -----------------------------------------------------------------------------

create or replace function app.trg_work_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status_label constant jsonb :=
    '{"todo":"대기","doing":"진행중","review":"검토","done":"완료"}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.id, 'work.created', format('업무 「%s」이(가) 등록되었습니다.', new.title));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform app.log_activity(
      new.id, 'work.status_changed',
      format('진행상태가 %s → %s (으)로 변경되었습니다.',
             v_status_label ->> old.status::text, v_status_label ->> new.status::text),
      jsonb_build_object('before', old.status, 'after', new.status)
    );
  end if;

  if new.owner_id is distinct from old.owner_id then
    perform app.log_activity(
      new.id, 'work.transferred', '주담당자가 변경되었습니다.',
      jsonb_build_object('before', old.owner_id, 'after', new.owner_id)
    );
  end if;

  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.due_date is distinct from old.due_date
     or new.visibility is distinct from old.visibility then
    perform app.log_activity(
      new.id, 'work.updated', '업무 정보가 수정되었습니다.',
      jsonb_build_object(
        'before', jsonb_build_object('title', old.title, 'description', old.description,
                                     'due_date', old.due_date, 'visibility', old.visibility),
        'after',  jsonb_build_object('title', new.title, 'description', new.description,
                                     'due_date', new.due_date, 'visibility', new.visibility))
    );
  end if;

  return new;
end;
$$;

create trigger trg_work_activity
  after insert or update on work
  for each row execute function app.trg_work_activity();

-- 업무 생성자는 자동으로 소유자 참여자가 된다.
-- (이게 없으면 방금 만든 업무를 본인이 못 여는 일이 생긴다)
create or replace function app.trg_work_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.work_member (work_id, profile_id, role, added_by)
  values (new.id, new.owner_id, 'owner', new.created_by)
  on conflict (work_id, profile_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger trg_work_owner_membership
  after insert on work
  for each row execute function app.trg_work_owner_membership();

-- -----------------------------------------------------------------------------
-- work_member
-- -----------------------------------------------------------------------------

create or replace function app.trg_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_label constant jsonb := '{"owner":"소유","editor":"편집","viewer":"열람"}'::jsonb;
  v_name text;
  v_dept text;
begin
  select p.name, d.name into v_name, v_dept
  from public.profile p
  left join public.department d on d.id = p.department_id
  where p.id = coalesce(new.profile_id, old.profile_id);

  if tg_op = 'INSERT' then
    perform app.log_activity(
      new.work_id, 'member.added',
      format('%s %s이(가) %s 권한으로 참여했습니다.',
             coalesce(v_dept, ''), coalesce(v_name, '알 수 없음'), v_role_label ->> new.role::text),
      jsonb_build_object('profile_id', new.profile_id, 'role', new.role));
    return new;

  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform app.log_activity(
      new.work_id, 'member.role_changed',
      format('%s의 권한이 %s → %s (으)로 변경되었습니다.',
             coalesce(v_name, '알 수 없음'),
             v_role_label ->> old.role::text, v_role_label ->> new.role::text),
      jsonb_build_object('profile_id', new.profile_id, 'before', old.role, 'after', new.role));
    return new;

  elsif tg_op = 'DELETE' then
    perform app.log_activity(
      old.work_id, 'member.removed',
      format('%s의 참여가 해제되었습니다.', coalesce(v_name, '알 수 없음')),
      jsonb_build_object('profile_id', old.profile_id));
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_member_activity
  after insert or update or delete on work_member
  for each row execute function app.trg_member_activity();

-- 마지막 소유자는 제거할 수 없다. 주인 없는 업무 = 아무도 열 수 없는 업무.
create or replace function app.trg_guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if (select count(*) from public.work_member
        where work_id = old.work_id and role = 'owner') <= 1 then
      raise exception '마지막 소유자는 해제할 수 없습니다. 다른 소유자를 먼저 지정하세요.'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_guard_last_owner
  before update or delete on work_member
  for each row execute function app.trg_guard_last_owner();

-- -----------------------------------------------------------------------------
-- document / doc_section — 변경이력
-- -----------------------------------------------------------------------------

create or replace function app.trg_document_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.work_id, 'document.created',
      format('문서 「%s」이(가) 생성되었습니다.', new.title));
    return new;
  elsif tg_op = 'DELETE' then
    perform app.log_activity(old.work_id, 'document.deleted',
      format('문서 「%s」이(가) 삭제되었습니다.', old.title));
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_document_activity
  after insert or delete on document
  for each row execute function app.trg_document_activity();

-- 섹션이 저장될 때마다 스냅샷을 남긴다. 버전 번호는 DB가 채번한다(경합 안전).
create or replace function app.trg_section_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_id uuid;
  v_next    int;
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

  perform app.log_activity(
    v_work_id, 'section.updated',
    format('문서 섹션 「%s」이(가) 수정되었습니다. (v%s)', coalesce(new.heading, '제목 없음'), v_next),
    jsonb_build_object('document_id', new.document_id, 'section_id', new.id, 'version_no', v_next));

  return new;
end;
$$;

create trigger trg_section_version
  after update on doc_section
  for each row execute function app.trg_section_version();

-- -----------------------------------------------------------------------------
-- comment / attachment
-- -----------------------------------------------------------------------------

create or replace function app.trg_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.work_id, 'comment.created', '새 의견이 등록되었습니다.',
      jsonb_build_object('comment_id', new.id));
  elsif tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then
    perform app.log_activity(new.work_id, 'comment.deleted', '의견이 삭제되었습니다.',
      jsonb_build_object('comment_id', new.id));
  end if;
  return new;
end;
$$;

create trigger trg_comment_activity
  after insert or update on comment
  for each row execute function app.trg_comment_activity();

create or replace function app.trg_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.work_id, 'attachment.added',
      format('첨부파일 「%s」이(가) 등록되었습니다.', new.file_name),
      jsonb_build_object('attachment_id', new.id, 'byte_size', new.byte_size));
    return new;
  else
    perform app.log_activity(old.work_id, 'attachment.removed',
      format('첨부파일 「%s」이(가) 삭제되었습니다.', old.file_name));
    return old;
  end if;
end;
$$;

create trigger trg_attachment_activity
  after insert or delete on attachment
  for each row execute function app.trg_attachment_activity();

-- -----------------------------------------------------------------------------
-- 인사정보 변조 차단
--   profile_update_self 정책은 본인 수정을 허용하지만,
--   소속부서·직급·이메일·계정상태는 인사 데이터이므로 본인이 바꿀 수 없다.
--   (이걸 막지 않으면 부서를 바꿔 타 부서 업무를 열람하는 권한상승이 가능하다)
-- -----------------------------------------------------------------------------

create or replace function app.trg_profile_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    return new;   -- 서버(service_role)·마이그레이션 경로는 허용
  end if;
  if new.department_id is distinct from old.department_id
     or new.position   is distinct from old.position
     or new.email      is distinct from old.email
     or new.is_active  is distinct from old.is_active
     or new.is_demo    is distinct from old.is_demo then
    raise exception '소속·직급·계정 상태는 본인이 변경할 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_profile_immutable_fields
  before update on profile
  for each row execute function app.trg_profile_immutable_fields();

-- -----------------------------------------------------------------------------
-- 열람 로그 RPC
--   SELECT에는 트리거를 걸 수 없다. 애플리케이션이 명시적으로 호출하되,
--   위조를 막기 위해 actor는 서버가 정하고 열람 권한을 다시 확인한다.
-- -----------------------------------------------------------------------------

create or replace function public.log_access(
  p_work_id   uuid,
  p_kind      access_kind,
  p_target_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read_work(p_work_id) then
    raise exception '열람 권한이 없습니다.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.access_log (work_id, target_id, actor_id, kind)
  values (p_work_id, p_target_id, (select auth.uid()), p_kind);
end;
$$;

grant execute on function public.log_access(uuid, access_kind, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 인계 실행
--   제품의 클라이맥스. 원자적으로 처리하고, 권한을 서버에서 다시 확인한다.
--   전임자의 소유권을 후임자에게 넘기되, 전임자는 'viewer'로 남겨
--   인계 직후 질의응답이 가능하게 한다(현실의 인수인계 관행 반영).
-- -----------------------------------------------------------------------------

create or replace function public.execute_handover(p_handover_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      format('업무가 %s에게 인계되었습니다.', coalesce(v_to_name, '후임자')),
      jsonb_build_object('handover_id', p_handover_id, 'from', v_from, 'to', v_to));

    v_count := v_count + 1;
  end loop;

  update public.handover
  set status = 'completed', completed_at = now()
  where id = p_handover_id;

  return v_count;
end;
$$;

grant execute on function public.execute_handover(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage — private 버킷. 공개 URL이 존재하지 않으며 접근은 signed URL로만.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-files', 'work-files', false, 20971520,   -- 20MB
  array[
    'application/pdf',
    'application/haansofthwp',                                                   -- .hwp
    'application/x-hwp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- .pptx
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do nothing;

-- 파일 경로 규약: work-files/{work_id}/{uuid}_{filename}
-- 경로 첫 세그먼트를 업무 ID로 삼아 RLS와 동일한 권한 판정을 재사용한다.
create policy storage_work_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'work-files'
    and app.can_read_work(((storage.foldername(name))[1])::uuid)
  );

create policy storage_work_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'work-files'
    and app.can_edit_work(((storage.foldername(name))[1])::uuid)
  );

create policy storage_work_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'work-files'
    and app.can_edit_work(((storage.foldername(name))[1])::uuid)
  );
