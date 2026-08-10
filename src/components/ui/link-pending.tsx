"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

/**
 * 링크를 눌렀다는 표시.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 *
 * 폼에는 눌린 표시를 줬는데(SubmitButton) 링크 이동에는 없었다. 실측하면
 * 클릭에서 새 화면이 보이기까지 **156~229ms**이고, 그동안 화면이 그대로다.
 * 사람은 그 정지를 「눌리지 않았다」로 읽고 한 번 더 누른다.
 *
 * 서버를 더 빠르게 만들어서 없앨 수 있는 구간이 아니다. 그 190ms 중
 * 우리 코드가 쓰는 것은 70~175ms뿐이고, 나머지는 네트워크와 Vercel 라우팅이다.
 * 없앨 수 없으면 **비어 있지 않게** 만드는 것이 맞다.
 *
 * ── 왜 loading.tsx 가 아니라 이것인가 ─────────────────────────────────────
 *
 * Next 문서가 useLinkStatus 를 권하는 조건이 정확히 우리 경우다 —
 * 「목적지가 동적이고 loading.js 가 없어 즉시 전환이 안 되는 경우」.
 * loading.tsx 를 두면 본문이 <div hidden> 으로 흘러와 스크립트가 옮기는
 * 구조가 되어, 자바스크립트가 꺼진 브라우저에서는 회색 뼈대만 남는다.
 * 이 제품은 그걸 전제로 걸었으므로 그 길은 막혀 있다.
 *
 * 이 훅은 <Link> 안에서만 동작하고 서버 렌더에는 아무것도 남기지 않는다.
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
 * `<Link>` 의 자식으로 두고, 부모에 `has-[[data-link-pending]]:opacity-60` 을
 * 걸어 쓴다. 부모를 client 로 만들지 않으려고 이렇게 나눴다.
 */
export function LinkPendingMark() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden data-link-pending className="hidden" />;
}
