"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import { SubmitButton } from "@/components/ui/submit-button";
import { NavPlaceholder } from "@/components/shell/nav-placeholder";
import { useNavPending } from "@/components/shell/use-nav-pending";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Columns3,
  LayoutDashboard,
  Menu,
  Repeat,
  ScrollText,
  Search,
  Sparkles,
  Stamp,
  X,
  type LucideIcon,
} from "lucide-react";
import { leaveDemo } from "@/app/login/actions";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { BrandMark } from "@/components/brand-mark";
import { CityMark } from "@/components/city-mark";
import { GetForm } from "@/components/ui/get-form";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
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
  {
    // 「AI 어디 있어요?」와 「이거 진짜 돌아요?」는 반드시 나오는 두 질문인데,
    // 답이 인계·인수 화면 안쪽의 접힌 상자와 내보내기 화면의 각주로 흩어져
    // 있었다. 메뉴에 자리를 하나 내어 준다.
    //
    // 이름을 「AI」로 달지 않는다. 이 제품은 어떤 모델도 부르지 않고, 부르지
    // 않는 것을 부른다고 적는 순간 심사에서 「모델이 뭐예요」 한 마디에
    // 무너진다. 하는 일을 그대로 적는 편이 더 강하다.
    heading: "제품",
    items: [{ href: "/method", label: "자동 생성·검증", icon: Sparkles }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 메뉴 목록 — 넓은 화면의 옆줄과 좁은 화면의 서랍이 같은 것을 쓴다.
 * 두 벌로 적어 두면 한쪽만 고치는 날이 반드시 온다.
 */
function NavList({ pathname }: { pathname: string }) {
  return (
    // 묶음 이름과 항목 사이를 벌리고(mb-2), 묶음끼리는 더 벌린다(mb-7).
    // 둘이 비슷하면 「업무」가 첫 항목의 제목처럼 읽힌다.
    <nav aria-label="주요 메뉴" className="px-3 py-5">
      {NAV.map((group) => (
        <div key={group.heading} className="mb-7 last:mb-0">
          {/* gray-50 은 판(#fafafa) 위에서 4.32:1 로 4.5:1 에 못 미친다.
              묶음 이름도 읽히라고 둔 글자이므로 gray-60(6.04:1)으로 올린다. */}
          <p className="mb-2 px-3 text-body-xs font-bold tracking-wide text-gray-60">
            {group.heading}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  {/* 지금 있는 자리를 한 단계 더 세게 말한다 —
                      옅은 판만으로는 옆의 본문에 눌려 「어디에 있는지」가
                      흐려진다. 왼쪽 굵은 막대 + 판 + 진한 글자 셋이
                      함께 붙고, 막대는 자리를 늘 차지해(투명) 활성 항목만
                      2px 밀려 보이는 일이 없다. */}
                  <Link
                    href={href}
                    data-variant="plain"
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-sm border-l-3 pr-3 pl-2.5 text-body-sm font-bold transition-colors duration-150",
                      // 누르는 즉시 칠해진다. :active 는 브라우저가 칠하므로
                      // 자바스크립트를 기다리지 않는다(0ms). 그 뒤를
                      // LinkPending 의 표시가 이어받는다.
                      "active:bg-primary-10 active:text-primary",
                      active
                        ? "border-l-primary bg-primary-5 text-primary"
                        : "border-l-transparent text-gray-70 hover:bg-gray-5 hover:text-gray-90",
                    )}
                  >
                    <Icon aria-hidden className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1">{label}</span>
                    {/* 눌렀다는 표시. 목적지가 동적이라 화면이 갈리기까지
                        150~230ms 걸리는데, 그동안 아무 일도 없으면
                        사람은 한 번 더 누른다. */}
                    <LinkPending />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * 시제품임을 알리는 쪽지.
 *
 * 예전에는 두 문장짜리 문단을 사이드바 아래에 상시 펼쳐 두었다. 260px 옆줄에서
 * 세로 128px 를 영구히 먹었고, 모든 화면에 늘 같은 글이 떠 있었다. 알아야 할
 * 것은 「가상 데이터다」 한마디뿐이고, 어디까지 가상인지는 궁금할 때만 읽으면 된다.
 * <details> 라서 스크립트 없이도 열린다.
 */
function DemoNotice() {
  return (
    <details className="mx-3 mb-4 rounded-md border border-warning/30 bg-warning-bg px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center text-body-xs font-bold text-gray-90 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        시연용 가상 데이터
        <span className="ml-1 font-normal text-gray-60">자세히</span>
      </summary>
      <p className="mt-1.5 text-body-xs leading-relaxed text-gray-60">
        부서명만 화성특례시 실제 조직도를 따랐습니다. 인물·업무·문서는 전부
        지어낸 것이며 실제 공문서는 한 건도 들어 있지 않습니다.
      </p>
    </details>
  );
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
  /**
   * 좁은 화면의 서랍은 <details> 다 — 여는 일을 브라우저가 한다.
   *
   * 예전에는 useState 로 열었다. 그러면 스크립트가 없는 브라우저에서 햄버거를
   * 눌러도 아무 일이 없고, 옆줄은 lg 미만에서 늘 invisible 이라 **메뉴에 아예
   * 닿을 길이 없었다.** 「스크립트 없이 전부 동작한다」는 이 제품의 전제를
   * 정면으로 깨는 자리였다. 아래 ref 는 여는 데 쓰지 않고, 이동했을 때와
   * Esc 를 눌렀을 때 닫는 데만 쓴다 — 없어도 서랍은 열리고 닫힌다.
   */
  const drawerRef = useRef<HTMLDetailsElement>(null);

  /**
   * 화면 이동이 진행 중인가 — 누른 그 순간부터.
   *
   * 본문 자리에 자리표시를 그리는 데 쓴다. 서버가 보내는 HTML 은 그대로 두고
   * 브라우저에서만 옛 화면을 가리므로, 스크립트가 없으면 아무 일도 안 일어난다.
   */
  const {
    pending: navPending,
    target: navTarget,
    sameScreen,
  } = useNavPending();

  /**
   * 80ms 안에 끝나는 이동에서는 자리표시를 아예 그리지 않는다.
   * 그보다 빠른 전환에서 뼈대가 번쩍이면 기다림보다 더 산만하다.
   */
  const [placeholderFor, setPlaceholderFor] = useState<string | null>(null);
  useEffect(() => {
    if (!navPending || !navTarget || sameScreen) return;
    const timer = setTimeout(() => setPlaceholderFor(navTarget), 80);
    return () => clearTimeout(timer);
  }, [navPending, navTarget, sameScreen]);

  // 화면이 바뀔 때만 자리표시로 간다. 같은 화면 안의 이동(탭·편집칸·조건)은
  // 눌린 표시를 그 링크 자리에서 보여 주고, 본문은 새 내용으로 갈릴 때까지
  // 그대로 둔다 — 안쪽만 바뀌는 이동에 바깥까지 흔들면 더 느려 보인다.
  const showPlaceholder =
    navPending && !sameScreen && placeholderFor === navTarget;

  // 화면이 바뀌면 서랍을 접는다. 이동한 화면이 서랍에 가려지면 안 된다.
  useEffect(() => {
    if (drawerRef.current) drawerRef.current.open = false;
  }, [pathname]);

  // Esc 로 닫는다. 브라우저가 <details> 에 대해 해 주지 않는 유일한 것이라
  // 여기서만 보탠다. 이게 없어도 서랍은 여닫힌다 — 닫는 단추가 안에 있다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = drawerRef.current;
      if (e.key !== "Escape" || !el?.open) return;
      el.open = false;
      el.querySelector("summary")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 그리는 것이 없다. 스크립트가 없으면 아무 일도 일어나지 않고, 앱은
          지금까지와 똑같이 돈다. 로그인한 영역에서만 등록하는 이유는 그 파일에. */}
      <RegisterServiceWorker />

      {/* ── 상단 바 ─────────────────────────────────────────────────────── */}
      {/* 상단 바와 왼쪽 메뉴는 종이에 나올 이유가 없다. 인쇄물은 결재에 올라가는
          문서 한 벌이지 화면의 사진이 아니다. */}
      <header className="sticky top-0 z-20 flex h-header shrink-0 items-center gap-3 border-b border-gray-10 bg-surface px-3 sm:px-4 print:hidden">
        {/* ── 좁은 화면의 서랍 ──────────────────────────────────────────
            <details> 라서 스크립트 없이 열린다. summary 가 곧 햄버거다. */}
        <details ref={drawerRef} data-drawer className="lg:hidden">
          <summary
            aria-label="메뉴"
            className="flex size-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-sm text-gray-60 hover:bg-gray-5 [&::-webkit-details-marker]:hidden"
          >
            <Menu aria-hidden className="size-5" />
          </summary>

          {/* 덮개는 서랍보다 **아래** 층이어야 한다. 예전에는 덮개가 z-40,
              서랍이 z-30 이라 덮개가 서랍 위를 덮었고, 메뉴를 눌러도 클릭이
              전부 덮개로 들어가 좁은 화면에서 이동이 아예 되지 않았다.

              data-drawer-* 는 globals.css 가 잡는다 — 서랍이 왼쪽 밖에서
              들어오고 덮개가 함께 짙어진다. 여는 일 자체는 <details> 가
              하므로, 스크립트가 없으면 움직임만 없고 서랍은 똑같이 나온다. */}
          <span
            aria-hidden
            data-drawer-scrim
            className="fixed inset-0 z-30 block bg-gray-100/40"
            onClick={() => {
              if (drawerRef.current) drawerRef.current.open = false;
            }}
          />

          <div
            data-drawer-panel
            className="fixed top-0 bottom-0 left-0 z-40 flex w-sidebar flex-col overflow-y-auto border-r border-gray-10 bg-surface"
          >
            <div className="flex h-header shrink-0 items-center justify-between px-4">
              <span className="text-body font-bold text-gray-90">메뉴</span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => {
                  if (drawerRef.current) drawerRef.current.open = false;
                }}
                className="flex size-11 cursor-pointer items-center justify-center rounded-sm text-gray-60 hover:bg-gray-5"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <NavList pathname={pathname} />
            </div>
            <DemoNotice />
          </div>
        </details>

        {/* ── 왼쪽: 표식 ────────────────────────────────────────────────
            사이드바와 같은 폭을 차지한다. 그래야 로고 아래 첫 메뉴 항목이
            한 선에 서고, 머리와 옆줄이 두 덩어리가 아니라 한 판으로 읽힌다. */}
        <Link
          href="/"
          data-variant="plain"
          className="flex shrink-0 items-center gap-2 pointer-coarse:min-h-11 lg:w-[calc(var(--spacing-sidebar)-1rem)]"
        >
          <BrandMark className="size-8" />
          <span className="text-body font-bold tracking-tight text-gray-90">
            일머리
          </span>
          {/* 어느 조직을 위한 것인지. 세로선을 하나 세워 제품 이름과 갈라 둔다 —
              붙여 두면 「일머리 화성특례시」가 한 덩어리 이름으로 읽힌다.
              md 미만에서는 접는다. 390px 머리 줄에는 검색칸이 먼저 서야 한다. */}
          <span
            aria-hidden
            className="ml-0.5 hidden h-6 w-px shrink-0 bg-gray-20 md:block"
          />
          <CityMark className="hidden md:flex" />
        </Link>

        {/* ── 가운데: 검색 ──────────────────────────────────────────────
            검색은 GET 폼이다. 자바스크립트 없이도 동작하고, 결과가 주소에 남는다.
            폭을 max-w-md 로 묶고 가운데에 세운다 — 남는 자리를 다 먹게 두면
            화면에서 가장 무거운 것이 검색칸이 되고, 정작 먼저 읽혀야 할
            화면 제목과 보드가 그 뒤로 밀린다. */}
        {/* GetForm — 스크립트가 있으면 화면을 갈지 않고 옮긴다.
            평범한 GET 폼은 전체 페이지 로드였고, 그 뒤의 뒤로가기가 bfcache 를
            못 쓴다(응답에 no-store 가 붙는다). 자세한 이유는 get-form.tsx 에. */}
        <GetForm
          action="/works"
          role="search"
          className="flex min-w-0 flex-1 justify-center"
        >
          <label htmlFor="global-search" className="sr-only">
            업무 검색
          </label>
          <div className="relative w-full max-w-md">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-40"
            />
            <input
              id="global-search"
              name="q"
              type="search"
              /* 문구를 「AI에게 물어보세요」로 바꾸지 않는다. 이 검색은 제목·설명에
                 낱말이 들어 있는지를 보는 것이고 어떤 모델도 부르지 않는다.
                 하지 않는 일을 칸에 적어 두면, 심사에서 한 번 눌러 보는 것으로
                 무너진다. 「인계서를 AI가 썼다」고 적지 않기로 한 것과 같은 규칙이다. */
              /* 좁은 화면에서는 짧게. 131px 칸에 「업무 제목으로 찾기」를 넣으면
                 「업무 제목으」에서 잘려 무엇을 넣는 칸인지 못 읽는다. */
              placeholder="업무 찾기"
              autoComplete="off"
              /* text-body(17px) — iOS 는 16px 미만 입력칸을 탭하면 화면을 확대하고
                 되돌려 주지 않는다. 높이도 그에 맞춰 h-11(44px)로 올린다. */
              className="h-11 w-full rounded-sm border border-gray-50 bg-gray-5 pr-3 pl-9 text-body text-gray-90 placeholder:text-gray-60 hover:border-gray-60 focus:bg-surface sm:text-body-sm"
            />
          </div>
        </GetForm>

        {/* ── 오른쪽: 사람 ──────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-right sm:block">
            <span className="block text-body-sm font-bold text-gray-90">
              {viewer.name} {viewer.position}
            </span>
            <span className="block text-body-xs text-gray-60">
              {departmentName}
            </span>
          </span>
          <Avatar profile={viewer} />
          {/* /login으로 가는 링크로 두면 안 된다. proxy가 로그인한 사람을
              /login에서 곧바로 홈으로 되돌려보내 눌러도 제자리가 된다.
              계정을 바꾸려면 세션을 실제로 끊어야 하므로 서버 액션을 태운다.
              크기를 아바타(32px)에 맞춘다 — 옆에 선 것들보다 크면 「계정 전환」이
              머리에서 가장 눈에 띄는 단추가 되는데, 그건 여기서 가장 덜 쓰는 것이다. */}
          <form action={leaveDemo}>
            {/* 서버 액션 폼 중 여기만 눌린 표시가 없었다. 세션을 끊고 다시
                들어오는 왕복이라 오히려 제일 오래 걸리는 폼이다. */}
            {/* 보이는 크기는 32px 그대로 두고, 손가락이 닿는 넓이만 44px 로 넓힌다.
                ::after 를 겹쳐 두면 칸이 커지지 않아 머리 줄의 무게 배분이 안 바뀐다.
                (2.5.8 은 보이는 상자가 아니라 눌리는 넓이를 잰다)
                좌우로 6px 씩만 자라고 옆에 선 이름·아바타는 눌리는 것이 아니라 겹쳐도 뺏을 것이 없다. */}
            <SubmitButton
              variant="ghost"
              title="세션을 끊고 다른 데모 계정으로 들어갑니다"
              className="relative h-8 min-h-8 min-w-8 gap-1.5 border border-gray-50 px-1.5 text-body-xs font-bold text-gray-60 after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] sm:px-2"
            >
              <Repeat aria-hidden className="size-3.5" />
              {/* 좁은 화면에서는 아이콘만. 글자까지 두면 검색칸이 눌려 버린다. */}
              <span className="hidden sm:inline">계정 전환</span>
              <span className="sr-only sm:hidden">계정 전환</span>
            </SubmitButton>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── 왼쪽 ──────────────────────────────────────────────────────────
            넓은 화면 전용. 좁은 화면의 같은 메뉴는 위 <details> 서랍 안에 있다. */}
        <aside className="sticky top-header hidden h-[calc(100dvh-var(--spacing-header))] w-sidebar shrink-0 flex-col self-start overflow-y-auto border-r border-gray-10 bg-surface lg:flex print:hidden">
          <div className="flex-1">
            <NavList pathname={pathname} />
          </div>
          <DemoNotice />
        </aside>

        {/* ── 본문 ────────────────────────────────────────────────────────── */}
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 bg-gray-5 print:bg-white"
        >
          {/* display:contents — 감싸도 배치가 달라지지 않는다.
              자리표시를 그리는 동안에만 이 층을 통째로 감춘다(지우지 않는다 —
              지우면 되돌아왔을 때 스크롤과 입력칸이 날아간다). */}
          <div className={showPlaceholder ? "hidden" : "contents"}>
            {children}
          </div>
          {showPlaceholder ? <NavPlaceholder /> : null}
        </main>
      </div>
    </div>
  );
}
