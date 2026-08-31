/**
 * 인계서 초안의 두 가지 증명 — **말이 아니라 돌려서 보이는 것.**
 *
 * ── 왜 이 파일이 따로인가 ──────────────────────────────────────────────────
 *
 * 우리가 이 제품에 대해 하는 주장 중 둘은 성격이 다르다. 나머지는 화면을
 * 띄워 보이면 되지만 이 둘은 **화면으로는 안 보인다.**
 *
 *   ① *"같은 기록에서 뽑으면 늘 같은 문서가 나옵니다."*
 *   ② *"인계서를 만드는 동안 바깥 AI 서비스를 한 번도 부르지 않습니다."*
 *
 * 둘 다 「안 일어나는 일」에 대한 주장이라, 시연으로는 보여 줄 수가 없다.
 * 한 번 돌려서 잘 나오는 것은 늘 그렇다는 증거가 아니고, 네트워크를 끊고
 * 돌려 보이는 것도 **그 순간 안 불렀다**는 것까지만 말한다.
 *
 * 그래서 검사로 바꾼다. 규칙 코드가 닿는 파일을 전부 훑어 바깥으로 나가는
 * 길이 있는지 보고, 초안을 세 번 뽑아 sha256 을 맞춘다. 내일 누가 LLM 호출을
 * 한 줄 넣으면 **이 파일이 빨간불이 된다.** 그게 발표에서 할 수 있는 유일하게
 * 정직한 말이다 — "안 부릅니다"가 아니라 "부르면 빌드가 깨집니다".
 *
 * 심사장에서는 이 명령 하나가 곧 시연이다:
 *   npm run test:proof
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

/**
 * ⚠ **앱 코드를 여기서 부르지 않는다.**
 *
 * 처음에는 이 자리에 `await import("@/lib/handover-draft.ts")` 가 있었다.
 * 그래서 초안 경로에 없는 패키지를 하나 넣어 보니 — 즉 이 검사가 잡으라고
 * 만들어진 바로 그 일을 저질러 보니 — 노드가 그 import 에서 그냥 죽었고,
 * **정적 검사는 한 줄도 안 돌았다.** 지켜야 할 것이 지키는 코드보다 앞에
 * 있었던 것이다. 실패는 했으니 빨간불이긴 한데, 화면에 남는 말이
 * "ERR_MODULE_NOT_FOUND" 뿐이라 무엇이 왜 잘못됐는지는 아무도 모른다.
 *
 * 그래서 파일을 읽어서 하는 검사(아래 [1]~[3])를 먼저 다 돌리고, 앱을 실제로
 * 부르는 것은 맨 끝([4])에서 한다. 순서가 곧 이 파일의 설계다.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

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

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// ---------------------------------------------------------------------------
console.log("\n[1] 초안이 닿는 코드 — 바깥으로 나가는 길이 있는가");
// ---------------------------------------------------------------------------

/** `@/…` 와 상대경로를 실제 파일로. tests/alias-hook.mjs 와 같은 규칙이다. */
const isFile = (p) => existsSync(p) && statSync(p).isFile();
function withExtension(p) {
  if (isFile(p)) return p;
  for (const e of [".ts", ".tsx", ".mjs", ".js"]) if (isFile(p + e)) return p + e;
  for (const e of [".ts", ".tsx", ".mjs", ".js"]) {
    const i = path.join(p, `index${e}`);
    if (isFile(i)) return i;
  }
  return null;
}

/**
 * 초안을 만드는 데 실제로 불려 가는 파일과 바깥 패키지를 모은다.
 *
 * 정규식으로 import 를 읽는다. 번들러를 붙이면 정확해지지만 의존성이 하나
 * 늘고, 이 검사가 지키려는 것이 바로 「의존성이 조용히 느는 것」이다.
 * 주석 안의 import 글자까지 세는 쪽으로 틀리므로 **넓게 세는 쪽**이고,
 * 넓게 세다 틀리면 없는 것을 있다고 말한다 — 안전한 방향이다.
 */
