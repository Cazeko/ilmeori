"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildApprovalLine,
  isCoopMode,
  positionOf,
  type DraftStep,
} from "@/lib/approval";
import { getApproval, listProfiles } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  isApprovalForm,
  APPROVAL_BODY_MAX,
  APPROVAL_OPINION_MAX,
  APPROVAL_TITLE_MAX,
  RETENTION_YEARS,
  type ApprovalKind,
  type ApprovalWithSteps,
  type Profile,
} from "@/lib/types";
import { classifyError } from "./feedback";
import { changed, finish, openWork } from "./guard";

/**
 * 결재.
 *
 * ── 이 파일이 하지 않는 일 ─────────────────────────────────────────────────
 *
 * **서명을 적지 않는다.** approval_step 에는 UPDATE 권한도 정책도 없으므로
 * (0017) 여기서 update 를 날려도 42501 로 끝난다. 서명이 들어가는 길은
 * submit / sign / reject / withdraw 절차 넷뿐이고, 이 파일은 그 넷을 부른다.
 *
 * 완결 판정이 두 표에 걸쳐 있는 것이 그 이유다 — 마지막 칸에 서명하면 문서도
 * 함께 완결되어야 하고, 둘이 원자적이지 않으면 「모든 칸이 서명됐는데 진행
 * 중인 문서」가 남는다. 애플리케이션에서 update 두 번으로 흉내 내면 그 사이에
 * 프로세스가 죽는 날 그 상태가 실제로 남는다.
 *
 * ── 앞에서 한 번 더 막는 이유 ──────────────────────────────────────────────
 *
 * guard.ts 에 적은 것과 같다. RLS 에 걸린 UPDATE 는 오류가 아니라 「0행이
 * 바뀌었습니다」로 조용히 끝나므로, 확인하지 않으면 화면이 저장했다고 거짓말을 한다.
 */

// ---------------------------------------------------------------------------
// 문 — 결재 화면으로 돌려보내는 openSession
// ---------------------------------------------------------------------------

/**
 * openSession() 과 같은 일을 하되 데모 모드에서 **결재함으로** 돌려보낸다.
 * 결재 화면에서 누른 버튼의 결과를 업무 보드에서 읽게 할 수는 없다.
 */
async function gate(): Promise<{ viewer: Profile; supabase: SupabaseClient }> {
  const viewer = await requireViewer();
  if (!canMutate) finish("/approvals", "demo.readonly");
  return { viewer, supabase: await createClient() };
}

type Opened = {
  viewer: Profile;
  supabase: SupabaseClient;
  approval: ApprovalWithSteps;
};

/**
 * 결재 문서를 열고 자격을 확인한다.
 *
 * 볼 수 없는 문서와 없는 문서를 구분하지 않는다. 「권한이 없습니다」라고 답하면
 * 그 문서가 존재한다는 사실 자체가 새어 나간다(업무에서 하는 것과 같은 판단).
 */
async function openApproval(
  rawId: unknown,
  need: "read" | "drafting",
): Promise<Opened> {
  const { viewer, supabase } = await gate();
  if (typeof rawId !== "string" || !rawId) finish("/approvals", "invalid");

  const approval = await getApproval(viewer, rawId);
  if (!approval) finish("/approvals", "denied");

  if (need === "drafting") {
    // 결재선을 짜고 고치는 것은 상신 전의 기안자뿐이다(0017 의 is_approval_draft_owner).
    if (approval.drafter_id !== viewer.id) {
      finish(`/approvals/${approval.id}`, "denied");
    }
    if (approval.state !== "drafting") {
      finish(`/approvals/${approval.id}`, "approval.locked");
    }
  }

  return { viewer, supabase, approval };
}

