"use server";

import { revalidatePath } from "next/cache";
import {
  getHandoverFor,
  listProfiles,
  listWorks,
  roleIn,
} from "@/lib/data";
import { getDemoState, resetDemoState, setDemoState } from "@/lib/demo-state";
import { isSupabaseConfigured } from "@/lib/env";
import { buildHandoverDraft } from "@/lib/handover-draft";
import { requireViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  handoverBlockAnchor,
  isHandoverBlockKey,
  HANDOVER_NOTE_MAX,
  type Handover,
  type HandoverBlockKey,
} from "@/lib/types";
import { classifyError } from "./feedback";
import { changed, finish, openSession } from "./guard";

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

// ---------------------------------------------------------------------------
// 인계자가 보태는 글
// ---------------------------------------------------------------------------

/**
 * 초안을 손보는 유일한 길.
 *
 * 화면은 「인계자가 확인하고 고쳐야 하는 초안」이라고 적어 두고 오랫동안 고칠
 * 수단을 주지 않았다. 특히 3번(물품·예산)은 코드가 스스로 "직접 적어야 합니다"
 * 라고 적고 표시까지 달아 두고 적을 칸이 없었다.
 *
 * 그렇다고 전문 편집을 열지는 않는다. 규칙이 뽑은 문단을 사람이 덮어쓰면
 * 그 옆에 붙은 근거 꼬리표가 그 순간 거짓말이 된다. 이 제품의 주장이
 * 「문장마다 어느 기록에서 나왔는지 적는다」이므로, 그것만은 지켜야 한다.
 * 그래서 규칙이 뽑은 본문은 그대로 두고 사람이 적은 것을 **항목마다 따로 쌓는다.**
 *
 * 확인 단계(confirmed)에서도 열어 둔다. 잠기는 것은 실행된 뒤다 —
 * 「내용을 확인했습니다」는 아직 되돌릴 수 있는 걸음이고, 실행은 아니다.
 */
/**
 * 한 인계 건에 쌓을 수 있는 보충 수. **DB의 trg_handover_note_limit 과 같은 값이다.**
 *
 * 실제로 막는 것은 DB다. 여기서 한 번 더 세는 이유는 사용자에게 읽을 수 있는
 * 말을 해 주기 위해서다 — 트리거가 던지는 예외는 화면에 그대로 옮길 수 없다.
 * 상한을 넘겨서 손해를 보는 쪽은 인계자가 아니라 **인수자**다. 인계서를 받아
 * 읽어야 하는 사람의 화면과 인쇄본이 무거워지고, 실행이 끝나면 아무도 지울 수 없다.
 */
const HANDOVER_NOTE_LIMIT = 30;

/** 성공하면 그 항목으로 돌아온다. 일곱 칸짜리 문서에서 맨 위로 튕기면 무엇이 달라졌는지 못 본다. */
function blockPath(key: HandoverBlockKey): string {
  return `/handover#${handoverBlockAnchor(key)}`;
}