function importGraph(...entries) {
  const files = new Set();
  const externals = new Map();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop();
    if (files.has(file)) continue;
    files.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      let target = null;
      if (spec.startsWith("@/")) target = withExtension(path.join(SRC, spec.slice(2)));
      else if (spec.startsWith("."))
        target = withExtension(path.resolve(path.dirname(file), spec));
      else {
        externals.set(spec, (externals.get(spec) ?? 0) + 1);
        continue;
      }
      // 못 찾은 경로를 조용히 넘기면 그 아래 가지가 통째로 검사 밖에 남는다.
      if (target) stack.push(target);
      else externals.set(`(못 찾음) ${spec}`, 1);
    }
  }
  return { files: [...files].sort(), externals };
}

/**
 * 뿌리가 셋이다 — 초안을 **짓는** 자리, **파일로 옮기는** 자리, 그리고 그 파일을
 * 사람에게 **내려주는** 자리.
 *
 * 오랫동안 뿌리는 `handover-draft.ts` 하나였다. 그때는 인계서가 나가는 길이
 * 화면과 인쇄뿐이었고 둘 다 그 파일에서 나왔기 때문이다. 지금은 한/글 파일이
 * 하나 더 있고, **결재로 올라가는 물건은 그쪽**이다. 그 길만 검사 밖에 있으면
 * 「어떤 모델도 부르지 않는다」는 주장이 정작 제출물에 대해서는 안 세워진다.
 *
 * 라우트까지 넣는다. `handover-export.ts` 만 넣으면 **파일을 내려주는 함수
 * 자체**가 그래프 밖에 남고, 거기 `fetch()` 한 줄을 더해도 이 시험은 초록으로
 * 남는다 — 그 한 줄이 정확히 「결재로 올라가는 물건」을 만지는 자리다.
 */
const graph = importGraph(
  path.join(SRC, "lib/handover-draft.ts"),
  path.join(SRC, "lib/handover-export.ts"),
  path.join(SRC, "app/(app)/handover/export/hwpx/route.ts"),
);
const rel = (f) => path.relative(ROOT, f);

/**
 * 초안이 기대도 되는 바깥 패키지 — **허용 목록이다.**
 *
 * 금지 목록이 아니라 허용 목록인 것이 이 검사의 전부다. 「AI SDK 를 쓰지
 * 않는다」를 금지 목록으로 적으면 우리가 아는 이름만 막고, 내일 나오는
 * 이름은 못 막는다. 허용 목록이면 **무엇이 늘든 사람이 한 번 보게 된다.**
 *
 * 지금 여기 있는 것 중 바깥과 통신하는 것은 `@supabase/ssr` 하나이고,
 * 그것이 부르는 곳은 우리 데이터베이스다. 나머지 넷은 통신을 모른다.
 */
const ALLOWED = new Set([
  "@supabase/ssr", // 우리 DB. 이 목록에서 유일하게 통신하는 것
  "next/headers", // 쿠키(데모 상태). 서버 안에서 끝난다
  "react", // 타입과 cache()
  "server-only", // 이 파일이 브라우저로 새는 것을 막는 표시
  "zod", // 폼 값 검증. 순수 함수
  // 아래 셋은 내보내기 경로를 그래프에 넣으면서 늘었다. 허용 목록이 하는 일이
  // 정확히 이것이다 — 늘 때마다 사람이 한 번 보고 이유를 적는다.
  //
  // 한/글 파일의 ZIP 압축(DEFLATE). 노드에 딸린 것이고 통신을 모른다.
  "node:zlib",
  // 라우트 핸들러의 요청·응답 타입과 리다이렉트. 프레임워크 안에서 끝난다.
  "next/server",
  // requireViewer 가 로그인 화면으로 보낼 때 쓴다. 서버 안에서 끝난다.
  "next/navigation",
]);

console.log(`\n  초안이 닿는 우리 파일 ${graph.files.length}개`);
console.log(`  기대는 바깥 패키지 ${graph.externals.size}개 — ${[...graph.externals.keys()].sort().join(", ")}\n`);

const unexpected = [...graph.externals.keys()].filter((p) => !ALLOWED.has(p));
ok(
  "허용 목록에 없는 바깥 패키지가 없다",
  unexpected.length === 0,
  unexpected.join(", "),
);
// 허용 목록이 실제로 무언가를 막고 있는지 함께 본다. 그래프가 비면 위 항목은
// 늘 통과하고, 그때 이 파일은 아무것도 안 지키면서 지키는 척한다.
ok(
  "그래프가 실제로 코드를 훑었다",
  graph.files.length >= 10 && graph.externals.size > 0,
  `파일 ${graph.files.length}개 · 패키지 ${graph.externals.size}개`,
);
ok(
  "초안 본체가 그래프 안에 있다",
  graph.files.some((f) => f.endsWith("lib/handover-draft.ts")) &&
    graph.files.some((f) => f.endsWith("lib/handover-cues.ts")),
);
ok(
  "결재로 올라가는 파일을 짓고 내려주는 자리도 그래프 안에 있다",
  graph.files.some((f) => f.endsWith("lib/handover-export.ts")) &&
    graph.files.some((f) => f.endsWith("lib/hwpx/pack.ts")) &&
    graph.files.some((f) => f.endsWith("handover/export/hwpx/route.ts")),
);

