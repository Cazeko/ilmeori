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
  notes,
  notifications,
  workMembers,
  works,
} from "@/lib/mock/works";
import { departments, profiles } from "@/lib/mock/org";
import { getDemoState, type DemoState } from "@/lib/demo-state";
import { searchTerm } from "@/lib/search-term";
import { ACCESS_LOG_LIMIT, WORKS_LIMIT, byUrgency } from "./types";
import type {
  ApprovalSummary,
  HandoverSummary,
  HandoverView,
  WorkFilter,
  WorkRecords,
} from "./types";
import { approvalProgress, byRecent } from "@/lib/approval";
import { groupThreads } from "@/lib/note";
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
  type HandoverMessageWithAuthor,
  type MemberWithProfile,
  type Note,
  type NoteThread,
  type NoteWithPeople,
  type AppNotification,
  type NotificationWithActor,
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
    document_count: documents.filter((d) => d.work_id === work.id).length,
    previous_year: prev
      ? { id: prev.id, title: prev.title, fiscal_year: prev.fiscal_year }
      : null,
    department_count: deptIds.size,
  };
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

/**
 * 조건에 맞는 업무 — 상한을 걸기 **전**까지.
 *
 * 목록과 「지연 N건」이 같은 조건을 보게 한 자리다. 둘이 갈라지면 화면이
 * 「지연 3건」이라 적어 놓고 세 장이 아닌 목록을 보여 준다. Supabase 구현도
 * 같은 이유로 조건을 한 함수에 모아 뒀다(db.ts 의 worksFiltered).
 */
function matching(
  viewer: Profile,
  filter: WorkFilter,
  state: Awaited<ReturnType<typeof getDemoState>>,
) {
  // Supabase 구현과 **같은 함수**로 검색어를 다듬는다. 여기만 날 검색어를
  // 쓰면 같은 입력에 두 구현이 다른 답을 한다(search-term.ts 머리말).
  const q = searchTerm(filter.q)?.toLowerCase() ?? null;
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
    .filter((w) => !filter.overdueOnly || w.derived === "overdue");
}

/**
 * 업무 목록.
 *
 * 목업은 지어낸 스물몇 건이라 상한에 걸릴 일이 없다. 그래도 **자르는 자리는
 * 둔다** — 두 구현이 같은 서명과 같은 규칙을 갖고 있어야 화면이 어느 쪽을
 * 쓰든 같은 답을 받는다(data/index.ts 의 약속). 여기만 상한이 없으면
 * 「데모에서는 되는데 실서비스에서는 안 보인다」가 생긴다.
 */
export async function listWorks(
  viewer: Profile,
  filter: WorkFilter = {},
  limit = WORKS_LIMIT,
) {
  const state = await getDemoState();
  return matching(viewer, filter, state).sort(byUrgency).slice(0, limit);
}

/**
 * 「기한이 지난 업무 N건」의 N — 상한과 무관하게 전부 센다.
 *
 * 목록을 세지 않고 따로 세는 이유는 Supabase 구현과 같다. 목록은 100건에서
 * 잘리므로 101번째 지연 업무가 수에서 빠진다.
 */
export async function countOverdueWorks(
  viewer: Profile,
  filter: WorkFilter = {},
): Promise<number> {
  const state = await getDemoState();
  return matching(viewer, { ...filter, overdueOnly: true }, state).length;
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

/**
 * 문서 한 판과 그 항목.
 *
 * 목업 문서 중 하나(감량 시범사업 계획)는 **서식 문서**다. blocks 가 차 있고,
 * 그러면서 doc_section 도 그대로 있다. 둘 다 있는 것이 정상이다 —
 * 서식 문서로 옮기는 것은 되돌릴 수 없어서 항목을 안전망으로 남기기 때문이고
 * (src/lib/actions/rich-doc.ts 의 convertToRichDoc), 목업은 옮긴 직후의
 * 상태를 그대로 보여 준다. 화면은 blocks 가 있으면 그쪽을 그린다.
 *
 * 데모 모드는 읽기 전용이므로(env.ts 의 canMutate) 여기서 blocks 가 바뀌는 길은
 * 없다. 쿠키에 담기에는 문서 한 벌이 너무 크다 — 4KB 상한을 첫 저장에서 넘긴다.
 */
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
    .map((c) => ({
      ...c,
      author: requireProfile(c.author_id),
      // 목업에는 부름이 없다 — 데모 모드는 대화를 쿠키에 담고, 부른 사람까지
      // 담기 시작하면 4KB 를 더 빨리 넘긴다. 화면은 빈 배열에서도 그대로 돈다.
      mentions: [],
    }))
  // 시각이 같은 대화가 둘 있으면 순서가 정해지지 않는다. 그러면 「같은 기록에서
  // 두 번 뽑으면 같은 문서가 나온다」가 깨지고, 업무별 상한(최근 3건)이 다른
  // 대화를 고를 수도 있다 — 화면에 뜬 서식과 저장해 둔 판이 달라진다.
  // uuid 는 단조롭지 않지만 **안정적**이라 가름쇠로는 충분하다.
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
}

