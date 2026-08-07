/**
 * 데이터 접근 층 — 화면과 저장소 사이의 유일한 경계.
 *
 * 지금은 목업이 답한다. Supabase를 연결하면 이 파일의 **함수 본문만** 바뀌고
 * 화면 코드는 한 줄도 손대지 않는다. 그래서 반환 타입을 조인 결과 모양
 * (WorkListItem 등)으로 미리 고정해 두었다.
 *
 * 열람 권한 판정은 DB의 app.can_read_work()와 같은 규칙을 여기서도 흉내 낸다.
 * 목업 단계에서도 계정을 바꾸면 보이는 업무가 실제로 달라져야,
 * "권한은 DB가 강제한다"는 설계가 화면에서 확인 가능한 주장이 되기 때문이다.
 */

import "server-only";

import {
  accessLogs,
  activities,
  approvalSteps,
  approvals,
  attachments,
  comments,
  docSections,
  documents,
  handoverItems,
  handovers,
  workMembers,
  works,
} from "@/lib/mock/works";
import { departments, profiles } from "@/lib/mock/org";
import { getDemoState, type DemoState } from "@/lib/demo-state";
import type { ApprovalSummary, HandoverView, WorkFilter } from "./types";
import { approvalProgress, byRecent } from "@/lib/approval";
import { daysUntil } from "@/lib/format";
import {
  derivedStatus,
  type AccessLogWithActor,
  type ActivityWithActor,
  type Approval,
  type ApprovalWithSteps,
  type AttachmentWithUploader,
  type CommentWithAuthor,
  type Department,
  type DerivedStatus,
  type DocSectionWithEditor,
  type Document,
  type Handover,
  type MemberWithProfile,
  type Profile,
  type ProfileWithDepartment,
  type Work,
  type WorkListItem,
} from "@/lib/types";

const profileById = new Map(profiles.map((p) => [p.id, p]));
const deptById = new Map(departments.map((d) => [d.id, d]));

function requireProfile(id: string): Profile {
  const p = profileById.get(id);
  if (!p) throw new Error(`목업에 없는 프로필: ${id}`);
  return p;
}

/** 참여자 프로필에 소속 이름을 붙인다. DB 구현에서는 조인으로 따라온다. */
function withDept(p: Profile) {
  return {
    ...p,
    department_name: p.department_id
      ? (deptById.get(p.department_id)?.name ?? null)
      : null,
  };
}

function requireDept(id: string): Department {
  const d = deptById.get(id);
  if (!d) throw new Error(`목업에 없는 부서: ${id}`);
  return d;
}

// ---------------------------------------------------------------------------
// 열람 권한 — supabase/migrations/0002_rls.sql 의 app.can_read_work()와 같은 규칙
// ---------------------------------------------------------------------------

