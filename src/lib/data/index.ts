import "server-only";

import { isSupabaseConfigured } from "@/lib/env";
import * as mock from "./mock";
import * as db from "./db";
import type {
  HandoverMessageWithAuthor,
  HandoverNoteWithAuthor,
  MemberRole,
  Profile,
  WorkListItem,
} from "@/lib/types";
import type { HandoverSummary, HandoverView, WorkFilter } from "./types";

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

export type {
  ApprovalSummary,
  HandoverSummary,
  HandoverView,
  WorkFilter,
  WorkRecords,
} from "./types";

export const listWorks = (
  viewer: Profile,
  filter?: WorkFilter,
  limit?: number,
) => impl.listWorks(viewer, filter, limit);

/**
 * 「기한이 지난 업무 N건」의 N.
 *
 * 목록에서 세지 않는다 — 목록은 상한에서 잘리므로 101번째 지연 업무가 수에서
 * 빠진다. 두 구현 모두 상한과 무관하게 전부 센다.
 */
export const countOverdueWorks = (viewer: Profile, filter?: WorkFilter) =>
  impl.countOverdueWorks(viewer, filter);

export const getWork = (viewer: Profile, id: string) => impl.getWork(viewer, id);

export const getWorkDocument = (workId: string) => impl.getWorkDocument(workId);
export const getActivities = (workId: string) => impl.getActivities(workId);
export const getComments = (workId: string) => impl.getComments(workId);
export const getAttachments = (workId: string) => impl.getAttachments(workId);
export const getAttachment = (id: string) => impl.getAttachment(id);

/**
 * 여러 업무의 기록을 한 번에. 인계 초안처럼 업무 목록을 통째로 훑는 화면용.
 * 한 건만 볼 때는 위의 낱개 함수들을 그대로 쓴다.
 */
export const gatherForWorks = (workIds: string[]) =>
  impl.gatherForWorks(workIds);

export const listProfiles = () => impl.listProfiles();

/**
 * 쪽지 — 두 함수가 서로 다른 것을 묻는다.
 *
 *   listNoteThreads    「내가 주고받은 것」  → 쪽지함
 *   getWorkNoteThreads 「이 업무에 오간 것」 → 업무 상세의 「바깥에 물어본 것」
 *
 * 후자에는 내가 낀 적 없는 실도 나온다. 그게 맞다 — 쪽지는 사적 대화가 아니라
 * **업무 기록**이고, 그래야 주담당이 인계서를 뽑을 때 그 문답이 실린다
 * (supabase/migrations/0019 의 note_select 정책과 같은 규칙).
 */
export const listNoteThreads = (viewer: Profile) => impl.listNoteThreads(viewer);

export const getNoteThread = (threadId: string, viewer: Profile) =>
  impl.getNoteThread(threadId, viewer);

export const getWorkNoteThreads = (
  workId: string,
  viewer: Profile,
  workTitle: string,
) => impl.getWorkNoteThreads(workId, viewer, workTitle);


/**
 * 결재.
 *
 * 두 구현 모두 **뷰어를 첫 인자로 받는다.** 대화·첨부와 달리 「누가 보는가」에
 * 따라 돌려줄 것이 달라지기 때문이다 — 기안 중인 문서는 기안자만 보고,
 * 결재선에 이름이 있는 사람은 그 업무를 못 봐도 문서 한 장은 본다.
 * db 구현에서는 RLS 가 그 판정을 하므로 인자를 쓰지 않지만, 서명을 맞춰 둔다.
 */
export const listApprovals = (viewer: Profile, limit?: number) =>
  impl.listApprovals(viewer, limit);

export const getApprovalsForWork = (viewer: Profile, workId: string) =>
  impl.getApprovalsForWork(viewer, workId);

export const getApproval = (viewer: Profile, id: string) =>
  impl.getApproval(viewer, id);

export const listApprovalsAwaitingMe = (viewer: Profile) =>
  impl.listApprovalsAwaitingMe(viewer);

/**
 * 업무 카드에 붙는 결재 진행률 — 화면에 뜬 업무 전부를 **한 번에** 묻는다.
 *
 * 업무 목록에 끼워 넣지 않은 이유는 data/types.ts 의 ApprovalSummary 주석에 있다.
 */
export const getApprovalSummaries = (
  viewer: Profile,
  workIds: readonly string[],
) => impl.getApprovalSummaries(viewer, workIds);

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
 * 내가 얽힌 인계 전부, 최근 것이 먼저.
 *
 * `getHandoverFor` 가 최신 한 건만 돌려주는 탓에 새 인계를 시작하면 끝난
 * 인계서가 화면에서 사라졌다. 그것을 되찾는 목록이다(db.ts 의 같은 이름).
 */
export const listHandovers = (viewer: Profile): Promise<HandoverSummary[]> =>
  impl.listHandovers(viewer);

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

/**
 * 인계 건에 딸린 문답.
 *
 * **보충과 달리 데모 모드에서도 동작한다.** 보충은 한 줄이 1000자까지라 쿠키
 * (4KB)에 한 번만 적어도 넘치고, 넘친 쿠키는 브라우저가 조용히 통째로 버린다.
 * 문답은 짧은 말이라 몇 줄은 담기고, 무엇보다 **시연에서 눌러 보는 물건**이다 —
 * 심사장에서 「여기서 물어볼 수 있습니다」라고 말해 놓고 적을 칸이 없으면
 * 그 자리에서 주장이 죽는다.
 *
 * 담기는 수에는 상한이 있고(demo-state.ts), 화면이 그 사실을 적는다.
 */
export const getHandoverMessages = (
  handoverId: string,
): Promise<HandoverMessageWithAuthor[]> =>
  isSupabaseConfigured
    ? db.getHandoverMessages(handoverId)
    : mock.getHandoverMessages(handoverId);

/**
 * 실을 열면 읽음으로 표시한다. 목업에는 찍을 곳이 없다 — 데모 모드는 쪽지를
 * 보내지도 읽음 표시를 남기지도 않는다(logAccess 와 같은 판단).
 */
export const markThreadRead = (threadId: string, viewerId: string) =>
  isSupabaseConfigured
    ? db.markThreadRead(threadId, viewerId)
    : Promise.resolve();

/**
 * 알림 — 사건만 담는다. 「내 차례 결재」처럼 처리해야 사라지는 것은 여기 없다
 * (supabase/migrations/0021 머리글).
 */
export const listNotifications = (viewer: Profile, limit: number) =>
  impl.listNotifications(viewer, limit);

export const countUnreadNotifications = (viewer: Profile) =>
  impl.countUnreadNotifications(viewer);

export const markNotificationRead = (id: number) => impl.markNotificationRead(id);

export const markAllNotificationsRead = (viewer: Profile) =>
  impl.markAllNotificationsRead(viewer);

export const listAccessLogs = (viewer: Profile, limit?: number) =>
  impl.listAccessLogs(viewer, limit);

export const getAccessLogsForWork = (workId: string, viewer: Profile) =>
  impl.getAccessLogsForWork(workId, viewer);

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
