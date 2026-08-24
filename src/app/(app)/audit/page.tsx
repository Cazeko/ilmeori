import type { Metadata } from "next";
import Link from "next/link";
import { Download, Eye, FileText, Lock, ScrollText, ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { CARD_SURFACE, Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import { listAccessLogs } from "@/lib/data";
import { ACCESS_LOG_LIMIT } from "@/lib/data/types";
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
  // 상한을 **화면이 알고 있어야 한다.** 기본값에 숨어 있으면 잘린 것을 화면이
  // 말할 수가 없다(data/types.ts 의 ACCESS_LOG_LIMIT 주석).
  const logs = await listAccessLogs(viewer, ACCESS_LOG_LIMIT);
  const truncated = logs.length >= ACCESS_LOG_LIMIT;

  return (
    <PageContainer>
      {/* 이름표는 물러난다. 「열람기록」은 왼쪽 메뉴에서 이미 켜져 있고 매번
          같은 글자다 — 목록·결재함·쪽지함·알림이 전부 그렇게 하고 있는데
          이 화면만 34px 로 남아 있었다. 이 화면의 1등은 아래 기록 그 자체다. */}
      <PageHeader
        size="sm"
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

      {/* ── 「지울 수 없습니다」는 여백 등급이다 ─────────────────────────────
          한동안 이 자리가 **가로로 꽉 찬 파란 채움 판**이었다. 결재함이 같은
          함정에서 빠져나온 자리인데(「이 화면에서 가장 무거운 덩어리가 그
          안내문이었다」) 여기는 그대로였다.

          이것은 사건이 아니라 **늘 참인 상태**다. 늘 참인 것이 화면에서 가장
          무거우면 정작 보러 온 기록이 그 아래로 밀린다. 왼쪽 선 하나와 글자로
          내린다 — 결재함의 읽기 전용 안내와 같은 모양이다. */}
      <p className="mb-5 flex items-start gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm break-keep text-gray-60">
        <Lock aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
        <span>
          이 기록은{" "}
          <strong className="font-bold text-gray-70">지울 수 없습니다.</strong>
        </span>
      </p>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        {/* ── 이 화면의 「문서」 ─────────────────────────────────────────────
            기록 목록이 판 등급이었다. 증거를 보여 주겠다는 화면인데 증거가
            판이면 위계가 뜻과 어긋난다. 흰 종이 + 위쪽 2px 먹선으로 올린다.

            제목은 판 **밖**에 둔다 — 결재함·쪽지함·알림이 이미 그 모양이고,
            문서 안에 제목을 넣으면 doc 등급의 제목 크기(34px)가 딸려 와서
            화면 이름표보다 커진다. */}
        <div className="min-w-0">
          <h2 className="mb-3 text-h3 font-bold text-gray-90">
            최근 열람
            <span className="ml-2 text-body-sm font-normal tabular-nums text-gray-60">
              {logs.length}건
            </span>
          </h2>
          {logs.length > 0 ? (
            <ul
              data-rank="doc"
              className={cn(
                CARD_SURFACE.doc,
                "divide-y divide-rule-hair overflow-hidden",
              )}
            >
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
                          {/* 이 줄이 이 화면에서 가장 자주 눌리는 것이다 —
                              「무엇을 열어 봤는가」에서 그 무엇으로 간다.
                              18px 짜리 글줄 하나가 과녁이었다(실측 24px).
                              보이는 크기는 그대로 두고 눌리는 높이만 벌린다. */}
                          <Link
                            href={`/works/${l.work.id}`}
                            className="inline-flex items-center text-body-sm text-gray-60 pointer-coarse:min-h-11 hover:text-primary"
                          >
                            <span className="line-clamp-1">{l.work.title}</span>
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-sm border border-rule-frame bg-surface">
              <EmptyState
                icon={ScrollText}
                title="열람기록이 없습니다"
                description="볼 수 있는 업무를 누군가 열어 보면 여기에 쌓입니다."
              />
            </div>
          )}

          {/* 잘랐으면 말한다. 결재함·쪽지함·알림·업무 보드가 세워 둔 규약이고,
              이 화면만 그 밖에 있었다 — 하필 위에서 「지울 수 없습니다」라고
              적어 놓은 화면이다. 지울 수 없다고 하면서 조용히 감추면 그 말이
              무너진다. */}
          {truncated ? (
            <p className="mt-2 text-body-xs break-keep text-gray-60">
              최근 {ACCESS_LOG_LIMIT}건까지만 봅니다. 더 오래된 것은 그 업무의
              「이력」 탭에 그대로 남아 있습니다.
            </p>
          ) : null}
        </div>

        {/* ── 곁에 두는 것 — 여백 등급 ─────────────────────────────────────
            판 등급이었다. 왼쪽 기록과 똑같은 테두리를 두르고 있어서 둘이
            동급으로 읽혔다. 테두리를 지우면 바탕으로 물러나고, 그제야 기록이
            혼자 선다(card.tsx 의 quiet 주석). */}
        <div>
          <Card variant="quiet">
            <CardHeader variant="quiet" title="기록되는 것" as="h2" />
            <CardBody variant="quiet">
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
              <p className="mt-5 flex items-start gap-2 border-t border-rule-hair pt-4 text-body-xs leading-relaxed break-keep text-gray-60">
                <ShieldCheck aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
                <span>
                  사람·시각·대상 업무만 남깁니다. 접속 IP 와 단말 정보는 모으지
                  않습니다.
                </span>
              </p>
            </CardBody>
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
