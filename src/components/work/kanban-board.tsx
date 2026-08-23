import { Inbox } from "lucide-react";
import { WorkCard, type CardPick } from "@/components/work/work-card";
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

/**
 * 열 이름 앞의 점 — 색이 아니라 **명도**로 나눈다.
 *
 * 예전에는 열 위에 3px 띠를 넷 다 다른 상태색(회색·파랑·황토·초록)으로 칠했다.
 * 열 이름이 이미 「대기·진행중·검토·완료」라고 적고 있는데 그 위에 색을 한 겹
 * 더 얹은 것이라, 정보는 안 늘고 화면의 색만 넷 늘었다. 그래서 걷어냈고,
 * 그 뒤로는 네 열이 완전히 같은 회색이 되어 훑을 때 구분이 되지 않았다.
 *
 * 색을 되살리는 대신 **이 제품이 이미 정한 축**을 쓴다 — status-badge.tsx 가
 * 적어 둔 명도 순서 그대로다.
 *
 *   진행중  gray-90  13.17:1   가장 진하다 — 지금 움직이고 있는 것
 *   검토    gray-70   7.07:1   그 다음
 *   대기    gray-60   5.13:1   옅다 — 아직 시작하지 않은 것
 *   완료    gray-50   3.67:1   가장 옅다 — 끝나서 물러난 것
 *
 * (대비는 열 머리 바탕 gray-10 기준. 넷 다 비문자 3:1 을 넘는다 —
 *  tests/contrast.test.mjs 가 잰다)
 *
 * 배지(status-badge)는 같은 순서를 못 낸다. 배지의 글자는 4.5:1 을 넘겨야
 * 하는데 옅은 바탕 두 종류 위에서 네 단계를 그 위쪽에만 욱여넣으면 대기와
 * 검토가 7.68 대 7.07 로 붙어 버린다(실측). 점은 **글자가 아니라 표식**이라
 * 3:1 만 넘으면 되고, 그래서 아래쪽 두 칸이 열리며 순서가 비로소 보인다.
 * 하나뿐인 색 신호(지연)는 오른쪽 「지연 N」 배지가 그대로 나른다.
 */
const DOT: Record<WorkStatus, string> = {
  todo: "bg-gray-60",
  doing: "bg-gray-90",
  review: "bg-gray-70",
  done: "bg-gray-50",
};

export function KanbanBoard({
  works,
  approvals,
  pickOf,
  meId,
}: {
  works: WorkListItem[];
  /** 업무 id → 결재 진행률. 화면이 한 번에 가져와 내려 준다. */
  approvals?: ReadonlyMap<string, ApprovalSummary>;
  /** 보고 있는 사람. 카드의 참여자 줄에서 내 아바타 하나에만 색이 붙는다. */
  meId?: string;
  /**
   * 정리 모드일 때, 카드마다 고를 수 있는지 정한다. 없으면 평소의 보드다.
   *
   * 보드가 직접 판정하지 않고 화면에서 받는다 — 「누가 소유자인가」는 보는
   * 사람에 따라 달라지는 값이고, 그 판단이 두 곳에 있으면 언젠가 갈라진다.
   */
  pickOf?: (work: WorkListItem) => CardPick;
}) {
  if (works.length === 0) {
    return (
      <div className="rounded-sm border border-rule-frame bg-surface">
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
            /* 예전에는 위 3px 띠를 열마다 다른 상태색으로 칠했다(회색·파랑·
               황토·초록). 열 이름이 이미 「대기·진행중·검토·완료」라고 적고
               있는데 그 위에 색을 한 겹 더 얹은 것이라, 정보는 안 늘고 화면의
               색만 넷 늘었다. 칸반에서 튀어야 하는 것은 **지연된 카드 한 장**
               이지 열이 아니다. 띠는 남기되 넷 다 같은 회색으로 둔다 — 열의
               윗변을 긋는 일만 하게 한다. */
            className="rounded-sm border border-t-3 border-rule-hair bg-gray-10"
          >
            {/* 높이를 못박는다(min-h-12 = 48px).
                「지연 N」 배지는 지연이 있는 열에만 붙는데, 배지에 위아래 여백이
                있어서 그 열만 머리글이 몇 px 높아진다. 그러면 **첫 카드의 시작
                선이 열마다 어긋나고**, 2~4px 만 달라도 사람은 삐뚤다고 느낀다.
                좌우 여백도 아래 목록과 같은 값(px-3)이어야 머리글 글자와 카드
                왼쪽 모서리가 한 선에 선다. */}
            {/* 열 이름은 「조용」 등급이다(card.tsx 의 세 등급 참조). 보드에서
                먼저 읽혀야 하는 것은 카드이지 열 이름이 아니다. gray-80 →
                gray-60 으로 한 단계 물린다. */}
            <h2
              id={`col-${status}`}
              className="flex min-h-12 items-center gap-2 px-3 text-body-sm font-bold text-gray-60"
            >
              {/* 점은 장식이 아니라 스캔 속도를 위한 것 — 카드 안의 상태 배지가
                  쓰는 것과 같은 표식이다. 뜻은 옆의 글자가 이미 나르므로
                  스크린리더에서는 숨긴다(status-badge.tsx 와 같은 규약). */}
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${DOT[status]}`}
              />
              {STATUS_LABEL[status]}
              <span className="tabular-nums text-gray-60">{items.length}</span>
              {overdue > 0 ? (
                <span className="ml-auto text-body-xs font-bold text-status-overdue-text">
                  지연 {overdue}
                </span>
              ) : null}
            </h2>

            <ul className="flex flex-col gap-2 px-3 pb-3">
              {items.map((w) => (
                <li key={w.id}>
                  <WorkCard
                    work={w}
                    approval={approvals?.get(w.id)}
                    pick={pickOf?.(w)}
                    meId={meId}
                  />
                </li>
              ))}
              {items.length === 0 ? (
                <li className="rounded-sm border border-dashed border-rule-hair px-3 py-6 text-center text-body-xs text-gray-60">
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
