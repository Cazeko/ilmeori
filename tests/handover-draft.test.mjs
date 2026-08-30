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

/** 「2026년 8월 6일」 → 20260806. 문자열 비교로는 8월과 12월이 뒤집힌다. */
function dateNum(s) {
  const [y, m, d] = s.match(/\d+/g).map(Number);
  return y * 10000 + m * 100 + d;
}

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
/**
 * 시간이 지나면 달라지는 자리만 지운다.
 *
 * 초안에는 **오늘을 기준으로 계산되는** 조각이 셋 있다 — 기한까지 남은 날
 * (`formatDueLabel`), 그 날수로 정해지는 파생 상태(`derivedStatus` 의 지연),
 * 그리고 지연 문구. 붙박이를 그대로 두면 **내일이면 시험이 빨간불이 된다.**
 * 제출 사흘 전에 그런 시험은 있으나 마나가 아니라 해롭다.
 *
 * 그렇다고 붙박이를 버리지는 않는다. 이 셋만 지우고 나머지 여든 줄
 * (제목·절차·인용·근거·협조 부서)은 글자 그대로 못박는다.
 */
const stable = (t) =>
  t
    .replace(/\(\d+일 (지남|남음)\)/g, "(D±N)")
    .replace(/\(오늘 마감\)/g, "(D±N)")
    .replace(/마감, [^.]*\./g, "마감, D±N.")
    .replace(/· 현재 \S+/g, "· 현재 §")
    .replace(/ — \S+, \d{4}년[^\n]*까지 \(D±N\)/g, " — §, D±N까지 (D±N)");
const flat =
  draft.blocks
    .map((b) => `${b.heading}\n${b.paragraphs.map(draftParagraphText).join("\n\n")}`)
    .join("\n\n") + "\n";
