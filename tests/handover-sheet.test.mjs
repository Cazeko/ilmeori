/**
 * 서식 렌더 시험 — **종이에 찍히는 글자**를 실제로 그려서 본다.
 *
 * ── 왜 이 파일이 생겼나 ────────────────────────────────────────────────────
 *
 * 지금까지 이 저장소의 시험은 전부 데이터 층에서 멈췄다. 노드가 JSX 를 못
 * 읽어서였고, 그 결과 **인계서 종이를 그리는 코드(print-sheet.tsx)는 어떤
 * 시험도 지나가지 않았다.** handover-draft.test.mjs 는 문단이 옳게 조립되는지
 * 보지만, 그 문단이 서식에 옳게 실리는지는 아무도 안 봤다.
 *
 * 그 구멍이 이제 위험해진다. 화면에서 **문장마다 출처를 비추는 층**을 붙이는
 * 작업이 곧 이 파일을 고치기 때문이다. 그 작업은 종이 쪽 문단 렌더를
 * `draftParagraphText()`(글자만)에서 `<DraftLines>`(줄마다 링크)로 바꾸고,
 * 화면에는 켜고 끄는 체크박스와 「출처 붙은 문장 N개」 캡션을 세운다.
 * 글자가 한 칸이라도 달라지거나 그 장치가 **서식 안으로 들어오면** 결재에
 * 올라가는 문서가 달라진 것이고, 화면에서는 티가 안 난다.
 *
 * 그래서 고치기 **전에** 안전망을 먼저 친다. 아래 [3]·[5]·[6]·[7] 은 아직 짓지
 * 않은 것에 대한 시험이다 — 지금은 당연히 통과하고, 잘못 지으면 그때 빨간불이
 * 된다. 시험을 나중에 쓰면 이미 깨진 상태를 붙박이로 굳히게 된다.
 *
 * ── 「켜짐/꺼짐에서 글자가 같다」를 어떻게 증명하나 ────────────────────────
 *
 * 출처 층은 체크박스 하나와 CSS 규칙으로만 켜고 끈다(print-sheet.tsx 가
 * `server-only` 를 물고 있어 클라이언트 컴포넌트가 될 수 없다). 그러면 켜짐과
 * 꺼짐의 글자가 같다는 것은 네 조각으로 갈라진다.
 *
 *   ① 문단의 글자·차례·개수가 데이터 그대로            → [2]
 *   ② 서식의 뼈대에 새 물건이 끼어들지 않는다          → [3]
 *   ③ CSS 가 글자를 **만들어 내지 않는다**             → [6]
 *   ④ 종이 컴포넌트가 켜짐/꺼짐을 **알지 못한다**      → [7]
 *
 * 넷이 함께 서야 증명이 된다. ②가 없으면 토글 자체를 서식 안에 넣어도 아무도
 * 모르고(첫 판이 실제로 그랬다), ③이 없으면 `::after { content: "출처" }` 한
 * 줄로 종이가 달라지며, ④가 없으면 프롭으로 갈래를 나눠 종이가 두 벌이 된다.
 *
 * ── 스스로 헛도는지 본다 ──────────────────────────────────────────────────
 *
 * 훑는 검사([6]·[7])에는 **아는 답을 먹여 보는 대조**를 붙였다. 지금
 * globals.css 에는 `content:` 가 한 줄도 없어서, 그 검사는 아무것도 안 하고도
 * 늘 통과할 수 있다. 그런 항목은 시험이 아니라 장식이다.
 * (handover-proof.test.mjs 가 같은 자리에서 같은 것을 한다)
 *
 * 돌리는 법
 *   npm run test:sheet
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { buildHandoverDraft, draftBlockText, draftParagraphText } = await import(
  "@/lib/handover-draft.ts"
);
const { HandoverPrintSheet } = await import(
  "@/components/handover/print-sheet.tsx"
);
const { DraftLines } = await import("@/components/handover/draft-lines.tsx");
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

/**
 * 태그를 벗겨 **사람이 읽는 글자만** 남긴다.
 *
 * 공백을 눕히지 않는다. 서식의 인용문은 두 칸 들여쓰기와 줄바꿈이 곧 뜻이고
 * (`whitespace-pre-line` 이 화면에서 그대로 살린다), 눕혀서 비교하면 들여쓰기가
 * 사라진 것을 못 잡는다. `&amp;` 는 맨 끝에 푼다 — 먼저 풀면 `&amp;lt;` 가
 * `<` 가 된다.
 */
