-- =============================================================================
-- 일머리(Ilmeori) — 0004 잠금 보강
--
-- 0002가 "누가 어느 행을 볼 수 있는가"를 정했다면, 여기서는 그 아래층을 막는다.
-- Supabase의 기본값은 개발 편의 쪽으로 열려 있어서, 그대로 두면
-- RLS를 아무리 잘 짜도 우회로가 남는다.
--
-- 대시보드의 Security Advisor가 잡아 주는 항목 중 SQL로 해결되는 것들을
-- 여기 모았다. 손으로 눌러 놓은 설정은 프로젝트를 다시 만들면 사라지지만
-- 마이그레이션은 남는다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. public 스키마에 아무나 테이블을 만들지 못하게 한다
--
-- Postgres 기본값은 PUBLIC(모든 역할)에게 public 스키마의 CREATE 권한을 준다.
-- 즉 로그인한 사용자가 자기 테이블을 만들 수 있고, 그 테이블에는 우리 RLS가 없다.
-- 거기에 데이터를 복사해 두면 우리가 만든 통제를 통째로 빠져나간다.
-- -----------------------------------------------------------------------------
revoke create on schema public from public;
revoke create on schema public from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. 앞으로 만들 테이블이 자동으로 권한을 얻지 않게 한다
--
-- Supabase는 public 스키마에 default privileges를 걸어 두어,
-- 새로 만든 테이블이 anon/authenticated에게 자동으로 열린다.
-- 새 테이블을 추가하면서 RLS를 깜빡하면 그 순간 전부 공개된다.
-- 기본을 닫아 두고, 필요한 테이블에만 명시적으로 GRANT 한다.
-- -----------------------------------------------------------------------------
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from anon, authenticated;

-- postgres 역할이 만드는 것에도 같은 규칙을 건다(대시보드에서 만든 테이블 포함).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. 함수 실행 권한 정리
--
-- Postgres는 함수를 만들면 PUBLIC에 EXECUTE를 자동으로 준다. 그걸 걷어낸다.
--
-- ※ authenticated에게서는 걷어내지 않는다.
--   RLS 정책이 함수를 호출할 때 **정책을 평가하는 사용자의 EXECUTE 권한을 검사**하기
--   때문이다. app.can_read_work 같은 헬퍼를 authenticated에서 회수하면
--   정책 자체가 permission denied로 죽고 아무도 아무것도 못 읽게 된다.
--   (실제로 이 마이그레이션을 처음 쓸 때 그렇게 만들어 39개 중 10개가 깨졌다)
--
--   보안상으로도 회수할 이유가 없다. 이 헬퍼들은 전부 **호출자 자신에 대한 판정**만
--   돌려준다. can_read_work는 "내가 이 업무를 볼 수 있나", my_department_id는
--   "내 소속이 어디인가"다. 직접 호출해도 select 한 번으로 알 수 있는 것 이상을
--   알아낼 수 없다.
--
--   실제로 위험한 것은 '쓰는' 함수인데, app.log_activity()는 0003에서 이미
--   anon·authenticated로부터 회수했다.
-- -----------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
  end loop;
end $$;

-- 사용자가 직접 불러야 하는 것만 다시 연다.
--   log_access        — 화면을 열었을 때 열람기록을 남긴다
--   execute_handover  — 인계 실행. 함수 안에서 호출자가 인계자 본인인지 다시 확인한다
grant execute on function public.log_access(uuid, access_kind, uuid) to authenticated;
grant execute on function public.execute_handover(uuid) to authenticated;

revoke all on function public.log_access(uuid, access_kind, uuid) from anon, public;
revoke all on function public.execute_handover(uuid) from anon, public;

-- -----------------------------------------------------------------------------
-- 4. 익명 역할을 확실히 닫는다
--
-- 이 제품에는 로그인 없이 볼 수 있는 화면이 없다.
-- anon이 무언가를 읽을 수 있다면 그건 전부 사고다.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

-- -----------------------------------------------------------------------------
-- 5. 감사 테이블은 갱신·삭제 자체를 막는다
--
-- 0002에서 INSERT 정책을 주지 않아 사용자가 쓸 수 없게 했지만,
-- 테이블 권한(GRANT) 층에서도 한 번 더 닫아 둔다.
-- 정책을 잘못 손대는 실수가 곧바로 사고가 되지 않도록 하는 이중 방어다.
-- -----------------------------------------------------------------------------
revoke insert, update, delete on activity from authenticated;
revoke insert, update, delete on access_log from authenticated;
revoke update, delete on doc_version from authenticated;

-- -----------------------------------------------------------------------------
-- 6. 확인용 뷰 — 배포 후 이걸 돌려 보면 구멍이 한눈에 보인다
--
--   select * from app.security_audit where ok = false;
--
-- 결과가 0행이 아니면 무언가 열려 있다는 뜻이다.
-- -----------------------------------------------------------------------------
create or replace view app.security_audit as
  -- RLS가 꺼진 테이블
  select
    'RLS 미적용'::text          as 항목,
    c.relname::text             as 대상,
    false                       as ok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all
  -- RLS는 켰지만 정책이 하나도 없는 테이블(= 아무도 못 읽는 상태. 대개 실수다)
  select
    'RLS 켜짐 · 정책 없음',
    c.relname::text,
    false
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)

  union all
  -- search_path를 고정하지 않은 SECURITY DEFINER 함수
  -- (검색 경로를 바꿔치기해 남의 함수를 실행시키는 고전적인 공격 경로다)
  select
    'SECURITY DEFINER · search_path 미고정',
    (p.oid::regprocedure)::text,
    false
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app')
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
      where cfg like 'search_path=%'
    )

  union all
  -- anon에게 남아 있는 테이블 권한
  select
    'anon 권한 잔존',
    table_name::text,
    false
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public';

revoke all on app.security_audit from anon, authenticated;

comment on view app.security_audit is
  '배포 후 점검용. select * from app.security_audit; 결과가 0행이어야 정상이다.';
