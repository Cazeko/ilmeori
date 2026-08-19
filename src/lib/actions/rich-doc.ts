"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canMutate } from "@/lib/env";
import {
  emptyDoc,
  fromSections,
  parseRichDoc,
  type RichDoc,
} from "@/lib/editor/model";
import { classifyError, type FeedbackCode } from "./feedback";
import { changed, finish, openWork } from "./guard";

/**
 * 서식 문서를 저장하고, 옮기고, 새로 만드는 액션.
 *
 * documents.ts 와 짝이다. 그쪽은 「항목 + 평문」 문서를, 여기는 같은 표의
 * blocks 칸(0018)을 다룬다. 권한을 여는 문(openWork)과 결과를 알리는 방식은 그대로다.
 *
 * ── 브라우저가 보낸 JSON 을 그대로 넣지 않는다 ─────────────────────────────
 *
 * blocks 는 jsonb 다. DB 가 보장하는 것은 「JSON 인가」까지이고, 그 안이 우리가
 * 기대하는 모양인지는 아무도 보지 않는다. 그래서 서버가 **반드시 parseRichDoc()
 * 로 다시 읽고, 그 결과를 저장한다.** 받은 문자열을 그대로 넣으면 다음 두 가지가
 * 그대로 들어온다.
 *   · 모르는 갈래·모르는 마크·중복된 블록 id — 화면과 내보내기가 뒤에서 터진다
 *   · 상한 없는 크기 — model.ts 의 블록 2000개·문단 20000자 상한을 지나쳐 버린다
 * parseRichDoc 은 그 둘을 한 번에 자른다. 저장되는 것은 언제나 **정규화를 통과한
 * 값**이라, 다음에 읽을 때 또 정규화하지 않아도 같은 모양이 나온다.
 *
 * ── 자동 저장은 화면을 다시 그리지 않고, 마지막 저장은 다시 그린다 ─────────
 *
 * 액션이 revalidatePath 를 한 번이라도 부르면 Next 는 **지금 보고 있는 화면을
 * 서버에서 다시 그려 응답에 실어 보낸다.** 코드로 확인한 사실이다 —
 * next/dist/server/app-render/action-handler.js 의
 * `skipPageRendering = workStore.pathWasRevalidated === undefined || ActionDidNotRevalidate`.
 * 자동 저장은 몇 초마다 도는데 그때마다 편집 중인 화면이 서버 렌더로 갈아 끼워지면
 * 커서가 튀고, 서버는 아무도 보지 않을 화면을 하루 수천 번 그린다.
 *
 * 그렇다고 한 번도 부르지 않으면 반대쪽이 깨진다. 클라이언트 캐시(Router Cache)는
 * **뒤로가기·앞으로가기에서 언제나 쓰이고**(staleTimes 와 무관하다 — staleTimes.md),
 * 그것을 무르는 것은 revalidatePath/revalidateTag/router.refresh 뿐이다. 그래서
 * 편집기에서 30분을 고치고 뒤로가기로 업무 상세에 돌아가면, 문서 탭이 **옛 본문과
 * 옛 「저장됨」 시각**을 단언한다. 화면이 사실이 아닌 것을 말하는 쪽이 더 나쁘다.
 *
 * 그래서 갈랐다.
 *   자동 저장(final 없음) — 아무것도 무르지 않는다. 편집 중인 화면을 건드리지 않는다.
 *   마지막 저장(final=1)  — 무른다. 손으로 저장(Ctrl+S)했거나, 화면을 떠나며
 *                           마지막 한 번을 저장하는 자리다. 어차피 떠나는 화면이라
 *                           다시 그려져도 커서가 튈 곳이 없다.
 *   endRichDocEdit        — 떠날 때 고칠 것이 남아 있지 않은 경우. 저장할 것이
 *                           없어도 캐시는 무너뜨려야 한다. 그 한 가지만 한다.
 *
 * 나머지 둘(옮기기·새로 만들기)은 단추 한 번으로 끝나는 동작이라 지금까지처럼
 * finish() 로 되돌려 보낸다 — 자바스크립트가 없어도 된다.
 *
 * ── 평문을 doc_section 에 되받아 적지 않는다 ───────────────────────────────
 *
 * docPlainText() 가 만드는 평문을 doc_section.body 에 써 두면 검색·무JS 화면이
 * 편해 보이지만, 그 UPDATE 한 번마다 0003·0006 의 trg_section_version 이
 * **doc_version 한 판과 activity 한 줄**을 만든다. 자동 저장이 몇 초마다인 것을
 * 생각하면 업무 이력이 「…을 고쳤습니다」로 뒤덮인다. 0018 이 막으려는 폭주가
 * 정확히 그것이다.
 *
 * 그래서 평문은 저장하지 않고 **읽는 쪽이 그때그때 만든다** — 같은 사실을 두 군데
 * 적으면 반드시 어긋나고, 어긋난 쪽이 인계서에 실린다. blocks 하나만 있으면
 * docPlainText(parseRichDoc(blocks)) 로 언제든 같은 평문이 나온다.
 *
 * 대신 짚어 둘 것이 하나 있다. 옮기기(convertToRichDoc) 뒤의 doc_section 은
 * **옮긴 시점에서 얼어붙는다.** 항목을 읽는 화면(인계 초안 등)이 그 뒤의 편집을
 * 따라가려면 blocks 를 읽도록 고쳐야 한다. 지금은 그렇게 되어 있지 않다.
 */

