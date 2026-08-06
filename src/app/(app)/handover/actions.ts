"use server";

import { revalidatePath } from "next/cache";
import { getHandoverFor } from "@/lib/data";
import { getDemoState, resetDemoState, setDemoState } from "@/lib/demo-state";
import { requireViewer } from "@/lib/session";

/**
 * 인계·인수 진행.
 *
 * 두 동작 모두 인계자 본인만 할 수 있다. 인수자가 스스로 남의 업무를
 * 넘겨받는 일이 없도록 서버에서 확인한다.
 * (같은 규칙을 DB의 public.execute_handover() 함수가 한 번 더 강제한다.
 *  거기서는 status가 confirmed인지, 이미 실행되지 않았는지, 업무별 소유자가
 *  정말 인계자인지까지 다시 본다)
 */

export async function confirmHandover() {
  const viewer = await requireViewer();
  const view = await getHandoverFor(viewer);
  if (!view) return;
  if (view.from.id !== viewer.id) return; // 인계자만 확인할 수 있다
  if (view.handover.status !== "generated") return;

  const state = await getDemoState();
  await setDemoState({ ...state, handoverStatus: "confirmed" });
  revalidatePath("/handover");
}

export async function executeHandover() {
  const viewer = await requireViewer();
  const view = await getHandoverFor(viewer);
  if (!view) return;
  if (view.from.id !== viewer.id) return;
  // 확인 단계를 건너뛴 실행은 받지 않는다. 되돌릴 수 없는 동작이다.
  if (view.handover.status !== "confirmed") return;

  const state = await getDemoState();
  await setDemoState({
    ...state,
    handoverStatus: "completed",
    transferred: view.items.map((i) => i.work.id),
  });

  revalidatePath("/handover");
  revalidatePath("/works");
  revalidatePath("/");
}

/** 시연을 처음부터 다시 보기 위한 되돌리기. 실제 제품에는 없는 기능이다. */
export async function resetDemo() {
  await requireViewer();
  await resetDemoState();
  revalidatePath("/", "layout");
}
