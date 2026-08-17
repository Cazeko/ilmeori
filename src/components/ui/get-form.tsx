"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * 조건을 주소에 싣는 GET 폼 — 스크립트가 있으면 화면을 갈지 않고 옮긴다.
 *
 * ── 왜 이것이 필요했나 ────────────────────────────────────────────────────
 *
 * 이 앱의 조건(검색·부서·탭)은 전부 주소에 남는다. 그것을 평범한
 * `<form method="get">` 으로 짜 두었고, 스크립트가 없어도 도는 이유가 그것이다.
 *
 * 그런데 브라우저의 기본 제출은 **전체 페이지 로드**다. 그리고 이 앱의 응답에는
 * `Cache-Control: no-store` 가 붙는다(로그인한 사람의 화면이라 그래야 한다).
 * 크롬·파이어폭스는 `no-store` 가 붙은 문서를 **bfcache 에 넣지 않는다.**
 *
 * 그래서 이런 일이 벌어졌다 —
 *
 *   머리 줄에서 업무를 검색한다        → 전체 페이지 로드
 *   결과를 보고 뒤로가기를 누른다      → bfcache 가 없으니 서버까지 다시 갔다 온다
 *                                        (실측 868ms · 요청 41건 · 문서 재수신)
 *
 * 조건을 한 번이라도 걸고 나면 그 뒤의 앞으로·뒤로가 전부 이 느린 길로 간다.
 * 폼이 흔한 앱이라 「가끔」이 아니라 「거의 언제나」였다.
 *
 * 스크립트가 있을 때 router.push 로 옮기면 이동이 클라이언트 안에서 끝나고,
 * 앞뒤 화면이 라우터 캐시에 남는다. 같은 뒤로가기가 실측 11~95ms 다.
 *
 * ── 스크립트가 없으면 ──────────────────────────────────────────────────────
 *
 * 아무 일도 하지 않는다. onSubmit 이 붙지 않으므로 브라우저가 평소대로 제출하고,
 * 결과도 주소도 지금과 똑같다. 가로채는 것이지 대체하는 것이 아니다.
 */
export function GetForm({
  action,
  onSubmit,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action" | "method"> & { action: string }) {
  const router = useRouter();

  return (
    <form
      method="get"
      action={action}
      onSubmit={(event) => {
        onSubmit?.(event);
        if (event.defaultPrevented) return;

        // 브라우저가 할 일을 우리가 대신한다. 여기서 던지면 이동 자체가
        // 사라지므로, 실패하면 가로채지 않고 기본 제출로 흘려보낸다.
        let href: string;
        try {
          const data = new FormData(event.currentTarget);
          const params = new URLSearchParams();
          for (const [key, value] of data.entries()) {
            // 빈 칸은 싣지 않는다. 브라우저 기본 제출은 `?q=&dept=` 처럼
            // 빈 값도 싣는데, 서버는 그것을 「조건 없음」과 같게 보므로 결과는
            // 같고 주소만 지저분해진다. 주소는 공유되는 것이라 짧을수록 낫다.
            if (typeof value === "string" && value.trim() !== "") {
              params.append(key, value);
            }
          }
          const qs = params.toString();
          href = qs ? `${action}?${qs}` : action;
        } catch {
          return;
        }

        event.preventDefault();
        router.push(href);
      }}
      {...props}
    >
      {children}
    </form>
  );
}
