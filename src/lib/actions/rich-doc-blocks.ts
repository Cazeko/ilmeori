"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BLOCK_KINDS,
  BLOCK_META,
  clampIndent,
  makeBlock,
  newId,
  parseRichDoc,
  type Block,
  type BlockKind,
  type RichDoc,
} from "@/lib/editor/model";
import { classifyError, type FeedbackCode } from "./feedback";
import { changed, finish, openWork } from "./guard";

/**
 * 자바스크립트 없이 서식 문서를 고치는 길.
 *
 * ── 왜 이 파일이 따로 있는가 ────────────────────────────────────────────────
 *
 * 이 제품의 화면은 스크립트 없이 전부 돈다(tests/browser.test.mjs 가 지킨다).
 * 서식 편집기는 원리상 그럴 수 없다 — 굵게·표·동시 편집은 브라우저가 돌아야
 * 되는 일이다. 그래서 **덧붙이는 층**으로 만들었고, 스크립트가 없으면 이
 * 파일의 액션들이 쓰는 「문단 하나씩 고치는 폼」이 남는다.
 *
 * 잃는 것: 굵게·색·표 안의 글자·동시 편집.
 * 남는 것: 문단을 읽고, 고치고, 갈래를 바꾸고, 넣고, 지우고, 옮기는 일 전부.
 *
 * 그러니까 이 파일은 폴백이 아니라 **같은 문서에 대한 두 번째 편집 방식**이다.
 * 실시간 편집기가 저장하는 곳과 정확히 같은 칸(document.blocks)에 쓴다.
 *
 * ── 읽고-고치고-쓰는 동안 남이 저장했다면 ───────────────────────────────────
 *
 * jsonb 한 칸을 통째로 갈아 끼우는 방식이라, 읽은 뒤 쓰기 전에 남이 저장하면
 * 그 사람의 변경이 사라진다. rich-doc.ts 의 저장과 **같은 방식**으로 막는다 —
 * 읽을 때 본 판(blocks_rev)을 쓰기 조건에 걸고, 밀렸으면 저장하지 않는다.
 * 사용자에게는 「다시 열어 주세요」라고 말하는 것이 조용히 덮어쓰는 것보다 낫다.
 */

const MAX_BODY = 20000;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 폼에서 온 갈래 이름은 믿지 않는다. 아는 것만 통과한다. */
function kindOf(value: unknown, fallback: BlockKind): BlockKind {
  return typeof value === "string" && (BLOCK_KINDS as readonly string[]).includes(value)
    ? (value as BlockKind)
    : fallback;
}

/**
 * 돌아갈 자리.
 *
 * ⚠ **문서 화면(/works/[id]/doc)이다.** 업무 상세의 문서 탭이 아니다.
 * 그 탭은 읽기 전용 미리보기라 편집 폼이 한 개도 없다 — 예전에는 여기가
 * `?tab=doc` 를 가리켰고, 그래서 스크립트 없는 사람이 「고치기」를 누르면
 * **편집칸이 없는 화면으로 튕겨 나갔다.** 되돌아와 다시 눌러도 같았으니
 * 무JS 로는 문단을 고칠 방법이 아예 없었던 셈이다.
 */
function docPath(workId: string, blockId?: string): string {
  const base = `/works/${workId}/doc`;
  return blockId ? `${base}?b=${encodeURIComponent(blockId)}` : base;
}

type Loaded = {
  doc: RichDoc;
  rev: number;
  documentId: string;
};

/** 지금 저장된 문서와 그 판을 함께 읽는다. 판이 있어야 안전하게 되쓸 수 있다. */
async function load(
  supabase: Awaited<ReturnType<typeof openWork>>["supabase"],
  workId: string,
  documentId: string,
): Promise<Loaded | null> {
  const { data } = await supabase
    .from("document")
    .select("id, blocks, blocks_rev")
    .eq("id", documentId)
    .eq("work_id", workId)
    .maybeSingle();
  if (!data) return null;
  const doc = parseRichDoc(data.blocks);
  if (!doc) return null;
  return {
    doc,
    rev: typeof data.blocks_rev === "number" ? data.blocks_rev : 0,
    documentId: data.id as string,
  };
}

