import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CARD_SURFACE } from "@/components/ui/card";
import { NoteThreadView } from "@/components/note/note-thread";
import { ActionFeedback } from "@/components/ui/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { getNoteThread, getWork, markThreadRead } from "@/lib/data";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "쪽지" };

/**
 * 쪽지 실 하나.
 *
 * ── 실을 직접 가져온다 ─────────────────────────────────────────────────────
 *
 * 처음에는 `listNoteThreads` 결과에서 골랐다. 「당사자인가」가 공짜로 걸려서
 * 좋아 보였는데, 그 목록에는 **최근 100통 상한**이 있다 — 쪽지가 100통을 넘는
 * 순간 오래된 실이 404 가 되거나 반쪽만 보인다. 화면 상한이 데이터 접근 규칙
 * 노릇을 하고 있었다(코드리뷰에서 잡혔다).
 *
 * 지금은 `getNoteThread` 가 실을 통째로 가져오고 자격을 그 안에서 본다.
 * 없는 실과 남의 실은 똑같이 404 다 — 「권한이 없습니다」라고 답하면 그 실이
 * 존재한다는 사실 자체가 새어 나간다(getWork 가 null 을 주는 것과 같은 규칙).
 *
 * ── 읽음은 화면을 그리는 중에 찍는다 ───────────────────────────────────────
 *
 * `logAccess` 가 업무 상세에서 하는 것과 같은 자리·같은 방식이다. 실패해도
 * 삼킨다 — 읽음 표시 하나 때문에 쪽지를 못 보게 될 이유가 없다.
 *
 * 이번 렌더는 **읽기 전 상태**를 그린다(데이터를 먼저 가져왔으므로). 그게
 * 오히려 맞다 — 방금 무엇이 새로 왔는지가 보이고, 다음 이동에서 배지가 준다.
 */
export default async function NoteThreadPage({
  params,
  searchParams,
}: PageProps<"/notes/[threadId]">) {
  const viewer = await requireViewer();
  const { threadId } = await params;
  const sp = await searchParams;

  const thread = await getNoteThread(threadId, viewer);
  if (!thread) notFound();

  // 받는 사람은 이 업무를 못 본다(설계 §3). null 이면 그 사실을 화면이 적는다.
  const work = await getWork(viewer, thread.work.id);

  const read = markThreadRead(thread.thread_id, viewer.id);

  const counterpart = `${thread.counterpart.name} ${thread.counterpart.position ?? ""}`.trim();

  await read;

  return (
    <PageContainer width="doc">
      {/* 상세 화면에는 돌아갈 길이 화면 안에 있어야 한다. 업무 상세·결재
          문서·새 업무·결재 올리기·문서 편집이 전부 이 줄을 두는데 쪽지 실만
          없었다 — 좁은 화면에서는 옆줄이 접혀 있어 뒤로가기 말고는 길이
          없었다. */}
      <nav aria-label="현재 위치" className="mb-4">
        <ol className="flex items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link
              href="/notes"
              className="inline-flex items-center font-bold transition-colors duration-150 hover:text-primary pointer-coarse:min-h-11"
            >
              쪽지
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="min-w-0">
            <span className="line-clamp-1 text-gray-70">{counterpart} 님</span>
          </li>
        </ol>
      </nav>

      {/* h1 은 화면마다 정확히 하나다(page-header.tsx). 그 하나를 여기 두고,
          아래 문서 등급 판의 제목은 h2 로 받는다 — 크기(27px)가 위계를 말하고
          태그는 문서 구조를 말한다. 둘은 서로 다른 것이다. */}
      <PageHeader size="sm" title="쪽지" />
      <ActionFeedback msg={sp.msg} className="mb-4" />

      <div data-rank="doc" className={cn(CARD_SURFACE.doc, "p-6")}>
        <h2 className="mb-4 text-h2 leading-snug font-bold break-keep text-gray-90">
          {counterpart} 님과의 쪽지
        </h2>
        <NoteThreadView
          thread={thread}
          viewer={viewer}
          canSeeWork={work !== null}
        />
      </div>
    </PageContainer>
  );
}
