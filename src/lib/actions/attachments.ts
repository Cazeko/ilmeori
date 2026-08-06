"use server";

import { revalidatePath } from "next/cache";
import { changed, finish, openWork } from "./guard";
import { classifyError } from "./feedback";

/**
 * 첨부파일 — 올리기 · 새 판 쌓기 · 지우기.
 *
 * ── 왜 첨부가 이 제품의 중심인가 ──────────────────────────────────────────
 *
 * 공무원은 hwp로 일한다. 우리가 한글을 대체하겠다고 말하는 순간 그 말은 거짓이 된다.
 * 이 기능이 하는 일은 한글 파일을 없애는 것이 아니라 **파일들 사이의 맥락을 붙잡는 것**이다.
 * 그래서 핵심 동작은 업로드가 아니라 '같은 문서의 새 판 올리기'다.
 * 계획_최종_진짜최종_교통과반영.hwp 가 생기는 이유는 사람이 게을러서가 아니라,
 * 어느 것이 최신인지 파일 이름 말고는 적을 자리가 없기 때문이다. 그 자리를 만든다.
 *
 * ── 저장소 경로 규약 ──────────────────────────────────────────────────────
 *
 * storage 정책은 경로의 첫 칸을 업무 id로 읽어 권한을 판정한다
 * (app.can_edit_work(((storage.foldername(name))[1])::uuid)).
 * 그러므로 경로는 반드시 `${workId}/` 로 시작해야 한다. 여기서 틀리면 RLS가 막는 것이
 * 아니라 **엉뚱한 업무의 권한으로 판정된다.**
 *
 * 경로 뒷칸에 파일 이름을 넣지 않는다. Storage 키는 한글을 그대로 견디지 못해서
 * 「2026년 예산요구서.hwp」 같은 이름이 키 안에서 깨지고, 깨진 키는 다시 찾지 못한다.
 * 그래서 키는 무작위 uuid 하나로 두고, 사람이 읽을 이름은 attachment.file_name 에만 남긴다.
 * 내려받을 때 signed URL의 download 옵션으로 원래 이름을 되돌려 준다.
 * 부수 효과로 키에 파일 이름이 실리지 않는다. 공문서 제목은 그 자체가 정보다.
 *
 * ── MIME 을 확장자에서 정하는 이유 ────────────────────────────────────────
 *
 * 버킷에 allowed_mime_types 가 걸려 있는데, 브라우저는 .hwp 의 형식을 모른다.
 * 윈도우 등록 상태에 따라 빈 문자열이나 application/octet-stream 으로 올려 보내고,
 * 그 값을 그대로 쓰면 버킷이 거절한다. 그래서 형식은 확장자를 보고 우리가 정한다.
 * 허용 목록에 없는 확장자는 저장소까지 보내지 않고 여기서 먼저 거절한다.
 *
 * 파일 본문을 File 그대로 넘기지 않고 ArrayBuffer로 바꿔 넘기는 것도 같은 이유다.
 * storage-js 는 본문이 Blob·File 이면 multipart 로 감싸면서 **contentType 옵션을 무시하고**
 * 파일이 스스로 신고한 type 을 쓴다. ArrayBuffer 로 넘겨야 우리가 정한 형식이 실제로 나간다.
 */

/** 확장자 → 형식. 버킷의 allowed_mime_types 와 같은 집합이어야 한다. */
const MIME_BY_EXT: Record<string, string> = {
  hwp: "application/haansofthwp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
};

/**
 * 4MB. 버킷 자체는 20MB까지 받지만 그 앞에 더 낮은 천장이 있다.
 * 서버 액션의 요청 본문은 Vercel에서 4.5MB가 상한이고(next.config.ts),
 * multipart 부대비용을 감안해 4MB에서 먼저 거절한다.
 * 여기서 막지 않으면 사용자는 아무 안내도 없이 플랫폼이 끊은 연결만 보게 된다.
 */
const MAX_BYTES = 4 * 1024 * 1024;

const BUCKET = "work-files";

/**
 * 파일 이름은 사용자가 정한 문자열이고, 화면과 Content-Disposition 헤더에 그대로 나간다.
 * 경로 구분자가 남으면 이름 하나가 폴더처럼 보이고, 제어문자가 남으면 헤더가 깨진다.
 * 200자에서 자르는 것은 표시상의 이유다. 그보다 긴 이름은 좁은 옆칸을 통째로 먹는다.
 */
