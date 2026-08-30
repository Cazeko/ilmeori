/**
 * 인계서 초안 시험 — 근거를 **가리킬 수 있는가**, 그리고 종이와 같은 글인가.
 *
 * ── 왜 생겼나 ──────────────────────────────────────────────────────────────
 *
 * 근거 꼬리표는 오랫동안 세는 말뿐이었다(「대화 26건 중 8건」). 세는 말은
 * 어디서 나왔는지 적었다는 **주장**이지 확인 수단이 아니다. 2차 심사에서
 * *"AI가 쓴 답변같이 보였는데"* 가 나왔고, 말로는 그 의심이 안 깨진다.
 * 그래서 문단을 줄의 목록으로 바꾸고 줄마다 출처를 달았다.
 *
 * 그 변경이 깨뜨릴 수 있는 것이 둘이라, 이 시험은 그 둘만 본다.
 *
 *   ① **종이가 달라지는 것.** 화면은 링크를 그리고 종이·저장본은 글자만
 *      가져간다. 두 매체가 같은 문단에서 나온다는 약속이 무너지면, 심사장에서
 *      띄운 화면과 결재로 올라간 문서가 다른 말을 하게 된다.
 *   ② **지어낸 앵커.** 링크가 없는 대화를 가리키면 눌렀을 때 아무 데도 안 간다.
 *      「지어내지 않는다」를 내세우는 제품에서 그건 가장 비싼 실패다.
 *      그래서 모든 ref 가 **실제로 그 업무에 있는 대화**인지 대조한다.
 *
 * 목업 데이터로 돈다. Supabase 구현의 같은 축은 supabase/rls.test.mjs 가 본다.
 *
 * 돌리는 법
 *   npm run test:handover-draft
 */

import { readFileSync } from "node:fs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

const { buildHandoverDraft, draftParagraphText } = await import(
  "@/lib/handover-draft.ts"
);
const { workHref, workTalkHref } = await import("@/lib/types.ts");
const mock = await import("@/lib/data/mock.ts");
const { profiles } = await import("@/lib/mock/org.ts");

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// 목업의 인계 건은 박준호 → 이하람 하나다(src/lib/mock/works.ts).
const from = profiles.find((p) => p.name === "박준호");
const view = await mock.getHandoverFor(from);
if (!view) {
  console.log("목업에 인계 건이 없다. 시험할 것이 없으므로 여기서 멈춘다.");
  process.exit(1);
}
const draft = await buildHandoverDraft(view);
const lines = draft.blocks.flatMap((b) => b.paragraphs.flat());
const linked = lines.filter((l) => l.ref);

// 실제로 존재하는 업무와 대화. 앵커를 대조할 기준이다.
const records = await mock.gatherForWorks(view.items.map((i) => i.work.id));
const workIds = new Set(view.items.map((i) => i.work.id));

// ---------------------------------------------------------------------------
console.log("\n[1] 화면과 종이는 같은 문단에서 나온다");
// ---------------------------------------------------------------------------

ok("문단이 하나 이상 있다", lines.length > 0, `${lines.length}줄`);
ok(
  "한 줄에 줄바꿈이 들어 있지 않다",
  lines.every((l) => !l.text.includes("\n")),
  lines.filter((l) => l.text.includes("\n")).length + "줄",
);
// 평탄화가 곧 종이다. 그리고 그 종이는 **줄 링크를 넣기 전과 같아야 한다.**
//
// 이 대조가 이 시험의 핵심이다. 문단을 통짜 문자열에서 줄의 목록으로 바꾸면서
// 글자가 한 칸이라도 달라지면 결재로 올라간 문서가 달라진 것이고, 그건
// 화면에서는 티가 안 난다. 붙박이 파일은 리팩터 직전 커밋의 출력에서 떴다.
//
// 서식 문구를 일부러 고쳤다면 아래 한 줄로 다시 뜬다:
//   node --import ./tests/alias-hook-register.mjs -e '...' > tests/fixtures/handover-draft.txt
// 다만 **다시 뜨기 전에 무엇이 왜 달라졌는지 눈으로 확인해야 한다.**
const golden = readFileSync(
  new URL("./fixtures/handover-draft.txt", import.meta.url),
  "utf8",
);
const flat =
  draft.blocks
    .map((b) => `${b.heading}\n${b.paragraphs.map(draftParagraphText).join("\n\n")}`)
    .join("\n\n") + "\n";
