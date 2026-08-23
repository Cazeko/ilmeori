"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWork, roleIn } from "@/lib/data";
import { getDemoState, setDemoState } from "@/lib/demo-state";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { requireViewer } from "@/lib/session";
import type { Profile, WorkVisibility } from "@/lib/types";
import { classifyError } from "./feedback";
import { changed, finish, openSession, openWork } from "./guard";

/**
 * 업무를 만들고, 고치고, 보관한다.
 *
 * ── 왜 부서를 고르게 하지 않는가 ───────────────────────────────────────────
 *
 * DB의 work_insert 정책은 department_id = app.my_department_id() 를 요구한다.
 * 남의 과 이름으로 업무를 만들 수 있으면 그 과의 부서 공개 목록에 아무나 글을
 * 심을 수 있고, 소관이 어디인지가 곧 책임이 어디인지인 행정에서 그것은 그 자체로
 * 사고다. 그래서 화면에 부서 선택을 두지 않고 본인 소속으로 고정한다.
 * owner_id·created_by도 같은 이유로 폼에서 받지 않는다. 넘어온 값을 믿는 순간
 * 남의 이름으로 업무를 만드는 경로가 생긴다.
 *
 * ── 왜 새 업무의 id를 여기서 만드는가 ──────────────────────────────────────
 *
 * insert(...).select() 로 새 행을 돌려받지 않는다. 업무를 만들면 AFTER INSERT
 * 트리거가 참여자(소유자) 행을 만드는데, RETURNING 이 SELECT 정책을 통과할지가
 * 공개범위에 따라 달라진다. private 업무라면 참여자 행이 아직 없는 시점의 판정에
 * 걸려 방금 만든 자기 업무를 돌려받지 못할 수 있다. id를 먼저 정해 두면 그 문제가
 * 아예 생기지 않고, 만든 직후 곧장 그 업무로 보낼 수 있다.
 *
 * ── 왜 삭제가 없는가 ───────────────────────────────────────────────────────
 *
 * 보관(archived_at)만 있고 지우기는 없다. DB에는 work_delete 정책이 있지만
 * 화면에서 부르지 않는다. 지울 수 있는 감사 기록은 감사 기록이 아니다.
 * 잘못 만든 업무도 지우는 대신 보관한다.
 *
 * ── 실패를 어떻게 확인하는가 ───────────────────────────────────────────────
 *
 * UPDATE에는 반드시 .select()를 붙이고 changed()로 확인한다. RLS는 막을 때
 * 오류가 아니라 "0행 바뀜"으로 조용히 끝나고, 확인하지 않으면 화면이
 * "저장했습니다"라고 말하면서 데이터는 그대로인 상태가 된다.
 * INSERT는 다르다. 정책에 걸린 INSERT는 오류로 돌아오므로 error만 보면 된다.
 */

/** text 컬럼이라 DB에는 상한이 없다. 여기서 정하는 이유는 저장 실패가 아니라 화면이 무너지지 않게 하기 위해서다. */
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 4000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VISIBILITIES = ["private", "department", "city"] as const;
const STATUSES = ["todo", "doing", "review", "done"] as const;

/**
 * 만들 때와 고칠 때가 같은 칸을 받는다. 두 곳에 따로 두면 한쪽에만 제한이 붙는다.
 *
 * 자바스크립트 없이 도는 폼이라 검증에 걸리면 사용자가 적던 내용이 사라진다.
 * 그래서 여기가 1차 방어선이 아니라 마지막 그물이다. 실제로 걸러야 할 것은
 * 화면의 required·maxlength·type=date 가 먼저 막고, 여기는 폼을 거치지 않고
 * 들어온 POST를 받아 낸다.
 */
const WorkInput = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE),
  description: z.string().trim().max(MAX_DESCRIPTION).nullable(),
  dueDate: z
    .string()
    .regex(DATE_ONLY)
    // 2026-02-31 은 모양은 맞지만 없는 날이다. Postgres가 거절하기 전에 여기서 잡는다.
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()))
    .nullable(),
  previousYearWorkId: z.string().regex(UUID).nullable(),
});

