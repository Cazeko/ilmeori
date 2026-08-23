import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { CARD_SURFACE } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { listNoteThreads } from "@/lib/data";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import { NOTE_LIMIT, unreadCount } from "@/lib/note";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "쪽지" };

/**
 * 쪽지함.
 *
 * 결재함과 같은 모양이다 — 목록이 곧 이 화면의 「문서」이고, 이름표는 물러난다.
 * 새 어휘를 만들지 않는 편이 낫다. 공무원이 이미 아는 모양이면 학습 비용이 0이다.
 *
 * ── 안 읽은 수를 뒤집기로 알린다 ───────────────────────────────────────────
 *
 * 색 4갈래가 전부 안 맞는다 — 빨강은 「지연·반려 둘뿐」이고, 주황은 「내가
 * 움직여야 하는 것」인데 안 읽은 쪽지는 처리 대상이 아니라 **읽으면 끝나는
 * 사건**이며, 파랑은 누를 수 있는 것이라 목록 전체가 이미 파랑이다.
 * 그래서 색이 아니라 **뒤집는다** — 검은 알약에 흰 숫자. 대외비 칩이 같은
 * 수를 쓴다(approval-row.tsx). 색 예산을 한 갈래도 쓰지 않는다.
 */
export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const threads = await listNoteThreads(viewer);
  const unread = unreadCount(threads);
  // 상한을 걸었으면 **화면이 그 사실을 말한다.** 결재함과 같은 규약이다 —
  // 「말하지 않는 상한은 「전부 다 봤다」로 읽힌다」.
  const truncated =
    threads.reduce((n, t) => n + t.notes.length, 0) >= NOTE_LIMIT;

  return (
    <PageContainer>
      {/* 이름표는 물러난다 — 「쪽지」는 왼쪽 메뉴에서 이미 켜져 있다.
          이 화면의 1등은 아래 목록이다. */}
      <PageHeader size="sm" title="쪽지" />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-h3 font-bold text-gray-90">
          주고받은 쪽지
          <span className="ml-2 text-body-sm font-normal tabular-nums text-gray-60">
            {threads.length}건
          </span>
        </h2>
        {unread > 0 ? (
          <span className="rounded-xs bg-gray-90 px-chip-x py-chip-y text-body-xs font-bold tabular-nums text-gray-0">
            안 읽음 {unread}
          </span>
        ) : null}
      </div>
      <p className="mb-4 text-body-sm break-keep text-gray-60">
        쪽지는 언제나 업무 하나를 물고 다닙니다. 오간 문답은 그 업무에 함께 남아
        인계서까지 갑니다.
      </p>

      {threads.length > 0 ? (
        <>
        <ul
          data-rank="doc"
          className={cn(CARD_SURFACE.doc, "divide-y divide-rule-hair overflow-hidden")}
        >
          {threads.map((t) => {
            const last = t.notes[t.notes.length - 1];
            return (
              <li
                key={t.thread_id}
                className={cn(
                  "relative px-4 py-4 sm:px-5",
                  "transition-colors duration-150 active:bg-primary-5",
                  "has-[[data-link-pending]]:opacity-55",
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar profile={t.counterpart} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-body font-bold text-gray-90">
                        <Link
                          href={`/notes/${t.thread_id}`}
                          data-variant="plain"
                          className="after:absolute after:inset-0 hover:underline"
                        >
                          {t.counterpart.name}
                          {t.counterpart.position ? (
                            <span className="ml-1 font-normal text-gray-60">
                              {t.counterpart.position}
                            </span>
                          ) : null}
                        </Link>
                      </span>
                      {t.unread > 0 ? (
                        <span className="rounded-xs bg-gray-90 px-chip-x py-chip-y text-body-xs font-bold tabular-nums text-gray-0">
                          {t.unread}
                        </span>
                      ) : null}
                      <time
                        dateTime={t.last_at}
                        title={formatFullDateTime(t.last_at)}
                        className="ml-auto text-body-xs tabular-nums text-gray-60"
                      >
                        {formatDateTime(t.last_at)}
                      </time>
                    </p>

                    <p className="mt-1 line-clamp-2 text-body-sm break-keep text-gray-70">
                      {last.body}
                    </p>

                    {/* 무엇에 대한 문의인가. 업무를 못 보는 사람(=물음을 받은
                        바깥 사람)에게는 제목이 오지 않으므로 그 자리를 비운다 —
                        RLS 가 임베드를 비워 주고, 여기서는 그때 줄을 안 그린다. */}
                    {t.work.title !== "업무" ? (
                      <p className="mt-2 text-body-xs break-keep text-gray-60">
                        {t.work.title}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
          {threads.length >= 0 && truncated ? (
            <p className="mt-2 text-body-xs text-gray-60">
              최근 {NOTE_LIMIT}통까지만 봅니다. 더 오래된 쪽지는 그 업무의
              「대화」 탭에서 볼 수 있습니다.
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-sm border border-rule-frame bg-surface">
          <EmptyState
            icon={Mail}
            title="주고받은 쪽지가 없습니다"
            description="업무 상세의 「대화」 탭에서 그 업무의 참여자가 아닌 사람에게 물어볼 수 있습니다."
          />
        </div>
      )}
    </PageContainer>
  );
}
