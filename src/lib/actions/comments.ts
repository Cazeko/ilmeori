"use server";

import { revalidatePath } from "next/cache";
import { getWork } from "@/lib/data";
import { getDemoState, setDemoState } from "@/lib/demo-state";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { classifyError } from "./feedback";
import { changed, finish, openWork } from "./guard";

/**
 * 대화 남기기와 지우기.
 *
 * ── 남기기가 guard의 openWork를 쓰지 않는 이유 ────────────────────────────
 *
 * openWork는 데모 모드에서 곧바로 되돌려 보낸다. 데모에는 고칠 DB가 없기 때문이다.
 * 그런데 대화 남기기만은 데모에서도 동작해야 한다. 남긴 글이 쿠키에 담기도록
 * 이미 맞춰져 있고, 심사 시연 동선이 거기에 걸려 있다.
 * 그래서 여기서는 requireViewer + getWork로 직접 연다. 확인하는 것은 같다 —
 * 볼 수 없는 업무면 getWork가 null을 주고, 존재 여부까지 거기서 막힌다.
 *
 * ── 지우기가 진짜 DELETE가 아닌 이유 ──────────────────────────────────────
 *
 * deleted_at에 시각을 적을 뿐 행은 남긴다. 행을 지우면 지웠다는 사실도 함께
 * 사라지기 때문이다. 트리거(trg_comment_activity)는 deleted_at이 null에서
 * null이 아닌 값으로 바뀌는 순간에만 comment.deleted 이력을 남기므로,
 * 진짜 DELETE로는 그 기록이 애초에 만들어지지 않는다.
 * 공문서를 다루는 시스템에서 "지운 적 없다"와 "지운 기록이 없다"는 다른 말이다.
 *
 * 본인 글만 지울 수 있다. DB의 comment_update_self 정책이 author_id = auth.uid()를
 * 요구하고, 여기서도 같은 조건을 걸어 두 겹으로 막는다.
 */

const MAX_BODY = 240;

export async function postComment(formData: FormData) {
  const viewer = await requireViewer();

  const workId = formData.get("workId");
  const raw = formData.get("body");

  // 어느 업무인지 모르면 돌아갈 화면도 없다. 목록으로 보낸다.
  if (typeof workId !== "string" || !workId) finish("/works", "invalid");

  const talk = `/works/${workId}?tab=talk`;
  if (typeof raw !== "string") finish(talk, "invalid");

  const body = raw.trim().slice(0, MAX_BODY);
  if (!body) finish(talk, "invalid");

  const work = await getWork(viewer, workId);
  if (!work) finish("/works", "denied");

  /**
   * 부를 사람.
   *
   * 본문의 `@이름` 글자를 파싱하지 않는다. 동명이인을 못 가리고, 본문을 고치면
   * 부른 사람이 조용히 바뀐다. 화면이 **고른 사실**을 보내 준다
   * (mention-box.tsx — 스크립트가 없으면 체크박스, 있으면 @ 목록. 보내는 값은 같다).
   *
   * 여기서는 참여자인지 보지 않는다. DB 의 comment_mention_insert 정책이
   * `app.is_work_member` 로 본다 — 화면에서 한 번 더 거르면 규칙이 두 벌이 되고,
   * 두 벌은 반드시 어긋난다(db.ts 머리글과 같은 판단).
   */
  const mentioned = [
    ...new Set(
      formData
        .getAll("mention")
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
    // 자기 자신을 부르는 것은 뜻이 없다. 알림도 자기가 한 일에는 안 간다.
  ].filter((id) => id !== viewer.id);

  if (canMutate) {
    const supabase = await createClient();
    // author_id를 클라이언트에서 받지 않는다. 남의 이름으로 글을 남기는 경로를 없앤다.
    // (DB의 comment_insert 정책도 author_id = auth.uid()를 요구한다)
    const { data, error } = await supabase
      .from("comment")
      .insert({ work_id: workId, author_id: viewer.id, body })
      .select("id")
      .single();
    // 오류를 그대로 던지면 화면이 통째로 오류 페이지가 된다. 대화 한 줄 때문에
    // 업무 상세를 못 보게 될 이유가 없으므로, 코드로 바꿔 제자리로 돌려보낸다.
    if (error) finish(talk, classifyError(error));

    if (data && mentioned.length > 0) {
      // 부름이 실패해도 글은 이미 올라갔다. 여기서 되돌리면 **글까지 사라지는데**
      // 사용자가 쓴 것은 글이다. 부름만 조용히 빠지고 글은 남는 편이 낫다 —
      // 그 사실은 화면에 바로 보인다(부른 사람 줄이 비어 있다).
      await supabase.from("comment_mention").insert(
        mentioned.map((profile_id) => ({ comment_id: data.id, profile_id })),
      );
    }
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
  // 성공에도 주소를 갈아 끼운다. 방금 실패해서 ?msg=failed가 붙은 상태로 다시
  // 남기면, 글은 올라갔는데 화면은 "저장하지 못했습니다"라고 말하게 된다.
  finish(talk, "comment.created");
}

export async function deleteComment(formData: FormData) {
  const workId = formData.get("workId");
  const commentId = formData.get("commentId");

  if (typeof workId !== "string" || !workId) finish("/works", "invalid");

  const talk = `/works/${workId}?tab=talk`;
  if (typeof commentId !== "string" || !commentId) finish(talk, "invalid");

  // 여는 문은 'read'다. 대화는 볼 수 있는 사람이면 남길 수 있고,
  // 지우는 자격은 역할이 아니라 "내가 쓴 글인가"로 갈리기 때문이다.
  const { viewer, supabase } = await openWork(workId, "read");

  const { data, error } = await supabase
    .from("comment")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("work_id", workId)
    .eq("author_id", viewer.id)
    // 이미 지운 글은 다시 건드리지 않는다. 처음 지운 시각이 감사 기록이고,
    // 다시 쓰면 그 시각이 밀려난다.
    .is("deleted_at", null)
    .select("id");

  if (error) finish(talk, classifyError(error));
  // 정책에 걸린 UPDATE는 오류가 아니라 0행으로 끝난다. 확인하지 않으면
  // 화면은 "삭제했습니다"라고 말하고 글은 그대로 남는다.
  if (!changed(data)) finish(talk, "denied");

  revalidatePath(`/works/${workId}`);
  finish(talk, "comment.deleted");
}
