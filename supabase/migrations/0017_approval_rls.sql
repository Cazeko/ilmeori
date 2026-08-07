-- =============================================================================
-- 일머리(Ilmeori) — 0017 결재의 권한과 절차
--
-- 0016 은 표만 만들었다. 여기서 누가 무엇을 할 수 있는지 정한다.
--
-- ── 이 파일의 한 문장 ───────────────────────────────────────────────────────
--
--   **서명은 손으로 찍히지 않는다.** approval_step 에는 UPDATE 권한 자체가 없고
--   정책도 없다. 서명이 들어가는 길은 public.submit/sign/reject_approval 셋뿐이다.
--
-- 0002 가 activity 에 한 것과 같은 짜임이다. 정책을 잘못 건드리는 실수가 곧
-- 사고가 되지 않게, 권한층에서도 닫아 둔다(0010 의 교훈).
--
-- ── 왜 결재선에 있는 사람은 업무를 못 봐도 문서는 보는가 ────────────────────
--
-- 협조는 부서 경계를 넘는다. 건축과 주무관이 자원순환과의 비공개 업무를 통째로
-- 볼 이유는 없지만, 자기 이름이 결재란에 올라간 **그 문서 한 장**은 봐야 한다.
-- 그래서 app.can_read_approval 은 app.can_read_work 보다 넓다 — 딱 한 겹 넓다.
--
-- ── 왜 상신된 문서의 본문이 얼어붙는가 ─────────────────────────────────────
--
-- 팀장이 서명한 뒤에 기안자가 본문을 고칠 수 있으면, 팀장은 자기가 읽지 않은
-- 글에 서명한 것이 된다. 종이 결재에서 그것은 위조다. 고치려면 회수하고
-- 다시 올린다 — 그래야 그 사실이 이력에 남는다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 보조 함수 (app 스키마 = PostgREST 미노출)
-- -----------------------------------------------------------------------------

-- 내 이름이 이 문서의 결재선에 있는가.
create or replace function app.is_approval_approver(p_approval_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.approval_step s
    where s.approval_id = p_approval_id and s.approver_id = (select auth.uid())
  )
$$;

-- 이 결재 문서를 볼 수 있는가.
--
--   기안 중  → 기안자만. 아직 아무에게도 보내지 않은 초안이다.
--   그 뒤    → 기안자 + 그 업무를 볼 수 있는 사람 + 결재선에 이름이 있는 사람
--
-- 이 함수는 **다른 표의 정책**(approval_step_select)이 쓴다. approval 자신의
-- 정책은 아래에서 같은 규칙을 칸으로 직접 적는다 — 그 이유는 정책 쪽에 적었다.
create or replace function app.can_read_approval(p_approval_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.approval a
    where a.id = p_approval_id
      and (
        a.drafter_id = (select auth.uid())
        or (
          a.state <> 'drafting'
          and (app.can_read_work(a.work_id) or app.is_approval_approver(a.id))
        )
      )
  )
$$;

-- 아직 기안 중이고, 내가 그 기안자인가. 결재선을 짜고 고치는 권한의 기준이다.
create or replace function app.is_approval_draft_owner(p_approval_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.approval a
    where a.id = p_approval_id
      and a.drafter_id = (select auth.uid())
      and a.state = 'drafting'
  )
$$;

