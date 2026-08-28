/**
 * 서식 편집기 — 브라우저 시험.
 *
 * ⚠ **이 시험이 증명하지 않는 것부터 적는다.**
 *
 *   · 한글 IME. 이 컨테이너에는 한글 입력기가 없고, Playwright 의 `type()` 은
 *     조합 과정을 **거치지 않고** 글자를 바로 넣는다. 즉 이 편집기가 가장
 *     조심해서 만든 부분(compositionstart~end 사이에 DOM 을 건드리지 않기)은
 *     여기서 한 번도 실행되지 않는다. 그 길은 **사람이 Windows 한/글 IME 로
 *     직접 쳐 봐야** 확인된다. (한/글로 열어 보기 전까지 pack.ts 머리말에 붙어
 *     있던 것과 같은 종류의 미검증이다. **그 쪽은 걷어냈고 이 쪽은 남아 있다.**)
 *   · 동시 편집. 브라우저 두 대를 실제 Supabase broadcast 로 붙여 본 것이 아니다.
 *     연산이 합쳐지는지는 tests/editor-crdt.test.mjs 가 3만 회 무작위로 확인하고,
 *     그것이 신호로 오갈 때의 문제(유실·재전송·재접속)는 여기서도 저기서도 안 본다.
 *   · 한/글·워드가 파일을 여는지. ZIP 이 규격대로인지까지만 본다.
 *
 * 그래서 여기서 보는 것은 그 앞 단계다 — **화면이 서고, 자판이 먹고, 스크립트를
 * 끄면 폼이 남고, 내려받기가 파일을 준다.** 이 넷 중 하나라도 깨지면 나머지는
 * 볼 것도 없다.
 *
 * 돌리는 법 (playwright 는 이 저장소의 의존성이 아니다 — browser.test.mjs 와 같다)
 *   npm i -D playwright && npx playwright install chromium
 *   npm run build && npm start &
 *   npm run test:editor
 *
 * 주소·업무·계정은 환경변수로 바꿀 수 있다.
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    [
      "playwright 가 없습니다. 이 시험은 브라우저가 있어야 돌아갑니다.",
      "",
      "  npm i -D playwright && npx playwright install chromium",
      "",
      "일부러 저장소 의존성에 넣지 않았습니다 — 배포에 나갈 것이 아니고,",
      "설치가 수백 MB라 매번 받게 할 이유가 없기 때문입니다.",
    ].join("\n"),
  );
  process.exit(2);
}

const BASE = process.env.BASE ?? "http://127.0.0.1:3210";
/** 목업에서 서식 문서가 달린 업무(mock/works.ts 의 pilotPlanDoc). */
const WORK = process.env.WORK ?? "f0000000-0000-4000-8000-000000000024";
/** 이하람 주무관 — 그 업무의 편집 참여자다. */
const VIEWER = process.env.VIEWER ?? "70000000-0000-4000-8000-000000000003";

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

const browser = await chromium.launch();

/**
 * 편집기가 붙기를 기다린다.
 *
 * 시간을 정해 놓고 기다리면 안 된다. 편집기 조각은 supabase-realtime 을 딸고
 * 와서 무거운데(그래서 늦게 불러온다 — rich-doc-surface.tsx), 이 컨테이너에서
 * 실측 1.5~3초로 들쭉날쭉했다. 1.5초를 박아 두었다가 「편집기가 아예 안 뜬다」로
 * 오진할 뻔했다. 기다리는 것은 시간이 아니라 **그 요소**여야 한다.
 */
async function waitForEditor(page) {
  await page.waitForSelector("[data-ilm-root]", { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  // 붙은 직후 한 프레임은 커서·이름표 자리를 아직 재지 않았다.
  await page.waitForTimeout(300);
}

/** 데모 세션 쿠키 하나면 로그인이 끝난다(lib/demo-cookie.ts). */
async function open(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1760, height: 1050 },
    locale: "ko-KR",
    ...opts,
  });
  await ctx.addCookies([{ name: "ilmeori.demo", value: VIEWER, url: BASE }]);
  return ctx;
}

// ===========================================================================
console.log("\n[1] 편집기가 선다");
// ===========================================================================
{
  const ctx = await open();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`${BASE}/works/${WORK}/doc`, { waitUntil: "domcontentloaded" });
  await waitForEditor(page);

  const seen = await page.evaluate(() => ({
    sheetWidth: Math.round(
      document.querySelector(".ilm-sheet")?.getBoundingClientRect().width ?? 0,
    ),
    blocks: document.querySelectorAll("[data-ilm-block]").length,
    buttons: document.querySelectorAll(".ilm-tbtn").length,
    outline: document.querySelectorAll(".ilm-outline-item").length,
    tables: document.querySelectorAll(".ilm-table").length,
  }));

  // 종이 폭이 794 가 아니면 화면과 인쇄물이 다른 문서가 된다. flex 항목의
  // 기본 shrink 때문에 실제로 한 번 줄어든 적이 있다(editor.css 의 flex: none).
  ok("종이가 A4 폭(794px)을 지킨다", seen.sheetWidth === 794, `${seen.sheetWidth}px`);
  ok("문단이 그려졌다", seen.blocks > 10, `${seen.blocks}개`);
  ok("도구모음이 있다", seen.buttons >= 24, `${seen.buttons}개`);
  ok("개요에 차례가 잡혔다", seen.outline >= 3, `${seen.outline}개`);
  ok("표가 진짜 <table> 로 그려졌다", seen.tables >= 1);
  ok("콘솔 오류가 없다", errors.length === 0, errors.slice(0, 3).join(" | "));

  await ctx.close();
}

