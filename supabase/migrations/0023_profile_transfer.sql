-- =============================================================================
-- 일머리(Ilmeori) — 0023 개인 프로필: 연락처와 부서 이동
--
-- ── 두 가지를 한 파일에 두는 이유 ───────────────────────────────────────────
--
-- 프로필 화면 하나가 둘을 함께 연다. 「내 정보를 본다」와 「내 정보를 고친다」는
-- 같은 자리에서 일어나는데, 이 제품에서 프로필의 칸들은 **고칠 수 있는 것과
-- 절대 고치면 안 되는 것이 한 줄 걸러 하나씩** 섞여 있다. 그 경계를 한 파일에
-- 적어 두지 않으면 다음에 칸을 하나 더할 때 어느 쪽인지 다시 판단해야 한다.
--
--   고칠 수 있다   이름·아바타·내선번호·휴대전화
--   고칠 수 없다   소속부서·직급·서열·이메일·계정상태          (0003·0016)
--
-- ── 소속을 왜 그냥 열지 않는가 ──────────────────────────────────────────────
--
-- 0003 의 trg_profile_immutable_fields 가 이렇게 적어 두었다:
--
--     (이걸 막지 않으면 부서를 바꿔 타 부서 업무를 열람하는 권한상승이 가능하다)
--
-- 그 문장은 지금도 참이다. work.visibility = 'department' 인 업무의 열람 판정은
-- app.can_read_work() 안에서 **profile.department_id 하나**를 본다. 본인이 이
-- 칸을 직접 쓸 수 있으면, 로그인한 사람 누구나 자기 소속을 기획예산과로 적어
-- 넣고 그 과의 업무를 통째로 여는 문장 하나가 완성된다. 이력에는 프로필을
-- 고쳤다는 줄 하나만 남는다.
--
-- 그래서 **트리거를 풀지 않는다.** 대신 문을 하나 낸다 — 소속이 바뀌는 유일한
-- 경로를 decide_transfer() 안으로 못박고, 그 함수는 「옮겨갈 부서의 최고 서열자」
-- 본인이 부를 때만 일한다. 신청하는 사람과 승인하는 사람이 다르다는 것이
-- 이 기능의 전부이고, 그것을 화면이 아니라 DB 가 강제한다.
--
-- ── 「지금 그 함수 안인가」를 어떻게 아는가 ─────────────────────────────────
--
-- 0015 가 이미 푼 문제다. GET DIAGNOSTICS ... PG_CONTEXT 로 호출 스택을 직접
-- 본다. 함수에 사용자 정의 매개변수를 붙이는 방법(alter function ... set)은
-- Supabase 에서 거절된다 — 그렇게 하려면 superuser 여야 하고 Supabase 의
-- postgres 역할은 superuser 가 아니다. PGlite 는 superuser 로 돌아 그대로
-- 통과하므로, 로컬만 보고 있으면 실물에 붙일 때까지 모른다.
--
-- ── 휴대전화를 왜 칸이 아니라 표로 두는가 ───────────────────────────────────
--
-- 0011 이 적어 둔 것과 같은 이유다. **RLS 정책은 행만 보고 칸은 보지 못한다.**
-- 「휴대전화는 본인이 공개한 경우에만 남에게 보인다」는 칸 단위 규칙이라
-- profile 에 칸으로 두면 정책으로 표현할 방법이 없다 — 앱이 select 목록에서
-- 빼는 수밖에 없고, 그건 PostgREST 를 직접 찌르면 그대로 나온다는 뜻이다.
--
-- 표를 나누면 같은 규칙이 **행 조건 한 줄**이 된다. 비공개면 행 자체가 안 나온다.
-- 「앱이 안 보여 준다」와 「DB 가 안 준다」의 차이이고, 이 제품은 후자만 방어로 센다.
--
-- 내선번호는 반대다. 행정전화번호부가 원래 전 직원 공개이므로 profile 에 칸으로
-- 둔다 — profile_select 가 이미 재직자 전원 열람이라 칸을 더하면 그걸로 끝이다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 내선번호 — profile 의 칸
--
-- 형식을 DB 에서 막는다. 앱에도 같은 검사가 있지만(actions/profile.ts) 서버
-- 액션은 폼을 거치지 않고 부를 수 있다. 「자리」를 나타내는 번호이므로 숫자와
-- 붙임표만 받는다.
-- -----------------------------------------------------------------------------

