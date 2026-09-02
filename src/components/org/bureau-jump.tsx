"use client";

import { ChevronDown } from "lucide-react";
import { AnchorLink } from "@/components/handover/anchor-link";
import { cn } from "@/lib/cn";

/** 차례에 필요한 것만. 조직도 전체(사람·이메일)를 클라이언트로 보내지 않는다. */
export type BureauJumpItem = { id: string; name: string; headcount: number };

/**
 * 실·국 바로 가기.
 *
 * 조직도는 실·국 19 개, 과 74 개를 한 장에 편다 — 세로 6,000px 이 넘는다.
 * 찾는 부서의 이름을 알면 검색이 빠르지만, 「환경국 어디쯤」처럼 **자리로
 * 기억하는** 사람에게는 검색이 도리어 돌아가는 길이다. 그 사람에게 필요한
 * 것은 차례다.
 *
 * 붙박이 머리글 줄(md 이상)에는 단추 하나로 접어 둔다. 실·국 이름을 다
 * 펼쳐 두면 세 줄이 넘어, 붙박이가 본문을 가린다. <details> 라 스크립트 없이
 * 열리고, 항목은 인계 화면의 「항목으로 가기」와 같은 AnchorLink 라 같은
 * 결로 부드럽게 간다. 누르면 목록을 닫는다 — 열린 채로 두면 도착한 자리를
 * 목록이 가린다.
 *
 * 두 번 그린다 — md 이상은 머리글 줄의 접힌 것, 미만은 찾기 아래 펼친 것.
 * 한쪽은 늘 display:none 이라 화면에는 하나만 있고, 스크린리더는 숨은 쪽을
 * 읽지 않는다. 링크 19개가 두 벌인 것은 알고 두는 값이다(사람 자료는 안
 * 실리므로 — 위 BureauJumpItem — 무게는 이름과 수뿐이다).
 *
 * 따로 떼어 "use client" 를 붙인 이유는 그 닫기 하나다 — onClick 은 서버
 * 컴포넌트(org-chart.tsx)에서 넘길 수 없다. 스크립트가 없어도 여는 것과
 * 가는 것은 되고, 닫히지 않을 뿐이다.
 */
export function BureauJump({
  bureaus,
  inline = false,
}: {
  bureaus: BureauJumpItem[];
  /** 찾기 아래에 펼쳐 두는 꼴(좁은 화면용). 붙박이가 아니다. */
  inline?: boolean;
}) {
  if (bureaus.length < 2) return null;
  const items = bureaus.map(({ id, name, headcount }) => (
    <li key={id}>
      <AnchorLink
        href={`#bureau-${id}`}
        onClick={(e) => {
          // AnchorLink 가 이 뒤에 스크롤을 시작한다. 목록은 그 다음 틱에
          // 닫는다 — 먼저 닫으면 초점이 사라진 링크에서 body 로 떨어진다.
          const details = e.currentTarget.closest("details");
          window.setTimeout(() => details?.removeAttribute("open"), 0);
        }}
        className={cn(
          "flex items-center gap-2 rounded-sm text-body-xs text-gray-60 transition-colors duration-150 hover:bg-gray-10 hover:text-gray-90 active:bg-primary-5",
          inline ? "min-h-11 px-2" : "px-3 py-2 pointer-coarse:min-h-11",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 tabular-nums text-gray-60">{headcount}</span>
      </AnchorLink>
    </li>
  ));
  if (inline) {
    return (
      <nav aria-label="실·국 바로 가기" className="-mt-2 md:hidden">
        <ul className="-mx-2 flex flex-wrap gap-x-1">{items}</ul>
      </nav>
    );
  }
  return (
    <details className="relative">
      {/* 붙박이 머리글 줄의 높이를 키우지 않는다(py-1). 줄이 커지면 그 아래
          항목·이름표의 scroll-margin 이 전부 어긋난다. 손가락에서만 44px. */}
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm px-2 py-1 text-body-xs font-bold text-gray-90 transition-colors duration-150 hover:bg-gray-10 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        실·국으로 가기
        <ChevronDown aria-hidden className="size-4 text-gray-40" />
      </summary>
      {/* 판 위에 뜨는 목록. 그림자 대신 frame 선 — 이 시스템의 위계 축은 선이다.
          누른 단추 쪽(위)에서 내려와 자리를 잡는다(rise-in) — 목록이 어디서
          나왔는지를 움직임이 답한다. 클래스가 아니라 globals.css 가
          details[open] > [data-jump-list] 로 건다: 이 nav 는 닫혀도 DOM 에
          남아 있어서, 클래스로 달면 첫 번에만 돌고 다시 열 때는 안 돈다. */}
      <nav
        aria-label="실·국 바로 가기"
        data-jump-list
        className="absolute top-full right-0 z-10 mt-1 w-64 rounded-sm border border-rule-frame bg-surface py-1"
      >
        <ul className="max-h-[60dvh] overflow-y-auto rail-scroll">{items}</ul>
      </nav>
    </details>
  );
}

