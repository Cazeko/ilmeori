import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PersonChip } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { decideTransfer } from "@/lib/actions/profile";
import { formatDateTime } from "@/lib/format";
import { DetailList, DetailRow } from "./detail-list";
import { TransferRoute } from "./transfer-bits";
import type { TransferRequestView } from "@/lib/types";

/**
 * 내가 결정해야 하는 이동 신청.
 *
 * ── 승인하기 전에 알아야 하는 한 가지 ──────────────────────────────────────
 *
 * 소속이 바뀌어도 **맡고 있던 업무는 그 자리에 남는다.** work.department_id 는
 * 그대로이기 때문이다. 그래서 승인 뒤에는 「남의 과 업무의 주담당」이 생기고,
 * 그 사람은 부서 목록에서 그 업무를 더는 못 보면서 여전히 주인이다.
 *
 * 이건 버그가 아니라 인사이동의 실제 모습이고, 그래서 이 제품에 인계 기능이
 * 있다. 다만 **승인하는 사람이 그 사실을 모른 채 누르면 안 된다.** 아래
 * `impact` 가 그 수를 세어 화면에 먼저 적는다(0023 의 transfer_impact —
 * 승인자에게는 그 과의 업무가 안 보이므로 정책으로는 셀 수 없는 값이다).
 *
 * 인계를 **강제하지는 않는다.** 강제하면 이동이 인계 절차에 묶여, 급한
 * 발령에서 사람이 시스템 밖으로 나간다. 말해 주고 맡긴다.
 */
export function TransferInbox({
  items,
}: {
  items: Array<{ request: TransferRequestView; impact: number }>;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title={`내가 결정할 부서 이동 ${items.length}건`}
        description="내가 이 부서에서 서열이 가장 높아 승인자로 지정되었습니다."
      />
      <CardBody>
        <ul className="flex flex-col gap-6">
          {items.map(({ request, impact }) => (
            <li
              key={request.id}
              className="rounded-sm border border-rule-frame bg-gray-5 px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PersonChip
                  profile={request.profile}
                  sub={request.from_department_name ?? "소속 없음"}
                />
                <span className="text-body-xs text-gray-60">
                  {formatDateTime(request.created_at)}
                </span>
              </div>

              <div className="mt-4">
                <DetailList>
                  <DetailRow label="옮겨갈 곳">
                    <TransferRoute request={request} />
                  </DetailRow>
                  <DetailRow label="사유">{request.reason}</DetailRow>
                </DetailList>
              </div>

              {impact > 0 ? (
                <Notice
                  tone="warning"
                  title={`이 사람이 주담당인 업무 ${impact}건이 옛 부서에 남습니다`}
                  className="mt-4"
                >
                  소속만 옮겨 가고 맡은 일은 그대로 남습니다. 승인해도 됩니다 —
                  다만 그 업무들은 인계·인수로 넘겨야 주인이 바뀝니다.
                </Notice>
              ) : null}

              <form action={decideTransfer} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="requestId" value={request.id} />
                <Field
                  id={`note-${request.id}`}
                  label="의견"
                  hint="반려하려면 사유를 적어 주세요. 승인할 때는 비워 두셔도 됩니다."
                >
                  {(field) => (
                    <Textarea
                      {...field}
                      name="note"
                      maxLength={500}
                      className="min-h-20 bg-gray-0"
                    />
                  )}
                </Field>
                {/* 두 단추가 한 폼에 있고 `decision` 값으로 갈린다.
                    브라우저가 누른 단추의 name·value 만 실어 보내므로
                    자바스크립트 없이도 어느 쪽을 눌렀는지 서버가 안다. */}
                <div className="flex flex-wrap justify-end gap-2">
                  <SubmitButton
                    name="decision"
                    value="reject"
                    variant="secondary"
                    pendingLabel="처리하는 중…"
                  >
                    반려
                  </SubmitButton>
                  <SubmitButton
                    name="decision"
                    value="approve"
                    pendingLabel="처리하는 중…"
                  >
                    승인
                  </SubmitButton>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
