"use client";

import { useFormStatus } from "react-dom";
import { WaitingGlobe } from "@/components/ui/waiting-globe";

/**
 * 서버가 문서를 짜는 동안 덮는 판.
 *
 * ── 왜 단추 하나로는 부족한가 ──────────────────────────────────────────────
 *
 * `SubmitButton` 은 눌린 단추를 비활성으로 만들고 「만드는 중…」을 적는다.
 * 짧은 저장에는 그것으로 충분한데, 인계서 초안과 결재 문서는 다르다 —
 * 서버가 쌓인 기록을 훑어 별지 제12호서식 순서로 조립하므로 **몇 초**가
 * 걸리고, 그 단추는 대개 **긴 폼의 맨 아래**에 있어 눌린 뒤 화면 밖으로
 * 밀려나 있는 경우가 많다. 즉 「무슨 일이 일어나는 중」이라는 신호가 화면
 * 어디에도 안 남는다.
 *
 * 그래서 여기서는 화면 가운데를 덮는다. 덮개는 세 가지를 한다.
 *
 *   ① 무슨 일이 벌어지는 중인지 말한다 (role="status" — 소리로도 간다)
 *   ② 폼을 두 번 건드리지 못하게 막는다 (되돌릴 수 없는 동작이다)
 *   ③ 기다리는 몇 초에 이 제품이 자기가 누구인지 말한다 (WaitingGlobe)
 *
 * ── 진행률을 지어내지 않는다 ──────────────────────────────────────────────
 *
 * 막대를 그리고 싶어지는데, 서버가 몇 퍼센트까지 왔는지 이 화면은 모른다.
 * 모르는 것을 아는 척하는 진행률은 **끝날 때 튀거나 90%에서 멈춘다.**
 * 아는 것만 적는다 — 「무엇을 만들고 있고」, 「그것이 어디서 나오는지」.
 *
 * ── `useFormStatus` 인 이유 ───────────────────────────────────────────────
 *
 * 감싸는 `<form>` 의 DOM 컨텍스트만 읽는다. 그래서 스크립트가 없거나 아직
 * 하이드레이션 전이면 이 덮개는 **아예 없고**, 폼은 평범한 폼으로 제출된다
 * (ui/submit-button.tsx 에 같은 판단). 덮개가 동작의 조건이 되면 안 된다.
 */
export function FormWaiting({
  title,
  hint,
}: {
  /** 지금 무엇을 만들고 있는가. 아는 사실만 적는다. */
  title: string;
  /** 그것이 어디서 나오는지 한 줄. */
  hint?: string;
}) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div
      // 대화상자 층(globals.css 의 z 규약 다섯 칸 중 맨 위).
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-90/40 p-6"
    >
      <div
        role="status"
        aria-live="polite"
        // 문서 등급 겉모양 — 흰 종이에 위쪽 먹선. 이 판이 말하는 것은
        // 「지금 종이 한 장이 만들어지는 중」이라 그 모양이 맞다.
        className="animate-rise-in flex max-w-sm flex-col items-center border border-rule-frame border-t-2 border-t-rule-head bg-gray-0 px-8 py-8 text-center"
      >
        <WaitingGlobe />
        <p className="mt-4 text-h3 font-bold break-keep text-gray-90">{title}</p>
        {hint ? (
          <p className="mt-2 text-body-sm leading-relaxed break-keep text-gray-60">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
