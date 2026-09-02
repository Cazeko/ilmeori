-- =============================================================================
-- 일머리(Ilmeori) — 0026 인계에 입회자를 세운다
--
-- ── 왜 ──────────────────────────────────────────────────────────────────────
--
-- 0001 의 인계는 **인계자 혼자** 끝까지 갔다. 확인도 인계자, 실행도 인계자다.
-- 넘겨받는 사람은 문답만 쓸 수 있었고(0022), 그 문답은 서식에 안 실린다.
-- 즉 「받는 사람이 받겠다고 말하는 자리」가 어디에도 없었다.
--
-- 별지 제12호서식의 서명란은 셋이다 — 인계자·인수자·**입회자**. 우리는 그중
-- 둘을 이름으로 채우고 셋째 칸을 빈칸으로 내보내면서 「손으로 받으세요」라고
-- 적어 두고 있었다(handover-export.ts). 서식이 셋을 요구하는데 시스템은 하나만
-- 아는 상태였다.
--
-- ── 입회자는 한 명이다 ─────────────────────────────────────────────────────
--
-- 서명란이 한 줄이다. 두 사람을 세우면 종이가 못 담고, 「서식을 그대로
-- 따른다」가 그 순간 거짓이 된다.
--
-- 그래서 **인계자 쪽 부서**의 최고서열자 한 명이다. 인계인수는 「그 자리의
-- 업무」를 넘기는 일이고, 그 자리를 감독하는 사람이 입회한다. 인수자가 다른
-- 과에서 오면 그 과의 장은 알 필요는 있어도 이 서식에 서명하지는 않는다.
--
-- ── 되는 대로 뽑지 않고 **박아 둔다** ──────────────────────────────────────
--
-- 매번 질의로 고르면 인사이동 다음 날 승인자가 바뀐다. 인계는 인사이동 때
-- 도는 절차이므로 그것은 「가끔」이 아니라 **거의 언제나**다.
-- 그래서 인계를 만드는 순간 계산해서 칸에 적고, 그 뒤로 안 움직인다.
-- (0023 이 부서 이동 승인자를 고르는 것과 같은 판단이고, 같은 질의를 쓴다)
--
-- ── 막히지 않게 한다 ───────────────────────────────────────────────────────
--
-- 인계자 본인이 그 부서 최고서열자면(과장이 떠난다) 상위 부서로 한 칸 올라간다.
-- 끝까지 아무도 없으면 witness_id 는 null 로 남고, 그때는 **인계자가 마지막
-- 걸음을 밟는다**(0001 의 동작). 인사발령은 이미 났는데 입회자가 없어서 업무가
-- 안 넘어가는 것이 이 절차에서 가장 나쁜 결과다.
--
-- ── 상태값은 안 늘린다 ─────────────────────────────────────────────────────
--
-- handover_status 는 넉 칸 그대로다. 늘리는 대신 뜻을 옮긴다.
--
--   draft      대상 선정
--   generated  **확인 서명** — 인계자와 인수자가 각각 확인한다(칸 둘)
--   confirmed  **결재 상신** — 한/글이 나가고, 입회자 차례다
--   completed  인수 완료 — 입회자가 승인하고 권한이 넘어간다
--
-- 「둘 다 확인했는가」는 상태가 아니라 **칸 둘**(confirmed_at·accepted_at)로
-- 안다. 상태로 세면 「인계자만 확인」과 「인수자만 확인」을 위해 칸이 둘 더
-- 필요하고, 그러면 순서가 다른 두 길이 생긴다.
--
-- ── 결재가 났는지는 시스템이 모른다 ────────────────────────────────────────
--
-- 온나라 연동이 없다. 그러므로 입회자의 마지막 걸음은 「결재가 났다」는 사실에
-- 대한 **사람의 진술**이다. 진술은 근거와 함께 받는다 — witness_note 에 온나라
-- 문서번호나 결재일을 적게 하고, 비우면 절차가 거절한다.
-- 「승인했다」만 남는 기록은 무엇을 보고 승인했는지에 답하지 못한다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 칸 셋
-- -----------------------------------------------------------------------------

