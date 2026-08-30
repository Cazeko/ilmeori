"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * 인용한 대화의 원문을 **문서를 떠나지 않고** 연다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 *
 * 「문장마다 출처 보기」를 켜면 인용 꼬리표에 빗살이 선다. 그런데 그걸 누르면
 * `/works/[id]?tab=talk#comment-…` 로 **화면을 떠난다.** 시연에서 가장 값진
 * 20초가 페이지 이동 + 뒤로가기 왕복이 된다. 서식은 화면에 그대로 있어야 한다.
 *
 * ── 새 질의를 만들지 않는다. 그게 설계 제약이다 ────────────────────────────
 *
 * 원문은 **이미 화면에 그려져 있다.** 인용 꼬리표 바로 다음 줄이 그 대화의
 * 원문이기 때문이다(handover-draft.ts 가 꼬리표와 인용을 나란히 싣는다).
 * 그래서 서랍은 DOM 에서 그 글자를 읽어 온다 — 질의도, 프롭 배관도, 서버
 * 왕복도 없다. 새 질의를 만들면 RLS 밖으로 나가는 경로가 하나 생기고, 그건
 * 이 기능이 값하는 것보다 비싸다.
 *
 * ── 대화만 연다. 그 이유가 이 파일에서 제일 중요하다 ───────────────────────
 *
 * 대화 인용은 꼬리표 **바로 다음 한 줄**이 그 대화의 원문이다. 정확히 한 줄이라
 * 잘못 가져올 여지가 없다.
 *
 * 문서 항목(`section`·`doc`)은 다르다. 꼬리표 다음에 항목 본문이 여러 줄 오는데,
 * 그중 마지막 한 줄이 **항목이 아니라 업무 이력에서 온 문장**인 경우가 있다
 * (「최근 상태 변경: …」 — handover-draft.ts 가 같은 문단에 이어 붙인다).
 * 그걸 함께 담으면 서랍이 「이 문서 항목의 원문」이라며 **다른 데서 온 문장**을
 * 보여 준다. 이 제품에서 그건 기능 하나를 얻고 제품의 주장을 잃는 거래다.
 *
 * 그래서 문서 항목 꼬리표는 서랍을 안 열고 **원래대로 링크가 동작한다.**
 * B-5 가 정해 둔 실패 갈래(「참조 못 찾음 → 서랍 대신 기존 링크로 이동」)를
 * 갈래마다 판정 가능한 규칙으로 좁힌 것이다.
 * (제대로 고치려면 이력 줄에 자기 `ref` 를 달아 추출이 거기서 멈추게 해야
 *  한다. 그건 데이터 층 변경이라 이번 범위 밖으로 둔다.)
 *
 * ── 점진적 향상 ────────────────────────────────────────────────────────────
 *
 * 자바스크립트가 없으면 이 컴포넌트는 아무것도 안 하고, 꼬리표는 예전처럼
 * 업무 화면으로 간다. **실패가 곧 예전 동작이다.** 서랍이 열릴 조건을 못 채워도
 * (원문 줄을 못 찾아도) 같은 자리로 떨어진다 — `preventDefault` 를 그때만
 * 부르기 때문이다.
 *
 * ── 조각(fragment)으로 감싼다 ──────────────────────────────────────────────
 *
 * 서식을 `<div>` 로 한 겹 싸면 `#handover-prov:checked ~ .sheet` 가 조용히
 * 아무것도 안 맞힌다(형제가 아니게 된다). 그래서 이 컴포넌트는 자식을 그대로
 * 내보내고 문서 전체에 손짓 하나를 건다.
 */
