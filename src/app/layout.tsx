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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 확대를 막지 않는다. 저시력 사용자의 확대를 차단하는 것은 접근성 위반이다.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
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
