/**
 * 디자인 규칙 시험 — 되돌아가는 것을 막는다.
 *
 * 이 저장소는 디자인 규칙을 **시험으로** 지키는 문화가 있다
 * (contrast.test.mjs 가 29쌍을 재고, squint.test.mjs 가 흐린 화면을 잰다).
 * 이 파일은 거기에 세 가지를 보탠다. 셋 다 「고쳐 놓고 다시 돌아간 적이 있는
 * 것」이라 사람이 눈으로 지킬 수 없는 종류다.
 *
 *   1) 여백 반단계   4px 사다리를 벗어난 2px 단위
 *   2) 날 hex        이름 없는 색
 *   3) loading.tsx   스크립트 없는 브라우저에서 본문을 통째로 없앤다
 *
 * 돌리는 법
 *   npm run test:design
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const SRC = join(ROOT, "src");

let pass = 0;
const fails = [];
function ok(name, bad, extra = "") {
  if (bad.length === 0) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fails.push(`${name} — ${bad.length}건`);
    console.log(`  ✗ ${name} — ${bad.length}건`);
    for (const b of bad.slice(0, 40)) console.log(`      ${b}`);
    if (bad.length > 40) console.log(`      … 그리고 ${bad.length - 40}건 더`);
  }
}

/** src 아래 파일을 모은다. 점으로 시작하는 디렉터리는 건너뛴다(.ipynb_checkpoints). */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = await walk(SRC);
const tsx = files.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
const css = files.filter((f) => f.endsWith(".css"));

/**
 * 주석을 지운다 — **줄 수는 그대로 둔 채로.**
 *
 * 처음에는 한 줄 안에서만 `/* … *\/` 를 걷어냈는데, 이 저장소의 주석은
 * 대부분 여러 줄이라 거의 아무것도 안 걸러졌다. 그래서 대비 실측값이나
 * 「예전에는 #fafafa 였다」 같은 설명이 전부 위반으로 잡혔다 —
 * 시험이 자기가 지키려는 문서를 위반이라고 말하고 있었다.
 *
 * 지우되 개행은 남긴다. 그래야 아래에서 보고하는 줄 번호가 실제 줄과 맞는다.
 */
function stripComments(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const chunk = text.slice(i, end === -1 ? text.length : end + 2);
      // 개행만 남기고 나머지는 공백으로
      out += chunk.replace(/[^\n]/g, " ");
      i += chunk.length;
    } else if (text[i] === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

const read = async (f) => {
  const text = await readFile(f, "utf8");
  return { path: relative(ROOT, f), text, code: stripComments(text) };
};
const tsxFiles = await Promise.all(tsx.map(read));
const cssFiles = await Promise.all(css.map(read));

// ---------------------------------------------------------------------------
console.log("\n여백 — 4·8·12·16·24·32·48 사다리만 쓴다");
// ---------------------------------------------------------------------------
/*
 * 한동안 19가지 단계를 썼고 그중 2px 반단계가 305회였다. work-card.tsx 는
 * 주석에 「4·8·12 만 쓴다」고 적어 놓고 **자기 파일 안에서 이미 어기고
 * 있었다.** 사람은 숫자를 세지 못해도 「정돈이 안 됐다」를 느낀다.
 *
 * 재는 것은 **여백**뿐이다(m·p·gap·space). 아래 둘은 리듬이 아니라서 뺀다.
 *   size-*                아이콘 크기. 14px·18px 은 아이콘 세트가 주는 값이다
 *   top/left/right/bottom 겹쳐 놓은 것의 광학 보정. 1~2px 이 실제로 필요하다
 *
 * 배지 안쪽 여백은 금지 대신 **이름을 줬다** — px-chip-x / py-chip-y
 * (globals.css 의 --spacing-chip-*). 13px 글자에 4px 세로 여백을 주면 배지가
 * 줄 높이를 벌려 목록이 어긋난다. 규칙에 예외가 필요하면 이름을 붙여 남긴다.
 */
const SPACING = /\b(?:m|mt|mb|ml|mr|mx|my|p|pt|pb|pl|pr|px|py|gap|gap-x|gap-y|space-x|space-y)-\d+\.5\b/g;
const halfSteps = [];
for (const { path, code } of tsxFiles) {
  code.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(SPACING)) {
      halfSteps.push(`${path}:${i + 1}  ${m[0]}`);
    }
  });
}
ok("여백에 2px 반단계가 없다", halfSteps, `${tsxFiles.length}개 파일`);

