-- =============================================================================
-- 일머리(Ilmeori) — 0014 인계서에 사람이 보태는 칸
--
-- 인계 화면은 이렇게 적고 있었다.
--
--   "그대로 제출하는 문서가 아니라 인계자가 확인하고 고쳐야 하는 초안입니다."
--
-- 그런데 고칠 수단이 없었다. 인계에 딸린 동작은 다섯 개(시작·확인·실행·취소·
-- 시연 되돌리기)뿐이고 그중 초안에 손대는 것이 하나도 없다. 화면에도 입력칸이
-- 없어서, 남은 길은 인쇄해서 손으로 쓰거나 업무 문서를 고쳐 다시 뽑는 것뿐이었다.
--
-- 특히 3번 항목은 코드가 스스로 이렇게 적고 표시(needsHuman)까지 달아 두었다.
--
--   "이 시스템에는 물품·예산 정보가 없습니다. 재무회계시스템과 물품관리대장을
--    확인해 인계자가 직접 적어야 합니다."
--
-- 직접 적어야 한다고 말해 놓고 적을 칸이 없는 것은 미구현이 아니라 **화면이
-- 어긋나는 지점**이다.
--
-- ── 왜 전문 편집이 아니라 항목별 덧붙임인가 ─────────────────────────────────
--
-- 이 제품의 주장은 「문장마다 어느 기록에서 나왔는지 적는다」이다.
-- 사람이 규칙으로 뽑은 문단을 덮어쓰면 그 문장은 근거를 잃고, 옆에 붙어 있는
-- 근거 꼬리표가 그 순간 거짓말이 된다. 근거를 붙이려고 만든 장치가 근거를
-- 무너뜨리는 셈이다.
--
-- 그래서 규칙이 뽑은 본문은 손대지 못하게 두고, 사람이 적은 것은 **별도의 행으로
-- 쌓아** 화면과 종이 양쪽에서 「인계자 보충」으로 따로 표시한다. 셋이 함께 풀린다.
--
--   · 3번 항목은 원래 비어 있으므로 보충 칸이 곧 본문이 된다
--   · 규칙이 뽑은 문단과 그 근거 꼬리표는 그대로 남는다
--   · 「기계가 뽑고 사람이 보탠다」가 문구가 아니라 화면으로 보인다
--
-- ── 고치는 길을 두지 않는 이유 ──────────────────────────────────────────────
--
-- 보충 한 줄에는 누가 언제 적었는지가 함께 붙고, 그 날짜는 인쇄본에도 찍힌다.
-- 몸통만 나중에 바뀔 수 있으면 종이에 찍힌 날짜가 거짓이 된다.
-- 지우고 다시 적으면 새 시각이 붙으므로 그쪽이 사실에 가깝다.
-- 그래서 UPDATE 는 정책도 권한도 주지 않는다.
--
-- 지우기는 **실행 전에만** 연다. 0008의 인계 취소와 같은 판단이다 — 아직 아무
-- 권한도 옮겨 가지 않은 초안을 지우는 것은 기록을 지우는 것이 아니라 오타를
-- 고치는 것이다. 실행이 끝나면 0011의 trg_lock_completed_handover 와 같은 규칙을
-- 따라 더하지도 지우지도 못한다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 표
--
-- block_key 는 별지 제12호서식의 어느 칸에 붙는 글인지를 가리킨다.
-- 값을 check 로 묶어 둔 이유는, 이 일곱 칸이 우리가 정한 것이 아니라
-- 「행정업무의 운영 및 혁신에 관한 규정 시행규칙」이 정한 것이기 때문이다.
-- 앱이 여덟 번째 칸을 만들 수 있으면 그건 이미 그 서식이 아니다.
-- (폼을 거치지 않은 요청이 엉뚱한 칸 이름을 실어 보내도 여기서 걸린다.
--  화면은 아는 칸만 그리므로, 없었다면 아무 데도 안 보이는 행이 쌓였을 것이다)
-- -----------------------------------------------------------------------------

create table if not exists handover_note (
  id          uuid primary key default gen_random_uuid(),
  handover_id uuid not null references handover(id) on delete cascade,
  block_key   text not null,
  body        text not null,
  author_id   uuid not null references profile(id),
  created_at  timestamptz not null default now(),

  constraint handover_note_block_key_check check (
    block_key in (
      '1-duties',    -- 1-가. 담당 업무
      '1-progress',  -- 1-나. 주요 업무계획 및 진행사항
      '1-issues',    -- 1-다. 현안사항 및 문제점
      '1-pending',   -- 1-라. 주요 미결사항
      '2-docs',      -- 2. 관련 문서 현황
      '3-assets',    -- 3. 주요 물품 및 예산 등 인계·인수가 필요한 사항
      '4-notes'      -- 4. 그 밖의 참고사항
    )
  ),

  -- 빈 글이 쌓이면 종이에 이름과 날짜만 찍힌 줄이 나온다.
  --
  -- "걷어낼 문자를 나열"하지 않고 **눈에 보이는 글자가 하나라도 있는가**로 묻는다.
  -- 나열하면 반드시 빠진다 — 인자 하나짜리 btrim 은 공백(U+0020)만 걷어내고,
  -- 목록을 손으로 늘려도 전각 공백(U+3000)이나 웹에서 붙여넣은 nbsp(U+00A0)가
  -- 남는다. 둘 다 한글 환경에서 실제로 밟는 값이다(PGlite 로 하나씩 확인했다).
  -- [[:space:]] 가 대부분을 덮고, 그것이 공백으로 치지 않는 nbsp(U+00A0)와
  -- BOM(U+FEFF)만 따로 적는다. 글자 자체가 아니라 \u 표기로 적는 이유는,
  -- 눈에 보이지 않는 글자를 소스에 심어 두면 나중에 누가 지워도 아무도 모르기 때문이다.
  --
  -- 앱은 자바스크립트 trim 으로 걸러 내지만 서버 액션은 폼을 거치지 않고
  -- 부를 수 있으므로, DB에도 같은 판정이 있어야 한다.
  --
  -- 상한은 앱(HANDOVER_NOTE_MAX)과 같은 값이다. 한쪽만 있으면 반드시 어긋난다.
  -- length() 는 바이트가 아니라 글자를 센다 — 한글 1000자가 그대로 1000이다.
  constraint handover_note_body_check check (
    body ~ '[^[:space:]\u00a0\ufeff]' and length(body) <= 1000
  )
);

