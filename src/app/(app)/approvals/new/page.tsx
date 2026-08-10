import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FilePlus2, Send } from "lucide-react";
import { ApprovalFields } from "@/components/approval/approval-fields";
import { PeoplePicker } from "@/components/approval/people-picker";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { createApproval } from "@/lib/actions/approvals";
import { buildApprovalLine } from "@/lib/approval";
import { listProfiles, listWorks, roleIn } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import {
  APPROVAL_KIND_LABEL,
  isApprovalForm,
  type ApprovalForm,
} from "@/lib/types";

export const metadata: Metadata = { title: "결재 올리기" };

/**
 * 기안.
 *
 * 결재선을 사람이 한 칸씩 채우게 두지 않는다. 자문에서 나온 말이 그것이었다 —
 * 「결재란에 하나하나 입력하는 게 아니라, 바빠 죽겠으니 빠바바밥 해야 하고」.
 * 기안자 위로 훑어 미리 채운 결재선을 **미리 보여 주고**, 만든 뒤 문서 화면에서
 * 고칠 수 있게 한다. 자동으로 채우는 것이지 자동으로 올리는 것이 아니다.
 *
 * 업무를 먼저 고르는 이유는 결재 문서가 업무에 매달리기 때문이다. 결재함은
 * 그것을 모아 보는 화면일 뿐이고, 문서의 집은 업무다.
 */
export default async function NewApprovalPage({
  searchParams,
}: PageProps<"/approvals/new">) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const defaultForm: ApprovalForm | undefined = isApprovalForm(sp.form)
    ? sp.form
    : undefined;
  const preselected = typeof sp.work === "string" ? sp.work : "";

  // 결재를 올릴 수 있는 것은 내가 고칠 수 있는 업무다(approval_insert 정책도
  // app.can_edit_work 를 요구한다). 열람만 하는 업무는 목록에 넣지 않는다.
  const [mine, people] = await Promise.all([
    canMutate ? listWorks(viewer, { mine: true }) : [],
    canMutate ? listProfiles() : [],
  ]);
  const targets = mine.filter((w) => {
    const role = roleIn(w, viewer);
    return role === "owner" || role === "editor";
  });

  // 협조자는 결재선 자동 생성이 끼워 넣는다. 우리 부서 사람은 이미 결재선에
  // 들어가므로 협조 목록에서 뺀다 — 한 사람이 한 문서에 두 칸을 갖지 못한다.
  const coopCandidates = people.filter(
    (p) => p.id !== viewer.id && p.department_id !== viewer.department_id,
  );

  const line = buildApprovalLine({ drafter: viewer, people });
  const approvers = line.filter((s) => s.kind !== "draft");

  return (
    <PageContainer width="form">
      <nav aria-label="현재 위치" className="mb-4">
        <ol className="flex items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link href="/approvals" className="font-bold hover:text-primary">
              결재함
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="text-gray-70">결재 올리기</li>
        </ol>
      </nav>

      <PageHeader
        title="결재 올리기"
        description="내부결재문서(별지 제2호서식)를 기안합니다. 만들면 먼저 기안 중 상태가 되고, 결재선을 확인한 뒤 상신합니다."
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {!canMutate ? (
        <Notice tone="info" title="지금은 읽기 전용입니다">
          데이터베이스에 연결되지 않은 상태에서는 결재를 올릴 수 없습니다.
          결재함과 결재란은 시연용 문서로 그대로 볼 수 있습니다.
        </Notice>
      ) : targets.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={FilePlus2}
              title="결재를 올릴 업무가 없습니다"
              description="결재 문서는 업무에 매달립니다. 내가 소유하거나 편집할 수 있는 업무가 있어야 그 업무의 결재를 올릴 수 있습니다."
              action={
                <ButtonLink href="/works/new" variant="secondary" size="sm">
                  새 업무 만들기
                </ButtonLink>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <form action={createApproval} className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title="문서"
              description="제목만 필수입니다. 본문은 만든 뒤에 이어서 적어도 됩니다."
            />
            <CardBody className="flex flex-col gap-4">
              <Field
                id="approval-work"
                label="결재를 올릴 업무"
                required
                hint="내가 소유하거나 편집할 수 있는 업무만 나옵니다. 결재 기록은 그 업무의 이력에 함께 남습니다."
              >
                {(p) => (
                  <Select {...p} name="workId" defaultValue={preselected}>
                    <option value="">업무를 고르세요</option>
                    {targets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <ApprovalFields defaultForm={defaultForm} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="결재선"
              description="같은 부서에서 나보다 위인 사람을 급마다 한 명씩 훑어 미리 채웁니다. 만든 뒤 문서 화면에서 고칠 수 있습니다."
            />
            <CardBody className="flex flex-col gap-4">
              {approvers.length > 0 ? (
                <ol className="flex flex-wrap items-center gap-2">
                  <li className="rounded-sm border border-gray-20 bg-gray-5 px-3 py-1.5 text-body-sm">
                    <span className="font-bold text-gray-90">
                      {viewer.name} {viewer.position}
                    </span>
                    <span className="ml-1.5 text-body-xs text-gray-60">기안</span>
                  </li>
                  {approvers.map((s) => {
                    const p = people.find((x) => x.id === s.approver_id);
                    return (
                      <li
                        key={s.approver_id}
                        className="rounded-sm border border-gray-20 bg-surface px-3 py-1.5 text-body-sm"
                      >
                        <span aria-hidden className="mr-1.5 text-gray-30">
                          →
                        </span>
                        <span className="font-bold text-gray-90">
                          {p?.name} {s.position}
                        </span>
                        <span className="ml-1.5 text-body-xs text-gray-60">
                          {APPROVAL_KIND_LABEL[s.kind]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <Notice tone="warning" title="자동으로 채울 결재자가 없습니다">
                  같은 부서에 나보다 위인 사람이 없습니다. 문서를 만든 뒤 결재란을
                  직접 추가해야 상신할 수 있습니다 — 혼자 서명하고 끝나는 문서는
                  결재가 아니기 때문입니다.
                </Notice>
              )}

              <PeoplePicker
                id="approval-coop"
                name="coopIds"
                label="협조 (선택)"
                people={coopCandidates}
                multiple
                size={6}
                hint="여럿 고를 수 있습니다. 우리 부서 사람은 이미 결재선에 있어 나오지 않습니다."
              />

              <Field
                id="approval-coop-mode"
                label="협조 방식"
                hint="자문에서 나온 두 방식입니다. 병렬은 협조자가 언제든 처리할 수 있고, 순차는 내부 결재가 끝난 뒤에 차례가 옵니다."
              >
                {(p) => (
                  <Select {...p} name="coopMode" defaultValue="parallel">
                    <option value="parallel">
                      같은 급과 나란히 — 줄을 서지 않습니다 (병렬협조)
                    </option>
                    <option value="sequential">
                      내부 검토 뒤에 — 앞이 끝나야 차례가 옵니다 (순차협조)
                    </option>
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>

          <div className="flex flex-wrap gap-2">
            <SubmitButton>
              <Send aria-hidden className="size-4" />
              문서 만들기
            </SubmitButton>
            <ButtonLink href="/approvals" variant="secondary">
              취소
            </ButtonLink>
          </div>
        </form>
      )}
    </PageContainer>
  );
}