// ===========================================================================
console.log("\n[2] 자판이 먹는다");
// ===========================================================================
{
  const ctx = await open();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/works/${WORK}/doc`, { waitUntil: "domcontentloaded" });
  await waitForEditor(page);

  const body = await page.$('[data-ilm-block][data-ilm-kind="body"]');
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type("자동 시험이 넣은 문장");
  await page.waitForTimeout(300);

  // 방금 친 글자 일부를 골라 굵게. 화면에 <strong> 이 서면 CRDT → 모델 →
  // DOM 이 한 바퀴 다 돈 것이다.
  await page.keyboard.down("Shift");
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await page.keyboard.press("Control+b");
  await page.waitForTimeout(400);

  const typed = await page.evaluate(() => {
    const el = document.querySelector('[data-ilm-block][data-ilm-kind="body"]');
    return { text: el?.textContent ?? "", html: el?.innerHTML ?? "" };
  });
  ok("글자가 들어간다", typed.text.includes("자동 시험이 넣은 문장"));
  ok("Ctrl+B 가 굵게를 건다", /<strong>/.test(typed.html), typed.html.slice(-80));

  // 「- 」 규칙
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 글머리표 규칙");
  await page.waitForTimeout(400);
  const ruled = await page.evaluate(() => {
    const hit = [...document.querySelectorAll("[data-ilm-block]")].find((e) =>
      e.textContent.includes("글머리표 규칙"),
    );
    return { kind: hit?.dataset.ilmKind, text: hit?.textContent };
  });
  // 부호는 편집칸 **밖**에 있어야 한다. 안에 남으면 지울 수 있게 되고,
  // 지워진 「-」가 본문 글자가 된다.
  ok("「- 」을 치면 글머리표가 된다", ruled.kind === "bullet", `갈래=${ruled.kind}`);
  ok("부호가 본문 글자로 남지 않는다", !ruled.text?.startsWith("-"), ruled.text);

  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  const indent = await page.evaluate(() => {
    const hit = [...document.querySelectorAll("[data-ilm-block]")].find((e) =>
      e.textContent.includes("글머리표 규칙"),
    );
    return hit?.closest(".ilm-shell")?.style.paddingInlineStart;
  });
  ok("Tab 이 한 단 들여쓴다", indent === "22px", `padding=${indent}`);

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  const undone = await page.evaluate(() =>
    document.body.textContent.includes("글머리표 규칙"),
  );
  ok("Ctrl+Z 가 되돌린다", !undone);

  // 표 안에서는 Tab 이 들여쓰기가 아니라 다음 칸이다.
  const cell = await page.$('[data-ilm-cell="1"]');
  await cell.click();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(250);
  const stillInCell = await page.evaluate(
    () => document.activeElement?.dataset.ilmCell === "1",
  );
  ok("표에서 Tab 이 다음 칸으로 간다", stillInCell);

  await ctx.close();
}

// ===========================================================================
console.log("\n[3] 스크립트를 끄면 폼이 남는다");
// ===========================================================================
//
// 이 제품의 화면은 스크립트 없이 전부 돈다(tests/browser.test.mjs 가 지킨다).
// 서식 편집기는 원리상 그럴 수 없으므로 **덧붙이는 층**으로 만들었다.
// 여기서 확인하는 것은 그 아래에 무엇이 남는가다 — 「자바스크립트를 켜 주세요」
// 한 줄이 남으면 이 제품의 문서가 통째로 사라지는 것과 같다.
{
  const ctx = await open({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/works/${WORK}/doc`, { waitUntil: "domcontentloaded" });

  const seen = await page.evaluate(() => ({
    forms: document.querySelectorAll("form").length,
    textareas: document.querySelectorAll("textarea").length,
    selects: document.querySelectorAll("select").length,
    notice: document.body.textContent.includes("간단 편집 화면"),
    editor: !!document.querySelector("[data-ilm-root]"),
    content: document.body.textContent.includes("음식물류폐기물"),
  }));

  ok("문단 편집 폼이 서버 HTML 에 있다", seen.forms > 5, `form ${seen.forms}개`);
  ok("갈래를 바꿀 수 있다", seen.selects > 0, `select ${seen.selects}개`);
  ok("무엇이 안 되는지 먼저 말한다", seen.notice);
  ok("문서 내용이 그대로 보인다", seen.content);
  ok("서식 편집기는 뜨지 않는다", !seen.editor);

  await ctx.close();
}

