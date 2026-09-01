"use server";

import { revalidatePath } from "next/cache";
import { classifyError } from "./feedback";
import { changed, finish, openSession } from "./guard";

/**
 * 내 프로필 — 연락처와 부서 이동.
 *
 * ── 이 파일이 고치는 것과 고치지 않는 것 ───────────────────────────────────
 *
 * 프로필의 칸은 두 부류로 갈린다.
 *
 *   본인이 고친다   내선번호 · 휴대전화 · 휴대전화 공개 여부
 *   본인이 못 고친다 소속부서 · 직급 · 서열 · 이메일 · 계정상태
 *
 * 아래 updateContact 는 **앞의 셋만** 만진다. 뒤의 다섯은 폼에서 받지도 않고,
 * 설령 누가 POST 로 실어 보내도 DB의 trg_profile_immutable_fields 가 막는다
 * (0003 → 0016 → 0023). 서버 액션은 폼을 거치지 않고 부를 수 있으므로,
 * 「화면에 칸이 없다」는 방어가 아니다.
 *
 * ── 소속만은 왜 절차가 붙는가 ──────────────────────────────────────────────
 *
 * work.visibility = 'department' 인 업무의 열람 판정이 profile.department_id
 * 하나를 본다. 본인이 이 칸을 쓸 수 있으면 소속을 바꾸는 것만으로 남의 과
 * 업무가 열린다 — 기능이 아니라 권한상승이다.
 *
 * 그래서 이 파일에는 **소속을 쓰는 코드가 없다.** 신청을 만들고, 승인자가
 * 결정하고, 소속을 실제로 바꾸는 것은 DB 함수 하나(decide_transfer)뿐이다.
 * 여기 있는 것은 그 함수를 부르는 세 줄과, 실패를 사람이 읽는 말로 바꾸는 일이다.
 */

const ME = "/me";

/**
 * 형식 검사를 DB와 **같은 정규식**으로 한다.
 *
 * 여기서 거르는 이유는 막기 위해서가 아니라(막는 것은 0023 의 check 제약이다)
 * 사용자에게 무엇이 틀렸는지 말해 주기 위해서다. 제약 위반은 23514 로 오는데,
 * 그 코드는 「저장하지 못했습니다」로 뭉개진다.
 */
