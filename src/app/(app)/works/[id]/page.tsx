import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import {
  Archive,
  Building2,
  CalendarClock,
  ChevronRight,
  Eye,
  FileDown,
  FileText,
  History,
  MessageSquare,
  PencilLine,
  Stamp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/ui/page-container";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalRow } from "@/components/approval/approval-row";
import { CARD_SURFACE, Card, CardHeader } from "@/components/ui/card";
import { PersonChip } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { TabNav, type TabItem } from "@/components/ui/tab-nav";
import { ActivityTimeline } from "@/components/work/activity-timeline";
import { AttachmentPanel } from "@/components/work/attachment-panel";
import { CommentThread } from "@/components/work/comment-thread";
import { WorkNotes } from "@/components/note/work-notes";
import { DocSections } from "@/components/work/doc-sections";
import { DocPreview } from "@/components/editor/doc-preview";
import { docTitle, parseRichDoc } from "@/lib/editor/model";
import { MemberList } from "@/components/work/member-list";
import { PreviousYearCallout } from "@/components/work/previous-year-callout";
import { StatusChanger } from "@/components/work/status-changer";
import { VisibilityReason } from "@/components/work/visibility-reason";
import { WorkLiveLazy } from "@/components/work/work-live-lazy";
import { WorkNotFound } from "@/components/work/work-not-found";
import { formatDate, formatDateTime, formatDueLabel } from "@/lib/format";
import {
  getAccessLogsForWork,
  getActivities,
  getApprovalsForWork,
  getWorkNoteThreads,
  getAttachments,
  getComments,
  getWork,
  getWorkDocument,
  listProfiles,
  logAccess,
  roleIn,
} from "@/lib/data";
import { canMutate, isSupabaseConfigured } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { ACCESS_KIND_LABEL, VISIBILITY_LABEL } from "@/lib/types";

const TABS = ["doc", "talk", "approval", "history", "people"] as const;
type Tab = (typeof TABS)[number];

function parseTab(value: unknown): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "doc";
}

export async function generateMetadata({
  params,
}: PageProps<"/works/[id]">): Promise<Metadata> {
  const viewer = await requireViewer();
  const { id } = await params;
  const work = await getWork(viewer, id);
  return { title: work?.title ?? "찾을 수 없습니다" };
}

/**
 * 업무 상세.
 *
 * 탭 다섯이 각각 다른 질문에 답한다.
 *   문서   — 이 일의 내용이 무엇인가
 *   대화   — 왜 그렇게 정했는가
 *   결재   — 무엇이 결재를 받았는가
 *   이력   — 누가 언제 무엇을 했는가
 *   참여자 — 누가 볼 수 있는가
 *
 * 결재를 별도 메뉴로만 두지 않고 여기에도 붙이는 이유는, 결재 문서가 업무에
 * 매달리기 때문이다. 결재함은 그것을 모아 보는 화면일 뿐이다.
 * (브리티웍스가 결재를 별도 메뉴가 아니라 메일·업무 포털 안에 넣은 것과 같은 판단)
 *
 * 탭은 주소로 움직인다(?tab=history). 그래야 "이 업무 이력 좀 보세요"를
 * 링크 하나로 보낼 수 있다.
 */
