/**
 * 데이터베이스 타입
 *
 * supabase/migrations/*.sql 과 1:1로 대응한다.
 * (실제 프로젝트 연결 후에는 `supabase gen types typescript`로 자동생성해 대체할 수 있다)
 */

// 이 파일의 유일한 import 다. 「오늘」이 무엇인지는 아래 derivedStatus 가
// 답해야 하는 물음인데, 시간대 상수는 format.ts 에 하나뿐이다. 여기에 두 번째
// "Asia/Seoul" 을 적으면 그 둘이 갈라지는 날이 온다 — 실제로 한 번 갈라졌다.
import { todayKST } from "./format";

export type WorkStatus = "todo" | "doing" | "review" | "done";
export type MemberRole = "owner" | "editor" | "viewer";
export type WorkVisibility = "private" | "department" | "city";
export type HandoverStatus = "draft" | "generated" | "confirmed" | "completed";

/**
 * 결재유형 8가지. 「승인」 같은 사기업 낱말로 바꾸지 않는다.
 *
 * 낱말의 출처는 「행정업무의 운영 및 혁신에 관한 규정」 **제10조**(결재·전결·대결)와
 * 시행규칙 **제4조**(검토·협조)다. 「법정 8종」이라고 부르지 않는다 — 온나라 고시
 * (행안부 제2024-28호)가 세는 8종은 `기안·검토·협조·병렬협조·결재·전결·대결·전대결`
 * 이라 **목록이 같지 않다.** 여기에는 「검토」·「전대결」이 없고 「최종결재」·「사후보고」가
 * 있다. 「법정」이라는 낱말을 붙이면 목록이 다른 순간 제품의 정확성 자체가 흔들린다.
 */
export type ApprovalKind =
  | "draft" // 기안
  | "review" // 결재
  | "final" // 최종결재
  | "delegated" // 전결
  | "acting" // 대결
  | "concur_seq" // 순차협조
  | "concur_par" // 병렬협조
  | "post_report"; // 사후보고

export type ApprovalState =
  | "drafting"
  | "in_progress"
  | "completed"
  | "rejected"
  | "withdrawn";

/** 시행규칙 별지 제2호서식이 담는 문서 갈래. 발신문서는 여기 없다. */
export type ApprovalForm = "report" | "plan" | "review" | "cooperation";

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
  // 쪽지(0019). DB 의 activity_kind 에 값을 더하면 **여기도 더해야 한다** —
  // ICON·ACTIVITY_TONE 이 Record<ActivityKind, …> 라 빠뜨리면 타입은 통과하고
  // 이력 탭이 <undefined /> 로 터진다. 실제로 코드리뷰에서 잡혔다.
  | "note.sent"
  | "note.answered"
  | "attachment.added"
  | "attachment.removed"
  | "handover.started"
  | "handover.completed"
  | "approval.submitted"
  | "approval.signed"
  | "approval.rejected"
  | "approval.completed"
  | "approval.withdrawn";

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
  /** 직급. 사람이 읽는 문자열이다. 서열 판정은 rank 로 한다. */
  position: string | null;
  /** 결재 서열. 10 시장 / 20 국장·실장 / 30 과장 / 40 팀장 / 50 주무관 */
  rank: number;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  is_demo: boolean;
}

/**
 * 개인 휴대전화 한 줄.
 *
 * 남의 것은 `is_public` 일 때만 조회된다 — 앱이 가리는 것이 아니라 정책이
 * 행을 안 준다. 그래서 이 값이 `null` 인 것과 「번호가 없는 사람」은 화면에서
 * 구분되지 않고, 그것이 의도한 동작이다.
 */
