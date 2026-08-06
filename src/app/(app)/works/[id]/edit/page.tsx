import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { WorkForm } from "@/components/work/work-form";
import { archiveWork, restoreWork, updateWork } from "@/lib/actions/works";
import { getWork, roleIn } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/works/[id]/edit">): Promise<Metadata> {
  const viewer = await requireViewer();
  const { id } = await params;
  const work = await getWork(viewer, id);
  return { title: work ? `${work.title} 수정` : "업무 수정" };
}

/**
 * 업무 수정과 보관.
 *
 * 볼 수 없는 업무든 고칠 수 없는 업무든 똑같이 404로 답한다.
 * "권한이 없습니다"라고 답하면 그 업무가 존재한다는 사실이 새어 나가고,
 * 업무 제목 하나가 곧 사업 계획인 경우가 있다.
 *
 * 이 화면에서 바꾸는 것은 업무의 '내용'뿐이다. 공개 범위와 참여자는
 * 함께 판단해야 하는 값이라 참여자·권한 화면에 있고, 소관 부서와 주담당은
 * 인계로만 움직인다. 한 화면에서 다 되게 만들면 무엇을 바꾸고 있는지 흐려진다.
 */
export default async function EditWorkPage({
  params,
  searchParams,
}: PageProps<"/works/[id]/edit">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;

  const work = await getWork(viewer, id);
  if (!work) notFound();

  const role = roleIn(work, viewer);
  if (role !== "owner" && role !== "editor") notFound();

  const archived = Boolean(work.archived_at);

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 sm:px-7 lg:px-8">
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
            <Link
              href={`/works/${work.id}`}
              className="line-clamp-1 font-bold hover:text-primary"
            >
              {work.title}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="shrink-0 text-gray-70">수정</li>
        </ol>
      </nav>

      <PageHeader
        title="업무 수정"
        description="바꾼 내용은 이력에 남습니다. 무엇이 무엇으로 바뀌었는지까지 DB가 자동으로 기록하며, 지우거나 고칠 수 없습니다."
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {archived && work.archived_at ? (
        <Notice
          tone="warning"
          title="보관된 업무입니다"
          className="mb-4"
        >
          {formatDateTime(work.archived_at)}에 보관되어 업무 보드 목록에서
          빠져 있습니다. 내용은 그대로 남아 있고, 아래에서 보관을 해제하면 다시
          목록에 나타납니다.
        </Notice>
      ) : null}

      {!canMutate ? (
        <Notice tone="info" title="지금은 읽기 전용입니다">
          데이터베이스에 연결되지 않은 상태에서는 업무를 고칠 수 없습니다.
        </Notice>
      ) : (
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="업무 정보" />
            <CardBody>
              <WorkForm
                viewer={viewer}
                action={updateWork}
                defaultValues={{
                  id: work.id,
                  title: work.title,
                  description: work.description,
                  dueDate: work.due_date,
                  previousYearWorkId: work.previous_year_work_id,
                }}
                departmentName={work.department.name}
                departmentNote="소관 부서는 이 화면에서 바꿀 수 없습니다. 부서를 옮기는 것은 업무를 고치는 일이 아니라 책임을 옮기는 일이라, 인계·인수로만 이뤄집니다."
                submitLabel="저장"
                cancelHref={`/works/${work.id}`}
              >
                {/* 공개 범위는 참여자와 함께 봐야 판단이 된다.
                    "누가 참여자인지"를 모르는 채 범위만 넓히는 화면을 만들지 않는다. */}
                <div className="rounded-sm border border-gray-10 bg-gray-5 px-4 py-3">
                  <p className="text-body-sm font-bold text-gray-80">
                    공개 범위: {VISIBILITY_LABEL[work.visibility]}
                  </p>
                  <p className="mt-1 text-body-xs leading-relaxed break-keep text-gray-60">
                    {VISIBILITY_HINT[work.visibility]} 공개 범위와 참여자는{" "}
                    <Link
                      href={`/works/${work.id}?tab=people`}
                      className="font-bold text-primary"
                    >
                      참여자·권한
                    </Link>
                    에서 함께 바꿉니다.
                  </p>
                </div>
              </WorkForm>
            </CardBody>
          </Card>

          {/*
            보관은 소유자만 한다. DB의 work_update 정책은 편집자에게도 열려 있지만,
            보관은 내용을 고치는 일이 아니라 그 업무를 조직의 시야에서 내리는
            결정이므로 주인이 하는 편이 맞다.
          */}
          {role === "owner" ? (
            <Card>
              <CardHeader
                title={archived ? "보관 해제" : "보관"}
                as="h2"
                description={
                  archived
                    ? "다시 업무 보드 목록에 나타나게 합니다."
                    : "끝난 업무를 목록에서 내립니다. 삭제가 아닙니다."
                }
              />
              <CardBody>
                <p className="max-w-2xl text-body-sm leading-relaxed break-keep text-gray-70">
                  {archived
                    ? "보관을 해제하면 이 업무가 다시 업무 보드 목록에 나타납니다. 보관하는 동안에도 문서·대화·이력·첨부는 하나도 사라지지 않았습니다."
                    : "보관하면 업무 보드 목록에서 빠집니다. 문서·대화·이력·첨부는 그대로 남고, 이 주소로 언제든 다시 열 수 있으며 언제든 보관을 해제할 수 있습니다."}
                </p>
                <p className="mt-3 max-w-2xl text-body-sm leading-relaxed break-keep text-gray-60">
                  이 제품에는 업무를 지우는 기능이 없습니다. 지울 수 있는 감사
                  기록은 감사 기록이 아니기 때문입니다. 잘못 만든 업무도 지우는
                  대신 보관합니다.
                </p>

                <form action={archived ? restoreWork : archiveWork} className="mt-5">
                  <input type="hidden" name="workId" value={work.id} />
                  <Button type="submit" variant="secondary" size="lg">
                    {archived ? (
                      <ArchiveRestore aria-hidden className="size-4" />
                    ) : (
                      <Archive aria-hidden className="size-4" />
                    )}
                    {archived ? "보관 해제하기" : "이 업무를 보관하기"}
                  </Button>
                </form>
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