export async function addHandoverNote(formData: FormData) {
  const { viewer, supabase } = await openSession();

  const rawKey = formData.get("blockKey");
  const rawId = formData.get("handoverId");
  const rawBody = formData.get("body");

  // 폼에 없는 값도 얼마든지 실어 보낼 수 있다. 아는 칸 이름이 아니면 여기서 끝낸다.
  // (DB의 handover_note_block_key_check도 같은 목록을 요구한다)
  if (!isHandoverBlockKey(rawKey)) finish("/handover", "invalid");

  const view = await getHandoverFor(viewer);
  if (!view) finish("/handover", "invalid");
  // 화면에 떠 있던 인계와 지금 진행 중인 인계가 다르면, 그 사이 취소되고 새로
  // 시작됐다는 뜻이다. 엉뚱한 인계서에 글이 들어가는 것보다 다시 하라고 말하는
  // 편이 낫다.
  if (rawId !== view.handover.id) finish("/handover", "stale");
  // 인계서는 넘기는 사람이 쓰고 서명하는 문서다. 인수자가 문장을 넣을 수 있으면
  // 서명란의 뜻이 사라진다. 정책(handover_note_insert)도 같은 것을 요구한다.
  if (view.from.id !== viewer.id) finish("/handover", "denied");
  if (view.handover.status === "completed") {
    finish("/handover", "handover.note.locked");
  }

  if (typeof rawBody !== "string") finish("/handover", "invalid");
  const body = rawBody.trim();
  // 빈 글이 쌓이면 종이에 이름과 날짜만 찍힌 줄이 나온다. DB의 check도 같다.
  if (!body) finish("/handover", "invalid");
  // 잘라서 넣지 않는다. 입력칸이 maxLength로 막고 있으므로 여기까지 긴 글이
  // 온 것은 폼을 거치지 않은 요청이고, 그때 조용히 자르면 **끝이 잘린 문장이
  // 결재 문서에 그대로 인쇄된다.** 자른 사실을 아무도 모른다는 것이 문제다.
  if (body.length > HANDOVER_NOTE_MAX) finish("/handover", "handover.note.long");

  // 한 인계 건에 쌓을 수 있는 수. 상한이 없으면 인계자가 자기 인계서 하나로
  // 인수자의 화면과 인쇄본을 못 쓰게 만들 수 있고, 실행된 뒤에는 아무도 지울 수
  // 없다. 일곱 칸짜리 서식에 서른 줄이면 실제 쓰임에는 넉넉하다.
  const { count, error: countError } = await supabase
    .from("handover_note")
    .select("id", { count: "exact", head: true })
    .eq("handover_id", view.handover.id);
  if (countError) finish("/handover", classifyError(countError));
  if ((count ?? 0) >= HANDOVER_NOTE_LIMIT) {
    finish("/handover", "handover.note.too_many");
  }

  const { error } = await supabase.from("handover_note").insert({
    handover_id: view.handover.id,
    block_key: rawKey,
    body,
    // author_id를 폼에서 받지 않는다. 남의 이름으로 인계서에 문장을 넣는 경로를 없앤다.
    author_id: viewer.id,
  });
  // 실패는 항목이 아니라 화면 맨 위로 돌려보낸다. 알림 판이 거기 있고,
  // 항목으로 튀면 무엇이 잘못됐는지 적힌 줄을 지나치게 된다.
  if (error) finish("/handover", classifyError(error));

  revalidatePath("/handover");
  finish(blockPath(rawKey), "handover.note.added");
}

/**
 * 보충 지우기 — 실행 전에만, 자기가 적은 것만.
 *
 * 고쳐 쓰는 길은 두지 않았다. 보충에는 적은 사람과 시각이 함께 붙고 그 날짜가
 * 인쇄본에 그대로 찍히므로, 몸통만 나중에 바뀌면 종이에 찍힌 날짜가 거짓이 된다.
 * 지우고 다시 적으면 새 시각이 붙는다 — 그쪽이 사실에 가깝다.
 *
 * 지우는 것 자체는 인계 취소와 같은 판단이다. 아직 아무 권한도 옮겨 가지 않은
 * 초안에서 한 줄을 빼는 것은 기록을 지우는 것이 아니라 오타를 고치는 것이다.
 */
export async function deleteHandoverNote(formData: FormData) {
  const { viewer, supabase } = await openSession();

  const rawKey = formData.get("blockKey");
  const rawNoteId = formData.get("noteId");
  if (!isHandoverBlockKey(rawKey)) finish("/handover", "invalid");
  if (typeof rawNoteId !== "string" || !rawNoteId) finish("/handover", "invalid");

  const view = await getHandoverFor(viewer);
  if (!view) finish("/handover", "invalid");
  if (view.from.id !== viewer.id) finish("/handover", "denied");
  if (view.handover.status === "completed") {
    finish("/handover", "handover.note.locked");
  }

  const { data, error } = await supabase
    .from("handover_note")
    .delete()
    .eq("id", rawNoteId)
    // 지금 보고 있는 인계의 것만. id 하나만 믿으면 남의 인계서의 줄을 지우는
    // 요청이 정책에만 기대게 된다.
    .eq("handover_id", view.handover.id)
    .eq("author_id", viewer.id)
    .select("id");

  if (error) finish("/handover", classifyError(error));
  // 여기까지 온 건은 바로 위에서 실행 전임을 확인했다. 그러므로 0행은
  // "이미 실행됐다"가 아니라 그 사이 사라졌다는 뜻이다(cancelHandover와 같은 자리).
  if (!changed(data)) finish("/handover", "stale");

  revalidatePath("/handover");
  finish(blockPath(rawKey), "handover.note.deleted");
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