/** 빈 칸은 "안 적었다"가 아니라 "비웠다"이다. 빈 문자열이 아니라 null로 옮긴다. */
function text(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function readWorkInput(formData: FormData) {
  return WorkInput.safeParse({
    title: text(formData, "title"),
    description: text(formData, "description"),
    dueDate: text(formData, "dueDate"),
    previousYearWorkId: text(formData, "previousYearWorkId"),
  });
}

/**
 * 「작년 이맘때」로 가리켜도 되는 업무인가.
 *
 * 폼은 내가 볼 수 있는 업무만 후보로 내놓지만, 서버 액션은 폼을 거치지 않고
 * POST로 직접 부를 수 있다. 여기서 다시 확인하지 않으면 볼 수 없는 업무의 id를
 * 붙여 두고 "그 업무가 존재한다"는 사실을 확인하는 데 쓸 수 있다.
 */
async function canLinkPreviousYear(
  viewer: Profile,
  targetId: string,
  selfId: string | null,
): Promise<boolean> {
  // 자기 자신의 작년 판이 자기 자신일 수는 없다. 화면이 자기를 가리키는 고리가 된다.
  if (selfId && targetId === selfId) return false;
  return Boolean(await getWork(viewer, targetId));
}

export async function createWork(formData: FormData) {
  const { viewer, supabase } = await openSession();

  const parsed = readWorkInput(formData);
  if (!parsed.success) return finish("/works/new", "invalid");

  // 공개범위는 DB에도 기본값이 있지만, 모르는 값이 왔을 때 조용히 기본값으로
  // 바꿔치지 않는다. 사용자가 고른 것과 다른 값으로 저장되는 편이 더 나쁘다.
  const visibility: WorkVisibility | undefined = VISIBILITIES.find(
    (v) => v === formData.get("visibility"),
  );
  if (!visibility) return finish("/works/new", "invalid");

  // 소속 부서가 없는 계정은 work_insert 정책을 통과할 수 없다.
  // 여기서 막지 않으면 DB 오류가 "저장하지 못했습니다"로만 보이고 이유가 안 남는다.
  if (!viewer.department_id) return finish("/works/new", "work.no_department");

  const previousYearWorkId = parsed.data.previousYearWorkId;
  if (
    previousYearWorkId &&
    !(await canLinkPreviousYear(viewer, previousYearWorkId, null))
  ) {
    return finish("/works/new", "invalid");
  }

  // fiscal_year는 보내지 않는다. DB 기본값(올해)이 있고, 회계연도를 클라이언트가
  // 정하게 두면 작년 목록에 올해 업무를 섞어 넣을 수 있다.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("work").insert({
    id,
    title: parsed.data.title,
    description: parsed.data.description,
    due_date: parsed.data.dueDate,
    visibility,
    department_id: viewer.department_id,
    owner_id: viewer.id,
    created_by: viewer.id,
    previous_year_work_id: previousYearWorkId,
  });
  if (error) return finish("/works/new", classifyError(error));

  // 참여자 행과 '업무가 등록되었습니다' 이력은 우리가 적지 않는다. 트리거가 적는다.
  revalidatePath("/works");
  revalidatePath("/");
  finish(`/works/${id}`, "work.created");
}

export async function updateWork(formData: FormData) {
  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );
  const back = `/works/${work.id}/edit`;

  const parsed = readWorkInput(formData);
  if (!parsed.success) return finish(back, "invalid");

  const previousYearWorkId = parsed.data.previousYearWorkId;
  if (
    previousYearWorkId &&
    !(await canLinkPreviousYear(viewer, previousYearWorkId, work.id))
  ) {
    return finish(back, "invalid");
  }

  // 공개범위·소관부서·주담당은 여기서 건드리지 않는다. 공개범위는 참여자와 함께
  // 판단해야 하는 값이라 참여자·권한 화면에 있고, 부서와 주담당은 인계로만 움직인다.
  const { data, error } = await supabase
    .from("work")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      due_date: parsed.data.dueDate,
      previous_year_work_id: previousYearWorkId,
    })
    .eq("id", work.id)
    .select("id");

  if (error) return finish(back, classifyError(error));
  if (!changed(data)) return finish(back, "denied");

  revalidatePath(`/works/${work.id}`);
  revalidatePath("/works");
  revalidatePath("/");
  finish(`/works/${work.id}`, "work.updated");
}