// ---------------------------------------------------------------------------
console.log("\n색 — 날 hex 는 이름을 정의하는 자리에만 둔다");
// ---------------------------------------------------------------------------
/*
 * 규칙은 「hex 를 쓰지 마라」가 아니라 **「이름을 붙여라」**다. 어딘가에는
 * 반드시 실제 값이 적혀야 하고, 그 자리는 커스텀 속성을 **정의하는** 줄이다.
 *
 *     --mark-yellow: #fff3b0;      ← 좋다. 이름이 생긴다
 *     background: #fff3b0;         ← 나쁘다. 이 색이 무엇인지 아무도 모른다
 *
 * 예외는 하나뿐이고 파일 통째로 봐준다 — global-error.tsx. 그 화면은 CSS 가
 * 아예 안 왔을 수도 있는 상황에서 뜨므로 토큰을 못 쓴다(그 파일 머리글 참조).
 * 대신 아래 「두 사본이 같은 말을 하는가」 검사가 그 값들을 지킨다.
 */
const DEFINES = /^\s*--[a-z0-9-]+\s*:/;

/**
 * **토큰을 쓸 수 없는 자리.** 셋 갈래이고 이유가 다 다르다.
 *
 *   global-error.tsx   CSS 가 아예 안 왔을 수도 있는 상황에서 뜨는 화면이다.
 *   layout · manifest  themeColor 는 브라우저 주소창이 읽는 값이다. var() 를
 *                      넣으면 브라우저가 그냥 무시한다.
 *   lib/editor/*       **파일 안으로 들어가는 색**이다. 여기서 만든 HTML·HWPX·
 *                      DOCX 는 한/글과 워드가 여는 문서이고, 그 문서에 var() 를
 *                      적어 봐야 아무 색도 안 나온다.
 *
 * 봐주는 것은 「hex 를 쓴 것」까지다. **값이 팔레트를 벗어나는 것은 봐주지
 * 않는다** — 아래 「팔레트 밖으로 갈라지지 않았는가」가 이 파일들을 통째로
 * 다시 훑는다. 사본은 반드시 어긋나므로, 봐주려면 대신 지켜야 한다.
 */
const HEX_EXEMPT = [
  "src/app/global-error.tsx",
  "src/app/layout.tsx",
  "src/app/manifest.ts",
  "src/lib/editor/html.ts",
  "src/lib/editor/to-hwpx.ts",
  "src/lib/editor/docx.ts",
];

/* 종이는 순백이고 잉크는 먹이다. @media print 안의 흑백은 화면 팔레트에서
   가져올 값이 아니라 매체의 사실이라, 이 넷만은 이름 없이 써도 된다. */
const PAPER = new Set(["#fff", "#ffffff", "#000", "#000000"]);

/**
 * 한 줄에서 **색인 것**만 뽑는다.
 *
 * `#[0-9a-f]{3,8}` 만으로 훑으면 자바스크립트의 비공개 필드가 걸린다 —
 * 실제로 `crdt.ts` 의 `#dead` 가 잡혔다(d·e·a·d 가 전부 16진수 글자다).
 * `#beef` `#face` `#cafe` 도 마찬가지다.
 *
 * 그래서 매체별로 다르게 본다.
 *   .css   값 자리에 그대로 적힌다. 줄 전체를 훑는다.
 *   .ts(x) 색은 언제나 **따옴표 안**에 있다(className·style·문자열).
 *          비공개 필드는 따옴표 밖이라 이것만으로 갈린다.
 */
function colorsIn(line, isCss) {
  // &#160; 같은 HTML 엔티티는 색이 아니다 — html.ts 의 &nbsp; 가 잡혔다
  const HEX_G = /(?<!&)#[0-9a-fA-F]{3,8}\b/g;
  if (isCss) return line.match(HEX_G) ?? [];
  const out = [];
  for (const span of line.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? []) {
    out.push(...(span.match(HEX_G) ?? []));
  }
  return out;
}