/**
 * 고친 문서를 되쓴다.
 *
 * `blocks_rev` 조건이 이 함수의 전부다. 0행이면 그 사이 남이 저장한 것이고,
 * 그때는 덮어쓰지 않는다.
 */
async function store(
  supabase: Awaited<ReturnType<typeof openWork>>["supabase"],
  loaded: Loaded,
  next: RichDoc,
  viewerId: string,
): Promise<FeedbackCode | null> {
  const { data, error } = await supabase
    .from("document")
    .update({
      blocks: next,
      blocks_rev: loaded.rev + 1,
      blocks_updated_by: viewerId,
      blocks_updated_at: new Date().toISOString(),
    })
    .eq("id", loaded.documentId)
    .eq("blocks_rev", loaded.rev)
    .select("blocks_rev");
  if (error) return classifyError(error);
  // 0행은 그 사이 남이 저장했다는 뜻이다. 덮어쓰지 않고 그대로 알린다.
  return changed(data) ? null : "rich.stale";
}

// ---------------------------------------------------------------------------

/** 문단 하나의 글자와 갈래를 저장한다. */
export async function savePlainBlock(formData: FormData) {
  const { viewer, work, supabase } = await openWork(formData.get("workId"), "edit");

  const documentId = str(formData.get("documentId"));
  const blockId = str(formData.get("blockId"));
  if (!documentId || !blockId) finish(docPath(work.id), "invalid");

  const loaded = await load(supabase, work.id, documentId);
  if (!loaded) finish(docPath(work.id), "stale");

  const target = loaded.doc.blocks.find((b) => b.id === blockId);
  if (!target) finish(docPath(work.id), "stale");

  /**
   * 표는 갈래를 바꿀 수 없다.
   *
   * 이 화면의 갈래 목록에는 「표」가 없다. 그래서 표 문단을 열면 브라우저가
   * 첫 항목(문서 제목)을 고른 채로 두고, 그대로 저장하면 kind 가 title 이
   * 되면서 **표가 통째로 사라진다**(parseRichDoc 은 kind 가 table 일 때만
   * table 칸을 살린다). 화면에서도 고르지 못하게 막지만, 요청은 위조할 수
   * 있으므로 여기서 한 번 더 막는다. 표를 없애려면 「지우기」를 쓴다.
   */
  const kind =
    target.kind === "table" ? "table" : kindOf(formData.get("kind"), target.kind);
  const indent = clampIndent(Number(formData.get("indent") ?? 0));
  const body = str(formData.get("body")).slice(0, MAX_BODY);

  const next: RichDoc = {
    ...loaded.doc,
    blocks: loaded.doc.blocks.map((b) =>
      b.id !== blockId
        ? b
        : {
            ...b,
            kind,
            // ⚠ 서식이 사라진다. 이 화면에는 굵게·색을 고를 수단이 없으므로,
            // 저장하면 그 문단의 글자 서식이 평평해진다. 화면에서 미리 알린다.
            spans: BLOCK_META[kind].text && body ? [{ t: body }] : [],
            // 들여쓰기는 **언제나** 적는다. 예전에는 `indent &&` 로 0 을
            // 걸러 냈는데, 그러면 「1단 → 안 들여씀」으로 되돌리는 저장이
            // 조용히 무시됐다. 성공 문구는 뜨고 값은 그대로였다.
            indent: BLOCK_META[kind].indentable ? indent : 0,
          },
    ),
  };

  const failed = await store(supabase, loaded, next, viewer.id);
  if (failed) finish(docPath(work.id), failed);

  revalidatePath(`/works/${work.id}`);
  revalidatePath(`/works/${work.id}/doc`);
  revalidatePath("/");
  finish(docPath(work.id), "rich.saved");
}

