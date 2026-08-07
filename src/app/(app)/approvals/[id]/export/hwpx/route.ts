import { NextResponse, type NextRequest } from "next/server";
import {
  buildApprovalExport,
  exportBlockReason,
  toHwpxDoc,
} from "@/lib/approval-export";
import { buildHwpx, hwpxFileName } from "@/lib/hwpx/pack";
import { getApproval } from "@/lib/data";
import { requireViewer } from "@/lib/session";

/**
 * 결재 문서를 한/글 파일로 내려준다.
 *
 * ── 왜 GET 인가 ────────────────────────────────────────────────────────────
 *
 * 이 앱의 화면은 자바스크립트 없이 전부 돈다. 서버 액션으로 파일을 만들면
 * 응답을 브라우저가 파일로 받아 낼 길이 없다(액션의 응답은 화면 갱신용이다).
 * 평범한 링크 하나면 스크립트가 없어도 눌리고, 주소를 복사해 둘 수도 있다.
 *
 * GET 이 부작용을 남기지 않는 것도 조건에 맞는다 — 여기서는 아무것도 쓰지 않는다.
 *
 * ── 권한 ───────────────────────────────────────────────────────────────────
 *
 * getApproval 이 사용자 세션으로 나가므로 RLS 가 그대로 적용된다. 볼 수 없는
 * 문서는 0행으로 돌아오고, 파일에 실리는 근거 자료도 같은 세션으로 읽으므로
 * **화면에서 볼 수 없는 것은 파일에도 담기지 않는다.**
 * 볼 수 없는 문서와 없는 문서를 구분하지 않는 것도 화면과 같다.
 *
 * ── 남은 것 ────────────────────────────────────────────────────────────────
 *
 * ⚠ **내려받은 사실을 열람기록에 남기지 않는다.** access_kind 열거형에
 * 「결재문서 내보내기」가 없고(0001), 값을 하나 더하려면 마이그레이션이
 * 필요하다. 있는 값 중 아무거나(document.viewed) 골라 적으면 감사 기록이
 * 거짓이 된다 — 열람과 파일 반출은 다른 사건이다. 없는 기록보다 틀린 기록이
 * 나쁘므로 지금은 남기지 않고, 다음 마이그레이션의 몫으로 적어 둔다.
 */
export async function GET(
  request: NextRequest,
  // Next 16에서 라우트 핸들러의 params 는 Promise 다(첨부 내려받기와 같은 모양).
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  const { id } = await params;

  const approval = await getApproval(viewer, id);
  // 없는 문서와 못 보는 문서를 구분하지 않는다. 구분하는 순간 「그 문서는 있다」가 샌다.
  if (!approval) {
    return NextResponse.redirect(new URL("/approvals?msg=denied", request.url), {
      status: 303,
    });
  }

  // 기안 중인 문서는 파일로도 내보내지 않는다. 화면과 같은 판정을 같은 함수로 한다.
  if (exportBlockReason(approval)) {
    return NextResponse.redirect(
      new URL(`/approvals/${approval.id}/export`, request.url),
      { status: 303 },
    );
  }

  const ex = await buildApprovalExport(approval);
  const bytes = buildHwpx(
    toHwpxDoc(ex, { generatedAt: new Date(), by: viewer }),
  );

  // 파일 이름은 한글이다. RFC 5987 의 filename* 로 싣고, 그것을 못 읽는
  // 브라우저를 위해 ASCII 대체 이름을 함께 준다. 대체 이름에 한글이 남으면
  // 헤더가 통째로 깨지므로 문서번호로 만든다(없으면 uuid).
  const korean = hwpxFileName(approval.title);
  const asciiBase = (approval.doc_no ?? approval.id).replace(
    /[^A-Za-z0-9._-]/g,
    "-",
  );
  const disposition =
    `attachment; filename="${asciiBase}.hwpx"; ` +
    `filename*=UTF-8''${encodeURIComponent(korean)}`;

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      // 한/글이 등록하는 형식. 확장자와 함께 있어야 두 번 클릭으로 열린다.
      "Content-Type": "application/haansofthwpx",
      "Content-Disposition": disposition,
      "Content-Length": String(bytes.byteLength),
      // 공문서다. 중간 캐시가 한 사람의 문서를 다른 사람에게 주면 안 된다.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
