"use server";

import { revalidatePath } from "next/cache";
import { getHandoverFor, listProfiles, listWorks, roleIn } from "@/lib/data";
import { getDemoState, resetDemoState, setDemoState } from "@/lib/demo-state";
import { isSupabaseConfigured } from "@/lib/env";
import { buildHandoverDraft } from "@/lib/handover-draft";
import { requireViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Handover } from "@/lib/types";
import { classifyError } from "./feedback";
import { finish, openSession } from "./guard";

/**
 * 인계·인수.
 *
 * 시작·확인·실행 모두 인계자 본인만 할 수 있다. 인수자가 스스로 남의 업무를
 * 넘겨받는 일이 없어야 하기 때문이다.
 *
 * 실행은 public.execute_handover() 함수가 한다. 애플리케이션에서 update를
 * 여러 번 날려 흉내 내지 않는 이유는, 중간에 실패하면 절반만 넘어간 상태가
 * 남기 때문이다. 함수 안에서 한 트랜잭션으로 처리하고,
 * 거기서 호출자가 인계자인지·상태가 confirmed인지·이미 실행되지 않았는지·
 * 업무별 소유자가 정말 인계자인지까지 다시 확인한다.
 *
 * ── ai_model에 모델 이름을 적지 않는 이유 ──────────────────────────────────
 *
 * 초안을 만드는 것은 buildHandoverDraft()이고, 그것은 쌓인 기록을 서식 순서대로
 * 조립하는 규칙 기반 코드다. 어떤 모델도 부르지 않는다.
 * 그래서 ai_model에는 'rule-based/v1'을 적는다. 이 칸은 감사 목적으로 있는
 * 칸이므로, 여기에 부르지도 않은 모델 이름을 적는 것은 기록의 위조다.
 */

/** 초안을 만든 방식. 모델 이름이 아니라 만든 방법을 적는 칸으로 쓴다. */
const DRAFT_GENERATOR = "rule-based/v1";

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
    // 함수는 **실제로 옮긴 건수**를 돌려준다. 대상 수와 다를 수 있다 —
    // 인계서를 만든 뒤 누군가 그 업무의 소유 권한을 바꿨으면 함수가 그 건을
    // 건너뛰기 때문이다(그게 맞다. 더는 내 업무가 아닌 것을 넘길 수는 없다).
    // 이 값을 버리면 화면은 언제나 전부 넘어간 것처럼 말하고, 인사이동에서
    // 넘긴 줄 알고 떠나는 일이 생긴다.
    const { data: moved, error } = await supabase.rpc("execute_handover", {
      p_handover_id: view.handover.id,
    });
    if (error) throw error;

    revalidatePath("/handover");
    revalidatePath("/works");
    revalidatePath("/");

    if (typeof moved === "number" && moved < view.items.length) {
      finish("/handover", "handover.partial");
    }
    finish("/handover", "handover.executed");
  }

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

/**
 * 인계 시작 — 인수자와 넘길 업무를 정하고 초안까지 만든다.
 *
 * 여기서 권한이 옮겨 가지는 않는다. 만드는 것은 handover 한 건과 그 대상 목록,
 * 그리고 확인용 초안뿐이다. 실제 이전은 확인을 거친 뒤 executeHandover가 한다.
 */