comment on table handover_note is
  '인계자가 서식 항목에 직접 보탠 글. 규칙이 뽑은 본문은 고치지 않고 이 표에 쌓는다.';

comment on column handover_note.block_key is
  '별지 제12호서식의 항목. 값은 src/lib/types.ts 의 HANDOVER_BLOCK_KEYS 와 같다.';

comment on column handover_note.created_at is
  '적은 시각. 인쇄본에 그대로 찍히므로 나중에 몸통만 바뀌면 이 값이 거짓이 된다.';

-- 시연 되돌리기(seed/reset-demo.sql)에는 이 표를 적지 않는다. 그 파일은
-- gen-seed.mjs 가 만들어 내는 생성물이라 손으로 고치면 다음 생성 때 사라지고,
-- 무엇보다 truncate ... cascade 가 handover 를 비울 때 이 표를 함께 비운다.
-- (반대로 적어 두면 0014를 아직 안 돌린 프로젝트에서 되돌리기 전체가 멈춘다)

-- 이름을 붙이고 if not exists 를 단다. 이름 없이 만들면 두 번째로 붙여 넣었을 때
-- 오류가 아니라 **같은 모양의 인덱스가 하나 더** 조용히 생긴다.
create index if not exists handover_note_handover_id_created_at_idx
  on handover_note (handover_id, created_at);

-- -----------------------------------------------------------------------------
-- 2. 권한과 정책
--
-- 0005의 이벤트 트리거가 새 표에 RLS를 자동으로 켜지만, 여기서도 명시한다.
-- 자동에 기대면 그 트리거가 사라진 환경에서 이 표만 조용히 열린다.
-- -----------------------------------------------------------------------------

alter table handover_note enable row level security;
alter table handover_note force row level security;

grant select, insert, delete on handover_note to authenticated;

-- 고치는 길은 두지 않는다. 정책은 실수로 열릴 수 있고 권한은 그렇지 않다.
-- (0004가 앞으로 만들 표의 기본 권한을 이미 걷어내므로 대개 아무 일도 하지
--  않지만, 이 파일만 읽어도 무엇이 닫혀 있어야 하는지 보이도록 적어 둔다)
revoke update on handover_note from authenticated;
revoke all on handover_note from anon;

-- 읽기는 당사자 둘 다. 인수자가 못 읽으면 넘겨받는 사람이 정작 보충을 못 본다.
-- 실행이 끝난 뒤에도 읽힌다 — 잠그는 것은 쓰기이지 읽기가 아니다.
drop policy if exists handover_note_select on handover_note;
create policy handover_note_select on handover_note
  for select to authenticated
  using (exists (
    select 1 from handover h
    where h.id = handover_note.handover_id
      and (h.from_profile_id = (select auth.uid())
           or h.to_profile_id = (select auth.uid()))
  ));

-- 쓰기는 인계자만. 인계서는 넘기는 사람이 쓰고 확인하는 문서이고,
-- 인수자가 남의 인계서에 문장을 넣을 수 있으면 서명란의 뜻이 사라진다.
drop policy if exists handover_note_insert on handover_note;
create policy handover_note_insert on handover_note
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from handover h
      where h.id = handover_note.handover_id
        and h.from_profile_id = (select auth.uid())
        and h.status <> 'completed'
    )
  );

-- 지우기는 실행 전, 자기가 적은 것만.
drop policy if exists handover_note_delete on handover_note;
create policy handover_note_delete on handover_note
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1 from handover h
      where h.id = handover_note.handover_id
        and h.from_profile_id = (select auth.uid())
        and h.status <> 'completed'
    )
  );

-- -----------------------------------------------------------------------------
-- 3. 한 인계 건에 쌓을 수 있는 수
--
-- 앱에도 같은 상한이 있다(HANDOVER_NOTE_LIMIT). 앱 쪽은 넘겼을 때 **사용자에게
-- 읽을 수 있는 말을 해 주기 위한 것**이고, 실제로 막는 것은 여기다 —
-- 서버 액션은 폼을 거치지 않고 부를 수 있고, 정책에 걸린 삽입은 오류가 아니라
-- 0행으로 조용히 끝나므로 정책으로는 이 판정을 할 수 없다.
--
-- 상한이 없으면 인계자가 자기 인계서 하나로 인수자의 화면과 인쇄본을 못 쓰게
-- 만들 수 있고, 실행이 끝나면 그 줄들은 아무도 지울 수 없다.
-- 일곱 칸짜리 서식에 서른 줄이면 실제 쓰임에는 넉넉하다.
-- -----------------------------------------------------------------------------

create or replace function app.trg_handover_note_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.handover_note
  where handover_id = new.handover_id;

  if v_count >= 30 then
    raise exception '이 인계서에 보충을 더 담을 수 없습니다. 한 건에 30개까지입니다.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$fn$;

revoke all on function app.trg_handover_note_limit() from public, anon, authenticated;

drop trigger if exists trg_handover_note_limit on handover_note;

create trigger trg_handover_note_limit
  before insert on handover_note
  for each row execute function app.trg_handover_note_limit();
