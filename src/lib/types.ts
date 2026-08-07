/**
 * 데이터베이스 타입
 *
 * supabase/migrations/*.sql 과 1:1로 대응한다.
 * (실제 프로젝트 연결 후에는 `supabase gen types typescript`로 자동생성해 대체할 수 있다)
 */

export type WorkStatus = "todo" | "doing" | "review" | "done";
export type MemberRole = "owner" | "editor" | "viewer";
export type WorkVisibility = "private" | "department" | "city";
export type HandoverStatus = "draft" | "generated" | "confirmed" | "completed";

export type ActivityKind =
  | "work.created"
  | "work.updated"
  | "work.status_changed"
  | "work.transferred"
  | "member.added"
  | "member.role_changed"
  | "member.removed"
  | "document.created"
  | "document.updated"
  | "document.deleted"
  | "section.updated"
  | "comment.created"
  | "comment.deleted"
  | "attachment.added"
  | "attachment.removed"
  | "handover.started"
  | "handover.completed";

export type AccessKind =
  | "work.viewed"
  | "document.viewed"
  | "attachment.downloaded";

/** 저장되지 않고 계산되는 파생 상태. 기한이 지났는데 완료되지 않은 업무. */
export type DerivedStatus = WorkStatus | "overdue";

export interface Department {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
}

export interface Profile {
  id: string;
  name: string;
  department_id: string | null;
  position: string | null;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  is_demo: boolean;
}

