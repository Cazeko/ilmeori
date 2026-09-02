import { NextResponse, type NextRequest } from "next/server";
import { getDepartment, getHandoverFor, getHandoverNotes } from "@/lib/data";
import { buildHandoverDraft } from "@/lib/handover-draft";
import { handoverToHwpxDoc } from "@/lib/handover-export";
import { buildHwpx, hwpxFileName } from "@/lib/hwpx/pack";
import { requireViewer } from "@/lib/session";
import { handoverSignedAt } from "@/lib/types";
import type { HandoverNoteWithAuthor } from "@/lib/types";

/**
 * 인계서를 한/글 파일로 내려준다.
 *
 * ── 왜 GET 인가 ────────────────────────────────────────────────────────────
 *
 * 이 앱의 화면은 자바스크립트 없이 전부 돈다. 서버 액션으로 파일을 만들면
 * 응답을 브라우저가 파일로 받아 낼 길이 없다(액션의 응답은 화면 갱신용이다).
 * 평범한 링크 하나면 스크립트가 없어도 눌리고, 주소를 복사해 둘 수도 있다.
 * GET 이 부작용을 남기지 않는 것도 조건에 맞는다 — 여기서는 아무것도 쓰지 않는다.
 * (결재 문서 내보내기가 이미 같은 판단을 했다)
 *
 * ── 권한 ───────────────────────────────────────────────────────────────────
 *
 * `getHandoverFor` 가 사용자 세션으로 나가므로 정책(handover_select)이 그대로
 * 적용된다 — 인계 문서는 넘기는 사람과 받는 사람에게만 보인다. 초안을 짓는
 * `buildHandoverDraft` 도 같은 세션으로 기록을 읽으므로, **화면에서 볼 수 없는
 * 것은 파일에도 담기지 않는다.** 화면과 같은 함수를 부르는 것이 그 보장의
 * 전부이고, 그래서 이 라우트는 질의를 하나도 새로 만들지 않는다.
 *
 * ── id 를 주소에서 받지 않는 이유 ──────────────────────────────────────────
 *
 * 사람은 한 번에 하나의 인계에만 얽힌다(startHandover 가 그렇게 막는다).
 * 주소에 id 를 실으면 「남의 인계 id 를 넣어 보는」 경로가 생기고, 그건 정책이
 * 막아 주더라도 **없어도 되는 문**이다. 화면이 보고 있는 그 인계를 그대로 쓴다.
 *
 * ── 남은 것 ────────────────────────────────────────────────────────────────
 *
 * 만들어 낸 .hwpx 가 한/글에서 열리는 것은 실물로 확인했다(pack.ts 머리말).
 * 그래도 인쇄(A4) 폴백은 그대로 둔다 — 그 자리에 한/글이 없을 수도 있다.
 *
 * ⚠ **내려받은 사실을 열람기록에 남기지 않는다.** access_kind 열거형에
 * 「인계서 내보내기」가 없고(0001), 값을 하나 더하려면 마이그레이션이 필요하다.
 * 있는 값 중 아무거나 골라 적으면 감사 기록이 거짓이 된다 — 열람과 파일 반출은
 * 다른 사건이다. 없는 기록보다 틀린 기록이 나쁘므로 지금은 남기지 않고,
 * 다음 마이그레이션의 몫으로 적어 둔다(결재 내보내기와 같은 자리, 같은 이유).
 */
export async function GET(request: NextRequest) {
  const viewer = await requireViewer();
  const view = await getHandoverFor(viewer);

  // 없는 인계와 못 보는 인계를 구분하지 않는다. 구분하는 순간 「그 인계는 있다」가 샌다.
  //
  // `msg=invalid` 로 보냈다가 고쳤다 — 그 말은 「입력한 내용을 다시 확인해
  // 주세요」로 뜬다. 사람은 아무것도 입력하지 않았다. 링크를 눌렀거나 그 사이
  // 인계가 끝난 것이고, 그때 할 일은 「다시 입력」이 아니다.
  // 결재 문서 내보내기가 같은 자리에서 같은 값을 쓴다.
  if (!view) {
    return NextResponse.redirect(new URL("/handover?msg=denied", request.url), {
      status: 303,
    });
  }

  const { handover, from, to, witness } = view;
  const draft = await buildHandoverDraft(view);
  const [fromDept, toDept, notes] = await Promise.all([
    from.department_id ? getDepartment(from.department_id) : null,
    to.department_id ? getDepartment(to.department_id) : null,
    getHandoverNotes(handover.id),
  ]);

  const notesByBlock = new Map<string, HandoverNoteWithAuthor[]>();
  for (const n of notes) {
    const list = notesByBlock.get(n.block_key);
    if (list) list.push(n);
    else notesByBlock.set(n.block_key, [n]);
  }

  // 시각은 **한 번만** 만들어 문서와 ZIP 항목에 같이 쓴다.
  //
  // ⚠ 이것으로 「두 번 내려받으면 바이트가 같다」가 되지는 **않는다.** 이 값은
  //   요청마다 새로 나고, 출처 문단이 「이 파일은 <시각> 기준으로 조립했습니다」를
  //   찍기 때문이다 — 1분 뒤에 받은 파일은 글자도 바이트도 다르다. 그게 맞다:
  //   내용은 그 순간의 기록으로 다시 조립한 것이고, 옛 시각을 찍으면 거짓이 된다.
  //   (종이도 같다 — print-sheet.tsx 의 footer 가 같은 `new Date()` 를 쓴다)
  //
  //   여기서 한 번만 만드는 것이 지키는 것은 **한 응답 안에서의 앞뒤**다. 안에서
  //   두 번 만들면 문서에 찍힌 시각과 ZIP 항목의 시각이 서로 다른 파일이 나간다.
  const createdAt = new Date();

  const bytes = buildHwpx(
    handoverToHwpxDoc({
      draft,
      notesByBlock,
      from,
      to,
      witness,
      signedAt: handoverSignedAt(handover),
      fromDept,
      toDept,
      generatedAt: handover.generated_at,
      completedAt: handover.completed_at,
      method: handover.ai_model ?? "rule-based/v1",
      createdAt,
    }),
  );

  // 파일 이름은 한글이다. RFC 5987 의 filename* 로 싣고, 그것을 못 읽는
  // 브라우저를 위해 ASCII 대체 이름을 함께 준다. 대체 이름에 한글이 남으면
  // 헤더가 통째로 깨지므로 인계 id 로 만든다.
  const korean = hwpxFileName(`업무인계인수서 ${from.name} ${to.name}`);
  const asciiBase = `handover-${handover.id}`.replace(/[^A-Za-z0-9._-]/g, "-");

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      // 한/글이 등록하는 형식. 확장자와 함께 있어야 두 번 클릭으로 열린다.
      "Content-Type": "application/haansofthwpx",
      "Content-Disposition":
        `attachment; filename="${asciiBase}.hwpx"; ` +
        `filename*=UTF-8''${encodeURIComponent(korean)}`,
      "Content-Length": String(bytes.byteLength),
      // 공문서다. 중간 캐시가 한 사람의 문서를 다른 사람에게 주면 안 된다.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
