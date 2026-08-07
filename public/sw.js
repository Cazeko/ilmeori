/**
 * 일머리 — 서비스워커.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  이 파일이 **하지 않는** 일이 이 파일의 전부다.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 공문서를 다루는 내부 업무 시스템이고, 시청 자리의 컴퓨터는 여러 사람이 쓴다.
 * 서비스워커가 화면을 캐시하면 그 문서는 **로그아웃한 뒤에도 디스크에 남는다.**
 * 캐시는 쿠키가 아니라서 세션이 끊겨도 지워지지 않고, 다음 사람의 브라우저가
 * 같은 출처에서 그것을 그대로 꺼내 쓸 수 있다.
 *
 * 그래서 여기서 캐시하는 것은 **내용이 없는 것들뿐**이다.
 *
 *   캐시함    /_next/static/…   빌드마다 이름이 바뀌는 스크립트·스타일
 *             아이콘 · 설명서   그림과 설정
 *             /offline          연결이 끊겼을 때 보여 줄 안내 한 장
 *
 *   캐시 안 함  화면(HTML) · RSC 응답 · 서버 액션 · 첨부파일 · HWPX 내려받기
 *              → 한 줄도 남기지 않는다. 그물이 아니라 **아무것도 안 담는 그릇**이다
 *
 * 그래서 「오프라인에서 업무를 본다」는 하지 않는다. 할 수 있지만 하지 않는
 * 것이고, 그 판단이 이 제품의 주장(권한은 DB가 강제한다)과 같은 자리에 있다.
 *
 * ── 자바스크립트가 없으면 ──────────────────────────────────────────────────
 *
 * 이 파일은 아예 등록되지 않고, 앱은 지금까지와 똑같이 돈다. 등록하는 쪽
 * (src/components/pwa/register-sw.tsx)도 스크립트가 살아 있을 때만 그려진다.
 */

// 캐시 이름에 판을 붙인다. 이 값을 올리면 옛 캐시가 activate 에서 통째로 지워진다.
const CACHE = "ilmeori-shell-v1";

/** 미리 담아 두는 것. 전부 「내용이 없는 것」이다. */
const SHELL = [
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll 은 하나만 실패해도 통째로 실패한다. 아이콘 한 장 때문에
      // 설치가 통째로 깨지면 오프라인 안내까지 함께 사라진다.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** 빌드마다 이름이 바뀌는 파일들. 내용이 바뀌면 이름이 바뀌므로 그냥 캐시해도 된다. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    /^\/(icon-\d+|icon-maskable-\d+|apple-touch-icon|favicon)\.(png|ico)$/.test(
      url.pathname,
    )
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // GET 이 아니면 손대지 않는다. 서버 액션(POST)이 캐시를 거치면 안 된다.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 다른 출처(Supabase·글꼴 CDN)는 그대로 지나가게 둔다.
  if (url.origin !== self.location.origin) return;

  // ── 화면 이동 ──────────────────────────────────────────────────────────
  // 언제나 네트워크로 간다. **응답을 캐시에 담지 않는다** — 여기 담기는 것이
  // 곧 공문서다. 네트워크가 죽었을 때만 안내 한 장을 꺼낸다.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/offline");
        return (
          cached ??
          new Response("연결이 끊겼습니다.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  // ── 정적 자산 ──────────────────────────────────────────────────────────
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        // 200 만 담는다. 리다이렉트(로그인으로 튕긴 응답)를 담으면 그때부터
        // 아이콘 자리에서 로그인 화면이 나온다.
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // 나머지(RSC 응답·첨부·HWPX·API)는 **아무것도 하지 않는다.**
  // respondWith 를 부르지 않으면 브라우저가 평소대로 네트워크로 간다.
});
