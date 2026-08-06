"use server";

import { revalidatePath } from "next/cache";
import { classifyError } from "./feedback";
import { changed, finish, openWork } from "./guard";
import type { MemberRole, WorkVisibility } from "@/lib/types";

/**
 * 참여자·권한·공개 범위.
 *
 * 이 파일이 고치는 것은 업무의 내용이 아니라 "누가 이 업무를 볼 수 있는가"다.
 * 제목이 틀린 것은 고치면 되지만, 공개 범위가 하루 넓어져 있던 것은 되돌릴 수 없다.
 * 이미 본 사람이 못 본 사람이 되지는 않기 때문이다. 그래서 네 동작 모두 소유자에게만 연다.
 *
 * ── 공개 범위까지 소유자로 좁힌 이유 ───────────────────────────────────────
 *
 * DB의 work_update 정책은 편집자에게도 UPDATE를 허용한다. 즉 **지금은** 편집자가
 * 업무를 전 부서 공개로 돌리는 것을 DB가 막지 않는다. 편집자는 문서를 고치라고
 * 부른 사람이지 열람 범위를 정하라고 부른 사람이 아니므로, 여기서 소유자로 좁힌다.
 * 같은 규칙이 DB 정책에 들어가기 전까지는 이 파일이 그 규칙의 유일한 집행자다.
 * (별도 마이그레이션으로 DB에도 같은 규칙을 넣는다)
 *
 * ── 마지막 소유자를 여기서 세지 않는 이유 ──────────────────────────────────
 *
 * 소유자가 한 명뿐인 업무에서 그 사람을 빼거나 강등하는 것은 trg_guard_last_owner가
 * 막는다. 액션에서 미리 개수를 세면 두 사람이 같은 순간에 물러날 때 둘 다 통과하고,
 * 주인 없는 업무 — 아무도 참여자를 되돌릴 수 없는 업무 — 가 남는다.
 * 세는 일은 한 트랜잭션 안에서 보는 DB에 맡기고, 여기서는 던져 준 예외를
 * 사용자가 읽을 문구로 바꾸기만 한다.
 *
 * ── 「주담당」과 「소유 권한」은 다른 것이다 ────────────────────────────────
 *
 * work.owner_id 는 주담당 한 사람이고, work_member.role = 'owner' 는 소유 권한이며
 * 여럿일 수 있다. 스키마가 그렇게 나눠 놓은 이유는 실제 조직이 그렇기 때문이다 —
 * 과장과 담당 주무관이 함께 권한을 갖되 그 일의 주인은 한 사람이다.
 *
 * 둘이 어긋나면 화면이 거짓말을 한다. 주담당을 참여자에서 빼면 work.owner_id 는
 * 그 사람을 계속 가리키고, 업무 상세 머리에는 이제 이 업무를 볼 수도 없는 사람이
 * 「주담당」으로 찍힌다. DB에는 이걸 막는 제약이 없다(execute_handover 만이 둘을
 * 함께 옮긴다). 그래서 여기서 지킨다.
 *
 *   · 주담당은 참여자에서 뺄 수 없고, 소유 아래로 낮출 수도 없다
 *   · 먼저 changeLead 로 주담당을 넘기면 그다음에 뺄 수 있다
 *
 * 막는 쪽을 고른 것은, 자동으로 다른 사람을 주담당에 앉히면 그 사람은 자기가
 * 주인이 된 줄도 모른 채 남의 일을 떠안게 되기 때문이다.
 */

const ROLES: MemberRole[] = ["owner", "editor", "viewer"];
const VISIBILITIES: WorkVisibility[] = ["private", "department", "city"];

/**
 * uuid 모양이 아니면 질의를 보내지 않는다.
 * PostgREST는 uuid 자리에 아무 문자열이나 들어오면 22P02로 죽고, 그 오류는
 * classifyError가 'failed'("잠시 후 다시 시도해 주세요")로 뭉뚱그린다.
 * 다시 시도해도 될 리가 없는 실패에 그렇게 답하지 않으려고 앞에서 거른다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function readRole(value: unknown): MemberRole | null {
  return ROLES.find((r) => r === value) ?? null;
}

function readVisibility(value: unknown): WorkVisibility | null {
  return VISIBILITIES.find((v) => v === value) ?? null;
}

/** 참여자 탭으로 돌아간다. 방금 한 일의 결과는 그 화면에서 확인해야 한다. */
function peoplePath(workId: string) {
  return `/works/${workId}?tab=people`;
}

function revalidateWork(workId: string) {
  revalidatePath(`/works/${workId}`);
  // 참여자와 공개 범위는 목록에 무엇이 뜨는지를 바꾼다. 상세만 새로 그리면
  // 방금 부른 사람의 업무 목록에는 한동안 그 업무가 없다.
  revalidatePath("/works");
  revalidatePath("/");
}

/**
 * 참여자 추가.
 *
 * 부서 경계를 넘는 협업은 이 한 줄로 이뤄진다. 다른 과 직원을 여기 넣는 순간
 * 그 사람의 업무 목록에 이 업무가 나타나고, 그 전까지는 존재도 보이지 않는다.
 */
