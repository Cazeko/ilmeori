import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Eye,
  FileText,
  History,
  MessageSquare,
  Paperclip,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PersonChip } from "@/components/ui/avatar";
import { TabNav, type TabItem } from "@/components/ui/tab-nav";
import { ActivityTimeline } from "@/components/work/activity-timeline";
import { CommentThread } from "@/components/work/comment-thread";
import { DocSections } from "@/components/work/doc-sections";
import { MemberList } from "@/components/work/member-list";
import { PreviousYearCallout } from "@/components/work/previous-year-callout";
import { StatusChanger } from "@/components/work/status-changer";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatDueLabel,
} from "@/lib/format";
import {
  getAccessLogsForWork,
  getActivities,
  getAttachments,
  getComments,
  getWork,
  getWorkDocument,
  logAccess,
  roleIn,
} from "@/lib/data";
import { requireViewer } from "@/lib/session";
import { ACCESS_KIND_LABEL, VISIBILITY_LABEL } from "@/lib/types";

const TABS = ["doc", "talk", "history", "people"] as const;
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
  return { title: work?.title ?? "업무" };
}

/**
 * 업무 상세.
 *
 * 탭 넷이 각각 다른 질문에 답한다.
 *   문서   — 이 일의 내용이 무엇인가
 *   대화   — 왜 그렇게 정했는가
 *   이력   — 누가 언제 무엇을 했는가
 *   참여자 — 누가 볼 수 있는가
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
  // 볼 수 없는 업무도 404로 답한다. 403으로 답하면 "그 업무는 있다"는 정보가 샌다.
  if (!work) notFound();

  const tab = parseTab(sp.tab);
  const role = roleIn(work, viewer);
  const canWrite = role === "owner" || role === "editor";

  // 한 화면에 필요한 것을 한꺼번에 가져온다. 순서대로 기다리면 왕복이 그만큼 쌓인다.
  const [{ document: doc, sections }, comments, activities, attachments, accessLogs] =
    await Promise.all([
      getWorkDocument(work.id),
      getComments(work.id),
      getActivities(work.id),
      getAttachments(work.id),
      getAccessLogsForWork(work.id),
    ]);

  // 누가 열어 봤는지 남긴다. 사용자에게는 이 표에 쓰기 권한이 없고,
  // 서버의 지정된 함수만 기록할 수 있다.
  await logAccess(work.id, "work.viewed");

  const tabs: TabItem[] = [
    {
      key: "doc",
      label: "문서",
      href: `/works/${work.id}?tab=doc`,
      icon: FileText,
      count: sections.length,
    },
    {
      key: "talk",
      label: "대화",
      href: `/works/${work.id}?tab=talk`,
      icon: MessageSquare,
      count: comments.length,
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
    <div className="px-5 py-6 sm:px-7 lg:px-8">
      {/* ── 위치 ─────────────────────────────────────────────────────────── */}
      <nav aria-label="현재 위치" className="mb-4">
        <ol className="flex items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link href="/works" className="font-bold hover:text-primary">
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

      {/* ── 머리 ─────────────────────────────────────────────────────────── */}
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={work.derived} />
          <span className="text-body-xs text-gray-60">
            {work.fiscal_year}년도 · {VISIBILITY_LABEL[work.visibility]}
          </span>
        </div>

        <h1 className="mt-2.5 text-h2 leading-snug font-bold break-keep text-gray-90">
          {work.title}
        </h1>

        {work.description ? (
          <p className="mt-3 max-w-3xl text-body leading-relaxed break-keep text-gray-70">
            {work.description}
          </p>
        ) : null}

        <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">소관 부서</dt>
            <Building2 aria-hidden className="size-4 text-gray-40" />
            <dd className="text-body-sm text-gray-70">{work.department.name}</dd>
          </div>

          <div className="flex items-center gap-2">
            <dt className="text-body-sm text-gray-60">주담당</dt>
            <dd>
              <PersonChip profile={work.owner} size="sm" />
            </dd>
          </div>

          {work.due_date ? (
            <div className="flex items-center gap-1.5">
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
                {work.derived === "done" ? null : ` (${formatDueLabel(work.due_date)})`}
              </dd>
            </div>
          ) : null}
        </dl>

        {canWrite ? (
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
              <DocSections document={doc} sections={sections} />
            ) : null}

            {tab === "talk" ? (
              <CommentThread
                workId={work.id}
                comments={comments}
                viewer={viewer}
              />
            ) : null}

            {tab === "history" ? (
              <div className="flex flex-col gap-8">
                <section aria-labelledby="history-heading">
                  <h2
                    id="history-heading"
                    className="mb-1 text-h3 font-bold text-gray-90"
                  >
                    업무 이력
                  </h2>
                  <p className="mb-5 max-w-2xl text-body-sm break-keep text-gray-60">
                    사람이 적는 기록이 아닙니다. 업무를 고치면 DB가 자동으로
                    남기며, 사용자에게는 이 기록을 지우거나 고칠 권한이 없습니다.
                  </p>
                  <ActivityTimeline items={activities} />
                </section>

                <section aria-labelledby="access-heading">
                  <h2
                    id="access-heading"
                    className="mb-1 text-h3 font-bold text-gray-90"
                  >
                    열람기록
                  </h2>
                  <p className="mb-4 max-w-2xl text-body-sm break-keep text-gray-60">
                    이 업무를 누가 열어 봤는지도 남습니다. 공문서를 다루는 이상
                    &lsquo;고친 사람&rsquo;만큼 &lsquo;본 사람&rsquo;도 기록되어야
                    합니다.
                  </p>
                  {accessLogs.length > 0 ? (
                    <ul className="divide-y divide-gray-5 rounded-md border border-gray-10 bg-white">
                      {accessLogs.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <Eye aria-hidden className="size-4 shrink-0 text-gray-30" />
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
                    <p className="rounded-md border border-gray-10 bg-white px-4 py-6 text-center text-body-sm text-gray-60">
                      아직 열람기록이 없습니다.
                    </p>
                  )}
                </section>
              </div>
            ) : null}

            {tab === "people" ? (
              <MemberList
                members={work.members}
                visibility={work.visibility}
                departmentName={work.department.name}
                viewer={viewer}
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

          <Card>
            <CardHeader title="첨부" as="h2" />
            {attachments.length > 0 ? (
              <ul className="divide-y divide-gray-5">
                {attachments.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <p className="flex items-start gap-2">
                      <Paperclip
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0 text-gray-40"
                      />
                      <span className="min-w-0 text-body-sm font-bold break-all text-gray-80">
                        {a.file_name}
                      </span>
                    </p>
                    <p className="mt-1 pl-5.5 text-body-xs text-gray-60">
                      {a.uploader.name} · {formatBytes(a.byte_size)} ·{" "}
                      {formatDateTime(a.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-body-sm text-gray-60">첨부된 파일이 없습니다.</p>
              </CardBody>
            )}
            <div className="border-t border-gray-10 bg-gray-5 px-4 py-2.5">
              <p className="text-body-xs leading-relaxed text-gray-60">
                파일은 공개 URL이 없는 비공개 저장소에 있습니다. 내려받을 때마다
                권한을 확인하고 짧은 유효기간의 링크를 발급합니다.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="참여자" as="h2" />
            <ul className="divide-y divide-gray-5">
              {work.members.slice(0, 6).map((m) => (
                <li key={m.profile_id} className="px-4 py-2.5">
                  <PersonChip
                    profile={m.profile}
                    size="sm"
                    sub={m.role === "owner" ? "주담당" : undefined}
                  />
                </li>
              ))}
            </ul>
            {work.members.length > 6 ? (
              <div className="border-t border-gray-10 px-4 py-2.5">
                <Link
                  href={`/works/${work.id}?tab=people`}
                  className="text-body-sm font-bold text-primary"
                >
                  참여자 {work.members.length}명 전체 보기
                </Link>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
