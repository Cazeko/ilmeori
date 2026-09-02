import { MessageSquareQuote } from "lucide-react";
import { isStruckOut, splitSteps } from "@/lib/approval";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import {
  APPROVAL_KIND_LABEL,
  type ApprovalState,
  type ApprovalStepWithApprover,
} from "@/lib/types";

/**
 * 결재란.
 *
 * flex·네이버웍스·하이웍스 세 제품이 공통으로 쓰는 문법이다. 한 줄에 한 사람,
 * 왼쪽에서 오른쪽으로 올라간다. 다르게 그릴 이유가 없다 — 공무원이 이미 아는
 * 모양이라 학습 비용이 0이다.
 *
 * ── 도장 그림을 쓰지 않는다 ────────────────────────────────────────────────
 *
 * 서명은 이름 + 날짜로만 찍는다. 필기체 이미지나 인장 그림을 넣으면 시제품에서
 * 위조 인상을 주고, 실제로는 아무것도 보증하지 않는 그림이다. 이 문서가 받는
 * 것은 최종 결재권자의 법적 서명이 아니라 시행규칙 제4조제6항의 「검토·협조」다.
 *
 * ── 직위를 profile 에서 읽지 않는다 ────────────────────────────────────────
 *
 * approval_step.position 에 서명 당시의 직위가 글자로 박혀 있다. 조인해서 그리면
 * 인사이동 뒤에 작년 문서의 결재란이 바뀐다. 그건 문서 위조다(0016).
 */

type CellState =
  | "signed"
  | "delegated"
  | "rejected"
  | "waiting"
  | "struck"
  | "closed";

function cellState(
  step: ApprovalStepWithApprover,
  steps: readonly ApprovalStepWithApprover[],
  approvalState: ApprovalState,
): CellState {
  if (step.rejected_at) return "rejected";
  if (step.signed_at) return step.kind === "delegated" ? "delegated" : "signed";
  if (isStruckOut(step, steps)) return "struck";
  // 반려·회수로 끝난 문서에서 차례가 오지 않은 칸. 전결과 달리 사선을 긋지
  // 않는다 — 둘은 다른 사실이고, 사선은 「전결로 끝났다」는 뜻이기 때문이다.
  if (approvalState === "rejected" || approvalState === "withdrawn") {
    return "closed";
  }
  return "waiting";
}

const STATE_TEXT: Record<CellState, string> = {
  signed: "",
  delegated: "전결",
  rejected: "반려",
  waiting: "대기",
  struck: "",
  closed: "미결",
};