/**
 * 쪽지.
 *
 * db 구현과 같은 것을 흉내 낸다 — 읽는 사람은 셋이다(보낸 사람 · 받은 사람 ·
 * 그 업무를 읽을 수 있는 사람). 목업에서도 계정을 바꾸면 보이는 쪽지가 실제로
 * 달라져야, 「권한은 DB가 강제한다」가 화면에서 확인 가능한 주장이 된다.
 *
 * **데모 모드에서는 쪽지를 보낼 수 없다.** 쿠키 4KB 에 1,000자짜리 쪽지를 담기
 * 시작하면 몇 통 만에 넘치고, 브라우저는 넘친 쿠키를 조용히 통째로 버린다.
 * 방금 보낸 쪽지가 새로고침하면 사라지는 화면은 없는 것만 못하다
 * (getHandoverNotes 와 같은 판단이다). 화면은 canMutate 로 쓰는 칸 자체를
 * 그리지 않으므로, 적을 곳이 있는데 안 저장되는 상태는 생기지 않는다.
 */
function withPeople(n: Note): NoteWithPeople {
  return {
    ...n,
    author: requireProfile(n.author_id),
    recipient: requireProfile(n.recipient_id),
  };
}

/** 이 사람이 이 쪽지를 읽을 수 있는가 — 0019 의 note_select 정책과 같은 규칙. */
async function canReadNote(n: Note, viewer: Profile): Promise<boolean> {
  if (n.author_id === viewer.id || n.recipient_id === viewer.id) return true;
  const work = works.find((w) => w.id === n.work_id);
  if (!work) return false;
  const state = await getDemoState();
  return canRead(work, viewer, overlayMembers(work.id, membersOf(work.id), state));
}

export async function listNoteThreads(viewer: Profile): Promise<NoteThread[]> {
  const mine = notes.filter(
    (n) => !n.deleted_at && (n.author_id === viewer.id || n.recipient_id === viewer.id),
  );
  const titles = new Map(works.map((w) => [w.id, w.title]));
  return groupThreads(
    mine.map(withPeople),
    viewer.id,
    (id) => titles.get(id) ?? "업무",
  );
}

export async function getNoteThread(
  threadId: string,
  viewer: Profile,
): Promise<NoteThread | null> {
  const rows = notes.filter((n) => n.thread_id === threadId && !n.deleted_at);
  if (rows.length === 0) return null;
  const mine = rows.some(
    (n) => n.author_id === viewer.id || n.recipient_id === viewer.id,
  );
  if (!mine) return null;
  const title = works.find((w) => w.id === rows[0].work_id)?.title ?? "업무";
  return groupThreads(rows.map(withPeople), viewer.id, () => title)[0] ?? null;
}

export async function getWorkNoteThreads(
  workId: string,
  viewer: Profile,
  workTitle: string,
): Promise<NoteThread[]> {
  const here = notes.filter((n) => n.work_id === workId && !n.deleted_at);
  const allowed: Note[] = [];
  for (const n of here) {
    if (await canReadNote(n, viewer)) allowed.push(n);
  }
  return groupThreads(allowed.map(withPeople), viewer.id, () => workTitle);
}

