-- 0024 · 보충이 어느 기록에서 왔는지 — 「보충으로 넣기」의 자국
--
-- 「규칙이 무엇을 걸렀나」에서 안 실린 기록을 누르면 그 원문이 그대로 보충
-- (handover_note)으로 들어간다. 그때 어느 기록이었는지를 남겨야
--   ① 같은 기록을 두 번 넣는 것을 DB가 막고
--   ② 화면이 그 줄을 「보충됨」으로 표시할 수 있다.
-- 사람이 직접 적은 보충은 null 이다. 값은 `comment:<대화 id>` 또는
-- `section:<항목 키>` — 화면(handover-draft.ts 의 missedSourceRef)이 만든다.
--
-- 정책은 손대지 않는다. 행 단위 규칙(누가·언제 쓰고 지우나)은 0014 그대로이고,
-- 이 칸은 그 행에 붙는 꼬리표일 뿐이다.

alter table handover_note
  add column if not exists source_ref text;

alter table handover_note
  drop constraint if exists handover_note_source_ref_check;
alter table handover_note
  add constraint handover_note_source_ref_check
  check (source_ref is null or source_ref ~ '^(comment|section):.+$');

-- 한 인계 건에서 같은 기록은 한 번만. 직접 적은 보충(null)은 세지 않는다.
create unique index if not exists handover_note_source_ref_key
  on handover_note (handover_id, source_ref)
  where source_ref is not null;
