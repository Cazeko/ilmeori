import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, EyeOff, FileQuestion, Info, Printer } from "lucide-react";
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
    title: approval ? `온나라로 넘기기 | ${approval.title}` : "찾을 수 없습니다",
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
                /* 다른 화면의 같은 마디에는 이 높이가 붙어 있는데
                   여기만 빠져 있었다 — 과녁이 20px 라 WCAG 2.5.8
                   (AA, 24×24) 아래였다. */
                className="inline-flex min-h-11 items-center line-clamp-1 hover:text-primary"
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
              <span className="text-body-xs font-bold text-gray-60">
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
            먼저 받게 하고, 단서는 그 아래 한 문단으로 줄인다.

            **이 화면에서 채우는 판은 여기 하나뿐이다.** 한동안 셋이 연달아
            섰다 — 이 상자(파랑) → 「아직 결재가 진행 중」(파랑) → 「근거는
            규칙이 골랐습니다」(주황). 정작 이 화면의 물건인 「파일에 실릴
            내용」은 그 아래 무채색 판이었다. 결재함이 같은 함정에서 빠져나온
            자리이고(「이 화면에서 가장 무거운 덩어리가 안내문이었다」),
            아래 둘은 여백 등급으로 내렸다.

            테두리는 선 굵기 축을 쓴다. `border-primary/30` 은 불투명도로
            만든 다섯 번째 선색이었고, 그런 값이 저장소에 열여섯 개 있었다. */}
        <div className="mb-5 rounded-sm border border-primary/30 bg-primary-5 px-5 py-4">
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
            <span className="inline-flex items-center gap-2 text-body-xs text-gray-60">
              <Printer aria-hidden className="size-3.5" />
              Ctrl+P 로도 같은 내용이 A4 한 벌로 나옵니다
            </span>
          </div>

          {/* 이 문장은 접지 않는다. 「이 제품이 온나라를 대체하지 않는다」는
              경계이고, 파일을 쓰는 사람이 반드시 알아야 하는 것이다.
              (tests/browser.test.mjs [9] 가 화면에 있는지 본다)

              ── 「아직 확인 못했습니다」를 걷어낸 날 ────────────────────────
              오랫동안 여기에 「한/글에서 열리는지는 아직 확인하지 못했습니다」가
              붙어 있었다. 이 저장소가 리눅스 컨테이너라 한/글이 없었고, 규격
              시험 57건이 지키는 것은 「규격대로 짜였는가」까지였기 때문이다.

              **한/글에서 열리는 것을 실물로 확인했다.** 그래서 그 문장을
              지운다 — 확인한 것을 못 했다고 적어 두는 것도 사실과 다르다.

              인쇄(A4) 폴백은 그대로 둔다. 폴백은 「안 열릴까 봐」만이 아니라
              「그 자리에 한/글이 없을 수도 있어서」 있는 것이고, 그건 여전하다. */}
          <p className="mt-3 border-t border-primary/30 pt-3 text-body-xs leading-relaxed break-keep text-gray-70">
            <strong className="font-bold text-gray-90">
              최종 결재권자의 서명은 「일머리」에서 받지 않습니다.
            </strong>{" "}
            법정 결재는 온나라의 일이고 이 파일은 거기에 올리는 초안입니다.{" "}
            <strong className="font-bold text-gray-90">
              한/글에서 열리는 것을 확인했습니다.
            </strong>{" "}
            한/글이 없는 자리에서는{" "}
            <kbd className="font-sans font-bold">Ctrl+P</kbd>로 나오는 A4 가 같은
            내용을 담습니다.
          </p>
        </div>

        {/* 아래 둘은 **여백 등급**이다. 채운 판을 이 화면에서 연달아 세 개
            쌓지 않는다 — 위 내려받기 상자 하나가 채우는 자리를 이미 썼다.
            둘 다 「지금 벌어진 일」이 아니라 「이 문서가 지금 어떤 상태인가」를
            적는 말이라, 읽히기만 하면 되지 눈에 띌 필요가 없다. */}
        {running ? (
          <p className="mb-5 flex items-start gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm break-keep text-gray-60">
            <Info aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
            <span>
              <strong className="font-bold text-gray-70">
                아직 결재가 진행 중입니다.
              </strong>{" "}
              지금 받으면 서명이 덜 찍힌 결재란이 그대로 실립니다. 빈칸은 「아직
              처리하지 않음」으로 적히므로 문서가 거짓말을 하지는 않습니다.
            </span>
          </p>
        ) : null}

        {!ex.workVisible ? (
          <p className="mb-5 flex items-start gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm break-keep text-gray-60">
            <EyeOff aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
            <span>
              <strong className="font-bold text-gray-70">
                이 계정에서는 업무 기록을 볼 수 없습니다.
              </strong>{" "}
              결재선에 이름이 있어 문서 한 장은 보이지만 연결된 업무의 기록은
              열람 권한이 없습니다. 근거 자료 항목이 비어 있는 것은{" "}
              <strong className="font-bold text-gray-70">
                없는 것이 아니라 못 보는 것
              </strong>
              이고, 파일에도 그렇게 적힙니다.
            </span>
          </p>
        ) : null}

        {/* ── 근거 집계 ───────────────────────────────────────────────────
            예전에는 이 상자가 「파일에 실릴 내용」 **아래**에 있었다. 그 카드는
            길면 화면 두세 개 분량이라, 여기까지 굴려 내려온 사람만 이 문장을
            읽었다. 그런데 이 문장이 이 화면의 주장 그 자체다 — 쌓인 기록
            서른몇 건이 문서 한 장으로 조립된다는 것.
            읽어야 할 것을 먼저 놓고, 그 다음에 실물을 보여 준다. */}
        <Notice tone="ai" title="근거는 규칙이 골랐습니다" className="mb-5">
          결재란 {ex.evidence.steps}칸 · 의견 {ex.evidence.opinions}건 · 업무
          문서 항목 {ex.evidence.sections}개 · 대화 {ex.evidence.comments}건 중{" "}
          {ex.evidence.quotedComments}건 · 첨부 {ex.evidence.attachments}건 ·
          이력 {ex.evidence.activities}건에서 뽑았습니다.{" "}
          <strong className="font-bold text-gray-90">
            어느 대화를 실을지 고르는 일은 모델이 아니라 규칙이 합니다.
          </strong>{" "}
          고른 대화는 요약하지 않고 원문 그대로 싣습니다.
        </Notice>

        <Card>
          <CardHeader title="파일에 실릴 내용" />
          <CardBody>
            <ExportBlocks blocks={ex.blocks} />
          </CardBody>
        </Card>
      </div>

      <ApprovalPrintSheet ex={ex} />
    </PageContainer>
  );
}
