import { approvalProgress, approvalStateLine } from "@/lib/approval";
import { cn } from "@/lib/cn";
import type { ApprovalState, ApprovalStep } from "@/lib/types";

/**
 * 결재 진행률 배지 — flex 문서함의 「진행 중 3/5」.
 *
 * 이번 조사에서 가장 값싼 수확이었다. 상태 하나만 적으면 「진행 중」이 이틀째인지
 * 2주째인지, 한 칸 남았는지 다섯 칸 남았는지가 화면에 없다. 분자·분모를 붙이면
 * 그 두 가지를 한 번에 읽는다.
 *
 * 상태 배지(status-badge.tsx)와 같은 규칙을 따른다 — 색만으로 알리지 않고
 * 점 옆에 언제나 글자가 붙는다. 색을 쓰는 규칙도 같다: **되돌아온 것(반려)
 * 에만 색이 붙고 나머지는 명도로 나뉜다.** 결재함에서 붉은 것이 하나면
 * 그것이 곧 「지금 손봐야 하는 문서」다.
 */

const TONE: Record<ApprovalState, string> = {
  drafting: "bg-gray-5 text-gray-60", //     5.57:1 — 아직 안 올린 것
  in_progress: "bg-gray-10 text-gray-90", // 13.17:1 — 지금 돌고 있는 것
  completed: "bg-gray-5 text-gray-60", //    5.57:1 — 끝나서 물러난 것
  rejected: "bg-status-overdue-bg text-status-overdue-text", // 5.34:1 — 유일한 색
  withdrawn: "bg-gray-5 text-gray-60", //    5.57:1
};

export function ApprovalBadge({
  state,
  steps,
  size = "md",
}: {
  state: ApprovalState;
  steps: readonly Pick<ApprovalStep, "kind" | "signed_at">[];
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs font-bold whitespace-nowrap tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-body-xs" : "px-2 py-1 text-body-sm",
        TONE[state],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {approvalStateLine(state, approvalProgress(steps))}
    </span>
  );
}