/**
 * 진행 상태 바꾸기.
 *
 * 데모 모드 분기가 여기에만 남아 있다. openWork는 데모 모드를 읽기 전용으로
 * 되돌려 보내는데, 상태 바꾸기는 시연 동선에 남겨 둔 유일한 쓰기다.
 * (쿠키 4KB에 들어가는 크기이기도 하다 — src/lib/env.ts의 canMutate 참고)
 * 그래서 데모 경로만 guard를 거치지 않고 예전 방식으로 권한을 직접 확인한다.
 *
 * 성공했다고 따로 알리지 않는다. 네 칸 중 하나가 눌린 상태로 다시 그려지므로
 * 결과가 화면에 그대로 보이고, aria-pressed가 그 사실을 읽어 준다.
 */
export async function changeStatus(formData: FormData) {
  const workId = formData.get("workId");
  const status = STATUSES.find((s) => s === formData.get("status"));
  if (typeof workId !== "string" || !workId || !status) return;

  if (!isSupabaseConfigured) {
    const viewer = await requireViewer();
    const work = await getWork(viewer, workId);
    if (!work) return;

    // 열람자는 고칠 수 없다. 화면에서 감춰도 요청은 만들 수 있으므로 여기서 막는다.
    const role = roleIn(work, viewer);
    if (role !== "owner" && role !== "editor") return;

    const state = await getDemoState();
    await setDemoState({
      ...state,
      workStatus: { ...state.workStatus, [workId]: status },
    });

    revalidatePath(`/works/${workId}`);
    revalidatePath("/works");
    revalidatePath("/");
    return;
  }

  const { work, supabase } = await openWork(workId, "edit");
  const { data, error } = await supabase
    .from("work")
    .update({ status })
    .eq("id", work.id)
    .select("id");

  if (error) return finish(`/works/${work.id}`, classifyError(error));
  if (!changed(data)) return finish(`/works/${work.id}`, "denied");
  // 상태가 바뀌었다는 이력은 우리가 적지 않는다. DB 트리거가 적는다.

  revalidatePath(`/works/${work.id}`);
  revalidatePath("/works");
  revalidatePath("/");
  finish(`/works/${work.id}`, "work.status_changed");
}

/**
 * 보관. 삭제가 아니다.
 *
 * 목록에서 빠질 뿐 문서·대화·이력·첨부는 그대로 남고 주소로 다시 열린다.
 * DB의 work_update 정책은 편집자에게도 열려 있지만, 화면에서는 소유자만 하게 한다.
 * 보관은 그 업무를 조직의 시야에서 내리는 결정이라 주인이 하는 편이 맞다.
 */
export async function archiveWork(formData: FormData) {
  const { work, supabase } = await openWork(formData.get("workId"), "own");
  const back = `/works/${work.id}/edit`;

  const { data, error } = await supabase
    .from("work")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", work.id)
    .select("id");

  if (error) return finish(back, classifyError(error));
  if (!changed(data)) return finish(back, "denied");

  revalidatePath(`/works/${work.id}`);
  revalidatePath("/works");
  revalidatePath("/");
  finish(`/works/${work.id}`, "work.archived");
}

export async function restoreWork(formData: FormData) {
  const { work, supabase } = await openWork(formData.get("workId"), "own");
  const back = `/works/${work.id}/edit`;

  const { data, error } = await supabase
    .from("work")
    .update({ archived_at: null })
    .eq("id", work.id)
    .select("id");

  if (error) return finish(back, classifyError(error));
  if (!changed(data)) return finish(back, "denied");

  revalidatePath(`/works/${work.id}`);
  revalidatePath("/works");
  revalidatePath("/");
  finish(`/works/${work.id}`, "work.restored");
}