export default async function WorkDetailPage({
  params,
  searchParams,
}: PageProps<"/works/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;

  const work = await getWork(viewer, id);
  // 볼 수 없는 업무도 없는 업무와 똑같이 답한다.
  // "권한이 없다"고 답하면 그 업무가 있다는 정보가 새기 때문이다.
  // notFound()를 쓰지 않는 이유는 work-not-found.tsx 의 주석에 적었다.
  if (!work) return <WorkNotFound path={`/works/${id}`} />;

  const tab = parseTab(sp.tab);
  const role = roleIn(work, viewer);
  // 화면에서 감추는 것은 안내이지 통제가 아니다. 실제로 막는 것은 서버 액션과 DB다.
  const canEdit = role === "owner" || role === "editor";

  /**
   * 진행 상태만 데모 모드에서도 살아 있다.
   *
   * 데모의 변경분은 쿠키에 담기는데(src/lib/demo-state.ts) 업무 하나, 문서 한 판,
   * 참여자 목록을 담기 시작하면 4KB를 넘고 브라우저가 조용히 통째로 버린다.
   * 상태 한 칸은 그 안에 들어가고, 심사 시연 동선이 여기에 걸려 있다.
   * (env.ts의 canMutate 주석과 works.ts의 changeStatus 데모 분기가 같은 말을 한다)
   */
  const canChangeStatus = canEdit;
  const canWrite = canMutate && canEdit;
  const canOwn = canMutate && role === "owner";

  // 문서 항목을 편집 중인지는 주소에 있다. 그래야 새로고침해도 편집칸이 남고,
  // 잠금을 쥔 채로 화면을 떠났다가 뒤로 가기로 돌아와도 이어서 쓸 수 있다.
  const editingId = typeof sp.edit === "string" ? sp.edit : null;
  // 서식 문서를 스크립트 없이 고칠 때 열린 문단. 항목 문서의 ?edit= 와 겹치지
  // 않게 다른 이름을 쓴다 — 한 화면에 둘이 동시에 있을 수는 없지만, 같은 이름을
  // 쓰면 두 갈래 중 어느 쪽 id 인지 화면이 알 수 없다.
  const editingBlockId = typeof sp.b === "string" && sp.b ? sp.b : null;

  // 한 화면에 필요한 것을 한꺼번에 가져온다. 순서대로 기다리면 왕복이 그만큼 쌓인다.
  const [
    { document: doc, sections },
    comments,
    activities,
    attachments,
    accessLogs,
    approvals,
    noteThreads,
  ] = await Promise.all([
    getWorkDocument(work.id),
    getComments(work.id),
    getActivities(work.id),
    getAttachments(work.id),
    getAccessLogsForWork(work.id, viewer),
    getApprovalsForWork(viewer, work.id),
    // 「바깥에 물어본 것」은 대화 탭에만 그린다. 다른 탭을 볼 때마다 쪽지를
    // 읽어 올 이유가 없다(아래 candidates 와 같은 판단).
    tab === "talk"
      ? getWorkNoteThreads(work.id, viewer, work.title)
      : Promise.resolve([]),
  ]);

  /**
   * 서식 문서인가.
   *
   * `document.blocks` 는 jsonb 라 DB 가 보장하는 것은 「JSON 인가」까지다.
   * 안이 우리가 기대하는 모양인지는 아무도 보장하지 않으므로 반드시 거른다
   * (src/lib/editor/model.ts 의 parseRichDoc). 모양이 아니면 null 이 되고,
   * 화면은 지금까지의 항목 문서를 그린다 — 문서가 사라지는 것보다 낫다.
   */
  const richDoc = doc ? parseRichDoc(doc.blocks) : null;

  // 부를 수 있는 사람 목록은 두 자리에서 쓴다 — 참여자 탭(소유자만)과
  // 대화 탭의 쪽지 보내기. 다른 탭을 볼 때마다 전 직원을 읽어 올 이유가 없다.
  const candidates =
    (tab === "people" && canOwn) || tab === "talk" ? await listProfiles() : [];

  /**
   * 쪽지를 보낼 수 있는 사람 — **참여자와 나를 뺀 전 직원.**
   *
   * 참여자를 빼는 것이 이 기능의 뜻을 설명 없이 드러낸다. 참여자에게는 위의
   * 대화로 말하면 되고 그 글은 업무를 볼 수 있는 모두가 읽는다. 쪽지는 그
   * 반대편, 공개 범위 밖이라 댓글이 닿지 않는 사람을 위한 것이다.
   */
  const outsiders =
    tab === "talk"
      ? candidates.filter(
          (p) =>
            p.id !== viewer.id &&
            !work.members.some((m) => m.profile_id === p.id),
        )
      : [];

  // 누가 열어 봤는지 남긴다. 사용자에게는 이 표에 쓰기 권한이 없고,
  // 서버의 지정된 함수만 기록할 수 있다.
  //
  // 화면의 어느 것도 이 결과에 기대지 않으므로 응답을 막지 않는다.
  // 호출은 여기서 시작하고(쿠키를 읽어야 하니 렌더 중이어야 한다),
  // 끝나기를 기다리는 일만 after()에 넘긴다.
  const accessLogged = logAccess(work.id, "work.viewed");
  after(() => accessLogged);

  const tabs: TabItem[] = [
    {
      key: "doc",
      label: "문서",
      href: `/works/${work.id}?tab=doc`,
      icon: FileText,
      // 서식 문서는 항목이 없다. 세는 단위가 다르므로 문단 수를 센다.
      count: richDoc ? richDoc.blocks.length : sections.length,
    },
    {
      key: "talk",
      label: "대화",
      href: `/works/${work.id}?tab=talk`,
      icon: MessageSquare,
      count: comments.length,
    },
    {
      key: "approval",
      label: "결재",
      href: `/works/${work.id}?tab=approval`,
      icon: Stamp,
      count: approvals.length,
    },
    {
      key: "history",
      label: "이력",
      href: `/works/${work.id}?tab=history`,
      icon: History,
      count: activities.length,
    },
    {
      key: "people",
      label: "참여자·권한",
      href: `/works/${work.id}?tab=people`,
      icon: Users,
      count: work.members.length,
    },
  ];

  return (
    <PageContainer>
      {/* ── 위치 ─────────────────────────────────────────────────────────── */}
      <nav aria-label="현재 위치" className="mb-4">
        <ol className="flex items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link href="/works" className="inline-flex items-center font-bold hover:text-primary pointer-coarse:min-h-11">
              업무 보드
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="min-w-0">
            <span className="line-clamp-1 text-gray-70">{work.title}</span>
          </li>
        </ol>
      </nav>

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {work.archived_at ? (
        <Notice tone="info" title="보관된 업무입니다" className="mb-4">
          업무 보드의 기본 목록에는 나타나지 않습니다. 문서·대화·이력·첨부는
          그대로 있고, 소유자가 보관을 해제하면 다시 목록에 돌아옵니다.
        </Notice>
      ) : null}

      {/* ── 머리 — 이 화면의 「문서」 ────────────────────────────────────────
          업무 상세에서 먼저 읽혀야 하는 것은 **이 업무가 무엇이고 지금 어느
          단계인가**다. 제목은 원래도 34px 였는데 그 아래 상태·주담당·마감·
          상태 바꾸기가 전부 15px 로 흩어져 있어서, 「제목 하나만 크고 나머지는
          평평한」 모양이었다.

          이 덩어리를 통째로 문서 등급으로 감싼다 — 흰 종이, 각진 모서리,
          위쪽 2px 먹선. 아래의 탭 본문과 옆칸은 판 등급이므로, 화면에 문서는
          여기 하나뿐이다. */}
      <header data-rank="doc" className={cn(CARD_SURFACE.doc, "mb-5 p-6")}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={work.derived} />
          <span className="text-body-xs text-gray-60">
            {work.fiscal_year}년도 · {VISIBILITY_LABEL[work.visibility]}
          </span>
          {work.archived_at ? (
            <span className="inline-flex items-center gap-1 text-body-xs font-bold text-gray-60">
              <Archive aria-hidden className="size-3" />
              보관됨
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          {/* 목록 화면의 h1 은 PageHeader 를 통해 text-h2 sm:text-h1 이다.
              여기만 24px 고정이라 보드에서 상세로 넘어가면 제목이 작아졌다.
              같은 「여기가 어디인가」 역할은 같은 무게로 선다.
              min-w-0 — 이 h1 은 flex-wrap 항목이라 120자짜리 제목이
              오른쪽 「업무 고치기」를 밀어내면 안 된다. */}
          <h1 className="min-w-0 text-h2 leading-snug font-bold break-keep text-gray-90 sm:text-h1">
            {work.title}
          </h1>
          {canWrite ? (
            <ButtonLink
              href={`/works/${work.id}/edit`}
              variant="secondary"
              size="sm"
            >
              <PencilLine aria-hidden className="size-4" />
              업무 고치기
            </ButtonLink>
          ) : null}
        </div>

        {work.description ? (
          <p className="mt-3 max-w-3xl text-body leading-relaxed break-keep text-gray-70">
            {work.description}
          </p>
        ) : null}

        <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <dt className="sr-only">소관 부서</dt>
            <Building2 aria-hidden className="size-4 text-gray-40" />
            <dd className="text-body-sm text-gray-70">
              {work.department.name}
            </dd>
          </div>

          <div className="flex items-center gap-2">
            <dt className="text-body-sm text-gray-60">주담당</dt>
            <dd>
              <PersonChip
                profile={work.owner}
                size="sm"
                me={work.owner.id === viewer.id}
              />
            </dd>
          </div>

          {work.due_date ? (
            <div className="flex items-center gap-2">
              <dt className="sr-only">마감</dt>
              <CalendarClock
                aria-hidden
                className={cn(
                  "size-4",
                  work.derived === "overdue"
                    ? "text-status-overdue-text"
                    : "text-gray-60",
                )}
              />
              <dd
                className={cn(
                  "text-body-sm",
                  work.derived === "overdue"
                    ? "font-bold text-status-overdue-text"
                    : "text-gray-70",
                )}
              >
                {formatDate(work.due_date)}
                {work.derived === "done"
                  ? null
                  : ` (${formatDueLabel(work.due_date)})`}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* 접근제어는 잘 돌수록 화면에 아무것도 보이지 않는다.
            여기서 규칙을 말로 적고, 같은 자리에서 시험할 수단을 함께 둔다. */}
        <VisibilityReason work={work} viewer={viewer} role={role} />

        {/* 실시간은 덧붙이는 층이다. 스크립트가 없으면 이 상자가 나타나지 않고,
            데모 모드에는 붙을 DB 자체가 없다(그리고 아무도 고치지 않는다).
            이 가드를 지우면 데모 모드에서 createClient()가 곧바로 throw 해 화면이 죽는다. */}
        {isSupabaseConfigured ? (
          <WorkLiveLazy
            workId={work.id}
            viewerId={viewer.id}
            // 화면에 그릴 세 칸만 깎아서 넘긴다. 타입으로 좁히는 것(Pick<…>)은
            // 컴파일 때의 약속일 뿐이라, 통째로 넘기면 이메일까지 페이지 원본에 실린다.
            people={work.members.map((m) => ({
              id: m.profile.id,
              name: m.profile.name,
              position: m.profile.position,
            }))}
            // 글을 쓰고 있는 사람의 화면을 남의 변경으로 갈아 끼우지 않는다.
            // 서식 문서는 자동 저장이 도는 동안에도 신호가 나가지 않으므로
            // (0018 §2-2) 여기서는 스크립트 없이 문단을 여는 경우만 세면 된다.
            editing={
              tab === "doc" && (editingId !== null || editingBlockId !== null)
            }
            // 이 화면을 서버가 그린 시각. 값이 바뀌면 화면이 새 데이터로 갈린 것이다.
            serverAt={new Date().toISOString()}
          />
        ) : null}

        {canChangeStatus ? (
          <div className="mt-5">
            <StatusChanger workId={work.id} current={work.status} />
          </div>
        ) : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        {/* ── 탭 본문 ─────────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <TabNav items={tabs} active={tab} label="업무 상세 화면" />

          <div className="pt-5">
            {tab === "doc" ? (
              // 문서는 두 갈래다. blocks 가 있으면 서식 문서(편집기), 없으면
              // 지금까지의 항목 문서. 한 업무에 문서는 하나이므로 둘이 함께
              // 서는 일은 없다 — 옮기는 것은 한 방향이고 되돌리지 않는다.
              richDoc && doc ? (
                <section aria-labelledby="doc-heading">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2
                        id="doc-heading"
                        className="text-h3 font-bold break-keep text-gray-90"
                      >
                        {docTitle(richDoc) || doc.title}
                      </h2>
                      <p className="mt-1 text-body-xs text-gray-60">
                        서식 문서 · 문단 {richDoc.blocks.length}개
                        {doc.blocks_updated_at
                          ? ` · ${formatDateTime(doc.blocks_updated_at)} 저장됨`
                          : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ButtonLink href={`/works/${work.id}/doc`} size="sm">
                        <PencilLine aria-hidden className="size-4" />
                        {/* canWrite 가 아니라 canEdit 이다. 데모 모드에서도
                            편집기는 열리고 고칠 수 있다 — 저장만 되지 않는다
                            (works/[id]/doc/page.tsx 의 canWrite 주석). */}
                        {canEdit ? "문서 편집기 열기" : "문서 크게 보기"}
                      </ButtonLink>
                      {/* 내보내기는 평범한 링크다. 스크립트가 없어도 눌린다. */}
                      <ButtonLink
                        href={`/works/${work.id}/doc/export/hwpx`}
                        variant="secondary"
                        size="sm"
                      >
                        <FileDown aria-hidden className="size-4" />
                        한/글
                      </ButtonLink>
                      <ButtonLink
                        href={`/works/${work.id}/doc/export/docx`}
                        variant="secondary"
                        size="sm"
                      >
                        <FileDown aria-hidden className="size-4" />
                        워드
                      </ButtonLink>
                    </div>
                  </div>

                  {/* 여기서는 보여 주기만 한다. A4 종이와 양옆 칸이 서려면
                      1,230px 이 드는데 이 칸에는 그 절반이 남는다 — 왜 편집을
                      다른 화면으로 옮겼는지는 doc-preview.tsx 머리말에 있다. */}
                  <DocPreview doc={richDoc} />
                </section>
              ) : (
                <DocSections
                  workId={work.id}
                  document={doc}
                  sections={sections}
                  viewer={viewer}
                  canWrite={canWrite}
                  canDelete={canOwn}
                  editingId={editingId}
                />
              )
            ) : null}

            {tab === "talk" ? (
              <>
                <CommentThread
                  workId={work.id}
                  comments={comments}
                  viewer={viewer}
                  members={work.members
                    .filter((m) => m.profile_id !== viewer.id)
                    .map((m) => m.profile)}
                />
                {/* 새 탭을 만들지 않았다. 안에서 한 대화와 밖에 물어본 것이
                    한 화면에 나란히 있어야 인계서가 둘 다 읽는다는 말이
                    화면에서도 보인다(설계 §6). */}
                <WorkNotes
                  workId={work.id}
                  threads={noteThreads}
                  viewer={viewer}
                  candidates={outsiders}
                />
              </>
            ) : null}

            {tab === "approval" ? (
              <section aria-labelledby="approval-heading">
                {/* 「내부결재문서(별지 제2호서식)입니다 …」 두 줄을 지웠다.
                    서식 이름은 결재함·기안 화면·인쇄본에 이미 있고, 「이력에
                    함께 쌓인다」는 옆 탭을 누르면 보인다. 지금 이 화면의
                    데이터에 대한 설명이 아니라 제품 철학이었다. */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2
                    id="approval-heading"
                    className="text-h3 font-bold text-gray-90"
                  >
                    결재
                  </h2>
                  {canWrite ? (
                    <ButtonLink
                      href={`/approvals/new?work=${work.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      <Stamp aria-hidden className="size-4" />
                      결재 올리기
                    </ButtonLink>
                  ) : null}
                </div>

                {approvals.length > 0 ? (
                  <ul className="divide-y divide-rule-hair overflow-hidden rounded-sm border border-rule-frame">
                    {approvals.map((a) => (
                      <ApprovalRow
                        key={a.id}
                        approval={a}
                        viewerId={viewer.id}
                        showWork={false}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-sm border border-rule-frame bg-surface">
                    <EmptyState
                      icon={Stamp}
                      title="아직 올린 결재가 없습니다"
                      description={
                        canWrite
                          ? "결재선은 부서 서열을 보고 자동으로 채워집니다."
                          : "결재를 올리려면 이 업무의 편집 권한이 있어야 합니다. 소유자는 참여자·권한 탭에 있습니다."
                      }
                      // 올릴 수 없는 사람에게도 갈 곳은 준다. 「권한이 없습니다」로
                      // 끝나면 그 화면에서 할 수 있는 일이 하나도 없다.
                      action={
                        canWrite ? (
                          <ButtonLink
                            href={`/approvals/new?work=${work.id}`}
                            variant="secondary"
                            size="sm"
                          >
                            <Stamp aria-hidden className="size-4" />
                            결재 올리기
                          </ButtonLink>
                        ) : (
                          <ButtonLink
                            href={`/works/${work.id}?tab=people`}
                            variant="secondary"
                            size="sm"
                          >
                            참여자·권한 보기
                          </ButtonLink>
                        )
                      }
                    />
                  </div>
                )}
              </section>
            ) : null}

            {tab === "history" ? (
              <div className="flex flex-col gap-8">
                <section aria-labelledby="history-heading">
                  {/* 머리 밑에 있던 「사람이 적는 기록이 아닙니다 …」 두 줄을
                      지웠다. 이력 줄마다 무엇이 무엇으로 바뀌었는지가 적혀
                      있어 목록 자체가 그 말을 한다. */}
                  <h2
                    id="history-heading"
                    className="mb-5 text-h3 font-bold text-gray-90"
                  >
                    업무 이력
                  </h2>
                  <ActivityTimeline items={activities} />
                </section>

                <section aria-labelledby="access-heading">
                  {/* 「공문서를 다루는 이상 본 사람도 기록되어야 합니다」는
                      제품의 주장이지 이 목록을 읽는 데 필요한 말이 아니다.
                      열람기록 화면(/audit)에 같은 취지가 한 번 적혀 있다.

                      다만 **누구의 기록인지**는 적어야 한다. 정책이 본인 것만
                      돌려주므로(access_log_select_self) 여기 서는 이름은 언제나
                      나 하나인데, 제목이 「열람기록」이면 「이 업무를 아무도 안
                      열어 봤나」로 읽힌다. 없는 것과 못 보는 것은 다르다. */}
                  <h2
                    id="access-heading"
                    className="mb-1 text-h3 font-bold text-gray-90"
                  >
                    내 열람기록
                  </h2>
                  <p className="mb-4 text-body-sm break-keep text-gray-60">
                    내가 이 업무를 열어 본 기록입니다. 남이 열어 본 기록은
                    본인에게만 보입니다.
                  </p>
                  {accessLogs.length > 0 ? (
                    <ul className="divide-y divide-rule-hair rounded-sm border border-rule-frame bg-surface">
                      {accessLogs.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <Eye
                            aria-hidden
                            className="size-4 shrink-0 text-gray-30"
                          />
                          <span className="min-w-0 flex-1 text-body-sm text-gray-80">
                            <span className="font-bold">{l.actor?.name}</span>{" "}
                            {ACCESS_KIND_LABEL[l.kind]}
                          </span>
                          <time
                            dateTime={l.created_at}
                            className="shrink-0 text-body-xs tabular-nums text-gray-60"
                          >
                            {formatDateTime(l.created_at)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-sm border border-rule-frame bg-surface px-4 py-6 text-center text-body-sm text-gray-60">
                      이 업무를 연 기록이 아직 없습니다.
                    </p>
                  )}
                </section>
              </div>
            ) : null}

            {tab === "people" ? (
              <MemberList
                workId={work.id}
                members={work.members}
                visibility={work.visibility}
                departmentName={work.department.name}
                viewer={viewer}
                leadId={work.owner_id}
                canManage={canOwn}
                candidates={candidates}
              />
            ) : null}
          </div>
        </div>

        {/* ── 옆 ──────────────────────────────────────────────────────────── */}
        {/* main 안에 있으므로 aside(보조 랜드마크)로 두지 않는다.
            각 카드가 h2를 갖고 있어 구조는 제목으로 읽힌다. */}
        <div className="flex flex-col gap-4">
          {work.previous_year ? (
            <PreviousYearCallout
              viewer={viewer}
              previousWorkId={work.previous_year.id}
            />
          ) : null}

          <AttachmentPanel
            workId={work.id}
            attachments={attachments}
            canWrite={canWrite}
          />

          {/* 참여자·권한 탭에서는 그리지 않는다. 그 탭의 본문이 이미 같은
              사람들을 권한까지 붙여 더 자세히 보여 주고 있어서, 옆칸에 요약을
              한 벌 더 두면 한 화면에 같은 목록이 두 번 선다. 넓은 화면에서는
              좌우로, 좁은 화면에서는 위아래로 붙어 특히 눈에 띈다. */}
          {tab !== "people" ? (
            <Card>
              <CardHeader title="참여자" as="h2" />
              <ul className="divide-y divide-rule-hair">
                {work.members.slice(0, 6).map((m) => (
                  <li key={m.profile_id} className="px-5 py-3">
                    <PersonChip
                      profile={m.profile}
                      size="sm"
                      me={m.profile_id === viewer.id}
                      sub={
                        m.profile_id === work.owner_id
                          ? "주담당"
                          : m.role === "owner"
                            ? "소유"
                            : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
              {work.members.length > 6 ? (
                <div className="border-t border-rule-hair px-5 py-3">
                  <Link
                    href={`/works/${work.id}?tab=people`}
                    className="inline-flex items-center text-body-sm font-bold text-primary pointer-coarse:min-h-11"
                  >
                    참여자 {work.members.length}명 전체 보기
                  </Link>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
