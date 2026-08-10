import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 탭 — 주소로 움직인다.
 *
 * 자바스크립트 상태로 탭을 바꾸지 않고 링크로 만든 이유는 세 가지다.
 *   1) "이 업무 이력 좀 봐 주세요"라고 주소를 그대로 보낼 수 있다.
 *   2) 새로고침해도 보던 탭이 유지된다.
 *   3) 자바스크립트 없이도 동작한다.
 *
 * 주소가 바뀌는 탭은 ARIA tablist가 아니라 그냥 이동이다.
 * 그래서 role="tab"을 붙이지 않고 nav + aria-current로 표시한다.
 * (role만 흉내 내면 스크린리더가 "탭"이라 읽어 주지만 실제 동작은 페이지 이동이라 어긋난다)
 */

export type TabItem = {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  count?: number;
};

export function TabNav({
  items,
  active,
  label,
}: {
  items: TabItem[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="border-b border-gray-10">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((t) => {
          const current = t.key === active;
          const Icon = t.icon;
          return (
            <li key={t.key} className="shrink-0">
              <Link
                href={t.href}
                data-variant="plain"
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 border-b-2 px-4 text-body-sm font-bold transition-colors duration-150",
                  // 누르는 즉시 칠해진다(브라우저가 한다 — 자바스크립트 대기 없음)
                  "active:bg-primary-10 active:text-primary",
                  current
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-60 hover:border-gray-20 hover:text-gray-80",
                )}
              >
                {Icon ? <Icon aria-hidden className="size-4" /> : null}
                {t.label}
                {typeof t.count === "number" ? (
                  <span
                    className={cn(
                      "rounded-xs px-1.5 py-0.5 text-body-xs font-bold tabular-nums",
                      current ? "bg-primary-5 text-primary" : "bg-gray-5 text-gray-60",
                    )}
                  >
                    {t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
