import type { NextRequest } from "next/server";
import { buildDocx, docxFileName } from "@/lib/editor/docx";
import { fileHeaders, prepare } from "../shared";

/**
 * 서식 문서를 워드 파일로.
 *
 * ⚠ HWPX 와 같은 단서가 붙는다 — **실제 워드에서 열어 본 적이 없다.**
 * 시험(tests/docx.test.mjs)이 보는 것은 ZIP 구조와 OOXML 의 짜임까지다.
 * 워드는 규격에 어긋나는 문서를 「복구할 수 없습니다」 한 줄로 거부하므로,
 * 워드가 깔린 자리에서 한 번은 열어 봐야 한다.
 *
 * 그래도 이 길을 두는 이유: 부서 밖으로 나가는 문서는 한/글이 아니라 워드로
 * 달라는 요구가 실제로 온다(위원회·용역사·타 기관). 그때 「한/글밖에 안 됩니다」는
 * 답이 되지 않는다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ready = await prepare(request, params);
  if (ready instanceof Response) return ready;

  const bytes = buildDocx(ready.doc, {
    title: ready.title,
    createdAt: new Date(),
  });

  return new Response(bytes as unknown as BodyInit, {
    headers: fileHeaders(
      bytes,
      docxFileName(ready.title),
      ready.asciiBase,
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  });
}
