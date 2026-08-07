import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 판.
 *
 * 그림자를 거의 쓰지 않는다. 업무 화면에는 판이 수십 개 놓이는데
 * 전부 떠 있으면 무엇이 중요한지 사라진다. 경계는 선으로 긋고,
 * 그림자는 실제로 떠 있는 것(대화상자·드롭다운)에만 남겨 둔다.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-md border border-gray-10 bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-gray-10 px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-h4 font-bold text-gray-90">{title}</Heading>
        {description ? (
          <p className="mt-1 text-body-sm text-gray-60">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
