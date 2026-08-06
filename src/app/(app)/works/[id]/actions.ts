"use server";

import { revalidatePath } from "next/cache";
import { getWork } from "@/lib/data";
import { getDemoState, setDemoState } from "@/lib/demo-state";
import { requireViewer } from "@/lib/session";
import type { WorkStatus } from "@/lib/types";

/**
 * 업무 상세에서 일어나는 변경.
 *
 * 지금은 각자의 브라우저 쿠키에 쌓인다(src/lib/demo-state.ts).
 * Supabase가 연결되면 본문만 supabase.from(...).insert(...)로 바뀐다.
 *
 * 어느 쪽이든 **여기서 권한을 먼저 확인한다**.
 * 클라이언트가 보낸 workId를 그대로 믿고 쓰면, 볼 수 없는 업무에도 글을 남길 수 있다.
 */

const STATUSES: WorkStatus[] = ["todo", "doing", "review", "done"];
const MAX_BODY = 240;

export async function postComment(formData: FormData) {
  const viewer = await requireViewer();

  const workId = formData.get("workId");
  const raw = formData.get("body");
  if (typeof workId !== "string" || typeof raw !== "string") return;

  const body = raw.trim().slice(0, MAX_BODY);
  if (!body) return;

  // 볼 수 없는 업무면 getWork가 null을 준다. 존재 여부까지 여기서 막힌다.
  const work = await getWork(viewer, workId);
  if (!work) return;

  const state = await getDemoState();
  await setDemoState({
    ...state,
    comments: [
      ...state.comments,
      {
        // 개수 제한으로 오래된 글이 잘려 나가면 길이 기반 번호는 다시 겹친다.
        // 겹치면 React가 목록을 잘못 재사용한다.
        id: `demo-${crypto.randomUUID()}`,
        work_id: workId,
        author_id: viewer.id,
        body,
        created_at: new Date().toISOString(),
      },
    ],
  });

  revalidatePath(`/works/${workId}`);
}

export async function changeStatus(formData: FormData) {
  const viewer = await requireViewer();

  const workId = formData.get("workId");
  const status = formData.get("status");
  if (typeof workId !== "string" || typeof status !== "string") return;
  if (!STATUSES.includes(status as WorkStatus)) return;

  const work = await getWork(viewer, workId);
  if (!work) return;

  // 열람자는 고칠 수 없다. 화면에서 감춰도 요청은 만들 수 있으므로 여기서 막는다.
  // (같은 규칙을 DB의 work_update 정책이 한 번 더 강제한다)
  const role = work.members.find((m) => m.profile_id === viewer.id)?.role;
  if (role !== "owner" && role !== "editor") return;

  const state = await getDemoState();
  await setDemoState({
    ...state,
    workStatus: { ...state.workStatus, [workId]: status as WorkStatus },
  });

  revalidatePath(`/works/${workId}`);
  revalidatePath("/works");
}
