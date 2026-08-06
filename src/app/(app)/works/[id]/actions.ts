"use server";

import { revalidatePath } from "next/cache";
import { getWork, roleIn } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getDemoState, setDemoState } from "@/lib/demo-state";
import { requireViewer } from "@/lib/session";
import type { WorkStatus } from "@/lib/types";

/**
 * 업무 상세에서 일어나는 변경.
 *
 * 어느 저장소를 쓰든 **여기서 권한을 먼저 확인한다.**
 * 클라이언트가 보낸 workId를 그대로 믿으면, 볼 수 없는 업무에도 글을 남길 수 있다.
 *
 * 그렇다고 여기가 마지막 방어선은 아니다. 같은 규칙을 DB의 정책이 한 번 더 강제하므로,
 * 이 파일에 버그가 있어도 데이터는 새지 않는다. 여기서 막는 이유는
 * 사용자에게 제대로 된 실패를 돌려주기 위해서다.
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

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    // author_id를 클라이언트에서 받지 않는다. 남의 이름으로 글을 남기는 경로를 없앤다.
    // (DB의 comment_insert 정책도 author_id = auth.uid() 를 요구한다)
    const { error } = await supabase
      .from("comment")
      .insert({ work_id: workId, author_id: viewer.id, body });
    if (error) throw error;
  } else {
    const state = await getDemoState();
    await setDemoState({
      ...state,
      comments: [
        ...state.comments,
        {
          id: `demo-${crypto.randomUUID()}`,
          work_id: workId,
          author_id: viewer.id,
          body,
          created_at: new Date().toISOString(),
        },
      ],
    });
  }

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
  const role = roleIn(work, viewer);
  if (role !== "owner" && role !== "editor") return;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("work")
      .update({ status })
      .eq("id", workId);
    if (error) throw error;
    // 상태가 바뀌었다는 이력은 우리가 적지 않는다. DB 트리거가 적는다.
  } else {
    const state = await getDemoState();
    await setDemoState({
      ...state,
      workStatus: { ...state.workStatus, [workId]: status as WorkStatus },
    });
  }

  revalidatePath(`/works/${workId}`);
  revalidatePath("/works");
  revalidatePath("/");
}
