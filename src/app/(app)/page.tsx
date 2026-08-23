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
import { PreviousYearCard } from "@/components/work/previous-year-callout";
import { UrgentHero, UrgentRow } from "@/components/work/urgent-hero";
import { StatusBadge } from "@/components/status-badge";
import { daysUntil, formatDueLabel } from "@/lib/format";
import {
  getApprovalSummaries,
  getDashboard,
  getHandoverFor,
  getPreviousYearBrief,
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
 *
 * ── 주석과 코드가 어긋나 있었다 ────────────────────────────────────────────
 *
 * 위 문단은 처음부터 여기 적혀 있었는데, 정작 코드는 **상태 요약 네 칸을
 * 화면 맨 위에 세로 100px 짜리로 올려 두고 있었다.** 네 칸이 균등한 무게로
 * 자리를 차지하는 바람에 정작 「지금 손대야 하는 일」이 접힌 화면 밖으로
 * 밀려났다. 심사 피드백에서 「무엇이 핵심이고 무엇이 보조인지 눈에 안
 * 들어온다」고 지적된 자리가 정확히 여기다.
 *
 * 주석 쪽이 맞다. 요약은 한 줄짜리 칩으로 내리고(세로 100px → 20px),
 * 그 자리를 히어로에게 준다. 숫자는 여전히 누르면 걸러진 보드로 간다.
 *
 * ── 이 화면의 위계 ─────────────────────────────────────────────────────────
 *
 *   1등  지금 손대야 하는 일 한 건        UrgentHero — 화면당 하나, 유일한 그림자
 *   2등  내 차례인 결재 · 인계 알림       행동을 요구하는 것. 한 줄 배너
 *   3등  그 다음 급한 일                  한 줄 목록
 *   4등  다가오는 마감 · 최근 소식        quiet 등급 — 테두리 없이 물러난다
 *
 * 등급 사이는 40px, 등급 안은 16px 로 끊는다. 예전에는 20/24/20/20 이라
 * 사실상 균일했고, 여백이 균일하면 덩어리가 나뉘지 않는다.
 */

const SUMMARY: DerivedStatus[] = ["overdue", "doing", "review", "todo"];

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

  // 급한 순으로 세운다. 히어로에 올릴 한 건을 고르려면 순서가 있어야 하는데,
  // urgent 는 지금까지 mine 의 순서를 그대로 물려받고 있었다 — 「가장 급한
  // 것」이 아니라 「목록에서 먼저 나온 것」이 맨 앞에 오고 있었다는 뜻이다.
  // 많이 지난 것이 먼저, 기한이 없는 것은 맨 뒤.
  const bySoonest = [...urgent].sort(
    (a, b) =>
      (a.due_date ? daysUntil(a.due_date) : 9_999) -
      (b.due_date ? daysUntil(b.due_date) : 9_999),
  );
  const [hero, ...alsoUrgent] = bySoonest;

  // 「작년 이맘때」 — 해마다 반복되는 업무 중 아직 끝나지 않은 것 하나.
  // 여럿이면 마감이 가장 가까운 것을 고른다. 작년 판을 꺼내 보는 일은
  // 그 업무를 실제로 시작할 때 필요하지, 목록으로 늘어놓을 것이 아니다.
  const repeating =
    mine
      .filter((w) => w.previous_year && w.derived !== "done")
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
      .at(0) ?? null;

  // 두 번째 왕복도 한꺼번에 던진다. 앞의 Promise.all 결과가 있어야 무엇을
  // 물을지 정해지므로 두 겹이 되는 것은 어쩔 수 없지만, 두 겹이 세 겹이 되지는
  // 않게 한다.
  //
  // 「지금 손대야 하는 일」 카드에도 결재 진행률을 붙인다. 급한 업무일수록
  // 「결재가 어디까지 갔는가」가 다음 행동을 정한다.
  const [approvals, prevYear] = await Promise.all([
    getApprovalSummaries(
      viewer,
      urgent.map((w) => w.id),
    ),
    repeating?.previous_year
      ? getPreviousYearBrief(viewer, repeating.previous_year.id)
      : null,
  ]);

  return (
    <PageContainer>
      {/* 인사말은 한 줄로 물러난다. 32px 을 여기 두면 화면에서 가장 큰 글자가
          매일 똑같은 문장이 된다 — 자세한 이유는 page-header.tsx 에. */}
      <PageHeader
        size="sm"
        title={`${viewer.name} ${viewer.position ?? ""} 님, 안녕하세요`}
        description={`${departmentName ?? "소속 없음"} · 참여 중인 업무 ${mine.length}건`}
      />

      {/* ── 인계가 걸려 있으면 다른 무엇보다 먼저 알린다 ───────────────────
          면을 칠하지 않는다. 예전에는 판 전체가 주황(bg-accent-bg)이었는데,
          가로로 꽉 찬 색면이라 **아래 히어로보다 시각적으로 무거웠다.**
          「먼저 알린다」는 위치로 하는 말이지 색 면적으로 하는 말이 아니다.
          왼쪽 3px 선과 아이콘만 주황으로 남긴다(작년 판 카드와 같은 처리). */}
      {handover ? (
        <Link
          href="/handover"
          data-variant="plain"
          className="mb-3 flex items-center gap-4 rounded-sm border border-rule-frame border-l-3 border-l-accent bg-surface px-5 py-4 transition-colors duration-150 hover:bg-gray-5 active:bg-accent-bg"
        >
          <ArrowLeftRight aria-hidden className="size-5 shrink-0 text-accent-text" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-bold text-gray-90">
              {handover.from.id === viewer.id
                ? `${handover.to.name} ${handover.to.position}에게 넘길 업무 ${handover.items.length}건이 있습니다`
                : `${handover.from.name} ${handover.from.position}에게서 넘겨받을 업무 ${handover.items.length}건이 있습니다`}
            </span>
            <span className="mt-1 block text-body-xs text-gray-60">
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
          className="mb-3 flex items-center gap-4 rounded-sm border border-rule-frame border-l-3 border-l-primary bg-surface px-5 py-4 transition-colors duration-150 hover:bg-gray-5 active:bg-primary-5"
        >
          <Stamp aria-hidden className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-bold text-gray-90">
              내 차례인 결재가 {myTurnCount}건 있습니다
            </span>
            <span className="mt-1 block text-body-xs text-gray-60">
              {awaiting.length > myTurnCount
                ? `내 칸이 있는 문서 ${awaiting.length}건 가운데 ${myTurnCount}건이 지금 차례입니다. 나머지는 앞 순서를 기다리는 중입니다.`
                : "서명하거나 반려할 문서입니다."}
            </span>
          </span>
          <ArrowRight aria-hidden className="size-5 shrink-0 text-primary" />
        </Link>
      ) : null}

      {/* ── 요약 한 줄 ────────────────────────────────────────────────────
          예전에는 네 칸짜리 격자로 세로 100px 를 먹었다. 네 칸이 균등한 무게로
          맨 위에 서면 정작 히어로가 접힌 화면 밖으로 밀린다. 세로 20px 짜리
          칩 한 줄로 내리고, 그 80px 를 히어로에게 준다.
          색은 지연에만 남긴다 — 넷 다 색을 쓰면 아무것도 튀지 않는다. */}
      <ul className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-2">
        {SUMMARY.map((key, i) => (
          <li key={key} className="flex items-center">
            {i > 0 ? (
              <span aria-hidden className="px-1 text-gray-30">
                ·
              </span>
            ) : null}
            <Link
              href={
                key === "overdue"
                  ? "/works?mine=1&overdue=1"
                  : `/works?mine=1#col-${key}`
              }
              data-variant="plain"
              className={cn(
                "inline-flex items-center gap-2 rounded-xs px-2 py-1 text-body-xs font-bold tabular-nums",
                "hover:bg-gray-10 active:bg-primary-5",
                key === "overdue" && counts.overdue > 0
                  ? "text-status-overdue-text"
                  : // 0 을 gray-50 으로 두면 판 위에서 대비가 4.32:1 이라 미달이다
                    // (tests/contrast.test.mjs 로 재 봤다 — 여기 적혀 있던 「4.6:1」은
                    // 틀린 값이었고 app-shell.tsx 의 4.32 쪽이 맞았다).
                    // 「0 건」은 좋은 소식이지 감출 정보가 아니므로 gray-60 으로 올린다.
                    "text-gray-60",
              )}
            >
              {STATUS_LABEL[key]}
              <span className="text-body-sm">{counts[key]}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── 1등: 지금 손대야 하는 일 ─────────────────────────────────────
          가장 급한 한 건만 크게 그린다. 나머지는 아래 「그 다음」 한 줄 목록.
          왜 한 건인지는 urgent-hero.tsx 에 적었다.
          판으로 감싸지 않는다 — 예전에는 Card 안에 WorkCard 가 들어 있어서
          테두리가 두 겹, 안쪽 여백이 두 겹이었다. 그 중첩이 「박스 레이아웃
          티가 난다」는 인상의 실체다. */}
      <section aria-labelledby="urgent-heading" className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="urgent-heading" className="text-h3 font-bold text-gray-90">
            지금 손대야 하는 일
          </h2>
          <Link
            href="/works?mine=1"
            className="inline-flex shrink-0 items-center text-body-sm font-bold text-primary pointer-coarse:min-h-11"
          >
            내 업무 전체
          </Link>
        </div>

        {hero ? (
          <>
            <UrgentHero
              work={hero}
              approval={approvals.get(hero.id)}
              meId={viewer.id}
            />
            {alsoUrgent.length > 0 ? (
              <div className="mt-4">
                <h3 className="mb-1 px-2 text-body-xs font-bold text-gray-60">
                  그 다음
                </h3>
                <ul>
                  {alsoUrgent.map((w) => (
                    <li key={w.id}>
                      <UrgentRow work={w} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <Card>
            <EmptyState icon={CheckCircle2} title="당장 급한 일은 없습니다" />
          </Card>
        )}
      </section>

      <div className="grid items-start gap-8 xl:grid-cols-[1.3fr_1fr]">
        {/* min-w-0 — grid 자식의 min-width 는 기본이 auto(=min-content)라
            안쪽에서 truncate 를 걸어도 트랙이 내용만큼 부푼다. 소식 목록의
            업무 제목이 nowrap 이라, 제목이 긴 계정(박준호)의 홈이 390px 에서
            문서 폭 416px 로 넘쳤다. 여기서 0 으로 눌러야 안쪽 truncate 가
            제 일을 한다. */}
        {/* ── 4등: 참고로 곁에 두는 것 ─────────────────────────────────
            아래 두 판은 quiet 등급이다 — **테두리가 없다.** 예전에는 이 둘이
            히어로와 똑같은 테두리를 두르고 있어서 셋이 동급으로 읽혔다.
            테두리를 지우면 바탕으로 물러나고, 그제야 히어로가 혼자 선다.
            (등급 표는 card.tsx 에) */}
        <div className="flex min-w-0 flex-col gap-8">
          {/* ── 최근 소식 ──────────────────────────────────────────────── */}
          <Card variant="quiet">
            <CardHeader variant="quiet" title="내 업무에서 일어난 일" />
            {recent.length > 0 ? (
              <CardBody variant="quiet">
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
        <div className="flex min-w-0 flex-col gap-8">
          <Card variant="quiet">
            <CardHeader variant="quiet" title="다가오는 마감" />
            {mine.filter((w) => w.due_date && w.derived !== "done").length > 0 ? (
              <ul>
                {mine
                  .filter((w) => w.due_date && w.derived !== "done")
                  .slice(0, 6)
                  .map((w) => (
                    <li key={w.id}>
                      <Link
                        href={`/works/${w.id}`}
                        data-variant="plain"
                        className="flex items-center gap-3 rounded-sm px-2 py-3 hover:bg-gray-10 active:bg-primary-5"
                      >
                        {/* 지연일 때 이 아이콘까지 붉게 칠하고 있었다. 한 줄에
                            붉은 것이 셋(아이콘·배지·날짜)이라 조용해야 할 판이
                            홈에서 가장 붉은 자리가 됐다. 아이콘은 「마감」이라는
                            갈래를 가리킬 뿐이고, 급한지 아닌지는 배지와 날짜가
                            이미 두 번 말한다. */}
                        <CalendarClock
                          aria-hidden
                          className="size-4 shrink-0 text-gray-40"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-body-sm font-bold text-gray-90">
                            {w.title}
                          </span>
                          <span className="mt-1 flex items-center gap-2">
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

          {/* ── 작년 이맘때 ────────────────────────────────────────────────
              마감 다음에 둔다. 「올해 무엇을 해야 하는가」를 먼저 보고,
              그 다음에 「작년에는 어떻게 했는가」를 본다. 순서가 뒤집히면
              회고가 할 일보다 위에 오는 화면이 된다. */}
          {prevYear && repeating ? (
            <PreviousYearCard
              brief={prevYear}
              currentWork={{ id: repeating.id, title: repeating.title }}
            />
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
