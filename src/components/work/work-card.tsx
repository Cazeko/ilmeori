import Link from "next/link";
import {
  Building2,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDueLabel, formatShortDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { AvatarStack } from "@/components/ui/avatar";
import type { WorkListItem } from "@/lib/types";

/**
 * 업무 카드.
 *
 * 한 장에서 답해야 하는 질문은 넷이다.
 *   지금 어디까지 왔나 / 언제까지인가 / 누가 붙어 있나 / 혼자 하는 일인가
 *
 * 지연은 왼쪽 붉은 띠와 배지 두 곳에서 알린다. 색만으로는 알 수 없어야 한다는
 * 접근성 요건이기도 하지만, 실제로 지연 업무를 놓쳐서 생기는 사고를 줄이려는 목적이 크다.
 */
export function WorkCard({ work }: { work: WorkListItem }) {
  const overdue = work.derived === "overdue";
  const cross = work.department_count > 1;

  return (
    <article
      className={cn(
        "relative rounded-md border bg-surface transition-colors duration-150 hover:border-primary-30",
        overdue ? "border-gray-10 border-l-4 border-l-status-overdue" : "border-gray-10",
      )}
    >
      <div className="p-3.5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <StatusBadge status={work.derived} size="sm" />
          {work.due_date ? (
            <span
              className={cn(
                "shrink-0 text-body-xs font-bold tabular-nums",
                overdue ? "text-status-overdue-text" : "text-gray-60",
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
            카드 자체를 <a>로 감싸면 안쪽 링크를 중첩시킬 수 없다. */}
        <h3 className="text-body-sm leading-snug font-bold break-keep text-gray-90">
          <Link
            href={`/works/${work.id}`}
            data-variant="plain"
            className="after:absolute after:inset-0 hover:underline"
          >
            <span className="line-clamp-2">{work.title}</span>
          </Link>
        </h3>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-gray-60">
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

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-5 pt-2.5">
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
      </div>
    </article>
  );
}
