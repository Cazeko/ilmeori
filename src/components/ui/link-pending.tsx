"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

/**
 * 링크를 눌렀다는 표시.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 *
 * 폼에는 눌린 표시를 줬는데(SubmitButton) 링크 이동에는 없었다. 실측하면
 * 클릭에서 새 화면이 보이기까지 **383~448ms**(프로덕션)이고 그동안 화면이
 * 그대로다. 사람은 그 정지를 「눌리지 않았다」로 읽고 한 번 더 누른다.
 *
 * 그리고 그 383~448ms 는 전송이 아니라 **서버가 화면을 그리는 시간**이다
 * (첫 바이트 시각과 전체 시각이 같다). 즉 스트리밍으로 나눠 보낼 수 있는
 * 구간이 아니라, 왕복 수를 줄이거나 — 줄일 수 없는 만큼은 — 비워 두지 않는
 * 수밖에 없다.
 *
 * ── 왜 loading.tsx 가 아닌가 ──────────────────────────────────────────────
 *
 * loading.tsx 를 두면 주소는 22ms 에 바뀌지만(실측) **본문이 137ms → 337ms 로
 * 늦어진다.** 얻는 것은 빈 뼈대를 일찍 그리는 것뿐이고, 글자는 오히려 늦게 온다.
 * 게다가 본문이 <div hidden> 조각 9~12개로 쪼개져 흘러오고 인라인 스크립트가
 * 꿰매므로, 자바스크립트가 꺼진 브라우저에서는 <main> 이 통째로 빈다
 * (실측: (app) 12개 경로 전부 보이는 글자 159자, main 안 링크·버튼·입력칸 0개).
 *
 * 그래서 여기서는 **경계를 만들지 않고** 클라이언트에서만 자리표시를 그린다.
 * 서버가 그리는 HTML 은 한 글자도 바뀌지 않는다.
 */

/**
 * 링크 안에 두는 도는 표시.
 *
 * 이 훅은 <Link> 의 DOM 컨텍스트만 읽고 서버 렌더에는 아무것도 남기지 않는다.
 * 자바스크립트가 없으면 이 표시가 안 뜰 뿐, 링크는 그대로 링크다.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent",
        "motion-safe:animate-spin motion-reduce:opacity-60",
        className,
      )}
    />
  );
}

/**
 * 링크 전체를 흐리게 만드는 쪽. 카드처럼 안에 글자가 많아 점 하나로는
 * 눌린 것이 안 보이는 자리에 쓴다.
 *
 * `<Link>` 의 자식으로 두고, 부모에 `has-[[data-link-pending]]:opacity-…` 를
 * 걸어 쓴다. 부모를 client 로 만들지 않으려고 이렇게 나눴다.
 */
export function LinkPendingMark() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden data-link-pending className="hidden" />;
}
