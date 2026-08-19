import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getWork, getWorkDocument } from "@/lib/data";
import { requireViewer } from "@/lib/session";
import { docTitle, parseRichDoc, type RichDoc } from "@/lib/editor/model";

/**
 * 서식 문서를 파일로 내보내는 두 길(.hwpx · .docx)이 함께 쓰는 앞부분.
 *
 * ── 왜 GET 인가 ────────────────────────────────────────────────────────────
 *
 * 결재 문서 내보내기와 같은 이유다(approvals/[id]/export/hwpx/route.ts 주석).
 * 서버 액션의 응답은 화면 갱신용이라 브라우저가 파일로 받아 낼 길이 없고,
 * 평범한 링크는 스크립트가 없어도 눌린다.
 *
 * ── 권한 ───────────────────────────────────────────────────────────────────
 *
 * getWork 과 getWorkDocument 가 사용자 세션으로 나가므로 RLS 가 그대로 걸린다.
 * 볼 수 없는 업무는 없는 업무와 똑같이 답한다 — 구분하는 순간 「그 업무는
 * 있다」가 샌다.
 */

export type Ready = {
  doc: RichDoc;
  title: string;
  /** 파일 이름의 ASCII 대체분. 헤더가 한글로 깨지는 것을 막는다. */
  asciiBase: string;
};

export async function prepare(
  request: NextRequest,
  params: Promise<{ id: string }>,
): Promise<Ready | Response> {
  const viewer = await requireViewer();
  const { id } = await params;

  const work = await getWork(viewer, id);
  if (!work) {
    return NextResponse.redirect(new URL("/works?msg=denied", request.url), {
      status: 303,
    });
  }

  const { document } = await getWorkDocument(work.id);
  const doc = document ? parseRichDoc(document.blocks) : null;
  if (!doc) {
    // 서식 문서가 아니거나 아직 비어 있다. 문서 탭으로 돌려보낸다 —
    // 거기에 「서식 편집기로 옮기기」가 있다.
    return NextResponse.redirect(
      new URL(`/works/${work.id}?tab=doc&msg=invalid`, request.url),
      { status: 303 },
    );
  }

  const title = docTitle(doc) || document!.title || work.title;
  return {
    doc,
    title,
    asciiBase: (document!.id ?? work.id).replace(/[^A-Za-z0-9._-]/g, "-"),
  };
}

/**
 * 내려받기 헤더.
 *
 * 파일 이름은 한글이다. RFC 5987 의 `filename*` 으로 싣고, 그것을 못 읽는
 * 브라우저를 위해 ASCII 대체 이름을 함께 준다. 대체 이름에 한글이 남으면
 * 헤더가 통째로 깨지므로 id 로 만든다.
 */
export function fileHeaders(
  bytes: Uint8Array,
  koreanName: string,
  asciiBase: string,
  ext: string,
  mime: string,
): HeadersInit {
  return {
    "Content-Type": mime,
    "Content-Disposition":
      `attachment; filename="${asciiBase}.${ext}"; ` +
      `filename*=UTF-8''${encodeURIComponent(koreanName)}`,
    "Content-Length": String(bytes.byteLength),
    // 공문서다. 중간 캐시가 한 사람의 문서를 다른 사람에게 주면 안 된다.
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}
