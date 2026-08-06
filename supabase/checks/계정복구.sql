-- =============================================================================
-- 로그인이 500 "Database error querying schema" 로 실패할 때
--
-- SQL로 auth.users 행을 직접 만들면 confirmation_token 같은 텍스트 칸이
-- NULL로 남는다. GoTrue(인증 서버)는 이 칸들을 문자열로 읽기 때문에,
-- NULL을 만나면 읽기 자체가 실패하고 500을 돌려준다.
-- 대시보드에서 만든 계정은 GoTrue가 빈 문자열로 채워 두므로 이 문제가 없다.
--
-- 아래를 실행해 빈 문자열로 메운다. 여러 번 돌려도 안전하다.
-- =============================================================================

do $$
declare
  col text;
  fixed int := 0;
  n int;
begin
  -- 칸 이름은 GoTrue 버전마다 조금씩 다르다. 실제로 있는 것만 손댄다.
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and data_type in ('text', 'character varying')
      and column_name in (
        'confirmation_token',
        'recovery_token',
        'email_change',
        'email_change_token_new',
        'email_change_token_current',
        'phone_change',
        'phone_change_token',
        'reauthentication_token'
      )
  loop
    -- 빈 문자열을 SQL 문자열 안에 박지 않고 매개변수로 넘긴다.
    -- 따옴표 이스케이프 단계가 없어지면 틀릴 여지도 없다.
    execute format('update auth.users set %I = $1 where %I is null', col, col)
      using '';
    get diagnostics n = row_count;
    fixed := fixed + n;
  end loop;

  raise notice '빈 값으로 메운 칸: %건', fixed;
end $$;

-- 확인 — 남은 NULL이 없어야 한다.
select
  count(*) filter (where confirmation_token is null)     as confirmation_token,
  count(*) filter (where recovery_token is null)         as recovery_token,
  count(*) filter (where email_change is null)           as email_change,
  count(*) filter (where email_change_token_new is null) as email_change_token_new
from auth.users;