function Cell({
  step,
  steps,
  approvalState,
  highlight,
}: {
  step: ApprovalStepWithApprover;
  steps: readonly ApprovalStepWithApprover[];
  approvalState: ApprovalState;
  /** 지금 이 화면을 보는 사람의 칸 */
  highlight: boolean;
}) {
  const state = cellState(step, steps, approvalState);
  const at = step.signed_at ?? step.rejected_at;

  return (
    <div
      className={cn(
        "flex h-full min-h-24 min-w-24 flex-col items-center justify-center gap-1 px-3 py-3 text-center",
        highlight && "bg-primary-5",
      )}
    >
      {state === "struck" ? (
        <>
          {/* 사선. 비워 두면 「아직 안 한 사람」으로 읽히므로, 종이 결재가
              하는 대로 긋는다. 그림이라 글자로도 한 번 더 적는다. */}
          <svg
            aria-hidden
            viewBox="0 0 40 40"
            className="size-9 text-gray-30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <line x1="4" y1="36" x2="36" y2="4" />
          </svg>
          <span className="sr-only">
            {step.approver.name}: 전결로 끝나 결재하지 않았습니다
          </span>
        </>
      ) : (
        <>
          <span className="text-body-sm font-bold text-gray-90">
            {step.approver.name}
          </span>
          {STATE_TEXT[state] ? (
            <span
              className={cn(
                "text-body-xs font-bold",
                state === "rejected"
                  ? "text-status-overdue-text"
                  : state === "delegated"
                    ? "text-primary"
                    : "text-gray-60",
              )}
            >
              {STATE_TEXT[state]}
            </span>
          ) : null}
          {at ? (
            <time
              dateTime={at}
              className="text-body-xs tabular-nums text-gray-60"
            >
              {formatShortDate(at)}
            </time>
          ) : null}
          {step.opinion ? (
            <span className="mt-1 inline-flex items-center gap-1 text-body-xs font-bold text-accent-text">
              <MessageSquareQuote aria-hidden className="size-3" />
              의견 있음
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ApprovalGrid({
  steps,
  state,
  viewerId,
}: {
  steps: readonly ApprovalStepWithApprover[];
  state: ApprovalState;
  viewerId: string;
}) {
  const { main, concur, post } = splitSteps([...steps]);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full align-top">
        {/* 표로 그리지 않는다. 결재란은 자료가 아니라 서식이고, 칸마다 들어가는
            것도 「직위 / 이름 / 날짜」 세 줄로 서로 다르다. 표로 만들면
            스크린리더가 행·열을 읽어 주지만 그 행·열에 뜻이 없다.
            대신 각 칸을 목록 항목으로 두고 읽을 말을 글자로 적는다. */}
        <div className="flex border border-rule-hair bg-surface">
          <div className="flex w-16 shrink-0 items-center justify-center border-r border-rule-hair bg-gray-5 text-body-sm font-bold text-gray-60">
            결재
          </div>
          <ul className="flex flex-1">
            {main.map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  "flex flex-1 flex-col",
                  i > 0 && "border-l border-rule-hair",
                )}
              >
                <span className="border-b border-rule-hair bg-gray-5 px-2 py-1 text-center text-body-xs font-bold text-gray-60">
                  {s.position}
                </span>
                {/* 칸의 갈래는 화면에 글자로 없다(자리를 차지하면 결재란이
                    무너진다). 이름과 날짜는 바로 아래에 보이므로 여기서 다시
                    읽어 주지 않는다 — 같은 이름을 두 번 읽게 된다. */}
                <span className="sr-only">{APPROVAL_KIND_LABEL[s.kind]}</span>
                <Cell
                  step={s}
                  steps={steps}
                  approvalState={state}
                  highlight={s.approver_id === viewerId}
                />
              </li>
            ))}
          </ul>
        </div>

        {concur.length > 0 ? (
          <div className="flex border-x border-b border-rule-hair bg-surface">
            <div className="flex w-16 shrink-0 items-center justify-center border-r border-rule-hair bg-gray-5 text-body-sm font-bold text-gray-60">
              협조
            </div>
            <ul className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
              {concur.map((s) => {
                const cs = cellState(s, steps, state);
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center gap-2 text-body-sm",
                      s.approver_id === viewerId && "font-bold",
                    )}
                  >
                    <span className="text-gray-90">
                      {s.approver.name} {s.position}
                    </span>
                    <span
                      className={cn(
                        "text-body-xs font-bold",
                        cs === "rejected"
                          ? "text-status-overdue-text"
                          : "text-gray-60",
                      )}
                    >
                      {cs === "signed" || cs === "delegated"
                        ? s.signed_at
                          ? formatShortDate(s.signed_at)
                          : ""
                        : cs === "rejected"
                          ? `반려 ${s.rejected_at ? formatShortDate(s.rejected_at) : ""}`
                          : cs === "struck"
                            ? "해당 없음"
                            : cs === "closed"
                              ? "미결"
                              : s.kind === "concur_par"
                                ? "대기(병렬)"
                                : "대기(순차)"}
                    </span>
                    {s.opinion ? (
                      <span className="inline-flex items-center gap-1 text-body-xs font-bold text-accent-text">
                        <MessageSquareQuote aria-hidden className="size-3" />
                        의견 있음
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {post.length > 0 ? (
          <div className="flex border-x border-b border-rule-hair bg-surface">
            <div className="flex w-16 shrink-0 items-center justify-center border-r border-rule-hair bg-gray-5 text-body-sm font-bold text-gray-60">
              사후
            </div>
            <ul className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
              {post.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-body-sm">
                  <span className="text-gray-90">
                    {s.approver.name} {s.position}
                  </span>
                  <span className="text-body-xs font-bold text-gray-60">
                    {s.signed_at ? formatShortDate(s.signed_at) : "보고 예정"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 「의견 있음」의 본문. 시행규칙 제4조는 의견을 서명 옆에 표시하고 본문 아래에
 * 펴도록 한다. 결재란에 다 적으면 칸이 무너지므로 자리를 나눈다.
 */
export function ApprovalOpinions({
  steps,
}: {
  steps: readonly ApprovalStepWithApprover[];
}) {
  const withOpinion = [...steps]
    .sort((a, b) => a.seq - b.seq)
    .filter((s) => s.opinion);
  if (withOpinion.length === 0) return null;

  return (
    <section aria-labelledby="approval-opinions" className="mt-6">
      <h3
        id="approval-opinions"
        className="mb-2 text-body-sm font-bold text-gray-90"
      >
        결재 의견
      </h3>
      <ul className="flex flex-col gap-3">
        {withOpinion.map((s) => {
          const at = s.rejected_at ?? s.signed_at;
          return (
            <li
              key={s.id}
              className={cn(
                "rounded-sm border px-4 py-3",
                s.rejected_at
                  ? "border-danger/30 bg-danger-bg"
                  : "border-rule-frame bg-surface",
              )}
            >
              <p className="text-body-xs font-bold text-gray-60">
                {APPROVAL_KIND_LABEL[s.kind]} · {s.approver.name} {s.position}
                {at ? ` · ${formatShortDate(at)}` : ""}
                {s.rejected_at ? " · 반려 사유" : ""}
              </p>
              <p className="mt-1 text-body-sm leading-relaxed break-keep whitespace-pre-wrap text-gray-90">
                {s.opinion}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
