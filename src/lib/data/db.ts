import "server-only";

import { createClient } from "@/lib/supabase/server";
import { daysUntil } from "@/lib/format";
import {
  derivedStatus,
  type AccessLogWithActor,
  type ActivityWithActor,
  type AttachmentWithUploader,
  type CommentWithAuthor,
  type Department,
  type DerivedStatus,
  type DocSectionWithEditor,
  type Document,
  type Handover,
  type HandoverNoteWithAuthor,
  type MemberWithProfile,
  type Profile,
  type ProfileWithDepartment,
  type Work,
  type WorkListItem,
} from "@/lib/types";
import type { HandoverView, WorkFilter } from "./types";

/**
 * Supabase 구현.
 *
 * ── 여기서 권한 검사를 하지 않는 이유 ──────────────────────────────────────
 *
 * 목업 구현(mock.ts)에는 canRead()가 있었다. 여기에는 없다.
 * 필요가 없어서가 아니라, **DB가 이미 하고 있기 때문**이다.
 *
 * 모든 질의는 로그인한 사용자의 세션으로 나가고, RLS가 볼 수 없는 행을
 * 애초에 돌려주지 않는다. 여기서 한 번 더 거르면 규칙이 두 벌이 되고,
 * 두 벌은 반드시 어긋난다. 어긋나면 화면 쪽 규칙이 더 느슨한 순간 사고가 난다.
 *
 * 그래서 이 파일은 "가져와서 화면이 쓰는 모양으로 조립"만 한다.
 * 안 보여야 할 것이 보이면 그건 이 파일이 아니라 정책의 문제이고,
 * 그 정책은 supabase/rls.test.mjs 59개가 지키고 있다.
 *
 * ── 필터를 자바스크립트로 거는 이유 ────────────────────────────────────────
 *
 * 검색어·내 업무·지연 필터는 가져온 뒤에 건다. 두 가지 이유다.
 *   1. RLS가 걸러 준 뒤의 행 수가 작다(부서 하나가 다루는 업무는 수십 건이다)
 *   2. PostgREST의 or(...) 는 문자열을 조립해 보내므로 검색어에 쉼표나 괄호가
 *      들어가면 질의가 깨진다. 이스케이프를 직접 하느니 안 만드는 편이 낫다
 * 부서 필터만 서버에서 건다. 값이 uuid로 고정돼 있고 범위를 크게 줄이기 때문이다.
 */

// 화면이 쓰는 모양 그대로 한 번에 가져온다. 관계 이름은 외래키 이름을 따른다.
const WORK_SELECT = `
  *,
  department:department_id ( id, name, parent_id, description, sort_order ),
  owner:owner_id ( id, name, department_id, position, rank, email, avatar_url, is_active, is_demo ),
  members:work_member (
    work_id, profile_id, role, created_at,
    profile:profile_id (
      id, name, department_id, position, rank, email, avatar_url, is_active, is_demo,
      department:department_id ( name )
    )
  ),
  previous_year:previous_year_work_id ( id, title, fiscal_year ),
  comment_count:comment ( count ),
  attachment_count:attachment ( count )
`;

/**
 * 지운 대화는 세지 않는다.
 *
 * 대화 삭제는 행을 지우는 것이 아니라 deleted_at 에 시각을 적는 것이라(soft delete),
 * 그냥 세면 지운 글까지 들어간다. 그러면 카드에는 「대화 5」인데 탭을 열면 4개인
 * 상태가 되고, 목업 구현은 애초에 지운 것을 빼고 세므로 두 구현이 서로 다른 말을 한다.
 *
 * 임베드한 관계에는 별칭 접두사로 필터를 건다. !inner 가 아니므로 대화가 하나도 없는
 * 업무가 목록에서 빠지지는 않는다(실제 프로젝트에서 확인했다).
 */
function withoutDeletedComments<T extends { is: (c: string, v: null) => T }>(
  query: T,
): T {
  return query.is("comment_count.deleted_at", null);
}

const PROFILE_SELECT =
  "id, name, department_id, position, rank, email, avatar_url, is_active, is_demo";

