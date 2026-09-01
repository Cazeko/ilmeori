import Link from "next/link";
import { ChevronRight, Cog, PenLine } from "lucide-react";
import { draftRefHref } from "@/components/handover/draft-lines";
import { ButtonLink } from "@/components/ui/button";
import {
  missedTargetBlock,
  screeningTotal,
  QUOTES_PER_WORK,
  type HandoverDraft,
  type MissedRecord,
  type Screened,
} from "@/lib/handover-draft";
import {
  ISSUE_CUES,
  ISSUE_CUE_NAMES,
  SECTION_CUE_WORDS,
} from "@/lib/handover-cues";
import { formatDate, formatFullDateTime } from "@/lib/format";
import type { HandoverBlockKey } from "@/lib/types";

/**
 * 「규칙이 무엇을 걸렀나」 — 규칙이 **서식에 안 실은 것**을 세어서 원문으로 내놓고,
 * 인계자가 그중 필요한 것을 **보충 칸으로 옮기게** 한다.
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
 * ── 세는 법 ────────────────────────────────────────────────────────────────
 *
 * 갈래마다 `seen === used + missed.length + omitted` 다(handover-draft.ts 의
 * Screened). 기록 하나하나가 정확히 한 칸에 들어가고, 시험이 그걸 본다.
 * 안 실린 이유는 둘이다 — 「규칙 밖」은 규칙이 못 찾은 것이고, 「상한에 잘림」은
 * 규칙이 찾았는데 우리가 정한 수에 잘린 것이다. 고쳐야 할 자리가 서로 다르므로
 * 한 이름으로 부르지 않는다.
 *
 * ── 안 실린 것은 어떻게 되나 ───────────────────────────────────────────────
 *
 * **서식에 저절로 들어가지 않는다.** 서식은 법이 정한 칸이고, 규칙이 못 고른
 * 것을 규칙이 넣으면 근거 꼬리표가 거짓이 된다. 대신 인계자가 줄마다 놓인
 * 「보충으로 넣기」를 누르면 그 기록의 **원문이 그 칸의 보충 입력란에 채워진다**
 * (`/handover?fill=…&block=…`, block-notes.tsx 의 prefill). 읽고 고쳐 저장하면
 * 「인계자 보충」으로 표시된다 — 규칙이 뽑은 문단과 섞이지 않는다.
 * 한동안 이 다리가 없어서, 목록을 읽은 사람이 아래 칸까지 가서 **다시 타이핑**
 * 해야 했다. 원문을 그대로 옮기라고 해 놓고 옮겨 적게 하는 것은 모순이었다.
 *
 * ── 서식이 아니다 ──────────────────────────────────────────────────────────
 *
 * 이 판은 `draft.blocks` 를 건드리지 않는다. 종이(print-sheet)와 저장본
 * (document_draft)에는 한 글자도 나가지 않는다.
 *
 * ── 모양 ───────────────────────────────────────────────────────────────────
 *
 * 판 안에 판을 겹치지 않는다(DESIGN.md §17.3 — 왼쪽 선 하나). 갈래마다
 * 가로 막대 하나로 「실은 것 / 규칙 밖 / 상한」의 비율을 먼저 보이고, 그 아래
 * 숫자를 적는다. 막대는 무채색 농도만 다르다 — 이 화면의 색 예산은 근거
 * 꼬리표(accent)와 지연(빨강)이 이미 쓰고 있다. 원문은 앞의 몇 건만 펼쳐 두고
 * 나머지는 접는다(`<details>`, 자바스크립트 없이 열린다).
 */
export const SCREENING_ANCHOR = "screening";

/** 접지 않고 바로 보이는 원문 수. 나머지는 「나머지 N건 보기」 뒤에 둔다. */
const SHOWN_OPEN = 3;

type Row = MissedRecord & { source: string };

