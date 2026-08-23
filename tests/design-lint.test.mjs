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

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
if (fails.length > 0) process.exit(1);
