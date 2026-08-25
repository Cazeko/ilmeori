import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ChevronRight } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { RichDocSurface } from "@/components/editor/rich-doc-surface";
import { WorkNotFound } from "@/components/work/work-not-found";
import { getWork, getWorkDocument, logAccess, roleIn } from "@/lib/data";
import { canMutate, isSupabaseConfigured } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { docTitle, parseRichDoc } from "@/lib/editor/model";

/**
 * 서식 문서 편집기 — 화면 하나를 통째로 쓴다.
 *
 * ── 왜 업무 상세의 탭이 아닌가 ──────────────────────────────────────────────
 *
 * A4 종이가 794px 이다. 여기에 개요와 의견 칸을 양옆에 두면 1,230px 이 들고,
 * 업무 상세는 오른쪽에 첨부·참여자 칸을 이미 두고 있어 본문에 그 절반이
 * 남는다. 좁은 칸에 억지로 넣으면 종이가 줄어들거나 가로 스크롤이 생기는데,
 * **가로로 밀어 가며 쓰는 문서 편집기는 쓸 수 없는 물건이다.**
 *
 * 그래서 편집은 이 화면이 맡고, 업무 상세의 문서 탭은 읽기 전용 미리보기와
 * 「편집기 열기」 단추를 둔다. 한/글을 눌렀을 때 창이 따로 뜨는 것과 같은
 * 모양이라 낯설지도 않다.
 *
 * ── 스크립트가 없어도 여기서 고칠 수 있다 ───────────────────────────────────
 *
 * RichDocSurface 가 하이드레이션 전에는 문단별 폼(PlainEditor)을 그린다.
 * 그러니까 이 주소는 「자바스크립트가 필요한 화면」이 아니라 **넓은 화면**이다.
 */

export async function generateMetadata({
  params,
}: PageProps<"/works/[id]/doc">): Promise<Metadata> {
  const viewer = await requireViewer();
  const { id } = await params;
  const work = await getWork(viewer, id);
  if (!work) return { title: "찾을 수 없습니다" };
  const { document } = await getWorkDocument(work.id);
  const doc = document ? parseRichDoc(document.blocks) : null;
  return { title: doc ? docTitle(doc) || document!.title : work.title };
}

export default async function WorkDocPage({
  params,
  searchParams,
}: PageProps<"/works/[id]/doc">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;

  const work = await getWork(viewer, id);
  // 볼 수 없는 업무는 없는 업무와 똑같이 답한다(업무 상세와 같은 판단).
  if (!work) return <WorkNotFound path={`/works/${id}`} />;

  const { document } = await getWorkDocument(work.id);
  const doc = document ? parseRichDoc(document.blocks) : null;

  const role = roleIn(work, viewer);
  const canEdit = role === "owner" || role === "editor";

  // 문서를 열어 본 사실을 남긴다. 화면의 어느 것도 이 결과를 기다리지 않는다.
  const logged = logAccess(work.id, "document.viewed");
  after(() => logged);

  const editingBlockId = typeof sp.b === "string" && sp.b ? sp.b : null;

  return (
    <PageContainer width="editor">
      {/* 종이에는 이 줄이 없어야 한다. 결재에 올라가는 문서 맨 위에
          「업무 보드 > … > 문서」가 찍히면 그건 우리 화면의 흔적이지
          문서의 일부가 아니다. */}
      <nav aria-label="현재 위치" className="mb-3 print:hidden">
        <ol className="flex flex-wrap items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link
              href="/works"
              className="inline-flex items-center font-bold transition-colors duration-150 hover:text-primary pointer-coarse:min-h-11"
            >
              업무 보드
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="min-w-0">
            <Link
              href={`/works/${work.id}?tab=doc`}
              className="line-clamp-1 transition-colors duration-150 hover:text-primary pointer-coarse:min-h-11"
            >
              {work.title}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="text-gray-70">문서</li>
        </ol>
      </nav>

      {/* ── 이 화면에는 h1 이 없었다 ────────────────────────────────────────
          이름이 <title> 에만 있어서, 제목으로 화면을 훑는 사람이 여기 도착하면
          **잡을 닻이 하나도 없었다.** 편집기 안에도 heading 이 없다(문단은
          전부 p 다). page-header.tsx 가 적어 둔 말 그대로다 — 「스크린리더
          사용자는 h1으로 「여기가 어디인지」를 잡는다」.

          눈에는 그리지 않는다. 바로 아래 A4 종이가 자기 제목을 이미 크게 달고
          있어서, 그 위에 같은 글자를 한 번 더 쓰면 종이 밖에 종이 제목이
          하나 더 서는 꼴이 된다. 소리에만 둔다. */}
      <h1 className="sr-only">
        {doc ? docTitle(doc) || work.title : work.title} — 문서 편집
      </h1>

      <ActionFeedback msg={sp.msg} className="mb-3 print:hidden" />

      {!document || !doc ? (
        <Notice tone="info" title="아직 서식 문서가 아닙니다">
          이 업무의 문서는 항목 방식으로 되어 있거나 아직 만들어지지 않았습니다.{" "}
          <Link href={`/works/${work.id}?tab=doc`} className="font-bold">
            업무 상세의 문서 탭
          </Link>
          에서 문서를 만들거나 서식 편집기로 옮길 수 있습니다.
        </Notice>
      ) : (
        <RichDocSurface
          workId={work.id}
          documentId={document.id}
          doc={doc}
          rev={document.blocks_rev ?? 0}
          viewer={{ id: viewer.id, name: viewer.name, position: viewer.position }}
          // 화면에 그릴 세 칸만 깎아서 넘긴다. Profile 을 통째로 넘기면 이메일까지
          // 페이지 원본에 실린다(WorkLive 의 people 주석과 같은 규칙).
          people={work.members.map((m) => ({
            id: m.profile.id,
            name: m.profile.name,
            position: m.profile.position,
          }))}
          /**
           * 데모에서도 고칠 수 있게 둔다.
           *
           * canMutate 가 false 인 데모 모드에서 편집칸을 통째로 잠그면, 심사위원이
           * 여는 주소에서 이 편집기는 **읽기 전용 종이 한 장**이 된다. 이 제품이
           * 보여 주려는 것이 「문서를 어떻게 함께 고치는가」인데 그러면 아무것도
           * 보여 주지 못한다. 그래서 고치는 것은 열어 두고 **저장만 막는다** —
           * onSave 가 null 이면 편집기는 저장을 시도하지 않고, 머리띠가
           * 「저장되지 않습니다」라고 먼저 말한다.
           */
          canWrite={canEdit}
          realtimeEnabled={isSupabaseConfigured && canMutate}
          demoNotice={!canMutate && canEdit}
          editingBlockId={editingBlockId}
        />
      )}
    </PageContainer>
  );
}
