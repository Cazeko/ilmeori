import Link from "next/link";
import { Building2, EyeOff, Hourglass } from "lucide-react";
import { ApprovalBadge } from "@/components/approval/approval-badge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  APPROVAL_FORM_LABEL,
  APPROVAL_KIND_LABEL,
  type ApprovalWithSteps,
} from "@/lib/types";
import { myPendingStep, stepBlockReason } from "@/lib/approval";

/**
 * 결재함 목록의 한 줄.
 *
 * 여기서 답해야 하는 질문은 하나다 — **이걸 지금 내가 처리해야 하나.**
 * 그래서 「지금 내 차례」가 가장 눈에 띄고, 제목·문서번호·업무가 뒤따른다.
 */
export function ApprovalRow({
  approval,
  viewerId,
  showWork = true,
}: {
  approval: ApprovalWithSteps;
  viewerId: string;
  /** 업무 상세 안에서는 끄다. 그 화면의 모든 줄에 같은 업무 제목이 반복된다. */
  showWork?: boolean;
}) {
  const pending = myPendingStep(approval.steps, viewerId);
  const blocked = pending
    ? stepBlockReason(pending, approval, approval.steps, viewerId)
    : "내 결재칸이 아닙니다.";
  const mine = pending !== null && blocked === null;

  return (
    <li
      className={cn(
        "relative border-l-4 bg-white px-4 py-3.5 sm:px-5",
        mine ? "border-l-primary" : "border-l-transparent",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ApprovalBadge state={approval.state} steps={approval.steps} size="sm" />
        <span className="rounded-xs bg-gray-5 px-1.5 py-0.5 text-body-xs font-bold text-gray-60">
          {APPROVAL_FORM_LABEL[approval.form]}
        </span>
        {approval.security === "confidential" ? (
          <span className="rounded-xs bg-status-review-bg px-1.5 py-0.5 text-body-xs font-bold text-status-review-text">
            대외비
          </span>
        ) : null}
        {mine && pending ? (
          <span className="inline-flex items-center gap-1 rounded-xs bg-primary-5 px-1.5 py-0.5 text-body-xs font-bold text-primary">
            <Hourglass aria-hidden className="size-3" />
            지금 내 차례 · {APPROVAL_KIND_LABEL[pending.kind]}
          </span>
        ) : null}
        {approval.doc_no ? (
          <span className="text-body-xs tabular-nums text-gray-60">
            {approval.doc_no}
          </span>
        ) : null}
      </div>

      <h3 className="mt-1.5 text-body font-bold break-keep text-gray-90">
        {/* 줄 전체를 누를 수 있게 늘린다. 링크는 제목 하나뿐이라 스크린리더가
            읽는 순서도 흐트러지지 않는다. */}
        <Link href={`/approvals/${approval.id}`} className="after:absolute after:inset-0">
          {approval.title}
        </Link>
      </h3>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-gray-60">
        {showWork ? (
          <span className="inline-flex items-center gap-1">
            <Building2 aria-hidden className="size-3.5 text-gray-40" />
            {approval.work ? (
              approval.work.title
            ) : (
              // 결재선에 이름이 있으면 업무를 못 봐도 문서 한 장은 본다(0017).
              // 그 자리를 비워 두면 화면이 고장 난 것처럼 보이므로 사실대로 적는다.
              <span className="inline-flex items-center gap-1">
                <EyeOff aria-hidden className="size-3.5" />
                열람 권한이 없는 업무
              </span>
            )}
          </span>
        ) : null}
        <span>
          기안 {approval.drafter.name} {approval.drafter.position} ·{" "}
          {formatDate(approval.created_at)}
        </span>
      </div>
    </li>
  );
}
