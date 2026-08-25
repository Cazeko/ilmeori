"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 화면 이동이 진행 중인가 — 클릭한 그 순간부터.
 *
 * ── 왜 useLinkStatus 로는 부족한가 ────────────────────────────────────────
 *
 * useLinkStatus 도 pending 을 알려주지만 전환(transition) 우선순위라 React 가
 * 뒤로 미룬다. 실측하면 누른 뒤 **110~147ms** 만에야 참이 된다. 본문이
 * 330~450ms 에 오므로, 거기서 다시 지연을 얹으면 자리표시가 보일 틈이 없다.
 *
 * 그래서 클릭 자체를 잡는다. 링크마다 손대지 않고 문서 하나에 캡처 단계
 * 리스너를 건다 — 사이드바·업무 카드·결재행·탭·본문 안 링크가 전부 걸린다.
 *
 * 이건 「보여 주기」 전용이다. 이동을 가로채지 않고 preventDefault 도 하지
 * 않는다. 스크립트가 없으면 이 훅 자체가 없고, 링크는 그대로 링크다.
 */

/** 새 탭·다운로드·바깥 주소처럼 이 화면이 안 바뀌는 클릭은 세지 않는다. */
function isInAppNavigation(event: MouseEvent, here: string): string | null {
  if (event.defaultPrevented) return null;
  // 왼쪽 버튼 + 보조키 없음. Ctrl/⌘ 클릭은 새 탭이라 이 화면은 그대로다.
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  // 파일을 내려주는 주소는 화면을 갈지 않는다. 브라우저가 응답의
  // Content-Disposition 을 보고 저장으로 넘기므로 이동이 일어나지 않고,
  // 그러면 여기서 켠 「가는 중」이 풀릴 일이 없어 본문이 자리표시로 덮인 채
  // 실패대기(8초)까지 굳어 있었다. 첨부 내려받기·한/글 내보내기가 그랬다.
  if (anchor.dataset.download !== undefined) return null;
  if (anchor.origin !== window.location.origin) return null;

  const to = `${anchor.pathname}${anchor.search}`;
  // 같은 자리로 가는 링크(현재 탭, 건너뛰기 링크)는 아무것도 안 바꾼다.
  if (to === here) return null;
  // 문서 안 이동(#main)도 화면을 갈지 않는다.
  if (anchor.pathname === window.location.pathname && anchor.hash) return null;

  return to;
}

export function useNavPending() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 탭 이동은 주소의 물음표 뒤만 바뀐다(?tab=talk). 경로만 보면 그 이동이
  // 끝난 것을 알아채지 못해 자리표시가 영영 안 풀린다.
  const here = `${pathname}${searchParams.size > 0 ? `?${searchParams}` : ""}`;

  /** 지금 어디로 가는 중인가. 도착하면 저절로 어긋나 풀린다. */
  const [goingTo, setGoingTo] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const to = isInAppNavigation(event, here);
      if (to) setGoingTo(to);
    };
    // 캡처 단계 — Next 의 라우터 처리보다 먼저 본다.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [here]);

  const arrived = goingTo === null || goingTo === here;

  /**
   * 도착했으면 **지운다.** 견주기만 하고 두면 안 된다.
   *
   * ── 뒤로가기가 8초 동안 자리표시에 덮이던 이유 ──────────────────────────
   *
   * 예전에는 `arrived` 를 계산만 하고 `goingTo` 는 그대로 뒀다. 「지금 여기가
   * 목적지와 같으니 pending 은 거짓」이라 화면상으로는 멀쩡했다. 문제는
   * **그 값이 다음 이동까지 살아 있다**는 것이었다.
   *
   *   1. 보드에서 카드를 누른다        goingTo = "/works/<id>"
   *   2. 상세에 닿는다                 here = goingTo → arrived, 자리표시 사라짐
   *      (그런데 goingTo 는 여전히 "/works/<id>")
   *   3. **뒤로가기**를 누른다          here = "/works" ≠ goingTo → arrived 가
   *      **다시 거짓**이 된다 → 자리표시가 켜진다
   *   4. 누른 적이 없으니 풀릴 일도 없다 → **8초 실패대기**가 끝나야 걷힌다
   *
   * 그리고 그 실패대기가 goingTo 를 null 로 만들기 때문에, 그다음부터는
   * 앞으로·뒤로가 멀쩡하다. 「처음 한 번만 느리다」는 증상이 여기서 나왔다.
   * 본문은 내내 DOM 에 있었다 — 실측하면 뒤로가기 자체는 41ms 다.
   *
   * 도착한 순간 지우면 3번이 성립하지 않는다.
   */
  useEffect(() => {
    if (goingTo !== null && goingTo === here) setGoingTo(null);
  }, [goingTo, here]);

  /**
   * 브라우저 앞으로·뒤로는 **누른 것이 아니다.**
   *
   * 이 훅이 세는 것은 「링크를 눌렀다」 하나뿐이다(위 캡처 리스너). 히스토리
   * 이동은 거기 해당하지 않고, 게다가 그 화면은 이미 클라이언트 캐시에 있어
   * 기다릴 것이 없다(Next 의 client cache 는 뒤로·앞으로에서 재사용된다).
   * 그러니 popstate 가 오면 「가는 중」은 무조건 없던 일이 된다.
   *
   * 위 도착 판정만으로도 지금은 충분하지만, 이동이 **취소되는** 경우까지
   * 덮으려면 이쪽이 필요하다 — 링크를 누른 직후 곧바로 뒤로가기를 누르면
   * 목적지에 닿지 않은 채 goingTo 만 남는다.
   */
  useEffect(() => {
    const onPop = () => setGoingTo(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 어떤 이유로든 이동이 일어나지 않았을 때를 위해 8초 뒤에는 반드시 푼다 —
  // 자리표시가 남은 채 굳는 것이 제일 나쁘다. 위 둘이 생긴 뒤로 이 시계가
  // 실제로 끝까지 도는 경우는 「눌렀는데 서버가 8초 넘게 답하지 않는다」뿐이다.
  useEffect(() => {
    if (arrived) return;
    const failsafe = setTimeout(() => setGoingTo(null), 8_000);
    return () => clearTimeout(failsafe);
  }, [arrived, goingTo]);

  const reset = useCallback(() => setGoingTo(null), []);

  /**
   * 같은 화면 안에서 옮겨 다니는가 — 경로는 그대로이고 물음표 뒤만 바뀐다.
   *
   * 업무 상세의 탭(?tab=talk), 문서 항목 편집(?edit=…), 보드의 조건 칩이 그렇다.
   * 이때는 제목도 탭줄도 그대로 있어야 한다. 화면 전체를 자리표시로 갈면
   * 「창이 통째로 바뀌었다」로 읽혀서, 실제로는 안쪽만 바뀌는데도 더 크게
   * 움직인 것처럼 느껴진다.
   */
  const sameScreen =
    goingTo !== null && goingTo.split("?")[0] === pathname;

  return { pending: !arrived, target: goingTo, sameScreen, reset };
}
