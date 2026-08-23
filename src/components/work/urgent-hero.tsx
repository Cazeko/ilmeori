import Link from "next/link";
import { Building2, MessageSquare, Paperclip, Stamp, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { approvalStateLine } from "@/lib/approval";
import { daysUntil, formatDueLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { AvatarStack } from "@/components/ui/avatar";
import { CARD_SURFACE } from "@/components/ui/card";
import { LinkPendingMark } from "@/components/ui/link-pending";
import type { ApprovalSummary } from "@/lib/data/types";
import type { WorkListItem } from "@/lib/types";

/**
 * 히어로 — 홈에서 **딱 한 장**만 크게 그리는 업무.
 *
 * ── 왜 한 장인가 ────────────────────────────────────────────────────────────
 *
 * 예전 홈은 급한 일을 3열 격자에 균등하게 늘어놓았다. 두 가지가 어긋났다.
 *
 *   ① 급한 일이 한 건이면 **오른쪽 3분의 2가 통째로 비었다.** 화면에서 가장
 *      중요한 자리가 가장 휑한 자리가 된다.
 *   ② 급한 일이 세 건이면 셋이 동급이 된다. 그런데 아침에 자리에 앉아서
 *      알고 싶은 것은 「급한 일 목록」이 아니라 **「지금 뭐부터 하지」** 하나다.
 *
 * 그래서 가장 급한 한 건만 크게 그리고, 나머지는 아래 한 줄짜리 목록으로
 * 내린다(홈의 「그 다음」). 한 건이든 다섯 건이든 배치가 무너지지 않는다.
 *
 * ── 크기를 어디에 쓰는가 ────────────────────────────────────────────────────
 *
 * 이 판에서 가장 큰 글자는 **「9일 지남」(32px)** 이다. 제목이 아니다.
 * 예전에는 그 자리가 13px 였고, 화면에서 가장 큰 32px 는 「○○○ 님,
 * 안녕하세요」가 가져가고 있었다 — 매일 똑같아서 정보량이 0인 문장이다.
 *
 * 기한은 이 화면에서 유일하게 **다음 행동을 정하는 숫자**다. 9일 지났으면
 * 지금 열고, 5일 남았으면 오늘은 안 열어도 된다. 그 판단을 곁눈질 한 번에
 * 하도록 크기를 몰아 준다.
 *
 * 색은 셋뿐이다(globals.css 의 4색 체계).
 *   지났다      빨강   status-overdue-text   5.74:1
 *   오늘·내일   주황   accent-text           5.25:1
 *   그 밖       먹색   gray-70               8.32:1
 * 32px 은 큰 글자라 요구 대비가 3:1 인데 셋 다 4.5:1 을 넘긴다.
 * (tests/contrast.test.mjs 가 잰다)
 */

function toneOf(work: WorkListItem) {
  if (work.derived === "overdue") {
    return { text: "text-status-overdue-text", edge: "border-l-status-overdue" };
  }
  const d = work.due_date ? daysUntil(work.due_date) : null;
  if (d !== null && d >= 0 && d <= 1) {
    return { text: "text-accent-text", edge: "border-l-accent" };
  }
  return { text: "text-gray-70", edge: "border-l-gray-20" };
}

export function UrgentHero({
  work,
  approval,
}: {
  work: WorkListItem;
  approval?: ApprovalSummary;
}) {
  const tone = toneOf(work);
  const cross = work.department_count > 1;

  return (
    <article
      className={cn(
        // 화면에서 유일하게 떠 있는 판이다. 겉모양은 card.tsx 의 hero 등급을
        // 그대로 가져다 쓴다(<article> 이라 Card 컴포넌트를 못 쓴다).
        CARD_SURFACE.hero,
        "relative border-l-4 p-6",
        "transition-colors duration-150 hover:border-primary-30",
        "active:border-primary active:bg-primary-5",
        // 눌린 판은 흐려진다 — 안쪽 LinkPendingMark 가 심는 표식을 여기서 받는다.
        "has-[[data-link-pending]]:opacity-55 has-[[data-link-pending]]:transition-opacity",
        tone.edge,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <StatusBadge status={work.derived} />
        {work.due_date ? (
          <span
            className={cn(
              "shrink-0 text-h1 leading-none font-bold tabular-nums",
              tone.text,
            )}
          >
            {formatDueLabel(work.due_date)}
          </span>
        ) : null}
      </div>

      {/* 24px. 판 전체가 눌리도록 링크를 확장한다(after:absolute inset-0). */}
      <h3 className="mt-4 text-h2 leading-snug font-bold break-keep text-gray-90">
        <Link
          href={`/works/${work.id}`}
          data-variant="plain"
          className="after:absolute after:inset-0 hover:underline"
        >
          <span className="line-clamp-2">{work.title}</span>
          <LinkPendingMark />
        </Link>
      </h3>

      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-sm text-gray-60">
        <span className="inline-flex items-center gap-1.5">
          <Building2 aria-hidden className="size-4" />
          {work.department.name}
        </span>
        {cross ? (
          <span className="inline-flex items-center gap-1.5 font-bold text-gray-70">
            <Users aria-hidden className="size-4" />
            {work.department_count}개 부서
          </span>
        ) : null}
        {approval ? (
          <span className="inline-flex items-center gap-1.5 font-bold text-gray-70">
            <Stamp aria-hidden className="size-4" />
            결재 {approvalStateLine(approval.latest.state, approval.latest)}
          </span>
        ) : null}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-10 pt-4">
        <AvatarStack people={work.members.map((m) => m.profile)} max={6} />
        <span className="flex items-center gap-4 text-body-sm text-gray-60">
          {work.comment_count > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare aria-hidden className="size-4" />
              <span className="sr-only">대화 </span>
              <span className="tabular-nums">{work.comment_count}</span>
              <span className="sr-only">개</span>
            </span>
          ) : null}
          {work.attachment_count > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Paperclip aria-hidden className="size-4" />
              <span className="sr-only">첨부 </span>
              <span className="tabular-nums">{work.attachment_count}</span>
              <span className="sr-only">개</span>
            </span>
          ) : null}
        </span>
      </div>
    </article>
  );
}

/**
 * 「그 다음」 — 히어로에 오르지 못한 급한 일 한 줄.
 *
 * 정보 밀도를 히어로와 **반대로** 준다. 히어로는 정보 다섯을 넓은 면적에
 * 저밀도로 놓고, 여기는 정보 셋을 한 줄에 고밀도로 눌러 담는다. 밀도 차이
 * 자체가 위계다 — 둘 다 중간 밀도이면 눈이 어디서 쉬어야 할지 모른다.
 */
export function UrgentRow({ work }: { work: WorkListItem }) {
  const tone = toneOf(work);
  return (
    <Link
      href={`/works/${work.id}`}
      data-variant="plain"
      className="flex items-center gap-3 rounded-sm px-2 py-2.5 hover:bg-gray-10 active:bg-primary-5"
    >
      <span className="line-clamp-1 min-w-0 flex-1 text-body-sm font-bold text-gray-90">
        {work.title}
      </span>
      <StatusBadge status={work.derived} size="sm" />
      {work.due_date ? (
        <span
          className={cn(
            "w-20 shrink-0 text-right text-body-xs font-bold tabular-nums",
            tone.text,
          )}
        >
          {formatDueLabel(work.due_date)}
        </span>
      ) : null}
    </Link>
  );
}