function refresh(approval: { id: string; work_id: string }) {
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${approval.id}`);
  revalidatePath(`/works/${approval.work_id}`);
  // 홈의 「내 차례인 결재」도 함께 센다. 서명하고 홈으로 돌아갔더니 방금 처리한
  // 문서가 여전히 「1건」으로 남아 있으면, 그 숫자를 그때부터 아무도 안 믿는다.
  revalidatePath("/");
}

/**
 * 한 문서의 결재란 수 상한.
 *
 * 결재란은 표가 아니라 **서식**이라 칸이 옆으로 늘어난다. 열두 칸이 넘어가면
 * 좁은 화면에서 읽을 수 없고, 종이에 올릴 수도 없다.
 *
 * ⚠ 이 상한은 **앱에만 있다.** DB 쪽에는 칸 수 제약이 없으므로, 폼을 거치지
 * 않은 요청은 더 넣을 수 있다. 넣어서 얻는 것은 자기 문서의 결재란이 길어지는
 * 것과 그 사람들 결재함에 문서가 한 줄 뜨는 것뿐이라(결재선에 넣으려면 그 업무를
 * 고칠 수 있어야 한다) 지금은 앱에서 막는다. 트리거로 내리는 것은 다음 마이그레이션의
 * 일이고, 그때까지 이 주석이 그 사실을 적어 둔다.
 */
const MAX_STEPS = 12;

// ---------------------------------------------------------------------------
// 폼 값 읽기
// ---------------------------------------------------------------------------

function readText(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** 결재선에 사람이 손으로 넣을 수 있는 유형. 기안란은 여기 없다. */
const ADDABLE_KINDS = [
  "review",
  "final",
  "delegated",
  "acting",
  "concur_seq",
  "concur_par",
  "post_report",
] as const satisfies readonly ApprovalKind[];

function isAddableKind(v: unknown): v is (typeof ADDABLE_KINDS)[number] {
  return typeof v === "string" && (ADDABLE_KINDS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// 기안
// ---------------------------------------------------------------------------

/**
 * 결재 문서를 만든다 — 결재선까지 함께.
 *
 * 만들어지는 것은 언제나 **기안 중**인 문서다. 번호도 없고 서명도 없다.
 * 상신은 사람이 결재선을 눈으로 확인한 뒤 따로 누른다. 자문에서 나온
 * 「빠바바밥」은 결재선을 자동으로 **채우는** 것이지 자동으로 **올리는** 것이 아니다.
 */
export async function createApproval(formData: FormData) {
  const rawWorkId = formData.get("workId");
  if (typeof rawWorkId !== "string" || !rawWorkId) {
    finish("/approvals/new", "approval.no_work");
  }
  // 결재를 올리는 것은 그 업무를 고칠 수 있는 사람이다. 열람자는 올리지 못한다
  // (approval_insert 정책도 app.can_edit_work 를 요구한다).
  const { viewer, work, supabase } = await openWork(rawWorkId, "edit");

  const form = formData.get("form");
  if (!isApprovalForm(form)) finish(`/approvals/new?work=${work.id}`, "invalid");

  const title = readText(formData, "title");
  if (!title) finish(`/approvals/new?work=${work.id}`, "approval.title_required");
  if (title.length > APPROVAL_TITLE_MAX) {
    finish(`/approvals/new?work=${work.id}`, "approval.title_long");
  }

  const body = readText(formData, "body");
  // 잘라 넣지 않는다. 잘린 문장이 결재 문서에 그대로 실리고, 자른 사실을
  // 아무도 모르는 것이 문제다(인계서 보충에서 배운 것과 같다).
  if (body.length > APPROVAL_BODY_MAX) {
    finish(`/approvals/new?work=${work.id}`, "approval.body_long");
  }

  const rawRetention = Number(formData.get("retention"));
  const retention = (RETENTION_YEARS as readonly number[]).includes(rawRetention)
    ? rawRetention
    : null;

  const security = formData.get("security") === "confidential"
    ? "confidential"
    : "normal";

  const rawMode = formData.get("coopMode");
  const coopMode = isCoopMode(rawMode) ? rawMode : "parallel";
  const cooperators = formData
    .getAll("coopIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  // 결재선은 서열(rank)로 만든다. 실재하는 재직자인지는 목록 쪽에서 걸러진다.
  const people = await listProfiles();
  const line = buildApprovalLine({ drafter: viewer, people, cooperators, coopMode });
  if (line.length > MAX_STEPS) {
    finish(`/approvals/new?work=${work.id}`, "approval.too_many_steps");
  }

  // id 를 미리 정한다. 결재란을 넣으려면 문서의 id 가 먼저 있어야 하고,
  // 삽입 결과를 되읽는 방식은 정책에 걸리는 순간 빈손으로 돌아온다(startHandover 와 같다).
  const approvalId = crypto.randomUUID();

  const { error } = await supabase.from("approval").insert({
    id: approvalId,
    work_id: work.id,
    form,
    title,
    body,
    retention,
    security,
    // state·doc_no·closed_at 은 적지 않는다. 태어나는 문서는 언제나 기안 중이고
    // 번호가 없다 — 그것을 DB 의 기본값과 정책이 함께 못박는다.
    drafter_id: viewer.id,
  });
  if (error) finish(`/approvals/new?work=${work.id}`, classifyError(error));

  const { error: stepError } = await supabase
    .from("approval_step")
    .insert(line.map((s) => ({ ...s, approval_id: approvalId })));

  // 두 문장은 한 트랜잭션이 아니다. 결재란이 없는 문서만 남으면 상신도 못 하고
  // 화면에서 무엇이 잘못됐는지도 보이지 않는다. 아직 아무 서명도 없는 초안이라
  // 지워도 잃는 기록이 없다(startHandover 와 같은 되돌리기).
  if (stepError) {
    await supabase.from("approval").delete().eq("id", approvalId);
    finish(`/approvals/new?work=${work.id}`, classifyError(stepError));
  }

  revalidatePath("/approvals");
  revalidatePath(`/works/${work.id}`);
  finish(`/approvals/${approvalId}`, "approval.created");
}

/** 기안 중인 문서의 내용 고치기. 상신된 뒤에는 트리거가 막는다. */
export async function updateApprovalDraft(formData: FormData) {
  const { approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "drafting",
  );
  const here = `/approvals/${approval.id}`;

  const form = formData.get("form");
  if (!isApprovalForm(form)) finish(here, "invalid");

  const title = readText(formData, "title");
  if (!title) finish(here, "approval.title_required");
  if (title.length > APPROVAL_TITLE_MAX) finish(here, "approval.title_long");

  const body = readText(formData, "body");
  if (body.length > APPROVAL_BODY_MAX) finish(here, "approval.body_long");

  const rawRetention = Number(formData.get("retention"));
  const retention = (RETENTION_YEARS as readonly number[]).includes(rawRetention)
    ? rawRetention
    : null;

  const { data, error } = await supabase
    .from("approval")
    .update({
      form,
      title,
      body,
      retention,
      security:
        formData.get("security") === "confidential" ? "confidential" : "normal",
    })
    .eq("id", approval.id)
    // 화면이 열려 있는 동안 상신됐을 수 있다. 그때는 트리거가 막지만,
    // 여기서 조건을 걸어야 「0행」이 무엇을 뜻하는지 아래에서 말할 수 있다.
    .eq("state", "drafting")
    .select("id");

  if (error) finish(here, classifyError(error));
  if (!changed(data)) finish(here, "stale");

  refresh(approval);
  finish(here, "approval.updated");
}

/** 기안 중인 문서 지우기. 상신된 뒤에는 지워지지 않는다 — 증빙은 사라지지 않는다. */
export async function deleteApproval(formData: FormData) {
  const { approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "drafting",
  );

  const { data, error } = await supabase
    .from("approval")
    .delete()
    .eq("id", approval.id)
    .eq("state", "drafting")
    .select("id");

  if (error) finish(`/approvals/${approval.id}`, classifyError(error));
  if (!changed(data)) finish(`/approvals/${approval.id}`, "stale");

  revalidatePath("/approvals");
  revalidatePath(`/works/${approval.work_id}`);
  finish("/approvals?box=drafting", "approval.deleted");
}

// ---------------------------------------------------------------------------
// 결재선
// ---------------------------------------------------------------------------

export async function addApprovalStep(formData: FormData) {
  const { approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "drafting",
  );
  const here = `/approvals/${approval.id}`;

  const kind = formData.get("kind");
  // 기안란은 손으로 더하지 않는다. 문서에 하나뿐이고(부분 유니크 인덱스),
  // 그 자리는 기안자의 것이다.
  if (!isAddableKind(kind)) finish(here, "invalid");

  const approverId = formData.get("approverId");
  if (typeof approverId !== "string" || !approverId) finish(here, "invalid");

  if (approval.steps.length >= MAX_STEPS) finish(here, "approval.too_many_steps");

  // 한 사람이 한 문서에 두 칸을 갖지 않는다. DB 의 unique 제약이 막지만,
  // 그때 돌아오는 것은 23505 라 사용자에게는 「이미 참여자입니다」로 읽힌다.
  if (approval.steps.some((s) => s.approver_id === approverId)) {
    finish(here, "approval.duplicate_approver");
  }

  const people = await listProfiles();
  const approver = people.find((p) => p.id === approverId && p.is_active);
  if (!approver) finish(here, "invalid");

  const step: DraftStep = {
    seq: Math.max(0, ...approval.steps.map((s) => s.seq)) + 1,
    kind,
    approver_id: approver.id,
    // 직위는 폼에서 받지 않는다. 결재란에 찍히는 직위를 요청자가 정할 수 있으면
    // 그건 문서 위조다.
    position: positionOf(approver),
  };

  const { error } = await supabase
    .from("approval_step")
    .insert({ ...step, approval_id: approval.id });
  if (error) finish(here, classifyError(error));

  refresh(approval);
  finish(here, "approval.step_added");
}

export async function removeApprovalStep(formData: FormData) {
  const { approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "drafting",
  );
  const here = `/approvals/${approval.id}`;

  const stepId = formData.get("stepId");
  if (typeof stepId !== "string" || !stepId) finish(here, "invalid");

  const target = approval.steps.find((s) => s.id === stepId);
  if (!target) finish(here, "stale");
  // 기안란을 빼면 상신이 「결재선에 기안란이 없습니다」로 막힌다. 정책은 지우는
  // 것 자체를 허용하므로(기안 중이니까), 못 빼게 막는 것은 이쪽 일이다.
  if (target.kind === "draft") finish(here, "approval.draft_step_locked");

  const { data, error } = await supabase
    .from("approval_step")
    .delete()
    .eq("id", stepId)
    // id 하나만 믿으면 남의 문서의 결재란을 지우는 요청이 정책에만 기대게 된다.
    .eq("approval_id", approval.id)
    .select("id");

  if (error) finish(here, classifyError(error));
  if (!changed(data)) finish(here, "stale");

  refresh(approval);
  finish(here, "approval.step_removed");
}

/**
 * 결재선 복사 — 자문에서 「무조건」이 붙은 유일한 요구.
 *
 *   *"다른 부서 사람들이 결재한 거 그대로 쓰기 기능, 무조건 있어야 하고"*
 *
 * 사람을 그대로 옮기지 않는다. 옮겨 온 결재선의 내부 결재자(그 문서 기안자와
 * 같은 부서 사람)는 **내 부서의 같은 서열**로 바꾸고, 다른 부서 사람은 협조자로
 * 보아 그대로 둔다. 그대로 옮기면 우리 과 문서가 남의 과 팀장에게 올라간다.
 *
 * 바꿀 사람을 못 찾으면 그 칸은 버린다. 조용히 남의 부서 사람을 결재란에
 * 남겨 두는 것보다, 빠진 것을 화면이 말해 주는 편이 낫다.
 */
export async function copyApprovalLine(formData: FormData) {
  const { viewer, approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "drafting",
  );
  const here = `/approvals/${approval.id}`;

  const sourceId = formData.get("sourceId");
  if (typeof sourceId !== "string" || !sourceId) finish(here, "invalid");
  if (sourceId === approval.id) finish(here, "invalid");

  // 볼 수 없는 문서의 결재선은 가져올 수 없다. getApproval 이 RLS 를 그대로 탄다.
  const source = await getApproval(viewer, sourceId);
  if (!source) finish(here, "approval.source_missing");

  const people = await listProfiles();
  const sourceDept = source.drafter.department_id;

  // 기안란은 손대지 않는다.
  //
  // 지우고 다시 넣으면 그 사이에 insert 가 실패했을 때 **기안란이 없는 문서**가
  // 남는다. 그 문서는 상신도 안 되고(「결재선에 기안란이 없습니다」) 화면 어디에도
  // 무엇이 잘못됐는지 나오지 않는다. 있는 것을 그대로 두면 최악이 「협조 칸이
  // 안 들어왔다」로 끝난다.
  const draftStep = approval.steps.find((s) => s.kind === "draft");
  const baseSeq = draftStep?.seq ?? 0;

  const taken = new Set<string>([viewer.id]);
  const line: DraftStep[] = draftStep
    ? []
    : [
        {
          seq: 1,
          kind: "draft",
          approver_id: viewer.id,
          position: positionOf(viewer),
        },
      ];
  let dropped = 0;

  for (const s of source.steps) {
    if (s.kind === "draft") continue;

    const original = people.find((p) => p.id === s.approver_id && p.is_active);
    const internal =
      original !== undefined &&
      sourceDept !== null &&
      original.department_id === sourceDept;

    // 내부 결재선은 우리 과의 같은 서열로 바꾼다. 협조자(다른 부서)는 그대로 둔다.
    const candidate = internal
      ? people.find(
          (p) =>
            p.is_active &&
            p.department_id === viewer.department_id &&
            p.rank === original.rank &&
            p.id !== viewer.id,
        )
      : original;

    if (!candidate || taken.has(candidate.id)) {
      dropped += 1;
      continue;
    }
    taken.add(candidate.id);
    line.push({
      // 기안란을 남겨 두므로 그 뒤 번호부터 이어 붙인다. 같은 번호가 겹치면
      // unique (approval_id, seq) 가 통째로 거절한다.
      seq: baseSeq + line.length + 1,
      kind: s.kind,
      approver_id: candidate.id,
      position: positionOf(candidate),
    });
  }

  const copied = line.filter((s) => s.kind !== "draft").length;
  if (copied === 0) finish(here, "approval.no_approver");
  if (copied + 1 > MAX_STEPS) finish(here, "approval.too_many_steps");

  // 기안란 말고 나머지를 갈아 끼운다. 기안 중인 문서의 결재란은 아직 아무
  // 서명도 없는 뼈대이므로 잃을 기록이 없다.
  const { error: clearError } = await supabase
    .from("approval_step")
    .delete()
    .eq("approval_id", approval.id)
    .neq("kind", "draft");
  if (clearError) finish(here, classifyError(clearError));

  const { error } = await supabase
    .from("approval_step")
    .insert(line.map((s) => ({ ...s, approval_id: approval.id })));
  if (error) finish(here, classifyError(error));

  refresh(approval);
  finish(here, dropped > 0 ? "approval.line_copied_partial" : "approval.line_copied");
}

// ---------------------------------------------------------------------------
// 절차 넷 — 상신 · 결재 · 반려 · 회수
// ---------------------------------------------------------------------------

export async function submitApproval(formData: FormData) {
  const { viewer, approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "drafting",
  );
  const here = `/approvals/${approval.id}`;

  // 아래 셋은 절차가 다시 확인한다. 여기서 먼저 보는 것은 사용자에게 읽을 수
  // 있는 이유를 주기 위해서다 — 절차의 예외 문구는 화면에 그대로 옮길 수 없다.
  const draftStep = approval.steps.find((s) => s.kind === "draft");
  if (!draftStep || draftStep.approver_id !== viewer.id) {
    finish(here, "approval.no_draft_step");
  }
  if (approval.steps.some((s) => s.seq < draftStep.seq)) {
    finish(here, "approval.line_reversed");
  }
  if (
    approval.steps.filter((s) => s.kind !== "draft" && s.kind !== "post_report")
      .length === 0
  ) {
    finish(here, "approval.no_approver");
  }

  const { error } = await supabase.rpc("submit_approval", {
    p_approval_id: approval.id,
  });
  if (error) finish(here, classifyError(error));

  refresh(approval);
  finish(here, "approval.submitted");
}

/**
 * 서명.
 *
 * 차례인지 판정하는 것은 DB 다(app.step_block_reason). 여기서 다시 보지 않는 이유는
 * 두 판정이 어긋나는 순간을 만들지 않기 위해서다 — 화면은 「내 차례」로 그리고
 * DB 는 거절하는 상태가 되면, 사용자는 눌러도 안 되는 버튼을 계속 누른다.
 * 절차가 거절하면 그 이유를 코드로 바꿔 돌려준다.
 */
export async function signApproval(formData: FormData) {
  const { viewer, approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "read",
  );
  const here = `/approvals/${approval.id}`;

  const stepId = formData.get("stepId");
  if (typeof stepId !== "string" || !stepId) finish(here, "invalid");

  // 남의 칸 id 를 실어 보내는 요청을 여기서 끊는다. 절차도 같은 것을 보지만,
  // 그때는 42501 이라 화면이 「권한이 없습니다」밖에 말하지 못한다.
  const step = approval.steps.find((s) => s.id === stepId);
  if (!step || step.approver_id !== viewer.id) finish(here, "denied");

  const opinion = readText(formData, "opinion");
  if (opinion.length > APPROVAL_OPINION_MAX) finish(here, "approval.opinion_long");

  const { error } = await supabase.rpc("sign_approval", {
    p_step_id: stepId,
    p_opinion: opinion || null,
  });
  if (error) finish(here, classifyError(error));

  refresh(approval);
  finish(here, "approval.signed");
}

/** 반려 — 사유 없이는 받지 않는다. 그 문장이 이 제품의 목적이다. */
export async function rejectApproval(formData: FormData) {
  const { viewer, approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "read",
  );
  const here = `/approvals/${approval.id}`;

  const stepId = formData.get("stepId");
  if (typeof stepId !== "string" || !stepId) finish(here, "invalid");

  const step = approval.steps.find((s) => s.id === stepId);
  if (!step || step.approver_id !== viewer.id) finish(here, "denied");

  const opinion = readText(formData, "opinion");
  // 「왜 반려됐는지 물어보러 자리로 가야 하는」 상황을 없애는 것이 목적이다.
  if (!opinion) finish(here, "approval.need_reason");
  if (opinion.length > APPROVAL_OPINION_MAX) finish(here, "approval.opinion_long");

  const { error } = await supabase.rpc("reject_approval", {
    p_step_id: stepId,
    p_opinion: opinion,
  });
  if (error) finish(here, classifyError(error));

  refresh(approval);
  finish(here, "approval.rejected");
}

/** 회수 — 아무도 서명하지 않았을 때만. 한 사람이라도 읽고 서명했다면 없던 일이 아니다. */
export async function withdrawApproval(formData: FormData) {
  const { viewer, approval, supabase } = await openApproval(
    formData.get("approvalId"),
    "read",
  );
  const here = `/approvals/${approval.id}`;

  if (approval.drafter_id !== viewer.id) finish(here, "denied");
  if (approval.state !== "in_progress") finish(here, "approval.locked");
  if (
    approval.steps.some(
      (s) => s.kind !== "draft" && (s.signed_at || s.rejected_at),
    )
  ) {
    finish(here, "approval.cannot_withdraw");
  }

  const { error } = await supabase.rpc("withdraw_approval", {
    p_approval_id: approval.id,
  });
  if (error) finish(here, classifyError(error));

  refresh(approval);
  finish(here, "approval.withdrawn");
}
