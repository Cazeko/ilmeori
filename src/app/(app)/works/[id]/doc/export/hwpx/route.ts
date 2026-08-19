import type { NextRequest } from "next/server";
import { buildHwpx, hwpxFileName } from "@/lib/hwpx/pack";
import { richToHwpxDoc } from "@/lib/editor/to-hwpx";
import { fileHeaders, prepare } from "../shared";

/**
 * 서식 문서를 한/글 파일로.
 *
 * ⚠ pack.ts 머리말이 적어 둔 그대로다 — **이 저장소는 실제 한/글에서 열어 본
 * 적이 없다.** 시험이 확인하는 것은 ZIP 규격·XML 짜임·글자 위치까지이고,
 * 「한/글이 연다」는 한/글이 깔린 컴퓨터에서 사람이 한 번 열어 봐야 안다.
 * 그때까지 이 문서의 정본 출력 경로는 **인쇄(A4)** 다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ready = await prepare(request, params);
  if (ready instanceof Response) return ready;

  const bytes = buildHwpx(
    richToHwpxDoc(ready.doc, { title: ready.title, createdAt: new Date() }),
  );

  return new Response(bytes as unknown as BodyInit, {
    headers: fileHeaders(
      bytes,
      hwpxFileName(ready.title),
      ready.asciiBase,
      "hwpx",
      // 한/글이 등록하는 형식. 확장자와 함께 있어야 두 번 클릭으로 열린다.
      "application/haansofthwpx",
    ),
  });
}
