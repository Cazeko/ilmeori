import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, FileQuestion, Printer } from "lucide-react";
import { ApprovalBadge } from "@/components/approval/approval-badge";
import { ApprovalPrintSheet } from "@/components/approval/approval-print-sheet";
import { ExportBlocks } from "@/components/approval/export-blocks";
import { PrintButton } from "@/components/handover/print-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { buildApprovalExport, exportBlockReason } from "@/lib/approval-export";
import { getApproval } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { APPROVAL_FORM_LABEL } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/approvals/[id]/export">): Promise<Metadata> {
  const viewer = await requireViewer();
  const { id } = await params;
  const approval = await getApproval(viewer, id);
  return {
    title: approval ? `온나라로 넘기기 — ${approval.title}` : "찾을 수 없습니다",
  };
}

/**
 * 「온나라로 넘기기」.
 *
 * 계획서 §6의 화면이다. 하는 일은 하나 — **결재가 끝난 문서를 한/글 파일로
 * 떨어뜨리되, 문장마다 어느 기록에서 나왔는지를 함께 싣는다.**
 *
 * 이것이 온나라에도, 브리티웍스에도, 네이버웍스에도 없는 화면이다.
 * 그 셋은 결재를 받는 곳이지 결재의 근거가 쌓이는 곳이 아니라서,
 * 「이 문장은 어디서 나왔느냐」에 답할 재료를 애초에 갖고 있지 않다.
 *
 * ── 이 화면이 셋을 한꺼번에 내놓는 이유 ────────────────────────────────────
 *
 *   화면   지금 무엇이 실리는지 눈으로 확인한다
 *   파일   한/글(.hwpx)로 내려받아 온나라에 올린다
 *   종이   Ctrl+P — **파일이 안 열릴 때의 폴백**(계획서 §5.3)
 *
 * 셋이 같은 모델(ApprovalExport)에서 나온다. 하나라도 다른 말을 하면
 * 근거를 붙이려고 만든 장치가 그 자리에서 거짓이 된다.
 */