export interface ProfileContact {
  profile_id: string;
  mobile: string;
  is_public: boolean;
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
  /**
   * 서식 문서의 본문(블록 배열). null 이면 지금까지의 「항목 + 평문」 문서다.
   *
   * `unknown` 인 것은 게으름이 아니다. 이 칸은 jsonb 라 DB 가 보장하는 것은
   * 「JSON 인가」까지이고, 안이 우리가 기대하는 모양인지는 아무도 보장하지
   * 않는다. 화면과 내보내기는 반드시 `parseRichDoc()` 를 거친 값만 본다
   * (src/lib/editor/model.ts).
   */
  blocks: unknown | null;
  /**
   * 저장할 때마다 1 씩 오른다.
   *
   * 두 사람이 같은 문서를 편집하다 각자 저장하면, 늦게 저장한 쪽이 앞사람의
   * 글을 통째로 덮어쓴다 — 실시간으로 합쳐 놓고 마지막 한 번에서 잃는다.
   * 저장 요청에 「내가 본 판」을 함께 실어 보내고, 그 사이 판이 올랐으면
   * 저장을 거절한다. 실제로 막는 것은 UPDATE 에 붙은 `where blocks_rev = <내가 본 판>`
   * 한 줄이다(rich-doc.ts). DB 함수로 감싸지 않은 이유는 0018 §4 에 적혀 있다.
   */
  blocks_rev: number;
  blocks_updated_by: string | null;
  blocks_updated_at: string | null;
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

/**
 * 결재 문서 — 시행규칙 별지 제2호서식(내부결재문서).
 *
 * 업무에 매달린다. 결재함은 이것을 모아 보는 화면일 뿐이다.
 * 서명은 이 표를 UPDATE 해서 찍히지 않는다 — public.sign_approval 만이 찍는다.
 */
export interface Approval {
  id: string;
  work_id: string;
  form: ApprovalForm;
  /** 상신할 때 붙는다. 기안 중에는 null 이다. HS-협조-20260808-0001 */
  doc_no: string | null;
  title: string;
  body: string;
  /** 보존연한(년). 1·3·5·10·30 */
  retention: number | null;
  security: "normal" | "confidential";
  state: ApprovalState;
  drafter_id: string;
  created_at: string;
  /** 결재가 끝난 시각. 어떻게 끝났는지는 state 가 말한다. */
  closed_at: string | null;
}

export interface ApprovalStep {
  id: string;
  approval_id: string;
  seq: number;
  kind: ApprovalKind;
  approver_id: string;
  /** 서명 당시 직위. profile 을 조인하지 않는 이유는 인사이동이다. */
  position: string;
  signed_at: string | null;
  rejected_at: string | null;
  opinion: string | null;
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

/**
 * 쪽지 — 메신저가 아니라 **업무를 물고 다니는 문의**다.
 *
 * `work_id` 가 optional 이 아닌 것이 이 타입의 전부다. 업무 없는 쪽지를
 * 허용하는 순간 지식이 업무 밖으로 새는 통로가 열린다
 * (docs/plans/2026-08-23-쪽지-알림-design.md §1, supabase/migrations/0019).
 */
export interface Note {
  id: string;
  work_id: string;
  /** 첫 쪽지의 id. 답장이 같은 실에 묶인다. 뿌리 쪽지는 thread_id = id. */
  thread_id: string;
  author_id: string;
  recipient_id: string;
  body: string;
  /** 받은 사람이 연 시각. 보낸 사람 화면에 「보냄」 → 「읽음」으로 나타난다. */
  read_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

/**
 * 알림 — **사건만** 담는다.
 *
 * 「처리해야 사라지는 것은 알림이 아니다」가 이 타입의 규칙이다. 「지금 내 차례
 * 결재」는 여기 없다 — 읽음 처리된 순간 목록에서 사라지는데 일은 그대로 남기
 * 때문이다(supabase/migrations/0021).
 *
 * 이름이 `Notification` 이 아닌 것은 브라우저 전역 `Notification` 과 겹치기
 * 때문이다. 겹치면 타입은 통과하고 런타임에 엉뚱한 것을 잡는다.
 */
export type NotificationKind =
  | "mention"
  | "note"
  | "work_touched"
  | "approval_decided"
  /**
   * 인계 문답에 상대가 글을 남겼다.
   *
   * 있는 갈래를 빌려 쓰지 않았다. `note` 로 적으면 알림이 「쪽지가 왔다」고
   * 말하면서 쪽지함이 아닌 곳으로 보내고, `work_touched` 는 업무 하나를
   * 가리키는 갈래인데 인계에는 가리킬 업무가 여럿이다(0022).
   */
  | "handover_message";

export interface AppNotification {
  id: number;
  recipient_id: string;
  kind: NotificationKind;
  work_id: string | null;
  /** comment.id · note.thread_id · approval.id — kind 와 함께 주소를 만든다. */
  target_id: string | null;
  actor_id: string | null;
  summary: string;
  /** 묶인 개수. work_touched 만 1보다 커진다. */
  count: number;
  read_at: string | null;
  created_at: string;
}

export interface NotificationWithActor extends AppNotification {
  actor: Profile | null;
}

export interface Handover {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  status: HandoverStatus;
  document_draft: string | null;
  ai_model: string | null;
  generated_at: string | null;
  /** 인계자가 확인한 시각 */
  confirmed_at: string | null;
  /** 인수자가 확인한 시각. 이 둘이 다 차야 결재 상신으로 넘어간다(0026). */
  accepted_at: string | null;
  /**
   * 입회자 — 별지 제12호서식의 셋째 서명란.
   *
   * 인계자 쪽 부서의 최고서열자이고, 인계를 만들 때 DB 가 정해 박아 둔다.
   * 없을 수 있다(인계자가 그 부서에서 가장 높은데 상위 부서에도 사람이 없는
   * 경우). 그때는 인계자가 마지막 걸음을 밟는다 — 사람이 없다고 인사발령 난
   * 업무가 안 넘어가면 안 된다.
   */
  witness_id: string | null;
  /** 입회자가 승인하며 적은 근거 — 온나라 문서번호나 결재일 */
  witness_note: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface HandoverItem {
  handover_id: string;
  work_id: string;
  transferred: boolean;
}

/**
 * 별지 제12호서식 서명란의 세 줄에 찍을 시각.
 *
 * 화면·종이·파일 셋이 **같은 함수**를 부른다. 세 곳에서 각자 칸을 고르면
 * 언젠가 한 곳만 다른 시각을 찍고, 그 어긋남은 결재에 올라간 뒤에 발견된다.
 *
 * 입회자의 시각이 `completed_at` 인 이유: 입회자가 누르는 단추가 곧 실행이다.
 * 그 사람에게는 「확인」과 「완료」가 같은 한 번이라 칸을 따로 두지 않았다.
 */
export function handoverSignedAt(h: Handover): {
  from: string | null;
  to: string | null;
  witness: string | null;
} {
  return {
    from: h.confirmed_at,
    to: h.accepted_at,
    // 입회자가 없는 인계는 인계자가 마지막 걸음을 밟는다(0026). 그때 셋째 줄에
    // 시각이 찍히면 서명하지 않은 사람이 서명한 것처럼 보인다.
    witness: h.witness_id ? h.completed_at : null,
  };
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
 * 대화 한 줄의 자리표 — **거는 쪽과 받는 쪽이 같은 함수를 쓴다.**
 *
 * 받는 쪽은 `comment-thread.tsx` 의 `<li id=…>` 이고, 거는 쪽은 인계서의 근거
 * 꼬리표(`handover-draft.ts`)다. 두 문자열이 따로 적혀 있으면 한쪽만 고쳐도
 * 아무 데서도 안 터진다 — 404 도 아니고 콘솔도 조용하고, 그냥 아무 일이
 * 일어나지 않는다. `handoverBlockAnchor` 와 같은 이유로 같은 자리에 둔다.
 */
export function commentAnchor(commentId: string): string {
  return `comment-${commentId}`;
}

/** 업무 화면. 탭을 고르지 않으면 기본 탭이 열린다. */
export function workHref(workId: string): string {
  return `/works/${workId}`;
}

/**
 * 문서 항목 한 개의 자리표 — `commentAnchor` 와 같은 이유로 여기 둔다.
 *
 * ⚠ 같은 화면의 편집 폼이 `section-<id>-heading` · `section-<id>-body` 를 이미
 * 쓴다(doc-sections.tsx). 접미사가 붙어 있어 겹치지 않지만, 이 규칙을 바꿀
 * 때는 저 둘을 함께 봐야 한다 — id 가 겹치면 브라우저는 아무 말도 하지 않고
 * 먼저 나온 것으로 간다.
 */
export function sectionAnchor(sectionId: string): string {
  return `section-${sectionId}`;
}

/**
 * 업무의 「문서」 자리.
 *
 * 지금은 문서가 기본 탭이라 `?tab=doc` 없이도 닿는다. 그래도 적는다 —
 * 기본 탭이 바뀌는 날 조용히 엉뚱한 화면으로 가는 링크가 되고, 그 실패는
 * 404 도 콘솔 오류도 남기지 않는다(`workTalkHref` 주석의 그 실패다).
 *
 * `sectionId` 는 **항목 문서일 때만** 준다. 서식 문서의 블록에는 화면에
 * 자리표가 없어서(doc-preview.tsx 는 React key 만 쓴다) 앵커를 붙이면
 * 아무 데도 안 가는 링크가 된다. 없는 자리를 가리키느니 문서 탭에 세운다.
 */
export function workDocHref(workId: string, sectionId?: string): string {
  const doc = `${workHref(workId)}?tab=doc`;
  return sectionId ? `${doc}#${sectionAnchor(sectionId)}` : doc;
}

/**
 * 업무의 「대화」 자리.
 *
 * ⚠ **`?tab=talk` 를 빼면 안 된다.** 업무 상세의 대화는 탭 안에서만 그려지므로
 * (`works/[id]/page.tsx` 의 `tab === "talk"`), 앵커만 붙여 보내면 그 글이 아예
 * 없는 화면에 도착한다. 조각(`#…`)은 서버로 전송되지 않아 서버가 탭을 되짚어
 * 줄 수도 없다. 실제로 인계서 근거 링크를 그렇게 한 번 냈다.
 *
 * 알림·대화 액션·쪽지·인계서가 전부 이 주소를 만들고 있었고, 전부 문자열로
 * 따로 적혀 있었다. 탭 이름을 바꾸는 날 조용히 썩는 자리가 여섯 곳이었다.
 */
export function workTalkHref(workId: string, commentId?: string): string {
  const talk = `${workHref(workId)}?tab=talk`;
  return commentId ? `${talk}#${commentAnchor(commentId)}` : talk;
}

/**
 * 보충 한 줄의 길이 상한. DB의 handover_note_body_check 와 **같은 값**이어야 한다.
 * 더 적을 것이 있으면 한 줄을 더 적으면 된다 — 쌓이는 구조라 그래도 된다.
 */
export const HANDOVER_NOTE_MAX = 1000;

/**
 * 인계 문답 한 줄의 길이 상한. DB의 handover_message_body_check 와 **같은 값**이다.
 *
 * 보충과 같은 1000자다. 문답이 그보다 길어질 말이면 그 업무의 대화에 적고
 * 여기서는 그 업무를 가리키는 편이 맞다 — 이 자리는 **인계서를 읽다 막힌 것**을
 * 묻는 곳이지 업무 자체를 논의하는 곳이 아니다.
 */
export const HANDOVER_MESSAGE_MAX = 1000;

/** 한 인계 건에 쌓을 수 있는 문답 수. DB의 trg_handover_message_limit 과 같다. */
export const HANDOVER_MESSAGE_LIMIT = 200;

/** 문답을 적고 나면 이 자리로 돌아온다. 맨 위로 튕기면 무엇이 달라졌는지 못 본다. */
export const HANDOVER_TALK_ANCHOR = "handover-talk";

/**
 * 「규칙이 무엇을 걸렀나」 판의 id. 서식 위 캡션·오른쪽 기둥·「보충으로 넣기」의
 * 되돌아오는 자리가 전부 여기를 가리킨다. 화면 부품과 서버 액션이 같은 글자를
 * 손으로 적으면 한쪽만 고치는 날이 온다 — handoverBlockAnchor 와 같은 이유.
 */
export const HANDOVER_SCREENING_ANCHOR = "screening";

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
  /**
   * 「보충으로 넣기」로 옮긴 것이면 어느 기록이었는지 — `comment:<id>` 또는
   * `section:<키>`(handover-draft.ts 의 missedSourceRef). 직접 적은 보충은 null.
   * 화면이 「규칙이 무엇을 걸렀나」의 줄을 「보충됨」으로 바꾸고, DB 가 같은
   * 기록을 두 번 넣는 것을 막는 근거다(0024).
   */
  source_ref: string | null;
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

/** 부서 이동 신청의 처리 상태. supabase/migrations/0023 의 transfer_status 와 같다. */
export type TransferStatus = "pending" | "approved" | "rejected" | "canceled";

/**
 * 프로필 한 장 — 「이 사람이 누구인가」에 화면이 필요한 것 전부.
 *
 * `contact` 가 null 이라는 것은 **두 가지 중 하나**다. 번호를 등록하지 않았거나,
 * 등록했지만 공개하지 않았거나. 남이 보는 쪽에서 그 둘은 구분되지 않는다 —
 * 정책이 비공개 행을 아예 주지 않기 때문이다(0023). 화면도 구분해 말하지 않는다.
 */
export interface ProfileView {
  profile: ProfileWithDepartment;
  /**
   * 사무실 내선번호. 행정전화번호부와 같은 성격이라 재직자 전원이 본다.
   *
   * ── 왜 Profile 이 아니라 여기 있는가 ─────────────────────────────────────
   *
   * 이 값을 Profile 에 두면 **모든 질의가 들고 다닌다.** 업무 카드의 참여자
   * 줄, 결재선, 대화 작성자 — 전화번호가 필요 없는 자리가 전부다. 실제 비용은
   * 바이트가 아니라 다른 데 있었다: 공용 select 목록에 칸 하나를 더하는 순간,
   * 0023 이 아직 안 돌아간 DB 에서는 **앱 전체가 42703 으로 죽는다.**
   * 프로필 화면 하나를 더하면서 업무 보드를 인질로 잡을 이유가 없다.
   *
   * 개인 휴대전화는 아래 contact 다. 「본인이 공개한 경우에만」이라는 칸 단위
   * 규칙을 RLS 로 표현할 수 없어서 별도의 표로 뺐다(0023).
   */
  phone_ext: string | null;
  contact: ProfileContact | null;
  /** 지금 보고 있는 사람이 본인인가. 화면이 고치는 칸을 그릴지 정한다. */
  isMe: boolean;
  /**
   * 0023 이 아직 이 프로젝트에 안 돌아갔는가.
   *
   * ── 왜 이 칸이 있는가 ────────────────────────────────────────────────────
   *
   * 이 저장소의 마이그레이션은 사람이 SQL Editor 에서 돌린다. 그래서 **코드
   * 배포와 스키마 적용 사이에 언제나 틈이 있고**, 그 틈에서 새 화면이 500 을
   * 낸다. 0016 때 실제로 그랬다 — 표에 칸이 없는 채로 코드가 나가면
   * PostgREST 가 42703 으로 거절한다.
   *
   * 500 대신 **덜 채워진 화면**을 준다. 이름·소속·이메일은 0023 없이도 나오는
   * 값이므로 그대로 보이고, 전화번호와 부서 이동만 「아직 준비되지 않았습니다」로
   * 물러난다. 심사용 주소가 떠 있는 동안 배포 순서 하나로 화면이 죽는 것보다
   * 낫다.
   *
   * 이 값이 참이 되는 경우는 하나뿐이고(스키마 미적용), SQL 을 한 번 돌리면
   * 영영 거짓이다. 그때 이 칸과 화면의 안내 문구를 함께 지워도 된다.
   */
  pendingMigration: boolean;
}

/** 이동 신청 한 건 — 화면이 이름으로 읽을 수 있게 사람과 부서를 붙여 온다. */
export interface TransferRequestView {
  id: string;
  profile: Profile;
  approver: Profile;
  from_department_name: string | null;
  to_department_name: string;
  reason: string | null;
  status: TransferStatus;
  decided_at: string | null;
  decided_note: string | null;
  created_at: string;
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
  /**
   * 이 업무에 딸린 문서 판 수.
   *
   * 대화 수는 오래전부터 있었는데 문서 수는 없었다 — 그래서 인계를 시작하기
   * **전** 화면이 「지금 넘긴다면 무엇이 실리는가」를 셀 때 문서만 빠져 있었고,
   * 그 자리에 「업무마다 질의를 더 돌려야 한다」고 적혀 있었다. 세는 방법은
   * `comment_count` 와 똑같다(목업은 필터, Supabase 는 임베드 count) —
   * 새 질의가 아니라 이미 도는 질의에 칸 하나를 더하는 일이다.
   */
  document_count: number;
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
  /**
   * 이 글이 부른 사람들. 본문의 `@이름` 글자가 아니라 **고른 사실**이다
   * (supabase/migrations/0020 — 동명이인과 본문 수정 때문에 표로 둔다).
   */
  mentions: Profile[];
}

export interface NoteWithPeople extends Note {
  author: Profile;
  recipient: Profile;
}

/**
 * 쪽지 실 하나. 쪽지함의 한 줄이자 업무 상세의 한 덩어리다 — 같은 것을 두
 * 자리에서 보는 것이지 복사가 아니다.
 */
export interface NoteThread {
  thread_id: string;
  work: { id: string; title: string };
  /**
   * 보는 사람 기준의 상대. 쪽지함에서 「누구와의 대화인가」다.
   * 업무 상세처럼 제3자가 볼 때는 뿌리 쪽지를 **받은** 사람이 온다 —
   * 그 화면에서 궁금한 것은 「바깥의 누구에게 물었나」이기 때문이다.
   */
  counterpart: Profile;
  notes: NoteWithPeople[];
  /** 나에게 온 것 중 아직 안 읽은 수. 제3자에게는 언제나 0이다. */
  unread: number;
  last_at: string;
}

export interface AttachmentWithUploader extends Attachment {
  uploader: Profile;
}

export interface ApprovalStepWithApprover extends ApprovalStep {
  approver: Profile;
}

/**
 * 화면이 받는 결재 문서 한 벌.
 *
 * work 가 null 일 수 있다. 결재선에 이름이 있으면 그 업무를 볼 수 없어도 문서
 * 한 장은 보이기 때문이다(0017 의 approval_select). 다른 과 주무관에게 협조를
 * 구하면서 그 과의 업무를 통째로 열어 줄 이유는 없다 — 화면은 그 자리에
 * 제목 대신 「열람 권한이 없는 업무」라고 적는다.
 */
export interface ApprovalWithSteps extends Approval {
  drafter: Profile;
  steps: ApprovalStepWithApprover[];
  work: Pick<Work, "id" | "title"> | null;
}

export interface HandoverNoteWithAuthor extends HandoverNote {
  author: Profile;
}

/**
 * 인계 건에 딸린 문답 한 줄.
 *
 * 서식에 실리는 「보충」(HandoverNote)과 **타입에서부터 갈라 둔다.** 둘이 한
 * 타입이면 언젠가 한 화면에서 섞여 그려지고, 그때 별지 제12호서식에 두 사람의
 * 잡담이 실린다(0022 의 「서식에는 안 실린다」).
 */
export interface HandoverMessage {
  id: string;
  handover_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface HandoverMessageWithAuthor extends HandoverMessage {
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

/**
 * 인계 단계의 이름.
 *
 * 상태값은 넷 그대로인데 뜻이 옮겨졌다(0026). `generated` 는 「초안이 나왔다」가
 * 아니라 **둘이 확인하는 중**이고, `confirmed` 는 「인계자가 확인했다」가 아니라
 * **결재를 받는 중**이다. 이름이 옛 뜻으로 남아 있으면 화면이 거짓말을 한다.
 */
export const HANDOVER_STATUS_LABEL: Record<HandoverStatus, string> = {
  draft: "대상 선정",
  generated: "확인 서명",
  confirmed: "결재 상신",
  completed: "인수 완료",
};

/**
 * 결재유형 8가지의 이름. 규정·시행규칙의 낱말을 그대로 쓴다(ApprovalKind 머리말).
 *
 * 「승인」·「검토자」 같은 사기업 낱말로 바꾸면 공무원이 화면을 보고 무엇을 하는
 * 칸인지 다시 배워야 한다. DB의 approval_kind 열거형과 **같은 목록**이다.
 */
export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  draft: "기안",
  review: "결재",
  final: "최종결재",
  delegated: "전결",
  acting: "대결",
  concur_seq: "협조",
  concur_par: "협조",
  post_report: "사후보고",
};

/** 결재란 아래 줄(협조)로 내려갈 유형. 시행규칙 제4조의 「검토·협조」층이다. */
export const CONCUR_KINDS: readonly ApprovalKind[] = ["concur_seq", "concur_par"];

export const APPROVAL_STATE_LABEL: Record<ApprovalState, string> = {
  drafting: "기안 중",
  in_progress: "진행 중",
  completed: "완결",
  rejected: "반려",
  withdrawn: "회수",
};

/**
 * 별지 제2호서식이 담는 문서 갈래.
 *
 * 발신문서(별지 제1호서식)는 여기 없다. 그건 온나라의 자리이고, 그 경계가
 * 이 제품이 온나라를 대체하지 않는다는 주장의 근거다.
 */
export const APPROVAL_FORM_LABEL: Record<ApprovalForm, string> = {
  report: "보고서",
  plan: "계획서",
  review: "검토서",
  cooperation: "업무협조",
};

/** 문서번호의 가운데 마디. app.next_doc_no() 가 붙이는 값과 같아야 한다. */
export const APPROVAL_FORM_DOC_LABEL: Record<ApprovalForm, string> = {
  report: "보고",
  plan: "계획",
  review: "검토",
  cooperation: "협조",
};

export const APPROVAL_FORMS = [
  "report",
  "plan",
  "review",
  "cooperation",
] as const satisfies readonly ApprovalForm[];

/** 폼으로 넘어온 값은 믿지 않는다. DB의 approval_form_check 와 같은 목록이다. */
export function isApprovalForm(v: unknown): v is ApprovalForm {
  return typeof v === "string" && (APPROVAL_FORMS as readonly string[]).includes(v);
}

/**
 * 보존연한(년). 「공공기록물 관리에 관한 법률 시행령」 제26조.
 * 준영구·영구는 여기 없다 — 그 둘이 필요한 문서는 애초에 발신문서다(0016 주석).
 */
export const RETENTION_YEARS = [1, 3, 5, 10, 30] as const;

/** 제목·본문의 상한. DB의 approval_title_check · approval_body_check 와 같은 값이다. */
export const APPROVAL_TITLE_MAX = 200;
export const APPROVAL_BODY_MAX = 20000;
/** 의견·반려 사유의 상한. DB의 approval_step_opinion_check 와 같은 값이다. */
export const APPROVAL_OPINION_MAX = 500;

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
export type ActivityTone = "권한" | "내용" | "대화" | "인계" | "결재";

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
  // 쪽지도 대화다 — 안에서 한 것과 밖에 물어본 것이 같은 색으로 묶인다.
  "note.sent": "대화",
  "note.answered": "대화",
  "attachment.added": "내용",
  "attachment.removed": "내용",
  "handover.started": "인계",
  "handover.completed": "인계",
  "approval.submitted": "결재",
  "approval.signed": "결재",
  "approval.rejected": "결재",
  "approval.completed": "결재",
  "approval.withdrawn": "결재",
};

/**
 * 실제 표시할 상태를 계산한다.
 * '지연'은 DB에 저장하지 않는다. 저장하면 매일 밤 배치로 갱신해야 하고,
 * 그 배치가 실패하면 화면이 거짓말을 한다.
 *
 * ── 지연의 정의는 여기 세 줄이 원본이다 ────────────────────────────────────
 *
 * 끝나지 않았고 · 기한이 있고 · 그 기한이 오늘보다 앞이다. 셋이 전부 참일
 * 때만 지연이다. `data/db.ts` 의 조회가 **같은 세 조건을 SQL 로** 옮겨 적고
 * 있고, 둘이 갈라지지 않는지는 `tests/overdue-rule.test.mjs` 가 잰다.
 *
 * ── 「오늘」이 한동안 두 개였다 ─────────────────────────────────────────────
 *
 * 이 자리에 `todayISO()` 가 따로 있었고 **UTC 기준**이었다. 그런데 카드에
 * 찍히는 「28일 지남」은 `format.ts` 의 `daysUntil()` 이 만들고, 그쪽은
 * 처음부터 `todayKST()`(Asia/Seoul)를 봤다. 한국은 UTC+9 라 **매일
 * 00:00~09:00 KST 동안 두 값이 다른 날짜**였다.
 *
 * 그 아홉 시간 동안 어제 마감인 업무는 이렇게 보였다.
 *
 *     날짜 글자  「1일 지남」 (붉게)
 *     배지       「진행중」            ← todayISO 가 아직 어제라서
 *     지연 개수   제외
 *
 * 한 카드가 같은 사실을 두 가지로 말했다. 공무원 출근 시각이 정확히 그 창
 * 안이라 9시가 지나면 조용히 맞아졌고, 그래서 버그로 신고되지 않고 「가끔
 * 이상하다」로 남는 종류였다.
 *
 * **고르는 문제가 아니라 지우는 문제였다** — 옳은 쪽이 이미 있었다.
 * 시간대 상수(TZ)가 format.ts 에 하나뿐이므로 「오늘」도 거기 하나만 둔다.
 * 여기서 그것을 가져다 쓴다. 상수를 두 곳에 두면 같은 사고가 다시 난다.
 */
export function derivedStatus(work: Pick<Work, "status" | "due_date">): DerivedStatus {
  if (work.status === "done" || !work.due_date) return work.status;
  return work.due_date < todayKST() ? "overdue" : work.status;
}

