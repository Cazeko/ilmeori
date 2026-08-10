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

  experimental: {
    serverActions: {
      /**
       * 첨부파일은 서버 액션의 요청 본문으로 올라온다. 기본 상한은 1MB라
       * hwp 한 개도 못 올린다.
       *
       * 4.5MB로 잡은 것은 우리가 고른 값이 아니라 **배포 환경의 천장**이다.
       * Vercel의 서버리스 함수는 요청 본문을 4.5MB까지만 받는다. 여기서 더 올려
       * 봐야 배포하면 막히므로, 막히는 자리를 그대로 적어 두는 편이 낫다.
       * 애플리케이션은 multipart 부대비용을 감안해 4MB에서 먼저 거절한다.
       *
       * 더 큰 파일이 필요해지면 브라우저가 Storage로 직접 올리는 경로(signed upload
       * URL)로 바꿔야 한다. 그때는 자바스크립트가 필요해진다.
       */
      bodySizeLimit: "4.5mb",
    },
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        /**
         * 서비스워커는 캐시되면 안 된다.
         *
         * 브라우저는 서비스워커 파일을 최대 24시간 캐시할 수 있다. 무엇을
         * 캐시할지 정하는 파일이 스스로 캐시되면, 고친 규칙이 그만큼 늦게
         * 적용된다 — 「화면은 캐시하지 않는다」를 고쳐야 하는 날 그 지연은
         * 하루가 된다. 등록 쪽 updateViaCache:"none" 과 짝을 이룬다.
         */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // 서비스워커는 문서와 별개의 실행 맥락이라 CSP 를 따로 받는다.
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        /**
         * 글꼴은 한 번 받으면 끝이어야 한다.
         *
         * public/ 자산은 기본값이 매번 재검증(max-age=0)이다. 걷어낸 CDN 은
         * 1년 immutable 이었으므로, 그대로 두면 「자체 호스팅으로 빨라졌다」의
         * 절반(재방문)을 잃는다.
         *
         * 파일명이 내용 해시가 아니라 고정(PretendardGOV-Regular.subset.0.woff2)
         * 이라 immutable 을 붙여도 되는지 물어야 한다 — 된다. 이 파일들은
         * Pretendard v1.3.9 의 특정 조각이고, 판이 바뀌면 scripts/build-font-css.mjs
         * 의 VERSION 이 바뀌면서 **파일 내용이 아니라 파일 목록**이 바뀐다.
         * 같은 이름이 다른 내용을 갖는 일이 생기면 그때는 경로에 판을 넣어야 한다.
         */
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