const textOf = (html) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// 목업의 인계 건은 박준호 → 이하람 하나다(src/lib/mock/works.ts).
const from = profiles.find((p) => p.name === "박준호");
const view = await mock.getHandoverFor(from);
if (!view) {
  console.log("목업에 인계 건이 없다. 시험할 것이 없으므로 여기서 멈춘다.");
  process.exit(1);
}
const draft = await buildHandoverDraft(view);
const [fromDept, toDept] = await Promise.all([
  view.from.department_id ? mock.getDepartment(view.from.department_id) : null,
  view.to.department_id ? mock.getDepartment(view.to.department_id) : null,
]);

/** 화면(handover/page.tsx)이 넘기는 것과 같은 한 벌. */
function sheet(notesByBlock = new Map()) {
  return createElement(HandoverPrintSheet, {
    draft,
    notesByBlock,
    from: view.from,
    to: view.to,
    fromDept,
    toDept,
    generatedAt: view.handover.generated_at,
    completedAt: view.handover.completed_at,
    method: view.handover.ai_model ?? "rule-based/v1",
  });
}

const html = renderToStaticMarkup(sheet());
const text = textOf(html);

// ---------------------------------------------------------------------------
console.log("\n[1] 서식이 실제로 그려진다");
// ---------------------------------------------------------------------------

ok("빈 문서가 아니다", text.length > 500, `${text.length}자`);
ok("별지 제12호서식의 제목이 있다", text.includes("업무인계·인수서"));
ok(
  "인계자와 인수자가 이름으로 적힌다",
  text.includes(view.from.name) && text.includes(view.to.name),
);
// 서식은 일곱 칸이고, 칸 이름은 종이만 든 사람이 읽는 유일한 길잡이다.
const missingHeadings = draft.blocks.filter((b) => !text.includes(b.heading));
ok(
  "일곱 칸의 이름이 전부 종이에 있다",
  draft.blocks.length === 7 && missingHeadings.length === 0,
  missingHeadings.map((b) => b.heading).join(", "),
);

// ---------------------------------------------------------------------------
console.log("\n[2] 종이의 글자 = 문단 평탄화 — 한 칸도 다르지 않다");
// ---------------------------------------------------------------------------

// 이 대조가 이 파일의 핵심이다. 종이가 싣는 글자는 **데이터에서만** 나와야
// 하고, 그 데이터를 글자로 눕히는 식은 handover-draft.ts 에 한 벌만 있다.
//
// ⚠ 「글자가 들어 있는가」로 물으면 안 된다. 처음에 그렇게 썼고, 종이가 칸의
// 문단을 전부 이어 붙여 **문단마다 되풀이해 싣는** 결함을 통과시켰다 —
// 이어 붙인 글에는 낱낱의 문단이 전부 부분 문자열로 들어 있기 때문이다.
// 그래서 **문단의 차례와 개수를 그대로** 맞춘다.
//
// 사람이 적어야 하는 칸과 규칙이 채운 칸은 눕히는 방법이 다르다 —
// 앞은 문단을 빈칸으로 이어 한 덩이로 싣고(draftBlockText) 손으로 적을 자리를
// 안내하는 줄이 뒤따르고, 뒤는 문단마다 <p> 를 따로 세운다.
const rendered = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
  textOf(m[1]),
);
const expected = draft.blocks.flatMap((b) =>
  b.needsHuman
    ? [draftBlockText(b.paragraphs), "인계자가 직접 적어야 하는 칸입니다."]
    : b.paragraphs.map(draftParagraphText),
);
// 서식의 본문 문단 뒤로는 서명란 한 줄과 맨아래 안내 두 줄이 온다. 개수를
// 못박지 않으면 이 대조가 **앞부분만 보는 검사**가 되어, 본문 뒤에 새 문단을
// 끼워 넣어도 잘려 나가 안 보인다.
const TAIL = 3;
ok(
  "종이의 문단 수가 정해진 그대로다",
  rendered.length === expected.length + TAIL,
  `본문 ${expected.length} + 꼬리 ${TAIL} 이어야 하는데 ${rendered.length}개`,
);
const firstOff = expected.findIndex((t, i) => rendered[i] !== t);
ok(
  "본문 문단이 차례도 글자도 그대로다",
  expected.length > 0 && firstOff === -1,
  firstOff >= 0
    ? `${firstOff + 1}번째 문단 — 있어야 할 것 「${(expected[firstOff] ?? "").slice(0, 50)}」 / 그려진 것 「${(rendered[firstOff] ?? "(없음)").slice(0, 50)}」`
    : "",
);
// 같은 문장이 두 번 실리면 읽는 사람은 둘 중 하나가 잘못 실렸다고 읽는다.
//
// **데이터에서 나온 글자만** 센다. 「인계자가 직접 적어야 하는 칸입니다.」는
// 서식이 사람 칸마다 한 번씩 찍는 안내문이라, 사람 칸이 둘이 되는 날
// (물품·예산을 나누는 것 같은) 옳은 변경이 이 항목을 빨갛게 만든다.
const dataTexts = draft.blocks
  .flatMap((b) =>
    b.needsHuman
      ? [draftBlockText(b.paragraphs)]
      : b.paragraphs.map(draftParagraphText),
  )
  .filter(Boolean);
