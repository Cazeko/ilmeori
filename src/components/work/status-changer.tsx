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
 */

const COLUMNS: WorkStatus[] = ["todo", "doing", "review", "done"];

const ON: Record<WorkStatus, string> = {
  todo: "bg-status-todo-text text-white",
  doing: "bg-status-doing-text text-white",
  review: "bg-status-review-text text-white",
  done: "bg-status-done-text text-white",
};

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
        <legend className="mb-1.5 text-body-xs font-bold text-gray-60">
          진행 상태
        </legend>
        <div className="inline-flex overflow-hidden rounded-sm border border-gray-20">
          {COLUMNS.map((s, i) => {
            const active = s === current;
            return (
              <button
                key={s}
                type="submit"
                name="status"
                value={s}
                aria-pressed={active}
                className={cn(
                  "min-h-11 cursor-pointer px-3.5 text-body-sm font-bold transition-colors duration-150",
                  i > 0 && "border-l border-gray-20",
                  active ? ON[s] : "bg-white text-gray-60 hover:bg-gray-5",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      </fieldset>
    </form>
  );
}
