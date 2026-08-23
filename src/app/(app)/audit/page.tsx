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
import { requireViewer } from "@/lib/session";
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
  const logs = await listAccessLogs(viewer);

  return (
    <PageContainer>
      <PageHeader
        title="열람기록"
        /* 「부서 소속으로 볼 수 있는 업무의 열람기록」이라고 적혀 있었는데,
           정책(access_log_select_self)은 **본인 열람만** 돌려준다. 화면이 정책보다
           넓게 말하고 있었던 셈이고, 그러면 「남이 내 업무를 열어 본 것도 여기
           나오나」라는 잘못된 기대가 생긴다. 정책이 하는 말을 그대로 적는다. */
        description={`${viewer.name} ${viewer.position ?? ""} 님이 열어 본 기록입니다`.replace(
          /\s+/g,
          " ",
        )}
      />

      {/* 이 자리에 네 문장이 있었다 — 쓰기 권한이 없다는 설명, 서버 함수만
          남긴다는 설명, 우회 요청도 안 된다는 설명, 남의 이력이 안 보이는
          이유. 넷 다 맞는 말인데 **제목 한 줄이 이미 그 전부를 말하고 있었다.**
          「지울 수 없습니다」를 읽은 사람이 다음에 궁금해하는 것은 구현 방식이
          아니라 자기 기록이고, 그건 바로 아래에 있다. */}
      <Notice tone="info" title="이 기록은 지울 수 없습니다" className="mb-5" />

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader
            title="최근 열람"
            description={`${logs.length}건`}
            as="h2"
          />
          {logs.length > 0 ? (
            <ul className="divide-y divide-rule-hair">
              {logs.map((l) => {
                const Icon = KIND_ICON[l.kind];
                return (
                  <li key={l.id} className="flex items-start gap-3 px-5 py-3">
                    {l.actor ? (
                      <Avatar profile={l.actor} className="mt-1" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {/* 시각을 이 줄 안으로 들였다. 예전에는 <li> 의 flex
                          자식으로 따로 서서 shrink-0 로 95px 를 붙박이로
                          가져갔고, 390px 에서 본문 칸이 159px 만 남아 업무
                          제목이 거의 전부 잘렸다 — 「누가 무엇을 열어 봤는가」를
                          읽는 화면인데 그 「무엇」이 안 읽혔다. */}
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-gray-80">
                        <span className="font-bold text-gray-90">
                          {l.actor?.name ?? "알 수 없음"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-body-xs font-bold text-gray-60">
                          <Icon aria-hidden className="size-3" />
                          {ACCESS_KIND_LABEL[l.kind]}
                        </span>
                        <time
                          dateTime={l.created_at}
                          title={formatFullDateTime(l.created_at)}
                          className="text-body-xs tabular-nums text-gray-60"
                        >
                          {formatDateTime(l.created_at)}
                        </time>
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
              <ul className="flex flex-col gap-4">
                {(Object.keys(ACCESS_KIND_LABEL) as AccessKind[]).map((kind) => {
                  const Icon = KIND_ICON[kind];
                  return (
                    <li key={kind} className="flex gap-3">
                      <Icon aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
                      <div>
                        <p className="text-body-sm font-bold text-gray-90">
                          {ACCESS_KIND_LABEL[kind]}
                        </p>
                        <p className="mt-1 text-body-xs break-keep text-gray-60">
                          {KIND_DESC[kind]}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
            <div className="flex items-start gap-2 border-t border-rule-hair bg-gray-5 px-5 py-4">
              <ShieldCheck aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
              <p className="text-body-xs leading-relaxed break-keep text-gray-60">
                사람·시각·대상 업무만 남깁니다. 접속 IP 와 단말 정보는 모으지
                않습니다.
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
  "attachment.downloaded": "첨부파일을 내려받은 것",
};
