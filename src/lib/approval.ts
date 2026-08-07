import type {
  Approval,
  ApprovalKind,
  ApprovalState,
  ApprovalStep,
  ApprovalStepWithApprover,
  Profile,
} from "@/lib/types";
import { CONCUR_KINDS } from "@/lib/types";

/**
 * 결재의 규칙 — 화면 쪽 판정.
 *
 * ── 왜 같은 규칙이 두 곳에 있는가 ───────────────────────────────────────────
 *
 * 실제로 막는 것은 DB다. 서명은 public.sign_approval() 로만 찍히고, 그 안에서
 * app.step_block_reason() 이 같은 판정을 한 번 더 한다(0017). 이 파일이 통째로
 * 틀려도 남의 칸에 서명이 들어가지는 않는다.
 *
 * 그럼에도 여기에 같은 규칙을 적는 이유는 **화면이 그 함수를 부를 수 없어서**다.
 * app 스키마는 PostgREST 에 노출되지 않는다(0017 §1). 그래서 「지금 내 차례인가」를
 * 물어볼 길이 없고, 물어볼 길을 내려면 public 에 겉면 함수를 하나 더 만들어야 한다.
 * 결재함은 문서를 여럿 늘어놓는 화면이라 그 왕복이 문서 수만큼 늘어난다.
 *
 * 대신 지켜야 하는 것 — **판정 문구까지 SQL 과 같은 말로 적는다.** 다르게 적으면
 * 화면이 「앞 순서가 남았습니다」라고 말하는데 DB 는 다른 이유로 막는 날이 온다.
 * 규칙이 바뀌면 두 파일을 같이 고친다. types.ts 의 sectionLockActive() 와 같은
 * 자리이고, 같은 이유로 남겨 둔 중복이다.
 */

// ---------------------------------------------------------------------------
// 지금 이 칸을 처리할 수 있는가 — app.step_block_reason() 과 같은 규칙
// ---------------------------------------------------------------------------

type StepLike = Pick<
  ApprovalStep,
  "id" | "seq" | "kind" | "approver_id" | "signed_at" | "rejected_at"
>;

/**
 * 처리할 수 없는 이유. 처리할 수 있으면 null.
 *
 * 인자로 형제 칸 전부를 받는다. 앞 순서와 전결 여부를 봐야 하기 때문이다
 * (SQL 도 같은 표를 두 번 더 읽는다).
 */
export function stepBlockReason(
  step: StepLike,
  approval: Pick<Approval, "state">,
  steps: readonly StepLike[],
  actorId: string,
): string | null {
  if (step.approver_id !== actorId) return "내 결재칸이 아닙니다.";
  if (step.signed_at || step.rejected_at) return "이미 처리한 결재칸입니다.";

  // 사후보고는 줄의 바깥에 있다. 문서가 끝난 뒤에 하는 일이다.
  if (step.kind === "post_report") {
    return approval.state === "completed"
      ? null
      : "사후보고는 결재가 끝난 뒤에 합니다.";
  }

  // 전결이 찍히면 그 뒤 칸은 서명하지 않는다. 결재란에 사선을 긋는 자리다.
  // 상태 검사보다 먼저 본다 — 그래야 「이미 완결된 문서」가 아니라 「전결로 끝난
  // 문서」라고 말할 수 있다(SQL 의 순서를 그대로 따른다).
  if (
    steps.some(
      (d) => d.kind === "delegated" && d.signed_at && d.seq < step.seq,
    )
  ) {
    return "전결로 끝난 문서입니다.";
  }

  if (approval.state !== "in_progress") {
    return approval.state === "drafting"
      ? "아직 상신되지 않은 문서입니다."
      : approval.state === "completed"
        ? "이미 완결된 문서입니다."
        : approval.state === "rejected"
          ? "반려된 문서입니다."
          : "회수된 문서입니다.";
  }

  // 병렬협조는 줄을 서지 않는다. 나머지는 앞 순서가 끝나야 차례가 온다.
  if (
    step.kind !== "concur_par" &&
    steps.some(
      (p) =>
        p.seq < step.seq &&
        p.kind !== "concur_par" &&
        p.kind !== "post_report" &&
        !p.signed_at,
    )
  ) {
    return "앞 순서의 결재가 아직 끝나지 않았습니다.";
  }

  return null;
}

