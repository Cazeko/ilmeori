"use client";

import { useActionState, useSyncExternalStore } from "react";
import { CheckCircle2, Loader2, PenLine } from "lucide-react";
import { moveMissedToNote, type MoveMissedState } from "@/lib/actions/handover";
import { AnchorLink } from "@/components/handover/anchor-link";
import { Button } from "@/components/ui/button";

/**
 * 「보충으로 넣기」 — 누르면 그 자리에서 보충이 되고, 단추가 「보충됨」으로 바뀐다.
 *
 * ── 화면이 움직이지 않는다 ─────────────────────────────────────────────────
 *
 * 처음에는 서버 액션이 저장한 뒤 `/handover#missed-…` 로 되돌려 보냈다. 그러면
 * 화면이 한 번 다시 그려지며 위로 튀었다가 그 줄로 내려온다 — 아홉 줄을 연달아
 * 누르는 사람에게는 아홉 번 튄다. 지금은 스크립트가 있으면 폼이 그 자리에서
 * 제출되고(useActionState) 결과만 받는다. 저장이 끝나면 이 부품이 「보충됨」
 * 글줄로 바뀌고(짧게 떠오른다), 서버가 새로 그린 화면도 같은 글줄을 그리므로
 * 바뀐 뒤에 다시 튀지 않는다.
 *
 * 스크립트가 없으면 같은 폼이 그대로 제출되고 서버가 그 줄로 되돌려 보낸다 —
 * `inline` 표식은 스크립트가 붙은 뒤에만 실린다.
 */
export function MoveMissedButton({
  handoverId,
  src,
  targetHeading,
}: {
  handoverId: string;
  src: string;
  targetHeading: string;
}) {
  const [state, formAction, pending] = useActionState<MoveMissedState | null, FormData>(
    moveMissedToNote,
    null,
  );
  // 스크립트가 붙었는지 — 서버 렌더에서는 거짓, 클라이언트에서는 참.
  // 효과에서 상태를 바꾸는 대신 외부 저장소 구독 형태로 읽는다(react-hooks 규칙).
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (state?.ok) {
    return <MovedLabel heading={state.heading} anchor={state.anchor} fresh />;
  }

  return (
    <form
      action={formAction}
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
      aria-live="polite"
    >
      <input type="hidden" name="handoverId" value={handoverId} />
      <input type="hidden" name="src" value={src} />
      {hydrated ? <input type="hidden" name="inline" value="1" /> : null}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        className="transition-colors duration-150"
      >
        {pending ? (
          <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
        ) : (
          <PenLine aria-hidden className="size-4" />
        )}
        {pending ? "넣는 중…" : "보충으로 넣기"}
      </Button>
      <span className="text-body-xs break-keep text-gray-60">
        → 「{targetHeading}」에 원문 그대로
      </span>
      {state && !state.ok ? (
        <span role="alert" className="text-body-xs font-bold break-keep text-danger">
          {state.text}
        </span>
      ) : null}
    </form>
  );
}

/**
 * 「보충됨」 — 단추가 아니라 글줄이다. 눌린 것처럼 칠한 단추는 다시 누르게 만든다.
 * 서버가 그리는 줄(screening-panel.tsx)과 방금 넣은 줄이 같은 부품이라 모양이
 * 어긋나지 않는다. `fresh` 는 방금 바뀐 것만 짧게 떠오르게 한다.
 */
export function MovedLabel({
  heading,
  anchor,
  fresh = false,
}: {
  heading: string;
  anchor: string;
  fresh?: boolean;
}) {
  return (
    <p
      className={
        "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs font-bold text-gray-90" +
        (fresh ? " motion-safe:animate-rise-in" : "")
      }
    >
      <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
      보충됨
      <span className="font-normal text-gray-60">·</span>
      <AnchorLink
        href={`#${anchor}`}
        className="text-primary transition-colors duration-150 hover:text-primary-hover"
      >
        「{heading}」의 인계자 보충으로
      </AnchorLink>
    </p>
  );
}
