import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Stamp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityFeed } from "@/components/work/activity-timeline";
import { WorkCard } from "@/components/work/work-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDueLabel } from "@/lib/format";
import {
  getApprovalSummaries,
  getDashboard,
  getHandoverFor,
  listApprovalsAwaitingMe,
} from "@/lib/data";
import { myTurn } from "@/lib/approval";
import { getViewerDepartmentName, requireViewer } from "@/lib/session";
import { HANDOVER_STATUS_LABEL, STATUS_LABEL, type DerivedStatus } from "@/lib/types";

/**
 * 홈.
 *
 * 아침에 자리에 앉아 처음 여는 화면이라고 보고 만들었다.
 * 그래서 맨 위가 "오늘 손대야 하는 일"이고, 그 아래가 "내가 없는 동안 움직인 것"이다.
 * 통계 숫자를 위에 크게 올리는 구성은 일부러 피했다.
 * 하루를 시작하면서 알고 싶은 건 합계가 아니라 다음 할 일이다.
 */

const SUMMARY: Array<{ key: DerivedStatus; tone: string }> = [
  { key: "overdue", tone: "text-status-overdue-text" },
  { key: "doing", tone: "text-status-doing-text" },
  { key: "review", tone: "text-status-review-text" },
  { key: "todo", tone: "text-status-todo-text" },
];

