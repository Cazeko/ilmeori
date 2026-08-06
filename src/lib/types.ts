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

export interface AccessLogWithActor extends AccessLog {
  actor: Profile | null;
  work: Pick<Work, "id" | "title"> | null;
}

export interface DocSectionWithEditor extends DocSection {
  updated_by_profile: Profile | null;
  locked_by_profile: Profile | null;
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