/** 이 사람이 지금 처리해야 하는 칸. 없으면 null. */
export function myTurn(
  approval: Pick<Approval, "state">,
  steps: readonly ApprovalStepWithApprover[],
  viewerId: string,
): ApprovalStepWithApprover | null {
  return (
    steps.find(
      (s) => stepBlockReason(s, approval, steps, viewerId) === null,
    ) ?? null
  );
}

/** 이 사람의 칸 중 아직 처리하지 않은 것. 차례가 아직 아닐 수도 있다. */
export function myPendingStep(
  steps: readonly ApprovalStepWithApprover[],
  viewerId: string,
): ApprovalStepWithApprover | null {
  return (
    steps.find(
      (s) => s.approver_id === viewerId && !s.signed_at && !s.rejected_at,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// 진행률 — flex 의 「진행 중 3/5」
// ---------------------------------------------------------------------------

/**
 * 몇 칸 중 몇 칸이 서명되었는가.
 *
 * 사후보고는 세지 않는다. 문서가 끝난 뒤에 하는 일이라 분모에 넣으면
 * 완결된 문서가 「4/5」로 보인다(app.approval_is_done 도 같은 칸을 뺀다).
 */
export function approvalProgress(
  steps: readonly Pick<ApprovalStep, "kind" | "signed_at">[],
): {
  signed: number;
  total: number;
} {
  const counted = steps.filter((s) => s.kind !== "post_report");
  return {
    signed: counted.filter((s) => s.signed_at).length,
    total: counted.length,
  };
}

/** 결재란 위 줄(결재)과 아래 줄(협조)로 가른다. 세 제품이 공통으로 쓰는 문법이다. */
export function splitSteps<T extends Pick<ApprovalStep, "kind" | "seq">>(
  steps: readonly T[],
): { main: T[]; concur: T[]; post: T[] } {
  const bySeq = [...steps].sort((a, b) => a.seq - b.seq);
  return {
    main: bySeq.filter(
      (s) => !CONCUR_KINDS.includes(s.kind) && s.kind !== "post_report",
    ),
    concur: bySeq.filter((s) => CONCUR_KINDS.includes(s.kind)),
    post: bySeq.filter((s) => s.kind === "post_report"),
  };
}

/**
 * 이 칸에 사선을 그을 것인가.
 *
 * 전결이 찍히면 그 뒤 칸은 아무도 서명하지 않는다. 비워 두면 「아직 안 한 사람」으로
 * 읽히므로, 종이 결재가 하는 대로 사선을 긋는다.
 */
export function isStruckOut(
  step: Pick<ApprovalStep, "seq" | "signed_at" | "rejected_at">,
  steps: readonly Pick<ApprovalStep, "seq" | "kind" | "signed_at">[],
): boolean {
  if (step.signed_at || step.rejected_at) return false;
  return steps.some((d) => d.kind === "delegated" && d.signed_at && d.seq < step.seq);
}

// ---------------------------------------------------------------------------
// 결재선 자동 생성
//
// 자문의 말은 이랬다 — 「결재란에 하나하나 입력하는 게 아니라, 바빠 죽겠으니
// 빠바바밥 해야 하고」. 서열은 profile.rank 로 판정한다. position 문자열은
// 표기가 흔들리기 때문이다(0016 의 같은 말).
// ---------------------------------------------------------------------------

export type DraftStep = {
  seq: number;
  kind: ApprovalKind;
  approver_id: string;
  /** 서명 당시의 직위를 글자로 박는다. 인사이동이 옛 문서를 고치지 못하게. */
  position: string;
};

/** 직위 칸은 비울 수 없다(DB의 approval_step_position_check). */
export function positionOf(p: Pick<Profile, "position">): string {
  const raw = (p.position ?? "").trim();
  return raw.length > 0 ? raw.slice(0, 40) : "직원";
}

export type CoopMode = "parallel" | "sequential";

export function isCoopMode(v: unknown): v is CoopMode {
  return v === "parallel" || v === "sequential";
}

/**
 * 기안자 위로 훑어 결재선을 만든다.
 *
 *   기안자 → 같은 부서에서 rank 가 더 작은(위) 사람을 급마다 한 명씩
 *          → 팀장(40) · 과장(30) · 국장(20) 순
 *          → 마지막 사람이 'final', 중간이 'review'
 *
 * 급마다 한 명만 넣는다. 같은 급이 둘이면 결재란이 옆으로 늘어나기만 하고,
 * 누구에게 올릴지는 사람이 고를 일이다(화면에서 바꿀 수 있다).
 * 같은 급이 여럿일 때는 이름순 첫 사람을 고른다 — 무엇을 고르든 임의이므로,
 * 적어도 **여러 번 눌러도 같은 결과가 나오는** 쪽으로 정한다.
 */
export function buildApprovalLine({
  drafter,
  people,
  cooperators = [],
  coopMode = "parallel",
}: {
  drafter: Profile;
  people: readonly Profile[];
  cooperators?: readonly string[];
  coopMode?: CoopMode;
}): DraftStep[] {
  const steps: DraftStep[] = [
    { seq: 1, kind: "draft", approver_id: drafter.id, position: positionOf(drafter) },
  ];

  const uppers = people
    .filter(
      (p) =>
        p.is_active &&
        p.id !== drafter.id &&
        p.department_id !== null &&
        p.department_id === drafter.department_id &&
        p.rank < drafter.rank,
    )
    // 아래 급부터 위로. 팀장 → 과장 → 국장 순으로 결재란이 왼쪽에서 오른쪽으로 간다.
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, "ko"));

  const chosen: Profile[] = [];
  for (const p of uppers) {
    if (chosen.some((c) => c.rank === p.rank)) continue;
    chosen.push(p);
  }

  chosen.forEach((p, i) => {
    steps.push({
      seq: steps.length + 1,
      // 마지막 사람이 최종결재다. 혼자면 그 한 사람이 곧 최종결재자다.
      kind: i === chosen.length - 1 ? "final" : "review",
      approver_id: p.id,
      position: positionOf(p),
    });
  });

  // 협조는 언제나 내부 결재선 뒤의 순번을 받는다.
  //   같은 급과 나란히(parallel) — 줄을 서지 않는다. 언제든 처리할 수 있다
  //   내부 검토 뒤에(sequential) — 앞이 끝나야 차례가 온다
  // 순번이 뒤라도 병렬협조는 기다리지 않으므로, 자리는 결재란의 아래 줄 하나다.
  const taken = new Set(steps.map((s) => s.approver_id));
  for (const id of cooperators) {
    if (taken.has(id)) continue; // 한 사람이 한 문서에 두 칸을 갖지 않는다
    const p = people.find((x) => x.id === id && x.is_active);
    if (!p) continue;
    taken.add(id);
    steps.push({
      seq: steps.length + 1,
      kind: coopMode === "parallel" ? "concur_par" : "concur_seq",
      approver_id: p.id,
      position: positionOf(p),
    });
  }

  return steps;
}

/**
 * 협조자로 부를 만한 사람 — 「급을 맞추어 협조」.
 *
 * 자문에서 나온 두 방식 중 하나다. 협조는 같은 급끼리 주고받는 것이 관행이라,
 * 다른 부서의 같은 rank 를 먼저 보여 준다. 아무도 없으면 그 부서에서 가장
 * 아래 급을 준다 — 빈 목록을 주는 것보다 낫다.
 */
export function peersInDepartment(
  people: readonly Profile[],
  departmentId: string,
  rank: number,
): Profile[] {
  const inDept = people.filter(
    (p) => p.is_active && p.department_id === departmentId,
  );
  const sameRank = inDept.filter((p) => p.rank === rank);
  const pool = sameRank.length > 0 ? sameRank : inDept;
  return [...pool].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko"));
}

// ---------------------------------------------------------------------------
// 결재함의 칸 나누기
// ---------------------------------------------------------------------------

export const APPROVAL_BOXES = [
  "todo",
  "upcoming",
  "handled",
  "drafting",
  "done",
  "all",
] as const;

export type ApprovalBox = (typeof APPROVAL_BOXES)[number];

export function isApprovalBox(v: unknown): v is ApprovalBox {
  return typeof v === "string" && (APPROVAL_BOXES as readonly string[]).includes(v);
}

export const APPROVAL_BOX_LABEL: Record<ApprovalBox, string> = {
  todo: "대기",
  upcoming: "예정",
  handled: "처리",
  drafting: "기안 중",
  done: "완료",
  all: "전체",
};

export const APPROVAL_BOX_HINT: Record<ApprovalBox, string> = {
  todo: "지금 내가 서명하거나 반려해야 하는 문서입니다.",
  upcoming: "내 칸이 있지만 앞 순서가 아직 끝나지 않은 문서입니다.",
  handled: "내가 서명하거나 반려한 문서입니다.",
  drafting: "아직 상신하지 않은 내 초안입니다. 나 말고는 아무도 볼 수 없습니다.",
  done: "완결·반려·회수로 끝난 문서입니다.",
  all: "내가 볼 수 있는 결재 문서 전부입니다.",
};

/**
 * 문서 하나가 이 사람의 어느 칸에 들어가는가.
 *
 * 「대기」와 「예정」을 가르는 것이 차례 판정이고, 그래서 이 파일 맨 위의
 * 규칙이 필요하다. 한 문서가 여러 칸에 들어갈 수 있다(끝난 문서를 내가
 * 서명했으면 「처리」이면서 「완료」다).
 */
export function boxesOf(
  approval: Pick<Approval, "state" | "drafter_id">,
  steps: readonly ApprovalStepWithApprover[],
  viewerId: string,
): ApprovalBox[] {
  const boxes: ApprovalBox[] = ["all"];

  if (approval.state === "drafting") {
    if (approval.drafter_id === viewerId) boxes.push("drafting");
    return boxes;
  }

  const pending = myPendingStep(steps, viewerId);
  if (pending) {
    boxes.push(
      stepBlockReason(pending, approval, steps, viewerId) === null
        ? "todo"
        : "upcoming",
    );
  }

  // 기안란은 상신하면서 스스로 찍은 서명이라 「처리」로 세지 않는다.
  // 그렇게 세면 내가 올린 모든 문서가 「내가 처리한 것」이 되어 칸이 뜻을 잃는다.
  if (
    steps.some(
      (s) =>
        s.approver_id === viewerId &&
        s.kind !== "draft" &&
        (s.signed_at || s.rejected_at),
    )
  ) {
    boxes.push("handled");
  }

  if (approval.state !== "in_progress") boxes.push("done");

  return boxes;
}

/** 결재함의 정렬 — 최근에 움직인 것이 위로. */
export function byRecent(
  a: Pick<Approval, "created_at" | "closed_at">,
  b: Pick<Approval, "created_at" | "closed_at">,
): number {
  return (b.closed_at ?? b.created_at).localeCompare(a.closed_at ?? a.created_at);
}

/** 배지에 쓰는 한 줄. 진행 중일 때만 분자·분모가 붙는다. */
export function approvalStateLine(
  state: ApprovalState,
  progress: { signed: number; total: number },
): string {
  return state === "in_progress"
    ? `진행 중 ${progress.signed}/${progress.total}`
    : state === "drafting"
      ? "기안 중"
      : state === "completed"
        ? "완결"
        : state === "rejected"
          ? "반려"
          : "회수";
}