export interface Work {
  id: string;
  title: string;
  description: string | null;
  status: WorkStatus;
  visibility: WorkVisibility;
  department_id: string;
  owner_id: string;
  due_date: string | null;
  fiscal_year: number;
  previous_year_work_id: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkMember {
  work_id: string;
  profile_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Document {
  id: string;
  work_id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DocSection {
  id: string;
  document_id: string;
  sort_order: number;
  heading: string | null;
  body: string;
  locked_by: string | null;
  locked_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface Activity {
  id: number;
  work_id: string;
  actor_id: string | null;
  kind: ActivityKind;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface Attachment {
  id: string;
  work_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  uploaded_by: string;
  created_at: string;
}

export interface AccessLog {
  id: number;
  work_id: string | null;
  target_id: string | null;
  actor_id: string | null;
  kind: AccessKind;
  created_at: string;
}

export interface Comment {
  id: string;
  work_id: string;
  author_id: string;
  body: string;
  deleted_at: string | null;
  created_at: string;
}

export interface Handover {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  status: HandoverStatus;
  document_draft: string | null;
  ai_model: string | null;
  generated_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface HandoverItem {
  handover_id: string;
  work_id: string;
  transferred: boolean;
}

/**
 * 「업무인계·인수서」의 항목 키.
 *
 * 이 일곱 개는 우리가 정한 것이 아니라 「행정업무의 운영 및 혁신에 관한 규정
 * 시행규칙」별지 제12호서식이 정한 것이다. 그래서 DB의 check 제약
 * (handover_note_block_key_check)에도 같은 목록이 들어 있다.
 * 항목 이름(heading)이 아니라 키를 저장하는 이유는, 문구를 다듬는 순간
 * 예전에 적어 둔 보충이 어느 칸 것인지 알 수 없게 되기 때문이다.
 */
export const HANDOVER_BLOCK_KEYS = [
  "1-duties",
  "1-progress",
  "1-issues",
  "1-pending",
  "2-docs",
  "3-assets",
  "4-notes",
] as const;

export type HandoverBlockKey = (typeof HANDOVER_BLOCK_KEYS)[number];

/** 폼으로 넘어온 값은 하나도 믿지 않는다. 아는 칸 이름인지 여기서 확인한다. */
export function isHandoverBlockKey(v: unknown): v is HandoverBlockKey {
  return (
    typeof v === "string" &&
    (HANDOVER_BLOCK_KEYS as readonly string[]).includes(v)
  );
}

/** 보충을 적고 나면 그 항목으로 돌아온다. 일곱 칸짜리 문서에서 맨 위로 튕기지 않도록. */
export function handoverBlockAnchor(key: HandoverBlockKey): string {
  return `block-${key}`;
}

/**
 * 보충 한 줄의 길이 상한. DB의 handover_note_body_check 와 **같은 값**이어야 한다.
 * 더 적을 것이 있으면 한 줄을 더 적으면 된다 — 쌓이는 구조라 그래도 된다.
 */
export const HANDOVER_NOTE_MAX = 1000;

/**
 * 인계자가 서식 항목에 직접 보탠 글.
 *
 * 규칙이 뽑은 문단(DraftBlock.paragraphs)과 **섞지 않는다.** 섞으면 어느 문장이
 * 어느 기록에서 나왔는지 말할 수 없게 되고, 그 순간 근거 꼬리표가 거짓이 된다.
 */
export interface HandoverNote {
  id: string;
  handover_id: string;
  block_key: HandoverBlockKey;
  body: string;
  author_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 화면이 실제로 받는 모양 — 조인 결과
//
// 화면 컴포넌트는 이 타입에만 의존한다. 지금은 목업이 만들어 주고,
// Supabase를 연결하면 select(...)의 결과가 같은 모양으로 들어온다.
// 그래야 데이터 소스를 갈아끼우는 일이 화면 재작성이 되지 않는다.
// ---------------------------------------------------------------------------

/** 참여자 목록에서 소속까지 함께 보여주므로 조회 단계에서 붙여 온다. */
export interface ProfileWithDepartment extends Profile {
  department_name: string | null;
}

export interface MemberWithProfile extends WorkMember {
  profile: ProfileWithDepartment;
}

export interface WorkListItem extends Work {
  department: Department;
  owner: Profile;
  members: MemberWithProfile[];
  /** 서버에서 계산한다. 브라우저 시계에 따라 값이 달라지면 안 되기 때문이다. */
  derived: DerivedStatus;
  comment_count: number;
  attachment_count: number;
  /** 같은 업무의 작년 판. 있으면 '작년 이맘때' 카드를 띄운다. */
  previous_year: Pick<Work, "id" | "title" | "fiscal_year"> | null;
  /** 참여 부서 수 — 부서 간 협업 여부를 카드에서 바로 읽게 한다. */
  department_count: number;
}

export interface ActivityWithActor extends Activity {
  actor: Profile | null;
}

export interface CommentWithAuthor extends Comment {
  author: Profile;
}

export interface AttachmentWithUploader extends Attachment {
  uploader: Profile;
}

export interface HandoverNoteWithAuthor extends HandoverNote {
  author: Profile;
}

export interface AccessLogWithActor extends AccessLog {
  actor: Profile | null;
  work: Pick<Work, "id" | "title"> | null;
}

export interface DocSectionWithEditor extends DocSection {
  updated_by_profile: Profile | null;
  locked_by_profile: Profile | null;
}

/**
 * 편집 잠금이 아직 살아 있는가.
 *
 * supabase/migrations/0002_rls.sql 의 app.section_lock_active()와 **같은 규칙**이다.
 * 두 곳에 같은 규칙이 있는 것은 위험하지만, 여기서는 필요하다.
 * 화면이 잠금을 판단하지 않으면 브라우저를 닫고 간 사람의 잠금이 영원히 남아
 * "○○님 편집 중"이 몇 달째 붙어 있게 된다. 실제로 잠기는 것은 DB이고,
 * 여기는 그 결과를 미리 그려 보여 줄 뿐이다.
 *
 * 시각 계산을 서버에서 하는 이유는 derivedStatus와 같다.
 * 브라우저 시계가 틀어져 있으면 잠긴 것이 안 잠긴 것으로 보인다.
 */
export const SECTION_LOCK_MINUTES = 5;

export function sectionLockActive(
  s: Pick<DocSection, "locked_by" | "locked_at">,
): boolean {
  if (!s.locked_by || !s.locked_at) return false;
  const age = Date.now() - new Date(s.locked_at).getTime();
  return age < SECTION_LOCK_MINUTES * 60_000;
}

// ---------------------------------------------------------------------------
// 표시용 레이블 — 화면 전체에서 같은 말을 쓰기 위한 단일 출처
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<DerivedStatus, string> = {
  todo: "대기",
  doing: "진행중",
  review: "검토",
  done: "완료",
  overdue: "지연",
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "소유",
  editor: "편집",
  viewer: "열람",
};

export const VISIBILITY_LABEL: Record<WorkVisibility, string> = {
  private: "참여자만",
  department: "부서 공개",
  city: "전체 공개",
};

export const VISIBILITY_HINT: Record<WorkVisibility, string> = {
  private: "참여자로 추가된 사람만 열람할 수 있습니다.",
  department: "소관 부서 직원이면 누구나 열람할 수 있습니다.",
  city: "시 전체 직원이 열람할 수 있습니다.",
};

export const HANDOVER_STATUS_LABEL: Record<HandoverStatus, string> = {
  draft: "대상 선정",
  generated: "초안 생성",
  confirmed: "인계자 확인",
  completed: "인수 완료",
};

export const ACCESS_KIND_LABEL: Record<AccessKind, string> = {
  "work.viewed": "업무 열람",
  "document.viewed": "문서 열람",
  "attachment.downloaded": "첨부파일 내려받기",
};

/**
 * 이력 항목을 색으로 묶는 기준.
 * 타임라인에서 "권한이 움직인 사건"과 "내용이 바뀐 사건"은 눈에 다르게 보여야 한다.
 * 인수인계 감사에서 실제로 찾는 것은 전자이기 때문이다.
 */
export type ActivityTone = "권한" | "내용" | "대화" | "인계";

export const ACTIVITY_TONE: Record<ActivityKind, ActivityTone> = {
  "work.created": "권한",
  "work.updated": "내용",
  "work.status_changed": "내용",
  "work.transferred": "권한",
  "member.added": "권한",
  "member.role_changed": "권한",
  "member.removed": "권한",
  "document.created": "내용",
  "document.updated": "내용",
  "document.deleted": "내용",
  "section.updated": "내용",
  "comment.created": "대화",
  "comment.deleted": "대화",
  "attachment.added": "내용",
  "attachment.removed": "내용",
  "handover.started": "인계",
  "handover.completed": "인계",
};

/**
 * 실제 표시할 상태를 계산한다.
 * '지연'은 DB에 저장하지 않는다. 저장하면 매일 밤 배치로 갱신해야 하고,
 * 그 배치가 실패하면 화면이 거짓말을 한다.
 */
export function derivedStatus(work: Pick<Work, "status" | "due_date">): DerivedStatus {
  if (work.status === "done" || !work.due_date) return work.status;
  const today = new Date().toISOString().slice(0, 10);
  return work.due_date < today ? "overdue" : work.status;
}