const rawHex = [];
for (const { path, code } of [...cssFiles, ...tsxFiles]) {
  if (HEX_EXEMPT.includes(path)) continue;
  const isCss = path.endsWith(".css");
  code.split("\n").forEach((line, i) => {
    if (DEFINES.test(line)) return; // 이름을 정의하는 줄
    const found = colorsIn(line, isCss);
    if (found.length === 0) return;
    if (found.every((h) => PAPER.has(h.toLowerCase()))) return;
    rawHex.push(`${path}:${i + 1}  ${line.trim().slice(0, 80)}`);
  });
}
ok("이름 없는 색이 없다", rawHex);

// ---------------------------------------------------------------------------
console.log("\n팔레트 밖으로 갈라지지 않았는가 — 손으로 적은 사본들");
// ---------------------------------------------------------------------------
/*
 * 위에서 봐준 파일들은 팔레트를 **손으로 다시 적은 사본**이다. 그럴 수밖에
 * 없는 이유는 저마다 있지만(위 HEX_EXEMPT 주석), 사본이라는 사실은 그대로
 * 남는다 — **토큰을 고쳐도 저쪽은 안 따라온다.**
 *
 * 그래서 저쪽에 적힌 hex 가 전부 팔레트에 실제로 있는 값인지 본다.
 * 갈라지는 순간 시험이 먼저 안다. 특히 lib/editor 는 한/글이 여는 파일에
 * 들어가는 색이라, 갈라지면 **화면과 종이가 다른 색이 된다** — 이 저장소가
 * 내보내기에서 가장 신경 쓰는 것이 그것이다.
 */
