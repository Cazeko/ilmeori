import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { DEMO_COOKIE } from "@/lib/demo-cookie";

/**
 * 일머리(Ilmeori) — Proxy
 *
 * Next.js 16에서 middleware는 proxy로 이름이 바뀌었고 런타임은 nodejs로 고정된다.
 *
 * 여기서 세 가지를 한다.
 *   1) 세션 갱신 — 만료된 액세스 토큰을 조용히 재발급한다.
 *   2) 인증 게이트 — 비로그인 사용자를 /login으로 보낸다.
 *   3) nonce 기반 CSP 주입 — XSS 방어의 마지막 층.
 *
 * 주의: 여기의 인증 확인은 "낙관적 검사"일 뿐이다. 실제 접근제어는 DB의 RLS가 수행한다.
 *      proxy를 우회당해도 데이터는 새지 않는다.
 *
 * 서명은 검증하지만 Auth 서버에 묻지는 않는다(getClaims). 그래서 서버에서 폐기한
 * 세션을 즉시 알아채지 못한다 — 토큰 만료까지는 이 문을 통과한다. 그 뒤를
 * 받치는 것이 두 층이다: 레이아웃의 getViewer가 profile.is_active를 매번 확인하고,
 * 데이터는 RLS가 막는다. 창을 좁히려면 Supabase의 JWT 수명을 줄이면 된다.
 */

// 로그인 없이 접근 가능한 경로
//
// /offline 이 여기 있는 이유 — 서비스워커가 설치할 때 미리 담아 두는 화면이다.
// 인증을 걸면 담기는 것이 로그인 화면이 되고, 그러면 연결이 끊긴 사람에게
// 「비밀번호를 입력하세요」가 뜬다. 지금 할 수 없는 일을 시키는 화면이다.
// 그 화면에는 업무도 이름도 한 줄 없다(src/app/offline/page.tsx).
const PUBLIC_PATHS = ["/login", "/auth", "/error", "/offline"];

