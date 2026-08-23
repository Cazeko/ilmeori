import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
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
    <nav aria-label={label} className="border-b border-rule-hair">
      {/* 좁은 화면에서는 탭 다섯 개가 390px 에 들어가지 않는다.
          예전에는 옆으로 미는 줄(overflow-x-auto)이었는데, 그러면 이력이나
          참여자 탭에 들어와도 스크롤이 0 이라 **활성 탭이 화면 밖에 있다** —
          「내가 어디에 있는지」 표시를 아예 못 본다. sticky 로도 안 된다.
          오른쪽에 있는 것은 그 자리까지 밀기 전에는 붙지 않기 때문이다.

          그래서 좁은 화면에서는 밀지 않고 **두 줄로 접는다.** 다섯 개가 전부
          보이므로 현재 자리를 놓칠 일이 없다. 다만 줄이 접히면 밑줄 표시가
          첫 줄 한가운데에 뜨게 되므로, 좁은 화면에서만 「칠한 알약」으로
          바꾸고 밑줄은 sm 이상에서만 쓴다. */}
      <ul className="flex flex-wrap gap-1 sm:-mb-px sm:flex-nowrap sm:overflow-x-auto">
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
                  "flex min-h-11 items-center gap-2 rounded-sm px-3 text-body-sm font-bold transition-colors duration-150",
                  "sm:rounded-none sm:border-b-2 sm:px-4",
                  // 누르는 즉시 칠해진다(브라우저가 한다 — 자바스크립트 대기 없음)
                  "active:bg-primary-10 active:text-primary",
                  current
                    ? "bg-primary-5 text-primary sm:border-primary sm:bg-transparent"
                    : "text-gray-60 hover:bg-gray-5 hover:text-gray-80 sm:border-transparent sm:bg-transparent sm:hover:border-rule-hair",
                )}
              >
                {Icon ? <Icon aria-hidden className="size-4" /> : null}
                {t.label}
                {/* 탭은 같은 화면 안의 이동이라 본문 자리를 갈지 않는다.
                    그래서 눌렸다는 표시가 이 자리에 있어야 한다 — 없으면
                    누르고 나서 새 내용이 올 때까지 아무 일도 안 일어난다. */}
                <LinkPending />
                {typeof t.count === "number" ? (
                  <span
                    className={cn(
                      "rounded-xs px-chip-x py-chip-y text-body-xs font-bold tabular-nums",
                      current
                        ? "bg-primary-5 text-primary"
                        : "bg-gray-5 text-gray-60",
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
