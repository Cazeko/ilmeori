import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  EyeOff,
  FileDown,
  FileQuestion,
  Send,
  Trash2,
} from "lucide-react";
import {
  ApprovalDecision,
  ApprovalWithdraw,
} from "@/components/approval/approval-decision";
import {
  ApprovalGrid,
  ApprovalOpinions,
} from "@/components/approval/approval-grid";
import { ApprovalBadge } from "@/components/approval/approval-badge";
import { ApprovalLineEditor } from "@/components/approval/approval-line-editor";
import { ApprovalDraftForm } from "@/components/approval/approval-draft-form";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { CARD_SURFACE, Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { deleteApproval, submitApproval } from "@/lib/actions/approvals";
import { myTurn } from "@/lib/approval";
import { getApproval, listApprovals, listProfiles } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { formatDate, formatFullDateTime } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import {
  APPROVAL_FORM_LABEL,
  APPROVAL_KIND_LABEL,
  APPROVAL_STATE_LABEL,
} from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/approvals/[id]">): Promise<Metadata> {
  const viewer = await requireViewer();
  const { id } = await params;
  const approval = await getApproval(viewer, id);
  return { title: approval?.title ?? "찾을 수 없습니다" };
}

/**
 * 결재 문서 한 장.
 *
 * 이 화면이 답하는 것은 세 가지다 — 무엇을 결재하는가(본문), 누가 어디까지
 * 봤는가(결재란), 그래서 지금 내가 무엇을 하면 되는가(아래 상자).
 *
 * 서명 버튼은 **차례일 때만** 그린다. 눌리지 않는 버튼을 보여 주느니 없는 편이
 * 낫고, 차례가 아닌 이유는 그 자리에 글자로 적는다.
 */