const twice = dataTexts.filter(
  (t, i) => dataTexts.indexOf(t) === i && text.split(t).length - 1 > 1,
);
ok(
  "같은 문단이 종이에 두 번 실리지 않는다",
  twice.length === 0,
  twice.map((t) => `「${t.slice(0, 40)}」`).join(", "),
);

// 들여쓰기와 줄바꿈이 살아 있는지 따로 본다. 위의 대조가 통과하려면 이미
// 살아 있어야 하지만, 인용이 한 줄뿐인 날에는 그 사실이 안 드러난다.
const indented = draft.blocks
  .flatMap((b) => (b.needsHuman ? [] : b.paragraphs))
  .flat()
  .filter((l) => l.text.startsWith("  "));
ok(
  "인용의 들여쓰기가 종이에서도 남는다",
  indented.length > 0 && indented.every((l) => text.includes(l.text)),
  `${indented.length}줄`,
);

// ---------------------------------------------------------------------------
console.log("\n[3] 종이의 뼈대 — 서식 안에 새 물건이 끼어들지 않는다");
// ---------------------------------------------------------------------------

// ⚠ 이 판이 없던 첫 버전은 **토글과 캡션을 서식 안에 넣어도 전부 초록이었다.**
// 위 [2]는 `<p>` 만 보므로 `<label>`·`<div>` 로 들어온 글자를 못 본다.
//
// 문단을 하나하나 세는 대신 **뼈대**를 못박는다. 서식 바로 아래에는 제목·
// 사람 표·칸 일곱·서명란·맨아래 안내만 온다. 새 자식이 하나라도 늘면 그건
// 데이터가 아니라 장치가 종이에 올라온 것이다.

/** 닫는 태그가 없는 요소들 — 깊이를 세려면 알아야 한다. */
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** 바깥 요소 **바로 아래** 자식들의 태그 이름을 차례대로. */
function topChildren(markup) {
  const inner = markup
    .replace(/^<[a-z]+\b[^>]*>/i, "")
    .replace(/<\/[a-z]+>$/i, "");
  const out = [];
  let depth = 0;
  for (const m of inner.matchAll(/<(\/?)([a-z0-9]+)\b[^>]*?(\/?)>/gi)) {
    const [, close, raw, selfClose] = m;
    const tag = raw.toLowerCase();
    if (close) {
      depth -= 1;
      continue;
    }
    if (depth === 0) out.push(tag);
    if (!selfClose && !VOID.has(tag)) depth += 1;
  }
  return out;
}

const skeleton = topChildren(html);
const wantSkeleton = [
  "h1",
  "table",
  ...draft.blocks.map(() => "section"),
  "section", // 서명란
  "footer", // 맨아래 안내
];
ok(
  "서식 바로 아래 자식이 정해진 뼈대 그대로다",
  skeleton.join(" ") === wantSkeleton.join(" "),
  `있어야 할 것 [${wantSkeleton.join(" ")}] / 그려진 것 [${skeleton.join(" ")}]`,
);
// 여기서도 아는 답을 먹여 본다. 깊이 세기가 어긋나면 위 항목이 **끼어든
// 물건을 못 보고도** 통과할 수 있다. 특히 닫는 태그가 없는 `<input>` 이
// 깊이를 어긋내는 것이 이 계산에서 제일 쉬운 실수다.
const CONTROL_MARKUP =
  '<article class="sheet"><h1>제목</h1>' +
  '<label><input type="checkbox"/> 문장마다 출처 보기</label>' +
  "<section><p>안<span>속</span></p></section><footer><p>끝</p></footer></article>";