/* ===========================================================================
   여러 건을 한 번에 보관하거나 꺼낸다 — 업무 보드의 「정리」 모드
   ===========================================================================

   한동안 보관은 `/works/[id]/edit` 안에만 있었다. 업무 상세로 들어가서
   「업무 고치기」를 누르고 맨 아래까지 내려가야 하는 자리라, 보관함에 쌓인
   업무를 되돌리려면 **한 건마다 세 번씩 눌러야 했다.**

   ── 왜 아이디를 그대로 UPDATE 에 넣지 않는가 ────────────────────────────

   `archived_at` 을 바꾸는 것은 소유자만 할 수 있고, 그 규칙을 DB 트리거가
   **예외를 던져서** 막는다(0011_work_field_guard.sql). RLS 정책처럼 조용히
   0행을 돌려주는 것이 아니라 statement 를 통째로 실패시킨다.

   그래서 고른 것을 그대로 `.in("id", ids)` 로 보내면, **남의 업무가 하나만
   섞여 있어도 내 업무 열 건이 함께 안 옮겨진다.** 화면은 체크박스를 내 것에만
   그리지만 폼 값은 믿지 않는다 — 서버 액션은 화면을 거치지 않고 POST 로
   직접 부를 수 있다.

   먼저 「이 중에 내가 소유자인 것」을 한 번의 질의로 고르고, 그것만 보낸다.
   질의 하나가 늘지만 이 배치가 통째로 실패할 자리가 없어진다. */

/**
 * 한 번에 옮길 수 있는 상한.
 *
 * 화면에서 고를 수 있는 수는 보드에 뜬 만큼이지만, 서버 액션은 화면을 거치지
 * 않고 POST 로 직접 부를 수 있다. 아이디 만 개를 실어 보내면 그대로 `.in()`
 * 한 줄에 들어가고, 그 질의는 아무도 기다려 주지 않는다.
 */
const MOVE_MAX = 200;

/** 폼에서 온 업무 아이디들. 값은 하나도 믿지 않고 모양만 먼저 거른다. */
function readWorkIds(formData: FormData): string[] {
  const seen = new Set<string>();
  for (const v of formData.getAll("workIds")) {
    if (typeof v === "string" && UUID.test(v)) seen.add(v);
  }
  return [...seen];
}

/** 조건이 걸린 보드로 돌아간다. 밖으로 나가는 주소는 통과시키지 않는다. */
function backToBoard(formData: FormData): string {
  const raw = safeNext(formData.get("back"));
  return raw.startsWith("/works") ? raw : "/works";
}

async function moveWorks(formData: FormData, to: "archive" | "restore") {
  const { viewer, supabase } = await openSession();
  const back = backToBoard(formData);

  const ids = readWorkIds(formData);
  if (ids.length === 0) return finish(back, "work.none_selected");
  if (ids.length > MOVE_MAX) return finish(back, "work.too_many");

  // 고른 것 중에 **내가 소유자인 것**만 남긴다.
  const { data: owned, error: ownError } = await supabase
    .from("work_member")
    .select("work_id")
    .eq("profile_id", viewer.id)
    .eq("role", "owner")
    .in("work_id", ids);

  if (ownError) return finish(back, classifyError(ownError));

  const mine = (owned ?? []).map((r) => r.work_id as string);
  if (mine.length === 0) return finish(back, "work.not_owner_only");

  const { data, error } = await supabase
    .from("work")
    .update({ archived_at: to === "archive" ? new Date().toISOString() : null })
    .in("id", mine)
    .select("id");

  if (error) return finish(back, classifyError(error));
  if (!changed(data)) return finish(back, "denied");

  // 옮긴 업무의 상세도 함께 무른다. 보관 표시가 그 화면 머리에 뜬다.
  for (const id of mine) revalidatePath(`/works/${id}`);
  revalidatePath("/works");
  revalidatePath("/");
  finish(back, to === "archive" ? "work.archived_many" : "work.restored_many");
}

export async function archiveWorks(formData: FormData) {
  return moveWorks(formData, "archive");
}

export async function restoreWorks(formData: FormData) {
  return moveWorks(formData, "restore");
}
