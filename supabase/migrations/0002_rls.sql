-- =============================================================================
-- 일머리(Ilmeori) — 0002 Row Level Security
--
-- 원칙
--   1) default deny — 모든 테이블 RLS 활성화 후, 명시적으로 허용한 것만 통과한다.
--   2) 애플리케이션 버그가 곧 정보유출로 이어지지 않는다. URL에 UUID가 노출돼도 DB가 막는다(IDOR 차단).
--   3) 재귀 회피 — work ↔ work_member 상호 참조로 인한 무한 재귀는 SECURITY DEFINER 함수로 끊는다.
--   4) 성능 — auth.uid()를 (select auth.uid())로 감싸 행마다 재평가되지 않게 한다(initPlan 최적화).
--   5) service_role 키는 서버 전용이며, Server Action에서도 사용자 세션 클라이언트를 쓴다.
--      RLS는 service_role을 우회하므로, service_role 사용은 감사 대상이다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 보조 함수 (app 스키마 = PostgREST 미노출)
--   security definer + search_path 고정: 권한 상승·검색경로 하이재킹 방지
-- -----------------------------------------------------------------------------

-- 현재 사용자의 소속 부서
create or replace function app.my_department_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select department_id from public.profile
  where id = (select auth.uid()) and is_active
$$;

-- 현재 사용자가 해당 업무의 참여자인가 (역할 무관)
create or replace function app.is_work_member(p_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.work_member
    where work_id = p_work_id and profile_id = (select auth.uid())
  )
$$;

-- 현재 사용자의 해당 업무 역할
create or replace function app.work_role(p_work_id uuid)
returns member_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.work_member
  where work_id = p_work_id and profile_id = (select auth.uid())
$$;

-- 열람 권한: 참여자이거나, 부서 공개 업무의 소관 부서원이거나, 전 부서 공개 업무
create or replace function app.can_read_work(p_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.work w
    where w.id = p_work_id
      and (
        exists (
          select 1 from public.work_member m
          where m.work_id = w.id and m.profile_id = (select auth.uid())
        )
        or (w.visibility = 'department' and w.department_id = app.my_department_id())
        or  w.visibility = 'city'
      )
  )
$$;

-- 편집 권한: owner 또는 editor 참여자만. 부서 공개는 열람만 허용한다.
create or replace function app.can_edit_work(p_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.work_role(p_work_id) in ('owner', 'editor'), false)
$$;

-- 소유 권한: 참여자 관리·권한 변경·업무 삭제
create or replace function app.is_work_owner(p_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.work_role(p_work_id) = 'owner', false)
$$;

-- 섹션 편집 잠금이 아직 유효한가 (5분 만료)
create or replace function app.section_lock_active(p_locked_by uuid, p_locked_at timestamptz)
returns boolean
language sql
immutable
as $$
  select p_locked_by is not null
     and p_locked_at is not null
     and p_locked_at > now() - interval '5 minutes'
$$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- -----------------------------------------------------------------------------
-- RLS 활성화 (default deny)
--   force: 테이블 소유자에게도 RLS를 적용해 우회 경로를 없앤다.
-- -----------------------------------------------------------------------------

alter table department   enable row level security;
alter table profile      enable row level security;
alter table work         enable row level security;
alter table work_member  enable row level security;
alter table document     enable row level security;
alter table doc_section  enable row level security;
alter table doc_version  enable row level security;
alter table comment      enable row level security;
alter table attachment   enable row level security;
alter table activity     enable row level security;
alter table access_log   enable row level security;
alter table handover     enable row level security;
alter table handover_item enable row level security;

alter table work         force row level security;
alter table work_member  force row level security;
alter table document     force row level security;
alter table doc_section  force row level security;
alter table doc_version  force row level security;
alter table comment      force row level security;
alter table attachment   force row level security;
alter table activity     force row level security;
alter table access_log   force row level security;
alter table handover     force row level security;
alter table handover_item force row level security;

