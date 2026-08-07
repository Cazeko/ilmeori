"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록.
 *
 * 그리는 것이 없다. 스크립트가 살아 있을 때만 돌고, 없으면 아무 일도 일어나지
 * 않는다 — PrintButton 과 같은 자리이고 같은 규칙이다(덧붙이는 층은 없을 때
 * 화면을 깨뜨리지 않는다).
 *
 * ── 왜 로그인한 영역에서만 등록하나 ────────────────────────────────────────
 *
 * 등록 자체는 로그인 화면에서도 된다. 그런데 서비스워커는 한 번 등록되면
 * 출처 전체에 붙고, 지우려면 사용자가 개발자 도구를 열어야 한다. 들어와 본 적도
 * 없는 사람의 브라우저에 그것을 남길 이유가 없다.
 *
 * ── 무엇을 캐시하는지는 public/sw.js 에 ────────────────────────────────────
 *
 * 요약하면 **화면은 한 줄도 캐시하지 않는다.** 이유는 그 파일 맨 위에 적었다.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // updateViaCache: "none" — 서비스워커 파일 자체를 브라우저 캐시에서 꺼내
    // 쓰지 않는다. 이걸 빼면 고친 sw.js 가 최대 24시간까지 안 반영된다.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // 등록에 실패해도 앱은 그대로 돈다. 사용자에게 알릴 것이 없다 —
        // 할 수 있는 일이 없는 실패를 알리면 고장으로 읽힌다.
      });
  }, []);

  return null;
}
