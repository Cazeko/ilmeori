import Link from "next/link";
import { ChevronRight, Cog } from "lucide-react";
import { draftRefHref } from "@/components/handover/draft-lines";
import {
  MoveMissedButton,
  MovedLabel,
} from "@/components/handover/move-missed-button";
import {
  missedAnchor,
  missedSourceRef,
  missedTargetBlock,
  screeningTotal,
  QUOTES_PER_WORK,
  type HandoverDraft,
  type MissedRecord,
  type Screened,
} from "@/lib/handover-draft";
import { formatDate, formatFullDateTime } from "@/lib/format";
import {
  HANDOVER_SCREENING_ANCHOR,
  handoverBlockAnchor,
  type HandoverBlockKey,
  type HandoverNoteWithAuthor,
} from "@/lib/types";

/**
 * 「규칙이 무엇을 걸렀나」 — 규칙이 **서식에 안 실은 것**을 세어서 원문으로 내놓고,
 * 인계자가 그중 필요한 것을 한 번 눌러 **보충으로 옮기게** 한다.
 *
 * ── 왜 이 판이 있나 ────────────────────────────────────────────────────────
 *
 * 규칙 기반이라 반드시 놓친다. 그걸 말하지 않으면 서식이 다 채워진 것처럼
 * 보이고, *"규칙에 안 맞는 경우가 분명 있을 텐데 그때는 어떻게 됩니까"* 라는
 * 물음에 내놓을 것이 말밖에 없다. 숫자와 원문 목록을 띄우면 그 물음이 물음으로
 * 성립하지 않는다 — 못 걸렀다고 화면이 먼저 말하고, 고를 것은 사람 앞에 놓인다.
 *
 *   규칙은 놓칩니다. AI는 지어냅니다.
 *   놓친 건 셀 수 있고, 지어낸 건 셀 수 없습니다.
 *
 * ── 세는 법 ────────────────────────────────────────────────────────────────
 *
 * 갈래마다 `seen === used + missed.length + omitted` 다(handover-draft.ts 의
 * Screened). 안 실린 이유는 둘 — 「규칙 밖」은 규칙이 못 찾은 것, 「상한에
 * 잘림」은 찾았는데 우리가 정한 수에 잘린 것. 고칠 자리가 다르므로 한 이름으로
 * 부르지 않는다.
 *
 * ── 「보충으로 넣기」는 누르는 즉시 들어간다 ───────────────────────────────
 *
 * 처음에는 아래 보충 칸에 원문을 **채워만 두고** 저장을 기다렸다. 같은 칸으로
 * 가는 항목을 연달아 누르면 아직 저장 안 된 첫 원문이 두 번째로 바뀌었고,
 * 단추 이름은 「넣기」인데 실제로는 「채워 두기」라 어긋났다. 지금은 누르면
 * 서버가 그 기록을 초안에서 다시 찾아 원문 그대로 보충으로 저장하고
 * (actions/handover.ts 의 moveMissedToNote), 이 줄은 「보충됨」으로 바뀐다.
 * 어느 기록이었는지는 보충에 남고(handover_note.source_ref), 같은 기록을 두 번
 * 넣는 것은 DB 가 막는다(0024). 다듬고 싶으면 보충을 지우고 새로 적는다 —
 * 이 제품에서 보충을 고치는 길은 원래 그것뿐이다.
 *
 * 알림(토스트)이 아니라 **줄의 상태**로 말한다. 새로고침해도 남고, 스크립트가
 * 없어도 되고, 두 번 누르는 실수를 막는다. 스크립트가 있으면 화면은 그 자리에
 * 머물고 단추만 바뀐다(move-missed-button.tsx).
 *
 * ── 서식이 아니다 · 모양 ───────────────────────────────────────────────────
 *
 * 이 판은 `draft.blocks` 를 건드리지 않고 종이에도 안 나간다. 판 안에 판을
 * 겹치지 않는다(DESIGN.md §17.3 — 왼쪽 선 하나). 갈래마다 막대 하나로 비율을
 * 먼저 보이고 숫자를 아래에 적는다. 막대는 무채색 농도만 다르다. 원문은 앞의
 * 몇 건만 펼쳐 두고 나머지는 접는다(`<details>`, 자바스크립트 없이 열린다).
 */
export const SCREENING_ANCHOR = HANDOVER_SCREENING_ANCHOR;

/** 접지 않고 바로 보이는 원문 수. 나머지는 「나머지 N건 보기」 뒤에 둔다. */
const SHOWN_OPEN = 3;

type Row = MissedRecord & { source: string };