/**
 * 알림 — 목업에는 **만드는 길이 없다.**
 *
 * 알림은 트리거가 만든다. 데모 모드에는 트리거가 도는 DB 가 없고, 쿠키에
 * 담기에는 갈래도 많고 수도 많다. 그래서 시드로 넣어 둔 것만 보인다 —
 * 화면이 어떻게 생겼는지는 그것으로 충분히 보이고, 「읽음」이 쿠키에 안 남는
 * 것은 데모의 다른 자리들과 같은 성질이다.
 */
export async function listNotifications(
  viewer: Profile,
  limit: number,
): Promise<NotificationWithActor[]> {
  return notifications
    .filter((n) => n.recipient_id === viewer.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((n) => ({
      ...n,
      actor: n.actor_id ? requireProfile(n.actor_id) : null,
    }));
}

export async function countUnreadNotifications(viewer: Profile): Promise<number> {
  return notifications.filter((n) => n.recipient_id === viewer.id && !n.read_at)
    .length;
}

export async function markNotificationRead(
  id: number,
): Promise<AppNotification | null> {
  // 데모에는 찍을 곳이 없다. 목적지만 돌려준다 — 눌렀을 때 이동은 되어야 한다.
  return notifications.find((n) => n.id === id) ?? null;
}

export async function markAllNotificationsRead(_viewer: Profile): Promise<void> {
  // 데모에는 찍을 곳이 없다.
}

export async function getAttachments(workId: string): Promise<AttachmentWithUploader[]> {
  return attachments
    .filter((a) => a.work_id === workId)
    .map((a) => ({ ...a, uploader: requireProfile(a.uploaded_by) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * 여러 업무에 딸린 기록을 한 번에 — Supabase 구현과 같은 계약.
 *
 * 목업에는 왕복이 없으므로 여기서는 낱개 함수들을 그대로 모아 준다.
 * 여기서 빨라질 것은 없고, **두 구현이 같은 모양을 돌려주는 것**만이 목적이다.
 * (그래서 정렬·삭제된 대화 제외·데모 상태 병합이 전부 낱개 함수에 맡겨져 있다)
 *
 * db 구현과 맞춰 둔 두 가지: id 를 소문자로 맞추고, uuid 모양이 아닌 것은 뺀다.
 * 목업은 find 로 찾으므로 걸러 내지 않아도 동작하지만, 걸러 내지 않으면
 * 결과 Map 의 **키 집합**이 두 구현에서 달라진다.
 */
/** db 구현과 같은 규칙. 여기서도 걸러야 두 구현의 키 집합이 같아진다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function gatherForWorks(
  workIds: string[],
): Promise<Map<string, WorkRecords>> {
  const ids = [...new Set(workIds.map((id) => id.toLowerCase()))].filter((id) =>
    UUID.test(id),
  );
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, WorkRecords]> => {
      const [{ document, sections }, activities, attachments, comments] =
        await Promise.all([
          getWorkDocument(id),
          getActivities(id),
          getAttachments(id),
          getComments(id),
        ]);
      return [id, { document, sections, activities, attachments, comments }];
    }),
  );
  return new Map(entries);
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

/**
 * 내가 얽힌 인계 전부(db.ts 의 같은 이름 참조).
 *
 * 시드에는 인계가 한 건뿐이고 데모에서는 새 인계를 만들 수 없다(canMutate).
 * 그래서 이 목록은 목업에서 **0 또는 1**이다 — 그래도 화면이 두 구현에서
 * 같은 모양을 받아야 하므로 빈 배열을 돌려주지 않고 그 한 건을 담는다.
 */
export async function listHandovers(
  viewer: Profile,
): Promise<HandoverSummary[]> {
  const state = await getDemoState();
  return handovers
    .filter(
      (x) => x.from_profile_id === viewer.id || x.to_profile_id === viewer.id,
    )
    .map((base) => {
      const status = state.handoverStatus ?? base.status;
      const items = handoverItems.filter((i) => i.handover_id === base.id);
      return {
        id: base.id,
        status,
        from: requireProfile(base.from_profile_id),
        to: requireProfile(base.to_profile_id),
        itemCount: items.length,
        transferredCount: items.filter(
          (i) => state.transferred.includes(i.work_id) || i.transferred,
        ).length,
        created_at: base.created_at,
        completed_at:
          status === "completed"
            ? (base.completed_at ?? state.completedAt ?? null)
            : null,
      };
    });
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
    // 데모에서 실행했으면 그때 적어 둔 시각을 쓴다. 없으면 null 이고, 서식은
    // 그때만 「오늘 (예정)」으로 찍는다(print-sheet.tsx) — 「끝났습니다」와
    // 「예정」이 한 화면에 같이 서지 않게 하는 것이 이 한 줄의 전부다.
    completed_at:
      status === "completed"
        ? (base.completed_at ?? state.completedAt ?? null)
        : null,
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

/**
 * 데모의 인계 문답.
 *
 * 쿠키에 담긴 줄을 그대로 돌려준다. `handover_id` 는 쿠키에 없다 — 데모에
 * 인계 건이 하나뿐이라 담지 않았고(demo-state.ts), 그래서 **여기서 그 한
 * 건인지 확인한다.** 확인 없이 돌려주면 다른 id 로 물었을 때 남의 문답을
 * 돌려주는 모양이 되고, 목업이 정책보다 느슨해지는 자리는 만들지 않는다.
 */
export async function getHandoverMessages(
  handoverId: string,
): Promise<HandoverMessageWithAuthor[]> {
  const known = handovers.find((h) => h.id === handoverId);
  if (!known) return [];

  const state = await getDemoState();
  return state.handoverMessages.map((m) => ({
    id: m.id,
    handover_id: handoverId,
    author_id: m.author_id,
    body: m.body,
    created_at: m.created_at,
    author: requireProfile(m.author_id),
  }));
}

// ---------------------------------------------------------------------------
// 열람기록
// ---------------------------------------------------------------------------

/**
 * **본인이 남긴 열람기록만** 돌려준다.
 *
 * ── 목업이 정책보다 넓게 열어 주고 있었다 ──────────────────────────────────
 *
 * 여기는 「내가 볼 수 있는 업무의 열람기록」을 돌려주고 있었다. 그래서 목업으로
 * 돌 때는 남이 내 업무를 열어 본 기록까지 화면에 나왔다. 그런데 실제 정책은
 * 그렇지 않다 —
 *
 *   0002_rls.sql · access_log_select_self
 *     for select to authenticated using (actor_id = (select auth.uid()))
 *
 * 둘이 어긋나면 목업이 있는 이유 자체가 없어진다. 목업은 개발 편의를 위한
 * 다른 앱이 아니라 **DB가 없을 때도 같은 화면을 보여 주는 같은 앱**이어야 하고,
 * 특히 권한처럼 이 제품이 주장하는 것을 목업이 더 헐겁게 흉내 내면, 심사에서
 * 목업으로 본 화면과 DB로 본 화면이 다른 말을 하게 된다.
 *
 * 업무를 볼 수 있는지도 함께 본다. 정책 하나로는 걸리지 않지만, 열람기록이
 * 가리키는 업무 제목이 화면에 함께 나오기 때문이다.
 */
export async function listAccessLogs(
  viewer: Profile,
  limit = ACCESS_LOG_LIMIT,
): Promise<AccessLogWithActor[]> {
  const state = await getDemoState();
  const readable = new Map(
    works
      .map((w) => toListItem(w, state))
      .filter((w) => canRead(w, viewer, w.members))
      .map((w) => [w.id, w] as const),
  );

  return accessLogs
    .filter(
      (l) =>
        l.actor_id === viewer.id &&
        l.work_id !== null &&
        readable.has(l.work_id),
    )
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

/**
 * 이 업무에 대해 **내가 남긴** 열람기록 — 업무 상세의 이력 탭.
 *
 * 여기도 listAccessLogs 와 같은 이유로 viewer 를 받는다. 정책이 본인 것만
 * 돌려주므로(access_log_select_self), 목업이 남의 열람까지 보여 주면 목업으로
 * 본 화면과 DB로 본 화면이 다른 말을 한다. 화면 문구도 그에 맞춰 「내가 이
 * 업무를 열어 본 기록」이라고 적는다.
 */
export async function getAccessLogsForWork(
  workId: string,
  viewer: Profile,
): Promise<AccessLogWithActor[]> {
  return accessLogs
    .filter((l) => l.work_id === workId && l.actor_id === viewer.id)
    .map((l) => ({
      ...l,
      actor: l.actor_id ? requireProfile(l.actor_id) : null,
      work: null,
    }));
}
