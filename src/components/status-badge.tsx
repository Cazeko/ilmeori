import { STATUS_LABEL, type DerivedStatus } from "@/lib/types";

/**
 * 상태 배지 — 일머리의 중심 색 언어.
 *
 * 이 제품은 "업무가 지금 어디까지 왔는지"를 보여주는 도구이므로,
 * 상태 표현이 화면 전체에서 한 치도 어긋나면 안 된다.
 *
 * 색만으로 구분하지 않는다 — 레이블 텍스트를 항상 함께 제공한다(접근성).
 *
 * ── 다섯 색에서 한 색으로 ───────────────────────────────────────────────────
 *
 * 예전에는 다섯 상태에 다섯 색을 줬다(회색·파랑·황토·초록·빨강). KRDS 시스템
 * 색상 의미 체계에서 곧이곧대로 파생한 것이라 하나하나는 옳았는데, 한 화면에
 * 다섯이 함께 놓이자 **완료(초록)가 지연(빨강)만큼 눈에 띄었다.** 다섯이 다
 * 튀면 아무것도 튀지 않는다.
 *
 * 상태는 대부분 「구분」이지 「경고」가 아니다. 경고인 것은 지연 하나뿐이다.
 * 그래서 색은 지연에만 남기고, 나머지 넷은 **명도로 나눈다.**
 *
 *   진행중  가장 진하다 — 지금 움직이고 있는 것
 *   검토    그 다음
 *   대기    옅다 — 아직 시작하지 않은 것
 *   완료    가장 옅다 — 끝나서 물러난 것
 *
 * 색이 아니라 명도로 나누면 위계가 「무엇이 급한가」 축에 정렬된다. 그리고
 * 화면에 붉은 것이 하나뿐이면, 그것이 곧 유일한 신호가 된다.
 *
 * 대비는 tests/contrast.test.mjs 가 잰다(전부 4.5:1 이상).
 */

const TONE: Record<DerivedStatus, string> = {
  todo: "bg-gray-5 text-gray-70", //   7.68:1
  doing: "bg-gray-10 text-gray-90", // 13.17:1
  review: "bg-gray-10 text-gray-70", //  7.07:1
  done: "bg-gray-5 text-gray-60", //     5.57:1
  overdue: "bg-status-overdue-bg text-status-overdue-text", // 5.34:1 — 유일한 색
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