function membersOf(workId: string): MemberWithProfile[] {
  return workMembers
    .filter((m) => m.work_id === workId)
    .map((m) => ({ ...m, profile: withDept(requireProfile(m.profile_id)) }))
    // 소유 → 편집 → 열람 순. 권한이 센 사람이 위에 온다.
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

const ROLE_ORDER = { owner: 0, editor: 1, viewer: 2 } as const;

// ---------------------------------------------------------------------------
// 데모 중 사용자가 바꾼 것 덮어쓰기
//
// 목업은 상수라 고칠 수 없다. 대신 읽을 때마다 쿠키에 담긴 변경분을 얹는다.
// Supabase가 연결되면 이 층은 통째로 없어지고 DB가 진짜 값을 돌려준다.
// ---------------------------------------------------------------------------

function overlayWork(work: Work, state: DemoState): Work {
  const status = state.workStatus[work.id];
  const handedOver = state.transferred.includes(work.id);
  if (!status && !handedOver) return work;

  const successor = handedOver ? handovers[0]?.to_profile_id : undefined;
  return {
    ...work,
    status: status ?? work.status,
    owner_id: successor ?? work.owner_id,
  };
}

function overlayMembers(
  workId: string,
  members: MemberWithProfile[],
  state: DemoState,
): MemberWithProfile[] {
  if (!state.transferred.includes(workId)) return members;
  const h = handovers[0];
  if (!h) return members;

  // 인계가 실행되면 인수자가 소유자가 되고, 인계자는 열람자로 남는다.
  // 남기는 이유는 넘긴 사람에게 물어볼 일이 반드시 생기기 때문이다.
  const next = members.map((m) =>
    m.profile_id === h.from_profile_id
      ? { ...m, role: "viewer" as const }
      : m.profile_id === h.to_profile_id
        ? { ...m, role: "owner" as const }
        : m,
  );
  if (!next.some((m) => m.profile_id === h.to_profile_id)) {
    next.push({
      work_id: workId,
      profile_id: h.to_profile_id,
      role: "owner",
      created_at: new Date().toISOString(),
      profile: withDept(requireProfile(h.to_profile_id)),
    });
  }
  return next.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/**
 * 열람 가능 여부. supabase/migrations/0002_rls.sql 의 app.can_read_work()와 같은 규칙이다.
 * 참여자이거나, 공개 범위가 내 소속을 포함하면 볼 수 있다.
 */
export function canRead(
  work: Work,
  viewer: Profile,
  members: MemberWithProfile[],
): boolean {
  if (members.some((m) => m.profile_id === viewer.id)) return true;
  if (work.visibility === "city") return true;
  if (work.visibility === "department")
    return viewer.department_id === work.department_id;
  return false;
}

// ---------------------------------------------------------------------------
// 조립
// ---------------------------------------------------------------------------

function toListItem(raw: Work, state: DemoState): WorkListItem {
  const work = overlayWork(raw, state);
  const members = overlayMembers(work.id, membersOf(work.id), state);
  const prev = work.previous_year_work_id
    ? works.find((w) => w.id === work.previous_year_work_id)
    : undefined;

  const deptIds = new Set(members.map((m) => m.profile.department_id));
  deptIds.add(work.department_id);

  return {
    ...work,
    department: requireDept(work.department_id),
    owner: requireProfile(work.owner_id),
    members,
    derived: derivedStatus(work),
    comment_count:
      comments.filter((c) => c.work_id === work.id && !c.deleted_at).length +
      state.comments.filter((c) => c.work_id === work.id).length,
    attachment_count: attachments.filter((a) => a.work_id === work.id).length,
    previous_year: prev
      ? { id: prev.id, title: prev.title, fiscal_year: prev.fiscal_year }
      : null,
    department_count: deptIds.size,
  };
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

export async function listWorks(viewer: Profile, filter: WorkFilter = {}) {
  const state = await getDemoState();
  const q = filter.q?.trim().toLowerCase();

  return works
    .filter((w) => (filter.archived ? Boolean(w.archived_at) : !w.archived_at))
    .map((w) => toListItem(w, state))
    .filter((w) => canRead(w, viewer, w.members))
    .filter((w) => !filter.departmentId || w.department_id === filter.departmentId)
    .filter((w) => !filter.mine || w.members.some((m) => m.profile_id === viewer.id))
    .filter(
      (w) =>
        !q ||
        w.title.toLowerCase().includes(q) ||
        (w.description ?? "").toLowerCase().includes(q),
    )
    .filter((w) => !filter.overdueOnly || w.derived === "overdue")
    .sort(byUrgency);
}

/**
 * 정렬 기준: 지연 → 마감 임박 → 마감 없음.
 * 목록의 맨 위는 "지금 손대야 하는 일"이어야 한다. 최근 수정순으로 두면
 * 방치된 업무가 영영 아래로 밀려 내려간다.
 */
function byUrgency(a: WorkListItem, b: WorkListItem) {
  if (a.derived === "overdue" && b.derived !== "overdue") return -1;
  if (b.derived === "overdue" && a.derived !== "overdue") return 1;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.updated_at.localeCompare(a.updated_at);
}

export async function getWork(
  viewer: Profile,
  id: string,
): Promise<WorkListItem | null> {
  const state = await getDemoState();
  const raw = works.find((w) => w.id === id);
  if (!raw) return null;
  const work = toListItem(raw, state);
  // 없는 것과 못 보는 것을 화면에서 구분하지 않는다.
  // 구분하면 "그 업무가 존재한다"는 사실 자체가 새어 나간다.
  if (!canRead(work, viewer, work.members)) return null;
  return work;
}

export async function getWorkDocument(workId: string): Promise<{
  document: Document | null;
  sections: DocSectionWithEditor[];
}> {
  const document = documents.find((d) => d.work_id === workId) ?? null;
  if (!document) return { document: null, sections: [] };
  const sections = docSections
    .filter((s) => s.document_id === document.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      ...s,
      updated_by_profile: s.updated_by ? requireProfile(s.updated_by) : null,
      locked_by_profile: s.locked_by ? requireProfile(s.locked_by) : null,
    }));
  return { document, sections };
}

export async function getActivities(workId: string): Promise<ActivityWithActor[]> {
  return activities
    .filter((a) => a.work_id === workId)
    .map((a) => ({ ...a, actor: a.actor_id ? requireProfile(a.actor_id) : null }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getComments(workId: string): Promise<CommentWithAuthor[]> {
  const state = await getDemoState();
  const extra = state.comments
    .filter((c) => c.work_id === workId)
    .map((c) => ({ ...c, deleted_at: null }));

  return [...comments.filter((c) => c.work_id === workId && !c.deleted_at), ...extra]
    .map((c) => ({ ...c, author: requireProfile(c.author_id) }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getAttachments(workId: string): Promise<AttachmentWithUploader[]> {
  return attachments
    .filter((a) => a.work_id === workId)
    .map((a) => ({ ...a, uploader: requireProfile(a.uploaded_by) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** 내려받기 한 건. 목업에는 실제 파일이 없으므로 메타데이터만 있다. */
export async function getAttachment(
  id: string,
): Promise<AttachmentWithUploader | null> {
  const a = attachments.find((x) => x.id === id);
  return a ? { ...a, uploader: requireProfile(a.uploaded_by) } : null;
}

export async function getDepartments(): Promise<Department[]> {
  return departments;
}

/** 참여자로 부를 수 있는 사람들. DB 구현과 같은 순서(이름순)로 돌려준다. */
export async function listProfiles(): Promise<ProfileWithDepartment[]> {
  return profiles
    .filter((p) => p.is_active)
    .map(withDept)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function getDepartment(id: string): Promise<Department | null> {
  return deptById.get(id) ?? null;
}

/** 실·국 아래 과들. 부서 선택은 2단계까지만 편다. */
export async function getDepartmentTree() {
  const roots = departments.filter((d) => !d.parent_id);
  return roots.map((root) => ({
    ...root,
    children: departments.filter((d) => d.parent_id === root.id),
  }));
}

/**
 * 작년 판 요약 — 「작년 이맘때」 카드에 쓴다.
 * 작년에 무엇을 남겼는지(문서 항목·첨부)까지 보여야 "열어 볼 이유"가 생긴다.
 */
export async function getPreviousYearBrief(
  viewer: Profile,
  previousWorkId: string,
) {
  const raw = works.find((w) => w.id === previousWorkId);
  if (!raw) return null;

  // 올해 업무를 볼 수 있다고 작년 업무까지 볼 수 있는 것은 아니다.
  // 조직 개편으로 소관 부서가 바뀌었거나 작년에 공개범위가 달랐을 수 있다.
  // 여기서 확인하지 않으면 작년 문서의 항목 제목이 그대로 새어 나간다.
  const state = await getDemoState();
  const work = toListItem(raw, state);
  if (!canRead(work, viewer, work.members)) return null;

  const { document, sections } = await getWorkDocument(work.id);
  return {
    work,
    document,
    headings: sections.map((s) => s.heading).filter((h): h is string => Boolean(h)),
    attachmentCount: attachments.filter((a) => a.work_id === work.id).length,
    /** 마지막으로 손댄 시각 — 작년 일이 언제 끝났는지 */
    lastTouchedAt:
      activities
        .filter((a) => a.work_id === work.id)
        .at(-1)?.created_at ?? work.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 대시보드
// ---------------------------------------------------------------------------

export async function getDashboard(viewer: Profile) {
  const mine = await listWorks(viewer, { mine: true });

  const counts: Record<DerivedStatus, number> = {
    todo: 0,
    doing: 0,
    review: 0,
    done: 0,
    overdue: 0,
  };
  for (const w of mine) counts[w.derived] += 1;

  const myWorkIds = new Set(mine.map((w) => w.id));
  const recent = activities
    .filter((a) => myWorkIds.has(a.work_id))
    .filter((a) => a.actor_id !== viewer.id) // 내가 한 일은 소식이 아니다
    .map((a) => {
      const work = works.find((w) => w.id === a.work_id);
      if (!work) throw new Error(`이력이 가리키는 업무가 없습니다: ${a.work_id}`);
      return {
        ...a,
        actor: a.actor_id ? requireProfile(a.actor_id) : null,
        work: { id: work.id, title: work.title },
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);

  return {
    mine,
    counts,
    recent,
    /** 기한이 지났거나 7일 안에 닥친 내 업무 */
    urgent: mine.filter(
      (w) => w.derived === "overdue" || isDueSoon(w.due_date, w.derived),
    ),
  };
}

function isDueSoon(due: string | null, derived: DerivedStatus) {
  if (!due || derived === "done") return false;
  const d = daysUntil(due);
  return d >= 0 && d <= 7;
}

// ---------------------------------------------------------------------------
// 결재
//
// 누가 무엇을 보는가는 0017 의 approval_select 와 같은 규칙이다.
//   기안 중  → 기안자만. 아직 아무에게도 보내지 않은 초안이다
//   그 뒤    → 기안자 + 그 업무를 볼 수 있는 사람 + 결재선에 이름이 있는 사람
//
// 마지막 한 겹이 협조를 가능하게 한다 — 다른 과 사람이 그 과의 업무를 통째로
// 볼 이유는 없지만, 자기 이름이 결재란에 올라간 그 문서 한 장은 봐야 한다.
// ---------------------------------------------------------------------------

function toApprovalView(
  a: Approval,
  viewer: Profile,
  state: DemoState,
): ApprovalWithSteps | null {
  const steps = approvalSteps
    .filter((s) => s.approval_id === a.id)
    .sort((x, y) => x.seq - y.seq)
    .map((s) => ({ ...s, approver: requireProfile(s.approver_id) }));

  const raw = works.find((w) => w.id === a.work_id);
  const work = raw ? toListItem(raw, state) : null;
  const canReadWork = work ? canRead(work, viewer, work.members) : false;

  const visible =
    a.drafter_id === viewer.id ||
    (a.state !== "drafting" &&
      (canReadWork || steps.some((s) => s.approver_id === viewer.id)));
  if (!visible) return null;

  return {
    ...a,
    drafter: requireProfile(a.drafter_id),
    steps,
    // 업무를 볼 수 없으면 제목도 주지 않는다. DB 구현에서는 조인이 애초에
    // null 을 돌려주고, 화면은 그 자리에 「열람 권한이 없는 업무」라고 적는다.
    work: canReadWork && work ? { id: work.id, title: work.title } : null,
  };
}

export async function listApprovals(
  viewer: Profile,
  limit = 100,
): Promise<ApprovalWithSteps[]> {
  const state = await getDemoState();
  return approvals
    .map((a) => toApprovalView(a, viewer, state))
    .filter((a): a is ApprovalWithSteps => a !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getApprovalsForWork(
  viewer: Profile,
  workId: string,
): Promise<ApprovalWithSteps[]> {
  const state = await getDemoState();
  return approvals
    .filter((a) => a.work_id === workId)
    .map((a) => toApprovalView(a, viewer, state))
    .filter((a): a is ApprovalWithSteps => a !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** 내 칸이 아직 남아 있는 결재 문서. 홈의 「결재 대기」가 쓴다. */
export async function listApprovalsAwaitingMe(
  viewer: Profile,
): Promise<ApprovalWithSteps[]> {
  const state = await getDemoState();
  const mine = new Set(
    approvalSteps
      .filter(
        (s) => s.approver_id === viewer.id && !s.signed_at && !s.rejected_at,
      )
      .map((s) => s.approval_id),
  );
  return approvals
    .filter((a) => mine.has(a.id))
    .map((a) => toApprovalView(a, viewer, state))
    .filter((a): a is ApprovalWithSteps => a !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * 업무 카드에 붙는 결재 진행률. db 구현과 **같은 규칙**으로 고른다 —
 * 기안 중인 문서는 빼고, 가장 최근에 움직인 것 하나가 배지가 된다.
 */
export async function getApprovalSummaries(
  viewer: Profile,
  workIds: readonly string[],
): Promise<Map<string, ApprovalSummary>> {
  const wanted = new Set(workIds);
  if (wanted.size === 0) return new Map();

  const state = await getDemoState();
  const visible = approvals
    .filter((a) => wanted.has(a.work_id) && a.state !== "drafting")
    .map((a) => toApprovalView(a, viewer, state))
    .filter((a): a is ApprovalWithSteps => a !== null);

  const grouped = new Map<string, ApprovalWithSteps[]>();
  for (const a of visible) {
    const list = grouped.get(a.work_id);
    if (list) list.push(a);
    else grouped.set(a.work_id, [a]);
  }

  const byWork = new Map<string, ApprovalSummary>();
  for (const [workId, list] of grouped) {
    const latest = [...list].sort(byRecent)[0];
    const progress = approvalProgress(latest.steps);
    byWork.set(workId, {
      count: list.length,
      latest: {
        id: latest.id,
        state: latest.state,
        signed: progress.signed,
        total: progress.total,
      },
    });
  }
  return byWork;
}

export async function getApproval(
  viewer: Profile,
  id: string,
): Promise<ApprovalWithSteps | null> {
  const state = await getDemoState();
  const a = approvals.find((x) => x.id === id);
  return a ? toApprovalView(a, viewer, state) : null;
}

// ---------------------------------------------------------------------------
// 인계·인수
// ---------------------------------------------------------------------------

/** 내가 넘겨야 하거나 넘겨받는 인계 건 */
export async function getHandoverFor(viewer: Profile): Promise<HandoverView | null> {
  const h = handovers.find(
    (x) => x.from_profile_id === viewer.id || x.to_profile_id === viewer.id,
  );
  return h ? buildHandover(h) : null;
}

export async function getHandover(
  _viewer: Profile,
  id: string,
): Promise<HandoverView | null> {
  const h = handovers.find((x) => x.id === id);
  return h ? buildHandover(h) : null;
}

async function buildHandover(base: Handover): Promise<HandoverView> {
  const state = await getDemoState();
  const status = state.handoverStatus ?? base.status;
  const handover: Handover = {
    ...base,
    status,
    confirmed_at:
      status === "confirmed" || status === "completed"
        ? (base.confirmed_at ?? base.generated_at)
        : null,
    completed_at: status === "completed" ? (base.completed_at ?? null) : null,
  };

  return {
    handover,
    from: requireProfile(base.from_profile_id),
    to: requireProfile(base.to_profile_id),
    items: handoverItems
      .filter((i) => i.handover_id === base.id)
      .map((i) => {
        const work = works.find((w) => w.id === i.work_id);
        if (!work) throw new Error(`인계 대상 업무를 찾을 수 없습니다: ${i.work_id}`);
        return {
          work: toListItem(work, state),
          transferred: state.transferred.includes(i.work_id) || i.transferred,
        };
      }),
  };
}

// ---------------------------------------------------------------------------
// 열람기록
// ---------------------------------------------------------------------------

/**
 * 내가 볼 수 있는 업무에 대한 열람기록만 돌려준다.
 * 열람기록 자체가 "누가 무엇에 관심이 있는가"라는 정보이므로,
 * 볼 수 없는 업무의 기록이 새면 그것 역시 유출이다.
 */
export async function listAccessLogs(
  viewer: Profile,
  limit = 50,
): Promise<AccessLogWithActor[]> {
  const state = await getDemoState();
  const readable = new Map(
    works
      .map((w) => toListItem(w, state))
      .filter((w) => canRead(w, viewer, w.members))
      .map((w) => [w.id, w] as const),
  );

  return accessLogs
    .filter((l) => l.work_id !== null && readable.has(l.work_id))
    .slice(0, limit)
    .map((l) => {
      const work = readable.get(l.work_id as string);
      return {
        ...l,
        actor: l.actor_id ? requireProfile(l.actor_id) : null,
        work: work ? { id: work.id, title: work.title } : null,
      };
    });
}

/** 이 업무를 누가 열어 봤는지 — 업무 상세의 이력 탭에서 함께 보여준다 */
export async function getAccessLogsForWork(workId: string): Promise<AccessLogWithActor[]> {
  return accessLogs
    .filter((l) => l.work_id === workId)
    .map((l) => ({
      ...l,
      actor: l.actor_id ? requireProfile(l.actor_id) : null,
      work: null,
    }));
}
