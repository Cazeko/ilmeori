"use server";

import { revalidatePath } from "next/cache";
import { getHandoverFor } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getDemoState, resetDemoState, setDemoState } from "@/lib/demo-state";
import { requireViewer } from "@/lib/session";

/**
 * 인계·인수 진행.
 *
 * 두 동작 모두 인계자 본인만 할 수 있다. 인수자가 스스로 남의 업무를
 * 넘겨받는 일이 없어야 하기 때문이다.
 *
 * 실행은 public.execute_handover() 함수가 한다. 애플리케이션에서 update를
 * 여러 번 날려 흉내 내지 않는 이유는, 중간에 실패하면 절반만 넘어간 상태가
 * 남기 때문이다. 함수 안에서 한 트랜잭션으로 처리하고,
 * 거기서 호출자가 인계자인지·상태가 confirmed인지·이미 실행되지 않았는지·
 * 업무별 소유자가 정말 인계자인지까지 다시 확인한다.
 */

export async function confirmHandover() {
  const viewer = await requireViewer();
  const view = await getHandoverFor(viewer);
  if (!view) return;
  if (view.from.id !== viewer.id) return; // 인계자만 확인할 수 있다
  if (view.handover.status !== "generated") return;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("handover")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", view.handover.id);
    if (error) throw error;
  } else {
    const state = await getDemoState();
    await setDemoState({ ...state, handoverStatus: "confirmed" });
  }

  revalidatePath("/handover");
}

export async function executeHandover() {
  const viewer = await requireViewer();
  const view = await getHandoverFor(viewer);
  if (!view) return;
  if (view.from.id !== viewer.id) return;
  // 확인 단계를 건너뛴 실행은 받지 않는다. 되돌릴 수 없는 동작이다.
  if (view.handover.status !== "confirmed") return;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("execute_handover", {
      p_handover_id: view.handover.id,
    });
    if (error) throw error;
  } else {
    const state = await getDemoState();
    await setDemoState({
      ...state,
      handoverStatus: "completed",
      transferred: view.items.map((i) => i.work.id),
    });
  }

  revalidatePath("/handover");
  revalidatePath("/works");
  revalidatePath("/");
}

/**
 * 시연을 처음부터 다시 보기 위한 되돌리기. 실제 제품에는 없는 기능이다.
 *
 * 데모 모드에서만 동작한다. Supabase에 연결된 뒤에는 인계가 실제로 실행되고
 * 그 사실이 이력에 남으므로, 되돌리는 버튼이 있으면 안 된다.
 * 기록을 지울 수 있는 감사 기록은 감사 기록이 아니다.
 */
export async function resetDemo() {
  await requireViewer();
  if (isSupabaseConfigured) return;
  await resetDemoState();
  revalidatePath("/", "layout");
}