/**
 * 주소에서 온 id가 uuid 모양인가.
 *
 * 이 검사가 없으면 /works/새업무 같은 주소가 404가 아니라 **500**이 된다.
 * Postgres는 uuid 칸에 아무 문자열이나 오면 22P02로 질의를 거절하고,
 * 그 오류가 조회층을 뚫고 올라가 오류 화면이 뜬다.
 *
 * 없는 업무와 모양이 틀린 id는 사용자에게 같은 것이다 — 둘 다 "그런 건 없다"이다.
 * 목업 구현은 find로 찾으므로 애초에 이 문제가 없고, 그래서 두 구현의 동작이
 * 여기서 갈렸다. 이쪽을 목업에 맞춘다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST의 count 집계는 [{count: n}] 모양으로 온다. */
function countOf(v: unknown): number {
  if (Array.isArray(v)) return Number(v[0]?.count ?? 0);
  if (v && typeof v === "object" && "count" in v) {
    return Number((v as { count: unknown }).count ?? 0);
  }
  return 0;
}

type RawWork = Work & {
  department: Department;
  owner: Profile;
  members: Array<{
    work_id: string;
    profile_id: string;
    role: MemberWithProfile["role"];
    created_at: string;
    profile: Profile & { department: { name: string } | null };
  }>;
  previous_year: Pick<Work, "id" | "title" | "fiscal_year"> | null;
  comment_count: unknown;
  attachment_count: unknown;
};

const ROLE_ORDER = { owner: 0, editor: 1, viewer: 2 } as const;

function toListItem(raw: RawWork): WorkListItem {
  const members: MemberWithProfile[] = (raw.members ?? [])
    .map((m) => ({
      work_id: m.work_id,
      profile_id: m.profile_id,
      role: m.role,
      created_at: m.created_at,
      profile: {
        id: m.profile.id,
        name: m.profile.name,
        department_id: m.profile.department_id,
        position: m.profile.position,
        rank: m.profile.rank,
        email: m.profile.email,
        avatar_url: m.profile.avatar_url,
        is_active: m.profile.is_active,
        is_demo: m.profile.is_demo,
        department_name: m.profile.department?.name ?? null,
      },
    }))
    // 소유 → 편집 → 열람 순. 권한이 센 사람이 위에 온다.
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  const deptIds = new Set(members.map((m) => m.profile.department_id));
  deptIds.add(raw.department_id);

  return {
    ...raw,
    department: raw.department,
    owner: raw.owner,
    members,
    derived: derivedStatus(raw),
    comment_count: countOf(raw.comment_count),
    attachment_count: countOf(raw.attachment_count),
    previous_year: raw.previous_year,
    department_count: deptIds.size,
  };
}

/**
 * 정렬 기준: 지연 → 마감 임박 → 마감 없음.
 * 목록의 맨 위는 "지금 손대야 하는 일"이어야 한다.
 */
function byUrgency(a: WorkListItem, b: WorkListItem) {
  if (a.derived === "overdue" && b.derived !== "overdue") return -1;
  if (b.derived === "overdue" && a.derived !== "overdue") return 1;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.updated_at.localeCompare(a.updated_at);
}

// ---------------------------------------------------------------------------
// 업무
// ---------------------------------------------------------------------------

