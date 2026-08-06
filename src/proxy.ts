import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * 이음(Ieum) — Proxy
 *
 * Next.js 16에서 middleware는 proxy로 이름이 바뀌었고 런타임은 nodejs로 고정된다.
 *
 * 여기서 세 가지를 한다.
 *   1) Supabase 세션 갱신 — 만료된 액세스 토큰을 조용히 재발급한다.
 *   2) 인증 게이트 — 비로그인 사용자를 /login으로 보낸다.
 *   3) nonce 기반 CSP 주입 — XSS 방어의 마지막 층.
 *
 * 주의: 여기의 인증 확인은 "낙관적 검사"일 뿐이다. 실제 접근제어는 DB의 RLS가 수행한다.
 *      proxy를 우회당해도 데이터는 새지 않는다.
 */

// 로그인 없이 접근 가능한 경로
const PUBLIC_PATHS = ["/login", "/auth", "/error"];

function buildCsp(nonce: string, isDev: boolean): string {
  const supabaseOrigin = new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin;
  const supabaseWs = supabaseOrigin.replace(/^https/, "wss");

  return [
    `default-src 'self'`,
    // 'strict-dynamic': nonce가 붙은 스크립트가 로드하는 스크립트만 허용한다.
    // 개발 중에는 Turbopack HMR 때문에 'unsafe-eval'이 필요하다.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`,
    // TODO(2차예선): Pretendard GOV를 자체 호스팅해 CDN 의존을 제거한다.
    //   내부망 온프레미스 배포에서는 외부 CDN에 접근할 수 없으므로,
    //   "망분리 환경에서 외부 호출 0건"이라는 우리 주장과 어긋난다.
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
    `font-src 'self' data: https://cdn.jsdelivr.net`,
    `img-src 'self' data: blob: ${supabaseOrigin}`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/\s{2,}/g, " ");
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

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
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

  // getSession()이 아니라 getUser()를 쓴다. 쿠키를 그대로 믿지 않고 Auth 서버에 검증을 맡긴다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // 로그인 후 원래 가려던 곳으로 돌려보낸다. 오픈 리다이렉트를 막기 위해
    // 경로만 전달하고, 복원할 때 반드시 내부 경로인지 다시 검사한다.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
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
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