ok(
  "이 계산이 끼어든 물건을 실제로 알아본다",
  topChildren(CONTROL_MARKUP).join(" ") === "h1 label section footer",
  `[${topChildren(CONTROL_MARKUP).join(" ")}]`,
);

// 종이에는 누를 것이 없다. 출처 토글은 화면의 장치이고 **서식 밖**에 선다.
// 이 한 줄이 「체크박스를 서식 안에 넣는」 가장 쉬운 길을 막는다.
const controls = [...html.matchAll(/<(input|button|select|textarea|label|form)\b/gi)]
  .map((m) => m[1].toLowerCase());
ok(
  "서식 안에 누를 수 있는 것이 없다",
  controls.length === 0,
  [...new Set(controls)].join(", "),
);

// ---------------------------------------------------------------------------
console.log("\n[4] 주소는 글자가 아니다");
// ---------------------------------------------------------------------------

// 종이에 인쇄된 앵커는 읽는 사람에게 아무것도 아니다. 링크가 생기더라도
// **눈에 보이는 글자에는** 흔적이 없어야 한다.
const leaked = ["/works/", "?tab=", "#comment-", "#section-"].filter((s) =>
  text.includes(s),
);
ok("종이 글자에 주소나 앵커가 섞이지 않는다", leaked.length === 0, leaked.join(" "));
// ⚠ 엔티티를 풀기 **전에** 본다. 대화에 `<hong@hscity.go.kr>` 같은 글이 한 줄만
// 있어도, 푼 뒤에 보면 새는 것이 없는데도 빨간불이 된다.
ok("태그가 글자로 새지 않는다", !html.replace(/<[^>]*>/g, "").includes("<"));

// ---------------------------------------------------------------------------
console.log("\n[5] DraftLines 는 평탄화와 한 글자도 다르지 않다");
// ---------------------------------------------------------------------------

// 아직 종이는 <DraftLines> 를 안 쓴다. **곧 쓴다** — 출처 층을 붙이는 작업이
// 종이 쪽 문단 렌더를 이것으로 바꾸기 때문이다. 그 교체가 안전하다는 것은
// 「같은 문단을 넣으면 같은 글자가 나온다」로만 보장된다.
//
// 지금 재 두면, 바꾸는 날 이 항목이 먼저 말한다. 바꾼 뒤에 재면 이미 달라진
// 글자를 옳은 것으로 굳히게 된다.
const paragraphs = draft.blocks.flatMap((b) => b.paragraphs);
const drift = paragraphs.filter(
  (p) =>
    textOf(renderToStaticMarkup(createElement(DraftLines, { lines: p }))) !==
    draftParagraphText(p),
);
ok(
  "모든 문단에서 <DraftLines> 의 글자 = draftParagraphText",
  paragraphs.length > 0 && drift.length === 0,
  `${paragraphs.length}문단 중 ${drift.length}문단이 다르다`,
);
// 링크가 실제로 붙는 문단으로도 지나가야 한다. 링크가 하나도 없는 문단만
// 재면 이 항목은 절대 실패하지 못한다.
const linkedParagraphs = paragraphs.filter((p) => p.some((l) => l.ref));
ok(
  "그 대조가 링크 붙은 문단을 실제로 지나간다",
  linkedParagraphs.length > 0 &&
    linkedParagraphs.some((p) =>
      renderToStaticMarkup(createElement(DraftLines, { lines: p })).includes("<a "),
    ),
  `${linkedParagraphs.length}문단`,
);

// ---------------------------------------------------------------------------
console.log("\n[6] CSS 는 글자를 만들어 내지 않는다");
// ---------------------------------------------------------------------------

