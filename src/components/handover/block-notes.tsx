import { PenLine, Trash2 } from "lucide-react";
import { addHandoverNote, deleteHandoverNote } from "@/lib/actions/handover";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Textarea } from "@/components/ui/field";
import { formatFullDateTime } from "@/lib/format";
import {
  HANDOVER_NOTE_MAX,
  type HandoverBlockKey,
  type HandoverNoteWithAuthor,
} from "@/lib/types";

/**
 * 서식 항목 하나에 인계자가 새로 적는 칸.
 *
 * ── 어디에 서나 ────────────────────────────────────────────────────────────
 *
 * 별지 제12호서식(print-sheet.tsx) **안**, 그 항목의 규칙이 뽑은 문단과
 * 이미 적힌 보충 바로 아래다. 한동안 서식 아래 별도 카드에 일곱 항목을 한 번
 * 더 그리고 거기서 적게 했는데, 적는 자리와 실리는 자리가 화면 한 벌 만큼
 * 떨어져 있어 사람이 위아래를 오가며 적었다. 지금은 적는 자리가 곧 실리는
 * 자리다 — 저장하면 그 자리에 「인계자 보충: 이름, 날짜」로 선다.
 *
 * 종이에는 안 나간다. 서식이 이 칸을 `print:hidden` 층에 넣고, 서식 시험이
 * 그 층을 걷어낸 뒤 「종이에 누를 것이 없다」를 본다(tests/handover-sheet).
 *
 * ── 왜 전문 편집이 아닌가 ──────────────────────────────────────────────────
 *
 * 이 제품의 주장은 「문장마다 어느 기록에서 나왔는지 적는다」이다.
 * 사람이 규칙으로 뽑은 문단을 덮어쓰면 그 문장은 근거를 잃고, 바로 위에 붙어
 * 있는 근거 꼬리표가 그 순간 거짓말이 된다. 그래서 규칙이 뽑은 본문은 손대지
 * 못하게 두고, 사람이 적은 것은 아래에 **따로 쌓아** 누가 언제 적었는지와
 * 함께 보여 준다.
 *
 * ── 고치는 버튼이 없는 이유 ────────────────────────────────────────────────
 *
 * 보충에는 적은 시각이 붙고 그 날짜가 인쇄본에 그대로 찍힌다. 몸통만 나중에
 * 바뀔 수 있으면 종이에 찍힌 날짜가 거짓이 된다. 지우고 다시 적으면 새 시각이
 * 붙으므로 그쪽이 사실에 가깝다. DB도 같다 — UPDATE 는 정책도 권한도 없다.
 */
export function BlockNoteForm({
  handoverId,
  blockKey,
  heading,
  hasNotes,
  /** 채울 근거가 없어 원래 비어 있는 항목(물품·예산). 입력칸을 펼친 채로 둔다. */
  needsHuman = false,
}: {
  handoverId: string;
  blockKey: HandoverBlockKey;
  heading: string;
  hasNotes: boolean;
  needsHuman?: boolean;
}) {
  const inputId = `note-${blockKey}`;
  return (
    // <details>는 스크립트 없이도 열린다. 이 앱의 화면은 전부 그래야 한다.
    // 원래 비어 있는 항목(물품·예산)만 펼친 채로 둔다 — 거기가 실제로
    // 사람이 적어야 하는 자리이고, 일곱 개를 다 펼쳐 두면 서식이 아니라
    // 설문지처럼 보인다.
    <details open={needsHuman && !hasNotes} className="mt-2">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-90">
        <PenLine aria-hidden className="size-4" />
        보충 적기
      </summary>
      <form
        action={addHandoverNote}
        // 같은 폼이 항목마다 하나씩, 최대 일곱 개다. 어느 항목의 칸인지는 이 이름이 진다.
        aria-label={`「${heading}」에 보충 적기`}
        className="mt-1"
      >
        <input type="hidden" name="handoverId" value={handoverId} />
        <input type="hidden" name="blockKey" value={blockKey} />
        <Field
          id={inputId}
          label="보충 내용"
          // 빈 채로 눌러도 브라우저가 막는다. 스크립트가 아니라 브라우저 기본
          // 기능이라 자바스크립트를 꺼도 동작한다.
          required
          hint="저장하면 이 자리에 「인계자 보충」으로 실립니다. 인계를 실행한 뒤에는 더하거나 지울 수 없습니다."
        >
          {(p) => (
            <Textarea
              {...p}
              name="body"
              maxLength={HANDOVER_NOTE_MAX}
              className="min-h-24"
              placeholder={
                needsHuman
                  ? "예) 물품관리대장상 인계 대상 물품 3건(노트북 1, 계측기 2). 2027년도 예산 요구서는 예산재정과와 8월 12일 협의 예정."
                  : "이 항목에 덧붙일 내용을 적어 주세요."
              }
            />
          )}
        </Field>
        <div className="mt-2 flex justify-end">
          <SubmitButton size="sm">보충 적기</SubmitButton>
        </div>
      </form>
    </details>
  );
}

/**
 * 보충 한 줄 지우기 — 실행 전에만, 자기가 적은 것만.
 *
 * 서식 안의 「인계자 보충: 이름, 날짜」 줄 옆에 선다(print-sheet.tsx 의
 * noteExtras). 종이에는 안 나간다.
 */
export function NoteDeleteForm({
  note,
  heading,
}: {
  note: HandoverNoteWithAuthor;
  heading: string;
}) {
  return (
    <form action={deleteHandoverNote} className="-my-2 inline-block">
      <input type="hidden" name="blockKey" value={note.block_key} />
      <input type="hidden" name="noteId" value={note.id} />
      <SubmitButton
        variant="ghost"
        size="sm"
        className="min-h-11 px-2"
        // 한 화면에 '삭제'가 여럿 놓인다. 소리로만 듣고도 어느 항목의 어느
        // 줄을 지우는지 알 수 있어야 한다.
        aria-label={`「${heading}」에 ${formatFullDateTime(note.created_at)}에 적은 보충 삭제`}
      >
        <Trash2 aria-hidden className="size-4" />
        삭제
      </SubmitButton>
    </form>
  );
}
