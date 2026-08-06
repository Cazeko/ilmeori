import type { Handover, Profile, WorkListItem } from "@/lib/types";

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
};

export type HandoverView = {
  handover: Handover;
  from: Profile;
  to: Profile;
  items: Array<{ work: WorkListItem; transferred: boolean }>;
};