/**
 * 글자를 찍는 `content:` 선언을 전부 찾는다.
 *
 * ⚠ **선택자로 범위를 좁히지 않는다.** 처음에는 `.sheet` 가 붙은 규칙만 봤는데,
 * 서식 **안**을 맞히는 규칙이 `.sheet` 를 안 적어도 된다는 것이 문제다 —
 * `@media print { .src-tag::after { … } }` 한 줄이면 그 검사를 그냥 지나간다.
 * 중첩(`.sheet { .src::after { … } }`)도 마찬가지로 안쪽 선택자만 잡힌다.
 *
 * 그래서 파일 전체에서 찾고, 정당한 것은 아래 목록에 **손으로 적어** 예외로
 * 둔다. 지금은 한 줄도 없다. 장식용으로 하나 넣는 날 목록에 이유와 함께
 * 적게 되고, 그 한 번의 결정이 이 검사가 지키려는 전부다.
 *
 * `justify-content` 같은 이웃 속성에 걸리지 않게 왼쪽 경계를 둔다.
 * 빈 문자열과 `none`·`normal` 은 글자가 아니라 모양을 만드는 관용구다.
 */
const ALLOWED_CONTENT = [];
function printingContent(cssText) {
  return [...cssText.matchAll(/(?<![-\w])content\s*:\s*([^;}]*)/g)]
    .map((m) => m[1].trim())
    .filter((v) => !/^(""|''|none|normal)$/.test(v))
    .filter((v) => !ALLOWED_CONTENT.includes(v));
}

const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
ok("globals.css 를 실제로 읽었다", css.includes(".sheet"), `${css.length}자`);
const printed = printingContent(css);
ok(
  "글자를 만들어 내는 CSS 가 한 줄도 없다",
  printed.length === 0,
  printed.map((v) => `content: ${v}`).join(" / "),
);
// 아는 답을 먹여 본다. 지금 globals.css 에는 `content:` 가 한 줄도 없어서,
// 위 항목은 이 검사가 아무것도 못 하더라도 늘 통과한다. 그런 항목은 시험이
// 아니라 장식이다.
const CONTROL = `
@layer components {
  .sheet { .src::after { content: " [출처: 대화]"; } }
  .sheet h1 { display: flex; justify-content: center; }
}
@media print { .src-tag::after { content: "출처"; } }
.icon::before { content: ""; }
`;
ok(
  "이 검사가 진짜로 글자를 만들어 내는 규칙을 알아본다",
  printingContent(CONTROL).length === 2,
  `중첩·형제 둘을 잡고 layout·빈 문자열은 안 잡아야 하는데 [${printingContent(CONTROL).join(" | ")}]`,
);

// ---------------------------------------------------------------------------
console.log("\n[7] 종이는 「출처 층 켜짐/꺼짐」을 알지 못한다");
// ---------------------------------------------------------------------------

// 켜고 끄는 것을 프롭으로 만들면 그 순간 종이가 **두 벌**이 된다. 두 벌이 되면
// 「화면과 종이가 같은 문단에서 나온다」는 이 구조의 전부가 무너지고, 위 [2]는
// 둘 중 한 벌만 보게 된다.
//
// 그래서 켜고 끄는 것은 CSS 한 층에만 둔다. 이 항목은 그 결정이 코드에서
// 지켜지는지를 본다 — 누가 프롭을 다는 날 여기가 먼저 빨간불이 된다.
const isSwitch = (p) =>
  /^(show|hide|is|with|toggle)[A-Z]/.test(p) ||
  /(source|src|ref|cite|evidence|provenance|visible|enabled|mode|variant|layer)/i.test(
    p,
  );