export default async function HomePage() {
  const viewer = await requireViewer();

  // 서로를 기다릴 이유가 없는 것들은 한꺼번에 던진다.
  // 하나씩 await 하면 왕복이 줄줄이 늘어서고, 그게 이 화면에서 제일 큰 비용이었다.
  //
  // 내 차례인 결재는 결재함 「대기」와 **같은 판정**을 쓴다 — 홈이 3건이라고
  // 하는데 결재함을 열면 1건인 화면은 둘 다 못 믿게 만든다.
  const [departmentName, dashboard, handover, awaiting] = await Promise.all([
    getViewerDepartmentName(),
    getDashboard(viewer),
    getHandoverFor(viewer),
    listApprovalsAwaitingMe(viewer),
  ]);

  const { mine, counts, recent, urgent } = dashboard;
  const myTurnCount = awaiting.filter(
    (a) => myTurn(a, a.steps, viewer.id) !== null,
  ).length;

  // 「지금 손대야 하는 일」 카드에도 결재 진행률을 붙인다. 급한 업무일수록
  // 「결재가 어디까지 갔는가」가 다음 행동을 정한다.
  const approvals = await getApprovalSummaries(
    viewer,
    urgent.map((w) => w.id),
  );

  return (
    <PageContainer>
      <PageHeader
        title={`${viewer.name} ${viewer.position ?? ""} 님, 안녕하세요`}
        description={`${departmentName ?? "소속 없음"} · 참여 중인 업무 ${mine.length}건`}
      />

      {/* ── 인계가 걸려 있으면 다른 무엇보다 먼저 알린다 ─────────────────── */}
      {handover ? (
        <Link
          href="/handover"
          data-variant="plain"
          className="mb-5 flex items-center gap-4 rounded-md border border-accent/40 bg-accent-bg px-5 py-4 transition-colors duration-150 hover:border-accent active:border-accent active:bg-accent/15"
        >
          <ArrowLeftRight aria-hidden className="size-5 shrink-0 text-accent-text" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-bold text-gray-90">
              {handover.from.id === viewer.id
                ? `${handover.to.name} ${handover.to.position}에게 넘길 업무 ${handover.items.length}건이 있습니다`
                : `${handover.from.name} ${handover.from.position}에게서 넘겨받을 업무 ${handover.items.length}건이 있습니다`}
            </span>
            <span className="mt-0.5 block text-body-xs text-gray-60">
              현재 단계: {HANDOVER_STATUS_LABEL[handover.handover.status]}
            </span>
          </span>
          <ArrowRight aria-hidden className="size-5 shrink-0 text-accent-text" />
        </Link>
      ) : null}

      {/* ── 내 차례인 결재 ───────────────────────────────────────────────
          인계 다음, 요약보다 위다. 결재는 「내가 처리해 주기를 다른 사람이
          기다리고 있는 일」이라 내 업무의 마감보다 급하다. */}
      {myTurnCount > 0 ? (
        <Link
          href="/approvals"
          data-variant="plain"
          className="mb-5 flex items-center gap-4 rounded-md border border-primary/30 bg-primary-5 px-5 py-4 transition-colors duration-150 hover:border-primary"
        >
          <Stamp aria-hidden className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-bold text-gray-90">
              내 차례인 결재가 {myTurnCount}건 있습니다
            </span>
            <span className="mt-0.5 block text-body-xs text-gray-60">
              {awaiting.length > myTurnCount
                ? `내 칸이 있는 문서 ${awaiting.length}건 가운데 ${myTurnCount}건이 지금 차례입니다. 나머지는 앞 순서를 기다리는 중입니다.`
                : "서명하거나 반려할 문서입니다."}
            </span>
          </span>
          <ArrowRight aria-hidden className="size-5 shrink-0 text-primary" />
        </Link>
      ) : null}

      {/* ── 요약 ─────────────────────────────────────────────────────────── */}
      <ul className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUMMARY.map(({ key, tone }) => (
          <li key={key}>
            <Link
              href={
                key === "overdue"
                  ? "/works?mine=1&overdue=1"
                  : `/works?mine=1#col-${key}`
              }
              data-variant="plain"
              className={cn(
                "block rounded-md border bg-surface px-5 py-3.5 transition-colors duration-150 hover:border-primary-30",
                // 누르면 그 조건으로 걸러진 보드로 간다 — 눌리는 면임을 손끝으로도 말한다
                "active:border-primary active:bg-primary-5",
                key === "overdue" && counts.overdue > 0
                  ? "border-status-overdue/40"
                  : "border-gray-10",
              )}
            >
              <span className="block text-body-xs font-bold text-gray-60">
                {STATUS_LABEL[key]}
              </span>
              <span
                className={cn(
                  "mt-1 block text-h2 font-bold tabular-nums",
                  // 0 을 gray-30 으로 두면 판(#fafafa) 위에서 대비가 1.92:1 이라
                  // 사실상 안 보인다. 「0 건」은 좋은 소식이지 감출 정보가 아니다.
                  // gray-50(4.6:1)이면 강조하지 않으면서 읽히기는 한다.
                  counts[key] > 0 ? tone : "text-gray-50",
                )}
              >
                {counts[key]}
                <span className="ml-1 text-body-sm font-normal text-gray-60">건</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── 급한 일 ──────────────────────────────────────────────────────
          가로로 꽉 채운다. 오늘 처리해야 할 일이 화면에서 제일 큰 덩어리여야 한다.
          옆 칸에 두면 급한 일이 한두 건일 때 옆이 텅 비어 오히려 눈에 덜 들어온다. */}
      <div className="mb-5">
        <Card>
          <CardHeader
            title="지금 손대야 하는 일"
            /* 「기한이 지났거나 일주일 안에 마감인 내 업무입니다」를 뺐다.
               카드마다 남은 기한이 붉게 적혀 있어 목록 자체가 같은 말을 한다. */
            action={
              <Link
                href="/works?mine=1"
                className="text-body-sm font-bold text-primary"
              >
                내 업무 전체
              </Link>
            }
          />
          {urgent.length > 0 ? (
            <CardBody>
              <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {urgent.map((w) => (
                  <li key={w.id}>
                    <WorkCard work={w} approval={approvals.get(w.id)} />
                  </li>
                ))}
              </ul>
            </CardBody>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="당장 급한 일은 없습니다"
            />
          )}
        </Card>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]">
        {/* min-w-0 — grid 자식의 min-width 는 기본이 auto(=min-content)라
            안쪽에서 truncate 를 걸어도 트랙이 내용만큼 부푼다. 소식 목록의
            업무 제목이 nowrap 이라, 제목이 긴 계정(박준호)의 홈이 390px 에서
            문서 폭 416px 로 넘쳤다. 여기서 0 으로 눌러야 안쪽 truncate 가
            제 일을 한다. */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* ── 최근 소식 ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader
              title="내 업무에서 일어난 일"
            />
            {recent.length > 0 ? (
              <CardBody>
                <ActivityFeed items={recent} />
              </CardBody>
            ) : (
              <EmptyState
                icon={Bell}
                title="아직 새 소식이 없습니다"
              />
            )}
          </Card>

        </div>

        {/* ── 다가오는 마감 ────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="다가오는 마감" />
            {mine.filter((w) => w.due_date && w.derived !== "done").length > 0 ? (
              <ul className="divide-y divide-gray-5">
                {mine
                  .filter((w) => w.due_date && w.derived !== "done")
                  .slice(0, 6)
                  .map((w) => (
                    <li key={w.id}>
                      <Link
                        href={`/works/${w.id}`}
                        data-variant="plain"
                        className="flex items-center gap-3 px-5 py-3 hover:bg-gray-5 active:bg-primary-5"
                      >
                        <CalendarClock
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0",
                            w.derived === "overdue"
                              ? "text-status-overdue-text"
                              : "text-gray-40",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-body-sm font-bold text-gray-90">
                            {w.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <StatusBadge status={w.derived} size="sm" />
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-body-xs font-bold tabular-nums",
                            w.derived === "overdue"
                              ? "text-status-overdue-text"
                              : "text-gray-60",
                          )}
                        >
                          {formatDueLabel(w.due_date!)}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState
                icon={Inbox}
                title="마감이 잡힌 업무가 없습니다"
              />
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
