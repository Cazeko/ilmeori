import "server-only";

import { createClient } from "@/lib/supabase/server";
import { approvalProgress, byRecent } from "@/lib/approval";
import { NOTE_LIMIT, groupThreads } from "@/lib/note";
import { daysUntil, todayKST } from "@/lib/format";
import { ilikePattern } from "@/lib/search-term";
import {
  derivedStatus,
  type AccessLogWithActor,
  type ActivityWithActor,
  type ApprovalKind,
  type ApprovalState,
  type ApprovalWithSteps,
  type AttachmentWithUploader,
  type CommentWithAuthor,
  type Department,
  type DerivedStatus,
  type DocSectionWithEditor,
  type Document,
  type Handover,
  type HandoverNoteWithAuthor,
  type MemberWithProfile,
  type NoteThread,
  type NoteWithPeople,
  type AppNotification,
  type NotificationWithActor,
  type Profile,
  type ProfileWithDepartment,
  type Work,
  type WorkListItem,
} from "@/lib/types";
import { ACCESS_LOG_LIMIT, WORKS_LIMIT } from "./types";
import type {
  ApprovalSummary,
  HandoverView,
  WorkFilter,
  WorkRecords,
} from "./types";

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
 * ── 필터를 DB 로 내린 이유 ─────────────────────────────────────────────────
 *
 * 여기에는 「검색어·내 업무·지연은 가져온 뒤에 건다」고 적혀 있었다. 근거가
 * 둘이었는데 하나는 틀렸고 하나는 풀 수 있는 것이었다.
 *
 *   「RLS 가 걸러 준 뒤의 행 수가 작다」  부서 하나면 그렇다. 그런데 이 화면은
 *     공개 범위가 「전체」인 업무를 시 전체에서 모아 보여 준다. 작다는 전제가
 *     제품이 자라면 깨지고, 깨지는 자리가 **가장 자주 열리는 화면**이다.
 *
 *   「or(...) 는 문자열 조립이라 쉼표·괄호가 들어가면 깨진다」  맞다. 그래서
 *     안 만드는 대신 **값을 만드는 자리를 하나로 못박았다**(lib/search-term.ts).
 *     겁내서 피하면 상한을 걸 수 없고, 상한이 없으면 이 화면은 언젠가 선다.
 *
 * 지금은 결과 집합을 정하는 조건이 전부 질의에 있다. 자바스크립트에 남은 것은
 * **정렬뿐**이고(byUrgency 는 파생 상태를 본다), 그건 상한 안에서만 돈다.
 * 자세한 내용은 listWorks 머리말에 있다.
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

/**
 * 업무 목록.
 *
 * ── 상한이 없던 자리 ───────────────────────────────────────────────────────
 *
 * 한동안 이 함수는 RLS 가 허용하는 **전 행**을 임베드 6종째로 받아 온 뒤,
 * 검색어·내 업무·지연을 자바스크립트에서 걸렀다. 결재함은 이미 100건에서
 * 자르고 「잘랐다」고 화면에 적는데(listApprovals), 정작 이 제품에서 가장 자주
 * 열리는 화면만 그 규약 밖에 있었다. 시 단위로 업무가 쌓이면 보드를 열 때마다
 * 그 전부가 나온다.
 *
 * 상한을 걸려면 **거르는 일이 먼저 DB 로 내려가야 한다.** 100건을 받아 놓고
 * 그 안을 검색하면 101번째 업무는 제목이 정확히 일치해도 안 나오고, 사용자는
 * 그것을 「없다」로 읽는다. 조용히 틀린 답이 느린 답보다 나쁘다.
 *
 * 그래서 결과 집합을 정하는 조건은 전부 질의로 옮겼다.
 *
 *   archived · departmentId   원래 질의에 있었다
 *   q                         ilike 두 칸(제목·설명). 값은 search-term.ts 가 만든다
 *   overdueOnly               아래 세 줄. types.ts 의 derivedStatus 와 같은 정의다
 *   mine                      내 참여 목록을 먼저 받아 id 로 좁힌다
 *
 * ── 정렬은 두 번 한다. 이유가 있다 ─────────────────────────────────────────
 *
 * SQL 은 기한 오름차순으로 정렬한다(없는 것은 뒤로). 지연된 업무는 기한이
 * 오늘보다 앞이므로 **자동으로 맨 앞에 모인다** — 상한이 잘라 내는 쪽이
 * 「기한 없는 업무」가 되도록 만드는 것이 목적이다. 급한 것을 자르면 안 된다.
 *
 * 그 다음 자바스크립트가 byUrgency 로 다시 정렬한다. 이쪽이 화면의 진짜 순서다
 * (지연을 완료보다 앞에 세우는 규칙은 파생 상태라 SQL 이 모른다). 100건 안에서
 * 도는 정렬이라 값이 싸다.
 */