const paletteText = [
  (await read(join(SRC, "app/globals.css"))).text,
  (await read(join(SRC, "styles/editor.css"))).text,
].join("\n");
const known = new Set(
  [...paletteText.matchAll(/--[a-z0-9-]+:\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) =>
    m[1].toLowerCase(),
  ),
);
// 세 글자 축약형도 같은 색으로 친다(#fff = #ffffff)
const expand = (h) =>
  h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join("")}` : h;

const drifted = [];
for (const path of HEX_EXEMPT) {
  const { code } = await read(join(ROOT, path));
  code.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/(?<!&)#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = expand(m[0].toLowerCase());
      if (PAPER.has(hex)) continue;
      if (!known.has(hex)) drifted.push(`${path}:${i + 1}  ${m[0]}`);
    }
  });
}
ok(
  "손으로 적은 색이 전부 팔레트 안에 있다",
  drifted,
  `${HEX_EXEMPT.length}개 파일 · ${known.size}개 토큰과 대조`,
);

// ---------------------------------------------------------------------------
console.log("\n가리키는 이름이 실제로 있는가");
// ---------------------------------------------------------------------------
/*
 * CSS 의 `var(--없는-이름)` 은 **아무 소리도 내지 않는다.** 규칙이 통째로
 * 무효가 되면서 그 속성이 초깃값으로 돌아갈 뿐이다.
 *
 * 실제로 물렸다. 토큰을 5단에서 2단으로 줄이면서 --radius-md·lg 를 지웠는데,
 * editor.css 가 그 둘을 네 곳에서 var() 로 부르고 있었다. 빌드도 통과하고
 * 타입 검사도 통과하고, 편집기의 둥근 모서리만 **소리 없이 각져 있었다.**
 * 사람이 그 화면을 열어 보기 전에는 아무도 모른다.
 *
 * 아래 넷은 CSS 에 정의가 없는 것이 맞다 — 화면에서 style 속성으로 그때그때
 * 넣는 값이다(커서 자리 --x/--y/--h, 사람 색 --tone/--tone-on).
 */
const RUNTIME_VARS = new Set(["--x", "--y", "--h", "--tone", "--tone-on"]);
const defined = new Set(
  [...paletteText.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
);
const dangling = [];
for (const { path, code } of cssFiles) {
  code.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (defined.has(m[1]) || RUNTIME_VARS.has(m[1])) continue;
      dangling.push(`${path}:${i + 1}  var(${m[1]}) — 정의가 없다`);
    }
  });
}
ok("var() 가 가리키는 이름이 전부 있다", dangling, `${defined.size}개 이름`);

// ---------------------------------------------------------------------------
console.log("\nhover 가 경보선을 지우지 않는가");
// ---------------------------------------------------------------------------
/*
 * `hover:border-…` 는 **네 변을 통째로** 칠한다. 그리고 의사클래스라 특이도가
 * 한 칸 높아서, 같은 요소에 붙은 `border-l-rule-alarm` 을 이긴다.
 *
 * 실제로 물렸다. 지연된 카드와 홈 히어로에 `hover:border-primary-30` 이
 * 붙어 있었고, **마우스를 올리는 순간 왼쪽 붉은 경보선과 위쪽 먹선이 파랗게
 * 지워졌다.** 이 디자인 전체가 그 두 선 위에 서 있는데, 사람이 가리키는 바로
 * 그 순간에 신호가 사라진 셈이다. 화면을 열어 봐도 마우스를 올려야만 보인다.
 *
 * 규칙: 왼쪽/위쪽에 뜻 있는 선(rule-alarm · rule-head · accent)을 두른 요소에는
 * `hover:border-…`/`active:border-…` 를 붙이지 않는다. 손이 닿았다는 표시는
 * 바탕으로 한다(hover:bg-…).
 */
/*
 * 어떻게 찾는가. 처음에는 className={cn(…)} 한 덩어리를 통째로 잡아
 * `border-l-rule-alarm` 이 들어 있는지 봤는데, **버그를 도로 넣고 돌려도
 * 통과했다.** urgent-hero 는 경보선을 변수로 넣기 때문이다.
 *
 *     tone.edge  →  "border-l-rule-alarm"
 *
 * 리터럴이 그 자리에 없으니 아무것도 안 걸렸다. 통과만 하는 시험은 시험이
 * 아니라서, 찾는 표식을 **굵기**로 바꿨다 — 옆이나 위에 굵기를 따로 준
 * 변(border-l-3 · border-t-2)은 뜻이 있어서 그렇게 한 것이고, 그 굵기는
 * 언제나 리터럴로 적힌다.
 *
 * 요소 경계를 정확히 자르는 대신 **가까이 있는가**로 본다. 600자 안에 둘이
 * 함께 있으면 같은 요소로 친다. 거칠지만 이 종류의 버그는 언제나 한 덩어리
 * className 안에서 일어난다.
 */
const EDGE_WIDTH = /border-(?:l|t)-[234]\b/;
const BORDER_STATE = /\b(?:hover|active|focus):border-(?!l-|t-|r-|b-)[a-z0-9-]+/g;
const NEAR = 600;
const wipedEdges = [];
for (const { path, code } of tsxFiles) {
  for (const m of code.matchAll(BORDER_STATE)) {
    const from = Math.max(0, m.index - NEAR);
    const around = code.slice(from, m.index + NEAR);
    if (!EDGE_WIDTH.test(around)) continue;
    const line = code.slice(0, m.index).split("\n").length;
    wipedEdges.push(`${path}:${line}  ${m[0]} 가 옆·위의 뜻 있는 선을 덮는다`);
  }
}
ok("hover·active 가 뜻 있는 선을 덮지 않는다", wipedEdges);

// ---------------------------------------------------------------------------
console.log("\n문서 등급은 자기가 문서라고 말하는가");
// ---------------------------------------------------------------------------
/*
 * 실눈 시험(tests/squint.test.mjs)은 두 가지를 묻는다 — 흐리게 봤을 때
 * 덩어리가 하나 서는가(무게), 그 덩어리가 **「문서」 위에 있는가**(자리).
 * 두 번째 물음은 화면이 `data-rank="doc"` 로 「이 화면의 1등은 이것」이라고
 * 선언해야 성립한다.
 *
 * 선언을 빠뜨리면 **시험이 실패하지 않는다. 조용히 아무것도 안 잰다.** 통과만
 * 하는 시험은 시험이 아니므로, 겉모양(CARD_SURFACE.doc)을 가져다 쓴 자리에
 * 선언이 붙어 있는지 여기서 본다.
 *
 * Card·CardPad 컴포넌트는 자기가 알아서 붙이므로(card.tsx) 걸릴 일이 없다.
 * 걸리는 것은 <article>·<header>·<ul> 처럼 그 컴포넌트를 못 쓰는 자리다.
 */
const NEAR_RANK = 400;
const unmarkedDoc = [];
for (const { path, code } of tsxFiles) {
  for (const m of code.matchAll(/CARD_SURFACE\.doc\b/g)) {
    const around = code.slice(
      Math.max(0, m.index - NEAR_RANK),
      m.index + NEAR_RANK,
    );
    if (/data-rank=/.test(around)) continue;
    const line = code.slice(0, m.index).split("\n").length;
    unmarkedDoc.push(`${path}:${line}  CARD_SURFACE.doc 옆에 data-rank="doc" 이 없다`);
  }
}
ok("문서 겉모양에는 문서 표식이 붙어 있다", unmarkedDoc);

// ---------------------------------------------------------------------------
console.log("\n열거형 — DB 와 타입이 같은 말을 하는가");
// ---------------------------------------------------------------------------
/*
 * 실제로 물렸다. 0019 가 `activity_kind` 에 note.sent · note.answered 를 더했는데
 * `src/lib/types.ts` 의 `ActivityKind` 유니온에는 안 더했다.
 *
 * **타입 검사는 통과했다.** DB 에서 온 값은 캐스팅으로 들어오기 때문이다. 그런데
 * `ICON` 과 `ACTIVITY_TONE` 이 `Record<ActivityKind, …>` 라, 쪽지를 한 번이라도
 * 보낸 업무의 이력 탭에서 `ICON["note.sent"]` 가 undefined 가 되고 React 가
 * `<undefined />` 로 터진다. 화면 하나가 통째로 죽는데 시험도 타입도 조용하다.
 *
 * 「양쪽에 적어야 한다」를 사람이 기억하는 대신 여기서 센다.
 */
const ENUM_PAIRS = [
  { sql: "activity_kind", ts: "ActivityKind" },
  { sql: "notification_kind", ts: "NotificationKind" },
];

const sqlText = (
  await Promise.all(
    (await readdir(join(ROOT, "supabase/migrations")))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFile(join(ROOT, "supabase/migrations", f), "utf8")),
  )
).join("\n");

const typesText = (await read(join(SRC, "lib/types.ts"))).code;

/** create type X as enum ('a','b') + alter type X add value 'c' 를 함께 모은다. */
function sqlEnumValues(name) {
  const out = new Set();
  const created = new RegExp(
    `create type ${name} as enum\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    "i",
  ).exec(sqlText);
  if (created) {
    for (const m of created[1].matchAll(/'([^']+)'/g)) out.add(m[1]);
  }
  for (const m of sqlText.matchAll(
    new RegExp(`alter type ${name} add value[^']*'([^']+)'`, "gi"),
  )) {
    out.add(m[1]);
  }
  return out;
}