const EXT = /^[0-9][0-9-]{2,19}$/;
const MOBILE = /^01[016789]-[0-9]{3,4}-[0-9]{4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * 연락처 저장.
 *
 * 내선과 휴대는 저장되는 곳이 다르다(profile 의 칸 / profile_contact 의 행).
 * 그래도 폼은 하나다 — 사용자에게는 「내 연락처」 한 덩어리이고, 어디에 어떻게
 * 담기는지는 이 제품의 사정이지 그 사람의 사정이 아니다.
 *
 * 휴대전화를 비우면 **행을 지운다.** is_public 을 끄는 것과는 다른 일이다.
 * 「등록한 적 없는 상태」로 못 돌아가면 사람은 가짜 번호를 적어 넣는다.
 */
export async function updateContact(formData: FormData): Promise<void> {
  const { viewer, supabase } = await openSession();

  const ext = text(formData.get("phoneExt"));
  const mobile = text(formData.get("mobile"));
  const isPublic = formData.get("mobilePublic") === "on";

  if (ext && !EXT.test(ext)) return finish(ME, "contact.ext_invalid");
  if (mobile && !MOBILE.test(mobile)) return finish(ME, "contact.mobile_invalid");

  // 빈 칸은 null 이다. 빈 문자열을 넣으면 화면이 「번호가 있는데 안 보이는」
  // 상태가 되고, check 제약도 빈 문자열은 통과시키지 않는다.
  const { data, error } = await supabase
    .from("profile")
    .update({ phone_ext: ext || null })
    .eq("id", viewer.id)
    .select("id");
  if (error) return finish(ME, classifyError(error));
  // UPDATE 가 0행이면 RLS 가 막은 것이다. 여기서 확인하지 않으면 화면이
  // 「저장했습니다」라고 말하고 값은 그대로다.
  if (!changed(data)) return finish(ME, "denied");

  if (!mobile) {
    const { error: delError } = await supabase
      .from("profile_contact")
      .delete()
      .eq("profile_id", viewer.id);
    if (delError) return finish(ME, classifyError(delError));
    revalidateMe(viewer.id);
    // 원래 없던 사람에게도 같은 문구가 뜬다. 「지웠습니다」가 아니라
    // 「등록한 적 없는 상태로 돌아갑니다」라고 적은 이유다 — 둘 다 참이다.
    return finish(ME, "contact.mobile_removed");
  }

  const { data: saved, error: upError } = await supabase
    .from("profile_contact")
    .upsert(
      { profile_id: viewer.id, mobile, is_public: isPublic },
      { onConflict: "profile_id" },
    )
    .select("profile_id");
  if (upError) return finish(ME, classifyError(upError));
  if (!changed(saved)) return finish(ME, "denied");

  revalidateMe(viewer.id);
  finish(ME, "contact.saved");
}

/**
 * 이동 신청.
 *
 * 승인자를 폼에서 받지 않는다. 받는 순간 「누구에게 올릴지」를 신청자가 고르게
 * 되고, 그건 자기 승인으로 가는 가장 짧은 길이다. DB의 request_transfer 가
 * 조직도를 보고 정한다.
 */
export async function requestTransfer(formData: FormData): Promise<void> {
  const { supabase } = await openSession();

  const to = readId(formData.get("departmentId"));
  if (!to) return finish(ME, "transfer.no_target");

  const reason = text(formData.get("reason"));
  if (reason.length > 500) return finish(ME, "transfer.reason_long");

  const { error } = await supabase.rpc("request_transfer", {
    p_to_department: to,
    p_reason: reason || null,
  });
  if (error) return finish(ME, classifyError(error));

  revalidatePath(ME);
  finish(ME, "transfer.requested");
}

export async function cancelTransfer(formData: FormData): Promise<void> {
  const { supabase } = await openSession();

  const id = readId(formData.get("requestId"));
  if (!id) return finish(ME, "invalid");

  const { error } = await supabase.rpc("cancel_transfer", { p_request: id });
  if (error) return finish(ME, classifyError(error));

  revalidatePath(ME);
  finish(ME, "transfer.canceled");
}

/**
 * 승인·반려.
 *
 * 반려에는 사유를 **요구한다.** 결재의 반려와 같은 판단이다(approval.need_reason).
 * 사유 없이 돌려보내면 신청자는 무엇을 고쳐야 하는지 알 수 없고, 결국
 * 전화를 걸게 된다 — 이 제품이 없애겠다고 말한 바로 그 통화다.
 *
 * 승인 쪽 메모는 선택이다. 「됐다」에 이유를 붙일 의무는 없다.
 */
export async function decideTransfer(formData: FormData): Promise<void> {
  const { supabase } = await openSession();

  const id = readId(formData.get("requestId"));
  if (!id) return finish(ME, "invalid");

  const approve = formData.get("decision") === "approve";
  const note = text(formData.get("note"));
  if (!approve && !note) return finish(ME, "transfer.need_reason");
  if (note.length > 500) return finish(ME, "transfer.reason_long");

  const { error } = await supabase.rpc("decide_transfer", {
    p_request: id,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) return finish(ME, classifyError(error));

  // 승인은 남의 소속을 바꾼다. 그 사람이 보는 화면도 달라지므로 목록까지 비운다.
  revalidatePath(ME);
  revalidatePath("/works");
  revalidatePath("/");
  finish(ME, approve ? "transfer.approved" : "transfer.rejected");
}

/**
 * 내 프로필 화면 둘을 함께 비운다.
 *
 * `/me` 와 `/people/<내 id>` 는 같은 것을 그리는 다른 주소다. 한쪽만 비우면
 * 남이 보는 내 프로필에 옛 번호가 한동안 남는다.
 */
function revalidateMe(viewerId: string) {
  revalidatePath(ME);
  revalidatePath(`/people/${viewerId}`);
}