alter table profile add column if not exists phone_ext text;

alter table profile drop constraint if exists profile_phone_ext_check;
alter table profile add constraint profile_phone_ext_check
  check (phone_ext is null or phone_ext ~ '^[0-9][0-9-]{2,19}$');

comment on column profile.phone_ext is
  '사무실 내선번호. 행정전화번호부와 같은 성격이라 재직자 전원이 본다.';

-- -----------------------------------------------------------------------------
-- 2. 휴대전화 — 별도의 표
--
-- 행이 있다는 것 자체가 「번호를 등록했다」는 뜻이고, is_public 이 그 행을
-- 남에게 보일지 정한다. 비공개면 select 정책이 행을 통째로 걸러 내므로,
-- 남에게는 **번호가 없는 사람과 구분되지 않는다.** 그게 맞다 — 번호가
-- 있는데 안 알려 준다는 사실까지 알려 줄 이유가 없다.
-- -----------------------------------------------------------------------------

create table if not exists profile_contact (
  profile_id uuid primary key references profile(id) on delete cascade,
  mobile     text not null,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now(),

  -- 010-1234-5678 꼴만 받는다. 국제표기·공백·괄호를 다 받아 주기 시작하면
  -- 같은 번호가 네 가지 모양으로 쌓이고, 그때부터는 「같은 사람인가」를
  -- 문자열로 물을 수 없게 된다. 시제품에 들어가는 것은 전부 가상 번호다.
  constraint profile_contact_mobile_check
    check (mobile ~ '^01[016789]-[0-9]{3,4}-[0-9]{4}$')
);

comment on table profile_contact is
  '개인 휴대전화. 본인만 쓰고, is_public 일 때만 남이 읽는다. '
  '칸 단위 공개 규칙을 행 단위 정책으로 표현하려고 profile 에서 떼어 냈다(0011 과 같은 이유).';

comment on column profile_contact.is_public is
  '전 직원 공개 여부. 기본은 거짓 — 아무 말도 안 한 사람의 번호는 열리지 않는다.';

-- 0005 의 이벤트 트리거가 새 표에 RLS 를 자동으로 켜지만 여기서도 명시한다.
-- 자동에 기대면 그 트리거가 사라진 환경에서 이 표만 조용히 열린다(0022 와 같은 판단).
alter table profile_contact enable row level security;
alter table profile_contact force row level security;

grant select, insert, update, delete on profile_contact to authenticated;
revoke all on profile_contact from anon;

-- 읽기 — 본인 것이거나, 공개로 표시된 것.
drop policy if exists profile_contact_select on profile_contact;
create policy profile_contact_select on profile_contact
  for select to authenticated
  using (profile_id = (select auth.uid()) or is_public);

-- 쓰기 — 전부 본인 것만. profile_id 를 남의 것으로 적는 경로를 with check 가 막는다.
drop policy if exists profile_contact_insert on profile_contact;
create policy profile_contact_insert on profile_contact
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists profile_contact_update on profile_contact;
create policy profile_contact_update on profile_contact
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- 지우는 길을 연다. 번호를 내리는 것은 공개를 끄는 것과 다른 일이고,
-- 「등록한 적 없는 상태」로 돌아갈 수 없으면 사람은 가짜 번호를 적어 넣는다.
drop policy if exists profile_contact_delete on profile_contact;
create policy profile_contact_delete on profile_contact
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. 부서 이동 신청
--
-- approver_id 를 **신청하는 순간 못박는다.** 승인할 때 다시 계산하면, 그
-- 사이에 그 과의 서열이 바뀌었을 때 「누가 승인했어야 하는가」가 흔들린다.
-- 못박아 두면 정책도 approver_id = auth.uid() 한 줄로 끝난다.
-- -----------------------------------------------------------------------------

do $$ begin
  create type transfer_status as enum ('pending', 'approved', 'rejected', 'canceled');
exception when duplicate_object then null;
end $$;