-- -----------------------------------------------------------------------------
-- 테이블 권한 (RLS 앞단의 방어층)
--   RLS는 "어떤 행"을 볼지 정하고, GRANT는 "어떤 동작"을 할 수 있는지 정한다.
--   둘 다 걸어야 한다. 예컨대 activity에 INSERT 권한 자체를 주지 않으면
--   설령 정책 실수가 있어도 사용자가 이력을 위조할 수 없다.
-- -----------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select on department to authenticated;
grant select, update on profile to authenticated;
grant select, insert, update, delete on work, work_member, document, doc_section, attachment to authenticated;
grant select, insert on doc_version to authenticated;
grant select, insert, update on comment to authenticated;
grant select, insert, update on handover to authenticated;
grant select, insert, delete on handover_item to authenticated;

-- 이력 테이블은 읽기만. 쓰기는 SECURITY DEFINER 트리거·RPC의 몫이다.
grant select on activity, access_log to authenticated;

-- 익명 사용자에게는 아무것도 주지 않는다.
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- department — 조직도는 전 직원 열람. 수정은 애플리케이션에서 하지 않는다(마이그레이션 전용).
-- -----------------------------------------------------------------------------

create policy department_select on department
  for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- profile — 직원 검색(참여자 초대)을 위해 재직자 정보는 전 직원 열람.
--           수정은 본인만. 부서·직급 변경은 인사 데이터이므로 트리거로 차단한다.
-- -----------------------------------------------------------------------------

create policy profile_select on profile
  for select to authenticated
  using (is_active);

create policy profile_update_self on profile
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- work — 이 정책이 제품 전체 접근제어의 뿌리다.
-- -----------------------------------------------------------------------------

create policy work_select on work
  for select to authenticated
  using (app.can_read_work(id));

-- 업무 생성은 본인 소속 부서에만. 생성자·주담당 위조 방지.
create policy work_insert on work
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and department_id = app.my_department_id()
  );

create policy work_update on work
  for update to authenticated
  using (app.can_edit_work(id))
  with check (app.can_edit_work(id));

create policy work_delete on work
  for delete to authenticated
  using (app.is_work_owner(id));

-- -----------------------------------------------------------------------------
-- work_member — 참여자 목록. 재귀를 피하려 app.* 함수(security definer)만 사용한다.
-- -----------------------------------------------------------------------------

create policy work_member_select on work_member
  for select to authenticated
  using (app.can_read_work(work_id));

-- 참여자 추가·권한 변경·제거는 소유자만.
create policy work_member_insert on work_member
  for insert to authenticated
  with check (app.is_work_owner(work_id));

create policy work_member_update on work_member
  for update to authenticated
  using (app.is_work_owner(work_id))
  with check (app.is_work_owner(work_id));

create policy work_member_delete on work_member
  for delete to authenticated
  using (app.is_work_owner(work_id));

-- -----------------------------------------------------------------------------
-- document / doc_section / doc_version
-- -----------------------------------------------------------------------------

create policy document_select on document
  for select to authenticated using (app.can_read_work(work_id));
create policy document_insert on document
  for insert to authenticated with check (app.can_edit_work(work_id) and created_by = (select auth.uid()));
create policy document_update on document
  for update to authenticated using (app.can_edit_work(work_id)) with check (app.can_edit_work(work_id));
create policy document_delete on document
  for delete to authenticated using (app.is_work_owner(work_id));

create policy doc_section_select on doc_section
  for select to authenticated
  using (exists (select 1 from document d where d.id = document_id and app.can_read_work(d.work_id)));

create policy doc_section_insert on doc_section
  for insert to authenticated
  with check (exists (select 1 from document d where d.id = document_id and app.can_edit_work(d.work_id)));

-- 섹션 잠금 존중: 다른 사람이 잠근 섹션은 잠금이 만료되기 전까지 수정할 수 없다.
-- 잠금은 UI 편의가 아니라 DB가 강제하는 규칙이다.
create policy doc_section_update on doc_section
  for update to authenticated
  using (
    exists (select 1 from document d where d.id = document_id and app.can_edit_work(d.work_id))
    and (
      not app.section_lock_active(locked_by, locked_at)
      or locked_by = (select auth.uid())
    )
  )
  with check (
    exists (select 1 from document d where d.id = document_id and app.can_edit_work(d.work_id))
  );