/** 이 문단 뒤에 새 문단을 넣는다. */
export async function addPlainBlock(formData: FormData) {
  const { viewer, work, supabase } = await openWork(formData.get("workId"), "edit");

  const documentId = str(formData.get("documentId"));
  const afterId = str(formData.get("afterId"));
  if (!documentId) finish(docPath(work.id), "invalid");

  const loaded = await load(supabase, work.id, documentId);
  if (!loaded) finish(docPath(work.id), "stale");

  const kind = kindOf(formData.get("kind"), "body");
  const fresh = makeBlock(kind, "");
  fresh.id = newId();

  const at = loaded.doc.blocks.findIndex((b) => b.id === afterId);
  const blocks: Block[] = [...loaded.doc.blocks];
  blocks.splice(at < 0 ? blocks.length : at + 1, 0, fresh);

  const failed = await store(supabase, loaded, { ...loaded.doc, blocks }, viewer.id);
  if (failed) finish(docPath(work.id), failed);

  revalidatePath(`/works/${work.id}`);
  revalidatePath(`/works/${work.id}/doc`);
  // 새로 만든 문단을 곧바로 열어 준다. 만들어 놓고 다시 찾아 눌러야 한다면
  // 손이 두 번 가는 것이고, 스크립트 없는 화면에서 그건 왕복 두 번이다.
  finish(docPath(work.id, fresh.id), "rich.block_added");
}

export async function deletePlainBlock(formData: FormData) {
  const { viewer, work, supabase } = await openWork(formData.get("workId"), "edit");

  const documentId = str(formData.get("documentId"));
  const blockId = str(formData.get("blockId"));
  if (!documentId || !blockId) finish(docPath(work.id), "invalid");

  const loaded = await load(supabase, work.id, documentId);
  if (!loaded) finish(docPath(work.id), "stale");

  // 마지막 한 문단은 지우지 않는다. 다 지우면 편집기가 커서를 놓을 자리를
  // 잃고, parseRichDoc 이 빈 배열을 null 로 떨어뜨려 문서가 「없는 것」이 된다.
  if (loaded.doc.blocks.length <= 1) finish(docPath(work.id), "rich.last_block");

  const blocks = loaded.doc.blocks.filter((b) => b.id !== blockId);
  if (blocks.length === loaded.doc.blocks.length) finish(docPath(work.id), "stale");

  const comments = (loaded.doc.comments ?? []).filter((c) => c.blockId !== blockId);

  const failed = await store(
    supabase,
    loaded,
    comments.length ? { v: 1, blocks, comments } : { v: 1, blocks },
    viewer.id,
  );
  if (failed) finish(docPath(work.id), failed);

  revalidatePath(`/works/${work.id}`);
  revalidatePath(`/works/${work.id}/doc`);
  finish(docPath(work.id), "rich.block_deleted");
}

/** 문단을 한 칸 위나 아래로. */
export async function movePlainBlock(formData: FormData) {
  const { viewer, work, supabase } = await openWork(formData.get("workId"), "edit");

  const documentId = str(formData.get("documentId"));
  const blockId = str(formData.get("blockId"));
  const dir = str(formData.get("dir")) === "up" ? -1 : 1;
  if (!documentId || !blockId) finish(docPath(work.id), "invalid");

  const loaded = await load(supabase, work.id, documentId);
  if (!loaded) finish(docPath(work.id), "stale");

  const at = loaded.doc.blocks.findIndex((b) => b.id === blockId);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= loaded.doc.blocks.length) {
    finish(docPath(work.id, blockId), "stale");
  }

  const blocks = [...loaded.doc.blocks];
  const [moved] = blocks.splice(at, 1);
  blocks.splice(to, 0, moved);

  const failed = await store(supabase, loaded, { ...loaded.doc, blocks }, viewer.id);
  if (failed) finish(docPath(work.id), failed);

  revalidatePath(`/works/${work.id}`);
  revalidatePath(`/works/${work.id}/doc`);
  finish(docPath(work.id, blockId), "rich.block_moved");
}

/**
 * 문단을 열어 고치기 시작한다.
 *
 * 링크가 아니라 제출 버튼인 이유는 doc-sections.tsx 의 잠금과 다르다 —
 * 여기에는 잠글 것이 없다. 그래도 폼으로 두는 것은 되돌아올 주소를 서버가
 * 정하게 하려는 것이고, 그래야 문단 id 가 주소에 남아 새로고침에도 살아남는다.
 */
export async function openPlainBlock(formData: FormData) {
  const { work } = await openWork(formData.get("workId"), "edit");
  const blockId = str(formData.get("blockId"));
  // 결과 코드를 붙이지 않는다. 편집칸이 열린 것 자체가 결과이고, 그 위에
  // 「문단을 열었습니다」를 한 줄 더 그리면 화면에 이미 보이는 것을 한 번 더
  // 말하는 셈이다(documents.ts 의 lockSection 과 같은 판단).
  redirect(docPath(work.id, blockId));
}
