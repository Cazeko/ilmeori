import { Save } from "lucide-react";
import { ApprovalFields } from "@/components/approval/approval-fields";
import { Button } from "@/components/ui/button";
import { updateApprovalDraft } from "@/lib/actions/approvals";
import type { ApprovalWithSteps } from "@/lib/types";

/**
 * 기안 중인 문서 고치기.
 *
 * 상신한 뒤에는 이 폼이 아예 그려지지 않는다. 그때는 트리거가 본문 변경을
 * 막으므로(0017), 화면과 DB 가 같은 말을 한다 — 서명한 사람이 읽지 않은 글에
 * 서명한 것이 되면 그건 위조다.
 */
export function ApprovalDraftForm({ approval }: { approval: ApprovalWithSteps }) {
  return (
    <form action={updateApprovalDraft} className="flex flex-col gap-4">
      <input type="hidden" name="approvalId" value={approval.id} />
      <ApprovalFields approval={approval} />
      <div>
        <Button type="submit" variant="secondary">
          <Save aria-hidden className="size-4" />
          문서 저장
        </Button>
      </div>
    </form>
  );
}
