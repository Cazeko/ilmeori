"use client";

/**
 * 화면이 오는 동안 본문 자리에 두는 것.
 *
 * loading.tsx 와 결과는 비슷하지만 만드는 방식이 정반대다. loading.tsx 는
 * 서버가 뼈대를 먼저 보내고 본문을 조각내 흘리는 것이라, 자바스크립트가
 * 꺼지면 본문이 영영 안 붙는다. 이건 **서버가 보내는 것을 하나도 바꾸지 않고**
 * 브라우저에서만 옛 화면을 잠깐 가린다. 스크립트가 없으면 이 자리표시 자체가
 * 나타나지 않고, 화면은 지금까지와 똑같이 통째로 도착한다.
 *
 * ── 위 문단을 실제로 재 봤다 (2026-08-23) ──────────────────────────────────
 *
 * 디자인 문서(DESIGN.md T5)가 `app/(app)/loading.tsx` 를 넣자고 했다. 넣고
 * playwright 를 `javaScriptEnabled: false` 로 띄워 홈을 열었더니 본문이
 * 이렇게 끝났다.
 *
 *   … 시연용 가상 데이터 | 자세히 | **화면을 불러오는 중입니다**
 *
 * 「지금 손대야 하는 일」도 인사말도 오지 않는다. React 스트리밍은 늦게 온
 * 조각을 문서 끝의 숨은 자리에 붙여 두고 **인라인 스크립트로 옮겨 넣는데**,
 * 스크립트가 없으면 그 옮기는 일이 일어나지 않기 때문이다.
 *
 * 그래서 loading.tsx 는 **넣지 않는다.** 그것이 메우려던 자리는 이미 이
 * 컴포넌트가 메우고 있고(스크립트가 있을 때의 화면 전환), 스크립트가 없을
 * 때는 애초에 기다릴 것이 없다 — 서버가 완성된 HTML 을 한 번에 보낸다.
 * 얻을 것이 없고 잃을 것이 이 저장소의 전제다.
 *
 * 다시 넣지 못하게 tests/no-streaming-loading.test.mjs 가 막는다.
 *
 * 모양을 정교하게 그리지 않는다. 화면마다 다른 뼈대를 그리면 응답이 빠를 때
 * 그것이 번쩍이고 지나가는데, 번쩍임은 기다림보다 더 산만하다. 자리와 결만
 * 잡아 「지금 오고 있다」는 것만 말한다.
 */
export function NavPlaceholder() {
  return (
    <div
      // 시험이 이 자리표시만 정확히 집을 수 있게 표식을 둔다.
      // role="status" 는 work-live 도 쓰므로 그것만으로는 구분되지 않는다.
      data-nav-placeholder
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-7 lg:px-8"
    >
      {/* 화면을 못 보는 사람에게는 회색 상자가 아무것도 말해 주지 않는다.
          라이브 리전에 실제로 읽을 글자를 둔다(feedback.tsx 와 같은 판단). */}
      <span className="sr-only">화면을 불러오는 중입니다</span>

      <div aria-hidden className="motion-safe:animate-pulse">
        <div className="h-7 w-56 max-w-full rounded-sm bg-gray-10" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-sm bg-gray-5" />
        <div className="mt-7 h-56 rounded-sm border border-rule-frame bg-surface" />
        <div className="mt-5 h-40 rounded-sm border border-rule-frame bg-surface" />
      </div>
    </div>
  );
}
