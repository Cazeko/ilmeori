import { cn } from "@/lib/cn";

/**
 * 일머리 표식.
 *
 * ── 왜 「일」 글자가 아닌가 ────────────────────────────────────────────────
 *
 * 파란 네모 안에 첫 글자를 넣는 것은 아무 뜻도 없다. 어떤 제품이든 그 자리에
 * 자기 첫 글자를 넣을 수 있고, 그래서 그 표식은 이 제품에 대해 한 가지도
 * 말하지 않는다. 표식이 제품의 주장을 담지 못하면 없는 것과 같다.
 *
 * ── 무엇을 그렸나 ──────────────────────────────────────────────────────────
 *
 *   ▬▬▬▬▬        쌓인 기록 — 문서·대화·이력
 *   ▬▬▬
 *   ▬▬▬▬  ▶      맨 아래 줄이 끊기지 않고 **다음 사람에게로 이어진다**
 *
 * 이 제품이 지목한 문제가 「인사이동이 오면 일머리가 사라진다」이고, 답이
 * 「기록이 사람을 건너 이어진다」이다. 표식이 그 한 문장이다.
 *
 * 이 도형은 `scripts/gen-icons.mjs` 가 그리는 PWA 아이콘과 **같은 좌표**다.
 * 홈 화면에 설치했을 때의 아이콘과 화면 왼쪽 위의 표식이 다르면, 사용자는
 * 그 둘을 같은 제품으로 묶지 못한다. 좌표를 고치면 아이콘도 다시 만든다.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-sm bg-primary text-white",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="size-[70%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.6 6.4h11.2" />
        <path d="M4.6 12h6.6" />
        <path d="M4.6 17.6h8" />
        <path d="M15.2 13.9 19.8 17.6l-4.6 3.7" />
      </svg>
    </span>
  );
}
