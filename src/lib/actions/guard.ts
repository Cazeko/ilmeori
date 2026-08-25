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

/**
 * 기다림의 **바닥** — 3초.
 *
 * ── 왜 일부러 붙잡는가 ─────────────────────────────────────────────────────
 *
 * 인계서 초안과 결재 문서를 만드는 동안 화면 가운데에 도는 표시가 뜬다
 * (ui/form-waiting.tsx). 그런데 서버가 빠르게 끝내는 날에는 그 표시가 **번쩍
 * 하고 지나간다.** 사람은 그 깜빡임을 「뭔가 잘못 눌렸나」로 읽지, 「빨랐구나」로
 * 읽지 않는다 — 화면이 무엇을 했는지 알아볼 시간 자체가 없기 때문이다.
 *
 * 그래서 **최소 노출 시간**을 준다. 더하는 것이 아니라 바닥을 까는 것이다 —
 * 서버가 이미 3초를 넘겼으면 여기서는 한 밀리초도 더 기다리지 않는다.
 *
 * ── 이것이 무엇을 대가로 하는지 적어 둔다 ─────────────────────────────────
 *
 * **일을 일부러 늦추는 코드다.** 하루에 여러 번 쓰는 자리였다면 넣지 않았을
 * 것이다. 그렇지 않은 두 자리에만 건다 — 인계는 사람이 바뀔 때 한 번, 결재
 * 문서 만들기는 그보다 잦아도 하루 몇 번이다. 목록을 열거나 저장하는 것처럼
 * 반복되는 동작에는 **절대 붙이지 않는다.**
 *
 * 그리고 **성공 갈래에만** 건다. 오류를 3초 붙잡아 두는 것은 기다림이 아니라
 * 벌이다.
 */
const WAIT_FLOOR_MS = 3_000;

export async function holdFloor(startedAt: number): Promise<void> {
  const left = WAIT_FLOOR_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
}
