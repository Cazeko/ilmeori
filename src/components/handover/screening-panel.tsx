import Link from "next/link";
import { Cog } from "lucide-react";
import { draftRefHref } from "@/components/handover/draft-lines";
import type { HandoverDraft, MissedRecord } from "@/lib/handover-draft";
import {
  ISSUE_CUES,
  ISSUE_CUE_NAMES,
  SECTION_CUE_WORDS,
} from "@/lib/handover-cues";
import { formatDate, formatFullDateTime } from "@/lib/format";

/**
 * 「규칙이 무엇을 걸렀나」 — 규칙이 **서식에 안 실은 것**을 세어서 원문으로 내놓는다.
 *
 * ── 왜 이 판이 있나 ────────────────────────────────────────────────────────
 *
 * 규칙 기반이라 반드시 놓친다. 그걸 말하지 않으면 서식이 다 채워진 것처럼
 * 보이고, *"규칙에 안 맞는 경우가 분명 있을 텐데 그때는 어떻게 됩니까 —
 * 극단적으로 공백으로 나오나요?"* 라는 물음에 내놓을 것이 말밖에 없다.
 *
 * 숫자와 원문 목록을 띄우면 **그 물음이 물음으로 성립하지 않는다.**
 * 공백으로 나오는 것이 아니라, 못 걸렀다고 화면이 먼저 말하고 고를 것은
 * 사람 앞에 놓인다. 이 제품이 파는 것은 완전성이 아니라 **측정 가능성**이다.
 *
 *   규칙은 놓칩니다. AI는 지어냅니다.
 *   놓친 건 셀 수 있고, 지어낸 건 셀 수 없습니다.
 *
 * ── 제목을 다시 넓혔다 ─────────────────────────────────────────────────────
 *
 * 처음 이 판은 「대화에서 무엇을 걸렀나」였다. 대화만 셀 수 있었기 때문이다 —
 * 「1-나」는 업무마다 문서 항목 하나만 싣고 나머지 본문은 어디에도 안 나오는데
 * 그걸 세는 자리가 없었다. 못 세는 것을 세었다고 말하지 않으려고 범위를 좁혀
 * 적었다. 이제 문서 항목도 같은 규칙으로 세므로 제목을 원래 자리로 넓힌다.
 *
 * ── 안 실린 이유가 둘이다 ──────────────────────────────────────────────────
 *
 * 「규칙 밖」은 규칙이 못 찾은 것이고, 「상한」은 규칙이 찾았는데 우리가 정한
 * 수에 잘린 것이다. 고쳐야 할 자리가 서로 다르므로 한 이름으로 부르지 않는다.
 * 예전에는 뒤의 것이 어느 목록에도 없이 사라졌다.
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
/**
 * 서식 위 캡션이 이 판으로 보내는 자리.
 *
 * 두 곳이 같은 문자열을 손으로 적으면 한쪽만 고치는 날이 온다 —
 * `handoverBlockAnchor()` 를 상수로 둔 것과 같은 이유다(types.ts:353).
 */
export const SCREENING_ANCHOR = "screening";