// ---------------------------------------------------------------------------
console.log("\n[2] 그 코드 안에 바깥을 부르는 자리가 없다");
// ---------------------------------------------------------------------------

/**
 * 우리 파일 안에서 바깥으로 나가는 **원시 수단**을 찾는다.
 *
 * 패키지 목록만 보면 `fetch("https://…")` 한 줄을 못 잡는다. 그건 아무것도
 * import 하지 않고 나가는 길이고, LLM 을 붙이는 가장 짧은 방법이기도 하다.
 */
const OUTBOUND = [
  ["fetch(", /(?<![.\w])fetch\s*\(/],
  ["XMLHttpRequest", /XMLHttpRequest/],
  ["WebSocket", /(?<![.\w])WebSocket\s*\(/],
  ["sendBeacon", /sendBeacon/],
  ["node:http", /["']node:https?["']|require\(["']https?["']\)/],
  ["child_process", /child_process/],
  // 코드 안에 박힌 주소. 주석 속 참고 링크까지 걸리므로 **코드 줄만** 본다.
  ["박힌 주소", /https?:\/\/[a-zA-Z]/],
];

/**
 * XML 이름공간은 **주소가 아니라 이름이다.**
 *
 * 한/글 파일을 짓는 코드(hwpx/pack.ts)는 `xmlns:hp="http://www.hancom.co.kr/…"`
 * 를 문자열로 들고 있다. 규격이 정한 식별자라 한 글자도 바꿀 수 없고, 아무도
 * 그 주소로 나가지 않는다 — 브라우저도 한/글도 그것을 가지러 가지 않는다.
 *
 * 그래서 `xmlns…="…"` 안의 값만 지우고 나머지 줄을 그대로 검사한다. 줄을
 * 통째로 빼지 않는 것이 중요하다 — 같은 줄에 `fetch(` 가 붙는 날 그것은
 * 여전히 걸려야 한다.
 */
const stripXmlns = (line) => line.replace(/xmlns(:[\w-]+)?="[^"]*"/g, "");

const offenders = [];
for (const file of graph.files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // 주석 줄은 뺀다. 이 저장소는 주석에 법령·문서 주소를 적어 두는 곳이라
    // 그것까지 세면 검사가 늘 빨간불이고, 늘 빨간불인 검사는 곧 꺼진다.
    const code = stripXmlns(line.replace(/^\s*(\/\/|\*|\/\*).*$/, ""));
    for (const [name, re] of OUTBOUND) {
      if (re.test(code)) offenders.push(`${rel(file)}:${i + 1} ${name}`);
    }
  });
}
ok(
  "초안이 닿는 우리 파일에 바깥을 부르는 자리가 없다",
  offenders.length === 0,
  offenders.slice(0, 5).join(" / "),
);
// 이름공간을 빼는 손질이 검사를 멀게 만들지 않았는지 — 아는 답을 먹여 본다.
// 이런 대조가 없으면 「빼기」는 조용히 넓어지고, 넓어진 줄 아무도 모른다.
ok(
  "이름공간을 빼도 같은 줄의 진짜 호출은 그대로 걸린다",
  OUTBOUND.some(([, re]) =>
    re.test(
      stripXmlns(
        `const x = \`<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">\`; fetch("http://evil.example");`,
      ),
    ),
  ),
);
ok(
  "이름공간만 있는 줄은 안 걸린다",
  !OUTBOUND.some(([, re]) =>
    re.test(stripXmlns(`\`<hs:sec xmlns:hs="http://www.hancom.co.kr/x">\``)),
  ),
);

// ---------------------------------------------------------------------------
console.log("\n[3] 애초에 붙어 있지 않다 — 의존성 목록");
// ---------------------------------------------------------------------------

/**
 * 이름으로 알아보는 AI 클라이언트들.
 *
 * 여기는 **금지 목록**이다. 위 [1]이 허용 목록으로 이미 다 막고 있고, 이 항목은
 * 다른 일을 한다 — 초안 경로 밖(예: 화면 어딘가)에 조용히 들어온 것을 잡는다.
 * 「우리 제품에 LLM 이 한 줄도 없습니다」는 초안 한 곳만의 이야기가 아니라
 * 제품 전체의 이야기로 발표에서 말하기 때문이다.
 */
const AI_PACKAGES =
  /anthropic|openai|langchain|llamaindex|ollama|huggingface|cohere|mistral|replicate|generative-ai|@google\/genai|groq|together-ai|^ai$|^@ai-sdk\//;

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const allDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
];
const aiDeps = allDeps.filter((d) => AI_PACKAGES.test(d));
ok(
  "package.json 에 AI 클라이언트가 하나도 없다",
  aiDeps.length === 0,
  aiDeps.join(", "),
);
// 목록이 비어 있어서 통과한 것이 아님을 함께 못박는다.
ok("의존성 목록을 실제로 읽었다", allDeps.length > 5, `${allDeps.length}개`);
ok(
  "이 검사가 진짜 이름을 알아본다",
  AI_PACKAGES.test("@anthropic-ai/sdk") &&
    AI_PACKAGES.test("openai") &&
    AI_PACKAGES.test("ai") &&
    !AI_PACKAGES.test("zod") &&
    !AI_PACKAGES.test("@supabase/ssr"),
);

// ---------------------------------------------------------------------------
console.log("\n[4] 결정성 — 같은 기록에서 뽑으면 늘 같은 문서");
// ---------------------------------------------------------------------------

// **매번 자료부터 다시 읽는다.** 같은 draft 객체를 세 번 문자열로 만드는 것은
// 아무것도 증명하지 않는다. 순서가 갈리는 자리(Map 순회·동시각 정렬)는 자료를
// 다시 읽을 때 드러난다.
// 여기서 처음으로 앱을 부른다. 위의 세 절은 이 줄이 실패해도 이미 다 돌았다.
const { buildHandoverDraft, draftParagraphText } = await import(
  "@/lib/handover-draft.ts"
);
const mock = await import("@/lib/data/mock.ts");
const { profiles } = await import("@/lib/mock/org.ts");

const from = profiles.find((p) => p.name === "박준호");
const runs = [];
for (let i = 0; i < 3; i += 1) {
  const view = await mock.getHandoverFor(from);
  if (!view) {
    console.log("목업에 인계 건이 없다. 증명할 것이 없으므로 여기서 멈춘다.");
    process.exit(1);
  }
  const draft = await buildHandoverDraft(view);
  const paper = draft.blocks
    .map((b) => `${b.heading}\n${b.paragraphs.map(draftParagraphText).join("\n\n")}`)
    .join("\n\n");
  runs.push({ paper, whole: JSON.stringify(draft) });
}

// 심사장에서 이 세 줄이 곧 시연이다. 눈으로 맞춰 볼 수 있게 찍는다.
console.log(`\n  초안을 세 번 뽑았습니다 (${runs[0].paper.length.toLocaleString()}자)`);
runs.forEach((r, i) => console.log(`    ${i + 1}회  sha256 ${sha(r.paper)}`));
console.log("");

ok(
  "세 번 뽑은 종이의 sha256 이 같다",
  new Set(runs.map((r) => sha(r.paper))).size === 1,
  runs.map((r) => sha(r.paper).slice(0, 12)).join(" / "),
);
// 종이만 같고 화면이 다르면, 눌러서 가는 자리가 뽑을 때마다 달라진다는 뜻이다.
// 근거 링크는 이 제품이 「확인할 수 있다」고 말하는 근거 자체라 함께 못박는다.
ok(
  "근거 링크와 미포착까지 넣은 전체가 같다",
  new Set(runs.map((r) => sha(r.whole))).size === 1,
  runs.map((r) => sha(r.whole).slice(0, 12)).join(" / "),
);
// 빈 문서 셋이 서로 같은 것은 증명이 아니다. 실제로 글이 들어 있어야 한다.
ok("뽑은 문서에 실제로 글이 들어 있다", runs[0].paper.length > 1000, `${runs[0].paper.length}자`);

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
