import Link from "next/link";
import {
  ArrowLeftRight,
  CircleDot,
  FileCheck,
  FileText,
  Mail,
  MessageSquare,
  Paperclip,
  PenLine,
  Stamp,
  Undo2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatFullDateTime } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import {
  ACTIVITY_TONE,
  type ActivityKind,
  type ActivityTone,
  type ActivityWithActor,
} from "@/lib/types";

/**
 * 이력 타임라인 — 이 제품이 실제로 만들어 내는 것.
 *
 * 이 목록은 사람이 적지 않는다. 업무를 고치면 DB 트리거가 쓴다.
 * 사용자에게는 이 표에 INSERT 권한이 없어서, 나중에 고쳐 쓸 수도 없다.
 * 그래서 "일을 하면 기록이 남는다"가 습관이 아니라 구조가 된다.
 *
 * 색은 다섯 갈래로만 나눈다. 인수인계나 감사에서 실제로 찾는 것은
 * "권한이 언제 누구에게 갔는가"이므로, 그 사건이 눈에 먼저 들어와야 한다.
 * 결재를 따로 뗀 이유도 같다 — "그때 님이 결재해 주셨는데"의 그 줄이다.
 */

const ICON: Record<ActivityKind, LucideIcon> = {
  "work.created": CircleDot,
  "work.updated": PenLine,
  "work.status_changed": CircleDot,
  "work.transferred": ArrowLeftRight,
  "member.added": UserPlus,
  "member.role_changed": Users,
  "member.removed": Users,
  "document.created": FileText,
  "document.updated": FileText,
  "document.deleted": FileText,
  "section.updated": PenLine,
  "comment.created": MessageSquare,
  "comment.deleted": MessageSquare,
  // 쪽지는 봉투다. 대화(말풍선)와 한눈에 갈리되 같은 「대화」 색으로 묶인다.
  "note.sent": Mail,
  "note.answered": Mail,
  "attachment.added": Paperclip,
  "attachment.removed": Paperclip,
  "handover.started": ArrowLeftRight,
  "handover.completed": ArrowLeftRight,
  "approval.submitted": Stamp,
  "approval.signed": Stamp,
  "approval.rejected": Undo2,
  "approval.completed": FileCheck,
  "approval.withdrawn": Undo2,
};

/**
 * 갈래 표시 — 다섯 갈래에 다섯 색을 주던 것을 색 하나 + 명도 셋으로 줄였다.
 *
 * 이력은 「무슨 일이 있었는가」를 시간순으로 늘어놓는 자리라, 갈래마다 색이
 * 붙으면 화면이 통째로 알록달록해지고 **정작 어느 사건이 중요한지는 여전히
 * 알 수 없다.** 갈래는 이미 아이콘과 글자로 적혀 있다.
 *
 * 색이 남는 것은 **인계** 하나다. 인사이동은 이 제품이 존재하는 이유이고,
 * 이력에서 유일하게 사람이 실제로 움직여야 하는 사건이다.
 */
/*
 * 점은 면이 곧 뜻이라 채움을 남기고, 갈래 이름표는 글자만 남긴다.
 * (배지에서 면을 걷어낸 것과 같은 결정 — status-badge.tsx 의 머리말)
 */
const TONE: Record<ActivityTone, { dot: string; chip: string }> = {
  결재: { dot: "bg-gray-10 text-gray-90", chip: "text-gray-90" },
  권한: { dot: "bg-gray-10 text-gray-60", chip: "text-gray-60" },
  대화: { dot: "bg-gray-5 text-gray-60", chip: "text-gray-60" },
  내용: { dot: "bg-gray-5 text-gray-60", chip: "text-gray-60" },
  인계: { dot: "bg-accent-bg text-accent-text", chip: "text-accent-text" },
};

const dayFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function groupByDay(items: ActivityWithActor[]) {
  const groups: Array<{ day: string; items: ActivityWithActor[] }> = [];
  for (const item of items) {
    const day = dayFmt.format(new Date(item.created_at));
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

export function ActivityTimeline({
  items,
  showTone = true,
}: {
  items: ActivityWithActor[];
  /** 좁은 자리에서는 갈래 표시를 뺀다 */
  showTone?: boolean;
}) {
  const groups = groupByDay(items);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.day}>
          <h3 className="mb-3 text-body-xs font-bold text-gray-60">
            {group.day}
          </h3>
          <ol className="relative border-l border-rule-hair pl-0">
            {group.items.map((a) => {
              const tone = ACTIVITY_TONE[a.kind];
              const Icon = ICON[a.kind];
              return (
                <li key={a.id} className="relative flex gap-3 pb-4 pl-5 last:pb-0">
                  {/* 세로줄 위의 점 */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-0.5 -left-[11px] flex size-[22px] items-center justify-center rounded-full ring-3 ring-surface",
                      TONE[tone].dot,
                    )}
                  >
                    <Icon className="size-3" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-body-sm font-bold text-gray-90">
                        {a.actor?.name ?? "시스템"}
                      </span>
                      <time
                        dateTime={a.created_at}
                        title={formatFullDateTime(a.created_at)}
                        className="text-body-xs tabular-nums text-gray-60"
                      >
                        {timeFmt.format(new Date(a.created_at))}
                      </time>
                      {showTone ? (
                        <span
                          className={cn(
                            "text-body-xs font-bold",
                            TONE[tone].chip,
                          )}
                        >
                          {tone}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-body-sm break-keep text-gray-60">
                      {a.summary}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** 대시보드용 압축판 — 어느 업무에서 일어난 일인지까지 함께 보인다 */
export function ActivityFeed({
  items,
}: {
  items: Array<ActivityWithActor & { work: { id: string; title: string } }>;
}) {
  return (
    <ul className="divide-y divide-rule-hair">
      {items.map((a) => {
        const Icon = ICON[a.kind];
        const tone = ACTIVITY_TONE[a.kind];
        return (
          <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            {a.actor ? (
              <Avatar profile={a.actor} size="sm" className="mt-1" />
            ) : (
              <span
                aria-hidden
                className={cn(
                  "mt-1 flex size-6 items-center justify-center rounded-full",
                  TONE[tone].dot,
                )}
              >
                <Icon className="size-3" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-body-sm break-keep text-gray-90">
                <span className="font-bold text-gray-90">
                  {a.actor?.name ?? "시스템"}
                </span>{" "}
                {a.summary}
              </p>
              <p className="mt-1 flex items-center gap-2 text-body-xs text-gray-60">
                {/* 소식 8줄이 잇달아 서는 자리라 44px 를 주면 목록이 화면 두 배로
                    길어진다. 문장 안에 섞인 링크는 2.5.8 의 예외이기도 해서,
                    여기는 AA 기준선인 24px 까지만 넓힌다. 손가락으로 눌러야 하는
                    **조작 도구**(단추·펼침·이동 메뉴)에만 44px 를 준다. */}
                <Link
                  href={`/works/${a.work.id}`}
                  className="inline-flex min-w-0 items-center truncate font-bold text-gray-60 transition-colors duration-150 hover:text-primary pointer-coarse:min-h-6"
                >
                  {a.work.title}
                </Link>
                <time
                  dateTime={a.created_at}
                  className="shrink-0 tabular-nums"
                  title={formatFullDateTime(a.created_at)}
                >
                  {timeFmt.format(new Date(a.created_at))}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
