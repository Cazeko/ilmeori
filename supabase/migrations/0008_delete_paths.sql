-- =============================================================================
-- 일머리(Ilmeori) — 0008 지울 수 없던 두 곳
--
-- 실제 Supabase에 붙여 왕복 검증을 돌리다 발견한 것 둘. 둘 다 "정책은 허용하는데
-- 실행하면 막힌다" 또는 "만들 수는 있는데 되돌릴 수 없다" 부류다.
-- 문법이 맞아서 코드만 봐서는 보이지 않고, 한 번 밟아야 나온다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 업무를 지울 수 없던 문제
--
-- 0002의 work_delete 정책은 소유자에게 삭제를 허용한다. 그런데 실제로 지우면
-- 이렇게 끝난다:
--
--   ERROR: 마지막 소유자는 해제할 수 없습니다. 다른 소유자를 먼저 지정하세요.
--
-- work_member 가 work 를 on delete cascade 로 참조하므로, 업무를 지우면 참여자 행이
-- 연쇄로 지워지고 그때 trg_guard_last_owner 가 걸린다. 소유자를 아무리 늘려도
-- 마지막 한 명을 지우는 순간 같은 자리에서 막히므로 **어떤 방법으로도 지울 수 없다.**
--
-- 정책이 허용한다고 적혀 있는데 실행하면 언제나 실패하는 것은 그 자체로 결함이다.
-- 읽는 사람이 "여기는 열려 있구나"라고 잘못 판단하게 만든다.
--
-- 가드의 목적은 「주인 없는 업무 = 아무도 열 수 없는 업무」를 막는 것이다.
-- 업무 자체가 사라지는 중이라면 지킬 대상이 없다. 그때만 비켜서게 한다.
--
-- ※ 애플리케이션 화면은 여전히 삭제 대신 **보관**만 제공한다. 이건 DB를 정직하게
--   만드는 수정이지 제품 방침을 바꾸는 수정이 아니다. 쌓인 이력을 지우는 버튼을
--   일상 동선에 두지 않는다는 판단은 그대로다.
-- -----------------------------------------------------------------------------

-- 1-a. 이력을 남길 업무가 이미 사라진 경우
--
-- 가드를 비켜서게 하고 다시 지워 보면 이번엔 다른 곳에서 막힌다:
--
--   ERROR: insert or update on table "activity" violates foreign key constraint
--
-- 업무를 지우면 딸린 문서·첨부·참여자가 연쇄로 지워지고, 그 각각의 AFTER DELETE
-- 트리거가 "문서를 지웠습니다" 같은 이력을 남기려 한다. 그런데 그 이력이 가리킬
-- 업무는 방금 사라진 뒤다.
--
-- 트리거를 하나씩 고치지 않고 기록기 한 곳에서 막는다. 앞으로 이력을 남기는
-- 트리거를 더 붙여도 같은 자리에서 다시 걸리지 않는다.
-- 남길 곳이 없는 기록을 남기지 않는 것이지, 남겨야 할 기록을 버리는 것이 아니다
-- (업무가 사라지면 그 업무의 이력도 함께 사라지는 것이 원래 설계다).
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
as $fn$
begin
  if not exists (select 1 from public.work where id = p_work_id) then
    return;
  end if;

  insert into public.activity (work_id, actor_id, kind, summary, detail)
  values (p_work_id, (select auth.uid()), p_kind, p_summary, coalesce(p_detail, '{}'::jsonb));
end
$fn$;

revoke execute on function app.log_activity(uuid, activity_kind, text, jsonb)
  from public, anon, authenticated;

create or replace function app.trg_guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- 부모 업무가 이미 사라졌다면 연쇄 삭제 중이다.
  -- (Postgres는 부모 행을 먼저 지우고 참조 행을 정리한다)
  if tg_op = 'DELETE'
     and not exists (select 1 from public.work where id = old.work_id) then
    return old;
  end if;

  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if (select count(*) from public.work_member
        where work_id = old.work_id and role = 'owner') <= 1 then
      raise exception '마지막 소유자는 해제할 수 없습니다. 다른 소유자를 먼저 지정하세요.'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end
$fn$;

-- -----------------------------------------------------------------------------
-- 2. 시작한 인계를 되돌릴 수 없던 문제
--
-- 0002는 handover 에 select·insert·update 만 준다. delete 정책도 GRANT도 없다.
-- 완료된 인계는 그래야 한다 — 권한이 실제로 옮겨 간 사건이고, 지울 수 있는
-- 감사 기록은 감사 기록이 아니다.
--
-- 그런데 **아직 실행되지 않은 인계**는 사정이 다르다. 인수자를 잘못 골라 초안을
-- 만들었을 때 되돌릴 방법이 없으면, 그 사람은 영영 새 인계를 시작할 수 없다
-- (한 번에 한 건만 진행하도록 막아 두었기 때문이다). 아무 일도 일어나지 않은
-- 초안을 지우는 것은 기록을 지우는 것이 아니라 오타를 고치는 것이다.
--
-- 그래서 completed 가 아닌 것에 한해, 인계자 본인만 지울 수 있게 한다.
-- 완료된 인계는 정책 자체가 걸러 내므로 지울 방법이 없다.
-- 각 업무에 남은 handover.completed 이력은 activity 에 있고 그건 어차피 못 지운다.
-- -----------------------------------------------------------------------------

grant delete on handover to authenticated;

drop policy if exists handover_delete_unstarted on handover;

create policy handover_delete_unstarted on handover
  for delete to authenticated
  using (
    from_profile_id = (select auth.uid())
    and status <> 'completed'
  );

comment on policy handover_delete_unstarted on handover is
  '실행 전 인계만 취소할 수 있다. 완료된 인계는 권한이 옮겨 간 사건이므로 남는다.';