export function SourceDrawer({ children }: { children: React.ReactNode }) {
  const [source, setSource] = useState<Source | null>(null);
  /** 서랍을 연 꼬리표. 닫을 때 포커스를 여기로 되돌린다. */
  const trigger = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setSource(null);
    // 어느 줄을 열어 둔 것인지 문서에서도 보여야 한다. 열 때 표시를 달았으니
    // 닫을 때 뗀다(globals.css 의 `.sheet a[data-src][data-open]`).
    trigger.current?.removeAttribute("data-open");
    // 포커스가 사라진 채로 남으면 키보드 사용자는 문서 맨 위로 돌아간다.
    trigger.current?.focus();
    trigger.current = null;
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // 새 탭·다운로드처럼 브라우저가 할 일은 브라우저가 하게 둔다.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>(
        '.sheet a[data-src="comment"]',
      );
      if (!anchor) return;

      const body = quotedAfter(anchor);
      const href = anchor.getAttribute("href");
      // 원문 줄을 못 찾으면 서랍을 열지 않는다. 빈 서랍보다 예전 동작이 낫다.
      if (!body || !href) return;

      event.preventDefault();
      // `<Link>` 의 손짓보다 **먼저** 잡았으므로(아래 capture) 여기서 멈춰
      // 세우지 않으면 서랍이 열리면서 라우터도 같이 움직인다.
      event.stopPropagation();
      // 옆에 뜬 글이 문서의 **어느 줄**인지 표시한다. 서랍이 서식의 오른쪽을
      // 덮으므로, 표시가 없으면 두 글이 같은 것인지 눈으로 잇기 어렵다.
      trigger.current?.removeAttribute("data-open");
      anchor.setAttribute("data-open", "");
      trigger.current = anchor;
      setSource({ label: (anchor.textContent ?? "").trim(), body, href });
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    // ⚠ **잡는 단계(capture)** 로 듣는다.
    //
    // 처음에는 기본값(거품 단계)으로 걸었고, 서랍이 한 번도 안 열렸다.
    // `next/link` 가 자기 onClick 에서 `preventDefault()` 를 부르고 라우터를
    // 밀기 때문에, 문서까지 거품이 올라올 때는 이미 `defaultPrevented` 다.
    // 위 첫 줄의 방어(`defaultPrevented` 면 브라우저에 맡긴다)가 **자기 자신을
    // 막고 있었다.** 잡는 단계로 옮기면 Link 보다 먼저 보고, 서랍을 열 때만
    // 거품을 멈춘다 — 열 수 없으면 아무것도 안 하고 Link 가 그대로 동작한다.
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close]);

  // 열리면 포커스를 서랍 안으로 옮긴다. 안 옮기면 스크린리더 사용자에게는
  // 아무 일도 안 일어난 화면이 된다.
  useEffect(() => {
    if (source) closeButton.current?.focus();
  }, [source]);

  return (
    <>
      {children}
      {source ? (
        <>
          {/* 바깥을 눌러도 닫힌다. 서식을 가리지 않으려고 **채움 없이** 깔기만
              한다 — 이 서랍의 목적은 문서를 계속 보이게 하는 것이다. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-30 cursor-default print:hidden"
          />
          <aside
            role="dialog"
            aria-label="인용한 대화 원문"
            className={[
              "fixed z-40 flex flex-col gap-3 overflow-y-auto bg-surface p-5 print:hidden",
              // 넓은 화면: 오른쪽에 붙는 서랍. 머리 줄 아래에서 시작한다.
              "top-header right-0 bottom-0 w-96 max-w-full border-l border-rule-frame",
              // 좁은 화면: 아래에서 올라오는 시트. 서식 좌우 여백은 그대로 둔다.
              "max-sm:inset-x-0 max-sm:top-auto max-sm:max-h-[70dvh] max-sm:w-full",
              "max-sm:border-t max-sm:border-l-0",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-body-sm font-bold break-keep text-gray-90">
                {source.label}
              </p>
              {/* 44px 표적. 아이콘만 있는 단추라 이름은 sr-only 로 준다. */}
              <button
                ref={closeButton}
                type="button"
                onClick={close}
                className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-gray-60 transition-colors duration-150 hover:bg-gray-5 hover:text-gray-90"
              >
                <X aria-hidden className="size-5" />
                <span className="sr-only">닫기</span>
              </button>
            </div>

            {/* 요약하지 않는다. 규칙이 서식에 실은 그 글자 그대로다 —
                왼쪽 빗살은 서식의 인용 표시와 같은 어휘다. */}
            <blockquote className="border-l border-l-rule-head pl-3 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
              {source.body}
            </blockquote>

            <p className="text-body-sm">
              <Link
                href={source.href}
                className="font-bold text-primary"
                onClick={close}
              >
                업무 화면에서 원문 보기
              </Link>
            </p>
            <p className="text-body-xs leading-relaxed break-keep text-gray-60">
              이 글은 서식에 실린 것과 같은 글자입니다. 규칙은 인용할 뿐 고쳐
              쓰지 않습니다.
            </p>
          </aside>
        </>
      ) : null}
    </>
  );
}

type Source = { label: string; body: string; href: string };

/**
 * 인용문이 실제로 실려 있는 **따옴표 줄 한 줄**을 꺼낸다.
 *
 * 꼬리표(`<a>`) 다음 줄이 그 대화의 원문이다. `quote()` 가 줄바꿈을 눕혀
 * 한 줄로 만들고(handover-draft.ts) 앞뒤에 “ ” 를 두르므로, 꺼낼 것은 정확히
 * **첫 번째 비어 있지 않은 줄 하나**다.
 *
 * ⚠ 다음 요소가 나올 때까지 전부 담으면 안 된다. 처음에 그렇게 썼고, 그러면
 * 인용 **다음 줄까지** 딸려 온다 — 「1-다」의 마지막 인용 뒤에는 규칙이 지어낸
 * 「기한이 지났습니다. …」 가 붙어 있고, 그게 「인용한 대화 원문」이라며 서랍에
 * 떴다. **사람이 하지 않은 말을 사람의 말로 보여 주는 것**이라, 이 제품에서
 * 그보다 나쁜 결함은 없다.
 *
 * 그래서 자리로만 고르지 않고 **모양으로 확인한다.** 따옴표로 시작하고
 * 끝나지 않으면 인용이 아니므로 서랍을 안 연다(꼬리표는 예전처럼 원문으로
 * 이동한다). 잘린 인용의 꼬리(「(뒤가 잘렸습니다)」)는 인용의 일부로 함께
 * 싣는다 — 잘렸다는 사실을 서랍에서 숨기면 안 된다.
 *
 * ⚠ 글자 노드만 보고 멈추는 것도 안 된다. React 는 서버 렌더에서 붙어 있는
 * 글자 노드 사이에 `<!-- -->` 를 끼운다(하이드레이션 경계). 처음에
 * `nodeType === TEXT_NODE` 로 걸었다가 **첫 주석에서 멈춰 빈 문자열을 냈고,
 * 서랍은 조용히 안 열리고 링크가 그대로 동작했다.**
 */
const QUOTED_LINE = /^[“"][\s\S]*[”"](\s*\(뒤가 잘렸습니다\))?$/;

function quotedAfter(anchor: Element): string {
  let text = "";
  let node = anchor.nextSibling;
  while (node && node.nodeType !== Node.ELEMENT_NODE) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
    node = node.nextSibling;
  }
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return first && QUOTED_LINE.test(first) ? first : "";
}
