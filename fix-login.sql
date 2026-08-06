do $$
declare
  col text;
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and data_type in ('text', 'character varying')
      and column_name in (
        'confirmation_token', 'recovery_token', 'email_change',
        'email_change_token_new', 'email_change_token_current',
        'phone_change', 'phone_change_token', 'reauthentication_token'
      )
  loop
    execute format('update auth.users set %I = $1 where %I is null', col, col)
      using '';
  end loop;
end $$;
