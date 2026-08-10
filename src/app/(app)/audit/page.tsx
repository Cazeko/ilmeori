import type { Metadata } from "next";
import Link from "next/link";
import { Download, Eye, FileText, ScrollText, ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import { listAccessLogs } from "@/lib/data";
import { getViewerDepartmentName, requireViewer } from "@/lib/session";
import { ACCESS_KIND_LABEL, type AccessKind } from "@/lib/types";

export const metadata: Metadata = { title: "열람기록" };

const KIND_ICON: Record<AccessKind, typeof Eye> = {
  "work.viewed": Eye,
  "document.viewed": FileText,
  "attachment.downloaded": Download,
};

/**
 * 열람기록.
 *
 * 공문서를 다루는 시스템에서 "누가 고쳤는가"만 남기는 것으로는 부족하다.
 * 유출 사고에서 실제로 묻는 것은 "누가 열어 봤는가"다.
 *
 * 이 표는 사용자가 손댈 수 없다. INSERT 권한 자체를 주지 않았고,
 * 기록은 SECURITY DEFINER 함수만 남긴다. 지우거나 고칠 방법이 없다는 것이
 * 이 화면의 핵심이다.
 */
export default async function AuditPage() {
  const viewer = await requireViewer();
  const [logs, departmentName] = await Promise.all([
    listAccessLogs(viewer),
    getViewerDepartmentName(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="열람기록"
        description={`${departmentName ?? ""} 소속으로 볼 수 있는 업무에 대한 열람기록입니다. 볼 수 없는 업무의 기록은 이 목록에도 나타나지 않습니다.`}
      />

      <Notice
        tone="info"
        title="이 기록은 지울 수 없습니다"
        className="mb-5"
      >
        사용자 계정에는 이 표에 대한 쓰기 권한이 없습니다. 기록은 서버의 지정된
        함수만 남길 수 있고, 화면을 우회해 직접 요청을 보내도 추가·수정·삭제가
        되지 않습니다. 감사 기록이 당사자의 손에 있으면 기록이 아니기 때문입니다.
      </Notice>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader
            title="최근 열람"
            description={`${logs.length}건`}
            as="h2"
          />
          {logs.length > 0 ? (
            <ul className="divide-y divide-gray-5">
              {logs.map((l) => {
                const Icon = KIND_ICON[l.kind];
                return (
                  <li key={l.id} className="flex items-start gap-3 px-5 py-3">
                    {l.actor ? (
                      <Avatar profile={l.actor} className="mt-0.5" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm text-gray-80">
                        <span className="font-bold text-gray-90">
                          {l.actor?.name ?? "알 수 없음"}
                        </span>
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded-xs bg-gray-5 px-1.5 py-0.5 text-body-xs font-bold text-gray-60">
                          <Icon aria-hidden className="size-3" />
                          {ACCESS_KIND_LABEL[l.kind]}
                        </span>
                      </p>
                      {l.work ? (
                        <p className="mt-1 min-w-0">
                          <Link
                            href={`/works/${l.work.id}`}
                            className="line-clamp-1 text-body-sm text-gray-60 hover:text-primary"
                          >
                            {l.work.title}
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    <time
                      dateTime={l.created_at}
                      title={formatFullDateTime(l.created_at)}
                      className="shrink-0 text-body-xs tabular-nums text-gray-60"
                    >
                      {formatDateTime(l.created_at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ScrollText}
              title="열람기록이 없습니다"
              description="볼 수 있는 업무를 누군가 열어 보면 여기에 쌓입니다."
            />
          )}
        </Card>

        <div>
          <Card>
            <CardHeader title="기록되는 것" as="h2" />
            <CardBody>
              <ul className="flex flex-col gap-3.5">
                {(Object.keys(ACCESS_KIND_LABEL) as AccessKind[]).map((kind) => {
                  const Icon = KIND_ICON[kind];
                  return (
                    <li key={kind} className="flex gap-2.5">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-gray-40" />
                      <div>
                        <p className="text-body-sm font-bold text-gray-90">
                          {ACCESS_KIND_LABEL[kind]}
                        </p>
                        <p className="mt-0.5 text-body-xs break-keep text-gray-60">
                          {KIND_DESC[kind]}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
            <div className="flex items-start gap-2 border-t border-gray-10 bg-gray-5 px-5 py-3.5">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-gray-40" />
              <p className="text-body-xs leading-relaxed break-keep text-gray-60">
                기록에는 사람과 시각, 대상 업무만 남깁니다. 접속 IP나 단말 정보는
                수집하지 않습니다. 필요 이상으로 모으면 그 자체가 유출 대상이
                됩니다.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

const KIND_DESC: Record<AccessKind, string> = {
  "work.viewed": "업무 상세 화면을 연 것",
  "document.viewed": "업무에 붙은 문서 본문을 읽은 것",
  "attachment.downloaded": "첨부파일을 내려받은 것. 유출 조사에서 가장 먼저 보는 기록입니다.",
};
