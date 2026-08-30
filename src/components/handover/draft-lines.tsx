import { Fragment } from "react";
import Link from "next/link";
import type { DraftParagraph, DraftRef } from "@/lib/handover-draft";
import { workDocHref, workHref, workTalkHref } from "@/lib/types";

/**
 * 근거 줄이 가리키는 자리.
 *
 * 대화를 인용한 줄만 대화 탭으로 보낸다. 업무 제목 줄까지 `?tab=talk` 로
 * 보내면 업무를 누른 사람이 대화 목록에 떨어진다 — 업무를 보러 눌렀는데
 * 대화가 열리는 것은 다른 화면이다.
 *
 * 갈래를 문자열 하나에 담지 않고 나눠 둔 값은 여기서 값을 한다. `switch` 가
 * 모든 갈래를 덮지 않으면 타입이 막으므로, 갈래를 하나 더하는 날 **주소를
 * 안 만들어 준 채로 배포되는 길이 없다.** 예전에는 `ref.commentId ? … : …`
 * 였고, 그 모양에서는 새 갈래가 조용히 업무 화면으로 떨어졌을 것이다.
 */
export function draftRefHref(ref: DraftRef): string {
  switch (ref.kind) {
    case "comment":
      return workTalkHref(ref.workId, ref.commentId);
    case "section":
      return workDocHref(ref.workId, ref.sectionId);
    case "doc":
      return workDocHref(ref.workId);
    case "work":
      return workHref(ref.workId);
  }
}

/**
 * 초안 문단 한 개 — **화면판.**
 *
 * ── 왜 이 컴포넌트가 생겼나 ────────────────────────────────────────────────
 *
 * 근거 꼬리표는 오랫동안 세는 말뿐이었다. 「대화 26건 중 8건」은 어디서
 * 나왔는지 적었다는 **주장**이지 확인 수단이 아니다. 2차 심사에서
 * *"AI가 쓴 답변같이 보였는데"* 라는 말이 나왔고, 거기에 대고 아니라고 말해
 * 봐야 소용이 없다. 누르면 원문 대화로 가는 것 하나가 그 자리에서 끝낸다.
 *
 * ── 종이와 갈라지는 유일한 지점이다 ────────────────────────────────────────
 *
 * 문단은 `handover-draft.ts` 가 줄의 목록으로 만들고, 종이·저장본은
 * `draftParagraphText()` 로 글자만 가져간다. **링크는 여기서만 생긴다.**
 * 그래서 화면과 종이가 다른 글을 실을 수는 없고, 화면에만 있는 것은 링크뿐이다.
 *
 * ── 모양 ───────────────────────────────────────────────────────────────────
 *
 * 밑줄을 긋지 않는다. 이 저장소는 전역 링크 밑줄을 걷어냈고(DESIGN.md §16.2),
 * 그 근거가 **「밑줄의 비용은 목록에서 곱해진다」** 였다. 인계서 한 장에 업무
 * 제목과 대화 꼬리표가 열 줄 넘게 서므로 여기가 정확히 그 자리다.
 * 색 말고 구분하는 축은 **굵기**다(같은 문단의 본문은 굵지 않다).
 * 「굵은 글자 + hover 파랑」은 previous-year-callout 과 업무 상세가 이미 쓰는
 * 모양이라 새 규칙이 아니다.
 *
 * 줄 사이의 `\n` 은 부모 `<p>` 의 `whitespace-pre-line` 이 살린다.
 * white-space 는 상속되므로 링크 안쪽 들여쓰기 공백도 그대로 남는다 —
 * 예전 통짜 문자열과 화면에 찍히는 글자가 같아야 하기 때문이다.
 */
export function DraftLines({ lines }: { lines: DraftParagraph }) {
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? "\n" : null}
          {line.ref ? (
            <Link
              href={draftRefHref(line.ref)}
              /* 출처 층이 무엇을 비출지를 **데이터가 정한다.**
                 업무 제목 줄에도 `ref` 가 붙어 있지만 그건 출처가 아니라
                 **이동 링크**다. 둘을 한 덩이로 세면 「출처 붙은 문장」이 두 배
                 가까이 부풀려지고(handover-draft.ts 의 screeningTotal 주석),
                 화면에서 한 덩이로 비추면 같은 거짓말을 눈으로 한다.
                 그래서 갈래를 그대로 실어 두고 CSS 가 인용만 고른다
                 (globals.css 의 `#handover-prov:checked ~ .sheet [data-src]`).
                 값까지 싣는 것은 서랍이 무엇을 열지 알아야 하기 때문이다. */
              data-src={line.ref.kind === "work" ? undefined : line.ref.kind}
              className="font-bold text-gray-90 transition-colors duration-150 hover:text-primary"
            >
              {line.text}
            </Link>
          ) : (
            line.text
          )}
        </Fragment>
      ))}
    </>
  );
}