export function ScreeningPanel({
  screening,
  handoverId,
  /** 인계자 본인 · 실행 전 · DB가 붙어 있을 때. 참이면 줄마다 「보충으로 넣기」를 놓는다. */
  canWrite = false,
  /** 칸 이름 — 「보충으로 넣기」가 어디로 보내는지 적을 때 쓴다. */
  headings = {},
  /** 이미 보충으로 넣은 기록 — source_ref → 그 보충. 줄을 「보충됨」으로 바꾼다. */
  added = new Map(),
}: {
  screening: HandoverDraft["screening"];
  handoverId: string;
  canWrite?: boolean;
  headings?: Partial<Record<HandoverBlockKey, string>>;
  added?: ReadonlyMap<string, HandoverNoteWithAuthor>;
}) {
  const sources = [
    { name: "대화", screened: screening.comments },
    { name: "문서 항목", screened: screening.sections },
  ];

  // 볼 것이 아예 없으면 셀 것도 없다. 판단을 `screeningTotal` 하나로 모은다 —
  // 위 캡션(sheet-caption.tsx)도 같은 것을 묻는다.
  const total = screeningTotal(screening);
  if (total.seen === 0) return null;

  const missed: Row[] = sources.flatMap((s) =>
    s.screened.missed.map((m) => ({ ...m, source: s.name })),
  );
  const omitted = sources.reduce((n, s) => n + s.screened.omitted, 0);
  const shown = missed.slice(0, SHOWN_OPEN);
  const rest = missed.slice(SHOWN_OPEN);
  const rowProps = { canWrite, headings, added, handoverId };

  return (
    <section
      id={SCREENING_ANCHOR}
      className="scroll-mt-20 border-l border-l-rule-hair py-2 pl-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-2 text-body-sm font-bold text-gray-90">
          <Cog aria-hidden className="size-4 shrink-0 text-gray-40" />
          규칙이 무엇을 걸렀나
        </h3>
        <p className="text-body-xs text-gray-60">
          들여다본 {total.seen}건 · 서식에 실음{" "}
          <b className="font-bold tabular-nums text-gray-90">{total.used}</b> ·
          안 실림{" "}
          <b className="font-bold tabular-nums text-gray-90">{total.notUsed}</b>
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
        {canWrite
          ? "「보충으로 넣기」를 누르면 원문 그대로 「인계자 보충」이 됩니다."
          : "인계자가 「보충으로 넣기」로 옮기면 원문 그대로 「인계자 보충」으로 실립니다."}
      </p>
      <p className="mt-1 text-body-xs break-keep text-gray-60">
        규칙 밖 = 찾는 표현이 없음 · 상한에 잘림 = 걸렸지만 업무당 대화{" "}
        {QUOTES_PER_WORK}건 · 칸당 문서 항목 1건에 밀림
      </p>

      {missed.length > 0 ? (
        <>
          {/* 「안 실린 것 N건」이라고 부르면 안 된다 — 위 막대가 세는 「안 실림」은
              목록 상한에 잘린 것까지 더한 수이고, 여기 있는 것은 원문이 남은 것뿐이다. */}
          <h4 className="mt-4 text-body-xs font-bold text-gray-60">
            안 실린 것의 원문 {missed.length}건
          </h4>
          <ul className="mt-2 flex flex-col gap-3">
            {shown.map((m) => (
              <MissedRow key={`${m.source}-${m.key}`} record={m} {...rowProps} />
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
                  <MissedRow key={`${m.source}-${m.key}`} record={m} {...rowProps} />
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
  added,
  handoverId,
}: {
  record: Row;
  canWrite: boolean;
  headings: Partial<Record<HandoverBlockKey, string>>;
  added: ReadonlyMap<string, HandoverNoteWithAuthor>;
  handoverId: string;
}) {
  const href = draftRefHref(m.ref);
  const target = missedTargetBlock(m);
  const note = added.get(missedSourceRef(m));
  return (
    <li
      // 「보충으로 넣기」를 누른 뒤 이 줄로 돌아온다. 붙박이 머리줄에 가리지 않게.
      id={missedAnchor(m)}
      className="scroll-mt-20 border-l border-l-rule-hair pl-3"
    >
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
      {/* 요약하지 않는다. 긴 글은 잘린다(220자) — 잘렸다는 사실을 숨기지 않고
          원문으로 가는 길을 함께 준다. 보충으로 넣을 때는 전문이 들어간다. */}
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
      {note ? (
        <MovedLabel
          heading={headings[note.block_key] ?? note.block_key}
          anchor={handoverBlockAnchor(note.block_key)}
        />
      ) : canWrite ? (
        <MoveMissedButton
          handoverId={handoverId}
          src={missedSourceRef(m)}
          targetHeading={headings[target] ?? target}
        />
      ) : null}
    </li>
  );
}
