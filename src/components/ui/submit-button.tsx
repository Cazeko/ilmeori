"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/**
 * 제출 버튼.
 *
 * button.tsx는 「처리 중에는 비활성화한다」고 적어 두고 정작 그렇게 만드는 곳이
 * 없었다. 그 문장을 사실로 만드는 파일이다.
 *
 * ── 왜 useFormStatus인가 ──────────────────────────────────────────────────
 *
 * 서버 액션은 전부 redirect로 끝난다(actions/guard.ts의 finish). 그래서
 * useActionState는 쓸 수 없다 — 돌아오는 값 자체가 없어 state가 영영 초깃값이다.
 * 필요한 것도 결과가 아니라 **진행 표시**다. 결과는 지금처럼 주소의 ?msg= 가
 * 나른다(actions/feedback.ts).
 *
 * useFormStatus는 감싸고 있는 <form>의 DOM 컨텍스트만 읽는다. 그래서
 *   · 자바스크립트가 없거나 아직 하이드레이션 전이면 평범한 <button type=submit>이고
 *   · 서버 액션을 감싸지 않으므로 무JS 제출 경로(303 + Location)가 그대로 살아 있다.
 * 훅은 「눌렀다는 것을 보여 주는 일」만 한다.
 *
 * pending은 제출한 순간부터 새 화면이 커밋될 때까지다 — 사용자가 아무것도 못
 * 보던 구간을 정확히 덮는다.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: ComponentProps<typeof Button> & {
  /** 처리 중에 보여 줄 글. 없으면 원래 글을 그대로 두고 흐리게만 만든다. */
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      // 되돌릴 수 없는 동작(결재·인계)에서 두 번 눌리는 사고를 여기서 끊는다.
      disabled={disabled || pending}
      aria-busy={pending}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