export function ScreeningPanel({
  screening,
}: {
  screening: HandoverDraft["screening"];
}) {
  const sources = [
    { name: "대화", screened: screening.comments },
    { name: "문서 항목", screened: screening.sections },
  ];

  // 볼 것이 아예 없으면 셀 것도 없다. 0 만 늘어놓으면 규칙이 실패한 것처럼 읽힌다.
  if (sources.every((s) => s.screened.seen === 0)) return null;

  const missed = sources.flatMap((s) =>
    s.screened.missed.map((m) => ({ ...m, source: s.name })),
  );
  const omitted = sources.reduce((n, s) => n + s.screened.omitted, 0);

  return (
    <section
      // 캡션이 이리로 보낸다. 붙박이 머리줄에 가리지 않게 여백을 둔다
      // (인계 항목들이 이미 쓰는 scroll-mt-20 과 같은 값).
      id={SCREENING_ANCHOR}
      className="scroll-mt-20 border-l border-l-rule-hair py-2 pl-3"
    >
      <h3 className="flex items-center gap-2 text-body-sm font-bold text-gray-90">
        <Cog aria-hidden className="size-4 shrink-0 text-gray-40" />
        규칙이 무엇을 걸렀나
      </h3>

      {/* 갈래마다 한 줄. 셋을 더하면 반드시 본 수가 된다(Screened 주석) —
          「안 실린 것」은 아래 목록 길이가 아니라 seen - used 다. 목록에는
          상한에 걸려 못 실은 것이 빠져 있고, 그 수를 목록 끝이 따로 밝힌다. */}
      <dl className="mt-2 flex flex-col gap-1">
        {sources.map((s) => (
          <div key={s.name} className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-16 shrink-0 text-body-xs text-gray-60">{s.name}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-3 text-body-xs text-gray-60">
              {[
                { label: "들여다본 것", value: s.screened.seen },
                { label: "서식에 실은 것", value: s.screened.used },
                { label: "안 실린 것", value: s.screened.seen - s.screened.used },
              ].map((n) => (
                <span key={n.label} className="inline-flex items-baseline gap-1">
                  {n.label}
                  <b className="text-body-sm leading-none font-bold tabular-nums text-gray-90">
                    {n.value}
                  </b>
                  건
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      {/* 「걸린 N건 중 M건만 실었다」는 여기 적지 않는다 — 같은 사실이 바로 아래
          「1-다」의 근거 꼬리표에 이미 있고, 같은 화면에서 두 번 말하면 둘 중
          하나가 틀렸을 때 어느 쪽이 맞는지 알 수 없게 된다. */}
      <p className="mt-2 text-body-sm leading-relaxed break-keep text-gray-70">
        규칙은 대화에서{" "}
        <strong className="font-bold text-gray-90">{ISSUE_CUE_NAMES}</strong>{" "}
        {ISSUE_CUES.length}갈래의 표현을, 문서 항목에서는 제목의{" "}
        <strong className="font-bold text-gray-90">{SECTION_CUE_WORDS}</strong>
        를 찾습니다. 뜻을 판정하지 않고 표현을 찾으므로{" "}
        <strong className="font-bold text-gray-90">
          반드시 놓치는 것이 있습니다.
        </strong>{" "}
        안 실린 것을 아래에 그대로 둡니다. 서식에 넣을 것은 인계자가 고릅니다.
      </p>

      {/* ── 이 판이 셀 수 없는 것 ────────────────────────────────────────────
          인터뷰가 같은 것을 세 번 말했다. 후임자는 전임자에게 20~30회
          전화하고(Q10), 사전 조율한 내용은 기록에 안 남고(Q27), 곤란한 것은
          *"필요할 시, 구두 전달"* 한다(Q16). **가장 값진 맥락은 체계적으로
          글이 아니라 말로 간다.**

          위 숫자는 「규칙이 놓친 것」을 세지만, 애초에 여기 없는 말은 놓칠
          수조차 없다. 세는 코드를 안 만들고 문장 하나로만 인정한다 —
          못 세는 것을 세었다고 말하지 않는 것이 이 판의 규율이고, 세는 척하는
          숫자를 하나 더 만드는 것이 정확히 그 규율을 어기는 일이다. */}
      <p className="mt-2 text-body-sm leading-relaxed break-keep text-gray-70">
        규칙이 세는 것은 일머리에 남은 기록뿐입니다. 결재 전 통화나 방문으로
        오간 말은 애초에 여기 없어 이 수에도 안 잡힙니다.
      </p>

      {missed.length > 0 ? (
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center py-2 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-80">
            서식에 안 실린 것 {missed.length}건 보기
          </summary>
          {/* 요약하지 않는다. 규칙이 왜 안 실었는지 설명하는 것보다, 글을
              그대로 두고 사람이 두 초 만에 넘기게 하는 편이 정직하다.
              다만 **긴 글은 잘린다**(220자). 잘렸다는 사실을 숨기면 이 판이
              스스로 어기는 규칙이 되므로, 잘린 글은 그렇다고 적고 원문으로
              가는 길을 함께 준다. */}
          <ul className="flex flex-col gap-2">
            {missed.map((m) => (
              <MissedRow key={`${m.source}-${m.key}`} record={m} />
            ))}
          </ul>
          {omitted > 0 ? (
            <p className="mt-2 pl-3 text-body-sm text-gray-60">
              그 밖에 {omitted}건이 더 있습니다. 업무마다 일부만 보여 주고
              나머지는 업무 화면에 그대로 있습니다.
            </p>
          ) : null}
        </details>
      ) : (
        <p className="mt-2 text-body-sm text-gray-60">
          이번에는 안 실린 것이 없습니다. 규칙이 모든 기록을 골랐다는 뜻이지,
          모든 현안을 찾았다는 뜻은 아닙니다.
        </p>
      )}
    </section>
  );
}

function MissedRow({ record: m }: { record: MissedRecord & { source: string } }) {
  const href = draftRefHref(m.ref);
  return (
    <li className="border-l border-l-rule-hair pl-3">
      <p className="flex flex-wrap items-center gap-x-2 text-body-xs text-gray-60">
        <Link
          href={href}
          className="font-bold text-gray-90 transition-colors duration-150 hover:text-primary"
        >
          {m.workTitle}
        </Link>
        <span>
          {m.source} · {m.label}
        </span>
        {m.at ? (
          <time
            dateTime={m.at}
            title={formatFullDateTime(m.at)}
            className="tabular-nums"
          >
            {formatDate(m.at)}
          </time>
        ) : null}
        {/* 왜 안 실렸는지를 줄마다 적는다. 「규칙 밖」은 규칙을 고칠 일이고
            「상한」은 수를 고칠 일이라, 같은 목록에 있어도 다른 이야기다. */}
        <span className="text-gray-60">{m.why}</span>
      </p>
      <p className="mt-1 text-body-sm leading-relaxed break-keep text-gray-80">
        “{m.body}”
        {m.truncated ? (
          <>
            {" "}
            <Link
              href={href}
              className="font-bold whitespace-nowrap text-gray-90 transition-colors duration-150 hover:text-primary"
            >
              (뒤가 잘렸습니다 — 원문 보기)
            </Link>
          </>
        ) : null}
      </p>
    </li>
  );
}
