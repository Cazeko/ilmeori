import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
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
  info: {
    box: "border-info/25 bg-info-bg",
    icon: Info,
    iconColor: "text-info",
  },
  warning: {
    box: "border-warning/30 bg-warning-bg",
    icon: AlertTriangle,
    iconColor: "text-warning",
  },
  danger: {
    box: "border-danger/25 bg-danger-bg",
    icon: AlertTriangle,
    iconColor: "text-danger",
  },
  success: {
    box: "border-success/25 bg-success-bg",
    icon: CheckCircle2,
    iconColor: "text-success",
  },
  ai: {
    box: "border-accent/30 bg-accent-bg",
    icon: Sparkles,
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
              "text-body-sm text-gray-70 [&_a]:font-bold [&_a]:text-primary",
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
