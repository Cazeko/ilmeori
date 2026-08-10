import type {
  ActivityWithActor,
  ApprovalState,
  AttachmentWithUploader,
  CommentWithAuthor,
  DocSectionWithEditor,
  Document,
  Handover,
  Profile,
  WorkListItem,
} from "@/lib/types";

/**
 * 두 구현(목업·Supabase)이 공유하는 계약.
 *
 * 이 파일에 있는 것이 화면과 저장소 사이의 약속이다.
 * 어느 쪽 구현을 쓰든 화면은 같은 모양을 받는다.
 */

export type WorkFilter = {
  /** 부서 id. 없으면 전체 */
  departmentId?: string;
  /** 내가 참여한 업무만 */
  mine?: boolean;
  /** 제목·설명 검색어 */
  q?: string;
  /** 기한이 지난 미완료 업무만 */
  overdueOnly?: boolean;
  /**
   * 보관한 업무만 볼 것인가. 기본은 보관하지 않은 것만이다.
   * 보관은 삭제가 아니므로 반드시 다시 찾아갈 길이 있어야 한다.
   */
  archived?: boolean;
};

/**
 * 업무 한 건에 딸린 기록 묶음.
 *
 * 인계 초안처럼 **여러 업무를 한꺼번에** 훑는 화면이 쓴다. 화면 하나가 업무
 * 한 건만 볼 때는 getWorkDocument/getActivities/... 를 그대로 쓰면 된다.
 *
 * 계약: gatherForWorks 는 **요청한 id 전부**를 키로 돌려준다. 못 보는 업무는
 * 키가 없는 것이 아니라 빈 기록이다(uuid 모양이 아닌 id 만 빠진다).
 */
export type WorkRecords = {
  document: Document | null;
  sections: DocSectionWithEditor[];
  activities: ActivityWithActor[];
  attachments: AttachmentWithUploader[];
  comments: CommentWithAuthor[];
};

export type HandoverView = {
  handover: Handover;
  from: Profile;
  to: Profile;
  items: Array<{ work: WorkListItem; transferred: boolean }>;
};

/**
 * 업무 카드에 붙는 결재 진행률.
 *
 * ── 왜 WorkListItem 안에 넣지 않는가 ───────────────────────────────────────
 *
 * 목록 질의(listWorks)에 결재를 임베드하면 **업무를 세는 모든 화면**이 결재까지
 * 읽는다. 홈·보드·인계 대상 선정·작년 판 미리보기가 전부 그렇다. 배지는 보드와
 * 홈에만 필요하므로, 필요한 화면이 **한 번 더 묻는** 쪽으로 뒀다.
 * 업무마다 한 번씩 묻는 것이 아니라, 화면에 뜬 업무 전부를 한 질의로 가져온다.
 *
 * ── 기안 중인 문서는 세지 않는다 ──────────────────────────────────────────
 *
 * 기안 중인 문서는 기안자만 본다. 카드에 「기안 중」이 뜨면 같은 카드가 사람마다
 * 다른 말을 하게 된다 — RLS 가 막아 주므로 새는 것은 아니지만, 보드는 여럿이
 * 같이 보는 화면이라 그 자리에는 **모두가 같이 보는 사실**만 적는 편이 맞다.
 */
export type ApprovalSummary = {
  /** 이 업무에 달린, 내가 볼 수 있는 상신된 결재 문서 수 */
  count: number;
  /** 가장 최근에 움직인 것 하나. 배지는 이 문서를 가리킨다. */
  latest: {
    id: string;
    state: ApprovalState;
    signed: number;
    total: number;
  };
};