export default async function ApprovalExportPage({
  params,
}: PageProps<"/approvals/[id]/export">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const approval = await getApproval(viewer, id);

  // 볼 수 없는 문서와 없는 문서를 구분하지 않는다. 문서 화면과 같은 판단이다.
  if (!approval) {
    return (
      <PageContainer width="doc">
        <PageHeader title="결재 문서를 찾을 수 없습니다" />
        <Card className="max-w-2xl">
          <CardBody className="py-8">
            <FileQuestion aria-hidden className="size-9 text-gray-30" />
            <p className="mt-4 text-body leading-relaxed break-keep text-gray-80">
              이 주소의 결재 문서가 <strong className="font-bold">없거나</strong>
              , 지금 계정에 <strong className="font-bold">보이지 않습니다.</strong>
            </p>
            <div className="mt-6">
              <ButtonLink href="/approvals" variant="primary" size="sm">
                결재함으로
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </PageContainer>
    );
  }

  const blocked = exportBlockReason(approval);
  if (blocked) {
    return (
      <PageContainer width="doc">
        <PageHeader title="아직 내보낼 수 없습니다" />
        <Notice tone="warning" title="상신한 뒤에 내보낼 수 있습니다">
          {blocked} 결재 문서로 나가는 종이와 파일에는 문서번호와 결재란이
          찍힙니다. 아무도 서명하지 않은 초안이 그 모양으로 나가면, 결재를 받은
          문서처럼 보입니다.
        </Notice>
        <div className="mt-4">
          <ButtonLink href={`/approvals/${approval.id}`} variant="secondary" size="sm">
            문서로 돌아가기
          </ButtonLink>
        </div>
      </PageContainer>
    );
  }

  const ex = await buildApprovalExport(approval);
  const running = approval.state === "in_progress";

  return (
    <PageContainer width="doc">
      {/* 화면용은 인쇄에서 통째로 빠진다. 종이는 아래 ApprovalPrintSheet 한 벌뿐이다. */}
      <div className="print:hidden">
        <nav aria-label="현재 위치" className="mb-4">
          <ol className="flex items-center gap-1 text-body-xs text-gray-60">
            <li>
              <Link href="/approvals" className="inline-flex items-center font-bold hover:text-primary pointer-coarse:min-h-11">
                결재함
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li className="min-w-0">
              <Link
                href={`/approvals/${approval.id}`}
                className="line-clamp-1 hover:text-primary"
              >
                {approval.title}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li className="text-gray-70">온나라로 넘기기</li>
          </ol>
        </nav>

        <PageHeader
          title="온나라로 넘기기"
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <ApprovalBadge state={approval.state} steps={approval.steps} />
              <span className="rounded-xs bg-gray-5 px-1.5 py-0.5 text-body-xs font-bold text-gray-60">
                {APPROVAL_FORM_LABEL[approval.form]}
              </span>
              <span className="text-body-xs tabular-nums text-gray-60">
                {ex.docNo}
              </span>
              <span className="text-body-xs text-gray-60">
                기안 {formatDate(approval.created_at)}
              </span>
            </div>
          }
        />

        {/* ── 내려받기 ───────────────────────────────────────────────────
            예전에는 이 단추 하나를 설명 상자 다섯 개가 둘러싸고 있었다.
            먼저 받게 하고, 단서는 그 아래 한 문단으로 줄인다. */}
        <div className="mb-5 rounded-md border border-primary/30 bg-primary-5 px-5 py-4">
          <p className="mb-3 text-body-sm font-bold text-gray-90">
            한/글 파일로 내려받기
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* 링크다. 자바스크립트 없이 눌러도 내려받아진다. */}
            <ButtonLink
              href={`/approvals/${approval.id}/export/hwpx`}
              prefetch={false}
              /* 화면이 갈리지 않는 주소다 — 자리표시가 켜지면 안 된다. */
              data-download=""
            >
              <Download aria-hidden className="size-4" />
              한/글 파일(.hwpx)
            </ButtonLink>
            <PrintButton />
            <span className="inline-flex items-center gap-1.5 text-body-xs text-gray-60">
              <Printer aria-hidden className="size-3.5" />
              Ctrl+P 로도 같은 내용이 A4 한 벌로 나옵니다
            </span>
          </div>

          {/* 이 두 문장은 접지 않는다. 하나는 「이 제품이 온나라를 대체하지
              않는다」는 경계이고, 다른 하나는 「한/글에서 열리는지 아직 확인하지
              못했다」는 고백이다. 접어 두면 궁금한 사람만 읽게 되는데, 이건
              읽지 않고 파일을 쓰는 사람이 반드시 알아야 하는 것이다.
              (tests/browser.test.mjs [9] 가 둘 다 화면에 있는지 본다) */}
          <p className="mt-3 border-t border-primary/20 pt-3 text-body-xs leading-relaxed break-keep text-gray-70">
            <strong className="font-bold text-gray-90">
              최종 결재권자의 서명은 「일머리」에서 받지 않습니다.
            </strong>{" "}
            법정 결재는 온나라의 일이고 이 파일은 거기에 올리는 초안입니다. 또
            한/글에서 열리는지는 아직 확인하지 못했습니다 — 열리지 않으면{" "}
            <kbd className="font-sans font-bold">Ctrl+P</kbd>로 나오는 A4 가 같은
            내용을 담고 있습니다.
          </p>
        </div>

        {running ? (
          <Notice tone="info" title="아직 결재가 진행 중입니다" className="mb-5">
            지금 받으면 서명이 덜 찍힌 결재란이 그대로 실립니다. 빈칸은 「아직
            처리하지 않음」으로 적히므로 문서가 거짓말을 하지는 않습니다.
          </Notice>
        ) : null}

        {!ex.workVisible ? (
          <Notice tone="info" title="이 계정에서는 업무 기록을 볼 수 없습니다" className="mb-5">
            결재선에 이름이 있어 문서 한 장은 보이지만 연결된 업무의 기록은 열람
            권한이 없습니다. 근거 자료 항목이 비어 있는 것은{" "}
            <strong className="font-bold">없는 것이 아니라 못 보는 것</strong>
            이고, 파일에도 그렇게 적힙니다.
          </Notice>
        ) : null}

        <Card>
          <CardHeader title="파일에 실릴 내용" />
          <CardBody>
            <ExportBlocks blocks={ex.blocks} />
          </CardBody>
        </Card>

        <Notice tone="ai" title="근거는 규칙이 골랐습니다" className="mt-5">
          결재란 {ex.evidence.steps}칸 · 의견 {ex.evidence.opinions}건 · 업무
          문서 항목 {ex.evidence.sections}개 · 대화 {ex.evidence.comments}건 중{" "}
          {ex.evidence.quotedComments}건 · 첨부 {ex.evidence.attachments}건 ·
          이력 {ex.evidence.activities}건에서 뽑았습니다.{" "}
          <strong className="font-bold text-gray-90">
            어느 대화를 실을지 고르는 일은 모델이 아니라 규칙이 합니다.
          </strong>{" "}
          모델이 고르면 왜 골랐는지를 화면에 적을 수 없고, 그러면 이 꼬리표는
          아무것도 보증하지 못합니다. 고른 대화는 요약하지 않고 원문 그대로
          싣습니다.
        </Notice>
      </div>

      <ApprovalPrintSheet ex={ex} />
    </PageContainer>
  );
}
