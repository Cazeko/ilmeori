-- =============================================================================
-- 일머리(Ilmeori) — 0005 새 테이블에 RLS 자동 적용
--
-- public 스키마에 테이블이 새로 만들어지면 곧바로 RLS를 켠다.
--
-- ── 이게 막는 것은 공격이 아니라 우리 실수다 ────────────────────────────────
--
-- 외부에서 테이블을 만들어 데이터를 빼내는 경로는 0004에서 이미 닫혔다.
-- (public 스키마의 CREATE 권한을 anon·authenticated에서 회수했다)
--
-- 여기서 막는 것은 그 다음이다. 앞으로 기능을 붙이면서 테이블을 추가할 텐데,
-- 그때 RLS를 깜빡하면 그 표는 **처음부터 전부 공개**된 상태로 태어난다.
-- 마이그레이션 리뷰에서 걸러야 하지만, 걸러지지 않았을 때를 대비한 층이다.
--
-- 실패 방향이 안전한 쪽이라는 점이 중요하다.
-- RLS만 켜지고 정책이 없으면 **아무도 못 읽는다**. 새는 것보다 안 보이는 게 낫다.
--
-- ── 일부러 하지 않은 것 ─────────────────────────────────────────────────────
--
-- FORCE ROW LEVEL SECURITY 는 자동으로 걸지 않는다.
-- FORCE를 걸면 테이블 소유자에게도 정책이 적용되는데, 소유자 역할에
-- BYPASSRLS 속성이 없으면 마이그레이션이나 시드에서 자기 표에 INSERT 조차
-- 못 하게 된다. (PGlite로 실측: 소유자여도 차단, BYPASSRLS를 주면 통과)
-- 어디에 FORCE를 걸지는 표마다 판단할 문제라 자동화하지 않는다.
--
-- ── 권한 ────────────────────────────────────────────────────────────────────
--
-- CREATE EVENT TRIGGER 는 슈퍼유저 권한이 필요하다.
-- Supabase의 postgres 역할로 실행했을 때 "permission denied to create event
-- trigger" 가 나오면, 대시보드의 같은 기능(Enable automatic RLS)을 쓰면 된다.
-- 하는 일은 같고, 다만 프로젝트를 다시 만들면 대시보드 설정은 사라진다.
-- =============================================================================

create or replace function app.auto_enable_rls()
returns event_trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    -- 어떤 명령이었는지는 여기서 거른다.
    -- 트리거 정의(when tag in ...)에 적지 않는 이유는 아래 주석 참고.
    --
    -- 'CREATE TABLE ' || 'AS' 로 쪼개 둔 것도 같은 이유다.
    -- 편집기가 문장을 쪼갤 때 이 토큰을 알아보지 못하게 해서,
    -- 파일 어디에도 통째로 남지 않도록 했다. 실행 결과는 같다.
    if obj.command_tag = any (array[
         'CREATE TABLE',
         'CREATE TABLE ' || 'AS',
         'SELECT INTO'
       ])
       and obj.object_type = 'table'
       and obj.schema_name = 'public'
    then
      -- 확장(extension)이 자기 용도로 만든 표는 건드리지 않는다.
      -- 확장은 자기 표를 자기가 읽을 수 있다고 가정하고 동작하므로,
      -- 거기에 RLS를 걸면 확장이 조용히 망가진다.
      if not exists (
        select 1 from pg_depend d
        where d.objid = obj.objid and d.deptype = 'e'
      ) then
        execute format(
          'alter table %s enable row level security',
          obj.object_identity
        );
        raise notice
          'RLS 자동 적용: % — 정책을 추가하기 전까지 아무도 읽을 수 없습니다.',
          obj.object_identity;
      end if;
    end if;
  end loop;
end $$;

revoke all on function app.auto_enable_rls() from public, anon, authenticated;

drop event trigger if exists trg_auto_enable_rls;

-- 필터(when tag in ...)를 일부러 붙이지 않았다.
--
-- Supabase의 SQL Editor는 붙여 넣은 SQL을 문장 단위로 쪼개는데,
-- 그 과정에서 문자열 안의 CREATE TABLE 계열 토큰이 조각나면
-- 남은 조각이 그대로 실행된다. Postgres에서 `TABLE 이름` 은
-- `SELECT * FROM 이름` 의 줄임말이라, 그 조각이
--   ERROR: 42P01: relation "AS" does not exist
-- 로 터진다. (실제로 그렇게 실패했다)
--
-- 그래서 트리거는 모든 DDL에 걸어 두고, 어떤 명령이었는지는
-- 함수 안에서 판단한다. DDL은 자주 일어나는 일이 아니라 비용도 없다.
--
-- 재귀 걱정: 함수 안에서 실행하는 alter table 때문에 트리거가 한 번 더
-- 돌지만, 그때의 command_tag 는 ALTER TABLE 이라 조건에 걸리지 않고 끝난다.
create event trigger trg_auto_enable_rls
  on ddl_command_end
  execute function app.auto_enable_rls();

comment on function app.auto_enable_rls() is
  'public 스키마에 새로 만들어진 표에 RLS를 자동으로 켠다. 0005_auto_rls.sql 참고.';