// ===========================================================================
console.log("\n[4] 내려받기가 파일을 준다");
// ===========================================================================
{
  const ctx = await open();
  for (const ext of ["hwpx", "docx"]) {
    const res = await ctx.request.get(`${BASE}/works/${WORK}/doc/export/${ext}`);
    const body = await res.body();
    const head = body.slice(0, 2).toString("latin1");
    const disposition = res.headers()["content-disposition"] ?? "";
    ok(
      `${ext} 가 200 이고 ZIP 이다`,
      res.status() === 200 && head === "PK",
      `status=${res.status()} head=${head} size=${body.length}`,
    );
    // 파일 이름은 한글이다. RFC 5987 의 filename* 이 빠지면 브라우저가
    // 「download.hwpx」 같은 이름으로 받는다.
    ok(`${ext} 이름에 한글 파일명이 실렸다`, disposition.includes("filename*=UTF-8''"));
  }
  await ctx.close();
}

// ===========================================================================
console.log("\n[5] 실시간 배선이 렌더마다 끊기지 않는다 (원본을 읽어 확인한다)");
// ===========================================================================
//
// 이것만은 브라우저로 확인할 방법이 없다. 채널이 매 렌더 다시 맺어져도 화면은
// 똑같이 보이고, 콘솔에도 아무것도 안 뜬다. 그런데 결과는 「타이핑하는 동안
// 실시간이 아예 안 된다」다 — 자판 한 번마다 재접속하기 때문이다.
//
// 실제로 한 번 그렇게 만들었다. use-collab 의 채널 효과가 isComposing 과
// queueWhileComposing 을 의존성으로 들고 있는데, 부르는 쪽에서 인라인 화살표
// 함수로 넘기면 렌더마다 새 함수가 된다. 그래서 **부르는 쪽이 굳혔는지**를
// 원본에서 확인한다. 값싼 감시이고, 이 결함을 잡는 다른 시험이 없다.
{
  const { readFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");

  const editor = await readFile(
    join(root, "src/components/editor/rich-doc-editor.tsx"),
    "utf8",
  );
  const collabCall = editor.slice(
    editor.indexOf("const collab = useCollab({"),
    editor.indexOf("});", editor.indexOf("const collab = useCollab({")),
  );
  ok(
    "useCollab 에 인라인 함수를 넘기지 않는다",
    collabCall.length > 0 && !/=>/.test(collabCall),
    collabCall.replace(/\s+/g, " ").slice(0, 120),
  );
  ok(
    "isComposing 을 useCallback 으로 굳혔다",
    /const isComposing = useCallback\(/.test(editor),
  );
  ok(
    "queueWhileComposing 을 useCallback 으로 굳혔다",
    /const queueWhileComposing = useCallback\(/.test(editor),
  );
  ok(
    "선택 영역 리스너가 collab 객체 전체에 의존하지 않는다",
    !/}, \[collab, engine\]\);/.test(editor),
  );

  const collab = await readFile(
    join(root, "src/components/editor/use-collab.ts"),
    "utf8",
  );
  // 채널 효과의 의존성 목록만 잘라 낸다. 여기에 매 렌더 새로 만들어지는 것이
  // 들어오면 같은 사고다 — 상태(peers·link)나 인라인 함수가 대표적이다.
  const marker = "\n  }, [";
  const from = collab.lastIndexOf(marker);
  const deps = collab.slice(from + marker.length, collab.indexOf("]);", from));
  const names = deps
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const STABLE = [
    "documentId",
    "enabled",
    "engine",
    "flushOps",
    "isComposing",
    "queueWhileComposing",
    "send",
    "site",
    "viewerId",
    "viewerName",
  ];
  const unexpected = names.filter((n) => !STABLE.includes(n));
  ok(
    "채널 효과의 의존성이 전부 굳은 값이다",
    unexpected.length === 0,
    // 새 의존성이 늘었다고 무조건 틀린 것은 아니다. 다만 **굳은 값인지**를
    // 사람이 한 번 보고 이 목록에 더해야 한다는 뜻이다.
    `목록에 없는 것: ${unexpected.join(", ")} — 굳은 값이면 STABLE 에 더하라`,
  );
}

await browser.close();

console.log(
  fails.length === 0
    ? `\n전부 통과 — ${pass}건`
    : `\n실패 — ${pass}건 통과, ${fails.length}건 실패`,
);
for (const f of fails) console.log(`  · ${f}`);
console.log(
  "\n⚠ 한글 IME 조합과 실제 두 대 동시 편집은 여기서 확인되지 않습니다(머리말 참조).",
);
process.exit(fails.length ? 1 : 0);