const firstDiff = [...golden].findIndex((ch, i) => flat[i] !== ch);
ok(
  "평탄화한 문서가 줄 링크를 넣기 전과 한 글자도 다르지 않다",
  flat === golden,
  firstDiff >= 0
    ? `${firstDiff}번째 글자부터 — 붙박이 「${golden.slice(firstDiff, firstDiff + 40)}」 / 지금 「${flat.slice(firstDiff, firstDiff + 40)}」`
    : `길이 ${golden.length} → ${flat.length}`,
);
// 링크는 화면의 장치다. 글자에는 흔적이 남으면 안 된다.
ok(
  "평탄화한 글에 주소나 앵커가 섞이지 않는다",
  draft.blocks.every((b) =>
    b.paragraphs.every(
      (p) => !/\/works\/|#comment-|\?tab=/.test(draftParagraphText(p)),
    ),
  ),
);

// ---------------------------------------------------------------------------
console.log("\n[2] 가리킬 수 있는 줄 — 어느 줄이 눌리는가");
// ---------------------------------------------------------------------------

const workTitleLines = lines.filter((l) => /^· /.test(l.text));
const quoteTagLines = lines.filter((l) => /^ {2}\[대화 — /.test(l.text));
const quoteBodyLines = lines.filter((l) => /^ {2}“/.test(l.text));

ok("업무를 이름으로 부르는 줄이 있다", workTitleLines.length > 0);
ok(
  "그 줄은 전부 업무를 가리킨다",
  workTitleLines.every((l) => l.ref?.workId),
  `${workTitleLines.filter((l) => !l.ref).length}줄이 안 가리킨다`,
);
ok("인용한 대화의 꼬리표 줄이 있다", quoteTagLines.length > 0);
ok(
  "그 줄은 전부 대화를 가리킨다",
  quoteTagLines.every((l) => l.ref?.commentId),
  `${quoteTagLines.filter((l) => !l.ref?.commentId).length}줄이 안 가리킨다`,
);
// 인용문에 링크를 걸면 굵은 글자가 원문을 덮어 「원문 그대로」가 원문처럼 안 보인다.
ok(
  "인용문 자체는 링크가 아니다",
  quoteBodyLines.length > 0 && quoteBodyLines.every((l) => !l.ref),
);
// 사람이 적어야 하는 칸은 근거가 없어서 비워 둔 자리다. 가리킬 것도 없다.
ok(
  "사람이 적어야 하는 칸에는 링크가 없다",
  draft.blocks
    .filter((b) => b.needsHuman)
    .every((b) => b.paragraphs.flat().every((l) => !l.ref)),
);

// ---------------------------------------------------------------------------
console.log("\n[3] 지어낸 앵커가 없다 — 누르면 실제로 그 기록으로 간다");
// ---------------------------------------------------------------------------

ok(
  "가리키는 업무가 전부 인계 대상 안에 있다",
  linked.every((l) => workIds.has(l.ref.workId)),
  linked
    .filter((l) => !workIds.has(l.ref.workId))
    .map((l) => l.ref.workId)
    .join(", "),
);
// 가리키는 대화가 실재하는지와, 꼬리표에 적힌 이름이 그 대화를 쓴 사람인지를
// 한 번에 본다. 앵커가 없으면 아래 find 가 undefined 라 여기서 같이 걸린다 —
// 「있는가」를 따로 물으면 이 항목이 통과할 때 절대 실패하지 못하는 항목이 된다.
const misattributed = linked
  .filter((l) => l.ref.commentId)
  .filter((l) => {
    const c = records
      .get(l.ref.workId)
      ?.comments.find((x) => x.id === l.ref.commentId);
    return !c || !l.text.includes(c.author.name);
  });
ok(
  "가리키는 대화가 그 업무에 실제로 있고, 꼬리표의 이름이 그 대화를 쓴 사람이다",
  misattributed.length === 0,
  misattributed.map((l) => l.text.trim()).join(" / "),
);

// ---------------------------------------------------------------------------
console.log("\n[4] 주소 모양");
// ---------------------------------------------------------------------------

// 업무 줄까지 대화 탭으로 보내면 업무를 누른 사람이 대화 목록에 떨어진다.
// 주소를 한 함수로 합치다가 실제로 그렇게 될 뻔했다.
ok(
  "업무만 가리키면 업무 화면으로 간다",
  workHref("w1") === "/works/w1",
  workHref("w1"),
);
// 앵커만으로는 부족하다. 업무 상세의 대화는 탭 안에서만 그려지므로
// (works/[id]/page.tsx 의 tab === "talk"), tab 없이 보내면 그 글이 없는
// 화면에 도착한다. 404 도 아니고 주소창도 멀쩡해서 화면을 열기 전에는
// 안 드러난다 — 실제로 그렇게 한 번 냈고, 그래서 이 줄이 있다.
ok(
  "대화까지 가리키면 대화 탭의 그 글로 간다",
  workTalkHref("w1", "c9") ===
    "/works/w1?tab=talk#comment-c9",
  workTalkHref("w1", "c9"),
);

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