function safeFileName(raw: string): string {
  const last = raw.split(/[\\/]/).pop() ?? "";
  return [...last]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim()
    .slice(0, 200);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * 파일을 올린다. replacesId 가 있으면 그 파일의 새 판으로 쌓는다.
 *
 * 순서는 저장소가 먼저, 행이 나중이다. 반대로 하면 행은 있는데 파일이 없는 첨부가 생기고,
 * 그건 목록에 보이는데 열리지 않는 첨부다. 대신 행 넣기가 실패하면 방금 올린 파일을
 * 반드시 지운다. 주인 없는 파일은 공문서 저장소에서 그냥 유출 표면이다 —
 * 어느 업무에도 매여 있지 않으므로 그것이 거기 있다는 사실을 아무도 모른다.
 */
export async function uploadAttachment(formData: FormData) {
  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );
  const back = `/works/${work.id}`;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) finish(back, "file.empty");
  if (file.size > MAX_BYTES) finish(back, "file.too_large");

  const uploadedName = safeFileName(file.name);
  const ext = extensionOf(uploadedName);
  const mime = MIME_BY_EXT[ext];
  if (!mime) finish(back, "file.rejected");

  // ── 새 판인가 ─────────────────────────────────────────────────────────
  // 새 판은 이전 판과 **같은 file_name** 으로 쌓인다. 화면이 이름으로 묶기 때문이다.
  // 올린 파일의 이름이 무엇이든 이전 판의 이름을 물려받는다 — 그래야
  // '계획_최종_진짜최종.hwp' 를 골라도 목록에는 '계획.hwp' 한 줄만 남는다.
  const rawReplaces = formData.get("replacesId");
  const replacesId =
    typeof rawReplaces === "string" && rawReplaces ? rawReplaces : null;

  let fileName = uploadedName;

  if (replacesId) {
    const { data: previous } = await supabase
      .from("attachment")
      .select("id, file_name")
      .eq("id", replacesId)
      .eq("work_id", work.id)
      .maybeSingle();

    if (!previous) finish(back, "invalid");

    // 확장자까지 물려받게 두면 pdf 를 담은 파일이 .hwp 라는 이름으로 내려간다.
    // 이름은 사람이 읽지만 확장자는 프로그램이 읽으므로, 그 거짓말은 파일을 못 열게 만든다.
    if (extensionOf(previous.file_name) !== ext) finish(back, "file.ext_mismatch");

    fileName = previous.file_name;
  }

  // ── 저장소 ────────────────────────────────────────────────────────────
  const storagePath = `${work.id}/${crypto.randomUUID()}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: mime,
      // 키가 uuid라 부딪칠 일이 없다. 게다가 storage.objects 에는 UPDATE 정책이 없어
      // 덮어쓰기는 어차피 거부된다. 덮어쓰지 않는 것이 이 기능의 취지이기도 하다.
      upsert: false,
    });
  if (uploadError) finish(back, "failed");

  // ── 메타데이터 ────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("attachment")
    .insert({
      work_id: work.id,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mime,
      byte_size: file.size,
      // uploaded_by 를 폼에서 받지 않는다. 남의 이름으로 문서를 올리는 경로를 만들지 않는다.
      // (attachment_insert 정책도 uploaded_by = auth.uid() 를 요구한다)
      uploaded_by: viewer.id,
    })
    .select("id");

  if (error || !changed(data)) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    finish(back, error ? classifyError(error) : "denied");
  }

  // 첨부가 늘면 업무 카드에 찍히는 첨부 개수도 달라진다. 그 카드는 대시보드에도 있다.
  revalidatePath(back);
  revalidatePath("/works");
  revalidatePath("/");
  finish(back, replacesId ? "file.replaced" : "file.uploaded");
}

/**
 * 첨부 한 건을 지운다. 편집자 이상만 — attachment_delete 정책이 can_edit_work 다.
 *
 * 이전 판을 지우는 일은 드물어야 한다. '어떤 판이 있었는지'가 이 기능의 존재 이유이고,
 * 지운 사실 자체는 트리거가 이력에 남긴다(attachment.removed). 사라지는 것은 파일뿐이다.
 */
export async function deleteAttachment(formData: FormData) {
  const { work, supabase } = await openWork(formData.get("workId"), "edit");
  const back = `/works/${work.id}`;

  const attachmentId = formData.get("attachmentId");
  if (typeof attachmentId !== "string" || !attachmentId) finish(back, "invalid");

  // 저장소 경로를 먼저 읽어 둔다. 행을 지운 뒤에는 어느 파일을 지워야 하는지 알 방법이 없다.
  const { data: target } = await supabase
    .from("attachment")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("work_id", work.id)
    .maybeSingle();
  if (!target) finish(back, "invalid");

  const { data, error } = await supabase
    .from("attachment")
    .delete()
    .eq("id", attachmentId)
    .eq("work_id", work.id)
    .select("id");

  if (error) finish(back, classifyError(error));
  // RLS는 막을 때 오류가 아니라 0행으로 끝난다. 확인하지 않으면
  // 화면이 "삭제했습니다"라고 말하고 파일은 그대로 남는다.
  if (!changed(data)) finish(back, "denied");

  // 행을 지운 뒤에 파일을 지운다. 순서가 반대면, 행 삭제가 RLS에 막힌 순간
  // 목록에는 남아 있는데 열리지 않는 첨부가 된다.
  // 여기서 실패하면 주인 없는 파일이 남지만 사용자에게 더 알릴 것은 없다 —
  // 그가 요청한 일(목록에서 사라지는 것)은 이미 끝났다.
  await supabase.storage.from(BUCKET).remove([target.storage_path]);

  revalidatePath(back);
  revalidatePath("/works");
  revalidatePath("/");
  finish(back, "file.deleted");
}