export async function listWorks(
  viewer: Profile,
  filter: WorkFilter = {},
  limit = WORKS_LIMIT,
) {
  const supabase = await createClient();

  // 내가 참여한 업무만 — 참여 목록을 먼저 받아 id 로 좁힌다.
  // 임베드에 !inner 를 걸어 한 번에 하는 길도 있지만, 그러면 화면에 그리는
  // members 가 **나 하나로 잘려** 카드의 참여자 줄이 거짓말을 한다.
  let mineIds: string[] | null = null;
  if (filter.mine) {
    const { data: rows, error: mineError } = await supabase
      .from("work_member")
      .select("work_id")
      .eq("profile_id", viewer.id);
    if (mineError) throw mineError;
    mineIds = (rows ?? []).map((r) => r.work_id as string);
    if (mineIds.length === 0) return [];
  }

  const query = worksFiltered(
    withoutDeletedComments(supabase.from("work").select(WORK_SELECT)),
    filter,
    mineIds,
  );

  const { data, error } = await query
    /* 기한 없는 것을 뒤로 보낸다 — 잘려 나가는 쪽이 급하지 않은 쪽이어야 한다.
       기한이 있는 것끼리는 이른 것이 앞이므로 지연된 업무가 맨 앞에 모인다.

       ⚠ 알려진 한계: **끝난 업무도 기한만으로 줄을 선다.** 기한이 오래된
         완료 업무가 많으면 그것들이 앞자리를 차지해 진행 중인 업무를 상한
         밖으로 밀어낼 수 있다. 저장소가 몇 해치 쌓인 뒤에 나타나는 문제다.

         지금 고치지 않은 이유는 PostgREST 가 식(`status = 'done'`)으로 정렬을
         못 하기 때문이다. status 로 먼저 정렬하면(열거형이 done 을 마지막에
         둔다) 완료는 뒤로 가지만 **컷 안에서 긴급도가 사라진다** — 먼 미래의
         「대기」가 오늘 지난 「검토」를 이긴다. 둘 중 덜 나쁜 쪽을 골랐다.

         제대로 된 답은 열마다 따로 상한을 두거나 쪽 넘김을 넣는 것이고,
         그건 이 수정의 범위 밖이다. 완료 업무가 화면을 먹기 시작하면
         그때가 그 작업을 할 때다. */
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data as unknown as RawWork[]).map(toListItem).sort(byUrgency);
}

/**
 * 「기한이 지난 업무 N건」의 N.
 *
 * 예전에는 이 수를 **같은 표를 조건만 바꿔 한 번 더 부른 뒤 세어서** 얻었다.
 * 임베드 6종을 달고 나가는 제일 무거운 질의였고, 세는 데만 쓰고 버렸다.
 * 게다가 목록에 상한이 생긴 지금은 그 방법이 틀린 답을 준다 — 100건까지만
 * 받아서 세면 101번째 지연 업무가 수에서 빠진다.
 *
 * 행을 받지 않고 DB 가 센 수만 받는다(head: true). 상한과 무관하게 정확하다.
 */
export async function countOverdueWorks(
  _viewer: Profile,
  filter: WorkFilter = {},
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await worksFiltered(
    supabase.from("work").select("id", { count: "exact", head: true }),
    { ...filter, overdueOnly: true },
    null,
  );
  if (error) throw error;
  return count ?? 0;
}

/**
 * 두 조회가 **같은 조건**을 보게 묶어 둔다.
 *
 * 목록과 개수가 서로 다른 조건을 보면 화면이 「지연 3건」이라 적어 놓고 세 장이
 * 아닌 목록을 보여 준다. 조건을 한 함수에 모아 그 어긋남을 구조적으로 막는다.
 */
