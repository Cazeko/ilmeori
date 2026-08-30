import Link from "next/link";
import { Cog } from "lucide-react";
import type { HandoverDraft } from "@/lib/handover-draft";
import { ISSUE_CUES, ISSUE_CUE_NAMES } from "@/lib/handover-cues";
import { formatDate, formatFullDateTime } from "@/lib/format";
import { workTalkHref } from "@/lib/types";

/**
 * 「미포착」 — 규칙이 **못 거른 것**을 세어서 원문으로 내놓는다.
 *
 * ── 왜 이 판이 있나 ────────────────────────────────────────────────────────
 *
 * 규칙 기반이라 반드시 놓친다. 그걸 말하지 않으면 서식이 다 채워진 것처럼
 * 보이고, *"규칙에 안 맞는 경우가 분명 있을 텐데 그때는 어떻게 됩니까 —
 * 극단적으로 공백으로 나오나요?"* 라는 물음에 내놓을 것이 말밖에 없다.
 *
 * 숫자 셋과 원문 목록을 띄우면 **그 물음이 물음으로 성립하지 않는다.**
 * 공백으로 나오는 것이 아니라, 못 걸렀다고 화면이 먼저 말하고 고를 것은
 * 사람 앞에 놓인다. 이 제품이 파는 것은 완전성이 아니라 **측정 가능성**이다.
 *
 *   규칙은 놓칩니다. AI는 지어냅니다.
 *   놓친 건 셀 수 있고, 지어낸 건 셀 수 없습니다.
 *
 * ── 무엇까지 세는지 정확히 말한다 ──────────────────────────────────────────
 *
 * 이 판이 세는 것은 **대화 하나**다. 「1-다. 현안사항」이 대화에서 뽑히기
 * 때문이고, 다른 칸이 무엇을 흘리는지는 여기서 세지 않는다. 그러니 제목도
 * 「규칙이 무엇을 걸렀나」가 아니라 **「대화에서 무엇을 걸렀나」**여야 한다.
 * 세는 범위를 넓게 말하면, 못 세는 것을 세었다고 말하는 셈이 된다.
 *
 * ── 서식이 아니다 ──────────────────────────────────────────────────────────
 *
 * 이 판은 `draft.blocks` 를 건드리지 않는다. 별지 제12호서식은 법이 정한 칸이고,
 * 미포착은 그 칸을 믿어도 되는지 보는 장치다. 그래서 종이(print-sheet)와
 * 저장본(document_draft)에는 한 글자도 나가지 않는다.
 *
 * ── 모양 ───────────────────────────────────────────────────────────────────
 *
 * 판 안에 판을 겹치지 않는다. 이 판은 이미 카드(「항목별 근거와 보충」) 안에
 * 있고, DESIGN.md §17.3 이 그 자리에서 채움과 네 변을 걷고 **왼쪽 선 하나만**
 * 남기라고 적어 두었다. 숫자도 문서 등급을 넘지 않는다 — §5.1, 통계 타일은
 * 아무리 커도 여백 등급이다. 아래 서식 항목 제목(17px)보다 커지면 확인 장치가
 * 확인 대상보다 무거워진다. 자바스크립트 없이 접힌다(`<details>`).
 */
export function ScreeningPanel({
  screening,
}: {
  screening: HandoverDraft["screening"];
}) {
  const { comments, matched, missed, omitted } = screening;

  // 볼 대화가 아예 없으면 셀 것도 없다. 0 세 개를 띄우면 규칙이 실패한 것처럼 읽힌다.
  if (comments === 0) return null;

  return (
    <section className="border-l border-l-rule-hair py-2 pl-3">
      <h3 className="flex items-center gap-2 text-body-sm font-bold text-gray-90">
        <Cog aria-hidden className="size-4 shrink-0 text-gray-40" />
        대화에서 무엇을 걸렀나
      </h3>

      <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
        {[
          { label: "들여다본 대화", value: comments },
          { label: "규칙에 걸린 것", value: matched },
          { label: "걸리지 않은 것", value: missed.length },
        ].map((n) => (
          <div key={n.label} className="flex items-baseline gap-1">
            <dt className="text-body-xs text-gray-60">{n.label}</dt>
            <dd className="text-body-sm leading-none font-bold tabular-nums text-gray-90">
              {n.value}건
            </dd>
          </div>
        ))}
      </dl>

      {/* 「걸린 N건 중 M건만 실었다」는 여기 적지 않는다 — 같은 사실이 바로 아래
          「1-다」의 근거 꼬리표에 이미 있고, 같은 화면에서 두 번 말하면 둘 중
          하나가 틀렸을 때 어느 쪽이 맞는지 알 수 없게 된다. */}
      <p className="mt-2 text-body-sm leading-relaxed break-keep text-gray-70">
        규칙은 <strong className="font-bold text-gray-90">{ISSUE_CUE_NAMES}</strong>{" "}
        {ISSUE_CUES.length}갈래의 표현을 찾습니다. 뜻을 판정하지 않고 표현을
        찾으므로{" "}
        <strong className="font-bold text-gray-90">
          반드시 놓치는 것이 있습니다.
        </strong>{" "}
        놓친 것을 아래에 그대로 둡니다. 서식에 넣을 것은 인계자가 고릅니다.
      </p>

      {missed.length > 0 ? (
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center py-2 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-80">
            걸리지 않은 대화 {missed.length}건 보기
          </summary>
          {/* 요약하지 않는다. 규칙이 왜 안 걸렀는지 설명하는 것보다, 글을
              그대로 두고 사람이 두 초 만에 넘기게 하는 편이 정직하다.
              다만 **긴 글은 잘린다**(220자). 잘렸다는 사실을 숨기면 이 판이
              스스로 어기는 규칙이 되므로, 잘린 글은 그렇다고 적고 원문으로
              가는 길을 함께 준다. */}
          <ul className="flex flex-col gap-2">
            {missed.map((m) => (
              <li key={m.commentId} className="border-l border-l-rule-hair pl-3">
                <p className="flex flex-wrap items-center gap-x-2 text-body-xs text-gray-60">
                  <Link
                    href={workTalkHref(m.workId, m.commentId)}
                    className="font-bold text-gray-90 transition-colors duration-150 hover:text-primary"
                  >
                    {m.workTitle}
                  </Link>
                  <span>{m.author}</span>
                  <time
                    dateTime={m.at}
                    title={formatFullDateTime(m.at)}
                    className="tabular-nums"
                  >
                    {formatDate(m.at)}
                  </time>
                </p>
                <p className="mt-1 text-body-sm leading-relaxed break-keep text-gray-80">
                  “{m.body}”
                  {m.truncated ? (
                    <>
                      {" "}
                      <Link
                        href={workTalkHref(m.workId, m.commentId)}
                        className="font-bold whitespace-nowrap text-gray-90 transition-colors duration-150 hover:text-primary"
                      >
                        (뒤가 잘렸습니다 — 원문 보기)
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
          {omitted > 0 ? (
            <p className="mt-2 pl-3 text-body-sm text-gray-60">
              그 밖에 {omitted}건이 더 있습니다. 업무마다 최근 것부터 보여 주고
              나머지는 업무 화면의 대화에 그대로 있습니다.
            </p>
          ) : null}
        </details>
      ) : (
        <p className="mt-2 text-body-sm text-gray-60">
          이번에는 걸리지 않은 대화가 없습니다. 규칙이 모든 대화를 골랐다는
          뜻이지, 모든 현안을 찾았다는 뜻은 아닙니다.
        </p>
      )}
    </section>
  );
}
