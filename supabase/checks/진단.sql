-- 연결이 안 될 때 어디서 멈췄는지 보는 질의.
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 실행한다.

select '1. 계정'      as 항목, count(*)::text as 값 from auth.users
union all
select '2. 로그인수단', count(*)::text from auth.identities
union all
select '3. 프로필',     count(*)::text from profile
union all
select '4. 부서',       count(*)::text from department
union all
select '5. 업무',       count(*)::text from work
union all
select '6. 이력',       count(*)::text from activity;

-- 기대값: 계정 16 · 로그인수단 16 · 프로필 16 · 부서 89 · 업무 18 · 이력 64
-- 전부 0이면 시드가 아예 안 들어간 것이다.

-- 계정이 있다면 상태를 본다.
select
  u.email,
  u.email_confirmed_at is not null              as 메일확인됨,
  u.encrypted_password is not null              as 비밀번호있음,
  left(coalesce(u.encrypted_password, ''), 4)   as 해시방식,
  u.banned_until,
  (select count(*) from auth.identities i where i.user_id = u.id) as 로그인수단
from auth.users u
order by u.email
limit 5;

-- 해시방식이 '$2a$' 나 '$2b$' 로 시작해야 정상이다.
-- 비어 있으면 비밀번호가 안 걸린 것이고, 로그인수단이 0이면 identities 행이 없는 것이다.
