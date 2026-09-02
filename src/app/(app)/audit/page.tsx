import type { Metadata } from "next";
import Link from "next/link";
import { Download, Eye, FileText, Lock, ScrollText, ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { CARD_SURFACE, Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
          <strong className="font-bold text-gray-90">지울 수 없습니다.</strong>
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
          <h2 id="recent-access" className="mb-3 text-h3 font-bold text-gray-90">
            최근 열람
            <span className="ml-2 text-body-sm font-normal tabular-nums text-gray-60">
              {logs.length}건
            </span>
          </h2>
          {logs.length > 0 ? (
            /* ── 목록이 아니라 표다 ────────────────────────────────────────
               이 화면의 한 줄은 **같은 칸이 매번 같은 자리에 오는 자료**다 —
               한 일 · 대상 업무 · 시각. 그걸 `<ul>` 로 그리면 보조기기에는
               「항목 40개」로만 들리고, 눈으로도 세로줄이 안 맞아 훑을 수가
               없다. 감사 화면에서 훑을 수 없다는 것은 쓸 수 없다는 뜻이다.
               `<th scope="col">` 이 붙어야 스크린리더가 칸마다 무엇인지 읽는다.

               ── 「사람」 칸을 지웠다 ──────────────────────────────────────
               한 줄에서 가장 굵은 것이 이름과 얼굴이었는데, **모든 줄이 같은
               사람이다.** 정책(access_log_select_self)이 본인 열람만 돌려주고
               목업도 `actor_id === viewer.id` 로 거른다. 목록일 때는 그냥
               반복이라 넘어갔지만, 표에서는 값이 하나뿐인 칸이 통째로 보인다.
               누구인지는 바로 위 화면 설명이 이미 한 번 말한다.

               ── 제목을 자르지 않는다 ─────────────────────────────────────
               예전에 390px 에서 업무 제목이 거의 다 잘렸다. 원인은 폭이 아니라
               `line-clamp-1` 이었다. 표에서는 칸이 여러 줄이 되어도 세로줄이
               안 흐트러지므로 그냥 접어 내린다 — 감추는 것보다 낫다. */
            <table
              aria-labelledby="recent-access"
              data-rank="doc"
              className={cn(CARD_SURFACE.doc, "w-full table-fixed")}
            >
              <thead>
                <tr className="border-b border-rule-hair">
                  <th
                    scope="col"
                    className="w-24 px-3 py-2 text-left text-body-xs font-bold text-gray-60 sm:w-32 sm:px-5"
                  >
                    한 일
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-body-xs font-bold text-gray-60 sm:px-5"
                  >
                    대상 업무
                  </th>
                  <th
                    scope="col"
                    className="w-24 px-3 py-2 text-right text-body-xs font-bold text-gray-60 sm:w-36 sm:px-5"
                  >
                    열어 본 때
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule-hair">
                {logs.map((l) => {
                  const Icon = KIND_ICON[l.kind];
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-3 align-top sm:px-5">
                        <span className="flex items-start gap-1 text-body-xs font-bold break-keep text-gray-60">
                          <Icon
                            aria-hidden
                            className="mt-1 size-3.5 shrink-0 text-gray-40"
                          />
                          {ACCESS_KIND_LABEL[l.kind]}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top sm:px-5">
                        {l.work ? (
                          /* 이 화면에서 가장 자주 눌리는 것이다 — 「무엇을
                             열어 봤는가」에서 그 무엇으로 간다. 보이는 크기는
                             그대로 두고 눌리는 높이만 벌린다. */
                          <Link
                            href={`/works/${l.work.id}`}
                            className="inline-flex items-center text-body-sm break-keep text-gray-90 pointer-coarse:min-h-11 transition-colors duration-150 hover:text-primary"
                          >
                            {l.work.title}
                          </Link>
                        ) : (
                          <span className="text-body-sm text-gray-60">
                            알 수 없는 업무
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right align-top sm:px-5">
                        <time
                          dateTime={l.created_at}
                          title={formatFullDateTime(l.created_at)}
                          className="text-body-xs tabular-nums text-gray-60"
                        >
                          {formatDateTime(l.created_at)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