function buildCsp(nonce: string, isDev: boolean): string {
  // 데모 모드에서는 Supabase로 나가는 통로 자체를 열지 않는다.
  const supabaseOrigin = publicEnv.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin
    : "";
  const supabaseWs = supabaseOrigin.replace(/^https/, "wss");

  return [
    `default-src 'self'`,
    // 'strict-dynamic': nonce가 붙은 스크립트가 로드하는 스크립트만 허용한다.
    // 개발 중에는 Turbopack HMR 때문에 'unsafe-eval'이 필요하다.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`,
    // Pretendard GOV를 자체 호스팅하면서 외부 CDN 허용을 걷어냈다
    // (public/fonts/, scripts/build-font-css.mjs). 이제 글꼴 때문에
    // 밖으로 나가는 요청이 없으므로 "망분리 환경에서 외부 호출 0건"이 사실이다.
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self'`,
    `img-src 'self' data: blob: ${supabaseOrigin}`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
    // 서비스워커. worker-src 를 안 적으면 script-src 로 떨어지는데, 거기에는
    // 'strict-dynamic' 이 걸려 있어 'self' 가 무시된다 — 그러면 등록이 막힌다.
    `worker-src 'self'`,
    // 웹 앱 설명서. default-src 로도 덮이지만, 막히면 「설치가 안 된다」로만
    // 보이고 원인이 CSP 라는 것이 화면 어디에도 안 나오므로 못박아 둔다.
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev);

  // Next.js가 자기 스크립트에 nonce를 붙일 수 있도록 요청 헤더로 전달한다.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // 공개 경로 판정을 세션 확인보다 **먼저** 한다.
  //
  // 순서가 뒤집혀 있으면, 세션 확인이 어떤 이유로든 실패했을 때 /login 까지
  // 함께 죽는다. 그러면 사용자가 스스로 빠져나올 길이 없다 — 쿠키를 손으로
  // 지우는 것 말고는. 로그인 화면은 어떤 쿠키 상태에서도 열려야 한다.
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  let signedIn: boolean;

  if (isSupabaseConfigured) {
    const supabase = createServerClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL as string,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({
              request: { headers: requestHeaders },
            });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
            // 인증 쿠키가 실린 응답은 CDN·프록시가 캐시하면 안 된다.
            // 캐시되면 한 사용자의 세션이 다른 사용자에게 전달될 수 있다.
            for (const [key, val] of Object.entries(headers ?? {})) {
              response.headers.set(key, val);
            }
          },
        },
      },
    );

    // getSession()이 아니라 getClaims()를 쓴다.
    //
    // getSession()은 쿠키에 담긴 값을 그대로 믿는다. getClaims()는 서명을 검증한다 —
    // 다만 **이 프로세스 안에서** 한다. 액세스 토큰이 ES256으로 서명되어 있고
    // JWKS가 공개되어 있어서 가능한 일이다(대칭키였다면 auth-js가 스스로
    // getUser()로 되돌아간다). 만료 검사도 함께 한다.
    //
    // 여기가 요청마다 Auth 서버로 나가면 안 되는 이유: proxy는 페이지뿐 아니라
    // RSC 페이로드와 <Link> 프리페치에도 전부 걸린다. 화면 하나 여는 데
    // 인증 왕복이 열댓 번 나가고, 그게 정작 사람이 누른 요청과 줄을 다툰다.
    //
    // try/catch 가 반드시 있어야 한다. getClaims()는 AuthError 가 아닌 예외는
    // 그대로 밖으로 던진다 — 예컨대 alg 가 지원 목록에 없으면 평범한
    // `Error: Invalid alg claim` 이다. 쿠키는 사용자가 보내는 값이므로,
    // 안 잡으면 **조작된 쿠키 하나로 /login 을 포함한 전 경로가 500** 이 된다.
    // 그러면 로그인 화면조차 못 열어 스스로 빠져나올 방법이 없다.
    // (전임자 getUser()는 같은 입력에서 던지지 않았다. 바꾸면서 생긴 위험이다)
    //
    // 읽을 수 없는 쿠키는 「로그인하지 않음」으로 본다. 로그인 화면으로 보내면
    // 거기서 새 세션을 받아 쿠키가 갈린다.
    try {
      const { data } = await supabase.auth.getClaims();
      signedIn = Boolean(data?.claims?.sub);
    } catch {
      signedIn = false;
    }
  } else {
    // 데모 모드 — 쿠키가 있는지만 본다.
    // 값이 실제 데모 계정인지는 서버 컴포넌트(getViewer)에서 목업과 대조해 다시 확인한다.
    signedIn = Boolean(request.cookies.get(DEMO_COOKIE)?.value);
  }

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // 로그인 후 원래 가려던 곳으로 돌려보낸다. 오픈 리다이렉트를 막기 위해
    // 경로만 전달하고, 복원할 때 반드시 내부 경로인지 다시 검사한다.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 자산을 제외한 모든 경로.
     * 이미지·폰트·파비콘까지 세션 검증을 돌릴 이유가 없다.
     *
     * sw.js 와 manifest.webmanifest 는 **인증 쿠키 없이** 요청된다.
     * (`<link rel="manifest">` 는 기본이 익명이고, 서비스워커 갱신 요청도 그렇다)
     * 빼 두지 않으면 둘 다 /login 으로 튕겨 로그인 화면 HTML 이 돌아오고,
     * 설치는 「설명서를 읽을 수 없다」로, 서비스워커는 「스크립트가 아니다」로
     * 조용히 실패한다. 둘 다 내용이 없는 파일이라 감출 것도 없다.
     */
    /*
     * css 도 뺀다. 글꼴을 자체 호스팅하면서 /fonts/pretendard-gov.css 가
     * public/ 에 생겼는데, 여기 없으면 **로그인 화면의 글꼴이 /login 으로 튕긴다**
     * — 로그인 전 요청이라 세션이 없기 때문이다. 번들 CSS 는 _next/static 이라
     * 원래 빠져 있었고, 그래서 이 구멍이 폰트를 옮기기 전에는 드러나지 않았다.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:css|svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
