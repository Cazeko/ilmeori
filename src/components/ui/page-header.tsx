import type { ReactNode } from "react";

/**
 * 화면 머리.
 *
 * h1은 화면마다 정확히 하나다. 스크린리더 사용자는 h1으로 "여기가 어디인지"를 잡는다.
 */
export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-h2 font-bold break-keep text-gray-90">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-body-sm text-gray-60">{description}</p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </header>
  );
}
