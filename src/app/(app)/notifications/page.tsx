import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { markAllRead } from "@/lib/actions/notifications";
import { CARD_SURFACE } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { countUnreadNotifications, listNotifications } from "@/lib/data";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import { NOTIFICATION_LIMIT } from "@/lib/notification";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "알림" };

/**
 * 알림 — 사건만 모인 자리.
 *
 * 「지금 내 차례 결재」와 「지연된 업무」는 **여기 없다.** 그것들은 상태라
 * 읽었다고 사라지지 않고, 알림에 넣으면 읽음 처리된 순간 목록에서 사라지는데
 * 일은 그대로 남는다. 그 둘은 결재함과 보드·홈에 그대로 있다
 * (docs/plans/2026-08-23-쪽지-알림-design.md §4).
 *
 * 지우지 않는다. 대신 최근 100건만 읽고 **잘랐다는 사실을 화면이 적는다** —
 * 결재함이 이미 쓰는 규약이다. 「말하지 않는 상한은 「전부 다 봤다」로 읽힌다」.
 */
export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const [items, unread] = await Promise.all([
    listNotifications(viewer, NOTIFICATION_LIMIT),
    countUnreadNotifications(viewer),
  ]);
  const truncated = items.length >= NOTIFICATION_LIMIT;

  return (
    <PageContainer width="doc">
      <PageHeader
        size="sm"
        title="알림"
        action={
          unread > 0 ? (
            <form action={markAllRead}>
              <SubmitButton variant="secondary" size="sm">
                전부 읽음
              </SubmitButton>
            </form>
          ) : null
        }
      />

      {/* 「읽으면 끝나는 것만 모읍니다. 처리해야 사라지는 것은 결재함과 업무
          보드에 그대로 있습니다」가 이 자리에 늘 떠 있었다. 설계의 근거를 적은
          말이지 알림을 보러 온 사람에게 하는 말이 아니다 — 그 근거는 이 파일
          머리말에 있으면 되고, 화면에서는 목록이 곧 답이다. */}
      {items.length > 0 ? (
        <>
          <ul
            data-rank="doc"
            className={cn(
              CARD_SURFACE.doc,
              "divide-y divide-rule-hair overflow-hidden",
            )}
          >
            {items.map((n) => (
              <li key={n.id}>
                {/* 라우트 핸들러로 가는 링크라 <Link> 가 아니라 <a> 다 —
                    읽음을 찍고 302 로 보내는 자리이고, 클라이언트 라우터는
                    그 응답을 페이지로 읽지 못한다(notification-bell 과 같다). */}
                <a
                  href={`/notifications/${n.id}`}
                  className={cn(
                    "flex min-h-11 items-start gap-3 px-4 py-4 sm:px-5",
                    "transition-colors duration-150 hover:bg-gray-5 active:bg-primary-5",
                  )}
                >
                  {/* 안 읽음은 색이 아니라 **뒤집기**로 말한다 — 먹색 점.
                      읽은 것은 같은 자리를 비워 두어 줄이 어긋나지 않게 한다. */}
                  <span
                    aria-hidden
                    className={cn(
                      "mt-2 size-1.5 shrink-0 rounded-full",
                      n.read_at ? "" : "bg-gray-90",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-body break-keep",
                        n.read_at
                          ? "text-gray-60"
                          : "font-bold text-gray-90",
                      )}
                    >
                      {n.summary}
                      {n.count > 1 ? (
                        <span className="ml-1 font-normal tabular-nums text-gray-60">
                          외 {n.count - 1}건
                        </span>
                      ) : null}
                    </span>
                    <time
                      dateTime={n.created_at}
                      title={formatFullDateTime(n.created_at)}
                      className="mt-1 block text-body-xs tabular-nums text-gray-60"
                    >
                      {formatDateTime(n.created_at)}
                    </time>
                  </span>
                  {!n.read_at ? (
                    <span className="sr-only">안 읽음</span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
          {truncated ? (
            <p className="mt-2 text-body-xs text-gray-60">
              최근 {NOTIFICATION_LIMIT}건까지만 봅니다. 더 오래된 것은 해당 업무의
              이력 탭에 그대로 남아 있습니다.
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-sm border border-rule-frame bg-surface">
          <EmptyState
            icon={Bell}
            title="새 알림이 없습니다"
            description="누가 회원님을 대화에서 부르거나, 쪽지를 보내거나, 참여 중인 업무가 움직이면 여기에 쌓입니다."
          />
        </div>
      )}
    </PageContainer>
  );
}