export async function addMember(formData: FormData): Promise<void> {
  const { work, viewer, supabase } = await openWork(
    formData.get("workId"),
    "own",
  );
  const path = peoplePath(work.id);

  const profileId = readId(formData.get("profileId"));
  const role = readRole(formData.get("role"));
  if (!profileId || !role) return finish(path, "invalid");

  // added_by는 폼에서 받지 않는다. 누가 불러들였는지는 서버가 이미 아는 사실이고,
  // 받는 순간 남의 이름으로 기록을 남기는 경로가 생긴다.
  const { error } = await supabase.from("work_member").insert({
    work_id: work.id,
    profile_id: profileId,
    role,
    added_by: viewer.id,
  });

  // INSERT는 정책에 걸리면 42501로 시끄럽게 실패한다. UPDATE·DELETE처럼 0행으로
  // 조용히 끝나지 않으므로 여기서는 바뀐 행 수를 따로 확인하지 않는다.
  // 이미 참여 중인 사람이면 23505가 오고, classifyError가 문구를 골라 준다.
  if (error) return finish(path, classifyError(error));

  revalidateWork(work.id);
  finish(path, "member.added");
}

/** 권한 바꾸기. 소유자가 스스로 물러나는 일이 실제로 있으므로 본인도 대상이 된다. */
export async function changeMemberRole(formData: FormData): Promise<void> {
  const { work, supabase } = await openWork(formData.get("workId"), "own");
  const path = peoplePath(work.id);

  const profileId = readId(formData.get("profileId"));
  const role = readRole(formData.get("role"));
  if (!profileId || !role) return finish(path, "invalid");

  // 주담당을 소유 아래로 낮추면 '주담당인데 고칠 수 없는 사람'이 된다.
  if (profileId === work.owner_id && role !== "owner") {
    return finish(path, "member.is_lead");
  }

  const { data, error } = await supabase
    .from("work_member")
    .update({ role })
    .eq("work_id", work.id)
    .eq("profile_id", profileId)
    .select();

  // 마지막 소유자를 강등하려 하면 트리거가 예외를 던진다.
  // 사용자가 스스로 고칠 수 있는 실패이므로 무슨 일인지 그대로 알린다.
  if (error) return finish(path, classifyError(error));
  if (!changed(data)) return finish(path, "denied");

  revalidateWork(work.id);
  finish(path, "member.role_changed");
}

/**
 * 주담당 넘기기.
 *
 * 소유 권한을 가진 참여자에게만 넘길 수 있다. 권한이 없는 사람을 주담당에 앉히면
 * 그 사람은 자기 이름이 붙은 업무를 고치지 못한다.
 *
 * 이 값이 바뀌면 트리거가 work.transferred 이력을 남긴다. 인계로 넘어간 것과 같은
 * 종류의 사건으로 기록되는데, 실제로 같은 일이기 때문이다 — 이 업무의 주인이 바뀌었다.
 */
export async function changeLead(formData: FormData): Promise<void> {
  const { work, supabase } = await openWork(formData.get("workId"), "own");
  const path = peoplePath(work.id);

  const profileId = readId(formData.get("profileId"));
  if (!profileId) return finish(path, "invalid");
  if (profileId === work.owner_id) return finish(path, "lead.changed");

  // 이미 가져온 참여자 목록으로 판정한다. 화면이 그린 것과 같은 근거를 쓴다.
  const next = work.members.find((m) => m.profile_id === profileId);
  if (!next || next.role !== "owner") return finish(path, "lead.not_owner");

  const { data, error } = await supabase
    .from("work")
    .update({ owner_id: profileId })
    .eq("id", work.id)
    .select("id");

  if (error) return finish(path, classifyError(error));
  if (!changed(data)) return finish(path, "denied");

  revalidateWork(work.id);
  finish(path, "lead.changed");
}

export async function removeMember(formData: FormData): Promise<void> {
  const { work, viewer, supabase } = await openWork(
    formData.get("workId"),
    "own",
  );
  const path = peoplePath(work.id);

  const profileId = readId(formData.get("profileId"));
  if (!profileId) return finish(path, "invalid");

  // 주담당을 빼면 work.owner_id 는 그 사람을 계속 가리킨 채로 남고, 업무 머리에는
  // 이제 이 업무를 볼 수도 없는 사람이 「주담당」으로 찍힌다.
  if (profileId === work.owner_id) return finish(path, "member.is_lead");

  const { data, error } = await supabase
    .from("work_member")
    .delete()
    .eq("work_id", work.id)
    .eq("profile_id", profileId)
    .select();

  if (error) return finish(path, classifyError(error));
  if (!changed(data)) return finish(path, "denied");

  revalidateWork(work.id);

  // 스스로 물러났으면 이 업무를 더는 못 볼 수 있다(참여자만 공개라면 확실히 그렇다).
  // 그 상태로 상세 화면에 돌려보내면 성공한 일의 결과가 404로 보인다.
  finish(profileId === viewer.id ? "/works" : path, "member.removed");
}

/** 공개 범위. 왜 소유자만인지는 파일 맨 위에 적었다. */
export async function changeVisibility(formData: FormData): Promise<void> {
  const { work, supabase } = await openWork(formData.get("workId"), "own");
  const path = peoplePath(work.id);

  const visibility = readVisibility(formData.get("visibility"));
  if (!visibility) return finish(path, "invalid");

  const { data, error } = await supabase
    .from("work")
    .update({ visibility })
    .eq("id", work.id)
    .select();

  if (error) return finish(path, classifyError(error));
  if (!changed(data)) return finish(path, "denied");

  revalidateWork(work.id);
  finish(path, "visibility.changed");
}
