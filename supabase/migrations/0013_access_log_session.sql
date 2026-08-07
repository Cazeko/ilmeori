-- =============================================================================
-- 일머리(Ilmeori) — 0013 열람기록은 사람이 연 횟수를 센다
--
-- 이 표는 "누가 이 업무를 열어 봤는가"를 세는 감사 기록이다. 그런데 화면이
-- 다시 그려질 때마다 한 줄씩 쌓고 있었다. 탭을 옮겨도, 뒤로 가기로 돌아와도,
-- 그리고 0012 로 실시간이 붙은 뒤로는 **남이 고칠 때마다** 한 줄이 쌓인다.
--
--   신호 한 건 → 그 업무를 열어 둔 사람 전원의 화면이 다시 그려짐
--                → 그 서버 렌더가 log_access(work.viewed) 를 다시 부름
--
-- 옆자리 사람이 문서를 스무 번 저장하면 내 열람기록에 「업무 열람」이 예순 줄
-- 넘게 찍힌다(잠금 → 저장 → 해제가 세 건이다). 나는 한 번 열었을 뿐이다.
-- access_log 에는 INSERT 정책도 GRANT 도 없어 한 번 들어간 줄은 지울 수 없다.
--
-- **감사에서 「예순 번 들여다봤다」는 「한 번 열었다」보다 나쁜 거짓이다.**
-- 없는 열람을 지어내는 쪽이, 한 번의 열람 세션을 한 줄로 세는 쪽보다 위험하다.
--
-- 그래서 같은 사람의 같은 업무 열람은 10분을 **한 번의 열람**으로 본다.
-- 열람 사실이 빠지는 것이 아니라, 한 번 앉아서 본 것이 한 줄이 된다.
-- 파일 내려받기(target_id 가 있는 기록)는 건드리지 않는다 — 그건 횟수가 곧 뜻이다.
-- =============================================================================

-- security definer 함수는 소유자(postgres) 역할로 돈다. access_log 는 force rls 이고
-- 0002 의 select 정책은 to authenticated 라 postgres 에는 걸리지 않는다. 이 정책이
-- 없으면 아래의 exists 가 **언제나 0행**이 되어 중복 억제가 조용히 죽는다.
-- (0012 가 realtime.messages 정책에 postgres 를 함께 적은 것과 같은 이유다)
--
-- 열어 주는 범위는 이 함수가 이미 하고 있는 일 안쪽이다. postgres 역할은
-- 애플리케이션이 쓰지 않는다 — 서버 코드는 언제나 사용자 세션으로 붙는다.
drop policy if exists access_log_select_definer on access_log;
create policy access_log_select_definer on access_log
  for select to postgres using (true);

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

  -- 같은 사람이 같은 업무를 10분 안에 다시 연 것은 같은 열람으로 본다.
  -- 못 세는 쪽이 아니라 겹쳐 세는 쪽을 막는 것이다.
  if p_target_id is null and exists (
    select 1 from public.access_log
    where work_id   = p_work_id
      and actor_id  = (select auth.uid())
      and kind      = p_kind
      and target_id is null
      and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into public.access_log (work_id, target_id, actor_id, kind)
  values (p_work_id, p_target_id, (select auth.uid()), p_kind);
end;
$$;

-- 0004 §3 과 같은 형태로 다시 못박는다. create or replace 는 권한을 유지하지만,
-- 이 파일만 따로 실행하는 경우까지 생각하면 적어 두는 편이 안전하다.
revoke all on function public.log_access(uuid, access_kind, uuid) from public, anon;
grant execute on function public.log_access(uuid, access_kind, uuid) to authenticated;
