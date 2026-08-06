import type { NextConfig } from "next";

/**
 * 일머리(Ilmeori) — Next.js 설정
 *
 * 보안 헤더는 기획서 7.4의 대응표를 그대로 구현한 것이다.
 * CSP는 nonce 기반으로 src/proxy.ts에서 요청마다 생성해 주입한다(여기서는 정적 헤더만).
 */

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  // 클릭재킹 차단. 이 서비스는 어떤 프레임에도 삽입될 이유가 없다.
  { key: "X-Frame-Options", value: "DENY" },
  // MIME 스니핑 차단 (업로드된 파일이 스크립트로 해석되는 경로를 막는다)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 외부로 새는 참조 정보 최소화. 공문서 URL에는 업무 UUID가 들어간다.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 쓰지 않는 브라우저 권한 전면 차단
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // 교차 출처 격리 — 리소스 무단 임베드 방지
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

// HSTS는 HTTPS 배포에서만 의미가 있고 로컬 개발을 망가뜨리므로 프로덕션 한정.
if (!isDev) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  // 응답 헤더에 Next.js 버전을 노출하지 않는다 (알려진 취약점 표적화 방지)
  poweredByHeader: false,

  // 타입 오류를 빌드에서 무시하지 않는다. 배포 직전에 잡는 편이
  // 심사 당일 런타임에서 터지는 것보다 낫다.
  typescript: { ignoreBuildErrors: false },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
