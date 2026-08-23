"use client";

import { useFormStatus } from "react-dom";
import { changeStatus } from "@/lib/actions/works";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, type WorkStatus } from "@/lib/types";

/**
 * 상태 바꾸기.
 *
 * 드롭다운을 열고 고른 뒤 저장을 누르는 대신, 네 칸 중 하나를 누르면 끝난다.
 * 자바스크립트 없이도 동작하도록 각 칸이 서로 다른 값을 보내는 제출 버튼이다.
 *
 * 열람자에게는 아예 그리지 않는다. 눌리지 않는 버튼을 보여 주는 것보다
 * 없는 편이 낫다. (막는 일은 화면이 아니라 서버와 DB가 한다)
 *
 * ── 누른 칸은 서버를 기다리지 않고 바로 켠다 ───────────────────────────────
 *
 * 이 화면에서 사람이 가장 자주 하는 동작이고, 예전에는 누른 뒤 서버가 답할
 * 때까지 아무 일도 일어나지 않았다. 지금은 useFormStatus().data 에서 방금
 * 보낸 status 를 읽어 그 칸을 먼저 켠다.
 *
 * useOptimistic 이 아니라 이걸 쓰는 이유: 서버 액션을 감싸지 않으므로
 * 자바스크립트가 없을 때의 제출 경로가 그대로 남는다. 하이드레이션 전에는
 * 그냥 평범한 제출 버튼 네 개다.
 *
 * 서버가 거절하면(권한이 없거나 이미 보관된 업무) 되돌아온 화면이 원래 상태를
 * 그리고 ?msg= 가 이유를 말한다. 낙관적으로 켜 둔 칸은 그때 사라진다.
 */

const COLUMNS: WorkStatus[] = ["todo", "doing", "review", "done"];

/* 켜진 칸. 예전에는 상태마다 다른 색으로 채웠는데(회색·파랑·황토·초록),
   **한 번에 하나만 켜지므로 색으로 구분할 이유가 없다.** 무엇이 켜졌는지는
   글자가 말하고, 켜졌다는 사실은 채움이 말한다. 네 색을 하나로 줄인다. */
const ON = "bg-gray-80 text-white"; // 11.09:1

function Columns({ current }: { current: WorkStatus }) {
  const { pending, data } = useFormStatus();

  // 제출 중이면 방금 누른 칸을, 아니면 서버가 준 값을 켠다.
  const submitted = pending ? data?.get("status") : null;
  const shown =
    typeof submitted === "string" && COLUMNS.includes(submitted as WorkStatus)
      ? (submitted as WorkStatus)
      : current;

  return (
    <div
      aria-busy={pending}
      className="inline-flex overflow-hidden rounded-sm border border-rule-hair"
    >
      {COLUMNS.map((s, i) => {
        const active = s === shown;
        return (
          <button
            key={s}
            type="submit"
            name="status"
            value={s}
            aria-pressed={active}
            // 처리 중에는 더 못 누르게 한다. 연달아 누르면 마지막 것만 남는 게
            // 아니라 요청이 겹쳐 서로 다른 결과가 오간다.
            disabled={pending}
            className={cn(
              "min-h-11 cursor-pointer px-4 text-body-sm font-bold transition-colors duration-150",
              "disabled:cursor-not-allowed",
              i > 0 && "border-l border-rule-hair",
              active ? ON : "bg-surface text-gray-60 hover:bg-gray-5",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

export function StatusChanger({
  workId,
  current,
}: {
  workId: string;
  current: WorkStatus;
}) {
  return (
    <form action={changeStatus}>
      <input type="hidden" name="workId" value={workId} />
      <fieldset>
        <legend className="mb-2 text-body-xs font-bold text-gray-60">
          진행 상태
        </legend>
        <Columns current={current} />
      </fieldset>
    </form>
  );
}
