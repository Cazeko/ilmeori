-- =============================================================================
-- 일머리(Ilmeori) — 0005 새 표에 RLS 자동 적용
--
-- 무엇을 왜 하는지는 docs/supabase-설정.md 의 「0005」 항에 적었다.
-- 이 파일에는 설명을 길게 쓰지 않는다. Supabase SQL Editor가 붙여 넣은 SQL을
-- 문장 단위로 쪼갤 때 주석 안의 특정 낱말이 조각나 그대로 실행되는 일이 있었다.
-- =============================================================================

create or replace function app.auto_enable_rls()
returns event_trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    -- 표를 만드는 명령에만 반응한다.
    -- 낱말을 그대로 비교하지 않고 앞 여섯 글자만 보는 이유가 둘 있다.
    --   1. 표를 만드는 구문이 여러 가지인데 전부 CREATE 로 시작한다
    --   2. 이 파일에 문제의 낱말을 남기지 않는다
    -- 만드는 명령에만 반응하므로, 아래에서 실행하는 alter 로 트리거가 한 번 더
    -- 돌더라도 조건에 걸리지 않고 끝난다. 재귀가 생기지 않는다.
    -- 시드가 RLS를 잠시 끄는 동안에도 되살리지 않는다.
    if obj.object_type = 'table'
       and obj.schema_name = 'public'
       and (left(obj.command_tag, 6) = 'CREATE'
            or obj.command_tag = 'SELECT INTO')
       and not exists (
         -- 확장이 자기 용도로 만든 표는 건드리지 않는다.
         -- 확장은 자기 표를 자기가 읽을 수 있다고 가정하고 동작한다.
         select 1 from pg_depend d
         where d.objid = obj.objid and d.deptype = 'e'
       )
    then
      execute format(
        'alter table %s enable row level security',
        obj.object_identity
      );
      raise notice
        'RLS 자동 적용: % — 정책을 추가하기 전까지 아무도 읽을 수 없습니다.',
        obj.object_identity;
    end if;
  end loop;
end
$fn$;

revoke all on function app.auto_enable_rls() from public, anon, authenticated;

drop event trigger if exists trg_auto_enable_rls;

create event trigger trg_auto_enable_rls
  on ddl_command_end
  execute function app.auto_enable_rls();

comment on function app.auto_enable_rls() is
  'public 스키마에 새로 만들어진 표에 RLS를 자동으로 켠다.';
