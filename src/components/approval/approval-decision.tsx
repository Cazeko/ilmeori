import { PenLine, RotateCcw, Undo2 } from "lucide-react";
import {
  rejectApproval,
  signApproval,
  withdrawApproval,
} from "@/lib/actions/approvals";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Textarea } from "@/components/ui/field";
import {
  APPROVAL_KIND_LABEL,
  APPROVAL_OPINION_MAX,
  type ApprovalStepWithApprover,
} from "@/lib/types";

/**
 * 내 차례에 하는 일 — 서명과 반려.
 *
 * 둘을 한 폼에 담지 않는다. 버튼 두 개가 같은 입력칸을 나눠 쓰면 「의견은 선택,
 * 반려 사유는 필수」라는 서로 다른 규칙을 한 칸에 걸어야 하고, 스크립트가 없는
 * 브라우저에서는 어느 버튼이 눌렸는지에 따라 라벨이 거짓말을 한다.
 *
 * 반려는 펼쳐야 나온다. 되돌릴 수 없는 동작이고(반려된 문서는 다시 올릴 수 없다 —
 * 새로 기안해야 한다), 펼치는 손짓 한 번이 확인 절차를 대신한다.
 * <dialog>+showModal() 로 묻지 않는 이유는 인계 취소에 적어 둔 것과 같다 — "use client"라
 * 스크립트가 없으면 아무 일도 하지 않는다.
 */
export function ApprovalDecision({
  approvalId,
  step,
}: {
  approvalId: string;
  step: ApprovalStepWithApprover;
}) {
  return (
    <div className="rounded-sm border border-primary/30 bg-primary-5 px-5 py-4">
      <p className="text-body-sm font-bold text-gray-90">
        지금 내 차례입니다. {APPROVAL_KIND_LABEL[step.kind]}란
      </p>
      <p className="mt-1 mb-4 text-body-sm break-keep text-gray-70">
        서명하면 다음 순서로 넘어갑니다. 마지막 칸이면 그 자리에서 완결됩니다.
        한 번 찍힌 서명은 되돌릴 수 없습니다.
      </p>

      <form action={signApproval} className="flex flex-col gap-3">
        <input type="hidden" name="approvalId" value={approvalId} />
        <input type="hidden" name="stepId" value={step.id} />
        <Field
          id="approval-opinion"
          label="의견 (선택)"
          hint="적으면 결재란에 「의견 있음」으로 표시되고 본문 아래에 그대로 실립니다."
        >
          {(p) => (
            <Textarea
              {...p}
              name="opinion"
              rows={2}
              maxLength={APPROVAL_OPINION_MAX}
              placeholder="예: 예산 범위 안에서 집행 가능함을 확인했습니다."
            />
          )}
        </Field>
        <div>
          {/* 서명·반려·회수는 셋 다 되돌릴 수 없다. 흐려지기만 하는 단추는
              「눌리긴 했나」를 남기고, 그 물음의 답이 「한 번 더 눌러 보자」다.
              무슨 일이 벌어지는 중인지 글로 적는다(ui/submit-button.tsx). */}
          <SubmitButton pendingLabel="서명하는 중…">
            <PenLine aria-hidden className="size-4" />
            서명합니다
          </SubmitButton>
        </div>
      </form>

      <details className="mt-4 border-t border-primary/30 pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-80">
          <Undo2 aria-hidden className="size-4 shrink-0 text-gray-40" />
          이 문서를 반려해야 한다면
        </summary>
        <form action={rejectApproval} className="flex flex-col gap-3 pt-1">
          <input type="hidden" name="approvalId" value={approvalId} />
          <input type="hidden" name="stepId" value={step.id} />
          <Field
            id="approval-reject-reason"
            label="반려 사유"
            required
            hint="사유 없는 반려는 받지 않습니다. 기안자가 무엇을 고쳐야 하는지 알아야 합니다."
          >
            {(p) => (
              <Textarea
                {...p}
                name="opinion"
                rows={3}
                maxLength={APPROVAL_OPINION_MAX}
                placeholder="예: 인상 근거가 조례 개정 사항과 맞는지 먼저 확인해 주세요."
              />
            )}
          </Field>
          <div>
            <SubmitButton variant="danger" pendingLabel="반려하는 중…">
              <Undo2 aria-hidden className="size-4" />
              반려합니다
            </SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}

/**
 * 회수 — 기안자만, 아무도 서명하지 않았을 때만.
 *
 * 한 사람이라도 읽고 서명했다면 그건 「없던 일」이 아니라 반려되거나 완결되어야
 * 할 일이다. 그 판정은 절차(withdraw_approval)가 다시 한다.
 */
export function ApprovalWithdraw({ approvalId }: { approvalId: string }) {
  return (
    <details className="rounded-sm border border-rule-frame bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-80">
        <RotateCcw aria-hidden className="size-4 shrink-0 text-gray-40" />
        잘못 올렸다면
      </summary>
      <div className="border-t border-rule-hair px-4 py-4">
        <p className="mb-3 text-body-sm leading-relaxed break-keep text-gray-70">
          아직 아무도 서명하지 않았다면 되가져올 수 있습니다. 회수한 사실은 업무
          이력에 남고, 문서는 사라지지 않습니다. 결재는 증빙이고 증빙은 지워지면
          증빙이 아닙니다. 내용을 고쳐 다시 올리려면 새로 기안해 주세요.
        </p>
        <form action={withdrawApproval}>
          <input type="hidden" name="approvalId" value={approvalId} />
          <SubmitButton variant="secondary" size="sm" pendingLabel="회수하는 중…">
            <RotateCcw aria-hidden className="size-4" />이 결재 회수
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
