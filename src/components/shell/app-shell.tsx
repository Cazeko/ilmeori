"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import { SubmitButton } from "@/components/ui/submit-button";
import { NavPlaceholder } from "@/components/shell/nav-placeholder";
import { useNavPending } from "@/components/shell/use-nav-pending";
import { useDrawerDrag } from "@/components/shell/use-drawer-drag";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Columns3,
  LayoutDashboard,
  Mail,
  Menu,
  Network,
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
      // 결재 옆에 둔다. 둘 다 「함」이다 — 와 있는 것을 확인하는 자리.
      // 인계·인수는 맨 뒤를 지킨다. 이 제품의 마지막 한 방이라 순서에서 밀리면
      // 안 된다(docs/plans/2026-08-23-쪽지-알림-design.md §6).
      { href: "/notes", label: "쪽지", icon: Mail },
      { href: "/handover", label: "인계·인수", icon: ArrowLeftRight },
    ],
  },
  // 「제품 › 자동 생성·검증」 묶음이 여기 있었다. 화면 하나를 위해 옆줄에
  // 묶음 하나를 통째로 세운 것인데, 그 화면이 답하는 것은 **심사장의 질문**
  // (「AI 어디 있어요」·「이거 진짜 돌아요」)이지 일하는 사람의 질문이 아니다.
  // 하루 여덟 시간 이 옆줄을 보는 사람에게 그 칸은 한 번도 눌리지 않는다.
  // 메뉴는 일하는 순서대로만 둔다.
  //
  // 조직도가 다시 묶음 하나를 세운다. 위와 같은 잘못이 아닌지 따져 보고 넣었다 —
  // 이 화면이 답하는 것은 **일하는 사람의 질문**이다. 부서를 넘는 협업이 이
  // 제품의 전제인데 「그 일은 어느 과가 하나 · 거기 누가 있나」를 물어볼 자리가
  // 없었다. 위 묶음의 화면들과 성격이 달라 「업무」에 끼워 넣지 않는다. 저것들은
  // 내가 **처리해야 하는 것**이 쌓이는 함이고, 조직도는 언제나 그 자리에 있는
  // 명부다.
  {
    heading: "조직",
    items: [{ href: "/org", label: "조직도", icon: Network }],
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
          <ul className="flex flex-col gap-1">
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
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-sm border-l-3 pr-3 pl-3 text-body-sm font-bold transition-colors duration-150",
                      // 누르는 즉시 칠해진다. :active 는 브라우저가 칠하므로
                      // 자바스크립트를 기다리지 않는다(0ms). 그 뒤를
                      // LinkPending 의 표시가 이어받는다.
                      "active:bg-primary-10 active:text-primary",
                      active
                        ? "border-l-primary bg-primary-5 text-primary"
                        : "border-l-transparent text-gray-60 hover:bg-gray-5 hover:text-gray-90",
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
 *
 * 노란 바탕(warning)이었다. 옆줄에서 **가장 눈에 띄는 것이 면책 문구**가 되는
 * 배치라, 무채색으로 내렸다. 이 쪽지는 읽히기만 하면 되지 눈에 띌 필요가 없다.
 */
function DemoNotice() {
  return (
    <details className="mx-3 mb-4 rounded-sm border border-rule-frame bg-gray-5 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center text-body-xs font-bold text-gray-90 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        시연용 가상 데이터
        <span className="ml-1 font-normal text-gray-60">자세히</span>
      </summary>
      <p className="mt-2 text-body-xs leading-relaxed text-gray-60">
        부서명만 화성특례시 실제 조직도를 따랐습니다. 인물·업무·문서는 전부
        지어낸 것이며 실제 공문서는 한 건도 들어 있지 않습니다.
      </p>
    </details>
  );
}

/**
 * 검색 칸 한 벌 — 넓은 화면의 머리 줄과 좁은 화면의 펼침 칸이 같은 것을 쓴다.
 *
 * 두 벌로 적어 두면 한쪽만 고치는 날이 반드시 온다(위 NavList 와 같은 이유).
 * `id` 만 다르다 — 한 문서에 같은 `id` 가 둘이면 `<label for>` 가 어느 칸을
 * 가리키는지 정해지지 않고, 낭독기가 엉뚱한 칸의 이름을 읽는다.
 */
function SearchField({ id }: { id: string }) {
  return (
    <GetForm action="/works" role="search" className="w-full">
      <label htmlFor={id} className="sr-only">
        업무 검색
      </label>
      <div className="relative mx-auto w-full max-w-md">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-40"
        />
        <input
          id={id}
          name="q"
          type="search"
          /* 문구를 「AI에게 물어보세요」로 바꾸지 않는다. 이 검색은 제목·설명에
             낱말이 들어 있는지를 보는 것이고 어떤 모델도 부르지 않는다.
             하지 않는 일을 칸에 적어 두면, 심사에서 한 번 눌러 보는 것으로
             무너진다. 「인계서를 AI가 썼다」고 적지 않기로 한 것과 같은 규칙이다. */
          /* 자리표시는 짧게 둔다. 예전 주석은 「131px 칸」을 전제로 그렇게
             적었는데 그 전제가 틀렸었다 — 실제로는 56px 이었다. 지금 실측은
             390px 에서 366px(펼친 줄) · 640px 에서 151px · 1440px 에서 448px
             이다. 가장 좁은 자리가 151px 이고 「업무 찾기」는 거기서 안 잘린다.
             짧은 쪽이 무엇을 넣는 칸인지 더 빨리 읽히기도 한다. */
          placeholder="업무 찾기"
          autoComplete="off"
          /* text-body(17px) — iOS 는 16px 미만 입력칸을 탭하면 화면을 확대하고
             되돌려 주지 않는다. 높이도 그에 맞춰 h-11(44px)로 올린다. */
          className="h-11 w-full rounded-sm border border-gray-50 bg-gray-5 pr-3 pl-9 text-body text-gray-90 placeholder:text-gray-60 hover:border-gray-60 focus:bg-surface sm:text-body-sm"
        />
      </div>
    </GetForm>
  );
}

/* 옆줄 맨 아래에 시 표식이 하나 더 있었다(SidebarCityMark). 머리 줄에 이미
   「일머리 | 화성특례시」가 서 있어서, 옆줄에는 표식이 셋이었다 — 위의 것,
   아래의 것, 그리고 「시연용 가상 데이터」쪽지. 표식이 셋이면 어느 것도
   표식 노릇을 못 하고 옆줄이 장식으로 읽힌다. 넓은 화면에서 운영기관을
   밝히는 일은 머리 줄 하나로 충분하다. 옆줄 아래에는 쪽지 하나만 남긴다.
   (좁은 화면의 서랍은 다르다 — 아래 서랍 주석.) */

export function AppShell({
  viewer,
  departmentName,
  transferPending = 0,
  bell,
  children,
}: {
  viewer: Profile;
  departmentName: string;
  /**
   * 내가 승인해야 하는 부서 이동 신청의 수.
   *
   * 알림 갈래를 새로 만들지 않고 머리 줄의 점 하나로 말한다. 알림은 「일어난
   * 일」을 담는 표이고(0021), 이건 **처리해야 사라지는 것**이라 성격이 다르다 —
   * 결재의 「내 차례」를 알림에 넣지 않은 것과 같은 판단이다.
   */
  transferPending?: number;
  /**
   * 머리 줄의 종. **서버에서 그려 넘긴다** — 알림 목록은 사람마다 다르고
   * DB 를 읽어야 하는데, 이 파일은 client 컴포넌트라 여기서 못 읽는다.
   * 슬롯으로 받으면 서버 컴포넌트 그대로 꽂힌다.
   */
  bell?: React.ReactNode;
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
   * 좁은 화면의 펼침 검색. 서랍과 같은 `<details>` 이고, 이 ref 도 서랍의 것과
   * 같은 일만 한다 — **여는 데는 안 쓰고 닫는 데만 쓴다.** 스크립트가 없으면
   * 열리기는 하되 저절로 닫히지 않을 뿐이고, 그때도 검색은 제 일을 다 한다.
   */
  const searchRef = useRef<HTMLDetailsElement>(null);
  // 서랍을 손으로 끌어 닫는다 — 이 앱에서 손짓이 개입하는 유일한 자리.
  // 닫는 길은 이 훅이 주는 closeDrawer 하나다(✕·덮개·Esc·화면 이동 전부).
  // ⚠ useNavPending 보다 **먼저** 불러야 한다. 둘 다 document 의 capture 단계에서
  // click 을 듣는데, 끌고 난 뒤의 click 을 이쪽이 먼저 막아야 저쪽이 그것을
  // 「이동 시작」으로 오해하지 않는다(use-drawer-drag.ts 의 onClick).
  const closeDrawer = useDrawerDrag(drawerRef);

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
  // 펼침 검색도 같이 접는다 — 찾으러 갔으면 그 결과를 봐야지, 방금 친 낱말이
  // 결과 위를 덮고 있을 이유가 없다.
  useEffect(() => {
    closeDrawer();
    if (searchRef.current) searchRef.current.open = false;
  }, [pathname, closeDrawer]);

  // Esc 로 닫는다. 브라우저가 <details> 에 대해 해 주지 않는 유일한 것이라
  // 여기서만 보탠다. 이게 없어도 서랍은 여닫힌다 — 닫는 단추가 안에 있다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 펼침 검색이 열려 있으면 그것부터 닫는다. 둘이 동시에 열릴 일은 없지만
      // 순서를 정해 두지 않으면 어느 날 둘 다 닫히거나 둘 다 안 닫힌다.
      if (searchRef.current?.open) {
        searchRef.current.open = false;
        searchRef.current.querySelector("summary")?.focus();
        return;
      }
      if (!drawerRef.current?.open) return;
      closeDrawer({ focus: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeDrawer]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 그리는 것이 없다. 스크립트가 없으면 아무 일도 일어나지 않고, 앱은
          지금까지와 똑같이 돈다. 로그인한 영역에서만 등록하는 이유는 그 파일에. */}
      <RegisterServiceWorker />

      {/* ── 상단 바 ─────────────────────────────────────────────────────── */}
      {/* 상단 바와 왼쪽 메뉴는 종이에 나올 이유가 없다. 인쇄물은 결재에 올라가는
          문서 한 벌이지 화면의 사진이 아니다. */}
      {/* ── 좁은 화면에서 넘치지 않게 ──────────────────────────────────────
          예전에는 검색이 `flex-1 min-w-0` 이라 남는 자리를 전부 흡수했다.
          그래서 아무리 좁아져도 머리 줄은 안 넘쳤고, **대신 검색이 56px 이
          되어 못 쓰는 칸이 됐다**(DESIGN.md §18.3). 검색을 44px 아이콘으로
          붙박으면서 그 흡수재가 사라졌다 — 재 보니 360px 에서 12px 넘쳤다.

          되돌리는 대신 자리를 낸다: 사이를 8px 로 좁히고(넓은 화면은 그대로),
          표식의 글자를 줄일 수 있게 둔다.
          문턱은 재서 정했다 — 글자를 단 채로 머리 줄이 필요로 하는 폭이
          **367px** 이라, 375px(iPhone SE·8)에서는 그대로 서고 360px 에서만 접힌다. 마지막 수단으로 400px 미만에서는
          글자를 접는다 — 그 폭에서 머리 줄이 답해야 하는 것은 「어느
          제품인가」가 아니라 「어디로 가고 무엇을 찾나」이고, 표식 그림은
          그대로 남는다(같은 이유로 시 표식이 이미 md 미만에서 접힌다). */}
        <header className="sticky top-0 z-20 flex h-header shrink-0 items-center gap-2 border-b border-rule-hair bg-surface px-3 sm:gap-3 sm:px-4 print:hidden">
        {/* ── 좁은 화면의 서랍 ──────────────────────────────────────────
            <details> 라서 스크립트 없이 열린다. summary 가 곧 햄버거다. */}
        <details ref={drawerRef} data-drawer className="lg:hidden">
          <summary
            aria-label="메뉴"
            className="flex size-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-sm text-gray-60 transition-colors duration-150 hover:bg-gray-5 active:bg-gray-10 [&::-webkit-details-marker]:hidden"
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
            onClick={() => closeDrawer()}
          />

          <div
            data-drawer-panel
            // touch-pan-y pinch-zoom: 세로 손짓은 브라우저의 스크롤, 두 손가락은
            // 확대이고, 한 손가락의 가로 손짓만 우리가 받는다(use-drawer-drag.ts).
            // pan-y 만 두면 메뉴 위에서 확대가 안 된다.
            className="fixed top-0 bottom-0 left-0 z-40 flex w-sidebar touch-pan-y touch-pinch-zoom flex-col overflow-y-auto border-r border-rule-hair bg-surface"
          >
            <div className="flex h-header shrink-0 items-center justify-between px-4">
              <span className="text-body font-bold text-gray-90">메뉴</span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                // 이 단추는 닫히면서 사라진다. 초점을 햄버거로 돌려보내지
                // 않으면 키보드 사용자의 초점이 허공에 남는다(Esc 와 같은 처리).
                onClick={() => closeDrawer({ focus: true })}
                className="flex size-11 cursor-pointer items-center justify-center rounded-sm text-gray-60 transition-colors duration-150 hover:bg-gray-5 active:bg-gray-10"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <NavList pathname={pathname} />
            </div>
            <DemoNotice />
            {/* md 미만에서는 머리 줄이 시 표식을 접는다(검색칸이 먼저다). 그러면
                화면 어디에도 「어느 시의 도구인가」가 없으므로 서랍 아래에 하나
                둔다. 넓은 화면의 옆줄에는 두지 않는다 — 거기서는 머리 줄의 것과
                겹쳐 표식이 둘이 된다. */}
            <div className="border-t border-rule-hair px-5 py-4">
              <CityMark />
            </div>
          </div>
        </details>

        {/* ── 왼쪽: 표식 ────────────────────────────────────────────────
            사이드바와 같은 폭을 차지한다. 그래야 로고 아래 첫 메뉴 항목이
            한 선에 서고, 머리와 옆줄이 두 덩어리가 아니라 한 판으로 읽힌다. */}
        <Link
          href="/"
          className="flex min-w-0 shrink items-center gap-2 pointer-coarse:min-h-11 sm:shrink-0 lg:w-[calc(var(--spacing-sidebar)-1rem)]"
        >
          <BrandMark className="size-8" />
          <span className="truncate text-body font-bold tracking-tight text-gray-90 max-[374px]:hidden">
            일머리
          </span>
          {/* 어느 조직을 위한 것인지. 세로선을 하나 세워 제품 이름과 갈라 둔다 —
              붙여 두면 「일머리 화성특례시」가 한 덩어리 이름으로 읽힌다.
              md 미만에서는 접는다. 390px 머리 줄에는 검색칸이 먼저 서야 한다. */}
          <span
            aria-hidden
            className="ml-1 hidden h-6 w-px shrink-0 bg-gray-20 md:block"
          />
          <CityMark className="hidden md:flex" />
        </Link>

        {/* ── 가운데: 검색 ──────────────────────────────────────────────
            검색은 GET 폼이다. 자바스크립트 없이도 동작하고, 결과가 주소에 남는다.
            폭을 max-w-md 로 묶고 가운데에 세운다 — 남는 자리를 다 먹게 두면
            화면에서 가장 무거운 것이 검색칸이 되고, 정작 먼저 읽혀야 할
            화면 제목과 보드가 그 뒤로 밀린다.

            ── 좁은 화면에서는 접는다 ─────────────────────────────────────
            한동안 이 칸이 좁은 화면에서도 `flex-1` 로 남는 자리를 받았다.
            **재 보니 390px 에서 56px 이었다.** 이 주석 아래에 「131px 칸」을
            전제로 자리표시를 「업무 찾기」로 줄여 놓았는데, 실제는 그 절반도
            안 되어 자리표시가 「업」에서 잘렸다 — 남는 자리를 받는 쪽이라
            머리 줄에 무엇이 붙을 때마다 조용히 줄어들고 있었다.

            입력칸인데 못 쓰는 입력칸은 없느니만 못하다. sm 미만에서는 44px
            아이콘 하나로 접고, 누르면 머리 줄 **아래로 한 줄이 펼쳐진다.**
            서랍과 같은 `<details>` 라 여는 일을 브라우저가 한다 — 스크립트가
            없어도 열리고, 없으면 저절로 닫히지 않을 뿐이다. */}
        {/* GetForm — 스크립트가 있으면 화면을 갈지 않고 옮긴다.
            평범한 GET 폼은 전체 페이지 로드였고, 그 뒤의 뒤로가기가 bfcache 를
            못 쓴다(응답에 no-store 가 붙는다). 자세한 이유는 get-form.tsx 에. */}
        {/* `onSubmit` — 화면 이동만으로는 부족하다. 아래 pathname 효과는
            `usePathname()` 을 보는데 그 값에는 물음표 뒤가 없어서, `/works` 에서
            다시 검색하면 주소는 바뀌어도 효과가 안 돈다. 그러면 방금 친 낱말이
            결과 첫 줄을 덮은 채로 남는다 — 다시 찾기가 오히려 흔한 쪽이다.
            제출 사건은 안쪽 `<form>` 에서 여기까지 올라오므로 여기서 한 번
            받으면 두 경우가 다 닫힌다. 스크립트가 없으면 문서를 새로 받으므로
            애초에 닫힌 채로 온다. */}
        <details
          ref={searchRef}
          onSubmit={() => {
            if (searchRef.current) searchRef.current.open = false;
          }}
          className="sm:hidden"
        >
          <summary
            aria-label="업무 검색"
            className="flex size-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-sm text-gray-60 transition-colors duration-150 hover:bg-gray-5 active:bg-gray-10 [&::-webkit-details-marker]:hidden"
          >
            <Search aria-hidden className="size-5" />
          </summary>
          {/* 머리 줄이 sticky 라 그 자체가 자리잡기 기준이다. 아래로 붙여 두면
              펼쳐도 머리 줄 높이(56px)가 안 바뀌고, 본문이 밀리지 않는다. */}
          <div className="absolute inset-x-0 top-full border-b border-rule-hair bg-surface px-3 py-2">
            <SearchField id="global-search-narrow" />
          </div>
        </details>

        <div className="hidden min-w-0 flex-1 justify-center sm:flex">
          <SearchField id="global-search" />
        </div>

        {/* ── 오른쪽: 사람 ────────────────────────────────────────────────
            `ml-auto` — sm 미만에서는 늘어나는 형제가 하나도 없다(검색이 아이콘
            으로 접혔고 나머지는 전부 shrink-0). 그래서 이 무리가 왼쪽에 뭉쳐
            600px 에서 오른쪽 221px 이 비어 있었다. sm 이상에서는 검색이
            `flex-1` 로 남는 자리를 먼저 가져가므로 이 여백은 0 이 되어
            아무 일도 하지 않는다. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {bell}
          {/* 이름과 아바타를 **한 링크**로 묶어 내 프로필로 보낸다.
              둘을 각각 링크로 만들면 같은 곳으로 가는 링크가 나란히 둘이 되고,
              키보드로 훑는 사람은 탭을 두 번 눌러 같은 자리에 두 번 선다.

              색이 붙는 유일한 아바타 자리다. 여기 있는 사람은 언제나 「나」라서
              구분할 것이 없는데도 색을 주는 이유는 **이 자리가 색의 뜻을
              가르치기 때문**이다 — 머리 줄에서 이 옅은 주황 원을 본 사람은,
              업무 카드의 참여자 줄에서 같은 원을 보는 순간 「저기 내가 있다」를
              배우지 않고 안다(avatar.tsx 의 MINE 주석). */}
          <Link
            href="/me"
            aria-current={pathname === "/me" ? "page" : undefined}
            /* 손가락 환경에서 이 줄의 과녁은 40×40 이었다 — 머리 줄에서 44px 에
               못 미치는 자리가 여기 하나뿐이었고, **바로 옆의 「계정 전환」은
               같은 이유로 이미 44px 를 벌어 두었다.** 한 칸 건너뛴 것이다.

               같은 수를 쓴다: 보이는 상자는 그대로 두고 ::after 로 닿는 넓이만
               넓힌다. 다만 모양은 다르게 잡는다 — 옆엣것은 32px 정사각형이라
               44×44 를 겹치면 되지만, 이 줄은 넓은 화면에서 이름·부서까지 안고
               130px 이 넘는다. 그래서 가운데 44px 한 조각이 아니라 **줄 전체
               폭으로 높이만 44px** 를 편다. 좁은 화면에서는 아바타 하나라
               둘이 같은 결과가 되고, 넓은 화면에서는 이름 어디를 눌러도 같다. */
            className="relative flex items-center gap-2 rounded-sm px-1 py-1 transition-colors duration-150 hover:bg-gray-5 active:bg-gray-10 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2 pointer-coarse:after:content-['']"
          >
            <span className="hidden text-right sm:block">
              <span className="block text-body-sm font-bold text-gray-90">
                {viewer.name} {viewer.position}
              </span>
              <span className="block text-body-xs text-gray-60">
                {departmentName}
              </span>
            </span>
            <span className="relative">
              <Avatar profile={viewer} me />
              {/* 내가 결정해야 하는 이동 신청이 있다는 표시.
                  수를 적지 않고 점 하나만 찍는다 — 32px 아바타 모서리에 숫자를
                  얹으면 두 자리부터 읽히지 않고, 여기서 답해야 하는 질문은
                  「몇 건인가」가 아니라 「가 볼 데가 있는가」다. 수는 프로필
                  화면의 제목이 말한다. 색맹이어도 **자리**로 읽히고, 화면을
                  못 보는 사람에게는 아래 sr-only 가 글자로 말한다. */}
              {transferPending > 0 ? (
                <>
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 size-3 rounded-full bg-accent ring-2 ring-surface"
                  />
                  <span className="sr-only">
                    결정할 부서 이동 신청 {transferPending}건
                  </span>
                </>
              ) : null}
            </span>
            <span className="sr-only">내 프로필</span>
          </Link>
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
                (기준은 2.5.5(AAA)의 44px 다 — AA 기준선인 2.5.8 은 24px 이고
                 그건 최소이지 목표가 아니다. 어느 쪽이든 **보이는 상자가
                 아니라 눌리는 넓이**를 잰다는 점은 같다)
                좌우로 6px 씩만 자라고 옆에 선 이름·아바타는 눌리는 것이 아니라 겹쳐도 뺏을 것이 없다. */}
            <SubmitButton
              variant="ghost"
              title="세션을 끊고 다른 데모 계정으로 들어갑니다"
              className="relative h-8 min-h-8 min-w-8 gap-2 border border-gray-50 px-2 text-body-xs font-bold text-gray-60 after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] sm:px-2"
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
        <aside className="sticky top-header hidden h-[calc(100dvh-var(--spacing-header))] w-sidebar shrink-0 flex-col self-start overflow-y-auto border-r border-rule-hair bg-surface lg:flex print:hidden">
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
