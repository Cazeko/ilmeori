import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWork, roleIn } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Profile, WorkListItem } from "@/lib/types";
import { withFeedback, type FeedbackCode } from "./feedback";

/**
 * 서버 액션이 시작할 때 반드시 거치는 문.
 *
 * ── 여기서 막는 이유 ──────────────────────────────────────────────────────
 *
 * 마지막 방어선은 여기가 아니다. 같은 규칙을 DB의 정책이 한 번 더 강제하므로,
 * 이 파일에 버그가 있어도 데이터는 새지 않는다.
 *
 * 그럼에도 여기서 먼저 막는 이유는 두 가지다.
 *   1) 사용자에게 제대로 된 실패를 돌려주기 위해서. RLS에 걸리면 오류가 아니라
 *      "0행이 바뀌었습니다"로 조용히 끝나고, 화면은 성공한 것처럼 보인다.
 *   2) 볼 수 없는 업무의 존재 여부가 새지 않게 하기 위해서. 없는 업무와
 *      못 보는 업무는 여기서부터 구분되지 않는다.
 *
 * 서버 액션은 화면을 거치지 않고 POST로 직접 호출할 수 있다. 폼에 없는 값도
 * 얼마든지 실어 보낼 수 있으므로, 넘어온 값은 하나도 믿지 않는다.
 */

type Opened = {
  viewer: Profile;
  work: WorkListItem;
  role: MemberRole | null;
  supabase: SupabaseClient;
};

/** 이 액션에 필요한 권한. DB의 can_read_work / can_edit_work / is_work_owner와 같은 층위다. */
type Need = "read" | "edit" | "own";

/**
 * 업무를 열고 권한을 확인한다. 자격이 없으면 여기서 되돌려 보내고 뒤는 실행되지 않는다.
 *
 * 반환값에 supabase 클라이언트를 함께 주는 것은 편의가 아니라 규칙이다.
 * 이 클라이언트는 **로그인한 사용자의 세션**으로 나가므로 RLS가 그대로 적용된다.
 * 액션이 직접 createClient를 부르지 않게 해서, service_role 클라이언트가
 * 슬그머니 섞여 들어올 자리를 만들지 않는다.
 */
export async function openWork(rawWorkId: unknown, need: Need): Promise<Opened> {
  const viewer = await requireViewer();

  if (typeof rawWorkId !== "string" || !rawWorkId) redirect("/works?msg=invalid");

  // 데모 모드에는 쓸 곳이 없다. 아래를 참고.
  if (!canMutate) redirect(withFeedback(`/works/${rawWorkId}`, "demo.readonly"));

  const work = await getWork(viewer, rawWorkId);
  // 볼 수 없는 업무는 목록으로 돌려보낸다. "권한이 없습니다"라고 답하면
  // 그 업무가 존재한다는 사실 자체가 새어 나간다.
  if (!work) redirect("/works?msg=denied");

  const role = roleIn(work, viewer);
  const allowed =
    need === "read"
      ? true // getWork가 null이 아니면 이미 열람 권한이 있다
      : need === "edit"
        ? role === "owner" || role === "editor"
        : role === "owner";

  if (!allowed) redirect(withFeedback(`/works/${work.id}`, "denied"));

  return { viewer, work, role, supabase: await createClient() };
}

/**
 * 업무에 매이지 않은 액션(업무 생성·인계 시작)이 쓰는 문.
 */
export async function openSession(): Promise<{
  viewer: Profile;
  supabase: SupabaseClient;
}> {
  const viewer = await requireViewer();
  if (!canMutate) redirect(withFeedback("/works", "demo.readonly"));
  return { viewer, supabase: await createClient() };
}

/** 결과를 알리며 원래 화면으로. redirect는 예외를 던지므로 뒤 코드는 실행되지 않는다. */
export function finish(path: string, code: FeedbackCode): never {
  redirect(withFeedback(path, code));
}

/**
 * 고쳐 쓴 행이 하나도 없으면 RLS가 막은 것이다.
 *
 * PostgREST는 정책에 걸린 UPDATE·DELETE를 오류로 돌려주지 않는다. 조건에 맞는 행이
 * 없었던 것과 구분되지 않기 때문이다. 이걸 확인하지 않으면 화면은 "저장했습니다"라고
 * 말하고 데이터는 그대로인 상태가 된다 — 사용자에게 거짓말을 하는 가장 흔한 경로다.
 */
export function changed(data: unknown[] | null): boolean {
  return Array.isArray(data) && data.length > 0;
}
