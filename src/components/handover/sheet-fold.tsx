import { ChevronDown } from "lucide-react";

/**
 * 인계서를 접었다 펴는 손잡이 — **인계가 끝난 화면에서만.**
 *
 * ── 왜 끝난 뒤에만 접나 ────────────────────────────────────────────────────
 *
 * 실행 전의 이 화면이 하러 온 일은 **서식을 읽고 확인하는 것**이다. 그 문서를
 * 기본으로 접어 두면 화면이 자기가 시키는 일을 자기가 가린다.
 *
 * 끝난 뒤에는 다르다. 서식은 이미 확인이 끝났고 파일로 챙기면 되는 물건이며,
 * 그 화면에서 사람이 실제로 하는 일은 **문답**과 **파일 내려받기**다.
 * 그런데 서식이 약 4,500px 이라, 접지 않으면 그 둘이 늘 스크롤 저 아래에 있다.
 * 그래서 끝난 화면에서만 접고, 접힌 상태를 기본으로 둔다.
 *
 * ── 왜 체크박스인가 ────────────────────────────────────────────────────────
 *
 * `print-sheet.tsx` 가 `server-only` 를 물고 있어서 그 서식을 감싸는 컴포넌트에
 * `"use client"` 를 붙이면 빌드가 깨진다. 「문장마다 출처 보기」가 같은 이유로
 * 체크박스인 자리이고(sheet-caption.tsx), 여기도 같다.
 *
 * 얻는 것도 같다 — 하이드레이션 0 · 자바스크립트 꺼져도 동작 · 인쇄 덮어쓰기가
 * 한 줄. 특히 마지막이 중요하다: **접힌 채로 인쇄해도 종이에는 서식이 나온다**
 * (globals.css 의 @media print).
 *
 * ── 글자를 CSS 로 만들지 않는다 ────────────────────────────────────────────
 *
 * 「펼치기 ↔ 접기」를 `content:` 로 바꾸는 것이 짧지만, 이 저장소는 **CSS 가
 * 글자를 만들어 내지 않는다**를 시험으로 지키고 있다(tests/handover-sheet.test.mjs
 * [6]). 그 규칙이 지키는 것은 「종이에 찍히는 글자는 데이터에서만 나온다」이고,
 * 한 번 예외를 만들면 그 시험이 무엇을 지키는지 흐려진다. 낱말 둘을 다 그려
 * 두고 보이는 쪽만 CSS 가 고른다.
 */
export const SHEET_FOLD_ID = "handover-fold";

export function SheetFold({ blocks }: { blocks: number }) {
  return (
    <>
      {/* 서식과 **형제여야 한다.** CSS 가 `#handover-fold:not(:checked) ~ .sheet`
          로 접기 때문이다. 래퍼 안으로 한 겹만 들어가도 그 선택자가 조용히
          아무것도 안 맞힌다(sheet-caption.tsx 와 같은 제약). */}
      <input type="checkbox" id={SHEET_FOLD_ID} className="sr-only" />
      <label htmlFor={SHEET_FOLD_ID} className="fold-toggle mb-4 print:hidden">
        <ChevronDown aria-hidden className="size-4 shrink-0" />
        {/* 어느 쪽이 보일지는 CSS 가 고른다. 둘 다 DOM 에 있으므로 화면 낭독기는
            펼침 상태에 맞는 낱말 하나만 읽는다(감춘 쪽은 display:none 이다). */}
        <span className="fold-open">
          인계서 펼쳐 보기
          <span className="ml-1 font-normal tabular-nums text-gray-60">
            {blocks}개 항목
          </span>
        </span>
        <span className="fold-close">인계서 접기</span>
      </label>
    </>
  );
}