create policy doc_section_delete on doc_section
  for delete to authenticated
  using (exists (select 1 from document d where d.id = document_id and app.can_edit_work(d.work_id)));

-- 변경이력 스냅샷: 열람만. 수정·삭제 정책 없음 = 사후 조작 불가.
create policy doc_version_select on doc_version
  for select to authenticated
  using (exists (select 1 from document d where d.id = document_id and app.can_read_work(d.work_id)));

create policy doc_version_insert on doc_version
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from document d where d.id = document_id and app.can_edit_work(d.work_id))
  );

-- -----------------------------------------------------------------------------
-- comment — 열람권 있으면 작성 가능(협업 촉진). 삭제는 본인 것만(soft delete).
-- -----------------------------------------------------------------------------

create policy comment_select on comment
  for select to authenticated using (app.can_read_work(work_id));

create policy comment_insert on comment
  for insert to authenticated
  with check (app.can_read_work(work_id) and author_id = (select auth.uid()));

create policy comment_update_self on comment
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- attachment — 메타데이터. 실제 파일 접근은 storage 정책 + signed URL이 통제한다.
-- -----------------------------------------------------------------------------

create policy attachment_select on attachment
  for select to authenticated using (app.can_read_work(work_id));

create policy attachment_insert on attachment
  for insert to authenticated
  with check (app.can_edit_work(work_id) and uploaded_by = (select auth.uid()));

create policy attachment_delete on attachment
  for delete to authenticated using (app.can_edit_work(work_id));

-- -----------------------------------------------------------------------------
-- activity / access_log — append-only
--   SELECT 정책만 부여한다. INSERT/UPDATE/DELETE 정책이 존재하지 않으므로
--   일반 사용자는 어떤 경로로도 기록을 남기거나 지울 수 없다.
--   기록은 오직 SECURITY DEFINER 트리거·RPC를 통해서만 이뤄진다. → 0003_triggers.sql
-- -----------------------------------------------------------------------------

create policy activity_select on activity
  for select to authenticated using (app.can_read_work(work_id));

-- 열람 로그는 감사 목적이므로 일반 사용자에게 보이지 않는다.
-- 본인 열람 이력만 확인 가능(자기정보 접근권 보장).
create policy access_log_select_self on access_log
  for select to authenticated using (actor_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- handover — 전임자·후임자 당사자만
-- -----------------------------------------------------------------------------

create policy handover_select on handover
  for select to authenticated
  using (from_profile_id = (select auth.uid()) or to_profile_id = (select auth.uid()));

-- 인계는 본인이 넘기는 것만 생성할 수 있다(타인 명의 인계 위조 방지).
create policy handover_insert on handover
  for insert to authenticated
  with check (from_profile_id = (select auth.uid()));

create policy handover_update on handover
  for update to authenticated
  using (from_profile_id = (select auth.uid()) or to_profile_id = (select auth.uid()))
  with check (from_profile_id = (select auth.uid()) or to_profile_id = (select auth.uid()));

create policy handover_item_select on handover_item
  for select to authenticated
  using (exists (
    select 1 from handover h where h.id = handover_id
      and (h.from_profile_id = (select auth.uid()) or h.to_profile_id = (select auth.uid()))
  ));

-- 인계 대상에는 '내가 소유한 업무'만 담을 수 있다.
create policy handover_item_insert on handover_item
  for insert to authenticated
  with check (
    exists (select 1 from handover h where h.id = handover_id and h.from_profile_id = (select auth.uid()))
    and app.is_work_owner(work_id)
  );

create policy handover_item_delete on handover_item
  for delete to authenticated
  using (exists (
    select 1 from handover h where h.id = handover_id and h.from_profile_id = (select auth.uid())
  ));
