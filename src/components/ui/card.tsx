import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 판.
 *
 * ── 왜 등급이 셋인가 ────────────────────────────────────────────────────────
 *
 * 예전에는 판이 한 종류였다 — `rounded-md border border-gray-10 bg-surface`.
 * 홈에 판이 넷 놓이면 넷이 **완전히 같은 스펙**이었고, 그러면 무엇이 먼저
 * 읽혀야 하는지를 화면이 말하지 않는다. 위계를 만드는 축은 여섯인데
 * (크기·굵기·대비·여백·위치·깊이) 그중 실제로 쓰는 것이 **위치 하나**뿐이었다.
 * 「위에 있으면 중요하다」가 전부이니, 심사에서 「전부 평평하다」는 말이 나온다.
 *
 * 굵기 축은 못 쓴다 — 접근성 체크리스트가 400/700 두 가지로 묶어 두었다
 * (globals.css 의 body 규칙). 대비 축은 색을 넷으로 줄이면서 「지연」 하나에
 * 몰아 줬다. 남는 것이 **크기·여백·깊이**이고, 이 셋을 판 등급에 싣는다.
 *
 *   hero    화면당 **하나**. 지금 손대야 하는 것.
 *           짙은 테두리 + 그림자 한 단계 + 제목 24px + 안쪽 여백 24px
 *   default 지금까지의 판. 화면에 두셋.
 *           옅은 테두리 + 제목 19px + 안쪽 여백 20px
 *   quiet   참고로 곁에 두는 것. **테두리가 없다.**
 *           제목 15px/gray-60 + 안쪽 여백 없음
 *
 * quiet 가 이 셋에서 제일 중요하다. 「다가오는 마감」과 「내 업무에서 일어난
 * 일」이 히어로와 똑같은 테두리를 두르고 있으면 셋이 동급으로 읽힌다.
 * 테두리를 지우면 그 영역이 바탕으로 물러나고, 그제야 히어로가 혼자 선다.
 *
 * ── 그림자에 대하여 ─────────────────────────────────────────────────────────
 *
 * 원래 이 파일에는 "그림자를 거의 쓰지 않는다 — 업무 화면에는 판이 수십 개
 * 놓이는데 전부 떠 있으면 무엇이 중요한지 사라진다"고 적혀 있었다. 그 원칙은
 * 그대로다. hero 는 **화면당 하나**로 못박혀 있으므로, 떠 있는 판이 하나뿐이면
 * 그것이 곧 위계다. 원칙을 깬 것이 아니라 원칙을 실행한 것이다.
 */

type CardVariant = "hero" | "default" | "quiet";

/**
 * 판의 겉모양. `<div>` 가 아닌 태그로 히어로를 그리는 곳(work/urgent-hero.tsx 의
 * `<article>`)이 이 표를 가져다 쓴다 — 그림자 값을 두 군데에 적어 두면 한쪽만
 * 고치는 날이 반드시 오고, 그러면 「화면에 떠 있는 판은 하나」라는 전제가 조용히
 * 깨진다.
 */
export const CARD_SURFACE: Record<CardVariant, string> = {
  hero: "rounded-lg border border-gray-20 bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.06)]",
  default: "rounded-md border border-gray-10 bg-surface",
  quiet: "",
};

export function Card({
  variant = "default",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: CardVariant }) {
  return <div className={cn(CARD_SURFACE[variant], className)} {...props} />;
}

/** 등급별 제목 크기·여백. CardHeader 와 CardBody 가 같은 표를 본다. */
const HEADER: Record<CardVariant, string> = {
  hero: "border-b border-gray-10 px-6 py-5",
  default: "border-b border-gray-10 px-5 py-4",
  quiet: "pb-2",
};

const TITLE: Record<CardVariant, string> = {
  // 24px. 예전에는 등급 없이 전부 text-h4(17px)였는데, 그건 본문(17px)과
  // **같은 크기**다. 판 제목이 본문과 같으면 판이 몇 개든 동급으로 보인다.
  hero: "text-h2 font-bold tracking-tight text-gray-90",
  default: "text-h3 font-bold text-gray-90", // 19px
  quiet: "text-body-sm font-bold text-gray-60", // 15px — 물러난다
};

const BODY: Record<CardVariant, string> = {
  hero: "px-6 py-5",
  default: "px-5 py-4",
  quiet: "",
};

export function CardHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  variant = "default",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  variant?: CardVariant;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        HEADER[variant],
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className={TITLE[variant]}>{title}</Heading>
        {description ? (
          <p className="mt-1 text-body-sm text-gray-60">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  variant = "default",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: CardVariant }) {
  return <div className={cn(BODY[variant], className)} {...props} />;
}