export function ScreeningPanel({
  screening,
  /** 인계자 본인 · 실행 전 · DB가 붙어 있을 때. 참이면 줄마다 「보충으로 넣기」를 놓는다. */
  canWrite = false,
  /** 칸 이름 — 「보충으로 넣기」가 어디로 데려가는지 적을 때 쓴다. */
  headings = {},
}: {
  screening: HandoverDraft["screening"];
  canWrite?: boolean;
  headings?: Partial<Record<HandoverBlockKey, string>>;
}) {
  const sources = [
    { name: "대화", screened: screening.comments },
    { name: "문서 항목", screened: screening.sections },
  ];

  // 볼 것이 아예 없으면 셀 것도 없다. 0 만 늘어놓으면 규칙이 실패한 것처럼 읽힌다.
  // 판단을 `screeningTotal` 하나로 모은다 — 위 캡션(sheet-caption.tsx)도 같은
  // 것을 묻고, 두 곳이 갈래 목록을 각자 들고 있으면 갈라지는 날이 온다.
  const total = screeningTotal(screening);
  if (total.seen === 0) return null;

  const missed: Row[] = sources.flatMap((s) =>
    s.screened.missed.map((m) => ({ ...m, source: s.name })),
  );
  const omitted = sources.reduce((n, s) => n + s.screened.omitted, 0);
  const shown = missed.slice(0, SHOWN_OPEN);
  const rest = missed.slice(SHOWN_OPEN);

  return (
    <section
      // 캡션이 이리로 보낸다. 붙박이 머리줄에 가리지 않게 여백을 둔다
      // (인계 항목들이 이미 쓰는 scroll-mt-20 과 같은 값).
      id={SCREENING_ANCHOR}
      className="scroll-mt-20 border-l border-l-rule-hair py-2 pl-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-2 text-body-sm font-bold text-gray-90">
          <Cog aria-hidden className="size-4 shrink-0 text-gray-40" />
          규칙이 무엇을 걸렀나
        </h3>
        {/* 캡션이 세는 수와 같은 수다. 여기서는 합계만 한 줄로 되풀이한다 —
            아래 막대는 갈래별이고, 합계가 없으면 둘을 머릿속에서 더해야 한다. */}
        <p className="text-body-xs text-gray-60">
          들여다본 {total.seen}건 중 서식에 실은 것{" "}
          <b className="font-bold tabular-nums text-gray-90">{total.used}</b>건 ·
          안 실린 것{" "}
          <b className="font-bold tabular-nums text-gray-90">{total.notUsed}</b>
          건
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {sources.map((s) => (
          <Tally key={s.name} name={s.name} screened={s.screened} />
        ))}
      </ul>

      <p className="mt-3 text-body-sm leading-relaxed break-keep text-gray-70">
        <strong className="font-bold text-gray-90">
          안 실린 {total.notUsed}건은 서식에 저절로 들어가지 않습니다.
        </strong>{" "}
        규칙은 대화에서{" "}
        <strong className="font-bold text-gray-90">{ISSUE_CUE_NAMES}</strong>{" "}
        {ISSUE_CUES.length}갈래의 표현을, 문서 항목에서는 제목의{" "}
        <strong className="font-bold text-gray-90">{SECTION_CUE_WORDS}</strong>
        를 찾습니다. 뜻을 판정하지 않고 표현을 찾으므로 반드시 놓치는 것이
        있습니다.
      </p>

      {/* 이유 둘의 뜻. 「규칙 밖」은 규칙을 고칠 일이고 「상한」은 수를 고칠
          일이라, 같은 목록에 있어도 다른 이야기다. */}
      <dl className="mt-2 grid gap-x-3 gap-y-1 text-body-xs text-gray-60 sm:grid-cols-[auto_1fr]">
        <dt className="font-bold text-gray-80">규칙 밖</dt>
        <dd>규칙이 찾는 표현이 없었습니다. 규칙을 고칠 자리입니다.</dd>
        <dt className="font-bold text-gray-80">상한에 잘림</dt>
        <dd>
          규칙에는 걸렸지만 업무당 대화 {QUOTES_PER_WORK}건 · 칸당 문서 항목
          1건이라는 상한에 잘렸습니다. 수를 고칠 자리입니다.
        </dd>
      </dl>

      <p className="mt-2 text-body-sm leading-relaxed break-keep text-gray-70">
        {canWrite ? (
          <>
            필요한 것은 줄마다 놓인{" "}
            <strong className="font-bold text-gray-90">「보충으로 넣기」</strong>
            로 옮깁니다. 원문이 그대로 그 항목의 보충 칸에 채워지고, 읽고 고친
            뒤 저장합니다. 규칙이 뽑은 문단과 섞이지 않고{" "}
            <strong className="font-bold text-gray-90">인계자 보충</strong>으로
            표시됩니다.
          </>
        ) : (
          <>
            필요한 것은 인계자가 「보충으로 넣기」로 서식의 보충 칸에 옮기고,
            옮긴 글은{" "}
            <strong className="font-bold text-gray-90">인계자 보충</strong>으로
            표시됩니다.
          </>
        )}
      </p>

      {/* ── 이 판이 셀 수 없는 것 ────────────────────────────────────────────
          인터뷰가 같은 것을 세 번 말했다. 후임자는 전임자에게 20~30회
          전화하고(Q10), 사전 조율한 내용은 기록에 안 남고(Q27), 곤란한 것은
          *"필요할 시, 구두 전달"* 한다(Q16). 위 숫자는 「규칙이 놓친 것」을
          세지만, 애초에 여기 없는 말은 놓칠 수조차 없다. 세는 코드를 안 만들고
          문장 하나로만 인정한다 — 세는 척하는 숫자를 하나 더 만드는 것이
          정확히 이 판의 규율을 어기는 일이다. */}
      <p className="mt-2 text-body-xs leading-relaxed break-keep text-gray-60">
        규칙이 세는 것은 일머리에 남은 기록뿐입니다. 결재 전 통화나 방문으로
        오간 말은 애초에 여기 없어 이 수에도 안 잡힙니다.
      </p>

      {missed.length > 0 ? (
        <>
          {/* 「안 실린 것 N건」이라고 부르면 안 된다 — 위 막대와 캡션이 세는
              「안 실린 것」은 목록 상한에 잘린 것까지 더한 수이고, 여기 있는
              것은 원문이 남은 것뿐이다. */}
          <h4 className="mt-4 text-body-xs font-bold text-gray-60">
            안 실린 것의 원문 {missed.length}건
          </h4>
          <ul className="mt-2 flex flex-col gap-3">
            {shown.map((m) => (
              <MissedRow
                key={`${m.source}-${m.key}`}
                record={m}
                canWrite={canWrite}
                headings={headings}
              />
            ))}
          </ul>
          {rest.length > 0 ? (
            <details className="mt-1">
              <summary className="group flex min-h-11 cursor-pointer list-none items-center gap-1 py-2 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-80">
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-90"
                />
                나머지 {rest.length}건 보기
              </summary>
              <ul className="flex flex-col gap-3">
                {rest.map((m) => (
                  <MissedRow
                    key={`${m.source}-${m.key}`}
                    record={m}
                    canWrite={canWrite}
                    headings={headings}
                  />
                ))}
              </ul>
            </details>
          ) : null}
          {omitted > 0 ? (
            <p className="mt-2 text-body-sm text-gray-60">
              그 밖에 {omitted}건이 더 있습니다. 업무마다 일부만 보여 주고
              나머지는 업무 화면에 그대로 있습니다.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-body-sm text-gray-60">
          이번에는 안 실린 것이 없습니다. 규칙이 모든 기록을 골랐다는 뜻이지,
          모든 현안을 찾았다는 뜻은 아닙니다.
        </p>
      )}
    </section>
  );
}

/**
 * 갈래 하나의 막대 — 본 것 전체를 100으로 두고 「실음 / 규칙 밖 / 상한 / 목록에도
 * 못 실음」이 차지하는 폭. 네 수를 더하면 반드시 본 수가 된다.
 */
function Tally({ name, screened }: { name: string; screened: Screened }) {
  const rule = screened.missed.filter((m) => m.why === "규칙 밖").length;
  const cap = screened.missed.filter((m) => m.why === "상한에 잘림").length;
  const parts = [
    { label: "서식에 실음", n: screened.used, swatch: "bg-gray-90" },
    { label: "규칙 밖", n: rule, swatch: "bg-gray-40" },
    { label: "상한에 잘림", n: cap, swatch: "bg-gray-30" },
    { label: "목록에도 못 실음", n: screened.omitted, swatch: "bg-gray-20" },
  ];
  const seen = Math.max(screened.seen, 1);
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-body-xs text-gray-60">
        <span className="font-bold text-gray-90">{name}</span>
        <span>
          들여다본 것{" "}
          <b className="font-bold tabular-nums text-gray-90">{screened.seen}</b>
          건
        </span>
      </div>
      {/* 막대는 눈으로 보는 것이다. 숫자는 아래 dl 이 읽어 준다. */}
      <div aria-hidden className="mt-1 flex h-2 w-full gap-px bg-gray-10">
        {parts.map((p) =>
          p.n > 0 ? (
            <div
              key={p.label}
              className={p.swatch}
              style={{ width: `${(p.n / seen) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body-xs text-gray-60">
        {parts
          .filter((p) => p.n > 0 || p.label === "서식에 실음")
          .map((p) => (
            <div key={p.label} className="inline-flex items-baseline gap-1">
              <span aria-hidden className={`inline-block size-2 ${p.swatch}`} />
              <dt>{p.label}</dt>
              <dd className="font-bold tabular-nums text-gray-90">{p.n}건</dd>
            </div>
          ))}
      </dl>
    </li>
  );
}

function MissedRow({
  record: m,
  canWrite,
  headings,
}: {
  record: Row;
  canWrite: boolean;
  headings: Partial<Record<HandoverBlockKey, string>>;
}) {
  const href = draftRefHref(m.ref);
  const target = missedTargetBlock(m);
  // 주소로 보낸다. 자바스크립트 없이도 동작하고, 저장하기 전까지는 아무것도
  // 남지 않는다. `#note-…` 는 그 칸의 입력란 id 다(block-notes.tsx).
  const fillHref = `/handover?fill=${encodeURIComponent(m.key)}&block=${target}#note-${target}`;
  return (
    <li className="border-l border-l-rule-hair pl-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-gray-60">
        {/* 왜 안 실렸는지를 줄 맨 앞에 세운다. 두 초 만에 넘기는 목록에서
            먼저 읽혀야 하는 것은 원문이 아니라 「고칠 자리가 어디냐」다. */}
        <span className="inline-flex items-center border border-rule-hair px-chip-x py-chip-y font-bold text-gray-90">
          {m.why}
        </span>
        <span>{m.source}</span>
        <Link
          href={href}
          className="font-bold text-gray-90 transition-colors duration-150 hover:text-primary"
        >
          {m.workTitle}
        </Link>
        <span>{m.label}</span>
        {m.at ? (
          <time
            dateTime={m.at}
            title={formatFullDateTime(m.at)}
            className="tabular-nums"
          >
            {formatDate(m.at)}
          </time>
        ) : null}
      </p>
      {/* 요약하지 않는다. 다만 긴 글은 잘린다(220자). 잘렸다는 사실을 숨기면
          이 판이 스스로 어기는 규칙이 되므로 원문으로 가는 길을 함께 준다. */}
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
      {canWrite ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ButtonLink href={fillHref} variant="secondary" size="sm">
            <PenLine aria-hidden className="size-4" />
            보충으로 넣기
          </ButtonLink>
          <span className="text-body-xs break-keep text-gray-60">
            「{headings[target] ?? target}」의 보충 칸에 원문이 채워집니다
          </span>
        </p>
      ) : null}
    </li>
  );
}
