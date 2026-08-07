-- =============================================================================
-- 일머리(Ilmeori) — 0015 인계서의 주인을 정한다
--
-- 0014가 「보충은 인계자만 적는다」를 정책으로 못박았다.
--
--   create policy handover_note_insert ... with check (
--     author_id = auth.uid()
--     and exists (select 1 from handover h
--                 where h.id = handover_id and h.from_profile_id = auth.uid() ...))
--
-- 그 판정이 handover.from_profile_id 를 믿는다. 그런데 **그 칸을 상대가 고칠 수
-- 있었다.** 0002의 handover_update 는 당사자 둘 모두에게 UPDATE 를 열어 두고,
-- 어떤 칸을 고치는지는 보지 않는다(정책은 행만 보고 칸은 못 본다 — 0011의 교훈이
-- 같은 표에서 한 번 더 나온 것이다).
--
-- PGlite 로 재현한 순서는 이렇다.
--
--   ① 인수자: update handover set from_profile_id = 나, to_profile_id = 상대  → 통과
--   ② 인수자: insert into handover_note ... author_id = 나                   → 통과
--   ③ 인계자: insert into handover_note ...                                  → 정책 위반으로 거절
--   ④ 인수자: update handover set status = 'completed'                       → 통과
--      (그리고 0011의 trg_lock_completed_handover 때문에 되돌릴 수도 없다)
--
-- 즉 넘겨받는 사람이 남의 인계서를 가로채 자기 문장을 넣고, 원래 인계자를
-- 자기 문서에서 밀어낼 수 있었다. 서명란에 인계자 이름이 찍혀 나가는 문서에서
-- 이것은 위조다. 업무가 실제로 넘어가지는 않지만(execute_handover 가 업무별
-- 소유자를 다시 확인한다) **문서의 저자가 바뀐다.**
--
-- 0014 이전에도 있던 구멍이다. 그때는 고칠 수 있는 칸이 status·document_draft
-- 뿐이라 눈에 띄지 않았을 뿐이고, 보충 칸이 붙으면서 실제로 쓸 수 있는 길이 됐다.
--
-- ── 고치는 방법 ────────────────────────────────────────────────────────────
--
-- 두 겹으로 막는다. 0011과 같은 짜임이다.
--   1) 정책: 인계 건을 고치는 것은 인계자뿐이다. 인수자는 읽기만 한다.
--   2) 트리거: 인계자라도 당사자 두 칸은 못 바꾼다.
--
-- 인수자에게서 UPDATE 를 걷어도 잃는 기능이 없다. 앱에서 인수자가 인계 건을
-- 고치는 경로는 처음부터 없었다 — 확인(confirmHandover)도 실행(executeHandover)도
-- 취소(cancelHandover)도 전부 인계자 본인만 할 수 있는지 먼저 확인한다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 인계 건을 고치는 것은 인계자뿐
--
-- 읽기(handover_select)는 그대로 둔다. 넘겨받는 사람이 무엇을 넘겨받는지
-- 못 보면 인계서가 아니다.
-- -----------------------------------------------------------------------------

drop policy if exists handover_update on handover;