/** export type X = | "a" | "b"; 의 문자열 리터럴을 모은다. */
function tsUnionValues(name) {
  const m = new RegExp(`export type ${name} =([\\s\\S]*?);`).exec(typesText);
  if (!m) return null;
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

const enumDrift = [];
for (const { sql, ts } of ENUM_PAIRS) {
  const a = sqlEnumValues(sql);
  const b = tsUnionValues(ts);
  if (a.size === 0) {
    enumDrift.push(`supabase/migrations  ${sql} 을 못 찾았다`);
    continue;
  }
  if (b === null) {
    enumDrift.push(`src/lib/types.ts  ${ts} 을 못 찾았다`);
    continue;
  }
  for (const v of a) {
    if (!b.has(v)) enumDrift.push(`src/lib/types.ts  ${ts} 에 「${v}」 이 없다 (DB 에는 있다)`);
  }
  for (const v of b) {
    if (!a.has(v)) enumDrift.push(`supabase/migrations  ${sql} 에 「${v}」 이 없다 (타입에는 있다)`);
  }
}
ok(
  "DB 열거형과 TS 유니온이 같다",
  enumDrift,
  `${ENUM_PAIRS.length}쌍`,
);

// ---------------------------------------------------------------------------
console.log("\n스트리밍 — loading.tsx 를 두지 않는다");
// ---------------------------------------------------------------------------
/*
 * 디자인 문서가 `app/(app)/loading.tsx` 를 넣자고 했고, 넣어서 재 봤다.
 * playwright 를 javaScriptEnabled: false 로 띄우고 홈을 열면 본문이 이렇게
 * 끝난다.
 *
 *   … 시연용 가상 데이터 | 자세히 | **화면을 불러오는 중입니다**
 *
 * 「지금 손대야 하는 일」도 인사말도 오지 않는다. React 스트리밍은 늦게 온
 * 조각을 문서 끝의 숨은 자리에 붙여 두고 **인라인 스크립트로 옮겨 넣는데**,
 * 스크립트가 없으면 그 일이 일어나지 않기 때문이다.
 *
 * 이 앱은 스크립트 없이 전부 동작하는 것을 전제로 만들었고 그 전제를
 * tests/browser.test.mjs 가 지킨다. loading.tsx 가 메우려던 자리는 이미
 * shell/nav-placeholder.tsx 가 메우고 있다(스크립트가 있을 때의 화면 전환).
 * 얻을 것이 없고 잃을 것이 전제다.
 */
const loadingFiles = files
  .filter((f) => /(^|\/)loading\.tsx$/.test(f))
  .map((f) => relative(ROOT, f));
ok("loading.tsx 가 없다", loadingFiles);

// ---------------------------------------------------------------------------
console.log("\n지운 토큰이 되살아나지 않았는가");
// ---------------------------------------------------------------------------
/*
 * 이름이 남아 있으면 반드시 다시 쓰인다. 지운 것들이 어딘가에서 다시
 * 튀어나오면 여기서 잡는다.
 */
const GONE = [
  ["text-h4", "본문(17px)과 같은 값이라 제목 위계를 무너뜨렸다"],
  ["text-body-lg", "text-h3 와 같은 값이었다"],
  ["rounded-md", "6px 둥근 상자 58개가 「AI 가 만든 박스」라는 말을 들었다"],
  ["rounded-lg", "같은 이유"],
  ["rounded-xl", "같은 이유"],
  ["border-gray-10", "선 굵기 축이 없던 시절의 유일한 테두리(1.18:1)"],
];
const revived = [];
for (const { path, code } of tsxFiles) {
  code.split("\n").forEach((line, i) => {
    for (const [name, why] of GONE) {
      if (new RegExp(`\\b${name}\\b`).test(line)) {
        revived.push(`${path}:${i + 1}  ${name} — ${why}`);
      }
    }
  });
}
ok("지운 토큰이 되살아나지 않았다", revived, `${GONE.length}개 감시`);

// ---------------------------------------------------------------------------
console.log("\n선 색을 불투명도로 만들지 않았는가");
// ---------------------------------------------------------------------------
/*
 * DESIGN.md §3 은 선 굵기 네 단을 **「이 시스템의 주력 위계 축」**이라 부른다
 * (hair / frame / head / alarm). 그런데 그 축을 비켜 가며 `border-info/25`
 * 처럼 불투명도로 선 색을 만드는 자리가 **9개 파일 16곳**에 있었고, 알파값이
 * 다섯 가지였다 — /20 /25 /30 /40 /60.
 *
 *   notice.tsx 한 파일 안에서만  info/25 · warning/30 · danger/25 ·
 *                                success/25 · accent/30
 *
 * **어느 것이 25이고 어느 것이 30인지에 답이 없으면 그건 규칙이 아니다.**
 * DESIGN.md §1 이 진단한 「고르게 무난해서 AI 같다」가 이런 모양으로 돌아온다.
 *
 * 색은 남긴다 — 알림 판의 테두리가 자기 갈래 색이면 뜻이 한 겹 더 실린다.
 * 통일하는 것은 **알파 하나**뿐이다.
 *
 * 이 시험이 없으면 다음 사람이 `/25` 를 하나 더 만들고, 그때는 아무도 모른다.
 */
const ALPHA_OK = "30";
const alphaOff = [];
for (const { path, code } of tsxFiles) {
  code.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/border(?:-[a-z]+)?-[a-z][a-z0-9-]*\/(\d+)/g)) {
      if (m[1] !== ALPHA_OK) {
        alphaOff.push(`${path}:${i + 1}  ${m[0]} — 알파는 /${ALPHA_OK} 하나만 쓴다`);
      }
    }
  });
}
ok("선 색의 불투명도가 한 값이다", alphaOff, `/${ALPHA_OK}`);

