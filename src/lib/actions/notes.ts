"use server";

import { revalidatePath } from "next/cache";
import { getWork } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { classifyError } from "./feedback";
import { changed, finish } from "./guard";

/**
 * 쪽지 — 보내기 · 답장 · 지우기.
 *
 * ── 왜 openWork 를 안 쓰는가 ───────────────────────────────────────────────
 *
 * `openWork` 는 「이 업무를 고칠 자격」을 묻는다. 쪽지는 업무를 고치는 일이
 * 아니라 **업무에 대해 묻는 일**이다. 열람할 수 있으면 물을 수 있다 —
 * 댓글과 같은 문턱이고, DB 의 note_insert 정책도 `app.can_read_work` 를 본다.
 *
 * 그래서 `requireViewer` + `getWork` 로 직접 연다. 볼 수 없는 업무면 `getWork`
 * 가 null 을 주고 거기서 막힌다(존재 여부까지 함께 감춰진다).
 *
 * ── 데모 모드에서는 못 보낸다 ──────────────────────────────────────────────
 *
 * 대화 남기기와 다르다. 대화는 쿠키에 담기도록 240자로 맞춰져 있지만 쪽지는
 * 1,000자까지다 — 몇 통이면 4KB 를 넘고, 넘친 쿠키를 브라우저는 **조용히
 * 통째로 버린다.** 방금 보낸 쪽지가 새로고침하면 사라지는 화면은 없는 것만
 * 못하다(`getHandoverNotes` 와 같은 판단). 화면은 `canMutate` 로 쓰는 칸을
 * 아예 안 그리므로, 적을 곳이 있는데 안 저장되는 상태는 생기지 않는다.
 */

/** 0019 의 note_body_len 과 같은 값. 두 곳이 어긋나면 DB 가 먼저 거절한다. */
const MAX_BODY = 1000;

/** 쪽지를 보낸 뒤 돌아갈 자리 — 업무의 「대화」 탭. 물어본 자리가 거기다. */
const backTo = (workId: string) => `/works/${workId}?tab=talk`;

export async function sendNote(formData: FormData) {
  const viewer = await requireViewer();

  const workId = formData.get("workId");
  const recipientId = formData.get("recipientId");
  const raw = formData.get("body");

  if (typeof workId !== "string" || !workId) finish("/works", "invalid");
  const talk = backTo(workId);

  if (typeof recipientId !== "string" || !recipientId) {
    finish(talk, "note.no_recipient");
  }
  // DB 의 note_not_self 가 최종 방어선이지만, 거기까지 가면 사용자가 보는 것은
  // 「저장하지 못했습니다」뿐이다. 여기서 왜인지를 말해 준다.
  if (recipientId === viewer.id) finish(talk, "note.self");
  if (typeof raw !== "string") finish(talk, "invalid");

  const body = raw.trim().slice(0, MAX_BODY);
  if (!body) finish(talk, "invalid");

  // 볼 수 없는 업무를 걸어 두고 물으면 그 업무의 존재가 새어 나간다.
  const work = await getWork(viewer, workId);
  if (!work) finish("/works", "denied");
  if (!canMutate) finish(talk, "demo.readonly");

  const supabase = await createClient();
  // thread_id 를 보내지 않는다. 비우고 넣으면 DB 트리거가 자기 id 를 채워
  // 새 실의 뿌리가 된다(0019 의 trg_note_thread).
  // author_id 도 보내지 않는다 — 남의 이름으로 묻는 경로를 만들지 않는다.
  const { error } = await supabase
    .from("note")
    .insert({
      work_id: workId,
      author_id: viewer.id,
      recipient_id: recipientId,
      body,
    });
  if (error) finish(talk, classifyError(error));

  revalidatePath(`/works/${workId}`);
  revalidatePath("/notes");
  finish(talk, "note.sent");
}

export async function replyNote(formData: FormData) {
  const viewer = await requireViewer();

  const threadId = formData.get("threadId");
  const workId = formData.get("workId");
  const recipientId = formData.get("recipientId");
  const raw = formData.get("body");

  if (typeof threadId !== "string" || !threadId) finish("/notes", "invalid");
  const here = `/notes/${threadId}`;

  if (typeof workId !== "string" || !workId) finish("/notes", "invalid");
  if (typeof recipientId !== "string" || !recipientId) {
    finish(here, "note.no_recipient");
  }
  if (recipientId === viewer.id) finish(here, "note.self");
  if (typeof raw !== "string") finish(here, "invalid");

  const body = raw.trim().slice(0, MAX_BODY);
  if (!body) finish(here, "invalid");
  if (!canMutate) finish(here, "demo.readonly");

  // 받은 사람은 그 업무를 못 본다(설계 §3). 그래서 여기서 getWork 로 열지
  // 않는다 — 열면 답장하는 쪽이 업무를 볼 수 있어야 답할 수 있게 된다.
  // 실에 낄 자격은 DB 가 본다: trg_note_thread_guard 가 뿌리 쪽지의 두 사람과
  // 같은 쌍인지 확인하고, note_insert 정책이 author_id 를 고정한다.
  const supabase = await createClient();
  const { error } = await supabase.from("note").insert({
    work_id: workId,
    thread_id: threadId,
    author_id: viewer.id,
    recipient_id: recipientId,
    body,
  });
  if (error) finish(here, classifyError(error));

  revalidatePath(here);
  revalidatePath("/notes");
  revalidatePath(`/works/${workId}`);
  finish(here, "note.replied");
}

export async function deleteNote(formData: FormData) {
  const viewer = await requireViewer();

  const noteId = formData.get("noteId");
  const threadId = formData.get("threadId");
  if (typeof threadId !== "string" || !threadId) finish("/notes", "invalid");
  const here = `/notes/${threadId}`;
  if (typeof noteId !== "string" || !noteId) finish(here, "invalid");
  if (!canMutate) finish(here, "demo.readonly");

  // 지우는 것은 행이 아니라 시각이다. 행을 지우면 지웠다는 사실도 함께
  // 사라진다(comment 와 같은 판단). 0019 는 note 에 DELETE 권한 자체를 주지 않는다.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("author_id", viewer.id)
    .is("deleted_at", null)
    .select("id");

  if (error) finish(here, classifyError(error));
  // 정책에 걸린 UPDATE 는 오류가 아니라 0행으로 끝난다. 확인하지 않으면
  // 화면은 「지웠습니다」라고 말하고 쪽지는 그대로 남는다.
  if (!changed(data)) finish(here, "denied");

  revalidatePath(here);
  revalidatePath("/notes");
  finish(here, "note.deleted");
}
