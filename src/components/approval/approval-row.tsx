import Link from "next/link";
import { LinkPendingMark } from "@/components/ui/link-pending";
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
        "relative border-l-4 bg-surface px-4 py-4 sm:px-5",
        // 누르는 즉시 칠해지고(:active — 자바스크립트 대기 없음),
        // 이동이 끝날 때까지 흐려진다(안쪽 LinkPendingMark 가 표식을 심는다).
        "transition-colors duration-150 active:bg-primary-5",
        "has-[[data-link-pending]]:opacity-55 has-[[data-link-pending]]:transition-opacity",
        mine ? "border-l-primary" : "border-l-transparent",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ApprovalBadge state={approval.state} steps={approval.steps} size="sm" />
        <span className="text-body-xs font-bold text-gray-60">
          {APPROVAL_FORM_LABEL[approval.form]}
        </span>
        {/* 대외비는 황토색 칩이었다. 색을 걷어내되 다른 칩에 묻히면 안 되는
            표시라, 색 대신 **뒤집는다** — 짙은 바탕에 흰 글자. 뒤집기는 색을
            한 개도 쓰지 않으면서 눈에 띄는 유일한 수단이다. */}
        {approval.security === "confidential" ? (
          <span className="rounded-xs bg-gray-90 px-chip-x py-chip-y text-body-xs font-bold text-gray-0">
            대외비
          </span>
        ) : null}
        {/* 파랑이었다. 주황으로 옮긴다 — 이 제품에서 주황은 「내가 움직여야
            하는 것」 한 가지만 가리키기로 했고(work-card 의 임박 띠, 홈의 인계
            알림), 결재함에서 그것은 「지금 내 차례」다. 파랑은 「누를 수 있는
            것」이라 목록의 모든 줄이 이미 파랑이다. */}
        {mine && pending ? (
          <span className="inline-flex items-center gap-1 text-body-xs font-bold text-accent-text">
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

      <h3 className="mt-2 text-body font-bold break-keep text-gray-90">
        {/* 줄 전체를 누를 수 있게 늘린다. 링크는 제목 하나뿐이라 스크린리더가
            읽는 순서도 흐트러지지 않는다. */}
        {/* work-card 와 같은 규약 — 줄 전체가 판이라 밑줄이 없어도 눌리는
            것이 판으로 구분된다. 여기만 밑줄이 있으면 같은 성격의 목록인
            업무 카드·열람기록과 제목 모양이 갈린다. */}
        <Link
          href={`/approvals/${approval.id}`}
          className="after:absolute after:inset-0"
        >
          {approval.title}
          <LinkPendingMark />
        </Link>
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-gray-60">
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