const firstDiff = [...golden].findIndex((ch, i) => flat[i] !== ch);
ok(
  "평탄화한 문서가 붙박이와 같다(오늘에 따라 달라지는 자리 제외)",
  stable(flat) === stable(golden),
  firstDiff >= 0
    ? `${firstDiff}번째 글자쯤부터 — 붙박이 「${golden.slice(firstDiff, firstDiff + 40)}」 / 지금 「${flat.slice(firstDiff, firstDiff + 40)}」`
    : `길이 ${golden.length} → ${flat.length}`,
);
// 두 번 뽑아 같은 글자가 나오는가. 「규칙은 놓치고 AI는 지어낸다」는 주장의
// 나머지 절반이다 — 같은 입력에 같은 출력이 아니면 「셀 수 있게 틀린다」가
// 성립하지 않는다. 부서 모으기처럼 Map 을 도는 자리가 늘 때 제일 먼저 깨진다.
const again = await buildHandoverDraft(await mock.getHandoverFor(from));
ok(
  "같은 기록에서 두 번 뽑으면 한 글자도 다르지 않다",
  flat ===
    again.blocks
      .map((b) => `${b.heading}\n${b.paragraphs.map(draftParagraphText).join("\n\n")}`)
      .join("\n\n") + "\n",
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

// 「· 」는 목록의 글머리이지 업무의 표시가 아니다 — 협조 부서 목록도 같은 것을
// 쓴다. 그래서 **실제 업무 제목과 맞는 줄**만 골라 본다.
const titles = new Set(view.items.map((i) => `· ${i.work.title}`));
const workTitleLines = lines.filter((l) => titles.has(l.text));
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
console.log("\n[3] 업무 처리 절차 · 협조 부서 — 2차 지적에 답하는 두 칸");
// ---------------------------------------------------------------------------

const duties = draft.blocks.find((b) => b.key === "1-duties");
const dutyText = duties.paragraphs.map(draftParagraphText).join("\n\n");
const notesText = draft.blocks
  .find((b) => b.key === "4-notes")
  .paragraphs.map(draftParagraphText)
  .join("\n\n");

// 칸을 새로 만들지 않았다. 편람 249쪽이 「가. 담당 업무」에 업무프로세스를
// 포함하라고 이미 적어 두었기 때문이다. 여덟 번째 칸이 생기면 그건 그 서식이 아니다.
ok(
  "서식은 일곱 칸 그대로다",
  draft.blocks.length === 7,
  draft.blocks.map((b) => b.key).join(", "),
);
ok("「가. 담당 업무」에 업무 처리 절차가 있다", dutyText.includes("[업무 처리 절차]"));

// 절차는 오간 순서가 곧 뜻이다. 이력은 최신순으로 오므로 뒤집지 않으면 거꾸로 실린다.
// 순서는 **업무 안에서만** 뜻이 있다. 문단 경계를 넘어 비교하면 다음 업무의
// 첫 결재가 앞 업무의 마지막보다 이르다는 이유로 실패한다(실제로 그렇게 짰다).
const perWork = duties.paragraphs.map((p) =>
  p
    .map((l) => l.text.match(/^ {4}(\d{4}년 \d+월 \d+일) /)?.[1])
    .filter(Boolean),
);
const stepCount = perWork.reduce((n, ds) => n + ds.length, 0);
ok("절차 줄이 하나 이상 있다", stepCount > 0, `${stepCount}줄`);
ok(
  "업무마다 절차가 오간 순서로 실린다",
  perWork.every((ds) =>
    ds.every((d, i) => i === 0 || dateNum(ds[i - 1]) <= dateNum(d)),
  ),
  perWork.filter((ds) => ds.length).map((ds) => ds.join(" → ")).join(" | "),
);

// 자동으로 채운 범위를 밝히는 문장은 **칸에 하나만** 있어야 한다.
// 업무마다 되풀이하면 세 건짜리 인계서에서만 세 번 나오고, 그게 3장을 넘긴다.
ok(
  "「밖에서 도는 절차는 없다」는 안내가 칸에 한 번만 나온다",
  (dutyText.match(/시스템 밖에서 도는 절차/g) ?? []).length === 1,
);

// ⚠ 「협조」와 「의견 있음」은 **서명한 자국에서만** 읽는다.
// 반려 요약문에는 반려 사유가 그대로 박혀 있고(0017 의 format), 사유는 대개
// 결재 이야기다 — "협조란 서명을 먼저 받아 오세요" 한 줄이 「협조 반려」로
// 찍히면 인계서가 없는 사실을 말한다. 낱말만 찾던 시절의 결함이다.
const traceLines = duties.paragraphs
  .flat()
  .filter((l) => /^ {4}\d{4}년 \d+월 \d+일 /.test(l.text));
ok(
  "서명이 아닌 자국에는 「…란」도 「의견 있음」도 붙지 않는다",
  traceLines
    .filter((l) => /(상신|반려|완결|회수)$/.test(l.text.trimEnd()))
    .every((l) => !/란 |의견 있음/.test(l.text)),
  traceLines.map((l) => l.text.trim()).join(" / "),
);
ok(
  "서명은 어느 란인지까지 적는다",
  traceLines.some((l) => /(결재|협조|전결|대결)란 서명/.test(l.text)),
  traceLines.map((l) => l.text.trim()).join(" / "),
);

ok("「4. 그 밖의 참고사항」에 협조 부서가 있다", notesText.includes("협조·연락이 오간 부서"));
// 소관 부서는 협조가 아니다. 인계받는 사람이 이미 옆자리에서 만난다.
const homeDepts = new Set(view.items.map((i) => i.work.department.name));
const listed = [...notesText.matchAll(/^· (.+?) — /gm)].map((m) => m[1]);
ok(
  "소관 부서는 협조 부서로 세지 않는다",
  listed.every((d) => !homeDepts.has(d)),
  `소관 [${[...homeDepts].join(", ")}] / 실린 것 [${listed.join(", ")}]`,
);
// Q5 에서 실무자는 연락처가 아쉽지 않았다고 답했다. 그래서 자동으로 채운 범위를
// 밝히는 것이 이 칸에서 가장 중요하다 — 시청 밖 관계자는 계정이 없어 안 나온다.
ok(
  "시청 밖 관계자는 안 나온다고 문서가 먼저 말한다",
  notesText.includes("시청 밖 관계자"),
);

// ---------------------------------------------------------------------------
console.log("\n[4] 미포착 — 놓친 것을 세고, 원문으로 내놓는다");
// ---------------------------------------------------------------------------

const sc = draft.screening;
// 셋을 더하면 전체가 되어야 한다. 어긋나면 어느 한쪽을 조용히 빠뜨리고 있다는 뜻이고,
// 「다 봤다」고 말하는 화면에서 그건 가장 비싼 거짓말이다.
// 상한이 생긴 뒤로는 화면에 보이는 수만 더해서는 전체가 안 된다.
// 뺀 수(omitted)까지 넣어야 「다 세었다」가 성립한다.
ok(
  "걸린 것 + 보여 준 것 + 뺀 것 = 들여다본 것",
  sc.matched + sc.missed.length + sc.omitted === sc.comments,
  `${sc.matched} + ${sc.missed.length} + ${sc.omitted} ≠ ${sc.comments}`,
);
ok("걸리지 않은 대화가 실제로 있다", sc.missed.length > 0, `${sc.missed.length}건`);

// 놓친 것은 **원문 그대로** 내놓는다. 요약하면 규칙이 못 한 판단을 요약이 대신
// 하게 되고, 그러면 사람이 두 초 만에 넘길 수가 없다.
const missedIds = new Set(sc.missed.map((m) => m.commentId));
ok(
  "놓친 대화가 전부 실재하고, 본문·글쓴이가 그 대화의 것이다",
  sc.missed.every((m) => {
    const c = records.get(m.workId)?.comments.find((x) => x.id === m.commentId);
    return c && m.author.includes(c.author.name) && c.body.startsWith(m.body.slice(0, 20));
  }),
  sc.missed.map((m) => m.commentId).join(", "),
);
// 서식에 실린 대화가 미포착에도 있으면 같은 글을 두 번 세는 것이다.
const quotedIds = new Set(lines.map((l) => l.ref?.commentId).filter(Boolean));
ok(
  "서식에 실은 대화는 미포착에 없다",
  [...quotedIds].every((id) => !missedIds.has(id)),
  [...quotedIds].filter((id) => missedIds.has(id)).join(", "),
);

// 잘랐으면 잘랐다고 말해야 한다. 「그대로 둡니다」라고 적어 놓고 220자에서
// 말없이 자르면 이 판이 스스로 어기는 규칙이 된다.
ok(
  "220자를 넘는 글만 잘렸다고 표시된다",
  sc.missed.every((m) => m.truncated === m.body.endsWith("…")),
  sc.missed.filter((m) => m.truncated !== m.body.endsWith("…")).map((m) => m.commentId).join(", "),
);
ok("상한에 걸려 뺀 수를 따로 센다", typeof sc.omitted === "number" && sc.omitted >= 0);

// ---------------------------------------------------------------------------
console.log("\n[5] 지어낸 앵커가 없다 — 누르면 실제로 그 기록으로 간다");
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
console.log("\n[6] 주소 모양");
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