// ---------------------------------------------------------------------------
console.log("\ngray-50 을 글자로 쓰지 않았는가");
// ---------------------------------------------------------------------------
/*
 * gray-50 이 글자로 설 수 있는 바탕은 이 앱에 **없다시피 하다.**
 *
 *     흰 종이 gray-0   4.51   기준선 위 0.01 — 여백이 아니라 운이다
 *     판     surface   4.32   미달
 *     바탕   gray-5    3.99   미달
 *
 * 그런데 네 곳에서 글자로 쓰이고 있었고(로그인의 출처 문단·편집기 두 곳),
 * `tests/contrast.test.mjs` 는 gray-50 을 **테두리로만** 재고 있어서 아무도
 * 몰랐다. 지금은 그 시험이 gray-60 을 세 층에서 재고, 여기서는 gray-50 이
 * 글자로 돌아오지 못하게 막는다.
 *
 * 예외는 `disabled:` 하나로 남긴다 — 다만 그 예외의 근거는 아래에서 바뀌었다.
 * 꺼진 조작기의 **글자색**은 여전히 골라 쓸 수 있지만, 「누를 수 없다」를
 * **투명도**로 말하는 것은 더 이상 안 된다(바로 다음 검사).
 */
const grayText = [];
for (const { path, code } of tsxFiles) {
  code.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/(^|[^:\w-])(text-gray-50)\b/g)) {
      const before = line.slice(0, m.index + m[1].length);
      if (/disabled:$/.test(before)) continue;
      grayText.push(
        `${path}:${i + 1}  text-gray-50 — 글자로는 4.5:1 을 못 넘는다(gray-60 을 쓴다)`,
      );
    }
  });
}
ok("text-gray-50 은 disabled 뒤에서만 쓰인다", grayText);

