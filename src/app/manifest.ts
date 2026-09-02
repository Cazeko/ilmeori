import type { MetadataRoute } from "next";

/**
 * 웹 앱 설명서 — `/manifest.webmanifest` 로 나간다.
 *
 * 이게 있으면 브라우저가 「홈 화면에 추가」를 띄운다. 시청 자리의 컴퓨터에서
 * 주소창 없이 뜨는 창 하나로 열리는 것이, 하루 종일 띄워 두는 업무 도구에는
 * 실제로 편하다.
 *
 * ── 덧붙이는 층이다 ────────────────────────────────────────────────────────
 *
 * 설치하지 않아도, 서비스워커가 없어도, 자바스크립트가 꺼져 있어도 이 앱은
 * 지금까지와 똑같이 돈다. PWA 는 얹는 것이지 기대는 것이 아니다.
 *
 * ── 두 색이 다른 이유 ──────────────────────────────────────────────────────
 *
 *   background_color  창이 뜨는 첫 순간의 색. 본문 바탕(--color-gray-5)과 같다.
 *                     흰색으로 두면 열 때마다 흰 판이 한 번 번쩍인다.
 *   theme_color       제목 표시줄 색. 화성시 BI 의 HS Blue.
 *
 * ⚠ 이 경로는 로그인하지 않은 브라우저도 읽는다(`<link rel="manifest">` 는
 * 인증 쿠키를 붙이지 않는다). `src/proxy.ts` 의 matcher 에서 빼 두지 않으면
 * 로그인 화면 HTML 이 설명서 자리로 돌아와 설치가 통째로 실패한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // 지정과제 N7 의 공식 명칭(「부서 간 협업 업무공유 플랫폼」)은 README 부제·
    // 로그인 화면 배지에 그대로 남아 있다 — 여기는 「홈 화면에 추가」 아이콘
    // 아래 뜨는 이름이라, 무엇을 하는 도구인지가 더 급하다(layout.tsx 참조).
    name: "일머리 — 인수인계 자동화 플랫폼",
    short_name: "일머리",
    description:
      "화성시 공무원이 팀 단위로 업무를 쌓고, 인사이동이 와도 그 기록을 끊김 없이 넘기는 내부 협업 플랫폼",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f0f1f2",
    theme_color: "#004696",
    categories: ["productivity", "business", "government"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable 은 홈 화면이 제 모양대로 잘라 간다. 안전 영역(80%) 안에 도형을
      // 넣은 별도 그림이 필요하다 — 같은 그림을 주면 둥근 아이콘에서 화살표가 잘린다.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "결재함", url: "/approvals" },
      { name: "업무 보드", url: "/works" },
      { name: "인계·인수", url: "/handover" },
    ],
  };
}
