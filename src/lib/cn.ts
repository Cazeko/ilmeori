import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * 조건부 클래스 + Tailwind 충돌 해소.
 *
 * ── tailwind-merge에 우리 글자크기 토큰을 알려 줘야 하는 이유 ────────────────
 *
 * 우리는 글자크기를 text-body / text-body-sm / text-h2 처럼 이름으로 쓴다.
 * tailwind-merge는 기본 스케일(text-sm, text-lg…)만 알기 때문에,
 * 모르는 text-* 는 전부 **글자색**으로 분류한다.
 *
 * 그래서 아래처럼 색을 먼저 주고 크기를 나중에 주면 색이 조용히 사라진다.
 *
 *     cn("bg-primary text-white", "text-body-sm")
 *       → "bg-primary text-body-sm"     ← text-white가 지워진다
 *
 * 실제로 이 문제로 기본 버튼 글자가 파란 바탕에 검은색(대비 1.78:1)으로
 * 렌더링되고 있었다. 눈으로는 잘 안 보이고 접근성 검사에서 잡혔다.
 *
 * 크기 토큰을 font-size 그룹으로 등록해 두면 색과 크기가 서로를 밀어내지 않는다.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          // h4 는 없앴다 — 본문과 같은 17px 이라 제목 자리에 쓰이면 위계가
          // 무너졌다(globals.css 의 그 자리 주석 참조).
          text: ["body", "body-sm", "body-xs", "body-lg", "h1", "h2", "h3"],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