// ---------------------------------------------------------------------------
console.log("\n「누를 수 없다」를 투명도로 말하지 않았는가");
// ---------------------------------------------------------------------------
/*
 * `disabled:opacity-50` 은 두 가지를 한꺼번에 틀리게 한다.
 *
 * ① **색 언어가 거짓말을 한다.** 이 앱의 파랑은 갈래가 하나다 — 「누를 수 있는
 *    것 · 지금 여기」(globals.css 의 4갈래). 투명도는 색을 **약하게** 만들 뿐
 *    **다른 뜻으로** 바꾸지 못하므로, 옅어진 파랑은 여전히 「눌린다」고 말한다.
 * ② **글자가 같이 흐려진다.** 흰 글자를 판 위에서 절반 섞으면 실측 2.78:1,
 *    잠긴 카드의 제목(gray-90, opacity-60)은 4.29:1 로 본문 기준 미달이었다.
 *    고를 수 없다는 것과 읽을 수 없다는 것은 다른 말이다.
 *
 * 그래서 투명도가 아니라 **색을 바꾼다**(ui/button.tsx 는 회색 채움 7.07:1,
 * work-card.tsx 의 잠긴 카드는 바탕색으로 물러난다).
 *
 * 여기서 막는 것은 **변형(variant) 뒤에 붙은 투명도**뿐이다. `has-[…]:opacity-55`
 * 처럼 「이동 중」을 말하는 잠깐의 흐림은 상태가 아니라 사건이라 그대로 둔다.
 */
const offByOpacity = [];
for (const { path, code } of tsxFiles) {
  code.split("\n").forEach((line, i) => {
    const t = line.trimStart();
    if (t.startsWith("*") || t.startsWith("//")) return;
    for (const m of line.matchAll(/(?:aria-)?disabled:opacity-\d+/g)) {
      offByOpacity.push(
        `${path}:${i + 1}  ${m[0]} — 「못 누른다」는 투명도가 아니라 색으로 말한다`,
      );
    }
  });
}
ok("disabled 를 투명도로 표현하지 않는다", offByOpacity);

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
if (fails.length > 0) process.exit(1);
