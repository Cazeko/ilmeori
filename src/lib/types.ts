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
  kind: string;
  summary: string;
  detail: Record<string, unknown>;
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
