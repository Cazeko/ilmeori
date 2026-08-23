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

/*
 * 면은 걷어냈다 — 상태 배지와 같은 이유이고 같은 시점이다(status-badge.tsx).
 * 위계는 명도 한 축으로만 낸다: 지금 돌고 있는 것이 가장 진하고, 끝났거나
 * 아직 안 올린 것은 물러난다. 반려만 색을 갖는다.
 */
const TONE: Record<ApprovalState, string> = {
  drafting: "text-gray-60", //     아직 안 올린 것
  in_progress: "text-gray-90", //  지금 돌고 있는 것
  completed: "text-gray-60", //    끝나서 물러난 것
  rejected: "text-status-overdue-text", // 유일한 색
  withdrawn: "text-gray-60",
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
        "inline-flex items-center gap-2 font-bold whitespace-nowrap tabular-nums",
        size === "sm" ? "text-body-xs" : "text-body-sm",
        TONE[state],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {approvalStateLine(state, approvalProgress(steps))}
    </span>
  );
}
