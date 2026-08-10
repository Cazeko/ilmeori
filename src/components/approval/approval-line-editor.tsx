import { Copy, Plus, Trash2 } from "lucide-react";
import {
  addApprovalStep,
  copyApprovalLine,
  removeApprovalStep,
} from "@/lib/actions/approvals";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Select } from "@/components/ui/field";
import { PeoplePicker } from "@/components/approval/people-picker";
import { APPROVAL_KIND_LABEL, type ApprovalStepWithApprover } from "@/lib/types";
import type { ApprovalWithSteps, ProfileWithDepartment } from "@/lib/types";

/**
 * 결재선 짜기 — 기안 중에만.
 *
 * 자동으로 채워진 결재선을 사람이 확인하고 고치는 자리다. 자문의 「빠바바밥」은
 * 자동으로 **채우는** 것이지 자동으로 **올리는** 것이 아니므로, 채워진 것을
 * 눈으로 확인할 자리가 반드시 있어야 한다.
 *
 * 순서 바꾸기는 두지 않았다. 칸을 빼고 다시 넣으면 맨 뒤에 붙으므로 순서는
 * 그렇게 정한다. 화살표 두 개를 붙이면 자바스크립트 없이도 돌게 만들 수는 있지만
 * (값이 다른 제출 버튼), 결재선은 대개 세 칸이라 그만한 값이 없다.
 */
export function ApprovalLineEditor({
  approval,
  people,
  sources,
}: {
  approval: ApprovalWithSteps;
  people: ProfileWithDepartment[];
  /** 결재선을 가져올 수 있는 문서 — 내가 볼 수 있는 것들 */
  sources: ApprovalWithSteps[];
}) {
  const inLine = new Set(approval.steps.map((s) => s.approver_id));
  const candidates = people.filter((p) => !inLine.has(p.id));

  return (
    <div className="flex flex-col gap-4">
      <ol className="divide-y divide-gray-5 rounded-md border border-gray-10 bg-surface">
        {approval.steps.map((s: ApprovalStepWithApprover) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 shrink-0 text-body-xs font-bold tabular-nums text-gray-40">
              {s.seq}
            </span>
            <span className="w-20 shrink-0 text-body-xs font-bold text-gray-60">
              {APPROVAL_KIND_LABEL[s.kind]}
              {s.kind === "concur_par" ? "(병렬)" : null}
              {s.kind === "concur_seq" ? "(순차)" : null}
            </span>
            <span className="min-w-0 flex-1 text-body-sm text-gray-90">
              {s.approver.name}{" "}
              <span className="text-gray-60">{s.position}</span>
            </span>
            {s.kind === "draft" ? (
              // 기안란은 뺄 수 없다. 빼면 상신이 「결재선에 기안란이 없습니다」로
              // 막히고, 사용자는 무엇을 되돌려야 하는지 알 수 없다.
              //
              // gray-50 을 쓰지 않는다. 판이 #fafafa 로 내려간 뒤로 흰 배경에서
              // 4.51 이던 대비가 4.32 가 되어 본문 글자로는 미달이다.
              <span className="shrink-0 text-body-xs text-gray-60">
                기안자 자리
              </span>
            ) : (
              <form action={removeApprovalStep} className="shrink-0">
                <input type="hidden" name="approvalId" value={approval.id} />
                <input type="hidden" name="stepId" value={s.id} />
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  aria-label={`${s.approver.name} ${s.position} 결재란 빼기`}
                >
                  <Trash2 aria-hidden className="size-4" />
                </SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ol>

      {/* ── 칸 더하기 ──────────────────────────────────────────────────── */}
      <form
        action={addApprovalStep}
        className="flex flex-col gap-3 rounded-md border border-gray-10 bg-surface p-4 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="approvalId" value={approval.id} />
        <PeoplePicker
          id="approval-add-approver"
          name="approverId"
          label="결재자"
          people={candidates}
          className="min-w-0 flex-1"
          required
        />
        <Field id="approval-add-kind" label="유형" className="sm:w-44">
          {(p) => (
            <Select {...p} name="kind" defaultValue="review">
              <option value="review">결재</option>
              <option value="final">최종결재</option>
              <option value="delegated">전결</option>
              <option value="acting">대결</option>
              <option value="concur_par">협조 (병렬)</option>
              <option value="concur_seq">협조 (순차)</option>
              <option value="post_report">사후보고</option>
            </Select>
          )}
        </Field>
        <SubmitButton variant="secondary">
          <Plus aria-hidden className="size-4" />
          칸 추가
        </SubmitButton>
      </form>

      {/* ── 결재선 가져오기 ────────────────────────────────────────────── */}
      {sources.length > 0 ? (
        <details className="rounded-md border border-gray-10 bg-surface">
          <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-body-sm font-bold text-gray-60 hover:text-gray-80">
            다른 결재의 결재선 그대로 쓰기
          </summary>
          <form
            action={copyApprovalLine}
            className="flex flex-col gap-3 border-t border-gray-10 p-4 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="approvalId" value={approval.id} />
            <Field
              id="approval-copy-source"
              label="가져올 문서"
              className="min-w-0 flex-1"
              hint="내부 결재자는 우리 부서의 같은 서열로 바꿔 넣고, 다른 부서 사람은 협조자로 보아 그대로 둡니다. 지금 결재선은 지워집니다."
            >
              {(p) => (
                <Select {...p} name="sourceId" required>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.doc_no ? `${s.doc_no} · ` : ""}
                      {s.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <SubmitButton variant="secondary">
              <Copy aria-hidden className="size-4" />
              결재선 가져오기
            </SubmitButton>
          </form>
        </details>
      ) : null}
    </div>
  );
}
