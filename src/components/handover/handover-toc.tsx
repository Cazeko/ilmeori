"use client";

import { useEffect, useState } from "react";
import { AnchorLink } from "@/components/handover/anchor-link";
import { cn } from "@/lib/cn";

export type TocItem = {
  /** 문서 안의 id. 이 값으로 스크롤 위치를 본다. */
  anchor: string;
  heading: string;
  /** 오른쪽 끝의 짧은 꼬리 — 「보충 2」「빈칸」「9건」 */
  tail?: string;
  /** 위 항목들과 선 하나로 갈라 둔다(「규칙이 안 실은 것」). */
  divider?: boolean;
};

/** 이 선 위에 있는 항목 가운데 가장 아래 것이 「지금 보는 항목」이다. */
const CURRENT_LINE = 160;

/**
 * 「항목으로 가기」 — 지금 어디를 보고 있는지까지 말한다.
 *
 * 부드럽게 가는 것(anchor-link.tsx)까지는 있었는데, 가서 **어디에 왔는지**는
 * 서식 안의 제목을 읽어야 알 수 있었다. 4,500px 짜리 서식에서 붙박이 차례가
 * 답할 질문은 「어디로 갈까」만이 아니라 「지금 어디인가」다.
 *
 * 스크롤할 때마다 항목의 윗변이 화면 위 160px 선을 넘었는지 본다 — 붙박이
 * 머리 줄(56px)과 항목 제목의 scroll-margin(80px)을 지난 자리다. 그 선 위에
 * 있는 항목 가운데 가장 아래 것이 지금 보는 항목이다. IntersectionObserver
 * 대신 스크롤을 직접 듣는 이유는, 긴 항목 하나가 화면을 다 차지할 때 IO 는
 * 「보이는 것이 없다」고 말하기 때문이다.
 *
 * 표시는 옆줄 메뉴와 같은 말을 쓴다 — 왼쪽 파란 선과 옅은 파란 바탕
 * (「파랑 = 지금 여기」). 스크립트가 없으면 아무것도 켜지지 않고, 그래도
 * 차례는 차례다.
 */
export function HandoverToc({ items }: { items: TocItem[] }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let found: string | null = null;
      for (const it of items) {
        const el = document.getElementById(it.anchor);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= CURRENT_LINE) found = it.anchor;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (raf === 0) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf !== 0) window.cancelAnimationFrame(raf);
    };
  }, [items]);

  return (
    <ol className="mt-2 flex flex-col">
      {items.map((t) => {
        const on = t.anchor === current;
        return (
          <li
            key={t.anchor}
            className={cn(
              // 옆줄 메뉴와 같은 처리: 왼쪽 2px 선은 늘 자리를 차지하고
              // 색만 바뀐다 — 켜질 때 글자가 옆으로 밀리지 않는다.
              "-mx-4 flex items-baseline justify-between gap-2 border-l-2 py-1 pr-4 pl-3 text-body-xs transition-colors duration-150",
              on ? "border-l-primary bg-primary-5" : "border-l-transparent",
              t.divider && "mt-1 border-t border-t-rule-hair pt-2",
            )}
          >
            <AnchorLink
              href={`#${t.anchor}`}
              aria-current={on ? "location" : undefined}
              className={cn(
                "min-w-0 truncate font-bold",
                on ? "text-gray-90" : "text-primary",
              )}
            >
              {t.heading}
            </AnchorLink>
            {t.tail ? (
              <span className="shrink-0 tabular-nums text-gray-60">{t.tail}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