-- 이 칸을 지금 처리할 수 없는 이유. 처리할 수 있으면 null 을 돌려준다.
--
-- 판정과 문구를 한곳에 둔다. 절차(sign/reject)와 화면(「지금 내 차례」)이
-- 같은 규칙을 두 번 적으면, 한쪽만 고쳐진 채로 배포되는 날이 온다.
create or replace function app.step_block_reason(p_step_id uuid, p_actor uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  s record;
  a record;
begin
  select * into s from public.approval_step where id = p_step_id;
  if s.id is null then
    return '결재칸을 찾을 수 없습니다.';
  end if;

  if s.approver_id is distinct from p_actor then
    return '내 결재칸이 아닙니다.';
  end if;
  if s.signed_at is not null or s.rejected_at is not null then
    return '이미 처리한 결재칸입니다.';
  end if;

  select * into a from public.approval where id = s.approval_id;

  -- 사후보고는 줄의 바깥에 있다. 문서가 끝난 뒤에 하는 일이다.
  if s.kind = 'post_report' then
    if a.state <> 'completed' then
      return '사후보고는 결재가 끝난 뒤에 합니다.';
    end if;
    return null;
  end if;

  -- 전결이 찍히면 그 뒤 칸은 서명하지 않는다. 결재란에 사선을 긋는 자리다.
  -- 상태 검사보다 먼저 본다 — 그래야 「이미 완결된 문서」가 아니라 「전결로
  -- 끝난 문서」라고 말할 수 있고, 화면이 그 칸에 사선을 그릴 근거가 생긴다.
  if exists (
    select 1 from public.approval_step d
    where d.approval_id = s.approval_id
      and d.kind = 'delegated'
      and d.signed_at is not null
      and d.seq < s.seq
  ) then
    return '전결로 끝난 문서입니다.';
  end if;

  if a.state <> 'in_progress' then
    return case a.state
             when 'drafting'  then '아직 상신되지 않은 문서입니다.'
             when 'completed' then '이미 완결된 문서입니다.'
             when 'rejected'  then '반려된 문서입니다.'
             else                  '회수된 문서입니다.'
           end;
  end if;

  -- 병렬협조는 줄을 서지 않는다. 나머지는 앞 순서가 끝나야 차례가 온다.
  if s.kind <> 'concur_par' and exists (
    select 1 from public.approval_step p
    where p.approval_id = s.approval_id
      and p.seq < s.seq
      and p.kind not in ('concur_par', 'post_report')
      and p.signed_at is null
  ) then
    return '앞 순서의 결재가 아직 끝나지 않았습니다.';
  end if;

  return null;
end
$fn$;

-- 화면이 부르는 얇은 겉면. 남의 차례를 물어볼 수 없게 행위자를 고정한다.
create or replace function app.can_sign_step(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.step_block_reason(p_step_id, (select auth.uid())) is null
$$;

-- 결재가 끝났는가.
--   전결이 찍혔으면 거기서 끝이다.
--   아니면 사후보고를 뺀 모든 칸이 서명되어야 끝난다.
create or replace function app.approval_is_done(p_approval_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.approval_step
    where approval_id = p_approval_id and kind = 'delegated' and signed_at is not null
  )
  or not exists (
    select 1 from public.approval_step
    where approval_id = p_approval_id and kind <> 'post_report' and signed_at is null
  )
$$;

-- 문서번호.  HS-협조-20260808-0001
--
-- 하이웍스의 `GA-협조-20260302-0005` 체계를 따랐다. 공무원이 이미 아는 모양이다.
--
-- 같은 날 같은 서식에 두 사람이 동시에 상신하면 같은 번호를 집는다. unique 제약이
-- 그것을 오류로 만들어 주기는 하지만, 그때 죽는 것은 **먼저 누른 사람이 아니라
-- 나중에 커밋된 사람**이라 누가 실패할지 예측할 수 없다. 잠금으로 줄을 세운다.
-- 트랜잭션이 끝나면 저절로 풀린다(xact).
create or replace function app.next_doc_no(p_form text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_label  text;
  v_prefix text;
  v_seq    int;
begin
  v_label := case p_form
               when 'report'      then '보고'
               when 'plan'        then '계획'
               when 'review'      then '검토'
               when 'cooperation' then '협조'
               else                    '문서'
             end;

  -- 날짜는 한국 시각이다. UTC 로 매기면 오후 9시 이후에 올린 문서의 번호가
  -- 다음 날짜로 찍힌다.
  v_prefix := 'HS-' || v_label || '-'
              || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD') || '-';

  perform pg_advisory_xact_lock(hashtext(v_prefix));

  -- 뒤에서 네 글자를 잘라 읽지 않는다. 하루에 만 건이 넘어가면 연번이 다섯 자리가
  -- 되고, 그때 right(doc_no, 4) 는 '0000' 을 읽어 번호가 1 로 되돌아간다.
  -- 마디로 끊어 읽으면 자릿수와 무관하게 맞는다.  HS-협조-20260808-0001 → '0001'
  select coalesce(max(split_part(doc_no, '-', 4)::int), 0) + 1
    into v_seq
  from public.approval
  where doc_no like v_prefix || '%'
    and split_part(doc_no, '-', 4) ~ '^\d+$';

  -- lpad 는 채우기만 하는 것이 아니라 **자른다.** lpad('10000', 4, '0') 은 '1000' 이다.
  -- 이미 쓴 번호대로 되돌아가 unique 제약에 부딪히거나, 더 나쁘게는 다른 문서와
  -- 같은 번호를 받는다.
  return v_prefix
         || case when v_seq > 9999 then v_seq::text
                 else lpad(v_seq::text, 4, '0') end;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 2. RLS 켜기 + 권한층
--
-- 0005 의 이벤트 트리거가 표를 만들 때 이미 RLS 를 켰다. 그래도 여기 한 번 더
-- 적는다 — 이 파일만 읽어도 무엇이 닫혀 있어야 하는지 전부 보이게(0010 의 규약).
-- force 는 표 소유자에게도 RLS 를 적용해 우회 경로를 없앤다.
-- -----------------------------------------------------------------------------

alter table approval      enable row level security;
alter table approval_step enable row level security;
alter table approval      force  row level security;
alter table approval_step force  row level security;

-- approval_step 에 UPDATE 가 없다. 서명이 손으로 들어가는 길을 권한층에서 끊는다.
grant select, insert, update, delete on approval      to authenticated;
grant select, insert,         delete on approval_step to authenticated;

revoke update on approval_step from authenticated;
revoke all on approval, approval_step from anon;

-- -----------------------------------------------------------------------------
-- 3. 정책
-- -----------------------------------------------------------------------------

-- 정책이 자기 행을 함수로 다시 읽지 않는다.
--
-- `using (app.can_read_approval(id))` 라고 적으면 읽기는 되는데 **기안이 막힌다.**
-- INSERT ... RETURNING 은 넣은 뒤에 SELECT 정책을 한 번 더 통과해야 하고, 그때
-- 함수 안의 select 는 문장이 시작될 때의 스냅샷을 본다. 지금 넣는 행은 거기에
-- 없으므로 함수는 언제나 false 를 돌려주고, 기안자는 자기가 방금 만든 문서를
-- 돌려받지 못한다.
--
-- 0002 의 work_select 가 그 모양이고, 그래서 works.ts 는 id 를 앱에서 미리 만들어
-- RETURNING 없이 넣는다. 여기서는 같은 우회를 하지 않아도 되게 칸으로 직접 적는다.
-- 정책 안에서 그 행의 칸은 함수를 거치지 않고 그대로 보인다.
drop policy if exists approval_select on approval;
create policy approval_select on approval
  for select to authenticated
  using (
    drafter_id = (select auth.uid())
    or (
      state <> 'drafting'
      and (app.can_read_work(work_id) or app.is_approval_approver(id))
    )
  );

-- 결재를 올리는 것은 그 업무를 고칠 수 있는 사람이다. 열람자는 올리지 못한다.
-- 태어나는 문서는 언제나 기안 중이고, 번호가 없고, 끝나 있지 않다.
drop policy if exists approval_insert on approval;
create policy approval_insert on approval
  for insert to authenticated
  with check (
    drafter_id = (select auth.uid())
    and app.can_edit_work(work_id)
    and state     = 'drafting'
    and doc_no    is null
    and closed_at is null
  );

-- 정책은 행만 보고 칸은 못 본다(0011). 어느 칸을 언제 고칠 수 있는지는
-- 아래 trg_approval_guard 가 정한다.
drop policy if exists approval_update on approval;
create policy approval_update on approval
  for update to authenticated
  using (drafter_id = (select auth.uid()))
  with check (drafter_id = (select auth.uid()));

-- 상신하기 전에는 지울 수 있다. 상신한 뒤에는 회수하거나 반려되는 것이지
-- 사라지는 것이 아니다 — 결재는 증빙이고, 증빙은 지워지면 증빙이 아니다.
drop policy if exists approval_delete on approval;
create policy approval_delete on approval
  for delete to authenticated
  using (drafter_id = (select auth.uid()) and state = 'drafting');

drop policy if exists approval_step_select on approval_step;
create policy approval_step_select on approval_step
  for select to authenticated
  using (app.can_read_approval(approval_id));

-- 결재선은 기안 중에만 짠다. 이미 서명된 칸을 심어 넣을 수 없다.
-- (INSERT 의 with check 는 새 행의 칸을 볼 수 있다. UPDATE 정책과 다른 점이다)
drop policy if exists approval_step_insert on approval_step;
create policy approval_step_insert on approval_step
  for insert to authenticated
  with check (
    app.is_approval_draft_owner(approval_id)
    and signed_at   is null
    and rejected_at is null
    and opinion     is null
  );

drop policy if exists approval_step_delete on approval_step;
create policy approval_step_delete on approval_step
  for delete to authenticated
  using (app.is_approval_draft_owner(approval_id));

-- UPDATE 정책은 만들지 않는다. 그것이 이 파일의 한 문장이다.

-- -----------------------------------------------------------------------------
-- 4. 칸 단위 규칙 — 결재 문서
--
-- 「지금 이 트랜잭션이 결재 절차 안인가」를 호출 스택으로 본다. 0015 가
-- execute_handover 에 쓴 것과 같은 방법이고, 이유도 같다 — 함수에 사용자 정의
-- 매개변수를 붙이는 문장은 Supabase 의 postgres 가 superuser 가 아니라 42501 로
-- 막힌다(supabase/verify.mjs 가 그 문장을 글자로 잡는다).
--
-- 이름만 보고 판정하는 것이 걱정된다면: 앱 사용자는 함수를 만들 수 없다.
-- 0004 가 public 스키마의 CREATE 권한을 회수했고 PostgREST 는 DDL 을 받지 않는다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_approval_guard()
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

  -- 이 문서가 어느 업무의 것이고 누가 기안했는지는 만들 때 정해진다.
  if new.id         is distinct from old.id
     or new.work_id    is distinct from old.work_id
     or new.drafter_id is distinct from old.drafter_id
     or new.created_at is distinct from old.created_at then
    raise exception '결재 문서의 소속 업무와 기안자는 바꿀 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 끝난 문서는 아무도 못 고친다. 기안자도 마찬가지다.
  -- 반려된 문서를 고쳐 다시 올리는 정상 경로는 「재기안」 — 새 문서를 만드는 것이다.
  if old.state in ('completed', 'rejected', 'withdrawn') then
    raise exception '완결·반려·회수된 결재는 고칠 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 진행 상태·문서번호·끝난 시각은 절차만 움직인다.
  if new.state     is distinct from old.state
     or new.doc_no    is distinct from old.doc_no
     or new.closed_at is distinct from old.closed_at then
    get diagnostics v_ctx = pg_context;
    if v_ctx !~ '(submit|sign|reject|withdraw)_approval\(' then
      raise exception '결재 진행은 상신·결재·반려·회수 절차로만 기록됩니다.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- 상신된 뒤에는 본문이 얼어붙는다. 이 파일 머리에 적은 그 이유다.
  --
  -- 위 검사에서 곧바로 return 하지 않는 이유가 있다. 그러면 「절차 안에서라면
  -- 본문도 함께 고칠 수 있는」 길이 열린 채로 남는다. 지금 그 길을 쓰는 절차는
  -- 없지만, 다음에 절차를 하나 더 만드는 사람은 이 파일을 읽지 않는다.
  if old.state = 'in_progress'
     and (new.title     is distinct from old.title
          or new.body      is distinct from old.body
          or new.form      is distinct from old.form
          or new.retention is distinct from old.retention
          or new.security  is distinct from old.security) then
    raise exception '상신된 결재의 내용은 고칠 수 없습니다. 회수한 뒤 다시 올려 주세요.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$fn$;

revoke all on function app.trg_approval_guard() from public, anon, authenticated;

comment on function app.trg_approval_guard() is
  '결재 문서의 칸마다 언제 누가 고칠 수 있는지 정한다. 정책은 행만 보고 칸은 못 본다.';

drop trigger if exists trg_approval_guard on approval;
create trigger trg_approval_guard
  before update on approval
  for each row execute function app.trg_approval_guard();

-- -----------------------------------------------------------------------------
-- 5. 칸 단위 규칙 — 결재란
--
-- 권한도 정책도 없으니 여기까지 오는 UPDATE 는 절차뿐이다. 그래도 적어 둔다.
-- 나중에 누가 편의를 위해 UPDATE 정책 한 줄을 여는 날, 이 트리거가 남아 있다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_approval_step_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctx text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  -- 결재란의 뼈대는 기안 중에 정해지고 그 뒤로 움직이지 않는다.
  -- position 이 특히 그렇다 — 서명 당시의 직위를 남기려고 글자로 박아 둔 칸이다.
  if new.approval_id is distinct from old.approval_id
     or new.seq         is distinct from old.seq
     or new.kind        is distinct from old.kind
     or new.approver_id is distinct from old.approver_id
     or new.position    is distinct from old.position then
    raise exception '결재란의 순서·유형·결재자·직위는 바꿀 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 한 번 찍힌 서명은 지워지지 않는다.
  if old.signed_at is not null or old.rejected_at is not null then
    raise exception '이미 처리된 결재칸은 되돌릴 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  get diagnostics v_ctx = pg_context;
  if v_ctx !~ '(submit|sign|reject)_approval\(' then
    raise exception '서명은 결재 절차로만 찍힙니다.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$fn$;

revoke all on function app.trg_approval_step_guard() from public, anon, authenticated;

drop trigger if exists trg_approval_step_guard on approval_step;
create trigger trg_approval_step_guard
  before update on approval_step
  for each row execute function app.trg_approval_step_guard();

-- -----------------------------------------------------------------------------
-- 6. 절차 — 상신
--
-- 이 함수가 하는 일 셋: 결재선이 말이 되는지 확인하고, 문서번호를 붙이고,
-- 기안란에 서명을 찍는다. 기안자가 「상신」을 누르는 것이 곧 기안 서명이다.
-- -----------------------------------------------------------------------------

create or replace function public.submit_approval(p_approval_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  a        record;
  v_draft  record;
  v_others int;
  v_doc    text;
begin
  select * into a from public.approval where id = p_approval_id for update;

  if a.id is null then
    raise exception '결재 문서를 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if a.drafter_id <> (select auth.uid()) then
    raise exception '기안자만 상신할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  if a.state <> 'drafting' then
    raise exception '이미 상신된 문서입니다.' using errcode = 'check_violation';
  end if;

  select * into v_draft
  from public.approval_step
  where approval_id = a.id and kind = 'draft';

  if v_draft.id is null then
    raise exception '결재선에 기안란이 없습니다.' using errcode = 'check_violation';
  end if;
  if v_draft.approver_id <> a.drafter_id then
    raise exception '기안란은 기안자의 자리입니다.' using errcode = 'check_violation';
  end if;

  -- 기안란보다 앞선 칸이 있으면 결재선이 뒤집힌 것이다.
  -- (검토에서 나왔다. 그대로 두면 상신하면서 기안란만 서명되고, 그 앞 칸은
  --  「앞 순서가 끝나지 않았다」에 걸리지도 않아 아무 때나 서명된다)
  -- seq = 1 을 요구하지 않는 이유는 번호를 10·20·30 으로 띄워 짜는 화면도
  -- 그대로 통과해야 하기 때문이다.
  if exists (
    select 1 from public.approval_step
    where approval_id = a.id and seq < v_draft.seq
  ) then
    raise exception '기안란은 결재선의 첫 칸입니다.' using errcode = 'check_violation';
  end if;

  -- 혼자 서명하고 끝나는 문서는 결재가 아니다.
  select count(*) into v_others
  from public.approval_step
  where approval_id = a.id and kind not in ('draft', 'post_report');

  if v_others = 0 then
    raise exception '결재선에 결재자가 없습니다.' using errcode = 'check_violation';
  end if;

  v_doc := app.next_doc_no(a.form);

  update public.approval
     set state = 'in_progress', doc_no = v_doc
   where id = a.id;

  update public.approval_step
     set signed_at = now()
   where id = v_draft.id;

  perform app.log_activity(
    a.work_id, 'approval.submitted',
    format('결재 「%s」%s 상신했습니다', a.title, app.josa(a.title, '을', '를')),
    jsonb_build_object('approval_id', a.id, 'doc_no', v_doc, 'form', a.form));

  return v_doc;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 7. 절차 — 결재(서명)
-- -----------------------------------------------------------------------------

create or replace function public.sign_approval(p_step_id uuid, p_opinion text default null)
returns approval_state
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s         record;
  a         record;
  v_reason  text;
  v_opinion text;
  v_label   text;
begin
  select * into s from public.approval_step where id = p_step_id;
  if s.id is null then
    raise exception '결재칸을 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;

  -- 문서를 먼저 잠근다. 마지막 두 사람이 동시에 서명하면 완결 판정이 두 번 돈다.
  select * into a from public.approval where id = s.approval_id for update;

  v_reason := app.step_block_reason(p_step_id, (select auth.uid()));
  if v_reason is not null then
    raise exception '%', v_reason using errcode = 'insufficient_privilege';
  end if;

  v_opinion := nullif(btrim(coalesce(p_opinion, '')), '');

  update public.approval_step
     set signed_at = now(), opinion = v_opinion
   where id = p_step_id;

  v_label := case s.kind
               when 'draft'       then '기안'
               when 'review'      then '결재'
               when 'final'       then '최종결재'
               when 'delegated'   then '전결'
               when 'acting'      then '대결'
               when 'concur_seq'  then '협조'
               when 'concur_par'  then '협조'
               when 'post_report' then '사후보고'
             end;

  perform app.log_activity(
    a.work_id, 'approval.signed',
    format('「%s」 %s란에 서명했습니다%s',
           a.title, v_label,
           case when v_opinion is null then '' else ' (의견 있음)' end),
    jsonb_build_object('approval_id', a.id, 'step_id', s.id,
                       'kind', s.kind, 'opinion', v_opinion));

  -- 사후보고는 이미 끝난 문서에 찍히므로 완결 판정을 다시 하지 않는다.
  if a.state = 'in_progress' and app.approval_is_done(a.id) then
    update public.approval
       set state = 'completed', closed_at = now()
     where id = a.id;

    perform app.log_activity(
      a.work_id, 'approval.completed',
      format('결재 「%s」%s 완결되었습니다', a.title, app.josa(a.title, '이', '가')),
      jsonb_build_object('approval_id', a.id, 'doc_no', a.doc_no));

    return 'completed'::approval_state;
  end if;

  return a.state;
end
$fn$;

-- -----------------------------------------------------------------------------
-- 8. 절차 — 반려
--
-- 사유 없는 반려는 받지 않는다. 「왜 반려됐는지 물어보러 자리로 가야 하는」
-- 상황을 없애는 것이 이 제품의 목적이다.
-- -----------------------------------------------------------------------------

create or replace function public.reject_approval(p_step_id uuid, p_opinion text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s         record;
  a         record;
  v_reason  text;
  v_opinion text;
begin
  select * into s from public.approval_step where id = p_step_id;
  if s.id is null then
    raise exception '결재칸을 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;

  select * into a from public.approval where id = s.approval_id for update;

  v_reason := app.step_block_reason(p_step_id, (select auth.uid()));
  if v_reason is not null then
    raise exception '%', v_reason using errcode = 'insufficient_privilege';
  end if;

  -- 사후보고를 반려하면 이미 완결된 문서가 반려로 바뀐다. 그건 되돌리기다.
  if s.kind = 'post_report' then
    raise exception '사후보고는 반려할 수 없습니다.' using errcode = 'check_violation';
  end if;

  v_opinion := nullif(btrim(coalesce(p_opinion, '')), '');
  if v_opinion is null then
    raise exception '반려 사유를 적어 주세요.' using errcode = 'check_violation';
  end if;

  update public.approval_step
     set rejected_at = now(), opinion = v_opinion
   where id = p_step_id;

  update public.approval
     set state = 'rejected', closed_at = now()
   where id = a.id;

  perform app.log_activity(
    a.work_id, 'approval.rejected',
    format('결재 「%s」%s 반려했습니다 — %s', a.title, app.josa(a.title, '을', '를'), v_opinion),
    jsonb_build_object('approval_id', a.id, 'step_id', s.id, 'opinion', v_opinion));
end
$fn$;

-- -----------------------------------------------------------------------------
-- 9. 절차 — 회수
--
-- 아무도 서명하지 않았을 때만 되가져올 수 있다. 한 사람이라도 읽고 서명했다면
-- 그건 「없던 일」이 아니라 반려되거나 완결되어야 할 일이다.
-- -----------------------------------------------------------------------------

create or replace function public.withdraw_approval(p_approval_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  a       record;
  v_moved int;
begin
  select * into a from public.approval where id = p_approval_id for update;

  if a.id is null then
    raise exception '결재 문서를 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if a.drafter_id <> (select auth.uid()) then
    raise exception '기안자만 회수할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  if a.state <> 'in_progress' then
    raise exception '진행 중인 결재만 회수할 수 있습니다.' using errcode = 'check_violation';
  end if;

  -- 기안란은 상신하면서 스스로 찍은 서명이므로 세지 않는다.
  select count(*) into v_moved
  from public.approval_step
  where approval_id = a.id
    and kind <> 'draft'
    and (signed_at is not null or rejected_at is not null);

  if v_moved > 0 then
    raise exception '이미 결재가 시작된 문서는 회수할 수 없습니다.'
      using errcode = 'check_violation';
  end if;

  update public.approval
     set state = 'withdrawn', closed_at = now()
   where id = a.id;

  perform app.log_activity(
    a.work_id, 'approval.withdrawn',
    format('결재 「%s」%s 회수했습니다', a.title, app.josa(a.title, '을', '를')),
    jsonb_build_object('approval_id', a.id, 'doc_no', a.doc_no));
end
$fn$;

-- -----------------------------------------------------------------------------
-- 10. 실시간 신호
--
-- 결재란은 여럿이 동시에 보는 화면이다. 팀장이 서명하는 순간 기안자 화면의
-- 결재란이 채워져야 한다. 0012 와 같은 규약 — 내용은 싣지 않고 「다시 읽어라」만
-- 보낸다. 화면을 그리는 것은 언제나 서버다.
--
-- ⚠ 기안 중인 문서에는 신호를 보내지 않는다.
--   0012 의 표들은 「그 업무를 볼 수 있는 사람 = 그 행을 볼 수 있는 사람」이라
--   토픽 하나로 권한이 맞아떨어졌다. 결재는 다르다 — 기안 중인 문서는 기안자만
--   본다. 그대로 두면 업무를 열어 둔 사람 전원의 브라우저에 「결재 쪽에서 뭔가
--   움직였다」가 배달된다. 화면에는 아무것도 안 나타나지만(서버가 RLS 를 통과한
--   것만 그린다) **초안을 쓰고 있다는 사실 자체가 새어 나간다.**
-- -----------------------------------------------------------------------------

-- 결재 문서 자신. 0012 의 broadcast_work_touch 를 그대로 쓰지 않는 이유가 위 경고다.
create or replace function app.broadcast_approval_doc_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_work_id uuid;
begin
  -- 상신하는 순간(drafting → in_progress)은 new.state 가 이미 in_progress 다.
  -- 기안 중에 만들어지고 고쳐지고 지워지는 동안에는 아무도 모른다.
  if coalesce(new.state, old.state) = 'drafting' then
    return null;
  end if;

  v_work_id := coalesce(new.work_id, old.work_id);

  if v_work_id is not null then
    perform realtime.send(
      jsonb_build_object(
        'kind',    'approval',
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

-- 결재란. 업무 id 를 직접 들고 있지 않아 문서를 한 번 거친다.
create or replace function app.broadcast_approval_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_work_id uuid;
  v_state   text;
begin
  select a.work_id, a.state::text into v_work_id, v_state
  from public.approval a
  where a.id = coalesce(new.approval_id, old.approval_id);

  if v_state = 'drafting' then
    return null;
  end if;

  if v_work_id is not null then
    perform realtime.send(
      jsonb_build_object(
        'kind',    'approval',
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

revoke all on function app.broadcast_approval_touch() from public, anon, authenticated;
revoke all on function app.broadcast_approval_doc_touch() from public, anon, authenticated;

drop trigger if exists trg_approval_broadcast on approval;
create trigger trg_approval_broadcast
  after insert or update or delete on approval
  for each row execute function app.broadcast_approval_doc_touch();

drop trigger if exists trg_approval_step_broadcast on approval_step;
create trigger trg_approval_step_broadcast
  after insert or update or delete on approval_step
  for each row execute function app.broadcast_approval_touch();

-- -----------------------------------------------------------------------------
-- 11. 함수 실행 권한
--
-- 0012 §4 의 규칙을 그대로 따른다. 새로 만든 함수는 기본값이 PUBLIC EXECUTE 다.
-- 정책이 부르는 함수는 **정책을 평가하는 역할**에 EXECUTE 가 있어야 하므로
-- (0004 §3 에 적힌 그 사고) authenticated 에게 명시적으로 준다.
-- -----------------------------------------------------------------------------

revoke all on function app.can_read_approval(uuid)        from public, anon;
revoke all on function app.is_approval_approver(uuid)     from public, anon;
revoke all on function app.is_approval_draft_owner(uuid)  from public, anon;
revoke all on function app.can_sign_step(uuid)            from public, anon;

grant execute on function app.can_read_approval(uuid)       to authenticated;  -- 정책이 부른다
grant execute on function app.is_approval_approver(uuid)    to authenticated;  -- 정책이 부른다
grant execute on function app.is_approval_draft_owner(uuid) to authenticated;  -- 정책이 부른다
grant execute on function app.can_sign_step(uuid)           to authenticated;  -- 화면이 부른다

-- 남의 차례를 물어볼 수 있는 문은 열지 않는다. 겉면(can_sign_step)만 연다.
revoke all on function app.step_block_reason(uuid, uuid) from public, anon, authenticated;

-- 번호를 뽑는 것은 상신 절차의 일이다. 직접 부르면 번호만 앞당겨진다.
revoke all on function app.next_doc_no(text) from public, anon, authenticated;

-- 완결 판정은 절차 안에서만 쓴다.
revoke all on function app.approval_is_done(uuid) from public, anon, authenticated;

grant execute on function public.submit_approval(uuid)         to authenticated;
grant execute on function public.sign_approval(uuid, text)     to authenticated;
grant execute on function public.reject_approval(uuid, text)   to authenticated;
grant execute on function public.withdraw_approval(uuid)       to authenticated;

revoke all on function public.submit_approval(uuid)       from anon, public;
revoke all on function public.sign_approval(uuid, text)   from anon, public;
revoke all on function public.reject_approval(uuid, text) from anon, public;
revoke all on function public.withdraw_approval(uuid)     from anon, public;
