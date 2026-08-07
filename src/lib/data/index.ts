import "server-only";

import { isSupabaseConfigured } from "@/lib/env";
import * as mock from "./mock";
import * as db from "./db";
import type {
  HandoverNoteWithAuthor,
  MemberRole,
  Profile,
  WorkListItem,
} from "@/lib/types";
import type { HandoverView, WorkFilter } from "./types";

/**
 * 데이터 접근 층 — 화면과 저장소 사이의 유일한 경계.
 *
 * 화면은 여기만 부른다. 실제로 답하는 쪽은 둘이다.
 *
 *   db.ts    Supabase가 설정되어 있을 때. 권한은 RLS가 강제한다
 *   mock.ts  설정이 없을 때. 목업 데이터로 모든 화면이 그대로 돌아간다
 *
 * 목업을 남겨 두는 이유는 개발 편의 때문만이 아니다.
 * DB 연결이 끊겨도 화면을 보여 줄 수 있어야 심사 당일이 안전하고,
 * 무엇보다 **실제 공문서가 들어갈 경로가 없는 상태**를 유지할 수 있다.
 *
 * 두 구현의 서명은 같다. 어긋나면 타입 검사에서 걸린다.
 */

const impl = isSupabaseConfigured ? db : mock;

export type { HandoverView, WorkFilter };

export const listWorks = (viewer: Profile, filter?: WorkFilter) =>
  impl.listWorks(viewer, filter);

export const getWork = (viewer: Profile, id: string) => impl.getWork(viewer, id);

export const getWorkDocument = (workId: string) => impl.getWorkDocument(workId);
export const getActivities = (workId: string) => impl.getActivities(workId);
export const getComments = (workId: string) => impl.getComments(workId);
export const getAttachments = (workId: string) => impl.getAttachments(workId);
export const getAttachment = (id: string) => impl.getAttachment(id);

export const listProfiles = () => impl.listProfiles();

export const getDepartments = () => impl.getDepartments();
export const getDepartment = (id: string) => impl.getDepartment(id);
export const getDepartmentTree = () => impl.getDepartmentTree();

export const getPreviousYearBrief = (viewer: Profile, previousWorkId: string) =>
  impl.getPreviousYearBrief(viewer, previousWorkId);

export const getDashboard = (viewer: Profile) => impl.getDashboard(viewer);

export const getHandoverFor = (viewer: Profile): Promise<HandoverView | null> =>
  impl.getHandoverFor(viewer);

export const getHandover = (viewer: Profile, id: string) =>
  impl.getHandover(viewer, id);

/**
 * 인계자가 서식 항목에 보탠 글.
 *
 * 목업에는 없다 — 언제나 0건이다. 보충은 쿠키가 아니라 DB에만 쌓기 때문이다.
 * 데모 모드의 변경분은 브라우저 쿠키(4KB)에 담기는데 보충은 한 줄이 1000자까지라
 * 한 번만 적어도 넘치고, 넘친 쿠키는 브라우저가 **조용히 통째로 버린다.**
 * 방금 적은 글이 새로고침하면 사라지는 화면은 없는 것만 못하다
 * (env.ts의 canMutate와 같은 판단이고, logAccess가 여기서 갈리는 이유도 같다).
 *
 * 화면은 데모 모드에서 보충 칸 자체를 그리지 않으므로, 적을 곳이 있는데 안
 * 저장되는 상태는 생기지 않는다.
 */
export const getHandoverNotes = (
  handoverId: string,
): Promise<HandoverNoteWithAuthor[]> =>
  isSupabaseConfigured ? db.getHandoverNotes(handoverId) : Promise.resolve([]);

export const listAccessLogs = (viewer: Profile, limit?: number) =>
  impl.listAccessLogs(viewer, limit);

export const getAccessLogsForWork = (workId: string) =>
  impl.getAccessLogsForWork(workId);

/**
 * 열람기록 남기기. 목업 모드에서는 남길 곳이 없으므로 아무 일도 하지 않는다.
 * (기록이 없는 것과 기록을 못 남기는 것은 다르지만, 목업에는 애초에 사용자가 없다)
 */
export const logAccess = (workId: string, kind: string) =>
  isSupabaseConfigured ? db.logAccess(workId, kind) : Promise.resolve();

/**
 * 이 사람이 이 업무에서 가진 역할. 이미 가져온 데이터만 보므로 질의가 없다.
 * 화면에서 버튼을 감출지 정하는 용도이고, 실제로 막는 것은 서버와 DB다.
 */
export function roleIn(work: WorkListItem, viewer: Profile): MemberRole | null {
  return work.members.find((m) => m.profile_id === viewer.id)?.role ?? null;
}
