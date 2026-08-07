"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Columns3,
  LayoutDashboard,
  Menu,
  Repeat,
  ScrollText,
  Search,
  Stamp,
  X,
  type LucideIcon,
} from "lucide-react";
import { leaveDemo } from "@/app/login/actions";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import type { Profile } from "@/lib/types";

/**
 * 앱 뼈대 — 왼쪽 260px, 위 56px, 나머지가 본문.
 *
 * 대국민 서비스가 아니라 업무 도구다. 하루 종일 띄워 두는 화면이므로
 * 이동 경로를 항상 같은 자리에 고정해 두는 편이 낫다고 봤다.
 * (KRDS의 대국민 레이아웃 권고를 그대로 따르지 않은 지점이고, 의식적으로 그랬다)
 *
 * 좁은 화면에서는 왼쪽이 서랍으로 접힌다.
 */

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "업무",
    items: [
      { href: "/", label: "홈", icon: LayoutDashboard },
      { href: "/works", label: "업무 보드", icon: Columns3 },
      { href: "/approvals", label: "결재", icon: Stamp },
      { href: "/handover", label: "인계·인수", icon: ArrowLeftRight },
    ],
  },
  {
    heading: "기록",
    items: [{ href: "/audit", label: "열람기록", icon: ScrollText }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  viewer,
  departmentName,
  children,
}: {
  viewer: Profile;
  departmentName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 서랍을 열면 포커스를 안으로 옮기고, Esc로 닫을 수 있게 한다.
  // 이걸 빠뜨리면 키보드 사용자는 서랍을 열고도 그 안으로 못 들어간다.
  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── 상단 바 ─────────────────────────────────────────────────────── */}
      {/* 상단 바와 왼쪽 메뉴는 종이에 나올 이유가 없다. 인쇄물은 결재에 올라가는
          문서 한 벌이지 화면의 사진이 아니다. */}
      <header className="sticky top-0 z-20 flex h-header shrink-0 items-center gap-3 border-b border-gray-10 bg-surface px-3 sm:px-4 print:hidden">
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar"
          onClick={() => setDrawerOpen(true)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-sm text-gray-60 hover:bg-gray-5 lg:hidden"
        >
          <Menu aria-hidden className="size-5" />
        </button>

        <Link
          href="/"
          data-variant="plain"
          className="flex shrink-0 items-center gap-2 lg:w-[calc(var(--spacing-sidebar)-1rem)]"
        >
          <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-[13px] font-bold text-white">
            일
          </span>
          <span className="text-body font-bold text-gray-90">일머리</span>
        </Link>

        {/* 검색은 GET 폼이다. 자바스크립트 없이도 동작하고, 결과가 주소에 남는다. */}
        <form action="/works" method="get" role="search" className="min-w-0 flex-1">
          <label htmlFor="global-search" className="sr-only">
            업무 검색
          </label>
          <div className="relative max-w-md">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-40"
            />
            <input
              id="global-search"
              name="q"
              type="search"
              placeholder="업무 제목으로 찾기"
              autoComplete="off"
              className="h-9 w-full rounded-sm border border-gray-20 bg-gray-5 pr-3 pl-9 text-body-sm text-gray-90 placeholder:text-gray-60 hover:border-gray-30 focus:bg-surface"
            />
          </div>
        </form>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-right sm:block">
            <span className="block text-body-sm font-bold text-gray-90">
              {viewer.name} {viewer.position}
            </span>
            <span className="block text-body-xs text-gray-60">{departmentName}</span>
          </span>
          <Avatar profile={viewer} />
          {/* /login으로 가는 링크로 두면 안 된다. proxy가 로그인한 사람을
              /login에서 곧바로 홈으로 되돌려보내 눌러도 제자리가 된다.
              계정을 바꾸려면 세션을 실제로 끊어야 하므로 서버 액션을 태운다. */}
          <form action={leaveDemo}>
            <button
              type="submit"
              title="세션을 끊고 다른 데모 계정으로 들어갑니다"
              className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-gray-20 px-2 text-body-xs font-bold text-gray-60 hover:bg-gray-5 sm:px-2.5"
            >
              <Repeat aria-hidden className="size-4 sm:size-3.5" />
              {/* 좁은 화면에서는 아이콘만. 글자까지 두면 검색칸이 눌려 버린다. */}
              <span className="hidden sm:inline">계정 전환</span>
              <span className="sr-only sm:hidden">계정 전환</span>
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── 왼쪽 ────────────────────────────────────────────────────────── */}
        {drawerOpen ? (
          <div
            className="fixed inset-0 z-40 bg-gray-100/40 lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
        ) : null}

        <aside
          id="app-sidebar"
          aria-label="주요 메뉴"
          className={cn(
            "fixed top-0 bottom-0 left-0 z-30 w-sidebar shrink-0 overflow-y-auto border-r border-gray-10 bg-surface transition-transform duration-200",
            "lg:sticky lg:visible lg:top-header lg:bottom-auto lg:z-10 lg:h-[calc(100dvh-var(--spacing-header))] lg:translate-x-0 lg:self-start",
            // 닫힌 서랍은 화면 밖에 있을 뿐 여전히 문서에 있다. 그대로 두면
            // 탭 키가 보이지 않는 링크들을 훑고 지나간다.
            // inert 속성 대신 visibility를 쓰는 이유: CSS만으로 결정되므로
            // 자바스크립트가 늦게 뜨거나 실패해도 넓은 화면에서 메뉴가 잠기지 않는다.
            drawerOpen ? "visible translate-x-0" : "invisible -translate-x-full",
            "print:hidden",
          )}
        >
          <div className="flex h-header items-center justify-between px-4 lg:hidden">
            <span className="text-body font-bold text-gray-90">메뉴</span>
            <button
              ref={closeRef}
              type="button"
              aria-label="메뉴 닫기"
              onClick={() => setDrawerOpen(false)}
              className="flex size-11 cursor-pointer items-center justify-center rounded-sm text-gray-60 hover:bg-gray-5"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          {/* 메뉴 안 어디를 누르든 서랍은 닫힌다. 이동한 화면이 서랍에 가려지면 안 된다.
              (효과로 pathname 변화를 감시하는 대신 클릭에서 처리한다.
               서랍이 열려 있는 것은 파생 상태가 아니라 사용자가 만든 상태다) */}
          <nav className="px-3 py-4" onClick={() => setDrawerOpen(false)}>
            {NAV.map((group) => (
              <div key={group.heading} className="mb-5 last:mb-0">
                <p className="mb-1.5 px-3 text-body-xs font-bold tracking-wide text-gray-60">
                  {group.heading}
                </p>
                <ul>
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          data-variant="plain"
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-body-sm font-bold transition-colors duration-150",
                            active
                              ? "bg-primary-5 text-primary"
                              : "text-gray-70 hover:bg-gray-5 hover:text-gray-90",
                          )}
                        >
                          <Icon aria-hidden className="size-4.5 shrink-0" />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* 시제품임을 화면 어디에서든 알 수 있게 둔다. 데이터를 착각할 여지를 없앤다. */}
          <div className="mx-3 mb-4 rounded-md border border-warning/30 bg-warning-bg px-3 py-2.5">
            <p className="text-body-xs font-bold text-gray-90">시연용 가상 데이터</p>
            <p className="mt-0.5 text-body-xs leading-relaxed text-gray-60">
              부서명만 화성특례시 실제 조직도를 따랐습니다. 인물·업무·문서는 전부
              지어낸 것이며 실제 공문서는 한 건도 들어 있지 않습니다.
            </p>
          </div>
        </aside>

        {/* ── 본문 ────────────────────────────────────────────────────────── */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-gray-5 print:bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