alter table handover
  add column if not exists accepted_at timestamptz,
  add column if not exists witness_id  uuid references profile(id),
  add column if not exists witness_note text;

comment on column handover.accepted_at is
  '인수자가 확인한 시각. confirmed_at(인계자)과 둘 다 차야 결재 상신으로 넘어간다.';
comment on column handover.witness_id is
  '입회자. 별지 제12호서식의 셋째 서명란이고, 인계를 만들 때 정해져 그 뒤로 안 바뀐다.';
comment on column handover.witness_note is
  '입회자가 승인하며 적은 근거 — 온나라 문서번호나 결재일. 이 칸이 비면 승인이 안 된다.';

-- 입회자가 자기 차례를 찾아오는 길.
create index if not exists handover_witness_idx
  on handover (witness_id) where witness_id is not null;

-- -----------------------------------------------------------------------------
-- 2. 입회자 고르기
--
-- 「그 부서에서 서열이 가장 높은(rank 가 가장 작은) 재직자, 본인 제외」.
-- 없으면 상위 부서로 올라간다. 조직도가 망가져 고리가 생겨도 멈추도록
-- 열 번에서 끊는다 — 무한히 도는 함수가 트리거 안에 있으면 표 하나가 잠긴다.
-- -----------------------------------------------------------------------------

