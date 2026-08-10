"use client";

/**
 * 마지막 그물.
 *
 * 여기까지 오면 뿌리 레이아웃도 그려지지 않은 상태다. 그래서 <html>·<body>를
 * 직접 적어야 하고, 이 파일만은 스타일도 스스로 들고 있어야 한다 —
 * globals.css 를 물어 오는 <link>가 레이아웃에 있었기 때문이다.
 *
 * 없으면 Next 가 기본 화면을 내는데, 그것은 영어이고("Application error:
 * a client-side exception has occurred") 돌아갈 길도 없다. 시청 창구에서
 * 그 화면을 보는 것은 「고장」이 아니라 「이 시스템은 우리 것이 아니다」로 읽힌다.
 *
 * 인라인 style 을 쓰는 이유: 이 화면이 뜨는 상황은 CSS 자체가 안 왔을 수도 있는
 * 상황이다. Tailwind 클래스에 기대면 정작 필요한 순간에 아무 모양도 안 나온다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          background: "#f0f1f2",
          color: "#1e2124",
          fontFamily:
            '"Pretendard GOV", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          wordBreak: "keep-all",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "28rem",
            background: "#fafafa",
            border: "1px solid #e6e8ea",
            borderRadius: "10px",
            padding: "28px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "24px", lineHeight: 1.4 }}>
            화면을 그리지 못했습니다
          </h1>
          <p
            style={{
              marginTop: "12px",
              fontSize: "15px",
              lineHeight: 1.5,
              color: "#58616a",
            }}
          >
            저장하신 내용은 그대로 있습니다. 다시 시도해도 같은 화면이 나오면
            주소를 그대로 담당자에게 전해 주십시오.
          </p>

          {/* 오류 내용은 적지 않는다. 여기 찍히는 문장에는 업무 제목이나 사람
              이름이 섞여 나올 수 있고, 이 화면은 누구에게든 보일 수 있다.
              digest 는 서버 로그와 맞춰 보기 위한 값이라 사람 정보가 없다. */}
          {error.digest ? (
            <p
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "#6d7882",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              오류 번호 {error.digest}
            </p>
          ) : null}

          <div
            style={{
              marginTop: "24px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "44px",
                padding: "0 24px",
                borderRadius: "4px",
                border: 0,
                background: "#004696",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            {/* 스크립트가 죽어 reset 이 듣지 않는 경우가 있다. 그때도 나갈 길 하나는 있어야 한다.
                next/link 를 쓰지 않는다 — 이 화면은 라우터 바깥에서 그려지고,
                여기까지 온 이상 그 라우터를 다시 믿을 수 없다. 문서를 통째로
                새로 받는 이동이라야 확실히 빠져나간다. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 24px",
                borderRadius: "4px",
                border: "1px solid #8a949e",
                background: "#fafafa",
                color: "#33363d",
                fontSize: "15px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              홈으로
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
