-- =============================================================================
-- 일머리(Ilmeori) — 0011 업무의 칸마다 주인을 정한다
--
-- 0007은 visibility 한 칸만 잠갔다. 코드 리뷰에서 같은 표의 다른 칸들이 그대로
-- 열려 있다는 것이 드러났고, PGlite로 재현해 확인했다. work_update 정책은
-- can_edit_work(= owner 또는 editor) 하나뿐이고 GRANT도 표 단위라, 정책과 권한
-- 어느 층도 "어떤 칸을 고쳤는가"를 보지 않는다.
--
-- 실제로 재현된 것 셋:
--
--   1) 편집자가 `update work set department_id = <남의 과>` 를 보내면 통과한다.
--      부서 공개 업무의 소관이 통째로 옮겨 가므로, 그 순간 남의 과 직원 전원이
--      업무·문서·대화·첨부·이력을 읽고(모든 정책이 can_read_work를 재사용한다)
--      원래 과의 비참여자는 업무가 사라진다. **그리고 이력에 한 줄도 남지 않는다.**
--      소관 부서를 바꾸는 정상 경로는 앱에도 execute_handover에도 없다.
--
--   2) 편집자가 `update work set owner_id = 자기 자신` 을 보내면 통과하고,
--      append-only인 activity에 「주담당을 ○○에게 넘겼습니다」가 박힌다.
--      소유자도 지울 수 없는 기록이므로, "이력은 위조할 수 없다"가 깨진다.
--      게다가 앱은 주담당을 참여자에서 빼지 못하게 막아 두어서(members.ts),
--      소유자가 주담당을 되찾아 오기 전까지 그 편집자를 제외할 수도 없다.
--
--   3) 편집자가 `update work set archived_at = now()` 로 업무를 모두의 보드에서
--      내릴 수 있다. 앱은 보관을 소유자로 좁혀 두었지만 DB는 그렇지 않았다.
--
-- 정책을 소유자로 좁히는 것으로는 풀 수 없다. 그러면 편집자가 진행상태나 문서
-- 제목조차 못 바꾸게 되어 협업 도구가 아니게 된다. 칸 단위 규칙은 트리거의 일이다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 칸마다 누가 고칠 수 있는가
--
--   department_id · fiscal_year  아무도. 정상 경로가 존재하지 않는 값이다
--   visibility · owner_id · archived_at   소유자만
--   나머지(title·description·due_date·status·previous_year_work_id)  편집자 이상
--
-- 0007의 트리거를 이 함수로 갈아 끼운다. 이름을 바꾸는 대신 같은 이름을 재정의해
-- 0007만 적용된 환경에서도 이 파일 하나로 최신 상태가 되게 한다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_guard_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- 마이그레이션·시드 경로는 통과시킨다. 로그인한 사용자가 없는 호출이다.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- 소관 부서와 회계연도는 이 제품에 바꾸는 길이 없다.
  -- 화면에도 없고 execute_handover도 손대지 않는다. 즉 값이 움직였다면
  -- 그것은 폼을 거치지 않은 요청이라는 뜻이다.
  if new.department_id is distinct from old.department_id then
    raise exception '소관 부서는 이 화면에서 바꿀 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.fiscal_year is distinct from old.fiscal_year then
    raise exception '회계연도는 바꿀 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 아래 셋은 "누가 이 업무를 볼 수 있는가"와 "누가 이 업무의 주인인가"를 정한다.
  -- 편집 권한은 내용을 고치라고 준 것이지 권한을 나눠 주라고 준 것이 아니다.
  if new.visibility is distinct from old.visibility
     or new.owner_id is distinct from old.owner_id
     or new.archived_at is distinct from old.archived_at then

    if not app.is_work_owner(new.id) then
      raise exception '공개 범위·주담당·보관은 소유자만 바꿀 수 있습니다.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- 주담당은 소유 권한을 가진 참여자여야 한다. 아니면 자기 이름이 붙은 업무를
  -- 고치지 못하는 사람이 생긴다. execute_handover는 후임을 owner로 넣은 뒤에
  -- work.owner_id를 옮기므로 이 검사를 그대로 통과한다.
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

