import { NextResponse, type NextRequest } from "next/server";
import { getDepartment, getHandover, getHandoverNotes } from "@/lib/data";
import { buildHandoverDraft } from "@/lib/handover-draft";
import { handoverToHwpxDoc } from "@/lib/handover-export";
import { buildHwpx, hwpxFileName } from "@/lib/hwpx/pack";
import { requireViewer } from "@/lib/session";
import { handoverSignedAt } from "@/lib/types";
import type { HandoverNoteWithAuthor } from "@/lib/types";

/**
 * **지난** 인계서를 한/글 파일로 내려준다.
 *
 * ── 왜 `/handover/export/hwpx` 로는 안 되나 ────────────────────────────────
 *
 * 그 라우트는 `getHandoverFor` 를 쓴다 — 최신 한 건이다. 새 인계를 시작하면
 * 끝난 인계서의 내려받기가 **말없이 다른 문서를 준다.** 화면은 지난 인계서를
 * 보여 주는데 파일은 최신 것이 나오는 셈이라, 어긋난 것을 사람이 알아챌 방법이
 * 그 자리에 없다. 그래서 주소로 받는다.
 *
 * ── 「id 를 주소에서 받지 않는다」던 판단은 어떻게 됐나 ────────────────────
 *
 * 옆 라우트(`../../export/hwpx`)가 그렇게 적어 두었고, 그 이유는 「사람은 한
 * 번에 하나의 인계에만 얽히므로 남의 id 를 넣어 보는 문을 만들지 말자」였다.
 * 그 전제가 **틀렸다** — 사람은 한 번에 하나에만 얽히지만, 시간이 지나면
 * 여러 건을 겪는다. 지난 것을 보려면 어느 것인지 말해야 한다.
 *
 * 문이 열리는 것은 맞다. 그 문을 지키는 것도 화면이 아니라 정책이다 —
 * `getHandover` 가 사용자 세션으로 나가므로 `handover_select` 가 그대로
 * 적용되고, 당사자가 아니면 0행이다. uuid 모양이 아닌 id 는 조회층이 먼저
 * 걸러 낸다(db.ts 의 UUID 검사 — 없으면 22P02 로 500 이 된다).
 *
 * 나머지 판단(왜 GET 인가 · 왜 열람기록을 안 남기나 · 시각을 한 번만 만드는
 * 이유)은 전부 옆 라우트와 같다. 거기 적어 두었고 여기서 되풀이하지 않는다.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/handover/[id]/export/hwpx">,
) {
  const viewer = await requireViewer();
  const { id } = await params;
  const view = await getHandover(viewer, id);

  // 없는 인계와 못 보는 인계를 구분하지 않는다. 구분하는 순간 「그 인계는 있다」가 샌다.
  if (!view) {
    return NextResponse.redirect(
      new URL("/handover?start=1&msg=denied", request.url),
      { status: 303 },
    );
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

  // 한 응답 안에서의 앞뒤를 맞춘다 — 문서에 찍히는 시각과 ZIP 항목의 시각.
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

  const korean = hwpxFileName(`업무인계인수서 ${from.name} ${to.name}`);
  const asciiBase = `handover-${handover.id}`.replace(/[^A-Za-z0-9._-]/g, "-");

  return new Response(bytes as unknown as BodyInit, {
    headers: {
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