create policy handover_update on handover
  for update to authenticated
  using (from_profile_id = (select auth.uid()))
  with check (from_profile_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. 당사자 두 칸은 아무도 못 바꾼다
--
-- 정책을 인계자로 좁혀도 인계자 자신이 to_profile_id 를 바꾸는 길은 남는다.
-- 그건 「인수자를 잘못 골랐다」의 해결책이 아니다 — 그 경우의 정답은 취소하고
-- 다시 시작하는 것이고(0008), 그래야 잘못 만든 인계 건이 기록에 남는다.
-- 인계서를 조용히 다른 사람 앞으로 돌려놓을 수 있으면 「누가 누구에게 넘겼는가」의
-- 목록이 사후에 바뀐다.
--
-- 0011의 trg_lock_completed_handover 를 같은 이름으로 다시 정의한다.
-- 이 트리거는 이미 handover 에 before update 로 걸려 있으므로, 새 트리거를
-- 하나 더 달아 두 개가 같은 표를 지키게 만들지 않는다.
-- (0011만 적용된 환경에서도 이 파일 하나로 최신 상태가 된다 — 0011이 0007에
--  했던 것과 같은 방식이다)
-- -----------------------------------------------------------------------------

create or replace function app.trg_lock_completed_handover()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctx text;
begin
  -- 마이그레이션·시드 경로는 통과시킨다. 로그인한 사용자가 없는 호출이다.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- 실행이 끝난 인계는 통째로 잠긴다(0011).
  if old.status = 'completed' then
    raise exception '완료된 인계는 되돌리거나 고칠 수 없습니다.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 누가 누구에게 넘기는가는 인계를 시작할 때 정해진다.
  -- 바꾸려면 취소하고 다시 시작해야 한다. 그래야 그 사실이 기록에 남는다.
  if new.from_profile_id is distinct from old.from_profile_id
     or new.to_profile_id is distinct from old.to_profile_id then
    raise exception '인계자와 인수자는 바꿀 수 없습니다. 취소하고 새로 시작해 주세요.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 「완료」는 **권한이 실제로 옮겨 갔다**는 뜻이고, 그것을 아는 것은
  -- execute_handover 뿐이다. 이 칸을 손으로 적을 수 있으면 업무가 한 건도
  -- 넘어가지 않은 인계서에 완료 도장이 찍힌다 — 화면은 「인계가 끝났습니다」라고
  -- 말하고, 인쇄본의 「인계일」에는 그날 날짜가 찍히고, 그 뒤로는 위의 잠금 때문에
  -- 되돌리지도 취소하지도 실행하지도 못한다. 되돌릴 수 없는 거짓이 남는다.
  --
  -- ── 「지금 execute_handover 안인가」를 어떻게 아는가 ───────────────────────
  --
  -- 호출 스택을 직접 본다. GET DIAGNOSTICS ... PG_CONTEXT 는 plpgsql 이 기본으로
  -- 주는 값이고 아무 권한도 필요 없다.
  --
  --   PL/pgSQL function app.trg_lock_completed_handover() line 9 at GET DIAGNOSTICS
  --   SQL statement "update public.handover set status = 'completed' ..."
  --   PL/pgSQL function execute_handover(uuid) line 41 at SQL statement   ← 이 줄
  --
  -- 처음에는 execute_handover 에 사용자 정의 매개변수를 붙여 표시하려 했는데,
  -- **Supabase 에서는 그 문장 자체가 거절된다** — 그렇게 붙이려면 superuser 여야 하고
  -- Supabase 의 postgres 역할은 superuser 가 아니다(42501). PGlite 는 superuser 로
  -- 도는 탓에 그대로 통과해서, 실물에 붙이고 나서야 드러났다.
  -- 무엇을 쓰면 안 되는지는 supabase/verify.mjs 의 검사와 docs/supabase-설정.md 에 적었다.
  -- 함수 본문을 이 파일에 복사해 한 줄을 끼우는 방법도 있지만, 이 제품에서 가장
  -- 중요한 함수를 두 벌로 만드는 값이 더 비싸다.
  --
  -- 이름만 보고 판정하는 것이 걱정된다면: 앱 사용자는 함수를 만들 수 없다.
  -- 0004가 public 스키마의 CREATE 권한을 회수했고, PostgREST 는 DDL 을 받지 않는다.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    get diagnostics v_ctx = pg_context;
    if v_ctx not like '%execute_handover(uuid)%' then
      raise exception '인계 완료는 실행 절차로만 기록됩니다.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end
$fn$;

revoke all on function app.trg_lock_completed_handover() from public, anon, authenticated;

comment on function app.trg_lock_completed_handover() is
  '완료된 인계를 잠그고, 인계자·인수자가 사후에 바뀌지 않게 한다. 0014의 보충 정책이 from_profile_id 를 신뢰 기준으로 쓴다.';

drop trigger if exists trg_lock_completed_handover on handover;

create trigger trg_lock_completed_handover
  before update on handover
  for each row execute function app.trg_lock_completed_handover();

-- execute_handover 는 손대지 않는다 — 트리거가 호출 스택을 직접 보므로
-- 함수 쪽에 표시를 붙일 필요가 없다.

-- -----------------------------------------------------------------------------
-- 3. 보충의 「빈 글」 판정을 로케일에서 떼어 낸다
--
-- 0014는 이 판정을 [[:space:]] 로 적었다. 그 낱말 부류가 어떤 글자를 공백으로
-- 볼지는 **DB 로케일이 정한다.** PGlite(C.UTF-8)에서는 전각 공백(U+3000)이 잡히지만
-- 다른 로케일에서는 안 잡힐 수 있고, 그러면 전각 공백만 담긴 보충이 들어가
-- 종이에 이름과 날짜만 찍힌 줄이 남는다 — 그 제약을 둔 이유가 바로 그것이다.
--
-- 가릴 글자를 코드포인트로 직접 적는다. 로케일이 무엇이든 같은 결과가 나온다.
-- 글자 자체가 아니라 \u 표기로 적는 이유는, 눈에 보이지 않는 글자를 소스에 심어
-- 두면 나중에 누가 지워도 아무도 모르기 때문이다.
--
-- (0014를 이미 적용한 프로젝트가 있다. 표를 다시 만드는 문장은 이미 있는 표의 제약을
--  건드리지 않으므로 여기서 갈아 끼운다 — 0011이 0007의 트리거를 갈아 끼운 것과 같다)
--
-- 목록: 탭·줄바꿈 계열(U+0009~U+000D) · 공백(U+0020) · NEL(U+0085) ·
--       nbsp(U+00A0) · U+1680 · U+2000~U+200A · 줄·문단 구분(U+2028·U+2029) ·
--       좁은 nbsp(U+202F) · U+205F · 전각 공백(U+3000) · BOM(U+FEFF)
-- -----------------------------------------------------------------------------

alter table handover_note drop constraint if exists handover_note_body_check;

alter table handover_note add constraint handover_note_body_check check (
  body ~ '[^\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'
  and length(body) <= 1000
);