create or replace function app.pick_witness(p_profile uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid;
  v_hit  uuid;
  i      int := 0;
begin
  select department_id into v_dept from public.profile where id = p_profile;

  while v_dept is not null and i < 10 loop
    select p.id into v_hit
    from public.profile p
    where p.department_id = v_dept
      and p.is_active
      and p.id <> p_profile
    order by p.rank asc, p.name asc, p.id asc
    limit 1;

    -- 같은 부서에 사람이 있어도 **인계자보다 서열이 낮으면** 입회자가 아니다.
    -- 주무관이 떠나는데 옆자리 주무관이 입회 서명을 하는 것은 서식의 뜻이
    -- 아니다. 그때는 위로 올라가서 과장을 찾는다.
    if v_hit is not null and (
      select p2.rank from public.profile p2 where p2.id = v_hit
    ) < (
      select p3.rank from public.profile p3 where p3.id = p_profile
    ) then
      return v_hit;
    end if;

    select parent_id into v_dept from public.department where id = v_dept;
    i := i + 1;
  end loop;

  -- 못 찾았다. 절차가 막히느니 입회자 없이 간다(머리글 참조).
  return null;
end;
$$;

revoke execute on function app.pick_witness(uuid) from anon, authenticated;

-- 인계를 만들 때 한 번 계산해서 박는다. 앱이 계산해서 실어 보내면 남의 이름을
-- 입회자로 적어 보내는 길이 열린다 — 정해지는 값은 DB 가 정한다.
create or replace function app.trg_handover_witness()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.witness_id is null then
    new.witness_id := app.pick_witness(new.from_profile_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handover_witness on handover;
create trigger trg_handover_witness
  before insert on handover
  for each row execute function app.trg_handover_witness();

-- -----------------------------------------------------------------------------
-- 3. 확인 서명 — 인계자와 인수자
--
-- 정책으로 열지 않고 절차 하나로 받는다. 정책은 「누가」만 보고 「어느 칸」은
-- 못 보므로(0011·0019 와 같은 이야기), UPDATE 를 열어 두면 인수자가
-- confirmed_at 을 적거나 status 를 completed 로 밀 수 있다.
--
-- 누가 부르는지로 어느 칸에 적을지가 갈린다. 칸을 인자로 받지 않는 이유가
-- 그것이다 — 받으면 남의 칸을 지목할 수 있다.
-- -----------------------------------------------------------------------------

create or replace function public.sign_handover(p_handover_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me   uuid := (select auth.uid());
  h    record;
  v_confirmed timestamptz;
  v_accepted  timestamptz;
begin
  select * into h from public.handover where id = p_handover_id for update;

  if h.id is null then
    raise exception '인계 정보를 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if h.status <> 'generated' then
    raise exception '지금은 확인 서명을 받는 단계가 아닙니다.' using errcode = 'check_violation';
  end if;

  v_confirmed := h.confirmed_at;
  v_accepted  := h.accepted_at;

  if me = h.from_profile_id then
    -- 되돌리지 않는다. 「확인했다」가 취소되면 인수자가 본 화면이 거짓이 된다.
    if v_confirmed is not null then
      raise exception '이미 확인하셨습니다.' using errcode = 'check_violation';
    end if;
    v_confirmed := now();
  elsif me = h.to_profile_id then
    if v_accepted is not null then
      raise exception '이미 확인하셨습니다.' using errcode = 'check_violation';
    end if;
    v_accepted := now();
  else
    raise exception '이 인계의 당사자가 아닙니다.' using errcode = 'insufficient_privilege';
  end if;

  update public.handover
  set confirmed_at = v_confirmed,
      accepted_at  = v_accepted,
      -- 둘 다 차면 결재 상신으로 넘어간다. 한쪽만 차 있으면 그대로 기다린다.
      status = case
        when v_confirmed is not null and v_accepted is not null then 'confirmed'
        else status
      end
  where id = p_handover_id;

  return case
    when v_confirmed is not null and v_accepted is not null then 'confirmed'
    else 'generated'
  end;
end;
$$;

grant execute on function public.sign_handover(uuid) to authenticated;
revoke all on function public.sign_handover(uuid) from anon, public;

-- -----------------------------------------------------------------------------
-- 4. 실행 — 이제 입회자가 누른다
--
-- 0003 의 판은 `v_from <> auth.uid()` 였다. 인사이동 당일에 인계자는 이미 다른
-- 과 사람이고, 서류가 결재를 도는 동안 자리를 비운다. 마지막 걸음을 떠나는
-- 사람에게 맡겨 두면 그 걸음이 안 밟히는 날이 온다.
--
-- 입회자가 없는 인계(2번에서 못 찾은 경우)만 인계자가 밟는다.
-- -----------------------------------------------------------------------------

drop function if exists public.execute_handover(uuid);

create or replace function public.execute_handover(
  p_handover_id uuid,
  p_witness_note text default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from  uuid;
  v_to    uuid;
  v_witness uuid;
  v_status handover_status;
  v_work  uuid;
  v_count int := 0;
  v_to_name text;
  v_note  text := btrim(coalesce(p_witness_note, ''));
begin
  select from_profile_id, to_profile_id, witness_id, status
    into v_from, v_to, v_witness, v_status
  from public.handover where id = p_handover_id
  for update;

  if v_from is null then
    raise exception '인계 정보를 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;

  if v_witness is not null then
    if v_witness <> (select auth.uid()) then
      raise exception '입회자만 인계를 완료할 수 있습니다.' using errcode = 'insufficient_privilege';
    end if;
    -- 근거 없는 승인은 받지 않는다(머리글 참조). 입회자가 없는 인계에서는
    -- 결재를 도는 사람도 없으므로 이 칸을 요구하지 않는다.
    if v_note = '' then
      raise exception '결재 문서번호나 결재일을 적어야 합니다.' using errcode = 'check_violation';
    end if;
  elsif v_from <> (select auth.uid()) then
    raise exception '본인이 시작한 인계만 실행할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  if v_status = 'completed' then
    raise exception '이미 완료된 인계입니다.' using errcode = 'check_violation';
  end if;
  if v_status <> 'confirmed' then
    raise exception '인계자와 인수자의 확인이 끝나지 않았습니다.' using errcode = 'check_violation';
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
  set status = 'completed',
      completed_at = now(),
      witness_note = nullif(v_note, '')
  where id = p_handover_id;

  return v_count;
end;
$$;

grant execute on function public.execute_handover(uuid, text) to authenticated;
revoke all on function public.execute_handover(uuid, text) from anon, public;

-- -----------------------------------------------------------------------------
-- 5. 입회자가 인계 건을 볼 수 있어야 한다
--
-- 0002 의 정책은 당사자 둘만 열었다. 서명하는 사람이 서명할 문서를 못 읽으면
-- 서명이 아니다.
--
-- **문답(handover_message)은 안 연다.** 0022 가 「인계자와 인수자만 읽고 쓰며,
-- 별지 제12호서식에는 실리지 않는다」고 못 박아 둔 표다. 입회자가 서명하는
-- 것은 서식이지 그 둘이 주고받은 되묻기가 아니다. 서식에 안 실리는 것을
-- 서명자에게 여는 것은 범위를 넓히는 것이지 절차를 지키는 것이 아니다.
-- -----------------------------------------------------------------------------

drop policy if exists handover_select on handover;
create policy handover_select on handover
  for select to authenticated
  using (
    from_profile_id = (select auth.uid())
    or to_profile_id = (select auth.uid())
    or witness_id    = (select auth.uid())
  );

drop policy if exists handover_item_select on handover_item;
create policy handover_item_select on handover_item
  for select to authenticated
  using (exists (
    select 1 from handover h where h.id = handover_id
      and (h.from_profile_id = (select auth.uid())
           or h.to_profile_id = (select auth.uid())
           or h.witness_id    = (select auth.uid()))
  ));

drop policy if exists handover_note_select on handover_note;
create policy handover_note_select on handover_note
  for select to authenticated
  using (exists (
    select 1 from handover h
    where h.id = handover_note.handover_id
      and (h.from_profile_id = (select auth.uid())
           or h.to_profile_id = (select auth.uid())
           or h.witness_id    = (select auth.uid()))
  ));

-- -----------------------------------------------------------------------------
-- 6. 진행 단계는 절차로만 움직인다
--
-- 트리거를 새로 달지 않고 0015 의 함수를 갈아 끼운다 — 0015 가 그렇게 하라고
-- 적어 두었다. 같은 표에 같은 일을 하는 트리거가 둘이면 한쪽만 고치는 날이 온다.
--
-- 두 가지가 바뀐다.
--
--   ① **호출 스택 판정을 고친다.** 0015 는 `%execute_handover(uuid)%` 를 찾는데
--      4번에서 그 함수가 `execute_handover(uuid,text)` 가 되었다. 고치지 않으면
--      새 실행 절차가 자기가 만든 잠금에 막힌다. 여는 괄호까지만 본다.
--
--   ② **status·확인 시각도 손으로 못 적는다.** 0015 는 completed 만 막았다.
--      그때는 그게 맞았다 — 확인(confirmed)은 인계자 혼자 밟는 걸음이었으니까.
--      이제 confirmed 는 **둘이 서명했다**는 뜻이다. 인계자가 손으로 밀 수 있으면
--      인수자가 안 봤는데 「인수자 확인」이 찍힌 서식이 결재에 올라간다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_lock_completed_handover()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctx text;
begin
  -- 마이그레이션·시드 경로는 통과시킨다. 로그인한 사용자가 없는 호출이다.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- 실행이 끝난 인계는 통째로 잠긴다(0011).
  if old.status = 'completed' then
    raise exception '완료된 인계는 되돌리거나 고칠 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 누가 누구에게 넘기는가는 인계를 시작할 때 정해진다.
  if new.from_profile_id is distinct from old.from_profile_id
     or new.to_profile_id is distinct from old.to_profile_id then
    raise exception '인계자와 인수자는 바꿀 수 없습니다. 취소하고 새로 시작해 주세요.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 입회자는 인계를 만들 때 정해지고(0026 §2) 그 뒤로 안 움직인다. 손으로 바꿀 수
  -- 있으면 결재를 받아 온 사람과 서식에 찍힌 이름이 달라진다.
  if new.witness_id is distinct from old.witness_id then
    raise exception '입회자는 바꿀 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 진행 단계와 서명 시각은 절차 둘만 적는다.
  -- 0015 의 판정 방식 그대로 호출 스택을 본다(그 파일의 긴 주석 참조 —
  -- 사용자 정의 매개변수는 Supabase 에서 못 쓴다).
  if new.status        is distinct from old.status
     or new.confirmed_at is distinct from old.confirmed_at
     or new.accepted_at  is distinct from old.accepted_at
     or new.completed_at is distinct from old.completed_at
     or new.witness_note is distinct from old.witness_note
  then
    get diagnostics v_ctx = pg_context;
    if v_ctx not like '%execute_handover(uuid%'
       and v_ctx not like '%sign_handover(uuid%' then
      raise exception '인계 완료는 실행 절차로만 기록됩니다.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end
$fn$;

comment on function app.trg_lock_completed_handover() is
  '완료된 인계를 잠그고, 당사자·입회자·진행 단계가 절차 밖에서 바뀌지 않게 한다.';

-- -----------------------------------------------------------------------------
-- 7. 업무의 주담당 잠금에 입회자가 걸린다
--
-- 0011 의 trg_guard_visibility 는 「주담당은 소유자만 바꾼다」를 지킨다. 그 판정이
-- `app.is_work_owner(new.id)` — 즉 **부르는 사람이 그 업무의 소유자인가**다.
--
-- 예전에는 그것으로 충분했다. 마지막 걸음을 밟는 사람이 곧 인계자였고, 인계자는
-- 넘기려는 업무의 소유자였으니까. 이제 그 걸음을 입회자가 밟는다. 입회자는 그
-- 업무의 참여자가 아니다 — 참여자였다면 애초에 인계할 일이 없다.
--
-- 그래서 execute_handover 안에서 온 변경만 통과시킨다. 0015 가 완료 도장에
-- 쓰는 것과 **같은 판정**이다(호출 스택). 이 함수 밖에서는 아무것도 안 바뀐다 —
-- 주담당을 손으로 옮기는 길은 여전히 소유자에게만 있다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_guard_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctx text;
begin
  -- 마이그레이션·시드 경로는 통과시킨다. 로그인한 사용자가 없는 호출이다.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.department_id is distinct from old.department_id then
    raise exception '소관 부서는 이 화면에서 바꿀 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.fiscal_year is distinct from old.fiscal_year then
    raise exception '회계연도는 바꿀 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.visibility is distinct from old.visibility
     or new.owner_id is distinct from old.owner_id
     or new.archived_at is distinct from old.archived_at then

    if not app.is_work_owner(new.id) then
      -- 인계 실행이 옮기는 것은 owner_id 하나뿐이다. 공개 범위와 보관은
      -- 그 절차가 손대지 않으므로 여기서도 통과시키지 않는다.
      get diagnostics v_ctx = pg_context;
      if not (
        new.owner_id is distinct from old.owner_id
        and new.visibility is not distinct from old.visibility
        and new.archived_at is not distinct from old.archived_at
        and v_ctx like '%execute_handover(uuid%'
      ) then
        raise exception '공개 범위·주담당·보관은 소유자만 바꿀 수 있습니다.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  -- 주담당은 소유 권한을 가진 참여자여야 한다. execute_handover 는 후임을
  -- owner 로 넣은 뒤에 work.owner_id 를 옮기므로 이 검사를 그대로 통과한다.
  if new.owner_id is distinct from old.owner_id then
    if not exists (
      select 1 from public.work_member
      where work_id = new.id and profile_id = new.owner_id and role = 'owner'
    ) then
      raise exception '주담당은 소유 권한을 가진 참여자만 맡을 수 있습니다.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$fn$;