export default async function ApprovalDetailPage({
  params,
  searchParams,
}: PageProps<"/approvals/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;

  const approval = await getApproval(viewer, id);

  // 볼 수 없는 문서와 없는 문서를 구분하지 않는다. 업무에서 하는 것과 같은
  // 판단이고, 이유도 같다 — 「권한이 없습니다」는 그 문서가 있다는 뜻이 된다.
  // notFound() 를 쓰지 않는 이유는 work-not-found.tsx 에 적어 두었다.
  if (!approval) {
    return (
      <PageContainer width="doc">
        <PageHeader title="결재 문서를 찾을 수 없습니다" />
        <Card className="max-w-2xl">
          <CardBody className="py-8">
            <FileQuestion aria-hidden className="size-9 text-gray-30" />
            <p className="mt-4 text-body leading-relaxed break-keep text-gray-90">
              이 주소의 결재 문서가 <strong className="font-bold">없거나</strong>,
              지금 계정에 <strong className="font-bold">보이지 않습니다.</strong>
            </p>
            <p className="mt-4 text-body-sm leading-relaxed break-keep text-gray-60">
              기안 중인 문서는 기안자만 봅니다. 상신된 뒤에는 그 업무를 볼 수 있는
              사람과 결재선에 이름이 있는 사람이 봅니다.
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

  const isDrafter = approval.drafter_id === viewer.id;
  const drafting = approval.state === "drafting";
  const turn = myTurn(approval, approval.steps, viewer.id);

  // 기안 중일 때만 결재선을 짤 수 있다. 그때 필요한 것 둘을 함께 가져온다.
  const [people, sources] = await Promise.all([
    drafting && isDrafter && canMutate ? listProfiles() : Promise.resolve([]),
    drafting && isDrafter && canMutate
      ? listApprovals(viewer, 30)
      : Promise.resolve([]),
  ]);

  return (
    <PageContainer width="doc">
      <nav aria-label="현재 위치" className="mb-4">
        <ol className="flex items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link href="/approvals" className="inline-flex items-center font-bold transition-colors duration-150 hover:text-primary pointer-coarse:min-h-11">
              결재함
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="min-w-0">
            <span className="line-clamp-1 text-gray-60">{approval.title}</span>
          </li>
        </ol>
      </nav>

      <ActionFeedback msg={sp.msg} className="mb-4" />

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <ApprovalBadge state={approval.state} steps={approval.steps} />
          <span className="text-body-xs font-bold text-gray-60">
            {APPROVAL_FORM_LABEL[approval.form]}
          </span>
          {/* 결재함 목록(approval-row.tsx)의 같은 칩과 **같은 모양이어야 한다.**
              목록에서 짙게 뒤집힌 칩이 상세에서 황토색이면 같은 표시로 안 읽힌다. */}
          {approval.security === "confidential" ? (
            <span className="rounded-xs bg-gray-90 px-chip-x py-chip-y text-body-xs font-bold text-gray-0">
              대외비
            </span>
          ) : null}
          {approval.doc_no ? (
            <span className="text-body-xs tabular-nums text-gray-60">
              {approval.doc_no}
            </span>
          ) : (
            <span className="text-body-xs text-gray-60">
              문서번호 없음. 상신할 때 붙습니다
            </span>
          )}
        </div>

        {/* 좁은 화면에서는 한 단 내린다. page-header.tsx 는 처음부터
            `text-h2 sm:text-h1` 인데 이 화면만 h1 고정이라, 320px 에서 제목이
            두 줄이 되고 그만큼 결재란이 아래로 밀렸다. 화면마다 제목이 다른
            규칙으로 줄어들면 그건 규칙이 아니다. */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 text-h2 leading-snug font-bold break-keep text-gray-90 sm:text-h1">
            {approval.title}
          </h1>
          {/* 「온나라로 넘기기」는 상신된 뒤에만 열린다. 기안 중인 문서에는
              문서번호도 서명도 없어서, 그 상태로 나간 종이는 결재를 받은
              문서처럼 보인다(exportBlockReason 이 같은 판정을 한 번 더 한다). */}
          {!drafting ? (
            <ButtonLink
              href={`/approvals/${approval.id}/export`}
              variant="secondary"
              size="sm"
              className="shrink-0"
            >
              <FileDown aria-hidden className="size-4" />
              온나라로 넘기기
            </ButtonLink>
          ) : null}
        </div>

        <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm">
          <div className="flex items-center gap-2">
            <dt className="text-gray-60">기안</dt>
            <dd className="text-gray-90">
              {approval.drafter.name} {approval.drafter.position} ·{" "}
              {formatDate(approval.created_at)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-gray-60">업무</dt>
            <dd className="min-w-0 text-gray-90">
              {approval.work ? (
                <Link
                  href={`/works/${approval.work.id}?tab=approval`}
                  /* 과녁이 19px 였다 — <dd> 안에 홀로 선 링크라 2.5.8 의
                     인라인 예외에 걸리지 않는다(AA 는 24×24). 보이는 글자
                     크기는 그대로 두고 눌리는 높이만 벌린다. */
                  className="inline-flex min-h-11 items-center font-bold text-primary"
                >
                  {approval.work.title}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 text-gray-60">
                  <EyeOff aria-hidden className="size-3.5" />
                  열람 권한이 없는 업무
                </span>
              )}
            </dd>
          </div>
          {approval.retention ? (
            <div className="flex items-center gap-2">
              <dt className="text-gray-60">보존연한</dt>
              <dd className="text-gray-90">{approval.retention}년</dd>
            </div>
          ) : null}
          {approval.closed_at ? (
            <div className="flex items-center gap-2">
              <dt className="text-gray-60">
                {APPROVAL_STATE_LABEL[approval.state]}
              </dt>
              <dd className="text-gray-90">
                {formatFullDateTime(approval.closed_at)}
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      {/* ── 결재란 — 이 화면의 「문서」 ──────────────────────────────────
          결재 문서를 열었을 때 먼저 답해야 하는 물음은 「무엇을 결재하는가」가
          아니라 **「누가 어디까지 봤고 지금 누구 차례인가」**다. 종이 결재에서
          사람이 제일 먼저 보는 것도 오른쪽 위의 결재란이다.

          문서 등급으로 감싼다 — 흰 종이에 위쪽 2px 먹선. 안의 ApprovalGrid 는
          원래부터 종이 언어(검은 괘선·각진 칸)로 그려져 있었으므로, 껍데기가
          그제야 안쪽과 같은 말을 하게 된다. */}
      <section aria-labelledby="approval-grid-heading" className="mb-6">
        <div data-rank="doc" className={cn(CARD_SURFACE.doc, "p-6")}>
          <h2
            id="approval-grid-heading"
            className="mb-4 text-h3 font-bold text-gray-90"
          >
            결재란
          </h2>
          <ApprovalGrid
            steps={approval.steps}
            state={approval.state}
            viewerId={viewer.id}
          />
          <p className="mt-3 text-body-xs break-keep text-gray-60">
            직위는 <strong className="font-bold">서명 당시의 것</strong>이 그대로
            남습니다. 인사이동이 있어도 옛 문서의 결재란은 바뀌지 않습니다.
          </p>
        </div>
      </section>

      {/* ── 본문 ───────────────────────────────────────────────────────── */}
      {drafting && isDrafter && canMutate ? (
        <Card className="mb-6">
          <CardHeader
            title="문서 고치기"
            description="상신하면 본문이 얼어붙습니다. 서명한 사람이 읽지 않은 글에 서명한 것이 되면 그건 위조이기 때문입니다."
          />
          <CardBody>
            <ApprovalDraftForm approval={approval} />
          </CardBody>
        </Card>
      ) : (
        <section aria-labelledby="approval-body-heading" className="mb-6">
          <h2
            id="approval-body-heading"
            className="mb-2 text-h3 font-bold text-gray-90"
          >
            본문
          </h2>
          <div className="rounded-sm border border-rule-frame bg-surface px-5 py-4">
            {approval.body ? (
              <p className="text-body leading-relaxed break-keep whitespace-pre-wrap text-gray-90">
                {approval.body}
              </p>
            ) : (
              <p className="text-body-sm text-gray-60">본문이 비어 있습니다.</p>
            )}
          </div>
        </section>
      )}

      <ApprovalOpinions steps={approval.steps} />

      {/* ── 지금 할 일 ──────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-col gap-4">
        {turn ? (
          canMutate ? (
            <ApprovalDecision approvalId={approval.id} step={turn} />
          ) : (
            // 데모 모드에서도 「지금 내 차례」라는 사실은 말해 준다. 서명 상자만
            // 감추고 아무 말도 하지 않으면, 결재함이 「대기 1건」이라고 해 놓고
            // 열어 보면 아무것도 없는 화면이 된다.
            <Notice tone="info" title="지금 내 차례입니다">
              {APPROVAL_KIND_LABEL[turn.kind]}란에 서명하거나 반려할 차례입니다.
              데이터베이스에 연결되지 않은 상태에서는 서명할 수 없습니다.
              서명은 절차(sign_approval)로만 찍히고, 그 절차는 DB 안에 있습니다.
            </Notice>
          )
        ) : null}

        {drafting && isDrafter && canMutate ? (
          <>
            <Card>
              <CardHeader
                title="결재선"
                description="기안자 위로 훑어 자동으로 채웠습니다. 확인하고 고친 뒤 상신해 주세요."
              />
              <CardBody>
                <ApprovalLineEditor
                  approval={approval}
                  people={people}
                  sources={sources.filter(
                    (s) => s.id !== approval.id && s.steps.length > 1,
                  )}
                />
              </CardBody>
            </Card>

            <div className="rounded-sm border border-primary/30 bg-primary-5 px-5 py-4">
              <p className="text-body-sm font-bold text-gray-90">상신</p>
              <p className="mt-1 mb-3 text-body-sm break-keep text-gray-60">
                상신하면 문서번호가 붙고 기안란에 서명이 찍힙니다. 그때부터
                본문은 고칠 수 없고, 결재선에 칸을 더하거나 뺄 수도 없습니다.
              </p>
              <form action={submitApproval}>
                <input type="hidden" name="approvalId" value={approval.id} />
                {/* 되돌릴 수 없는 동작에는 **무슨 일이 벌어지는 중인지**를
                    글로 준다. 흐려지기만 하면 「눌리긴 했나」로 읽히고, 바로 위
                    문단이 「그때부터 본문은 고칠 수 없습니다」라고 적어 둔
                    자리에서 그 물음은 비싸다. (ui/submit-button.tsx) */}
                <SubmitButton pendingLabel="상신하는 중…">
                  <Send aria-hidden className="size-4" />
                  상신합니다
                </SubmitButton>
              </form>
            </div>

            <details className="rounded-sm border border-rule-frame bg-surface">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-90">
                <Trash2 aria-hidden className="size-4 shrink-0 text-gray-40" />
                이 초안을 지우려면
              </summary>
              <div className="border-t border-rule-hair px-4 py-4">
                <p className="mb-3 text-body-sm leading-relaxed break-keep text-gray-60">
                  아직 상신되지 않았으므로 아무 기록도 남기지 않고 지울 수
                  있습니다. 상신한 뒤에는 지울 수 없습니다. 결재는 증빙이고,
                  지울 수 있는 증빙은 증빙이 아닙니다.
                </p>
                <form action={deleteApproval}>
                  <input type="hidden" name="approvalId" value={approval.id} />
                  <SubmitButton pendingLabel="지우는 중…" variant="secondary" size="sm">
                    <Trash2 aria-hidden className="size-4" />
                    초안 지우기
                  </SubmitButton>
                </form>
              </div>
            </details>
          </>
        ) : null}

        {approval.state === "in_progress" && isDrafter && canMutate ? (
          <ApprovalWithdraw approvalId={approval.id} />
        ) : null}

        {/* 차례가 아닌 이유를 그 자리에 적는다. 아무 말도 없으면 사용자는
            버튼을 찾다가 화면이 고장 났다고 생각한다. */}
        {!turn && approval.state === "in_progress" ? (
          <Notice tone="info" title="지금은 처리할 것이 없습니다">
            {approval.steps.some(
              (s) => s.approver_id === viewer.id && !s.signed_at && !s.rejected_at,
            )
              ? "결재선에 내 칸이 있지만 앞 순서가 아직 끝나지 않았습니다. 앞 칸이 서명되면 결재함 「대기」에 나타납니다."
              : "이 문서에서 내가 처리할 칸이 없습니다. 진행 상황은 위 결재란에서 볼 수 있습니다."}
          </Notice>
        ) : null}

        {approval.state === "rejected" ? (
          <Notice tone="danger" title="반려된 문서입니다">
            반려된 문서는 되살릴 수 없습니다. 사유를 반영해{" "}
            <strong className="font-bold">새로 기안</strong>해 주세요. 반려된
            문서와 새 문서가 각각 남아야 무엇이 어떻게 바뀌었는지 나중에 짚을 수
            있습니다.
          </Notice>
        ) : null}

        {approval.state === "withdrawn" ? (
          <Notice tone="info" title="회수된 문서입니다">
            기안자가 되가져갔습니다. 아무도 서명하지 않은 상태였으므로 결재
            효력은 없습니다. 문서 자체는 기록으로 남습니다.
          </Notice>
        ) : null}
      </div>
    </PageContainer>
  );
}
