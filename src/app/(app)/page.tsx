import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityFeed } from "@/components/work/activity-timeline";
import { UrgentHero, UrgentRow } from "@/components/work/urgent-hero";
import { StatusBadge } from "@/components/status-badge";
import { daysUntil, formatDueDday, formatDueLabel } from "@/lib/format";
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
 *   2등  내 차례인 결재 · 인계 알림       행동을 요구하는 것. 테두리 없는 한 줄
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

  // 「작년 이맘때」 카드를 홈에서 내렸다.
  //
  // 작년 판을 꺼내 보는 일은 **그 업무를 실제로 시작할 때** 필요하지, 아침에
  // 홈을 열었을 때 필요한 것이 아니다. 홈에서 유일하게 「오늘」과 무관한
  // 칸이었고, 오른쪽 열만 길어지게 만드는 원인이기도 했다.
  // 컴포넌트(previous-year-callout.tsx)와 조회(getPreviousYearBrief)는 그대로
  // 둔다 — 업무 상세에서 쓴다.
  //
  // 「지금 손대야 하는 일」 카드에 붙는 결재 진행률. 급한 업무일수록
  // 「결재가 어디까지 갔는가」가 다음 행동을 정한다.
  const approvals = await getApprovalSummaries(
    viewer,
    urgent.map((w) => w.id),
  );

  // ── 아래 두 판의 세로 길이를 맞춘다 ──────────────────────────────────────
  //
  // 소식은 늘 8줄(574px)인데 마감은 계정마다 4줄(311px)~6줄(451px)이라,
  // 왼쪽만 123~263px 길게 늘어져 있었다. 나란히 놓인 두 판의 밑선이 안 맞으면
  // 그 자체가 어수선하게 읽힌다.
  //
  // 줄 높이가 소식 68px, 마감 70px 로 거의 같다. **그래서 줄 수를 맞추면
  // 높이가 맞는다** — 실측 오차 8~13px 이다. 숫자를 하나 박아 두는 대신
  // 마감 줄 수를 따라가게 하는 이유는, 계정마다 마감 수가 다르기 때문이다
  // (김서연 6 · 박준호 4). 6 으로 고정하면 김서연만 맞고 박준호는 127px 남는다.
  //
  // 마감이 3건 미만이면 따라가지 않는다. 그때는 소식이 한두 줄만 남는데,
  // 이 판에는 「전체 보기」가 없어서 잘린 소식은 갈 곳이 없다.
  const dueSoon = mine
    .filter((w) => w.due_date && w.derived !== "done")
    .slice(0, 6);
  const feed = recent.slice(0, Math.max(dueSoon.length, 3));

  // 내가 움직여야 하는 것. 줄마다 「무엇 몇 건 · 꼬리말」 하나씩이고, 셋째
  // 줄이 생기면 여기에 한 줄 보태면 된다(모양은 아래 목록이 한 번만 적는다).
  const actions: Array<{
    href: string;
    icon: LucideIcon;
    title: string;
    tail: string;
  }> = [];
  if (handover) {
    actions.push({
      href: "/handover",
      icon: ArrowLeftRight,
      title:
        handover.from.id === viewer.id
          ? `${handover.to.name} ${handover.to.position}에게 넘길 업무 ${handover.items.length}건`
          : `${handover.from.name} ${handover.from.position}에게서 넘겨받을 업무 ${handover.items.length}건`,
      tail: `${HANDOVER_STATUS_LABEL[handover.handover.status]} 단계`,
    });
  }
  if (myTurnCount > 0) {
    actions.push({
      href: "/approvals",
      icon: Stamp,
      title: `내 차례인 결재 ${myTurnCount}건`,
      tail:
        awaiting.length > myTurnCount
          ? `내 칸이 있는 ${awaiting.length}건 가운데 지금 차례인 것. 나머지는 앞 순서를 기다립니다`
          : "서명하거나 반려할 문서",
    });
  }
  // 요약 칩. 0 건은 적지 않는다 — 이유는 그 줄의 주석에.
  const summary = SUMMARY.filter((key) => counts[key] > 0);

  return (
    <PageContainer>
      {/* 인사말은 한 줄로 물러난다. 32px 을 여기 두면 화면에서 가장 큰 글자가
          매일 똑같은 문장이 된다 — 자세한 이유는 page-header.tsx 에. */}
      <PageHeader
        size="sm"
        title={`${viewer.name} ${viewer.position ?? ""} 님, 안녕하세요`}
        description={`${departmentName ?? "소속 없음"} · 참여 중인 업무 ${mine.length}건`}
      />

      {/* ── 내가 움직여야 하는 것: 인계 · 내 차례 결재 ────────────────────
          한동안 이 둘이 각각 **왼쪽 색선을 두른 상자**였다 — 인계는 주황,
          결재는 파랑. 그 아래 히어로가 빨간 경보선을 두르므로, 첫 화면에
          색선 상자가 셋이 세로로 서 있었다. 같은 모양이 색만 바꿔 반복되면
          사람은 「무엇이 급한가」가 아니라 「템플릿이구나」를 읽는다.

          색선 상자는 화면에 하나만 둔다 — 히어로. 이 둘은 위치로 먼저 말하고
          모양으로는 물러난다: 테두리 없는 한 줄 링크, 가는 선으로만 갈라 둔다.
          색은 아이콘 하나에만 남기고, 둘 다 주황이다 — 토큰 문서가 정한 대로
          「내가 움직여야 하는 것」은 주황이지 파랑이 아니었다(결재 줄만 파랑을
          쓰고 있었다). */}
      {/* 줄 안의 링크는 -mx-2 px-2 — 글자의 왼끝은 위 인사말·아래 제목과
          한 선(292px)에 서고, 손이 닿았을 때의 바탕만 8px 씩 바깥으로 번진다.
          한동안 px-2 만 있어서 이 줄의 글자만 8px 들어가 있었다. 아래 요약
          칩·「그 다음」·마감 목록도 같은 처리다. */}
      {actions.length > 0 ? (
        <ul className="mb-4 divide-y divide-rule-hair border-y border-rule-hair">
          {actions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="-mx-2 flex items-center gap-3 px-2 py-3 transition-colors duration-150 hover:bg-gray-10 active:bg-accent-bg"
              >
                <a.icon aria-hidden className="size-4 shrink-0 text-accent-text" />
                <span className="min-w-0 flex-1 text-body-sm text-gray-90">
                  <span className="font-bold">{a.title}</span>
                  <span className="text-gray-60"> · {a.tail}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-gray-40" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── 요약 한 줄 ────────────────────────────────────────────────────
          예전에는 네 칸짜리 격자로 세로 100px 를 먹었다. 네 칸이 균등한 무게로
          맨 위에 서면 정작 히어로가 접힌 화면 밖으로 밀린다. 세로 20px 짜리
          칩 한 줄로 내리고, 그 80px 를 히어로에게 준다.
          색은 지연에만 남긴다 — 넷 다 색을 쓰면 아무것도 튀지 않는다.

          0 건은 적지 않는다. 「검토 0」은 사실이지만 이 줄의 일은 「지금 어디에
          몇 건이 있나」이고, 없는 칸을 세어 주면 줄만 길어진다. 넷 다 0 이면
          줄이 통째로 비고, 그때는 아래 「당장 급한 일은 없습니다」가 말한다. */}
      {summary.length > 0 ? (
      <ul className="-mx-2 mb-4 flex flex-wrap items-center gap-x-1 gap-y-2">
        {summary.map((key, i) => (
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
              className={cn(
                // 세로 20px 한 줄인 것이 이 줄의 요점이라(위 주석) 높이를 늘리지
                // 않는다. 32px 는 2.5.8(AA, 24×24)을 넘는다. 손가락 쪽만
                // 44px 로 벌린다 — 저장소가 쓰는 pointer-coarse 규약.
                "inline-flex items-center gap-2 rounded-xs px-2 py-1 text-body-xs font-bold tabular-nums pointer-coarse:min-h-11",
                "hover:bg-gray-10 active:bg-primary-5",
                key === "overdue" ? "text-status-overdue-text" : "text-gray-60",
              )}
            >
              {STATUS_LABEL[key]}
              <span className="text-body-sm">{counts[key]}</span>
            </Link>
          </li>
        ))}
      </ul>
      ) : null}

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
                <h3 className="mb-1 text-body-xs font-bold text-gray-60">
                  그 다음
                </h3>
                <ul className="-mx-2">
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
            {feed.length > 0 ? (
              <CardBody variant="quiet">
                <ActivityFeed items={feed} />
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
            {dueSoon.length > 0 ? (
              <ul className="-mx-2">
                {dueSoon
                  .map((w) => (
                    <li key={w.id}>
                      <Link
                        href={`/works/${w.id}`}
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
                          {/* 「그 다음」과 같은 화면에 있다. 한 화면에서 같은
                              사실을 「D+28」과 「28일 지남」 두 가지로 적으면
                              둘이 다른 것처럼 읽힌다 — 좁은 자리는 좁은 자리의
                              표기로 통일한다(format.ts 의 formatDueDday). */}
                          <span aria-hidden>{formatDueDday(w.due_date!)}</span>
                          <span className="sr-only">
                            {formatDueLabel(w.due_date!)}
                          </span>
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
