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

const { buildHandoverDraft, draftParagraphText, readDoc } = await import(
  "@/lib/handover-draft.ts"
);
const { workDocHref, workHref, workTalkHref } = await import("@/lib/types.ts");
const { docChunks, fromSections } = await import("@/lib/editor/model.ts");
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
  quoteTagLines.every((l) => l.ref?.kind === "comment"),
  `${quoteTagLines.filter((l) => l.ref?.kind !== "comment").length}줄이 안 가리킨다`,
);
// 문서 항목 근거도 누를 수 있어야 한다. 대화 근거는 눌러서 원문으로 가는데
// 문서 근거는 못 가면, 확인할 수 있는 근거와 못 하는 근거가 한 장에 섞이고
// 읽는 사람은 그 차이를 규칙이 아니라 실수로 읽는다.
const docTagLines = lines.filter((l) => /^ {2}\[.+ — .+\]$/.test(l.text) && !/^ {2}\[대화 — /.test(l.text));
ok("인용한 문서 항목의 꼬리표 줄이 있다", docTagLines.length > 0, `${docTagLines.length}줄`);
ok(
  "그 줄은 전부 문서를 가리킨다",
  docTagLines.every((l) => l.ref?.kind === "section" || l.ref?.kind === "doc"),
  docTagLines.filter((l) => l.ref?.kind !== "section" && l.ref?.kind !== "doc").map((l) => l.text).join(" / "),
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
console.log("\n[4] 규칙이 무엇을 걸렀나 — 안 실은 것을 세고, 원문으로 내놓는다");
// ---------------------------------------------------------------------------

const sc = draft.screening;

// **기록 하나는 정확히 한 칸에 들어간다.** 어긋나면 어느 한쪽을 조용히 빠뜨리고
// 있다는 뜻이고, 「다 봤다」고 말하는 화면에서 그건 가장 비싼 거짓말이다.
//
// 예전 항등식은 「걸린 것 + 안 걸린 것 + 뺀 것 = 본 것」이었는데, 거기에는
// **걸렸지만 상한에 잘린 것**이 어느 칸에도 없었다. 세 숫자가 서로 안 맞는 것을
// 아무도 눈치채지 못하는 구조였다. 지금은 실은 것을 세므로 빠질 자리가 없다.
for (const [name, s] of Object.entries(sc)) {
  ok(
    `[${name}] 실은 것 + 보여 준 것 + 뺀 것 = 들여다본 것`,
    s.used + s.missed.length + s.omitted === s.seen,
    `${s.used} + ${s.missed.length} + ${s.omitted} ≠ ${s.seen}`,
  );
  ok(`[${name}] 안 실린 것이 실제로 있다`, s.missed.length > 0, `${s.missed.length}건`);
  // 잘랐으면 잘랐다고 말해야 한다. 「그대로 둡니다」라고 적어 놓고 220자에서
  // 말없이 자르면 이 판이 스스로 어기는 규칙이 된다.
  ok(
    `[${name}] 220자를 넘는 글만 잘렸다고 표시된다`,
    s.missed.every((m) => m.truncated === m.body.endsWith("…")),
    s.missed.filter((m) => m.truncated !== m.body.endsWith("…")).map((m) => m.key).join(", "),
  );
  // 안 실린 이유는 둘뿐이고, 뜻이 다르다. 「규칙 밖」은 규칙을 고칠 일이고
  // 「상한」은 수를 고칠 일이다. 셋째 값이 생기면 화면이 설명할 말이 없다.
  ok(
    `[${name}] 안 실린 이유가 아는 것 둘 중 하나다`,
    s.missed.every((m) => m.why === "규칙 밖" || m.why === "상한에 잘림"),
    [...new Set(s.missed.map((m) => m.why))].join(", "),
  );
  ok(
    `[${name}] 안 실린 것마다 갈 곳이 있다`,
    s.missed.every((m) => m.ref && workIds.has(m.ref.workId)),
  );
}

// 놓친 것은 **원문 그대로** 내놓는다. 요약하면 규칙이 못 한 판단을 요약이 대신
// 하게 되고, 그러면 사람이 두 초 만에 넘길 수가 없다.
ok(
  "안 실린 대화가 전부 실재하고, 본문·글쓴이가 그 대화의 것이다",
  sc.comments.missed.every((m) => {
    const c = records.get(m.workId)?.comments.find((x) => x.id === m.key);
    return c && m.label.includes(c.author.name) && c.body.startsWith(m.body.slice(0, 20));
  }),
  sc.comments.missed.map((m) => m.key).join(", "),
);
// 서식에 실린 대화가 미포착에도 있으면 같은 글을 두 번 세는 것이다.
const missedIds = new Set(sc.comments.missed.map((m) => m.key));
const quotedIds = new Set(
  lines.filter((l) => l.ref?.kind === "comment").map((l) => l.ref.commentId),
);
ok(
  "서식에 실은 대화는 미포착에 없다",
  [...quotedIds].every((id) => !missedIds.has(id)),
  [...quotedIds].filter((id) => missedIds.has(id)).join(", "),
);
// 같은 축을 문서 쪽에서도 본다. 「1-나」·「1-다」가 실은 항목이 미포착에도 있으면
// 같은 글을 실었다고도 하고 안 실었다고도 하는 것이다.
const missedSectionIds = new Set(sc.sections.missed.map((m) => m.key));
const usedSectionIds = new Set(
  lines.filter((l) => l.ref?.kind === "section").map((l) => l.ref.sectionId),
);
ok(
  "서식에 실은 문서 항목은 미포착에 없다",
  [...usedSectionIds].every((id) => !missedSectionIds.has(id)),
  [...usedSectionIds].filter((id) => missedSectionIds.has(id)).join(", "),
);
// 안 실린 문서 항목의 글이 서식 어디에도 없어야 한다. 위의 id 대조는 「같은
// 항목인가」만 보므로, 다른 항목이 같은 글을 나르는 경우를 못 잡는다.
//
// ⚠ 두 쪽의 공백을 **같은 모양으로 눕히고** 비교해야 한다. 서식은 줄바꿈을
// 살리고 들여쓰기를 두 칸 붙이는데 인용문은 quote() 가 눕힌다. 그대로 대면
// 앞 40자에 줄바꿈이 하나만 있어도 영영 안 맞아, 실려 있어도 통과하는
// — 즉 절대 실패하지 못하는 — 항목이 된다.
const flatten = (s) => s.replace(/\s+/g, " ").trim();
const formText = flatten(
  draft.blocks.flatMap((b) => b.paragraphs.map(draftParagraphText)).join("\n"),
);
const leaked = sc.sections.missed.filter((m) =>
  formText.includes(flatten(m.body).slice(0, 40)),
);
ok(
  "안 실렸다고 한 문서 항목의 글은 서식에 없다",
  leaked.length === 0,
  leaked.map((m) => m.label).join(", "),
);
// 그리고 그 대조가 **실제로 무언가를 볼 수 있는지** 함께 본다. 실린 항목의 글은
// 같은 방법으로 찾으면 반드시 나와야 한다. 안 나오면 위 항목은 늘 통과한다.
const usedBodies = lines
  .filter((l) => l.ref?.kind === "section")
  .map((l) => l.text);
ok(
  "같은 방법으로 실린 항목은 서식에서 찾아진다 — 대조가 헛돌지 않는다",
  usedBodies.length > 0 &&
    usedBodies.every((t) => formText.includes(flatten(t).slice(0, 30))),
  `${usedBodies.length}줄`,
);

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
  .filter((l) => l.ref.kind === "comment")
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
// 문서 항목도 같은 축으로 본다. 앵커가 그 문서에 없는 항목을 가리키면 눌렀을 때
// 아무 일도 일어나지 않는다 — 404 도 콘솔 오류도 없이.
const badSection = linked
  .filter((l) => l.ref.kind === "section")
  .filter(
    (l) =>
      !records.get(l.ref.workId)?.sections.some((s) => s.id === l.ref.sectionId),
  );
ok(
  "가리키는 문서 항목이 그 업무의 문서에 실제로 있다",
  badSection.length === 0,
  badSection.map((l) => l.text.trim()).join(" / "),
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
ok(
  "문서 항목까지 가리키면 문서 탭의 그 항목으로 간다",
  workDocHref("w1", "s3") === "/works/w1?tab=doc#section-s3",
  workDocHref("w1", "s3"),
);
// 서식 문서의 블록에는 화면에 자리표가 없다(doc-preview.tsx 는 React key 만
// 쓴다). 블록 id 로 앵커를 만들면 아무 데도 안 가는 링크가 된다.
ok(
  "가리킬 자리가 없으면 앵커 없이 문서 탭으로만 간다",
  workDocHref("w1") === "/works/w1?tab=doc",
  workDocHref("w1"),
);

// ---------------------------------------------------------------------------
console.log("\n[7] 서식 문서 — 목업이 한 번도 안 지나가는 갈래");
// ---------------------------------------------------------------------------

// ⚠ 목업의 인계 대상 세 건에는 서식 문서가 **하나도 없다**(감량 시범사업 계획은
// 다른 사람 것이다). buildHandoverDraft 를 아무리 돌려도 이 갈래를 지나가지
// 않으므로, 시험이 readDoc 으로 직접 들어간다. 시드가 개조식 결함을 드러낼 수
// 없던 그때와 같은 자리다 — 시연은 통과하고 실데이터에서 무너진다.
const richDoc = (sections, title = "감량 시범사업 추진계획") => ({
  id: "d-rich",
  work_id: "w1",
  title: "옛 문서 제목",
  created_by: "p1",
  created_at: "2026-01-01T00:00:00+09:00",
  updated_at: "2026-01-01T00:00:00+09:00",
  // 저장되는 값은 RichDoc 한 벌 그대로다(actions/rich-doc.ts 의 createRichDocument).
  blocks: fromSections(sections, title, () => 0.5),
  blocks_rev: 3,
  blocks_updated_by: "p1",
  blocks_updated_at: "2026-08-20T00:00:00+09:00",
});
// 옮기기(convertToRichDoc) 뒤에도 doc_section 은 남는다 — 안전망으로 두기 때문에.
// 다만 그 행들은 **옮긴 시점에서 얼어붙는다.** 초안이 그걸 읽으면 몇 달 전 글이
// 인계서에 실린다.
const frozen = [
  {
    id: "s-frozen",
    document_id: "d-rich",
    sort_order: 0,
    heading: "옛 항목",
    body: "얼어붙은 옛 글입니다.",
    locked_by: null,
    locked_at: null,
    updated_by: null,
    updated_at: "2026-01-01T00:00:00+09:00",
  },
];

const rich = readDoc(
  richDoc([
    { heading: "1. 추진 배경", body: "생활폐기물 감량 목표를 정한다." },
    { heading: "2. 진행사항", body: "8월 현재 3개 동에서 시범 운영 중이다." },
    { heading: "3. 현안 및 유의사항", body: "수거 업체와 단가 협의가 필요함." },
  ]),
  frozen,
);
ok(
  "서식 문서의 본문을 읽는다 — 얼어붙은 항목이 아니라",
  rich.pieces.length === 3 &&
    !JSON.stringify(rich.pieces).includes("얼어붙은"),
  `${rich.pieces.length}덩어리 / ${rich.pieces.map((p) => p.heading).join(" | ")}`,
);
ok(
  "화면에 보이는 그 제목을 쓴다",
  rich.title === "감량 시범사업 추진계획",
  rich.title,
);
// 서식 문서의 덩어리에는 자리표가 없으므로 앵커를 지어내면 안 된다.
ok(
  "서식 문서의 덩어리에는 항목 앵커를 붙이지 않는다",
  rich.pieces.every((p) => p.sectionId === undefined),
);
ok(
  "제목 규칙대로 두 칸이 각각 가져간다",
  rich.progress?.heading === "2. 진행사항" &&
    rich.issue?.heading === "3. 현안 및 유의사항",
  `진행=${rich.progress?.heading} / 현안=${rich.issue?.heading}`,
);
ok(
  "남은 덩어리는 「규칙 밖」으로 셈에 들어간다",
  rich.missed.length === 1 &&
    rich.missed[0].piece.heading === "1. 추진 배경" &&
    rich.missed[0].why === "규칙 밖",
  rich.missed.map((m) => `${m.piece.heading}(${m.why})`).join(", "),
);

// 제목 블록은 항목이 아니다(부르는 쪽이 docTitle 로 따로 쓴다). 제목보다 앞에
// 오는 글은 버리지 않고 제목 없는 덩어리 하나로 묶는다.
const lead = docChunks(fromSections([{ heading: null, body: "머리말입니다." }], "제목", () => 0.5));
ok(
  "제목 없이 시작한 글도 덩어리가 된다",
  lead.length === 1 && lead[0].heading === null && lead[0].body.includes("머리말"),
  JSON.stringify(lead),
);

// ---------------------------------------------------------------------------
console.log("\n[8] 같은 항목이 두 칸에 실리지 않는다");
// ---------------------------------------------------------------------------

// 예전에는 두 칸이 각자 골랐다. 「현안 및 유의사항」 하나뿐인 문서에서 「1-나」는
// 제목에 「진행」이 없으니 폴백(가장 최근에 고친 것)으로 그 항목을 집었고,
// 「1-다」도 같은 것을 집었다. 인계서 한 장에 같은 글이 두 번 실리면 읽는 사람은
// 둘 중 하나가 잘못 실렸다고 읽는다.
const section = (id, heading, body, updated_at = "2026-08-01T00:00:00+09:00") => ({
  id,
  document_id: "d1",
  sort_order: 0,
  heading,
  body,
  locked_by: null,
  locked_at: null,
  updated_by: null,
  updated_at,
});
const plainDoc = {
  id: "d1",
  work_id: "w1",
  title: "추진계획",
  created_by: "p1",
  created_at: "2026-01-01T00:00:00+09:00",
  updated_at: "2026-01-01T00:00:00+09:00",
  blocks: null,
  blocks_rev: 0,
  blocks_updated_by: null,
  blocks_updated_at: null,
};

const onlyIssue = readDoc(plainDoc, [
  section("s1", "현안 및 유의사항", "단가 협의가 필요함."),
]);
ok(
  "「현안」 항목 하나뿐이면 「1-다」만 가져간다",
  onlyIssue.issue?.key === "s1" && onlyIssue.progress === null,
  `진행=${onlyIssue.progress?.heading ?? "없음"} / 현안=${onlyIssue.issue?.heading ?? "없음"}`,
);
ok(
  "그 항목은 미포착에도 없다 — 실렸으니까",
  onlyIssue.missed.length === 0,
  onlyIssue.missed.map((m) => m.piece.heading).join(", "),
);

// 규칙에 걸리는 제목인데도 안 실렸다면 규칙이 놓친 것이 아니라 **칸이 하나만
// 싣기 때문**이다. 두 사실을 한 이름으로 부르면 규칙을 고칠 자리와 상한을 고칠
// 자리가 뒤섞인다.
const twoIssues = readDoc(plainDoc, [
  section("s1", "현안 및 유의사항", "첫째 현안."),
  section("s2", "유의사항 추가", "둘째 현안."),
]);
ok(
  "규칙에 걸렸는데 칸이 하나라 밀린 것은 「상한」이라고 부른다",
  twoIssues.missed.length === 1 && twoIssues.missed[0].why === "상한에 잘림",
  twoIssues.missed.map((m) => `${m.piece.heading}(${m.why})`).join(", "),
);

// 본문이 빈 항목에는 잃을 것이 없다. 세면 「안 실린 것」이 부풀고,
// seen === used + missed + omitted 도 안 맞는다.
const withEmpty = readDoc(plainDoc, [
  section("s1", "진행사항", "진행 중."),
  section("s2", "빈 항목", "   "),
]);
ok(
  "본문이 빈 항목은 안 실린 것으로 세지 않는다",
  withEmpty.missed.length === 0,
  withEmpty.missed.map((m) => m.piece.heading).join(", "),
);

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
