import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { HANDOVER_STATUS_LABEL, type HandoverStatus } from "@/lib/types";

/**
 * 인계 진행 단계 — **세로**로.
 *
 * ── 왜 가로에서 세로로 갔나 ────────────────────────────────────────────────
 *
 * 넉 칸짜리 가로 격자로 화면 맨 위에 있었다. 그 자리에는 두 가지 문제가 있었다.
 *
 *   ① **한 번 지나가면 다시 안 보인다.** 이 화면은 서식 한 벌(약 4,500px)과
 *      작업대가 이어 붙은 긴 화면이다. 아래에서 근거를 확인하는 동안 「지금
 *      몇 단계이고 다음이 무엇인지」는 스크롤 저 위에 있었다.
 *   ② **할 일과 떨어져 있었다.** 「지금 인계자 확인 단계」라고 말하는 자리와
 *      「내용을 확인했습니다」 단추가 화면의 정반대 끝에 있었다.
 *
 * 그래서 오른쪽 여백에 붙박이로 세운다(handover-rail.tsx). 그 기둥의 폭은
 * 320px 이라 넉 칸을 가로로 못 놓는다 — 세로가 자리에 맞는 모양이다.
 *
 * 되돌릴 수 없는 절차라 "지금 어디까지 왔고 다음이 무엇인지"가 늘 보여야 한다.
 * 색만으로 구분하지 않도록 지난 단계에는 체크 표시를, 현재 단계에는 글자를 굵게 둔다.
 */

const ORDER: HandoverStatus[] = ["draft", "generated", "confirmed", "completed"];

const DESC: Record<HandoverStatus, string> = {
  draft: "넘길 업무를 고릅니다",
  generated: "쌓인 기록에서 인계서 초안을 만듭니다",
  confirmed: "인계자가 내용을 확인합니다",
  completed: "권한이 인수자에게 넘어갑니다",
};

export function ProgressSteps({ current }: { current: HandoverStatus }) {
  const index = ORDER.indexOf(current);

  return (
    <ol className="flex flex-col">
      {ORDER.map((step, i) => {
        const done = i < index;
        const now = i === index;
        const last = i === ORDER.length - 1;
        return (
          <li
            key={step}
            aria-current={now ? "step" : undefined}
            className="flex gap-3"
          >
            {/* 동그라미와 그 아래로 내려가는 선. 선을 동그라미 열에 두므로
                글자가 몇 줄이 되든 기둥이 흔들리지 않는다. */}
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-body-xs font-bold",
                  // 끝난 단계는 초록이었다. 이 화면에서 색이 뜨는 자리는
                  // 「지금 어느 단계인가」(주황) 하나여야 한다 — 끝난 단계가
                  // 지금 단계만큼 튀면 어디까지 왔는지가 오히려 흐려진다.
                  // 무채색으로 내리되 아직 안 한 단계보다는 진하게 둔다.
                  done
                    ? "bg-gray-60 text-white" // 6.30:1
                    : now
                      ? "bg-accent-text text-white" // 5.48:1
                      : "bg-gray-10 text-gray-60", // 5.13:1
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              {last ? null : (
                <span
                  aria-hidden
                  className={cn(
                    "w-px flex-1",
                    // 지나온 마디는 진한 선, 아직 안 온 마디는 흐린 선.
                    // 선 하나로 「여기까지 왔다」가 한눈에 보인다.
                    done ? "bg-gray-60" : "bg-rule-hair",
                  )}
                />
              )}
            </div>
            <div className={cn("min-w-0", last ? "" : "pb-4")}>
              <p
                className={cn(
                  "text-body-sm leading-5",
                  now ? "font-bold text-gray-90" : "text-gray-60",
                )}
              >
                {HANDOVER_STATUS_LABEL[step]}
              </p>
              {done ? <span className="sr-only">완료</span> : null}
              {now ? <span className="sr-only">현재 단계</span> : null}
              {/* 설명은 **지금과 앞으로**에만 둔다.
                  「지금 단계에만」으로 뒀다가 고쳤다 — 그때 적어 둔 근거는
                  「전체 설명은 인계 대기 화면이 이미 한다」였는데, 그 화면은
                  진행 중인 인계가 **없을 때만** 그려진다(HandoverStandby).
                  즉 인계 안에 있는 사람은 그 설명을 영영 못 본다. 되돌릴 수
                  없는 절차에서 「다음에 무슨 일이 벌어지나」를 못 읽는 것은
                  좁은 기둥을 아끼는 것보다 비싸다.
                  지나온 단계만 접는다 — 이미 한 일은 설명할 것이 없다. */}
              {done ? null : (
                <p className="mt-1 text-body-xs leading-relaxed break-keep text-gray-60">
                  {DESC[step]}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