revoke all on function app.trg_guard_visibility() from public, anon, authenticated;

comment on function app.trg_guard_visibility() is
  '업무의 칸마다 고칠 수 있는 사람을 정한다. 정책은 행만 보고 칸은 보지 못한다.';

-- -----------------------------------------------------------------------------
-- 2. 완료된 인계는 통째로 잠근다
--
-- 0008의 handover_delete_unstarted 는 status <> 'completed' 를 신뢰 경계로 쓴다.
-- 그런데 status 자체가 인계자가 UPDATE 할 수 있는 칸이라(handover_update 정책),
-- 완료된 인계를 'confirmed' 로 되돌린 다음 지우는 두 걸음이 가능했다.
-- 권한이 실제로 옮겨 간 기록이 두 번의 요청으로 사라지면 그건 감사 기록이 아니다.
--
-- 각 업무에 남은 handover.completed 이력은 activity 에 있고 그건 어차피 못 지우지만,
-- 인계 건 자체가 사라지면 "누가 누구에게 무엇을 언제 넘겼는가"의 목록이 없어진다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_lock_completed_handover()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if old.status = 'completed' then
    raise exception '완료된 인계는 되돌리거나 고칠 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$fn$;

revoke all on function app.trg_lock_completed_handover() from public, anon, authenticated;

drop trigger if exists trg_lock_completed_handover on handover;

create trigger trg_lock_completed_handover
  before update on handover
  for each row execute function app.trg_lock_completed_handover();

-- -----------------------------------------------------------------------------
-- 3. 업무 이력이 한 번에 한 칸만 남기던 문제
--
-- 0006의 trg_work_activity 는 title → due_date → visibility → description 을
-- elsif 사슬로 검사한다. 제목과 마감일을 함께 고치면 제목만 기록되고 마감일은
-- 사라진다. 수정 화면은 네 칸을 한 폼으로 받으므로 이건 드문 경우가 아니라 기본이다.
--
-- 「작년 이맘때」 연결과 보관 여부는 아예 보지 않았다. 보관은 그 업무를 조직의
-- 시야에서 내리는 결정이라 오히려 기록이 꼭 필요한 자리다.
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

  -- 아래는 elsif 가 아니라 각각 독립이다. 한 폼으로 여러 칸을 함께 고치므로
  -- 사슬로 두면 첫 하나만 남고 나머지는 소리 없이 사라진다.
  if new.title is distinct from old.title then
    perform app.log_activity(
      new.id, 'work.updated', '업무 제목을 고쳤습니다',
      jsonb_build_object('before', old.title, 'after', new.title));
  end if;

  if new.due_date is distinct from old.due_date then
    perform app.log_activity(
      new.id, 'work.updated',
      case when new.due_date is null then '마감일을 지웠습니다'
           else format('마감일을 %s로 바꿨습니다',
                       to_char(new.due_date, 'YYYY년 FMMM월 FMDD일')) end,
      jsonb_build_object('before', old.due_date, 'after', new.due_date));
  end if;

  if new.visibility is distinct from old.visibility then
    perform app.log_activity(
      new.id, 'work.updated', '공개 범위를 바꿨습니다',
      jsonb_build_object('before', old.visibility, 'after', new.visibility));
  end if;

  if new.description is distinct from old.description then
    perform app.log_activity(
      new.id, 'work.updated', '설명을 고쳤습니다',
      jsonb_build_object('before', old.description, 'after', new.description));
  end if;

  if new.previous_year_work_id is distinct from old.previous_year_work_id then
    perform app.log_activity(
      new.id, 'work.updated',
      case when new.previous_year_work_id is null
           then '작년 이맘때 연결을 끊었습니다'
           else '작년 이맘때 업무를 연결했습니다' end,
      jsonb_build_object('before', old.previous_year_work_id,
                         'after',  new.previous_year_work_id));
  end if;

  if new.archived_at is distinct from old.archived_at then
    perform app.log_activity(
      new.id, 'work.updated',
      case when new.archived_at is null then '보관을 해제했습니다'
           else '업무를 보관했습니다' end,
      jsonb_build_object('before', old.archived_at, 'after', new.archived_at));
  end if;

  return new;
end
$fn$;
