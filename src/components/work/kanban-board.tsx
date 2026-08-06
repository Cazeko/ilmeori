import { Inbox } from "lucide-react";
import { WorkCard } from "@/components/work/work-card";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_LABEL, type WorkListItem, type WorkStatus } from "@/lib/types";

/**
 * 업무 보드.
 *
 * 열은 저장된 상태(대기·진행중·검토·완료) 넷이다. '지연'은 열로 두지 않았다.
 * 지연은 일이 놓인 단계가 아니라 그 일에 붙은 사정이기 때문이다.
 * 지연된 업무는 원래 있던 열에 그대로 두고, 카드 쪽에서 붉게 표시한다.
 * 열을 따로 만들면 "진행중이면서 지연"인 업무가 진행중 열에서 사라져 버린다.
 */

const COLUMNS: WorkStatus[] = ["todo", "doing", "review", "done"];

const HEAD: Record<WorkStatus, string> = {
  todo: "border-t-status-todo",
  doing: "border-t-status-doing",
  review: "border-t-status-review",
  done: "border-t-status-done",
};

export function KanbanBoard({ works }: { works: WorkListItem[] }) {
  if (works.length === 0) {
    return (
      <div className="rounded-md border border-gray-10 bg-white">
        <EmptyState
          icon={Inbox}
          title="조건에 맞는 업무가 없습니다"
          description="검색어를 줄이거나 부서 필터를 해제해 보세요. 참여자로 등록되지 않았고 공개 범위에도 해당하지 않는 업무는 애초에 목록에 나타나지 않습니다."
        />
      </div>
    );
  }

  return (
    // items-start: 열마다 내용 높이만큼만 차지한다.
    // 그리드 기본값(stretch)이면 빈 열이 제일 긴 열 높이까지 늘어나 허전해 보인다.
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((status) => {
        const items = works.filter((w) => w.status === status);
        const overdue = items.filter((w) => w.derived === "overdue").length;
        return (
          <section
            key={status}
            aria-labelledby={`col-${status}`}
            className={`rounded-md border border-t-3 border-gray-10 bg-gray-5/60 ${HEAD[status]}`}
          >
            <h2
              id={`col-${status}`}
              className="flex items-baseline gap-2 px-3 py-2.5 text-body-sm font-bold text-gray-80"
            >
              {STATUS_LABEL[status]}
              <span className="tabular-nums text-gray-60">{items.length}</span>
              {overdue > 0 ? (
                <span className="ml-auto rounded-xs bg-status-overdue-bg px-1.5 py-0.5 text-body-xs font-bold text-status-overdue-text">
                  지연 {overdue}
                </span>
              ) : null}
            </h2>

            <ul className="flex flex-col gap-2.5 px-2.5 pb-3">
              {items.map((w) => (
                <li key={w.id}>
                  <WorkCard work={w} />
                </li>
              ))}
              {items.length === 0 ? (
                <li className="rounded-md border border-dashed border-gray-20 px-3 py-6 text-center text-body-xs text-gray-60">
                  없음
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
