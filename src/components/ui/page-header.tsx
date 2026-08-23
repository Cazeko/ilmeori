import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 화면 머리.
 *
 * h1은 화면마다 정확히 하나다. 스크린리더 사용자는 h1으로 "여기가 어디인지"를 잡는다.
 *
 * ── 크기와 태그를 분리한다 ──────────────────────────────────────────────────
 *
 * 홈에서 화면에서 **가장 큰 글자(32px)가 「○○○ 님, 안녕하세요」** 였다.
 * 매일 똑같아서 정보량이 0인 문장이다. 반대로 그 화면에서 가장 급한 사실
 * (「9일 지남」)은 13px 이었다. 시선이 안 가는 것이 아니라 **틀린 곳으로**
 * 가고 있었고, 심사에서 「무엇을 봐야 하는지 눈에 안 들어온다」는 말이 나왔다.
 *
 * 그래서 size="sm" 을 둔다. **h1 태그는 그대로 두고 시각적 크기만 내린다** —
 * 크기는 시각 위계이고 h1 은 문서 구조라, 둘은 서로 다른 것을 말한다.
 * 스크린리더는 여전히 h1 하나로 화면을 잡고, 눈은 그 아래 히어로로 간다.
 *
 * 목록·상세처럼 「여기가 어디인가」가 먼저 읽혀야 하는 화면은 기본값(lg)이다.
 * 홈처럼 「지금 무엇을 해야 하는가」가 먼저인 화면만 sm 을 쓴다.
 */

const TITLE = {
  // 좁은 화면에서는 24px 로 둔다 — 320px 폭에서 32px 제목은 두 줄이 되고,
  // 그러면 본문이 접힌 만큼 아래로 밀린다.
  lg: "text-h2 font-bold break-keep text-gray-90 sm:text-h1",
  sm: "text-body-sm font-bold break-keep text-gray-60",
} as const;

const GAP = { lg: "mb-6", sm: "mb-4" } as const;

export function PageHeader({
  title,
  description,
  action,
  meta,
  size = "lg",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  meta?: ReactNode;
  size?: keyof typeof TITLE;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        GAP[size],
      )}
    >
      <div className="min-w-0">
        <h1 className={TITLE[size]}>{title}</h1>
        {description ? (
          <p
            className={cn(
              "max-w-2xl text-body-sm text-gray-60",
              // sm 에서는 제목과 같은 줄 무게라 사이를 벌릴 이유가 없다.
              size === "lg" ? "mt-2" : "mt-0.5",
            )}
          >
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </header>
  );
}