function worksFiltered<T>(
  query: T,
  filter: WorkFilter,
  mineIds: string[] | null,
): T {
  /* 조건을 거는 메서드만 추린 구조 타입으로 받는다. Supabase 빌더는
     `select()` 에 무엇을 넘겼는지에 따라 타입이 갈리는데(행을 받는 쪽과
     개수만 받는 쪽), 거는 조건은 양쪽이 똑같다. 그 공통분모만 본다. */
  let q = query as Filterable;

  q = filter.archived
    ? q.not("archived_at", "is", null)
    : q.is("archived_at", null);
  if (filter.departmentId) q = q.eq("department_id", filter.departmentId);
  if (mineIds) q = q.in("id", mineIds);

  const pattern = ilikePattern(filter.q);
  if (pattern) {
    q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);
  }

  // 지연 = 끝나지 않았고 · 기한이 있고 · 그 기한이 오늘보다 앞이다.
  // types.ts 의 derivedStatus 와 **같은 세 조건**이고, 둘이 갈라지지 않는지는
  // tests/overdue-rule.test.mjs 가 잰다.
  if (filter.overdueOnly) {
    q = q
      .neq("status", "done")
      .not("due_date", "is", null)
      .lt("due_date", todayKST());
  }
  return q as T;
}

/** worksFiltered 가 쓰는 메서드만. 위 주석 참조. */
type Filterable = {
  not(column: string, operator: string, value: unknown): Filterable;
  is(column: string, value: unknown): Filterable;
  eq(column: string, value: unknown): Filterable;
  in(column: string, values: readonly unknown[]): Filterable;
  or(filters: string): Filterable;
  neq(column: string, value: unknown): Filterable;
  lt(column: string, value: unknown): Filterable;
};

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

/**
 * 여러 건을 한 번에. id → 업무.
 *
 * 목록을 돌면서 getWork를 부르면 건수만큼 왕복이 늘어난다. 인계 화면이
 * 정확히 그랬다 — 인계 대상 10건이면 그것만으로 왕복 10회였다.
 * 못 보는 업무는 RLS가 빼고 돌려주므로 결과에 그냥 없다.
 */
async function getWorksByIds(ids: string[]): Promise<Map<string, WorkListItem>> {
  const valid = [...new Set(ids)].filter((id) => UUID.test(id));
  if (valid.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await withoutDeletedComments(
    supabase.from("work").select(WORK_SELECT).in("id", valid),
  );
  if (error) throw error;
  return new Map(
    (data as unknown as RawWork[]).map((raw) => {
      const item = toListItem(raw);
      return [item.id, item];
    }),
  );
}

// ---------------------------------------------------------------------------
// 문서 · 대화 · 첨부 · 이력
// ---------------------------------------------------------------------------

/**
 * 서식 문서의 본문(document.blocks)에 대하여.
 *
 * 아래 두 질의는 `select("*")` 라 blocks 가 따라온다. 칸을 손으로 세지 않아도
 * 되는 것이 이 별표의 값이고, 0018 이 칸을 넷 더했어도 여기는 그대로다.
 *
 * 대신 짚어 둘 것이 있다. gatherForWorks 는 업무 여러 건의 문서를 **한 번에**
 * 끌어오므로, 서식 문서가 늘어나면 인계 초안 화면이 쓰지도 않는 본문을 함께
 * 받는다(handover-draft.ts 는 title 과 항목만 본다). 그래도 칸을 골라 뽑지
 * 않는 이유는, 낱개(getWorkDocument)와 배치가 **같은 모양을 돌려주기로 한
 * 계약** 때문이다 — tests/data-contract.test.mjs 가 두 결과를 통째로 비교한다.
 * 배치에서만 blocks 를 빼면 그 시험이 빨간불이 되고, 뺀 자리에 null 을 채우면
 * 「항목 문서」와 구분되지 않는다. 즉 지금 고르면 계약이 깨진다.
 *
 * 크기가 실제로 문제가 되면 그때 고칠 자리는 여기가 아니라 계약 쪽이다.
 * (한 문서의 본문은 0018 의 document_blocks_size 가 2MB 에서 자른다)
 */
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
    .select(
      `*, author:author_id ( ${PROFILE_SELECT} ),
       mentions:comment_mention ( profile:profile_id ( ${PROFILE_SELECT} ) )`,
    )
    .eq("work_id", workId)
    .is("deleted_at", null)
    .order("created_at")
    .order("id");
  if (error) throw error;

  // 임베드는 [{ profile: {...} }] 로 온다. 화면이 쓰는 모양으로 편다.
  return (data ?? []).map((c) => {
    const raw = c as unknown as Omit<CommentWithAuthor, "mentions"> & {
      mentions: Array<{ profile: Profile | null }> | null;
    };
    return {
      ...raw,
      mentions: (raw.mentions ?? [])
        .map((m) => m.profile)
        .filter((p): p is Profile => p !== null),
    };
  });
}

