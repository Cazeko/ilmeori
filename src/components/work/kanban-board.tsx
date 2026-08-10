import { Inbox } from "lucide-react";
import { WorkCard } from "@/components/work/work-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import type { ApprovalSummary } from "@/lib/data/types";
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

export function KanbanBoard({
  works,
  approvals,
}: {
  works: WorkListItem[];
  /** 업무 id → 결재 진행률. 화면이 한 번에 가져와 내려 준다. */
  approvals?: ReadonlyMap<string, ApprovalSummary>;
}) {
  if (works.length === 0) {
    return (
      <div className="rounded-md border border-gray-10 bg-surface">
        {/* 예전에는 「검색어를 줄이거나 부서 필터를 해제해 보세요」라고 적어
            두고 해제할 단추를 주지 않았다. 보관함에서도 같은 말을 해서, 조건을
            건 적 없는 사람에게 조건을 풀라고 시켰다. 말 대신 길을 준다. */}
        <EmptyState
          icon={Inbox}
          title="조건에 맞는 업무가 없습니다"
          description="참여자가 아니고 공개 범위에도 없는 업무는 목록에 나타나지 않습니다."
          action={
            <ButtonLink href="/works" variant="secondary" size="sm">
              조건 모두 풀기
            </ButtonLink>
          }
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
            {/* 높이를 못박는다(min-h-12 = 48px).
                「지연 N」 배지는 지연이 있는 열에만 붙는데, 배지에 위아래 여백이
                있어서 그 열만 머리글이 몇 px 높아진다. 그러면 **첫 카드의 시작
                선이 열마다 어긋나고**, 2~4px 만 달라도 사람은 삐뚤다고 느낀다.
                좌우 여백도 아래 목록과 같은 값(px-3)이어야 머리글 글자와 카드
                왼쪽 모서리가 한 선에 선다. */}
            <h2
              id={`col-${status}`}
              className="flex min-h-12 items-center gap-2 px-3 text-body-sm font-bold text-gray-80"
            >
              {STATUS_LABEL[status]}
              <span className="tabular-nums text-gray-60">{items.length}</span>
              {overdue > 0 ? (
                <span className="ml-auto rounded-xs bg-status-overdue-bg px-1.5 py-0.5 text-body-xs font-bold text-status-overdue-text">
                  지연 {overdue}
                </span>
              ) : null}
            </h2>

            <ul className="flex flex-col gap-2 px-3 pb-3">
              {items.map((w) => (
                <li key={w.id}>
                  <WorkCard work={w} approval={approvals?.get(w.id)} />
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
