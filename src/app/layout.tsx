import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "일머리 — 부서 간 협업 업무공유 플랫폼",
    template: "%s · 일머리",
  },
  description:
    "화성시 공무원이 팀 단위로 업무를 쌓고, 인사이동이 와도 그 기록을 끊김 없이 넘기는 내부 협업 플랫폼",
  // 내부 업무 시스템이므로 검색엔진에 노출될 이유가 없다.
  robots: { index: false, follow: false },

  // 홈 화면에 설치했을 때. manifest 가 못 담는 것만 여기에 둔다.
  // (iOS 는 아직 manifest 를 다 읽지 않아 apple-* 메타를 따로 봐야 한다)
  applicationName: "일머리",
  appleWebApp: {
    capable: true,
    title: "일머리",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 확대를 막지 않는다. 저시력 사용자의 확대를 차단하는 것은 접근성 위반이다.
  maximumScale: 5,
  // 설치했을 때 제목 표시줄 색. 화성시 BI 의 HS Blue — manifest 의 theme_color 와 같은 값이다.
  themeColor: "#004696",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 글꼴은 HTML을 읽는 즉시 나가야 한다. globals.css 안에 @import 로 두면
            앱 CSS 를 다 받아 파싱한 뒤에야 찾아 나서는 직렬 체인이 되고,
            번들에 인라인하면 타입 한 줄만 고쳐도 폰트 선언까지 다시 내려간다.
            같은 출처라 DNS·TLS 도 새로 물지 않는다(globals.css 머리 주석 참조).

            eslint 의 no-css-tags 는 「번들러가 관리하게 하라」는 규칙인데,
            여기서는 캐시 단위를 분리하려고 일부러 밖에 둔 것이라 끈다. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/fonts/pretendard-gov.css" />
      </head>
      <body className="flex min-h-full flex-col">
        {/* 건너뛰기 링크 — 키보드 사용자가 반복 영역을 지나 본문으로 바로 이동한다.
            체크리스트(컴포넌트-건너뛰기 링크): 모든 화면 제공, 3개 이내, 첫 항목은 핵심 영역 */}
        <a href="#main" className="skip-link">
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
