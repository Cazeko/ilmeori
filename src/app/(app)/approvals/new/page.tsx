import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FilePlus2, Send } from "lucide-react";
import { ApprovalFields } from "@/components/approval/approval-fields";
import { PeoplePicker } from "@/components/approval/people-picker";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormWaiting } from "@/components/ui/form-waiting";
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
  //
  // 데모에서도 읽는다. 한동안 `canMutate ? … : []` 였는데, 그러면 읽기 전용일 때
  // 목록이 비어 화면이 「결재를 올릴 업무가 없습니다」로 떨어졌다 — **업무는
  // 멀쩡히 있는데 화면이 없다고 말하는 것**이라 사실과 다르다. 둘 다 데모에서
  // 이미 도는 조회이고(보드·조직도가 같은 것을 쓴다), 못 하는 것은 읽기가
  // 아니라 쓰기다. 쓰기는 아래 fieldset 이 막고, 서버 액션이 한 번 더 막는다.
  const [mine, people] = await Promise.all([
    listWorks(viewer, { mine: true }),
    listProfiles(),
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
            <Link href="/approvals" className="inline-flex items-center font-bold transition-colors duration-150 hover:text-primary pointer-coarse:min-h-11">
              결재함
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="text-gray-60">결재 올리기</li>
        </ol>
      </nav>

      <PageHeader
        title="결재 올리기"
        description="만들면 기안 중 상태가 되고, 결재선을 확인한 뒤 상신합니다."
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {/* ── 읽기 전용은 화면을 감추는 것이 아니다 ─────────────────────────
          한동안 이 안내가 폼을 **대신**했다. 그래서 데모에서 「결재 올리기」를
          누르면 제목 한 줄과 이 상자만 있는 화면이 나왔고, 정작 이 제품에서
          가장 자랑할 것 하나(기안자 위로 훑어 **미리 채운 결재선**)를 아무도
          못 봤다. 못 하는 것은 저장이지 보기가 아니다(DESIGN.md §18.5).

          이제 폼을 그대로 그리고 `fieldset disabled` 로 못 쓰게만 만든다.
          칸은 회색으로 내려앉고(ui/field.tsx), 단추도 같은 회색으로 멈춘다
          (ui/button.tsx 가 §17.1 에서 만든 그 모습이다) — 「지금은 못 누른다」는
          한 가지 사실이라 모습도 하나다. */}
      {!canMutate ? (
        <Notice tone="info" title="지금은 읽기 전용입니다" className="mb-4">
          데이터베이스에 연결되지 않은 상태에서는 결재를 올릴 수 없습니다. 아래
          칸과 자동으로 채워진 결재선은 실제 화면 그대로이며, 저장만 되지
          않습니다.
        </Notice>
      ) : null}

      {targets.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={FilePlus2}
              title="결재를 올릴 업무가 없습니다"
              description="결재 문서는 업무에 매달립니다. 소유하거나 편집할 수 있는 업무가 있어야 합니다."
              action={
                <ButtonLink href="/works/new" variant="secondary" size="sm">
                  새 업무 만들기
                </ButtonLink>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <form action={createApproval}>
          {/* min-w-0 — fieldset 의 UA 기본값은 `min-inline-size: min-content` 라,
              이것을 안 적으면 안쪽 격자·flex 가 내용만큼 부풀어 좁은 화면에서
              가로로 넘친다. Tailwind 의 preflight 도 이 값은 안 건드린다. */}
          <fieldset disabled={!canMutate} className="flex min-w-0 flex-col gap-5">
            <Card>
            <CardHeader
              title="문서"
              description="제목만 필수입니다."
            />
            <CardBody className="flex flex-col gap-4">
              <Field
                id="approval-work"
                label="결재를 올릴 업무"
                required
                hint="내가 소유하거나 편집할 수 있는 업무만 나옵니다."
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
              description="같은 부서에서 나보다 위인 사람을 급마다 한 명씩 미리 채웁니다."
            />
            <CardBody className="flex flex-col gap-4">
              {approvers.length > 0 ? (
                <ol className="flex flex-wrap items-center gap-2">
                  <li className="rounded-sm border border-rule-hair bg-gray-5 px-3 py-2 text-body-sm">
                    <span className="font-bold text-gray-90">
                      {viewer.name} {viewer.position}
                    </span>
                    <span className="ml-2 text-body-xs text-gray-60">기안</span>
                  </li>
                  {approvers.map((s) => {
                    const p = people.find((x) => x.id === s.approver_id);
                    return (
                      <li
                        key={s.approver_id}
                        className="rounded-sm border border-rule-hair bg-surface px-3 py-2 text-body-sm"
                      >
                        <span aria-hidden className="mr-2 text-gray-30">
                          →
                        </span>
                        <span className="font-bold text-gray-90">
                          {p?.name} {s.position}
                        </span>
                        <span className="ml-2 text-body-xs text-gray-60">
                          {APPROVAL_KIND_LABEL[s.kind]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <Notice tone="warning" title="자동으로 채울 결재자가 없습니다">
                  같은 부서에 나보다 위인 사람이 없습니다. 문서를 만든 뒤 결재란을
                  직접 추가해야 상신할 수 있습니다. 혼자 서명하고 끝나는 문서는
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
                      같은 급과 나란히. 줄을 서지 않습니다 (병렬협조)
                    </option>
                    <option value="sequential">
                      내부 검토 뒤에. 앞이 끝나야 차례가 옵니다 (순차협조)
                    </option>
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>

          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel="만드는 중…">
              <Send aria-hidden className="size-4" />
              문서 만들기
            </SubmitButton>
            {/* 서버가 업무의 기록에서 기안문 본문을 짜는 동안 몇 초가 걸린다.
                그동안 화면이 아무 말도 안 하면 한 번 더 누르게 된다
                (ui/form-waiting.tsx). */}
            <FormWaiting title="결재 문서를 만들고 있습니다" />
            {/* 링크는 폼 조작기가 아니라 disabled 가 안 걸린다 — 읽기 전용에서도
                나갈 길은 열려 있어야 하므로 그대로 둔다. */}
            <ButtonLink href="/approvals" variant="secondary">
              취소
            </ButtonLink>
          </div>
          </fieldset>
        </form>
      )}
    </PageContainer>
  );
}
