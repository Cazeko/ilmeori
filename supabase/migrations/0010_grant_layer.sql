-- =============================================================================
-- 일머리(Ilmeori) — 0010 GRANT 층을 실제로 세운다
--
-- 0002는 이렇게 적어 두었다:
--
--   RLS는 "어떤 행"을 볼지 정하고, GRANT는 "어떤 동작"을 할 수 있는지 정한다.
--   둘 다 걸어야 한다.
--
-- 실제 Supabase 프로젝트에 붙여 확인해 보니 그 문장이 절반만 참이었다.
-- authenticated 로 로그인해 각 동작을 찔러 보면 이렇게 나온다:
--
--   department INSERT      42501  권한층에서 차단   ✓
--   department DELETE      통과(0행)                ← RLS만 막고 있다
--   profile    DELETE      통과(0행)                ← RLS만 막고 있다
--   comment    DELETE      통과(0행)                ← RLS만 막고 있다
--   handover_item UPDATE   통과(0행)                ← RLS만 막고 있다
--   activity   DELETE      42501  권한층에서 차단   ✓
--
-- 42501로 막히는 것은 0004가 **명시적으로 회수한** 것들뿐이다. 나머지는 표를 만들 때
-- Supabase의 default privileges 로 authenticated 에게 들어간 권한이 그대로 남아 있다.
-- 0004의 `alter default privileges ... revoke` 는 **앞으로 만들 표**에만 걸리고,
-- `revoke all on all tables ... from anon` 은 anon 에게만 걸린다.
-- 0001에서 이미 만들어진 표들에 대한 authenticated 의 권한은 아무도 걷어내지 않았다.
--
-- 지금 유출이 일어나고 있다는 뜻은 아니다. RLS가 정책 없는 동작을 전부 0행으로 막는다.
-- 문제는 방어가 한 겹이면서 두 겹인 것처럼 적혀 있다는 것이다. 정책을 하나 잘못 건드리는
-- 순간 그것이 곧 사고가 되고, 그때 "GRANT가 막아 줄 것"이라는 기대는 틀린 기대다.
--
-- 여기서는 0002가 각 표에 주기로 한 것만 남기고 나머지를 걷어낸다.
-- PGlite 검증 환경에는 default privileges 가 없어 이 회수가 아무 일도 하지 않는다.
-- 이 마이그레이션이 실제로 고치는 것은 배포된 프로젝트다.
-- =============================================================================

-- 조직도는 열람만. 부서를 만들고 지우는 것은 인사 데이터이고 마이그레이션의 몫이다.
revoke insert, update, delete on department from authenticated;

-- 프로필은 열람과 본인 수정만. 계정을 만들고 지우는 것은 auth 쪽 일이다.
revoke insert, delete on profile from authenticated;

-- 대화는 지우지 않고 지운 표시를 한다(deleted_at). 진짜 DELETE 로는 지웠다는 사실까지
-- 사라지고, 그 사실을 남기는 트리거도 UPDATE 에만 걸려 있어 아예 돌지 않는다.
-- 정책이 없어 지금도 막히지만, 정책은 실수로 열릴 수 있고 권한은 그렇지 않다.
revoke delete on comment from authenticated;

-- 인계 대상은 담거나 빼는 것만 한다. transferred 는 execute_handover 가 정하는 값이고
-- 사용자가 직접 켜면 "넘어가지 않았는데 넘어간 것으로 적힌" 행이 생긴다.
revoke update on handover_item from authenticated;

-- 감사 표에 대한 회수는 0004에서 이미 했다. 여기서 한 번 더 적어 두는 이유는,
-- 이 파일만 읽어도 '무엇이 닫혀 있어야 하는가'가 전부 보이게 하기 위해서다.
revoke insert, update, delete on activity   from authenticated;
revoke insert, update, delete on access_log from authenticated;
revoke update, delete           on doc_version from authenticated;

-- 익명은 어떤 경우에도 아무것도 하지 않는다.
revoke all on all tables in schema public from anon;
