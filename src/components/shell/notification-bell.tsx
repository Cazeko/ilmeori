import Link from "next/link";
import { Bell } from "lucide-react";
import { markAllRead } from "@/lib/actions/notifications";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import type { NotificationWithActor } from "@/lib/types";

/**
 * 머리 줄의 종.
 *
 * ── 스크립트 없이 열린다 ───────────────────────────────────────────────────
 *
 * `<details>` 다. 이 앱은 모바일 서랍을 이미 그렇게 열고 있고(app-shell 의
 * drawerRef 주석) 그것이 「스크립트 없이 전부 동작한다」는 전제를 지키는 방식이다.
 *
 * ── z 층을 만들지 않았다 ───────────────────────────────────────────────────
 *
 * 머리 줄이 `sticky top-0 z-20` 이고, `position: sticky` + `z-index` 는
 * **쌓임 맥락을 만든다.** 그 안에 절대배치한 이 판은 그 맥락에 갇히므로 바깥
 * 세상에 대해서는 헤더의 z-20 하나로 판정된다 — 본문 위, 덮개(30)·서랍(40)·
 * 대화상자(50) 아래. 전부 옳은 순서다. 규약 다섯이 그대로 남는다.
 *
 * ── 안 읽은 수는 색이 아니라 뒤집기 ────────────────────────────────────────
 *
 * 4갈래가 전부 안 맞는다 — 빨강은 「지연·반려 둘뿐」, 주황은 「내가 움직여야
 * 하는 것」인데 알림은 **읽으면 끝나는 사건**이고, 파랑은 머리 줄이 이미 다
 * 파랑이다. 검은 알약에 흰 숫자로 뒤집는다(대외비 칩과 같은 수).
 */
export function NotificationBell({
  items,
  unread,
}: {
  items: NotificationWithActor[];
  unread: number;
}) {
  return (
    <details className="relative shrink-0">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm px-2 text-gray-70 hover:bg-gray-5 hover:text-gray-90 [&::-webkit-details-marker]:hidden"
        aria-label={
          unread > 0 ? `알림 ${unread}건이 안 읽혔습니다` : "알림"
        }
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 ? (
          <span className="rounded-xs bg-gray-90 px-chip-x py-chip-y text-body-xs font-bold tabular-nums text-gray-0">
            {unread}
          </span>
        ) : null}
      </summary>

      <div className="absolute top-full right-0 mt-1 w-80 rounded-sm border border-rule-frame bg-surface sm:w-96">
        <div className="flex items-center justify-between gap-2 border-b border-rule-hair px-4 py-3">
          <p className="text-body-sm font-bold text-gray-90">알림</p>
          {unread > 0 ? (
            <form action={markAllRead}>
              <SubmitButton variant="ghost" size="sm" className="min-h-11 px-2">
                전부 읽음
              </SubmitButton>
            </form>
          ) : null}
        </div>

        {items.length > 0 ? (
          <ul className="max-h-96 divide-y divide-rule-hair overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                {/* 눌러야 읽음이 된다. 종을 열었다고 읽은 것이 아니다 —
                    열어 보고 「나중에 봐야지」 하는 것이 정상 동선이다.

                    <Link> 가 아니라 평범한 <a> 다. 목적지가 페이지가 아니라
                    **라우트 핸들러**(읽음을 찍고 302 로 보낸다)라서, 클라이언트
                    라우터가 RSC 응답을 기대하고 눌러도 아무 일이 안 일어난다.
                    실제로 그랬다 — 브라우저에게 맡기면 그냥 된다. */}
                <a
                  href={`/notifications/${n.id}`}
                  data-variant="plain"
                  className={cn(
                    "flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-gray-5 active:bg-primary-5",
                    n.read_at ? "text-gray-60" : "text-gray-90",
                  )}
                >
                  <span className="flex items-start gap-2">
                    {!n.read_at ? (
                      <span
                        aria-hidden
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-gray-90"
                      />
                    ) : (
                      <span aria-hidden className="mt-2 size-1.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 text-body-sm break-keep">
                      {n.summary}
                      {n.count > 1 ? (
                        <span className="ml-1 tabular-nums text-gray-60">
                          외 {n.count - 1}건
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <time
                    dateTime={n.created_at}
                    title={formatFullDateTime(n.created_at)}
                    className="pl-4 text-body-xs tabular-nums text-gray-60"
                  >
                    {formatDateTime(n.created_at)}
                  </time>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-body-sm text-gray-60">
            새 알림이 없습니다.
          </p>
        )}

        <div className="border-t border-rule-hair px-4 py-2">
          <Link
            href="/notifications"
            className="inline-flex min-h-11 items-center text-body-sm font-bold text-primary"
          >
            전부 보기
          </Link>
        </div>
      </div>
    </details>
  );
}
