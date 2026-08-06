-- =============================================================================
-- 일머리(Ilmeori) — 0007 공개 범위는 소유자만 바꾼다
--
-- 0002의 work_update 정책은 owner와 editor 모두에게 UPDATE를 허용한다.
-- 대부분의 칸에는 그게 맞다. 제목·설명·마감일·진행상태는 같이 일하는 사람이
-- 고칠 수 있어야 협업 도구다.
--
-- 그런데 visibility 한 칸만은 성격이 다르다. 이 값은 업무의 내용이 아니라
-- **누가 이 업무를 읽을 수 있는가**를 통째로 정한다. 편집자가 'city'로 돌리는 순간
-- 시 전체 직원이 그 업무의 문서와 대화를 읽게 되고, 그건 편집 권한을 준 사람이
-- 동의한 적 없는 결과다. 권한을 나눠 주는 일은 소유자의 몫으로 남겨야 한다.
--
-- 애플리케이션(src/lib/actions/members.ts)에서도 소유자로 좁혔지만,
-- 서버 액션은 화면을 거치지 않고 POST로 직접 부를 수 있고 PostgREST는 더 직접적이다.
-- 애플리케이션에만 있는 규칙은 규칙이 아니라 관행이다.
--
-- ── 왜 정책을 고치지 않고 트리거를 쓰는가 ──────────────────────────────────
--
-- RLS 정책은 "이 행을 고칠 수 있는가"까지만 말할 수 있고, "어떤 칸을 고쳤는가"는
-- 보지 못한다. work_update를 소유자로 좁히면 편집자가 진행상태조차 못 바꾸게 된다.
-- 칸 단위 규칙은 트리거의 일이다. 0003의 trg_profile_immutable_fields가 같은 이유로
-- 같은 모양을 하고 있다.
-- =============================================================================

create or replace function app.trg_guard_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.visibility is not distinct from old.visibility then
    return new;
  end if;

  -- 마이그레이션·시드 경로는 통과시킨다. 로그인한 사용자가 없는 호출이다.
  -- (0003의 trg_profile_immutable_fields와 같은 판단이다)
  if (select auth.uid()) is null then
    return new;
  end if;

  if not app.is_work_owner(new.id) then
    raise exception '공개 범위는 소유자만 바꿀 수 있습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$fn$;

revoke all on function app.trg_guard_visibility() from public, anon, authenticated;

drop trigger if exists trg_guard_visibility on work;

create trigger trg_guard_visibility
  before update on work
  for each row execute function app.trg_guard_visibility();

comment on function app.trg_guard_visibility() is
  '공개 범위 변경을 소유자로 제한한다. 편집 권한과 권한 배분 권한은 다른 것이다.';
