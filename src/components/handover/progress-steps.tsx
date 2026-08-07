import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { HANDOVER_STATUS_LABEL, type HandoverStatus } from "@/lib/types";

/**
 * 인계 진행 단계.
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
    <ol className="grid gap-3 sm:grid-cols-4">
      {ORDER.map((step, i) => {
        const done = i < index;
        const now = i === index;
        return (
          <li
            key={step}
            aria-current={now ? "step" : undefined}
            className={cn(
              "rounded-md border px-4 py-3",
              now
                ? "border-accent bg-accent-bg"
                : done
                  ? "border-gray-10 bg-surface"
                  : "border-dashed border-gray-20 bg-surface",
            )}
          >
            <p className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  done
                    ? "bg-status-done-text text-white"
                    : now
                      ? "bg-accent-text text-white"
                      : "bg-gray-10 text-gray-60",
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-body-sm",
                  now ? "font-bold text-gray-90" : "text-gray-60",
                )}
              >
                {HANDOVER_STATUS_LABEL[step]}
              </span>
              {done ? <span className="sr-only">완료</span> : null}
              {now ? <span className="sr-only">현재 단계</span> : null}
            </p>
            <p className="mt-1 pl-7 text-body-xs break-keep text-gray-60">
              {DESC[step]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
