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
  /**
   * 「규칙이 무엇을 걸렀나」의 「보충으로 넣기」가 채워 보낸 글.
   *
   * 안 실린 기록의 원문이다. 있으면 칸을 펼친 채로 두고 그 글을 넣어 둔다 —
   * 인계자는 읽고 고쳐서 저장한다. 저장하기 전까지는 아무것도 남지 않는다.
   */
  prefill,
}: {
  handoverId: string;
  blockKey: HandoverBlockKey;
  heading: string;
  notes: HandoverNoteWithAuthor[];
  canWrite: boolean;
  needsHuman?: boolean;
  prefill?: string;
}) {
  // 읽기만 하는 사람(인수자)에게 보충이 없는 항목은 아무것도 그리지 않는다.
  // 빈 상자가 일곱 개 늘어서면 서식이 아니라 입력 폼처럼 보인다.
  if (notes.length === 0 && !canWrite) return null;

  const inputId = `note-${blockKey}`;

  return (
    // 점선은 「규칙이 뽑은 문단」과 「사람이 따로 쌓은 글」을 가를 때만 긋는다.
    // 보충이 0건이면 가를 것이 없고, 토글 하나를 괄호치는 가로줄이 항목마다
    // 일곱 번 반복되면 결재 서식이 아니라 설문지로 읽힌다.
    <div
      className={
        notes.length > 0
          ? "mt-3 border-t border-dashed border-rule-hair pt-3"
          : "mt-1"
      }
    >
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            // 색을 accent(보라)로 쓰지 않는다. 이 화면에서 accent는 「기계가 뽑은
            // 것·근거 꼬리표」의 색이다. 사람이 적은 줄에 그 색을 쓰면 화면이
            // 구별하려고 만든 두 가지를 같은 색으로 칠하게 된다.
            //
            // 파란 왼쪽 4px 띠 + 옅은 파란 면 + 오른쪽만 둥근 모서리였다.
            // 셋이 합쳐 「AI가 만든 안내상자」의 전형이고, 그중 둥근 모서리는
            // 지운 토큰(--radius-md)을 부르고 있어 이 시스템 밖의 값이었다.
            // 사람이 보탠 줄이라는 것은 아래 「인계자 보충」 꼬리표가 이미
            // 말한다. 면과 띠를 걷고 hair 선 한 줄만 남긴다.
            <li
              key={n.id}
              className="border-l border-l-rule-hair py-1 pl-3"
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
          open={(needsHuman && notes.length === 0) || Boolean(prefill)}
          className={notes.length > 0 ? "mt-3" : undefined}
        >
          {/* 「이 항목에」는 그 항목 안에 있으니 자명한 말이다. 일곱 번
              반복되면 문서가 아니라 설문지가 된다. 아래 Field 라벨이 어느
              항목인지를 이미 말하므로 여기서는 동작만 적는다. */}
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-80">
            <PenLine aria-hidden className="size-4" />
            보충 적기
          </summary>
          <form
            action={addHandoverNote}
            // 같은 폼이 항목마다 하나씩, 최대 일곱 개다. 라벨을 짧게 줄인 대신
            // 어느 항목의 칸인지는 이 이름이 진다.
            aria-label={`「${heading}」에 보충 적기`}
            className="mt-1"
          >
            <input type="hidden" name="handoverId" value={handoverId} />
            <input type="hidden" name="blockKey" value={blockKey} />
            {prefill ? (
              <p className="mb-2 text-body-sm font-bold break-keep text-gray-90">
                안 실린 기록의 원문을 채워 두었습니다. 읽고 필요 없는 부분은
                지운 뒤 저장하세요.
              </p>
            ) : null}
            <Field
              id={inputId}
              // 항목명은 바로 위 h3 에 이미 있다. 라벨에 통째로 되풀이하면
              // 같은 말이 55px 안에 두 번 선다. 어느 항목의 칸인지는 위
              // form 의 이름(랜드마크)이 진다.
              label="보충 내용"
              // 빈 채로 눌러도 브라우저가 막는다. 이 검사는 스크립트가 아니라
              // 브라우저 기본 기능이라 자바스크립트를 꺼도 동작한다.
              // 없으면 서버까지 갔다가 일곱 칸짜리 문서의 맨 위로 튕긴다.
              required
              // 화면 위쪽의 「왜 대화까지 보는가」 설명이 이미 「규칙이 뽑은
              // 문단과 섞지 않는다」를 말한다(handover/page.tsx).
              // 여기서는 이 칸에서만 알 수 있는 것 하나만 적는다.
              hint="인계를 실행한 뒤에는 더하거나 지울 수 없습니다."
            >
              {(p) => (
                <Textarea
                  {...p}
                  name="body"
                  maxLength={HANDOVER_NOTE_MAX}
                  defaultValue={prefill}
                  className={prefill ? "min-h-40" : "min-h-24"}
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
