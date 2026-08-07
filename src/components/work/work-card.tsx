import Link from "next/link";
import {
  Building2,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Stamp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { approvalStateLine } from "@/lib/approval";
import { daysUntil, formatDueLabel, formatShortDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { AvatarStack } from "@/components/ui/avatar";
import type { ApprovalSummary } from "@/lib/data/types";
import type { WorkListItem } from "@/lib/types";

/**
 * 업무 카드.
 *
 * 한 장에서 답해야 하는 질문은 다섯이다.
 *   지금 어디까지 왔나 / 언제까지인가 / 결재는 어디까지 갔나 /
 *   누가 붙어 있나 / 혼자 하는 일인가
 *
 * ── 왼쪽 띠는 두 가지를 말한다 ─────────────────────────────────────────────
 *
 *   붉은 띠   기한이 지났다
 *   주황 띠   오늘 또는 내일 마감이다 (화성시 BI 보조색이 화면에 처음 나오는 자리)
 *
 * 지연은 왼쪽 띠와 배지 두 곳에서 알린다. 색만으로는 알 수 없어야 한다는 접근성
 * 요건이기도 하지만, 지연 업무를 놓쳐서 생기는 사고를 줄이려는 목적이 크다.
 *
 * ── 칸의 리듬 ──────────────────────────────────────────────────────────────
 *
 * 안쪽 간격을 4·8·12 로만 쓴다. 8·10·6·12 처럼 어긋나 있으면 사람은 숫자를
 * 세지 못해도 「정돈이 안 됐다」로 느낀다. 그리고 아래 줄(참여자·대화 수)은
 * mt-auto 로 **바닥에 붙인다** — 제목이 한 줄인 카드와 두 줄인 카드가 나란히
 * 놓였을 때 밑줄이 어긋나 보이는 것이 칸반에서 가장 눈에 띄는 흐트러짐이다.
 */

/** 오늘·내일 마감. 지연은 아니지만 오늘 손대야 하는 일이다. */
function isDueNow(work: WorkListItem): boolean {
  if (!work.due_date || work.derived === "done" || work.derived === "overdue") {
    return false;
  }
  const d = daysUntil(work.due_date);
  return d >= 0 && d <= 1;
}

export function WorkCard({
  work,
  approval,
}: {
  work: WorkListItem;
  /** 결재 진행률. 없으면 배지를 그리지 않는다(부르지 않은 화면도 있다). */
  approval?: ApprovalSummary;
}) {
  const overdue = work.derived === "overdue";
  const dueNow = isDueNow(work);
  const cross = work.department_count > 1;

  return (
    <article
      className={cn(
        "relative flex min-h-36 flex-col rounded-md border border-gray-10 bg-surface p-3",
        "transition-colors duration-150 hover:border-primary-30",
        overdue
          ? "border-l-4 border-l-status-overdue"
          : dueNow
            ? "border-l-4 border-l-accent"
            : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <StatusBadge status={work.derived} size="sm" />
        {work.due_date ? (
          <span
            className={cn(
              "shrink-0 text-body-xs font-bold tabular-nums",
              overdue
                ? "text-status-overdue-text"
                : dueNow
                  ? "text-accent-text"
                  : "text-gray-60",
            )}
          >
            {/* 끝난 일에 "47일 지남"이라고 적으면 늦은 것처럼 읽힌다.
                완료된 업무에는 남은 날짜가 아니라 기한 날짜만 적는다. */}
            {work.derived === "done"
              ? formatShortDate(work.due_date)
              : formatDueLabel(work.due_date)}
          </span>
        ) : null}
      </div>

      {/* 카드 전체가 눌리도록 제목 링크를 확장한다.
          카드 자체를 <a>로 감싸면 안쪽 링크를 중첩시킬 수 없다.
          제목 17px · 메타 13px — 이 차이가 카드에서 무엇을 먼저 읽을지를 정한다. */}
      <h3 className="mt-2 text-body leading-snug font-bold break-keep text-gray-90">
        <Link
          href={`/works/${work.id}`}
          data-variant="plain"
          className="after:absolute after:inset-0 hover:underline"
        >
          <span className="line-clamp-2">{work.title}</span>
        </Link>
      </h3>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-gray-60">
        <span className="inline-flex items-center gap-1">
          <Building2 aria-hidden className="size-3.5" />
          {work.department.name}
        </span>
        {cross ? (
          <span className="inline-flex items-center gap-1 rounded-xs bg-primary-5 px-1.5 py-0.5 font-bold text-primary">
            <Users aria-hidden className="size-3" />
            {work.department_count}개 부서
          </span>
        ) : null}
        {work.previous_year ? (
          <span className="inline-flex items-center gap-1 rounded-xs bg-accent-bg px-1.5 py-0.5 font-bold text-accent-text">
            <RotateCcw aria-hidden className="size-3" />
            작년 판 있음
          </span>
        ) : null}
      </p>

      {/* ── 결재 진행률 ────────────────────────────────────────────────────
          flex 의 「진행 중 3/5」. 상태 하나만 적으면 한 칸 남았는지 다섯 칸
          남았는지가 화면에 없다. 카드에서는 배지 대신 한 줄로 둔다 —
          위에 이미 상태 배지가 있고, 배지가 둘이면 어느 쪽이 업무의 상태인지
          헷갈린다. */}
      {approval ? (
        <p className="mt-2 flex items-center gap-1.5 text-body-xs font-bold text-gray-70">
          <Stamp aria-hidden className="size-3.5 shrink-0 text-gray-40" />
          <span>
            결재 {approvalStateLine(approval.latest.state, approval.latest)}
          </span>
          {approval.count > 1 ? (
            <span className="font-normal text-gray-60">
              · 문서 {approval.count}건
            </span>
          ) : null}
        </p>
      ) : null}

      {/* mt-auto 가 이 줄을 바닥에 붙인다. h-7 로 높이를 못박아, 아바타가 있는
          카드와 없는 카드의 밑줄이 같은 자리에 온다. */}
      <div className="mt-auto flex h-7 items-center justify-between gap-2 border-t border-gray-5 pt-2">
        <AvatarStack people={work.members.map((m) => m.profile)} />
        <span className="flex items-center gap-3 text-body-xs text-gray-60">
          {/* 아이콘 옆 숫자만 두면 스크린리더에는 "5"라고만 읽힌다.
              role 없는 span에 aria-label을 붙이는 것은 ARIA 규칙 위반이라,
              화면에 보이지 않는 글자를 실제로 넣어 준다. */}
          {work.comment_count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare aria-hidden className="size-3.5" />
              <span className="sr-only">대화 </span>
              <span className="tabular-nums">{work.comment_count}</span>
              <span className="sr-only">개</span>
            </span>
          ) : null}
          {work.attachment_count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip aria-hidden className="size-3.5" />
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
