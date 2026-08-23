import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CARD_SURFACE } from "@/components/ui/card";
import { NoteThreadView } from "@/components/note/note-thread";
import { ActionFeedback } from "@/components/ui/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { getWork, listNoteThreads, markThreadRead } from "@/lib/data";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "쪽지" };

/**
 * 쪽지 실 하나.
 *
 * ── 왜 목록에서 찾는가 ─────────────────────────────────────────────────────
 *
 * `listNoteThreads` 는 **내가 주고받은 것**만 돌려준다. 여기서 그 안을 찾으면
 * 「당사자인가」가 자동으로 걸린다. 업무를 읽을 수 있어서 이 실을 구경만 하는
 * 제3자는 여기 들어오지 못하고, 그 사람이 볼 자리는 업무 상세 쪽이다.
 *
 * 없는 실과 남의 실은 똑같이 404 다. 「권한이 없습니다」라고 답하면 그 실이
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

  const threads = await listNoteThreads(viewer);
  const thread = threads.find((t) => t.thread_id === threadId);
  if (!thread) notFound();

  // 받는 사람은 이 업무를 못 본다(설계 §3). null 이면 그 사실을 화면이 적는다.
  const work = await getWork(viewer, thread.work.id);

  const read = markThreadRead(thread.thread_id, viewer.id);

  const counterpart = `${thread.counterpart.name} ${thread.counterpart.position ?? ""}`.trim();

  await read;

  return (
    <PageContainer width="doc">
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
