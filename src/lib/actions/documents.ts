"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { classifyError } from "./feedback";
import { changed, finish, openWork } from "./guard";

/**
 * 문서와 문서 항목을 고치는 액션.
 *
 * ── 잠금은 화면이 아니라 DB가 건다 ─────────────────────────────────────────
 *
 * 한 문서를 여럿이 동시에 고치면 마지막에 저장한 사람이 앞사람 것을 덮어쓴다.
 * 파일을 주고받는 방식이 결국 한 사람만 만지는 방식으로 굳는 이유가 그것이다.
 * 그래서 항목마다 잠금을 두는데, 그 잠금을 화면이 판단하면 요청을 한 번 위조하는
 * 것으로 무너진다. 여기서는 doc_section_update 정책이 남이 잡고 있는 항목의
 * UPDATE 자체를 거부하고, 이 파일은 그 거부를 사용자에게 옮겨 적을 뿐이다.
 *
 * 거부는 오류로 오지 않는다. 정책에 걸린 UPDATE는 "0행이 바뀌었습니다"로 조용히
 * 끝난다. 그래서 changed() 확인이 여기서는 방어가 아니라 기능 그 자체다.
 * 잠금을 잡거나 저장하려다 0행이면 남이 편집 중이라는 뜻이고, 그대로 알려 준다.
 *
 * 잠금은 5분이 지나면 풀린 것으로 본다(app.section_lock_active). 브라우저를 닫고
 * 퇴근한 사람 때문에 문서가 영영 잠기는 일은 없어야 한다. 그래서 잠금을 쥐고 있던
 * 사람도 만료 후에는 특별대우를 받지 못하고, 먼저 잡은 사람이 이어서 쓴다.
 *
 * ── 이력은 적지 않는다 ─────────────────────────────────────────────────────
 *
 * 항목을 저장하면 트리거가 doc_version 스냅샷과 activity를 남긴다. 내용이 그대로면
 * 버전을 만들지 않으므로 잠금만 잡았다 푼 흔적은 이력을 더럽히지 않는다.
 * 여기서 같은 기록을 한 번 더 적으면 규칙이 두 벌이 되고, 두 벌은 반드시 어긋난다.
 *
 * ── 항목 id를 업무에 묶지 않는 이유 ────────────────────────────────────────
 *
 * 항목 액션은 sectionId만 받고 그것이 이 업무의 문서에 속하는지 다시 묻지 않는다.
 * 질의를 한 번 아끼려는 것이 아니라, 물어도 더 안전해지지 않기 때문이다.
 * 남의 업무 항목 id를 실어 보내도 doc_section 정책이 그 업무의 편집 권한을 요구한다.
 * 권한이 있으면 원래 할 수 있던 일이고, 없으면 0행으로 끝난다.
 */

/** 화면 입력칸도 같은 값으로 막아 둔다. 여기서 자르는 것은 위조된 요청뿐이다. */
const MAX_TITLE = 120;

/** 폼에서 온 값은 하나도 믿지 않는다. 문자열이 아니면 없는 것으로 본다. */
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 결과를 보여 줄 자리는 언제나 그 업무의 문서 탭이다. */
function docPath(workId: string): string {
  return `/works/${workId}?tab=doc`;
}

function refresh(workId: string) {
  revalidatePath(`/works/${workId}`);
  // 대시보드의 '최근 소식'은 activity를 읽는다. 문서를 고치면 트리거가 거기에 적는다.
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// 문서
// ---------------------------------------------------------------------------

/**
 * 업무당 문서는 하나로 본다.
 *
 * 조회(getWorkDocument)가 가장 먼저 만들어진 한 건만 읽으므로, 두 번째 문서는
 * 만들어져도 화면에 영영 나타나지 않는다. 그런 행을 남기느니 이미 있는 문서로
 * 데려간다 — 사용자가 원한 것은 '문서를 만드는 일'이 아니라 '문서를 여는 일'이다.
 */
export async function createDocument(formData: FormData) {
  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );

  const title = str(formData.get("title")).slice(0, MAX_TITLE);
  if (!title) finish(docPath(work.id), "invalid");

  const { data: existing } = await supabase
    .from("document")
    .select("id")
    .eq("work_id", work.id)
    .limit(1)
    .maybeSingle();

  // 두 사람이 같은 순간에 만들기를 눌렀을 때, 뒤에 누른 사람에게 아무 말도 없이
  // 남의 문서가 열리면 자기가 만든 것으로 오해한다.
  if (existing) finish(docPath(work.id), "document.exists");

  const { error } = await supabase.from("document").insert({
    work_id: work.id,
    title,
    // created_by를 폼에서 받지 않는다. document_insert 정책도 본인만 허용한다.
    created_by: viewer.id,
  });
  if (error) finish(docPath(work.id), classifyError(error));

  refresh(work.id);
  finish(docPath(work.id), "document.created");
}