export async function startHandover(formData: FormData) {
  const { viewer, supabase } = await openSession();

  // 한 번에 하나만 진행한다. 같은 업무를 담은 인계가 둘 생기면 그 업무가
  // 누구에게 갔는지 기록만으로 판별할 수 없게 되고, 뒤늦게 되짚을 방법이 없다.
  //
  // getHandoverFor 로 확인하지 않는다. 그것은 최신 한 건만 보고 넘기는 건과
  // 넘겨받는 건을 구분하지 않으므로, 남이 나에게 넘기는 인계가 더 나중에
  // 만들어져 있으면 내 진행 중인 인계를 못 보고 지나친다.
  const { data: running } = await supabase
    .from("handover")
    .select("id")
    .eq("from_profile_id", viewer.id)
    .neq("status", "completed")
    .limit(1);
  if (running && running.length > 0) {
    finish("/handover", "handover.in_progress");
  }

  const toProfileId = formData.get("toProfileId");
  // 자기 자신에게 넘기는 것은 DB의 check 제약이 막는다. 그전에 여기서 돌려보내
  // 사용자가 읽을 수 있는 이유를 준다.
  if (
    typeof toProfileId !== "string" ||
    !toProfileId ||
    toProfileId === viewer.id
  ) {
    finish("/handover/new", "handover.no_target");
  }

  // 실재하는 재직자인지 확인한다. 목록은 정책이 재직자만 돌려주므로,
  // 퇴직·휴직자에게 업무를 넘기는 경로가 여기서 막힌다.
  const people = await listProfiles();
  const to = people.find((p) => p.id === toProfileId);
  if (!to) finish("/handover/new", "handover.no_target");

  // 넘길 수 있는 것은 내가 소유자인 업무뿐이다. handover_item_insert 정책이
  // app.is_work_owner(work_id)를 요구하므로 남의 업무 id를 실어 보내면 DB가
  // 거절한다. 다만 그때는 고른 것 전부가 한꺼번에 실패해 무엇이 문제였는지
  // 말해 줄 수 없으므로, 서버에서 먼저 걸러 낸다.
  const picked = new Set(
    formData.getAll("workIds").filter((v): v is string => typeof v === "string"),
  );
  const mine = await listWorks(viewer, { mine: true });
  const targets = mine.filter(
    (w) => roleIn(w, viewer) === "owner" && picked.has(w.id),
  );
  if (targets.length === 0) finish("/handover/new", "handover.no_items");

  // id를 미리 정한다. 대상 목록을 넣으려면 handover의 id가 먼저 있어야 하는데,
  // 삽입 결과를 되읽는 방식은 정책에 걸리는 순간 빈손으로 돌아온다.
  const handoverId = crypto.randomUUID();
  const now = new Date().toISOString();

  const handover: Handover = {
    id: handoverId,
    from_profile_id: viewer.id,
    to_profile_id: to.id,
    status: "generated",
    document_draft: null,
    ai_model: DRAFT_GENERATOR,
    generated_at: now,
    confirmed_at: null,
    completed_at: null,
    created_at: now,
  };

  // 초안은 방금 고른 업무로 바로 만든다. DB에 다시 물어볼 이유가 없고,
  // 물어보면 왕복만 늘어난다.
  const draft = await buildHandoverDraft({
    handover,
    from: viewer,
    to,
    items: targets.map((work) => ({ work, transferred: false })),
  });

  // 화면은 열 때마다 초안을 다시 조립하지만, 저장해 두는 판은 따로 필요하다.
  // "그때 무엇이 적혀 있었는가"는 나중에 기록을 다시 만들어서는 답할 수 없다.
  const documentDraft = draft.blocks
    .map((b) => `${b.heading}\n${b.paragraphs.join("\n\n")}`)
    .join("\n\n");

  const { error } = await supabase.from("handover").insert({
    id: handoverId,
    // 남의 이름으로 인계를 시작하는 경로를 없앤다.
    // (handover_insert 정책도 from_profile_id = auth.uid()를 요구한다)
    from_profile_id: viewer.id,
    to_profile_id: to.id,
    status: "generated",
    document_draft: documentDraft,
    ai_model: DRAFT_GENERATOR,
    generated_at: now,
  });
  if (error) finish("/handover/new", classifyError(error));

  const { error: itemError } = await supabase
    .from("handover_item")
    .insert(targets.map((w) => ({ handover_id: handoverId, work_id: w.id })));

  // 두 문장은 한 트랜잭션이 아니다. 여기서 실패하면 대상이 0건인 인계 행만 남고,
  // 그 상태로는 '진행 중인 인계가 있다'에 걸려 다시 시작할 수도 없다.
  // 그래서 직접 되돌린다. 아직 실행되지 않은 인계라 지워도 잃는 기록이 없다.
  // (한 번에 묶으려면 SECURITY DEFINER RPC가 필요하다 — 2차예선 과제로 둔다)
  if (itemError) {
    await supabase.from("handover").delete().eq("id", handoverId);
    finish("/handover/new", classifyError(itemError));
  }

  revalidatePath("/handover");
  finish("/handover", "handover.started");
}

/**
 * 인계 취소 — 실행 전에만.
 *
 * 인수자를 잘못 골랐을 때 되돌릴 길이 없으면, 한 번에 한 건만 진행한다는 규칙 때문에
 * 그 사람은 영영 새 인계를 시작하지 못한다. 아무 권한도 옮겨 가지 않은 초안을 지우는 것은
 * 기록을 지우는 것이 아니라 오타를 고치는 것이다.
 *
 * 완료된 인계는 지울 수 없다. 정책(handover_delete_unstarted)이 status <> 'completed'를
 * 요구하므로, 여기서 실수로 열어 두어도 DB가 막는다.
 */
export async function cancelHandover() {
  const { viewer, supabase } = await openSession();

  const view = await getHandoverFor(viewer);
  if (!view) finish("/handover", "invalid");
  if (view.from.id !== viewer.id) finish("/handover", "denied");
  if (view.handover.status === "completed") {
    finish("/handover", "handover.cannot_cancel");
  }

  const { data, error } = await supabase
    .from("handover")
    .delete()
    .eq("id", view.handover.id)
    .select("id");

  if (error) finish("/handover", classifyError(error));
  // 여기까지 온 건은 바로 위에서 completed가 아님을 확인했다. 그러므로 0행은
  // '이미 실행됐다'가 아니라 그 사이 사라졌거나 정책(0008)이 아직 없다는 뜻이다.
  // 실행됐다고 말하면 사실이 아닌 데다, 사용자가 할 일도 달라진다.
  if (!data || data.length === 0) finish("/handover", "stale");

  revalidatePath("/handover");
  finish("/handover", "handover.cancelled");
}