create table if not exists transfer_request (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profile(id) on delete cascade,
  from_department_id uuid references department(id),
  to_department_id   uuid not null references department(id),
  approver_id        uuid not null references profile(id),
  reason             text,
  status             transfer_status not null default 'pending',
  decided_at         timestamptz,
  decided_note       text,
  created_at         timestamptz not null default now(),

  -- 같은 과로 옮기는 신청은 아무 일도 하지 않으면서 승인자의 할 일만 늘린다.
  constraint transfer_request_moves
    check (from_department_id is distinct from to_department_id),

  -- 자기 신청을 자기가 승인하는 경로를 표 차원에서 막는다. 함수도 막지만,
  -- 함수는 고쳐 쓸 수 있고 제약은 그렇지 않다.
  constraint transfer_request_not_self
    check (approver_id <> profile_id),

  constraint transfer_request_reason_len
    check (reason is null or length(reason) <= 500),

  constraint transfer_request_note_len
    check (decided_note is null or length(decided_note) <= 500)
);

comment on table transfer_request is
  '부서 이동 신청. 소속이 바뀌는 유일한 경로이고, 실제로 바꾸는 것은 decide_transfer() 뿐이다.';

-- 한 사람이 동시에 여러 곳으로 신청할 수는 없다. 부분 유일 색인이라
-- 처리가 끝난 신청은 몇 건이든 남는다 — 이력이기 때문이다.
create unique index if not exists transfer_request_one_pending
  on transfer_request (profile_id) where status = 'pending';

create index if not exists transfer_request_approver_idx
  on transfer_request (approver_id, status, created_at desc);

alter table transfer_request enable row level security;
alter table transfer_request force row level security;

-- **읽기만 준다.** 신청·취소·결정은 전부 아래 함수를 지난다. 표에 직접 쓰는
-- 길이 있으면 승인자를 자기가 정해 넣는 신청을 만들 수 있고, 그건 자기 승인이다.
grant select on transfer_request to authenticated;
revoke insert, update, delete on transfer_request from authenticated;
revoke all on transfer_request from anon;