export async function listWorks(viewer: Profile, filter: WorkFilter = {}) {
  const supabase = await createClient();
  let query = withoutDeletedComments(supabase.from("work").select(WORK_SELECT));
  query = filter.archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  if (filter.departmentId) query = query.eq("department_id", filter.departmentId);

  const { data, error } = await query;
  if (error) throw error;

  const q = filter.q?.trim().toLowerCase();
  return (data as unknown as RawWork[])
    .map(toListItem)
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

export async function getWork(
  _viewer: Profile,
  id: string,
): Promise<WorkListItem | null> {
  if (!UUID.test(id)) return null;

  const supabase = await createClient();
  // 볼 수 없는 업무는 RLS가 0행으로 돌려준다.
  // 없는 것과 못 보는 것이 화면에서 구분되지 않아야 하므로 그대로 null을 준다.
  const { data, error } = await withoutDeletedComments(
    supabase.from("work").select(WORK_SELECT).eq("id", id),
  ).maybeSingle();
  if (error) throw error;
  return data ? toListItem(data as unknown as RawWork) : null;
}

// ---------------------------------------------------------------------------
// 문서 · 대화 · 첨부 · 이력
// ---------------------------------------------------------------------------

export async function getWorkDocument(workId: string): Promise<{
  document: Document | null;
  sections: DocSectionWithEditor[];
}> {
  if (!UUID.test(workId)) return { document: null, sections: [] };

  const supabase = await createClient();
  const { data: document, error } = await supabase
    .from("document")
    .select("*")
    .eq("work_id", workId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!document) return { document: null, sections: [] };

  const { data: sections, error: sectionError } = await supabase
    .from("doc_section")
    .select(
      `*,
       updated_by_profile:updated_by ( ${PROFILE_SELECT} ),
       locked_by_profile:locked_by ( ${PROFILE_SELECT} )`,
    )
    .eq("document_id", document.id)
    .order("sort_order");
  if (sectionError) throw sectionError;

  return {
    document: document as Document,
    sections: (sections ?? []) as unknown as DocSectionWithEditor[],
  };
}

export async function getActivities(workId: string): Promise<ActivityWithActor[]> {
  if (!UUID.test(workId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity")
    .select(`*, actor:actor_id ( ${PROFILE_SELECT} )`)
    .eq("work_id", workId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ActivityWithActor[];
}

export async function getComments(workId: string): Promise<CommentWithAuthor[]> {
  if (!UUID.test(workId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comment")
    .select(`*, author:author_id ( ${PROFILE_SELECT} )`)
    .eq("work_id", workId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as CommentWithAuthor[];
}

export async function getAttachments(
  workId: string,
): Promise<AttachmentWithUploader[]> {
  if (!UUID.test(workId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachment")
    .select(`*, uploader:uploaded_by ( ${PROFILE_SELECT} )`)
    .eq("work_id", workId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AttachmentWithUploader[];
}

/** 내려받기 한 건. 볼 수 없는 업무의 첨부는 RLS가 애초에 돌려주지 않는다. */
export async function getAttachment(
  id: string,
): Promise<AttachmentWithUploader | null> {
  if (!UUID.test(id)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachment")
    .select(`*, uploader:uploaded_by ( ${PROFILE_SELECT} )`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AttachmentWithUploader) ?? null;
}

// ---------------------------------------------------------------------------
// 조직
// ---------------------------------------------------------------------------

export async function getDepartments(): Promise<Department[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("department")
    .select("id, name, parent_id, description, sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Department[];
}

/**
 * 참여자로 부를 수 있는 사람들.
 *
 * 재직자는 전 직원이 볼 수 있다(profile_select 정책). 부서 경계를 넘는 협업이
 * 이 제품의 목적이므로, 다른 과 사람을 찾을 수 없으면 제품이 성립하지 않는다.
 * 퇴직·휴직자는 정책이 애초에 돌려주지 않는다.
 */
export async function listProfiles(): Promise<ProfileWithDepartment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile")
    .select(`${PROFILE_SELECT}, department:department_id ( name )`)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as Array<
    Profile & { department: { name: string } | null }
  >).map(({ department, ...p }) => ({
    ...p,
    department_name: department?.name ?? null,
  }));
}

export async function getDepartment(id: string): Promise<Department | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("department")
    .select("id, name, parent_id, description, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Department) ?? null;
}

/** 실·국 아래 과들. 부서 선택은 2단계까지만 편다. */
export async function getDepartmentTree() {
  const all = await getDepartments();
  return all
    .filter((d) => !d.parent_id)
    .map((root) => ({
      ...root,
      children: all.filter((d) => d.parent_id === root.id),
    }));
}

// ---------------------------------------------------------------------------
// 「작년 이맘때」
// ---------------------------------------------------------------------------

export async function getPreviousYearBrief(
  viewer: Profile,
  previousWorkId: string,
) {
  // 올해 업무를 볼 수 있다고 작년 업무까지 볼 수 있는 것은 아니다.
  // getWork가 RLS에 걸려 null을 주면 카드 자체를 그리지 않는다.
  const work = await getWork(viewer, previousWorkId);
  if (!work) return null;

  const supabase = await createClient();
  const [{ document, sections }, activity] = await Promise.all([
    getWorkDocument(work.id),
    supabase
      .from("activity")
      .select("created_at")
      .eq("work_id", work.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    work,
    document,
    headings: sections
      .map((s) => s.heading)
      .filter((h): h is string => Boolean(h)),
    attachmentCount: work.attachment_count,
    lastTouchedAt: activity.data?.created_at ?? work.updated_at,
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

  const titles = new Map(mine.map((w) => [w.id, w.title]));
  let recent: Array<
    ActivityWithActor & { work: { id: string; title: string } }
  > = [];

  if (mine.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("activity")
      .select(`*, actor:actor_id ( ${PROFILE_SELECT} )`)
      .in("work_id", [...titles.keys()])
      // 내가 한 일은 소식이 아니다.
      // neq만 쓰면 actor_id가 null인 기록(시스템이 남긴 것)까지 사라진다.
      // null <> 'x' 는 참이 아니라 unknown 이라 조건에서 탈락하기 때문이다.
      .or(`actor_id.is.null,actor_id.neq.${viewer.id}`)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    recent = ((data ?? []) as unknown as ActivityWithActor[]).map((a) => ({
      ...a,
      work: { id: a.work_id, title: titles.get(a.work_id) ?? "" },
    }));
  }

  return {
    mine,
    counts,
    recent,
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
// 인계·인수
// ---------------------------------------------------------------------------

const HANDOVER_SELECT = `
  *,
  from_profile:from_profile_id ( ${PROFILE_SELECT} ),
  to_profile:to_profile_id ( ${PROFILE_SELECT} ),
  items:handover_item ( work_id, transferred )
`;

// from·to 는 SQL 예약어라 별칭으로 쓰지 않는다. 받아 온 뒤 화면이 쓰는 이름으로 바꾼다.
type RawHandover = Handover & {
  from_profile: Profile;
  to_profile: Profile;
  items: Array<{ work_id: string; transferred: boolean }>;
};

async function buildHandover(
  viewer: Profile,
  raw: RawHandover,
): Promise<HandoverView> {
  const works = await Promise.all(
    raw.items.map((i) => getWork(viewer, i.work_id)),
  );
  return {
    handover: raw,
    from: raw.from_profile,
    to: raw.to_profile,
    items: raw.items
      .map((i, idx) => ({ work: works[idx], transferred: i.transferred }))
      // 인계 대상인데 못 보는 업무가 있으면 목록에서 뺀다.
      // 인수자는 아직 참여자가 아닐 수 있고, 그때는 제목도 보이면 안 된다.
      .filter((x): x is { work: WorkListItem; transferred: boolean } =>
        Boolean(x.work),
      ),
  };
}

/** 내가 넘겨야 하거나 넘겨받는 인계 건. RLS가 당사자에게만 돌려준다. */
export async function getHandoverFor(
  viewer: Profile,
): Promise<HandoverView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handover")
    .select(HANDOVER_SELECT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? buildHandover(viewer, data as unknown as RawHandover) : null;
}

/**
 * 인계자가 서식 항목에 보탠 글.
 *
 * HandoverView에 넣지 않고 따로 가져온다. 규칙이 조립하는 초안
 * (buildHandoverDraft)과 사람이 적은 글은 **끝까지 섞이지 않아야** 하고,
 * 그 경계는 타입에서부터 갈라 두는 편이 지켜진다.
 *
 * 정책(handover_note_select)이 당사자에게만 돌려주므로 여기서 다시 거르지 않는다.
 */
export async function getHandoverNotes(
  handoverId: string,
): Promise<HandoverNoteWithAuthor[]> {
  if (!UUID.test(handoverId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handover_note")
    .select(`*, author:author_id ( ${PROFILE_SELECT} )`)
    .eq("handover_id", handoverId)
    // 적은 순서대로. 서식 안에서는 나중에 보탠 것이 아래에 와야 읽힌다.
    .order("created_at");

  // 표가 아직 없는 동안만 봐준다.
  //
  // 이 파일의 다른 조회는 오류를 그대로 던진다. 여기만 다른 이유는 배포와
  // 마이그레이션이 **같이 움직이지 않기** 때문이다. 코드는 깃헙에 올리면
  // Vercel이 알아서 올리고, 0014는 사람이 SQL Editor에서 돌린다. 그 사이에
  // /handover 를 열면 표가 없어 이 질의가 실패하고, 그러면 보충 한 칸 때문에
  // **제품의 결론인 인계 화면이 통째로 오류 화면**이 된다.
  //
  // 표가 없을 때의 사실은 "보충이 0건"과 정확히 같다. 그래서 0건으로 이어 그리되,
  // 서버 로그에는 남긴다 — 조용히 넘어가면 마이그레이션을 안 돌린 것을 아무도
  // 모른 채 지나간다. 그 밖의 오류는 지금까지처럼 던진다.
  if (error) {
    // 표 이름까지 확인한다. 두 코드(42P01·PGRST205)는 "이 이름의 표를 못 찾겠다"는
    // 뜻이고 둘 다 메시지에 그 이름을 담는다. 이름을 안 보면 조인해 온 다른 표의
    // 문제까지 0건으로 삼켜 버린다.
    const missingTable =
      (error.code === "42P01" || error.code === "PGRST205") &&
      error.message.includes("handover_note");
    if (!missingTable) throw error;
    console.error(
      "[handover_note] 표가 없습니다. supabase/migrations/0014_handover_note.sql 을 실행해야 인계자 보충 칸이 동작합니다.",
    );
    return [];
  }

  return (data ?? []) as unknown as HandoverNoteWithAuthor[];
}

export async function getHandover(
  viewer: Profile,
  id: string,
): Promise<HandoverView | null> {
  if (!UUID.test(id)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handover")
    .select(HANDOVER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? buildHandover(viewer, data as unknown as RawHandover) : null;
}

// ---------------------------------------------------------------------------
// 열람기록
// ---------------------------------------------------------------------------

export async function listAccessLogs(
  _viewer: Profile,
  limit = 50,
): Promise<AccessLogWithActor[]> {
  const supabase = await createClient();
  // 볼 수 없는 업무의 열람기록은 RLS가 애초에 돌려주지 않는다.
  // 누가 무엇에 관심이 있는가도 정보이기 때문이다.
  const { data, error } = await supabase
    .from("access_log")
    .select(
      `*, actor:actor_id ( ${PROFILE_SELECT} ), work:work_id ( id, title )`,
    )
    .not("work_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AccessLogWithActor[];
}

export async function getAccessLogsForWork(
  workId: string,
): Promise<AccessLogWithActor[]> {
  if (!UUID.test(workId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("access_log")
    .select(`*, actor:actor_id ( ${PROFILE_SELECT} )`)
    .eq("work_id", workId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as AccessLogWithActor[]).map((l) => ({
    ...l,
    work: null,
  }));
}

/**
 * 열람기록을 남긴다.
 *
 * 사용자에게는 access_log에 INSERT 권한이 없다. 이 RPC만 기록할 수 있고,
 * 함수 안에서 호출자가 그 업무를 볼 수 있는지 다시 확인한다.
 * 실패해도 화면은 그려져야 하므로 오류를 삼킨다 —
 * 기록이 하나 빠지는 것보다 화면이 안 뜨는 쪽이 나쁘다.
 */
export async function logAccess(workId: string, kind: string) {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_access", {
      p_work_id: workId,
      p_kind: kind,
      p_target_id: null,
    });
  } catch {
    // 무시
  }
}