/**
 * 쪽지.
 *
 * RLS 가 읽는 사람을 셋으로 열어 둔다 — 보낸 사람 · 받은 사람 · **그 업무를
 * 읽을 수 있는 사람**(0019). 그래서 아래 두 함수는 서로 다른 것을 묻는다.
 *
 *   listNoteThreads   「내가 주고받은 것」  → 쪽지함
 *   getWorkNoteThreads「이 업무에 오간 것」 → 업무 상세의 「바깥에 물어본 것」
 *
 * 후자에는 내가 낀 적 없는 실도 나온다. 그게 맞다 — 쪽지는 사적 대화가 아니라
 * 업무 기록이고, 그래야 주담당이 인계서를 뽑을 때 그 문답이 실린다.
 */
const NOTE_SELECT = `*, author:author_id ( ${PROFILE_SELECT} ), recipient:recipient_id ( ${PROFILE_SELECT} )`;

export async function listNoteThreads(viewer: Profile): Promise<NoteThread[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note")
    .select(`${NOTE_SELECT}, work:work_id ( id, title )`)
    // 이 파일 머리글이 or(...) 를 경계하는 이유는 **검색어 같은 자유 문자열**이
    // 질의를 깨기 때문이다. 여기 들어가는 것은 세션에서 온 uuid 하나뿐이라
    // 쉼표도 괄호도 들어올 수 없다.
    .or(`author_id.eq.${viewer.id},recipient_id.eq.${viewer.id}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(NOTE_LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<
    NoteWithPeople & { work: { id: string; title: string } | null }
  >;
  const titles = new Map(rows.map((r) => [r.work_id, r.work?.title ?? "업무"]));
  return groupThreads(rows, viewer.id, (id) => titles.get(id) ?? "업무");
}

/**
 * 실 하나. **쪽지함 목록에서 찾지 않는다.**
 *
 * 처음에는 `listNoteThreads` 결과에서 골랐다. 거기서 고르면 「당사자인가」가
 * 공짜로 걸리지만, 그 목록은 최근 100통 상한이 있다 — 쪽지가 100통을 넘는
 * 순간 오래된 실은 **404 가 되거나 반쪽만 보인다.** 화면 상한이 데이터
 * 접근 규칙 노릇을 하고 있었다.
 *
 * 그래서 실을 직접 가져오고, 자격은 **여기서 명시적으로** 본다. RLS 는 업무를
 * 읽을 수 있는 제3자에게도 이 실을 열어 주므로(0019, 그게 맞다) 그것만으로는
 * 부족하다 — 이 화면은 답장을 쓰는 자리이고, 그 자격은 당사자에게만 있다.
 */
export async function getNoteThread(
  threadId: string,
  viewer: Profile,
): Promise<NoteThread | null> {
  if (!UUID.test(threadId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note")
    .select(`${NOTE_SELECT}, work:work_id ( id, title )`)
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at")
    .order("id");
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<
    NoteWithPeople & { work: { id: string; title: string } | null }
  >;
  if (rows.length === 0) return null;
  // 당사자가 아니면 없는 것과 같다. 「권한이 없다」고 답하면 그 실이 존재한다는
  // 사실 자체가 새어 나간다(getWork 가 null 을 주는 것과 같은 규칙).
  const mine = rows.some(
    (n) => n.author_id === viewer.id || n.recipient_id === viewer.id,
  );
  if (!mine) return null;

  const title = rows[0].work?.title ?? "업무";
  return groupThreads(rows, viewer.id, () => title)[0] ?? null;
}

export async function getWorkNoteThreads(
  workId: string,
  viewer: Profile,
  workTitle: string,
): Promise<NoteThread[]> {
  if (!UUID.test(workId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note")
    .select(NOTE_SELECT)
    .eq("work_id", workId)
    .is("deleted_at", null)
    .order("created_at")
    .order("id");
  if (error) throw error;

  return groupThreads(
    (data ?? []) as unknown as NoteWithPeople[],
    viewer.id,
    () => workTitle,
  );
}

/**
 * 실을 열면 나에게 온 안 읽은 쪽지에 읽음 시각을 찍는다.
 *
 * 화면을 그리는 중에 부른다 — `logAccess` 가 같은 자리에서 같은 방식으로
 * 돈다. 실패해도 삼킨다. 읽음 표시 하나 때문에 쪽지를 못 보게 될 이유가 없다.
 *
 * `is("read_at", null)` 이 있어야 **처음 읽은 시각**이 남는다. 다시 열 때마다
 * 덮어쓰면 그 값은 「마지막으로 본 때」가 되는데, 보낸 사람이 보는 표시는
 * 「언제 읽었나」다(0019 의 칸 잠금도 되돌리기를 막는다).
 */
export async function markThreadRead(threadId: string, viewerId: string) {
  if (!UUID.test(threadId)) return;
  try {
    const supabase = await createClient();
    await supabase
      .from("note")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("recipient_id", viewerId)
      .is("read_at", null);
  } catch {
    // 무시
  }
}

/**
 * 알림.
 *
 * RLS 가 `recipient_id = auth.uid()` 로 잠가 두었으므로 여기서 다시 거르지
 * 않는다(이 파일 머리글의 규칙). 만드는 길은 `app.notify` 하나뿐이라 앱에는
 * insert 경로가 아예 없다.
 */
export async function listNotifications(
  _viewer: Profile,
  limit: number,
): Promise<NotificationWithActor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification")
    .select(`*, actor:actor_id ( ${PROFILE_SELECT} )`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as NotificationWithActor[];
}

/** 배지에 쓰는 수. 부분 색인(notification_unread_idx)을 탄다. */
export async function countUnreadNotifications(_viewer: Profile): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notification")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * 하나만 읽음으로. 눌린 알림의 목적지를 함께 돌려준다.
 *
 * 「종을 열었다」와 「읽었다」는 다르다. 열어 보고 "나중에 봐야지" 하는 것이
 * 정상 동선이므로, 여는 것만으로는 아무것도 안 지운다.
 */
export async function markNotificationRead(
  id: number,
): Promise<AppNotification | null> {
  const supabase = await createClient();
  // 이미 읽은 것에 다시 시각을 쓰지 않는다 — 처음 읽은 때가 기록이다.
  await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  const { data } = await supabase
    .from("notification")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as AppNotification) ?? null;
}

export async function markAllNotificationsRead(_viewer: Profile): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
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

/**
 * 잘려서 오지 않았는지 확인한다.
 *
 * PostgREST는 응답 행 수에 서버 쪽 상한(db-max-rows)이 걸려 있으면 **오류가
 * 아니라 짧은 배열**을 돌려준다. 업무 한 건씩 부를 때는 닿을 일이 없던 상한이,
 * 여러 업무를 한 질의로 묶는 순간 그 업무들이 상한을 나눠 쓰게 되면서 닿는다.
 *
 * 잘린 것을 모르고 지나가면 인계서의 「대화 N건」이 사실과 다른 수가 되고,
 * 근거 꼬리표가 실제로는 있는 기록을 없다고 적는다. 공문서에서 그건
 * 화면이 안 뜨는 것보다 나쁘다 — 틀린 줄 모르고 결재까지 올라가기 때문이다.
 * 그래서 여기서는 삼키지 않고 던진다.
 */
const emptyRecords = (): WorkRecords => ({
  document: null,
  sections: [],
  activities: [],
  attachments: [],
  comments: [],
});

function assertWhole(
  label: string,
  res: { data: unknown[] | null; count: number | null },
) {
  const got = res.data?.length ?? 0;
  if (res.count !== null && got < res.count) {
    throw new Error(
      `${label}: ${res.count}건 가운데 ${got}건만 왔습니다(PostgREST 행 상한). ` +
        `인계 대상을 나눠 부르거나 서버의 db-max-rows 를 올려야 합니다.`,
    );
  }
}

/**
 * 여러 업무에 딸린 기록을 한 번에 — 인계 초안 전용.
 *
 * 업무마다 문서·이력·첨부·대화를 따로 부르면 왕복이 건수 × 4~5로 늘어난다.
 * 인계 대상이 열 건이면 그것만으로 50회다. 여기서는 표마다 한 번씩,
 * 건수와 무관하게 **다섯 번**으로 끝낸다.
 *
 * 다만 「건수와 무관」한 것은 왕복 수이지 행 수가 아니다. 네 질의가 서버의
 * 행 상한을 각자 하나씩 쓰므로, 위 assertWhole 로 잘림을 확인한다.
 *
 * 못 보는 업무는 RLS가 행을 돌려주지 않으므로 **빈 기록**이 된다.
 * 키는 요청한 id 전부에 대해 들어간다(mock 구현과 같은 계약이다).
 * getWorksByIds 는 반대로 못 보는 업무의 키가 아예 없다 — 그쪽은 「업무가
 * 있는가」를 묻는 함수이고, 이쪽은 「이 업무들의 기록을 모아 달라」이기 때문이다.
 */
export async function gatherForWorks(
  workIds: string[],
): Promise<Map<string, WorkRecords>> {
  // uuid 는 대소문자를 가리지 않는다. 키를 소문자로 맞춰 두지 않으면
  // 호출자가 준 대문자 id 와 DB 가 돌려주는 소문자 work_id 가 어긋난다.
  const ids = [...new Set(workIds.map((id) => id.toLowerCase()))].filter((id) =>
    UUID.test(id),
  );
  const out = new Map<string, WorkRecords>();
  for (const id of ids) out.set(id, emptyRecords());
  if (ids.length === 0) return out;

  const supabase = await createClient();
  const [documents, activities, attachments, comments] = await Promise.all([
    supabase
      .from("document")
      .select("*", { count: "exact" })
      .in("work_id", ids)
      .order("created_at"),
    supabase
      .from("activity")
      .select(`*, actor:actor_id ( ${PROFILE_SELECT} )`, { count: "exact" })
      .in("work_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachment")
      .select(`*, uploader:uploaded_by ( ${PROFILE_SELECT} )`, {
        count: "exact",
      })
      .in("work_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("comment")
      .select(`*, author:author_id ( ${PROFILE_SELECT} )`, { count: "exact" })
      .in("work_id", ids)
      .is("deleted_at", null)
      // 시각이 같으면 순서가 정해지지 않는다(mock.ts 의 같은 자리 주석 참조).
      .order("created_at")
      .order("id"),
  ]);

  for (const r of [documents, activities, attachments, comments]) {
    if (r.error) throw r.error;
  }
  assertWhole("문서", documents);
  assertWhole("이력", activities);
  assertWhole("첨부", attachments);
  assertWhole("대화", comments);

  // 업무당 문서는 첫 한 판만 쓴다(getWorkDocument와 같은 규칙 — created_at 순 첫 행).
  const firstDoc = new Map<string, Document>();
  for (const d of (documents.data ?? []) as Document[]) {
    if (!firstDoc.has(d.work_id)) firstDoc.set(d.work_id, d);
  }

  const docIds: string[] = [];
  for (const [workId, d] of firstDoc) {
    const rec = out.get(workId);
    if (!rec) continue; // 요청하지 않은 업무. 있을 수 없지만 던지지는 않는다.
    rec.document = d;
    docIds.push(d.id);
  }

  if (docIds.length > 0) {
    const sections = await supabase
      .from("doc_section")
      .select(
        `*,
         updated_by_profile:updated_by ( ${PROFILE_SELECT} ),
         locked_by_profile:locked_by ( ${PROFILE_SELECT} )`,
        { count: "exact" },
      )
      .in("document_id", docIds)
      .order("sort_order");
    if (sections.error) throw sections.error;
    assertWhole("문서 항목", sections);

    const workIdOfDoc = new Map([...firstDoc].map(([w, d]) => [d.id, w]));
    for (const s of (sections.data ?? []) as unknown as DocSectionWithEditor[]) {
      const workId = workIdOfDoc.get(s.document_id);
      if (workId) out.get(workId)?.sections.push(s);
    }
  }

  for (const a of (activities.data ?? []) as unknown as ActivityWithActor[]) {
    out.get(a.work_id)?.activities.push(a);
  }
  for (const a of (attachments.data ?? []) as unknown as AttachmentWithUploader[]) {
    out.get(a.work_id)?.attachments.push(a);
  }
  for (const c of (comments.data ?? []) as unknown as CommentWithAuthor[]) {
    out.get(c.work_id)?.comments.push(c);
  }

  return out;
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
// 결재
// ---------------------------------------------------------------------------

/**
 * 결재 문서 한 벌.
 *
 * work 를 !inner 로 걸지 않는다. 결재선에 이름이 있으면 그 업무를 볼 수 없어도
 * 문서는 보여야 하는데(0017 의 approval_select), inner join 을 걸면 업무가
 * 안 보이는 순간 문서까지 목록에서 사라진다. 그 사람에게 「협조하라고 이름을
 * 올려놓고 문서는 안 보이는」 화면이 되는 것이다.
 */
const APPROVAL_SELECT = `
  *,
  drafter:drafter_id ( ${PROFILE_SELECT} ),
  work:work_id ( id, title ),
  steps:approval_step (
    id, approval_id, seq, kind, approver_id, position,
    signed_at, rejected_at, opinion,
    approver:approver_id ( ${PROFILE_SELECT} )
  )
`;

type RawApproval = ApprovalWithSteps;

/**
 * 진행률 배지 질의의 상한.
 *
 * 이 상한에 걸리면 배지가 빠진 카드가 생기고, **배지가 없는 것은 「결재가 없다」로
 * 읽힌다.** 그래서 걸리면 조용히 지나가지 않고 서버 로그에 남긴다. 값 자체는
 * 넉넉하다 — 화면 하나에 뜨는 업무는 수십 건이고 업무당 결재는 몇 건이다.
 */
const SUMMARY_LIMIT = 500;

function toApproval(raw: RawApproval): ApprovalWithSteps {
  return {
    ...raw,
    // 결재란은 순번대로 읽는다. PostgREST 의 임베드 순서는 보장되지 않는다.
    steps: [...(raw.steps ?? [])].sort((a, b) => a.seq - b.seq),
  };
}

/**
 * 내가 볼 수 있는 결재 문서 전부.
 *
 * 어느 칸(대기·예정·처리…)에 들어가는지는 화면이 정한다. 그 판정에 결재란 전체가
 * 필요하고, 어차피 함께 가져오므로 칸별로 질의를 나누지 않는다.
 * 결재함이 다루는 건수는 한 사람 기준 수십 건이다.
 */
export async function listApprovals(
  _viewer: Profile,
  limit = 100,
): Promise<ApprovalWithSteps[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval")
    .select(APPROVAL_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as RawApproval[]).map(toApproval);
}

export async function getApprovalsForWork(
  _viewer: Profile,
  workId: string,
): Promise<ApprovalWithSteps[]> {
  if (!UUID.test(workId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval")
    .select(APPROVAL_SELECT)
    .eq("work_id", workId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawApproval[]).map(toApproval);
}

/**
 * 내 칸이 아직 남아 있는 결재 문서.
 *
 * 홈의 「결재 대기」가 쓴다. 결재함처럼 전부 가져와 거르지 않는 이유는, 홈은
 * 하루에 몇 번씩 열리는 화면이고 결재 문서는 부서 전체 것이 다 보이기 때문이다.
 *
 * 두 번 묻는다. 한 번에 묻는 길(`approval_step!inner(...)`)이 있지만, 그렇게
 * 하면 **딸려 오는 결재란도 함께 걸러진다.** 그러면 「앞 순서가 끝났는가」를
 * 판정할 형제 칸이 사라져 지금 내 차례인지 알 수 없게 된다.
 */
export async function listApprovalsAwaitingMe(
  viewer: Profile,
): Promise<ApprovalWithSteps[]> {
  const supabase = await createClient();
  const { data: steps, error } = await supabase
    .from("approval_step")
    .select("approval_id")
    .eq("approver_id", viewer.id)
    .is("signed_at", null)
    .is("rejected_at", null);
  if (error) throw error;

  const ids = [...new Set((steps ?? []).map((s) => s.approval_id as string))];
  if (ids.length === 0) return [];

  const { data, error: docError } = await supabase
    .from("approval")
    .select(APPROVAL_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (docError) throw docError;
  return ((data ?? []) as unknown as RawApproval[]).map(toApproval);
}

/**
 * 여러 업무의 결재 진행률을 **한 번에** 가져온다.
 *
 * 업무 카드마다 부르면 보드 한 장이 스무 번을 왕복한다. 화면에 뜬 업무의
 * id 를 통째로 받아 한 질의로 끝낸다.
 *
 * 결재란은 `kind`·`signed_at` 두 칸만 읽는다. 진행률에 필요한 것이 그것뿐이고,
 * 서명자 이름까지 끌고 오면 보드 한 장이 목록 화면보다 무거워진다.
 */
export async function getApprovalSummaries(
  _viewer: Profile,
  workIds: readonly string[],
): Promise<Map<string, ApprovalSummary>> {
  const ids = [...new Set(workIds.filter((id) => UUID.test(id)))];
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval")
    .select("id, work_id, state, created_at, closed_at, steps:approval_step ( kind, signed_at )")
    .in("work_id", ids)
    // 기안 중인 문서는 카드에 올리지 않는다(data/types.ts 의 ApprovalSummary 주석).
    .neq("state", "drafting")
    .order("created_at", { ascending: false })
    .limit(SUMMARY_LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    work_id: string;
    state: ApprovalState;
    created_at: string;
    closed_at: string | null;
    steps: Array<{ kind: ApprovalKind; signed_at: string | null }>;
  }>;

  // 상한에 걸렸으면 배지가 없는 카드가 생긴다. 배지가 없는 것은 「결재가 없다」로
  // 읽히므로, 조용히 지나가지 않고 서버 로그에 남긴다(결재함의 100건 상한을
  // 화면이 말하게 한 것과 같은 판단이고, 여기는 말할 자리가 없어 로그로 간다).
  if (rows.length >= SUMMARY_LIMIT) {
    console.error(
      `[approval] 진행률 배지 질의가 상한(${SUMMARY_LIMIT}건)에 걸렸습니다. 일부 업무 카드에 배지가 빠집니다.`,
    );
  }

  // 업무별로 모은 뒤 「가장 최근에 움직인 것」을 고른다. 결재함의 정렬과 **같은
  // 규칙**(byRecent)이라, 카드의 배지와 결재함 맨 위 문서가 어긋나지 않는다.
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.work_id);
    if (list) list.push(row);
    else grouped.set(row.work_id, [row]);
  }

  const byWork = new Map<string, ApprovalSummary>();
  for (const [workId, list] of grouped) {
    const latest = [...list].sort(byRecent)[0];
    const progress = approvalProgress(latest.steps ?? []);
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
  _viewer: Profile,
  id: string,
): Promise<ApprovalWithSteps | null> {
  if (!UUID.test(id)) return null;

  const supabase = await createClient();
  // 볼 수 없는 문서는 RLS 가 0행으로 돌려준다. 없는 것과 구분하지 않는다.
  const { data, error } = await supabase
    .from("approval")
    .select(APPROVAL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toApproval(data as unknown as RawApproval) : null;
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

/**
 * 인계 한 건을 화면이 쓰는 모양으로.
 *
 * viewer 를 받지 않는다. 이 파일의 공개 함수들은 목업 구현과 서명을 맞추려고
 * 안 쓰는 _viewer 를 달고 있지만, 이건 db.ts 안에서만 쓰는 함수라 맞출 상대가
 * 없다(목업의 buildHandover 는 인자가 하나다). 인자를 남겨 두면 앞으로
 * 「viewer 로 거르고 있다」고 오해하기 쉽다 — 실제로 못 보는 업무를 빼는 것은
 * getWorksByIds 가 RLS 로 비운 결과를 아래에서 filter 하는 것뿐이다.
 */
async function buildHandover(raw: RawHandover): Promise<HandoverView> {
  const works = await getWorksByIds(raw.items.map((i) => i.work_id));
  return {
    handover: raw,
    from: raw.from_profile,
    to: raw.to_profile,
    items: raw.items
      .map((i) => ({ work: works.get(i.work_id), transferred: i.transferred }))
      // 인계 대상인데 못 보는 업무가 있으면 목록에서 뺀다.
      // 인수자는 아직 참여자가 아닐 수 있고, 그때는 제목도 보이면 안 된다.
      .filter((x): x is { work: WorkListItem; transferred: boolean } =>
        Boolean(x.work),
      ),
  };
}

/** 내가 넘겨야 하거나 넘겨받는 인계 건. RLS가 당사자에게만 돌려준다. */
export async function getHandoverFor(
  // 목업 구현과 서명을 맞춘다(index.ts 머리 주석). 여기서는 RLS 가 판정하므로 쓰지 않는다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewer: Profile,
): Promise<HandoverView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handover")
    .select(HANDOVER_SELECT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? buildHandover(data as unknown as RawHandover) : null;
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
  return data ? buildHandover(data as unknown as RawHandover) : null;
}

// ---------------------------------------------------------------------------
// 열람기록
// ---------------------------------------------------------------------------

export async function listAccessLogs(
  _viewer: Profile,
  limit = ACCESS_LOG_LIMIT,
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
  // 목업 구현과 서명을 맞춘다. 여기서는 정책(access_log_select_self)이
  // 본인 것만 돌려주므로 쓰지 않는다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewer: Profile,
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