/** 화면 입력칸도 같은 값으로 막아 둔다. documents.ts 와 같은 값. */
const MAX_TITLE = 120;

/**
 * 한 번에 받는 본문의 크기.
 *
 * DB 의 document_blocks_size 는 2MB 에서 자른다(0018). 여기서 먼저 걸리게 1.5MB 로
 * 두는 이유는 **사람이 읽을 수 있는 실패**를 주기 위해서다. DB 까지 가면 돌아오는
 * 것은 check constraint 위반 한 줄이고, 그건 화면에 옮겨 적을 수 없는 문장이다.
 * (그래도 DB 쪽 검사는 남긴다 — 액션을 거치지 않는 요청이 있다)
 *
 * jsonb 의 내부 크기와 JSON 글자 수는 정확히 같지 않다. 그래서 두 값 사이에
 * 500KB 를 비워 둔다. 이 틈이 좁으면 「앱은 통과시켰는데 DB 가 거절하는」 구간이 생긴다.
 */
const MAX_BLOCKS_BYTES = 1_500_000;

/** 폼에서 온 값은 하나도 믿지 않는다. documents.ts 와 같은 규칙. */
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 판 번호. 음수·소수·NaN·2^53 근처는 전부 없는 값으로 본다. */
function rev(value: unknown): number | null {
  const n = Number(str(value));
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

function docPath(workId: string): string {
  return `/works/${workId}?tab=doc`;
}

function refresh(workId: string) {
  revalidatePath(`/works/${workId}`);
  revalidatePath("/");
}

/**
 * 저장 결과.
 *
 * 화면이 그릴 문구는 여기 없다. 코드만 돌려주고 문구는 feedback.ts 에만 둔다 —
 * 주소에 실을 때와 같은 이유다(문구를 바깥에서 정할 수 있게 되는 순간, 우리가
 * 쓰지 않은 문장이 우리 화면에 뜬다). 편집기는 readFeedback(code) 로 옮겨 적는다.
 */
export type RichSaveResult = {
  ok: boolean;
  code: FeedbackCode;
  /** 저장에 성공했으면 새 판, 아니면 서버가 알고 있는 현재 판. 모르면 null. */
  rev: number | null;
};

// ---------------------------------------------------------------------------
// 저장
// ---------------------------------------------------------------------------

/**
 * 서식 문서 본문을 저장한다.
 *
 * 판이 밀렸으면 덮어쓰지 않는다. 두 사람이 각자 저장할 때 늦은 쪽이 앞사람 글을
 * 통째로 지우는 것을 막는 유일한 장치다. 실시간으로 글자를 합쳐 놓고 마지막
 * 한 번에서 잃으면 합친 보람이 없다.
 *
 * 막는 방법은 한 문장이다 — `where id = ? and blocks_rev = <내가 본 판>`.
 * 함수를 따로 만들지 않은 이유는 0018 §4 에 적었다.
 */
export async function saveRichDoc(formData: FormData): Promise<RichSaveResult> {
  const documentId = str(formData.get("documentId"));
  const seen = rev(formData.get("rev"));
  /** 이번이 마지막 저장인가(손 저장·떠나며 저장). 머리말의 「갈랐다」 참조. */
  const final = str(formData.get("final")) === "1";

  /**
   * 데모 모드는 openWork 보다 **먼저** 거른다.
   *
   * openWork 는 데모 모드에서 redirect 로 돌려보낸다. 다른 액션에서는 그게 맞다 —
   * 단추를 눌렀는데 아무 일도 안 일어나는 것보다 낫다. 그런데 여기서는 몇 초마다
   * 도는 자동 저장이라, 글을 쓰던 사람이 아무것도 누르지 않았는데 화면 밖으로
   * 끌려 나간다. 그래서 같은 사실을 코드로 돌려준다.
   */
  if (!canMutate) {
    return { ok: false, code: "demo.readonly", rev: seen };
  }

  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );

  if (!documentId || seen === null) {
    return { ok: false, code: "invalid", rev: null };
  }

  const doc = readBlocks(formData.get("blocks"));
  if (!doc) return { ok: false, code: "invalid", rev: seen };

  // 크기는 **정규화한 뒤에** 잰다. 받은 문자열이 아무리 커도 parseRichDoc 이
  // 잘라 낸 결과가 상한 안이면 저장된다. 반대로 정규화 뒤에도 크면 진짜 큰 것이다.
  if (Buffer.byteLength(JSON.stringify(doc), "utf8") > MAX_BLOCKS_BYTES) {
    return { ok: false, code: "rich.too_big", rev: seen };
  }

  const { data, error } = await supabase
    .from("document")
    .update({
      blocks: doc,
      blocks_rev: seen + 1,
      blocks_updated_by: viewer.id,
      blocks_updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    // 문서는 work_id 를 직접 들고 있다. 남의 문서 id 를 실어 보내도 정책이 막지만,
    // 값이 하나 더 있으니 묶어 둔다(documents.ts 의 renameDocument 와 같은 판단).
    .eq("work_id", work.id)
    // 여기가 이 액션의 전부다. 이 한 줄이 없으면 늦게 저장한 사람이 이긴다.
    .eq("blocks_rev", seen)
    .select("blocks_rev");

  if (error) return { ok: false, code: classifyError(error), rev: seen };
  if (changed(data)) {
    // 마지막 저장에서만 캐시를 무른다. 머리말의 「갈랐다」에 이유를 적었다.
    if (final) refresh(work.id);
    return { ok: true, code: "rich.saved", rev: Number(data?.[0]?.blocks_rev ?? seen + 1) };
  }

  return await diagnose(supabase, work.id, documentId, seen);
}

/**
 * 편집을 마치고 화면을 떠난다 — 저장이 아니라 **캐시를 무르는 일**만 한다.
 *
 * 왜 따로 있는가. 자동 저장이 이미 다 해 두고(고칠 것이 남아 있지 않고) 떠나는
 * 경우가 가장 흔하다. 그때는 마지막 저장이 일어나지 않으므로 아무것도 무르지
 * 못하고, 뒤로가기로 돌아간 업무 상세가 옛 본문을 그린다. 그렇다고 같은 값을
 * 한 번 더 저장하는 것은(판만 올리는 빈 저장) 이력과 판 번호에 거짓을 남긴다.
 *
 * 그래서 이 액션은 DB 를 쓰지 않는다. 권한도 「고칠 수 있는가」가 아니라
 * **「볼 수 있는가」**로 충분하다 — 하는 일이 그 사람 브라우저의 캐시를 무르는
 * 것뿐이라, 이미 볼 수 있는 화면을 다시 받아 가는 것 이상이 일어나지 않는다.
 */
export async function endRichDocEdit(formData: FormData): Promise<void> {
  // 데모 모드에서는 openWork 가 redirect 로 돌려보낸다. 화면을 떠나는 길에
  // 부르는 액션이라 그 redirect 는 사용자를 엉뚱한 곳에 데려다 놓는다.
  if (!canMutate) return;

  const { work } = await openWork(formData.get("workId"), "read");
  refresh(work.id);
}

/**
 * 0행으로 끝난 저장의 이유를 가른다.
 *
 * PostgREST 는 정책에 걸린 UPDATE 를 오류로 돌려주지 않는다. 조건에 맞는 행이
 * 없었던 것과 구분되지 않기 때문이다(guard.ts 의 changed 주석). 그래서 질의를
 * 한 번 더 던져 세 경우를 가른다.
 *
 *   읽히는데 판이 다르다  → 그 사이 남이 저장했다. 이번 저장은 덮어쓰지 않았다
 *   읽히는데 판이 같다    → 정책이 막았다. 편집 권한이 방금 회수됐다는 뜻이다
 *   아예 안 읽힌다        → 문서가 사라졌거나 업무를 볼 수 없게 됐다
 *
 * 이 질의도 사용자 세션으로 나가므로 RLS 를 그대로 통과한다. 여기서 얻는 것은
 * 이미 볼 수 있는 문서의 판 번호 하나뿐이다.
 *
 * **첫째 갈래에서 현재 판을 돌려주는 것이 이 함수의 존재 이유다.** 그 값을 받는
 * 쪽이 버리면 판 경쟁에 한 번 진 탭은 영영 저장하지 못한다 — 자기 판은 그대로
 * 뒤처져 있고 조건은 다시는 맞지 않는다. 0018 §4 의 ⚠ 와 같은 이야기다.
 */
async function diagnose(
  supabase: SupabaseClient,
  workId: string,
  documentId: string,
  seen: number,
): Promise<RichSaveResult> {
  const { data } = await supabase
    .from("document")
    .select("blocks_rev")
    .eq("id", documentId)
    .eq("work_id", workId)
    .maybeSingle();

  if (!data) return { ok: false, code: "stale", rev: null };

  const current = Number(data.blocks_rev);
  // 무JS 폼의 rich.stale 과 코드를 나눈다. 저쪽은 「이번 저장을 버렸으니 다시
  // 열어 달라」이고, 여기는 「판을 맞춰 다음 저장에 다시 싣는다」다. 사용자가
  // 다음에 할 일이 서로 다르므로 문구도 달라야 한다(feedback.ts).
  if (current !== seen) return { ok: false, code: "rich.stale_retry", rev: current };
  return { ok: false, code: "denied", rev: current };
}

/**
 * 폼에 실려 온 문자열을 문서로 읽는다. 모양이 아니면 null.
 *
 * JSON.parse 는 못 읽는 값에 예외를 던진다. 여기서 그 예외가 새어 나가면 자동
 * 저장 한 번이 500 이 되고, 이 앱에는 error.tsx 가 없어 화면이 통째로 사라진다.
 */
function readBlocks(raw: unknown): RichDoc | null {
  if (typeof raw !== "string" || !raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseRichDoc(parsed);
}

// ---------------------------------------------------------------------------
// 옮기기
// ---------------------------------------------------------------------------

/**
 * 지금의 항목 문서를 서식 문서로 옮긴다.
 *
 * ── 되돌릴 수 없다 ─────────────────────────────────────────────────────────
 *
 * 블록에서 항목 경계를 복원할 방법이 없다. 그래서 **doc_section 을 지우지 않는다.**
 * 옮긴 결과가 마음에 들지 않는 사람이 돌아갈 자리이고, 인계 초안처럼 항목을 읽는
 * 화면이 갑자기 빈손이 되지 않게 하는 자리이기도 하다. 항목은 옮긴 시점의 모습
 * 그대로 얼어붙어 남는다 — 그 뒤의 편집은 blocks 에만 쌓인다.
 *
 * 이미 blocks 가 있으면 아무것도 하지 않는다. 두 번째로 누른 사람의 화면에서
 * 남의 편집이 통째로 사라지는 것이 이 액션에서 가장 나쁜 결과다. 조건을 앱에서
 * 보지 않고 `blocks is null` 을 UPDATE 의 조건에 그대로 실어, 두 사람이 같은
 * 순간에 눌러도 한 번만 옮겨지게 한다.
 */
export async function convertToRichDoc(formData: FormData) {
  const { viewer, work, supabase } = await openWork(
    formData.get("workId"),
    "edit",
  );

  const documentId = str(formData.get("documentId"));
  if (!documentId) finish(docPath(work.id), "invalid");

  const { data: doc } = await supabase
    .from("document")
    .select("id, title, blocks")
    .eq("id", documentId)
    .eq("work_id", work.id)
    .maybeSingle();
  if (!doc) finish(docPath(work.id), "invalid");
  if (doc.blocks !== null) finish(docPath(work.id), "rich.exists");

  const { data: sections, error: sectionError } = await supabase
    .from("doc_section")
    .select("heading, body")
    .eq("document_id", doc.id)
    .order("sort_order");
  if (sectionError) finish(docPath(work.id), classifyError(sectionError));

  const rich = fromSections(
    (sections ?? []).map((s) => ({ heading: s.heading, body: s.body })),
    doc.title,
  );

  const { data, error } = await supabase
    .from("document")
    .update({
      blocks: rich,
      blocks_rev: 1,
      blocks_updated_by: viewer.id,
      blocks_updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id)
    .eq("work_id", work.id)
    // 아직 아무도 옮기지 않았을 때만. 두 사람이 동시에 눌러도 한 번만 옮겨진다.
    .is("blocks", null)
    .select("id");
  if (error) finish(docPath(work.id), classifyError(error));
  if (!changed(data)) finish(docPath(work.id), "rich.exists");

  refresh(work.id);
  finish(docPath(work.id), "rich.converted");
}

// ---------------------------------------------------------------------------
// 새로 만들기
// ---------------------------------------------------------------------------

/**
 * 서식 문서를 새로 만든다.
 *
 * 업무당 문서는 하나로 본다 — createDocument 와 같은 규칙이다. 조회가 가장 먼저
 * 만들어진 한 건만 읽으므로, 두 번째 문서는 만들어져도 화면에 영영 나타나지 않는다.
 *
 * emptyDoc() 은 진짜로 비어 있지 않다. 제목 한 줄과 본문 한 줄이 들어 있어서
 * 사용자가 「어디를 눌러야 쓰기 시작하나」를 알아내지 않아도 된다(model.ts).
 */
export async function createRichDocument(formData: FormData) {
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
  if (existing) finish(docPath(work.id), "document.exists");

  const { error } = await supabase.from("document").insert({
    work_id: work.id,
    title,
    // created_by 를 폼에서 받지 않는다. document_insert 정책도 본인만 허용한다.
    created_by: viewer.id,
    blocks: emptyDoc(title),
    // 만들어진 순간이 0판이다. 편집기가 처음 저장할 때 1이 된다.
    blocks_rev: 0,
    blocks_updated_by: viewer.id,
    blocks_updated_at: new Date().toISOString(),
  });
  if (error) finish(docPath(work.id), classifyError(error));

  refresh(work.id);
  finish(docPath(work.id), "rich.created");
}