export async function renameDocument(formData: FormData) {
  const { work, supabase } = await openWork(formData.get("workId"), "edit");

  const documentId = str(formData.get("documentId"));
  const title = str(formData.get("title")).slice(0, MAX_TITLE);
  if (!documentId || !title) finish(docPath(work.id), "invalid");

  const { data, error } = await supabase
    .from("document")
    .update({ title })
    .eq("id", documentId)
    // 문서는 업무에 직접 매달려 있다. 값이 하나 더 있으니 묶어 둔다.
    .eq("work_id", work.id)
    .select("id");
  if (error) finish(docPath(work.id), classifyError(error));
  // 여기까지 온 사람은 이미 편집 권한이 확인된 사람이다. 0행이면 권한이 아니라
  // 그 사이 문서가 사라진 것이다.
  if (!changed(data)) finish(docPath(work.id), "stale");

  refresh(work.id);
  finish(docPath(work.id), "document.renamed");
}

/**
 * 문서 삭제는 소유자만 한다. document_delete 정책이 is_work_owner이고,
 * 항목과 이전 판이 함께 사라지는 동작이라 편집자에게 열어 둘 이유가 없다.
 */
export async function deleteDocument(formData: FormData) {
  const { work, supabase } = await openWork(formData.get("workId"), "own");

  const documentId = str(formData.get("documentId"));
  if (!documentId) finish(docPath(work.id), "invalid");

  const { data, error } = await supabase
    .from("document")
    .delete()
    .eq("id", documentId)
    .eq("work_id", work.id)
    .select("id");
  if (error) finish(docPath(work.id), classifyError(error));
  if (!changed(data)) finish(docPath(work.id), "stale");

  refresh(work.id);
  finish(docPath(work.id), "document.deleted");
}

// ---------------------------------------------------------------------------
// 문서 항목
// ---------------------------------------------------------------------------

export async function addSection(formData: FormData) {
  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );

  const documentId = str(formData.get("documentId"));
  const heading = str(formData.get("heading")).slice(0, MAX_TITLE);
  const body = str(formData.get("body"));
  // 제목도 내용도 없는 항목은 목록에 빈 줄을 하나 더하는 것 이상이 아니다.
  if (!documentId || (!heading && !body)) finish(docPath(work.id), "invalid");

  // 삽입은 문서 id만 보고 이뤄지므로, 그 문서가 이 업무의 것인지 여기서 확인한다.
  // 항목과 달리 문서는 work_id를 직접 들고 있어 확인이 한 줄이다.
  const { data: doc } = await supabase
    .from("document")
    .select("id")
    .eq("id", documentId)
    .eq("work_id", work.id)
    .maybeSingle();
  if (!doc) finish(docPath(work.id), "invalid");

  // sort_order 기본값이 0이라 채우지 않으면 새 항목이 맨 앞에 섞인다.
  // 두 사람이 같은 순간에 추가하면 같은 값이 두 개 생기지만, 순서가 흐트러질 뿐
  // 데이터가 상하지는 않는다. 그 정도를 막자고 잠금을 하나 더 만들지 않는다.
  const { data: last } = await supabase
    .from("doc_section")
    .select("sort_order")
    .eq("document_id", doc.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("doc_section").insert({
    document_id: doc.id,
    sort_order: (last?.sort_order ?? -1) + 1,
    heading: heading || null,
    body,
    updated_by: viewer.id,
  });
  if (error) finish(docPath(work.id), classifyError(error));

  refresh(work.id);
  finish(docPath(work.id), "section.added");
}

/**
 * 편집 시작.
 *
 * 잠긴 시각은 서버가 찍는다. DB의 now()로 찍으려면 함수를 하나 더 두어야 하는데,
 * 5분짜리 창을 다투는 값이라 두 시계의 차이가 문제가 되는 폭이 아니다.
 */
