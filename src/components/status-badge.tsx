import { STATUS_LABEL, type DerivedStatus } from "@/lib/types";

/**
 * 상태 배지 — 일머리의 중심 색 언어.
 *
 * 이 제품은 "업무가 지금 어디까지 왔는지"를 보여주는 도구이므로,
 * 상태 표현이 화면 전체에서 한 치도 어긋나면 안 된다.
 *
 * 색상은 KRDS 시스템 색상 의미 체계에서 파생했다.
 * 색만으로 구분하지 않는다 — 레이블 텍스트를 항상 함께 제공한다(접근성).
 */

const TONE: Record<DerivedStatus, string> = {
  todo: "bg-status-todo-bg text-status-todo",
  doing: "bg-status-doing-bg text-status-doing",
  review: "bg-status-review-bg text-status-review",
  done: "bg-status-done-bg text-status-done",
  overdue: "bg-status-overdue-bg text-status-overdue",
};

export function StatusBadge({
  status,
  size = "md",
}: {
  status: DerivedStatus;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-xs font-bold whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-body-xs" : "px-2 py-1 text-body-sm",
        TONE[status],
      ].join(" ")}
    >
      {/* 점은 장식이 아니라 스캔 속도를 위한 것. 스크린리더에서는 숨긴다. */}
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}