-- 당사자 둘만 본다. 남이 어디로 옮기려 하는지는 인사 정보다.
drop policy if exists transfer_request_select on transfer_request;
create policy transfer_request_select on transfer_request
  for select to authenticated
  using (
    transfer_request.profile_id = (select auth.uid())
    or transfer_request.approver_id = (select auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 4. 승인자를 고르는 규칙
--
-- 옮겨갈 부서에서 서열이 가장 높은(rank 가 가장 작은) 재직자 한 사람.
-- 결재선 자동 생성(0016)과 같은 규칙이라 이 제품에 새 개념이 늘지 않는다.
--
-- 신청자 본인은 후보에서 뺀다. 빼고 나면 아무도 없는 부서가 생기는데
-- (혼자인 과, 또는 그 과에서 내가 제일 위인 경우) 그때는 상위 실·국으로
-- 한 단계 올라간다. 조직도가 원래 그렇게 생겼다.
--
-- 동률이면 이름 순으로 한 사람을 고른다. 아무나 고르면 같은 상황에서 두 번
-- 다른 답이 나오고, 그러면 「왜 저 사람에게 갔지」에 답할 수 없다.
-- -----------------------------------------------------------------------------

create or replace function app.transfer_approver(p_department uuid, p_requester uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_dept uuid := p_department;
  v_who  uuid;
  v_hop  int := 0;
begin
  -- parent_id 는 사람이 넣는 값이라 고리가 생길 수 있다. 다섯 단계면
  -- 시 → 국 → 과 → 팀보다 깊고, 그 위는 조직도에 없다.
  while v_dept is not null and v_hop < 5 loop
    select p.id into v_who
    from public.profile p
    where p.department_id = v_dept
      and p.is_active
      and p.id <> p_requester
    order by p.rank asc, p.name asc, p.id asc
    limit 1;

    if v_who is not null then
      return v_who;
    end if;

    select d.parent_id into v_dept from public.department d where d.id = v_dept;
    v_hop := v_hop + 1;
  end loop;

  return null;
end
$fn$;

revoke all on function app.transfer_approver(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. 신청하기
--
-- 승인자를 인자로 받지 않는다. 받는 순간 「누구에게 결재를 올릴지」를 신청자가
-- 고르게 되고, 그건 자기 승인으로 가는 가장 짧은 길이다.
-- -----------------------------------------------------------------------------

create or replace function public.request_transfer(p_to_department uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me       uuid := (select auth.uid());
  v_from     uuid;
  v_active   boolean;
  v_approver uuid;
  v_id       uuid;
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  select p.department_id, p.is_active into v_from, v_active
  from public.profile p where p.id = v_me;

  if not coalesce(v_active, false) then
    raise exception '재직 중인 계정만 이동을 신청할 수 있습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_from is not null and v_from = p_to_department then
    raise exception '이미 그 부서 소속입니다.' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.department d where d.id = p_to_department) then
    raise exception '없는 부서입니다.' using errcode = 'check_violation';
  end if;

  v_approver := app.transfer_approver(p_to_department, v_me);
  if v_approver is null then
    raise exception '그 부서에는 이 신청을 승인할 사람이 없습니다. 인사 담당자에게 문의해 주세요.'
      using errcode = 'check_violation';
  end if;

  -- 대기 중인 신청이 이미 있으면 부분 유일 색인이 23505 로 막는다.
  -- 여기서 미리 세지 않는 이유는 0004·members.ts 와 같다 — 두 요청이 같은
  -- 순간에 통과하는 창을 만들지 않으려면 세는 일을 DB 에 맡겨야 한다.
  insert into public.transfer_request
    (profile_id, from_department_id, to_department_id, approver_id, reason)
  values
    (v_me, v_from, p_to_department, v_approver, nullif(btrim(p_reason), ''))
  returning id into v_id;

  return v_id;
end
$fn$;

revoke all on function public.request_transfer(uuid, text) from public, anon;
grant execute on function public.request_transfer(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. 취소하기 — 신청한 본인만, 대기 중일 때만
-- -----------------------------------------------------------------------------

create or replace function public.cancel_transfer(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid;
  v_status transfer_status;
begin
  select r.profile_id, r.status into v_owner, v_status
  from public.transfer_request r where r.id = p_request for update;

  if v_owner is null then
    raise exception '없는 신청입니다.' using errcode = 'check_violation';
  end if;
  if v_owner <> v_me then
    raise exception '본인이 낸 신청만 취소할 수 있습니다.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'pending' then
    raise exception '이미 처리된 신청입니다.' using errcode = 'check_violation';
  end if;

  update public.transfer_request
  set status = 'canceled', decided_at = now()
  where id = p_request;
end
$fn$;

revoke all on function public.cancel_transfer(uuid) from public, anon;
grant execute on function public.cancel_transfer(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. 결정하기 — 이 제품에서 소속이 바뀌는 유일한 자리
--
-- 승인과 반려를 한 함수에 둔다. 갈라 두면 아래 트리거가 통과시켜야 할 함수
-- 이름이 둘이 되고, 이름으로 판정하는 자리는 적을수록 좋다.
-- -----------------------------------------------------------------------------

create or replace function public.decide_transfer(
  p_request uuid,
  p_approve boolean,
  p_note    text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me  uuid := (select auth.uid());
  v_req public.transfer_request;
  v_now uuid;
begin
  select * into v_req
  from public.transfer_request r where r.id = p_request for update;

  if v_req.id is null then
    raise exception '없는 신청입니다.' using errcode = 'check_violation';
  end if;
  if v_req.approver_id <> v_me then
    raise exception '이 신청의 승인자가 아닙니다.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_req.status <> 'pending' then
    raise exception '이미 처리된 신청입니다.' using errcode = 'check_violation';
  end if;

  if p_approve then
    -- 신청한 뒤에 소속이 달라졌으면 이 신청은 다른 사실에 근거한 것이 된다.
    -- 지금은 한 사람에게 대기 신청이 하나뿐이라 일어나기 어렵지만,
    -- 「일어나기 어렵다」는 막지 않아도 된다는 뜻이 아니다.
    select p.department_id into v_now from public.profile p where p.id = v_req.profile_id;
    if v_now is distinct from v_req.from_department_id then
      raise exception '신청한 뒤 소속이 바뀌었습니다. 신청을 다시 내야 합니다.'
        using errcode = 'check_violation';
    end if;

    -- 아래 한 줄이 이 파일의 전부다. trg_profile_immutable_fields 는 호출
    -- 스택에서 이 함수의 이름을 보고서만 통과시킨다.
    update public.profile
    set department_id = v_req.to_department_id
    where id = v_req.profile_id;
  end if;

  update public.transfer_request
  set status       = case when p_approve then 'approved' else 'rejected' end::transfer_status,
      decided_at   = now(),
      decided_note = nullif(btrim(p_note), '')
  where id = p_request;
end
$fn$;

revoke all on function public.decide_transfer(uuid, boolean, text) from public, anon;
grant execute on function public.decide_transfer(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. 이동이 남기고 가는 것 — 주담당 업무의 수
--
-- 부서를 옮기면 그 과의 「부서 공개」 업무는 목록에서 사라진다. 그런데
-- work.department_id 는 그대로라, **주담당인 업무가 남의 과에 남는다.**
-- 화면이 그 수를 먼저 말해 주지 않으면 승인하는 쪽도 신청하는 쪽도 모른다.
--
-- 이 수는 RLS 로는 못 센다 — 승인자에게 그 과의 업무는 애초에 안 보인다.
-- 그래서 security definer 로 세되, **당사자 둘에게만** 답한다.
-- 돌려주는 것은 수 하나뿐이고 제목도 내용도 나가지 않는다.
-- -----------------------------------------------------------------------------

create or replace function public.transfer_impact(p_request uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me  uuid := (select auth.uid());
  v_req public.transfer_request;
  v_n   int;
begin
  select * into v_req from public.transfer_request r where r.id = p_request;
  if v_req.id is null then
    return 0;
  end if;
  if v_me is distinct from v_req.profile_id and v_me is distinct from v_req.approver_id then
    raise exception '이 신청의 당사자가 아닙니다.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_n
  from public.work w
  where w.owner_id = v_req.profile_id
    and w.department_id is not distinct from v_req.from_department_id
    and w.status <> 'done';

  return coalesce(v_n, 0);
end
$fn$;

revoke all on function public.transfer_impact(uuid) from public, anon;
grant execute on function public.transfer_impact(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. 인사정보 잠금을 다시 쓴다 — 소속에만 문을 낸다
--
-- 0003 의 원본은 여섯 칸을 한 덩어리로 막았다. 여기서는 소속만 갈라내어
-- decide_transfer() 안에서 온 UPDATE 만 통과시킨다. 나머지 다섯 칸
-- (직급·서열·이메일·계정상태·데모표식)은 예외 없이 그대로 막힌다 —
-- 이동 승인으로 남의 직급이 함께 바뀌는 일은 없어야 한다.
--
-- 이름으로 판정하는 것이 걱정된다면: 앱 사용자는 함수를 만들 수 없다.
-- 0004 가 public 스키마의 CREATE 권한을 회수했고 PostgREST 는 DDL 을 받지 않는다.
-- (0015 가 같은 판정을 하며 적어 둔 근거와 같다)
-- -----------------------------------------------------------------------------

create or replace function app.trg_profile_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctx text;
begin
  if (select auth.uid()) is null then
    return new;   -- 서버(service_role)·마이그레이션 경로는 허용
  end if;

  if new.department_id is distinct from old.department_id then
    get diagnostics v_ctx = pg_context;
    if v_ctx not like '%decide_transfer(uuid,boolean,text)%' then
      raise exception '소속은 부서 이동 승인으로만 바뀝니다.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.position  is distinct from old.position
     or new.rank      is distinct from old.rank
     or new.email     is distinct from old.email
     or new.is_active is distinct from old.is_active
     or new.is_demo   is distinct from old.is_demo then
    raise exception '직급·이메일·계정 상태는 본인이 변경할 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$fn$;

-- 트리거 자체는 0003 이 건 것을 그대로 쓴다. 0016 도 함수만 다시 정의했다 —
-- 이 함수는 0003 → 0016 → 0023 으로 세 번 덮어써졌고, 언제나 마지막 파일
-- 하나만 읽으면 지금 무엇이 막혀 있는지 전부 보이게 유지한다.
