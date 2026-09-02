import { Clock, Info } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelTransfer, requestTransfer } from "@/lib/actions/profile";
import { formatDateTime } from "@/lib/format";
import { DetailList, DetailRow } from "./detail-list";
import { TransferRoute, TransferStatusBadge } from "./transfer-bits";
import type { Department, Profile, TransferRequestView } from "@/lib/types";

/**
 * 내 부서 이동 — 신청하거나, 기다리거나, 지난 것을 보거나.
 *
 * ── 한 번에 한 가지만 보인다 ───────────────────────────────────────────────
 *
 * 대기 중인 신청이 있으면 **신청 폼을 그리지 않는다.** DB 가 한 사람에 대기
 * 하나만 허용하므로(0023 의 부분 유일 색인), 폼을 그려 두면 눌렀을 때 반드시
 * 실패하는 단추가 된다. 눌리지 않는 단추를 보여 주느니 없는 편이 낫다.
 */
export function TransferSection({
  viewer,
  pending,
  history,
  tree,
  canRequest,
}: {
  viewer: Profile;
  pending: TransferRequestView | null;
  history: TransferRequestView[];
  /** 실·국 아래 과. 고르는 자리는 2단계까지만 편다. */
  tree: Array<Department & { children: Department[] }>;
  /** 데모 모드에서는 쓰기가 없다. 그때도 폼은 그리고, 못 쓰게만 만든다. */
  canRequest: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="부서 이동"
        description="옮겨갈 부서의 상급자가 승인해야 소속이 바뀝니다."
      />
      <CardBody className="flex flex-col gap-6">
        {/* 읽기 전용일 때 이 자리가 안내 상자 하나였다. 「화면과 동선은 그대로
            보실 수 있습니다」라고 적어 놓고 정작 폼을 안 그렸다 —
            화면이 자기가 하는 일과 반대를 말한 자리다(DESIGN.md §18.5).
            폼을 그리고 못 쓰게만 만든다. 안내는 그 위에 한 줄로 남는다. */}
        {pending ? (
          <PendingRequest request={pending} canCancel={canRequest} />
        ) : (
          <RequestForm viewer={viewer} tree={tree} canRequest={canRequest} />
        )}

        {history.length > 0 ? <History items={history} /> : null}
      </CardBody>
    </Card>
  );
}

/** 기다리는 중. 승인자가 누구인지 이름으로 말한다 — 그래야 물어볼 곳을 안다. */
function PendingRequest({
  request,
  canCancel,
}: {
  request: TransferRequestView;
  canCancel: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning-bg px-4 py-4">
        <Clock aria-hidden className="mt-1 size-5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-bold text-gray-90">
            승인을 기다리고 있습니다
          </p>
          <p className="mt-1 text-body-sm text-gray-60">
            아직 소속은 바뀌지 않았습니다. 지금 부서의 업무가 그대로 보입니다.
          </p>
        </div>
      </div>

      <DetailList>
        <DetailRow label="옮겨갈 곳">
          <TransferRoute request={request} />
        </DetailRow>
        <DetailRow
          label="승인자"
          hint="옮겨갈 부서의 최고 서열자입니다. 신청할 때 조직도를 보고 정해집니다."
        >
          {request.approver.name}
          {request.approver.position ? (
            <span className="text-gray-60"> {request.approver.position}</span>
          ) : null}
        </DetailRow>
        <DetailRow label="사유">{request.reason}</DetailRow>
        <DetailRow label="신청한 때">
          {formatDateTime(request.created_at)}
        </DetailRow>
      </DetailList>

      {canCancel ? (
        <form action={cancelTransfer} className="flex justify-end">
          <input type="hidden" name="requestId" value={request.id} />
          <SubmitButton variant="secondary" pendingLabel="취소하는 중…">
            신청 취소
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

/** 신청 폼. 승인자를 고르는 칸이 **없다** — 그 이유를 화면이 직접 적는다. */
function RequestForm({
  viewer,
  tree,
  canRequest,
}: {
  viewer: Profile;
  tree: Array<Department & { children: Department[] }>;
  /** 데모(읽기 전용)에서는 신청이 안 된다. 감추지 않고 못 쓰게만 만든다. */
  canRequest: boolean;
}) {
  return (
    <form action={requestTransfer}>
      {!canRequest ? (
        <p className="mb-6 flex items-start gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm break-keep text-gray-60">
          <Info aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
          <span>
            지금은 <strong className="font-bold text-gray-90">읽기 전용</strong>
            입니다. 데이터베이스에 연결하면 이 자리에서 이동을 신청할 수
            있습니다.
          </span>
        </p>
      ) : null}
      {/* min-w-0 — fieldset 의 UA 기본값이 안쪽 flex 를 내용만큼 부풀린다. */}
      <fieldset disabled={!canRequest} className="flex min-w-0 flex-col gap-6">
      <Field
        id="transfer-department"
        label="옮겨갈 부서"
        required
        hint="승인자는 고르지 않습니다. 그 부서의 최고 서열자에게 자동으로 갑니다 — 받을 사람을 신청자가 정할 수 있으면 그건 자기 승인입니다."
      >
        {(field) => (
          <Select {...field} name="departmentId" defaultValue="">
            <option value="" disabled>
              부서를 골라 주세요
            </option>
            {tree.map((root) => (
              <optgroup key={root.id} label={root.name}>
                {/* 실·국 자체도 고를 수 있다. 그 아래 과가 없는 조직
                    (공보실 같은)이 실제로 있기 때문이다. */}
                {[root, ...root.children]
                  .filter((d) => d.id !== viewer.department_id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>

      <Field
        id="transfer-reason"
        label="사유"
        hint="승인자가 이 글만 보고 결정합니다. 500자까지."
      >
        {(field) => (
          <Textarea
            {...field}
            name="reason"
            maxLength={500}
            placeholder="예) 대중교통과 자원순환 연계 업무를 이어서 맡게 되었습니다."
          />
        )}
      </Field>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="신청하는 중…">이동 신청</SubmitButton>
      </div>
      </fieldset>
    </form>
  );
}

/**
 * 지난 신청.
 *
 * 반려된 것을 목록에서 지우지 않는다. 반려 사유가 함께 사라지면, 다시 신청할
 * 때 무엇을 고쳐야 하는지 알 수 없어 결국 전화를 걸게 된다.
 */
function History({ items }: { items: TransferRequestView[] }) {
  return (
    <section className="border-t border-rule-hair pt-6">
      <h3 className="text-body-sm font-bold text-gray-60">지난 신청</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((r) => (
          <li
            key={r.id}
            className="rounded-sm border border-rule-hair bg-gray-5 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TransferRoute request={r} />
              <TransferStatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-body-xs text-gray-60">
              {formatDateTime(r.decided_at ?? r.created_at)} · {r.approver.name}
              {r.approver.position ? ` ${r.approver.position}` : ""}
            </p>
            {r.decided_note ? (
              <p className="mt-2 text-body-sm break-keep text-gray-60">
                {r.decided_note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