export async function lockSection(formData: FormData) {
  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );

  const sectionId = str(formData.get("sectionId"));
  if (!sectionId) finish(docPath(work.id), "invalid");

  const { data, error } = await supabase
    .from("doc_section")
    .update({ locked_by: viewer.id, locked_at: new Date().toISOString() })
    .eq("id", sectionId)
    .select("id");
  if (error) finish(docPath(work.id), classifyError(error));
  // 0행은 남이 잡고 있다는 뜻이다. 정책이 그 경우에만 UPDATE를 거부한다.
  if (!changed(data)) finish(docPath(work.id), "section.locked");

  refresh(work.id);
  // 편집 화면이 열린 것 자체가 결과다. "편집을 시작했습니다" 같은 줄을 덧붙이면
  // 화면에 이미 보이는 것을 한 번 더 말하는 셈이라, 코드를 붙이는 finish를 쓰지 않는다.
  redirect(`${docPath(work.id)}&edit=${sectionId}`);
}

/**
 * 편집 취소.
 *
 * 내가 쥐고 있는지 따로 묻지 않는다. 만료된 잠금은 정책이 이미 없는 것으로 보므로,
 * 남의 만료된 잠금을 지우는 것은 허용된 동작이고 오히려 문서를 다시 열어 준다.
 * 살아 있는 남의 잠금만 0행으로 돌아온다.
 */
export async function unlockSection(formData: FormData) {
  const { work, supabase } = await openWork(formData.get("workId"), "edit");

  const sectionId = str(formData.get("sectionId"));
  if (!sectionId) finish(docPath(work.id), "invalid");

  const { data, error } = await supabase
    .from("doc_section")
    .update({ locked_by: null, locked_at: null })
    .eq("id", sectionId)
    .select("id");
  if (error) finish(docPath(work.id), classifyError(error));
  if (!changed(data)) finish(docPath(work.id), "section.locked");

  refresh(work.id);
  finish(docPath(work.id), "section.unlocked");
}

/**
 * 저장하며 잠금을 푼다.
 *
 * 잠금을 쥐고 있는지 확인하지 않는 것은 일부러다. 오래 붙들고 쓰다 5분이 지났어도
 * 그 사이 아무도 손대지 않았다면 저장은 되어야 한다. 그 사이 다른 사람이 잡았다면
 * 정책이 0행으로 막고, 그때는 덮어쓰는 대신 편집 중이라고 알린다.
 *
 * updated_by를 본인으로 채우는 것은 표시용이 아니다. 트리거가 doc_version의
 * author_id를 이 값에서 가져가므로, 비워 두면 이전 판을 누가 썼는지가 흐려진다.
 */
export async function saveSection(formData: FormData) {
  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );

  const sectionId = str(formData.get("sectionId"));
  const heading = str(formData.get("heading")).slice(0, MAX_TITLE);
  const body = str(formData.get("body"));
  if (!sectionId) finish(docPath(work.id), "invalid");

  const { data, error } = await supabase
    .from("doc_section")
    .update({
      heading: heading || null,
      body,
      updated_by: viewer.id,
      locked_by: null,
      locked_at: null,
    })
    .eq("id", sectionId)
    .select("id");
  if (error) finish(docPath(work.id), classifyError(error));
  if (!changed(data)) finish(docPath(work.id), "section.locked");

  refresh(work.id);
  finish(docPath(work.id), "section.saved");
}

/**
 * 항목 삭제.
 *
 * doc_section_delete 정책은 잠금을 보지 않는다. 그래서 화면은 잠금을 쥔 뒤에만
 * 삭제 단추를 그린다 — 남이 쓰고 있는 항목이 눈앞에서 사라지는 일을 줄이려는 것이다.
 * 요청을 위조하면 그 순서를 건너뛸 수 있지만, 그때도 편집 권한은 여전히 필요하다.
 */
export async function deleteSection(formData: FormData) {
  const { work, supabase } = await openWork(formData.get("workId"), "edit");

  const sectionId = str(formData.get("sectionId"));
  if (!sectionId) finish(docPath(work.id), "invalid");

  const { data, error } = await supabase
    .from("doc_section")
    .delete()
    .eq("id", sectionId)
    .select("id");
  if (error) finish(docPath(work.id), classifyError(error));
  if (!changed(data)) finish(docPath(work.id), "stale");

  refresh(work.id);
  finish(docPath(work.id), "section.deleted");
}
