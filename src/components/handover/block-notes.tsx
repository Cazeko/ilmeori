import { PenLine, Trash2 } from "lucide-react";
import { addHandoverNote, deleteHandoverNote } from "@/lib/actions/handover";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Textarea } from "@/components/ui/field";
import { formatDate, formatFullDateTime } from "@/lib/format";
import {
  HANDOVER_NOTE_MAX,
  type HandoverBlockKey,
  type HandoverNoteWithAuthor,
} from "@/lib/types";

/**
 * 서식 항목 하나에 인계자가 보탠 글과, 새로 적는 칸.
 *
 * ── 왜 전문 편집이 아닌가 ──────────────────────────────────────────────────
 *
 * 이 제품의 주장은 「문장마다 어느 기록에서 나왔는지 적는다」이다.
 * 사람이 규칙으로 뽑은 문단을 덮어쓰면 그 문장은 근거를 잃고, 바로 위에 붙어
 * 있는 근거 꼬리표가 그 순간 거짓말이 된다. 근거를 붙이려고 만든 장치가
 * 근거를 무너뜨리는 셈이다.
 *
 * 그래서 규칙이 뽑은 본문은 손대지 못하게 두고, 사람이 적은 것은 아래에
 * **따로 쌓아** 누가 언제 적었는지와 함께 보여 준다. 「기계가 뽑고 사람이
 * 보탠다」가 문구가 아니라 화면으로 보이는 것이 이 배치의 값이다.
 *
 * ── 고치는 버튼이 없는 이유 ────────────────────────────────────────────────
 *
 * 보충에는 적은 시각이 붙고 그 날짜가 인쇄본에 그대로 찍힌다. 몸통만 나중에
 * 바뀔 수 있으면 종이에 찍힌 날짜가 거짓이 된다. 지우고 다시 적으면 새 시각이
 * 붙으므로 그쪽이 사실에 가깝다. DB도 같다 — UPDATE 는 정책도 권한도 없다.
 */
export function BlockNotes({
  handoverId,
  blockKey,
  heading,
  notes,
  canWrite,
  /** 채울 근거가 없어 원래 비어 있는 항목(물품·예산). 입력칸을 펼친 채로 둔다. */
  needsHuman = false,
}: {
  handoverId: string;
  blockKey: HandoverBlockKey;
  heading: string;
  notes: HandoverNoteWithAuthor[];
  canWrite: boolean;
  needsHuman?: boolean;
}) {
  // 읽기만 하는 사람(인수자)에게 보충이 없는 항목은 아무것도 그리지 않는다.
  // 빈 상자가 일곱 개 늘어서면 서식이 아니라 입력 폼처럼 보인다.
  if (notes.length === 0 && !canWrite) return null;

  const inputId = `note-${blockKey}`;

  return (
    <div className="mt-3 border-t border-dashed border-gray-20 pt-3">
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {notes.map((n) => (
            // 색을 accent(보라)로 쓰지 않는다. 이 화면에서 accent는 「기계가 뽑은
            // 것·근거 꼬리표」의 색이다. 사람이 적은 줄에 그 색을 쓰면 화면이
            // 구별하려고 만든 두 가지를 같은 색으로 칠하게 된다.
            <li
              key={n.id}
              className="rounded-r-md border-l-4 border-primary bg-primary-5 px-3.5 py-2.5"
            >
              {/* 삭제는 <form>이라 문단(<p>) 안에 넣을 수 없다. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1 text-body-xs font-bold text-primary">
                  <PenLine aria-hidden className="size-3" />
                  인계자 보충
                </span>
                <span className="text-body-xs font-bold text-gray-80">
                  {n.author.name} {n.author.position}
                </span>
                <time
                  dateTime={n.created_at}
                  title={formatFullDateTime(n.created_at)}
                  className="text-body-xs tabular-nums text-gray-60"
                >
                  {formatDate(n.created_at)}
                </time>

                {canWrite ? (
                  <form action={deleteHandoverNote} className="-my-2 ml-auto">
                    <input type="hidden" name="blockKey" value={blockKey} />
                    <input type="hidden" name="noteId" value={n.id} />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      className="min-h-11 px-2"
                      // 한 화면에 '삭제'가 여럿 놓인다. 소리로만 듣고도
                      // 어느 항목의 어느 줄을 지우는지 알 수 있어야 한다.
                      aria-label={`「${heading}」에 ${formatFullDateTime(
                        n.created_at,
                      )}에 적은 보충 삭제`}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      삭제
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
              <p className="mt-1 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
                {n.body}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {canWrite ? (
        // <details>는 스크립트 없이도 열린다. 이 앱의 화면은 전부 그래야 한다.
        // 원래 비어 있는 항목(물품·예산)만 펼친 채로 둔다 — 거기가 실제로
        // 사람이 적어야 하는 자리이고, 나머지 여섯 개까지 펼쳐 두면
        // 결재 문서가 아니라 설문지처럼 보인다.
        <details
          open={needsHuman && notes.length === 0}
          className={notes.length > 0 ? "mt-2.5" : undefined}
        >
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-body-sm font-bold text-gray-60 hover:text-gray-80">
            <PenLine aria-hidden className="size-4" />이 항목에 보충 적기
          </summary>
          <form action={addHandoverNote} className="mt-1">
            <input type="hidden" name="handoverId" value={handoverId} />
            <input type="hidden" name="blockKey" value={blockKey} />
            <Field
              id={inputId}
              label={`「${heading}」에 보충 적기`}
              // 빈 채로 눌러도 브라우저가 막는다. 이 검사는 스크립트가 아니라
              // 브라우저 기본 기능이라 자바스크립트를 꺼도 동작한다.
              // 없으면 서버까지 갔다가 일곱 칸짜리 문서의 맨 위로 튕긴다.
              required
              hint="규칙이 뽑은 위 문단은 그대로 두고, 적은 글이 아래에 따로 붙습니다. 누가 언제 적었는지가 함께 남고 인쇄본에도 그렇게 나옵니다. 인계를 실행한 뒤에는 더하거나 지울 수 없습니다."
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
              <SubmitButton size="sm">
                보충 적기
              </SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
