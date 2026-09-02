import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Cog,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 알림 판.
 *
 * 색만으로 종류를 구분하지 않는다. 아이콘과 제목 글자를 함께 둔다.
 * 'ai'는 별도 종류로 뒀다. 사람이 쓴 글과 기계가 쓴 초안은 반드시 구별되어야 한다.
 */

type Tone = "info" | "warning" | "danger" | "success" | "ai";

const TONE: Record<Tone, { box: string; icon: LucideIcon; iconColor: string }> = {
  /* ── info 와 success 는 무채색이다 ──────────────────────────────────────
     한동안 info 는 파랑 면, success 는 초록 면이었다. 그러면 화면에 파랑이
     둘(브랜드 파랑과 info 파랑)이고, 인계가 끝난 화면에는 파랑·주황·빨강에
     초록까지 네 색이 선다. 이 앱의 색은 네 갈래뿐이고(globals.css) 그 안에
     「알림용 파랑」도 「축하용 초록」도 없다 — 정보는 먹색이다.
     둘의 차이는 색이 아니라 **아이콘의 모양**이 말한다(ⓘ 와 ✓) — 아이콘
     색도 같다. 면은 다른 판과 같은 surface 이고 테두리(frame)로 구분된다.
     (바탕색 gray-5 로 두었더니 본문 바탕 위에 놓인 알림은 면이 사라져
     테두리만 남았다 — 판 안의 것과 밖의 것이 다른 물건으로 보였다.) */
  info: {
    box: "border-rule-frame bg-surface",
    icon: Info,
    iconColor: "text-gray-90",
  },
  warning: {
    box: "border-warning/30 bg-warning-bg",
    icon: AlertTriangle,
    iconColor: "text-warning",
  },
  danger: {
    box: "border-danger/30 bg-danger-bg",
    icon: AlertTriangle,
    iconColor: "text-danger",
  },
  success: {
    box: "border-rule-frame bg-surface",
    icon: CheckCircle2,
    iconColor: "text-gray-90",
  },
  ai: {
    box: "border-accent/30 bg-accent-bg",
    icon: Cog,
    iconColor: "text-accent-text",
  },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon, iconColor } = TONE[tone];
  return (
    <div
      className={cn("flex gap-3 rounded-sm border px-4 py-4", box, className)}
      // 경고는 화면에 나타나는 순간 읽혀야 한다.
      role={tone === "danger" || tone === "warning" ? "alert" : undefined}
    >
      <Icon aria-hidden className={cn("mt-1 size-5 shrink-0", iconColor)} />
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="text-body-sm font-bold text-gray-90">{title}</p>
        ) : null}
        {children ? (
          <div
            className={cn(
              "text-body-sm text-gray-60 [&_a]:font-bold [&_a]:text-primary",
              title && "mt-1",
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