const sheetSrc = readFileSync(
  path.join(ROOT, "src/components/handover/print-sheet.tsx"),
  "utf8",
);
// 받는 프롭만 본다 — 파일 전체를 훑으면 주석에 적힌 낱말에 걸려 헛돈다.
const propBlock = sheetSrc.match(
  /export function HandoverPrintSheet\(\{([\s\S]*?)\}: \{/,
)?.[1];
const props = (propBlock ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
ok(
  "프롭 목록을 실제로 읽어 냈다",
  props.length > 0,
  "HandoverPrintSheet 의 매개변수 모양이 바뀌었다면 이 정규식을 같이 고쳐야 한다",
);
ok(
  "종이 컴포넌트에 켜짐/꺼짐을 뜻하는 프롭이 없다",
  !props.some(isSwitch),
  props.filter(isSwitch).join(", "),
);
// 여기서도 아는 답을 먹여 본다. 이 판정이 이름을 못 알아보면 위 항목은
// 무엇이 들어와도 통과한다.
ok(
  "이 검사가 진짜 이름을 알아본다",
  ["showSource", "srcOn", "perLineRefs", "provenanceOn", "citationMode"].every(
    isSwitch,
  ) && !props.some(isSwitch),
  `지금 프롭 [${props.join(", ")}]`,
);

// ---------------------------------------------------------------------------
console.log("\n[8] 사람이 보탠 글은 규칙이 뽑은 문단과 섞이지 않는다");
// ---------------------------------------------------------------------------

// 결재에 올라간 뒤 "이 문장은 누가 썼느냐"는 물음에 **종이만 보고** 답할 수
// 있어야 한다. 목업에는 보충 글이 한 건도 없어서 이 갈래를 아무도 안 지나간다 —
// 서식 문서 갈래가 그랬던 것과 같은 자리다(handover-draft.test.mjs [7]).
const noteBody = "현장 확인 결과 진입로 폭이 도면과 다릅니다.";
const noteBlock = draft.blocks.find((b) => !b.needsHuman) ?? draft.blocks[0];
const withNote = renderToStaticMarkup(
  sheet(
    new Map([
      [
        noteBlock.key,
        [
          {
            id: "n1",
            block_key: noteBlock.key,
            body: noteBody,
            created_at: "2026-08-20T09:00:00+09:00",
            author: { name: "박준호", position: "주무관" },
          },
        ],
      ],
    ]),
  ),
);
const withNoteText = textOf(withNote);

ok("보탠 글이 종이에 실린다", withNoteText.includes(noteBody));
ok(
  "누가 언제 적었는지 함께 실린다",
  /인계자 보충: 박준호 주무관, /.test(withNoteText),
  withNoteText.match(/인계자 보충:[^\n]*/)?.[0] ?? "그 줄이 없다",
);
// 색이 없는 종이에서 둘을 가르는 것은 왼쪽 선 하나다.
ok("보탠 글은 따로 표시된 칸에 들어간다", /class="note"/.test(withNote));
ok(
  "규칙이 뽑은 문단 안으로 섞여 들어가지 않는다",
  draft.blocks.every((b) =>
    b.paragraphs.every((p) => !draftParagraphText(p).includes(noteBody)),
  ),
);
// 맨 아래 안내는 **있을 때만** 적는다. 없는데 적어 두면 종이만 든 사람이
// 어딘가에 사람이 쓴 문장이 있다고 여기고 찾게 된다.
ok(
  "보탠 글이 없으면 그것을 설명하는 문장도 없다",
  !text.includes("인계자 보충」은 규칙이 뽑은 것이 아니라"),
);
ok(
  "보탠 글이 있으면 그것이 무엇인지 종이가 스스로 말한다",
  withNoteText.includes("인계자 보충」은 규칙이 뽑은 것이 아니라"),
);

// ---------------------------------------------------------------------------
console.log("\n[9] 출처 층이 비추는 것 — 인용이지 이동 링크가 아니다");
// ---------------------------------------------------------------------------

// 서식의 줄에는 두 갈래의 링크가 있다.
//
//   업무 제목 줄  `· 2026년 … 용역`   → 그 업무로 **가는** 링크
//   인용 꼬리표   `  [대화 — …]`      → 이 문장이 **어디서 왔는지**
//
// 둘을 한 덩이로 세면 「출처 붙은 문장」이 두 배 가까이 부풀려진다
// (handover-draft.ts 의 screeningTotal 주석). 화면에서 한 덩이로 비추면 같은
// 거짓말을 눈으로 하는 것이라, 이 구분은 데이터에서 CSS 까지 그대로 내려가야
// 한다. `data-src` 가 그 통로다.
const marked = [...html.matchAll(/<a\b[^>]*?data-src="([a-z]+)"/g)].map(
  (m) => m[1],
);
const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
const refs = draft.blocks
  .flatMap((b) => (b.needsHuman ? [] : b.paragraphs))
  .flat()
  .filter((l) => l.ref);
const quoteRefs = refs.filter((l) => l.ref.kind !== "work");

ok(
  "인용 줄만 표시가 붙는다",
  marked.length === quoteRefs.length && quoteRefs.length > 0,
  `표시 ${marked.length}개 · 인용 ${quoteRefs.length}개`,
);
ok(
  "업무 제목 줄에는 안 붙는다",
  anchors.length === refs.length &&
    anchors.length - marked.length === refs.length - quoteRefs.length,
  `링크 ${anchors.length}개 · 그중 표시 ${marked.length}개 · 데이터의 ref ${refs.length}개`,
);
// 갈래 이름을 그대로 싣는다 — 서랍이 무엇을 열지 알아야 하고, 화면을 열어 본
// 사람이 개발자 도구에서 확인할 수 있어야 한다.
ok(
  "표시에는 갈래가 그대로 실린다",
  marked.every((k) => ["comment", "section", "doc"].includes(k)) &&
    !marked.includes("work"),
  [...new Set(marked)].join(", "),
);

// ---------------------------------------------------------------------------
console.log("\n[10] 종이는 출처 층을 모른다 — 인쇄가 되돌리는 것을 센다");
// ---------------------------------------------------------------------------

/**
 * 규칙 하나의 선언을 속성 이름 집합으로 읽는다.
 *
 * 화면 쪽 규칙에 속성을 하나 더하면서 인쇄 쪽 되돌림을 빠뜨리는 것이 이
 * 구조에서 가장 쉬운 실수다. 그때 새는 것은 화면이 아니라 **결재에 올라가는
 * 종이**이고, 아무도 Ctrl+P 를 눌러 보지 않으면 끝까지 모른다.
 * 그래서 「같은 속성을 인쇄에서도 건드리는가」를 센다.
 */
function declaredProps(cssText, selector) {
  const at = cssText.indexOf(selector);
  if (at < 0) return null;
  const open = cssText.indexOf("{", at);
  const close = cssText.indexOf("}", open);
  if (open < 0 || close < 0) return null;
  return new Set(
    cssText
      .slice(open + 1, close)
      .split(";")
      .map((d) => d.split(":")[0].trim())
      .filter(Boolean),
  );
}

const onProps = declaredProps(css, "#handover-prov:checked ~ .sheet [data-src]");
const printBlock = css.slice(css.indexOf("@media print"));
const offProps = declaredProps(printBlock, ".sheet [data-src]");
ok(
  "화면 규칙과 인쇄 규칙을 둘 다 찾았다",
  onProps !== null && offProps !== null,
  `화면 ${onProps ? [...onProps].join(",") : "없음"} / 인쇄 ${offProps ? [...offProps].join(",") : "없음"}`,
);
const notReset = [...(onProps ?? [])].filter((p) => !offProps?.has(p));
ok(
  "켜짐이 바꾸는 속성을 인쇄가 하나도 빠짐없이 되돌린다",
  (onProps?.size ?? 0) > 0 && notReset.length === 0,
  notReset.join(", "),
);
// 링크는 색만 되돌리면 안 된다. 굵기를 두면 업무 제목과 인용 꼬리표가 종이에
// 굵게 찍혀, 링크가 없던 예전 종이와 다른 문서가 된다.
const printLink = declaredProps(printBlock, ".sheet a");
ok(
  "인쇄에서 링크는 색도 굵기도 본문으로 돌아간다",
  printLink?.has("color") && printLink?.has("font-weight"),
  [...(printLink ?? [])].join(", "),
);
// 아는 답을 먹여 본다. 위 세는 방식이 헛돌면 무엇을 빠뜨려도 통과한다.
const CONTROL_CSS = `
@layer components {
  #handover-prov:checked ~ .sheet [data-src] { display: inline-block; border-left: 1px solid #000; background: pink; }
}
@media print {
  .sheet [data-src] { display: inline; border-left: 0; }
}`;
const cOn = declaredProps(CONTROL_CSS, "#handover-prov:checked ~ .sheet [data-src]");
const cOff = declaredProps(
  CONTROL_CSS.slice(CONTROL_CSS.indexOf("@media print")),
  ".sheet [data-src]",
);
ok(
  "이 셈이 빠뜨린 속성을 실제로 알아본다",
  [...cOn].filter((p) => !cOff.has(p)).join(",") === "background",
  `[${[...cOn].filter((p) => !cOff.has(p)).join(",")}]`,
);

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
