import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 빈 화면.
 *
 * 아무것도 없을 때 흰 여백만 두면 사용자는 고장인지 비어 있는지 모른다.
 * 무엇이 없는지, 그래서 무엇을 하면 되는지까지 적는다.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-gray-5">
        <Icon aria-hidden className="size-6 text-gray-40" />
      </span>
      <p className="text-body font-bold text-gray-80">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-md text-body-sm text-gray-60">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
