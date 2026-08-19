/**
 * 서식 편집기 — **실물 왕복** 시험.
 *
 * 다른 시험들이 못 하는 두 가지를 여기서만 한다.
 *
 *   ① 저장이 실제로 DB 에 남는가 (자동 저장 → 새로고침 → 그대로 있는가)
 *   ② 창 두 개가 **진짜 Supabase broadcast 로** 서로의 글자를 받는가
 *
 * 지금까지 이 둘은 「부품은 다 시험했지만 이어 붙인 적은 없다」였다.
 * CRDT 는 3만 회 무작위로 합쳐 봤고(editor-crdt), 저장 상태기계는 따로 봤고
 * (rich-save), 화면은 데모 모드로 봤다(editor-browser). 그런데 그 셋이 한 줄로
 * 이어지는 것은 아무도 본 적이 없었다 — 데모 모드에는 저장할 DB 가 없고
 * 실제 모드에는 서식 문서가 없었기 때문이다.
 *
 * ⚠ **실제 Supabase 프로젝트에 붙는다.** 확인용 업무를 하나 만들었다가 끝나면
 *   지운다(제목이 「[편집기 검증]」으로 시작한다). 시연 데이터는 건드리지 않는다.
 *   도중에 죽어 남은 것이 있으면 다음 실행이 먼저 치운다.
 *   0018_rich_document.sql 이 그 프로젝트에 적용되어 있어야 한다.
 *
 * 돌리는 법
 *   npm i -D playwright && npx playwright install chromium
 *   npm run build && npm start &
 *   npm run test:live
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright 가 없습니다.  npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  (await readFile(join(HERE, "..", ".env.local"), "utf8"))
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PW = env.DEMO_ACCOUNT_PASSWORD;
const BASE = process.env.BASE ?? "http://127.0.0.1:3210";

if (!URL_ || !KEY || !PW) {
  console.error("이 시험은 실제 Supabase 설정이 있어야 돌아갑니다(.env.local).");
  process.exit(2);
}

let pass = 0;
const fails = [];
const ok = (name, cond, note = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (note ? ` — ${note}` : ""));
    console.log(`  ✗ ${name}${note ? ` — ${note}` : ""}`);
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 조건이 될 때까지 기다린다. */
async function until(fn, ms = 12_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await wait(300);
  }
  return false;
}

const MARK = "[편집기 검증]";
const ACCOUNTS = {
  박준호: "70000000-0000-4000-8000-000000000002",
  이하람: "70000000-0000-4000-8000-000000000003",
};

// ---------------------------------------------------------------------------
console.log("\n[준비] 확인용 서식 문서 만들기");
// ---------------------------------------------------------------------------
const owner = createClient(URL_, KEY, { auth: { persistSession: false } });
{
  const { error } = await owner.auth.signInWithPassword({
    email: "demo02@ilmeori.demo",
    password: PW,
  });
  if (error) throw new Error(`박준호 로그인 실패: ${error.message}`);
}
const ownerId = (await owner.auth.getUser()).data.user.id;

async function sweep() {
  const { data } = await owner.from("work").select("id").like("title", `${MARK}%`);
  for (const w of data ?? []) await owner.from("work").delete().eq("id", w.id);
  return (data ?? []).length;
}
const swept = await sweep();
if (swept) console.log(`  이전 실행이 남긴 업무 ${swept}건을 지웠습니다`);

const { data: profile } = await owner
  .from("profile")
  .select("department_id")
  .eq("id", ownerId)
  .single();

const workId = crypto.randomUUID();
const docId = crypto.randomUUID();
const BLOCK = "aaaa000001";

{
  const { error } = await owner.from("work").insert({
    id: workId,
    title: `${MARK} 서식 문서 왕복`,
    description: "자동 시험이 만든 업무입니다. 끝나면 지워집니다.",
    status: "doing",
    visibility: "private",
    department_id: profile.department_id,
    owner_id: ownerId,
    fiscal_year: 2026,
    created_by: ownerId,
  });
  if (error) throw new Error(`업무 만들기 실패: ${error.message}`);
  // 이하람도 편집자로 부른다 — 두 창 시험에 필요하다.
  await owner
    .from("work_member")
    .insert({ work_id: workId, profile_id: ACCOUNTS.이하람, role: "editor" });

  const { error: dErr } = await owner.from("document").insert({
    id: docId,
    work_id: workId,
    title: `${MARK} 문서`,
    created_by: ownerId,
    blocks: {
      v: 1,
      blocks: [
        { id: "aaaa000000", kind: "title", spans: [{ t: `${MARK} 문서` }] },
        { id: BLOCK, kind: "body", spans: [{ t: "처음 글자" }] },
      ],
    },
    blocks_rev: 0,
  });
  if (dErr) throw new Error(`문서 만들기 실패: ${dErr.message}`);
}
console.log(`  업무 ${workId.slice(0, 8)} · 문서 ${docId.slice(0, 8)} 를 만들었습니다`);

const DOC_URL = `${BASE}/works/${workId}/doc`;
const browser = await chromium.launch();

async function login(name) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.locator(`form:has(input[value="${ACCOUNTS[name]}"]) button[type=submit]`).click();
  // 주소가 실제로 바뀔 때까지 기다린다. domcontentloaded 로는 안 된다 —
  // 서버 액션은 응답을 받은 **뒤에** 리다이렉트가 따로 일어나서, 그 시점에는
  // 아직 로그인 화면이다. 그대로 다음 줄로 가면 로그인 안 된 채로 문서를
  // 열고 「편집기가 안 뜬다」로 헛짚는다. (realtime.test.mjs 가 같은 함정을
  // 주석으로 적어 두었는데 여기서 똑같이 걸렸다)
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.waitForLoadState("domcontentloaded");
  return { ctx, page };
}

/** 편집기가 붙기를 기다린다. */
async function ready(page) {
  await page.waitForSelector("[data-ilm-root]", { timeout: 25_000 });
  await wait(400);
}

const text = (page) => page.evaluate(() => document.body.innerText);

try {
  // -------------------------------------------------------------------------
  console.log("\n[1] 자동 저장이 실제로 DB 에 남는다");
  // -------------------------------------------------------------------------
  const A = await login("박준호");
  await A.page.goto(DOC_URL, { waitUntil: "domcontentloaded" });
  await ready(A.page);

  ok("서식 편집기가 실제 모드에서 뜬다", true);

  const STAMP = `저장확인-${Date.now().toString(36)}`;
  const box = await A.page.$(`[data-ilm-block="${BLOCK}"]`);
  await box.click();
  await A.page.keyboard.press("End");
  await A.page.keyboard.type(STAMP);

  // 자동 저장은 2.5초 쉬면 돈다(AUTOSAVE_MS).
  const saved = await until(async () => {
    const { data } = await owner
      .from("document")
      .select("blocks, blocks_rev")
      .eq("id", docId)
      .single();
    return JSON.stringify(data?.blocks ?? {}).includes(STAMP);
  }, 15_000);
  ok("자동 저장이 DB 까지 간다", saved, "15초 안에 안 들어왔다");

  const { data: after } = await owner
    .from("document")
    .select("blocks_rev, blocks_updated_by")
    .eq("id", docId)
    .single();
  ok("판이 올랐다", (after?.blocks_rev ?? 0) > 0, `rev=${after?.blocks_rev}`);
  ok("누가 고쳤는지 남는다", after?.blocks_updated_by === ownerId);

  // 새로고침해서 그대로 있는가 — 화면과 DB 가 같은 것을 보고 있는지의 확인
  await A.page.reload({ waitUntil: "domcontentloaded" });
  await ready(A.page);
  ok("새로고침해도 글자가 남아 있다", (await text(A.page)).includes(STAMP));

  // -------------------------------------------------------------------------
  console.log("\n[2] 창 두 개가 진짜 broadcast 로 서로의 글자를 받는다");
  // -------------------------------------------------------------------------
  const Bw = await login("이하람");
  await Bw.page.goto(DOC_URL, { waitUntil: "domcontentloaded" });
  await ready(Bw.page);

  /**
   * ⚠ **「함께 편집 중」이라는 글자를 기다리면 안 된다.**
   *
   * 그 글자는 내 채널이 붙기만 하면 뜬다 — 상대가 왔는지와는 무관하다.
   * (그 사실 자체가 결함이라 함께 고쳤다: 이제 혼자면 「실시간 연결됨」이다)
   * 그걸 기다렸다가 곧바로 글자를 치면 **상대가 아직 채널에 안 붙은 사이에
   * 신호가 나가고, broadcast 에는 재전송이 없어 그 글자는 영영 안 간다.**
   *
   * 상대의 **접속자 칩**이 뜰 때까지 기다린다. 그건 presence 로 확인된 것이라
   * 「상대가 정말 채널 안에 있다」는 뜻이다.
   */
  const joined = await until(
    async () => (await A.page.locator(".ilm-peer").count()) > 0,
    20_000,
  );
  ok("상대가 접속자로 잡힌다", joined, "20초 안에 presence 가 안 왔다");
  ok(
    "혼자가 아닐 때만 「함께 편집 중」이라고 적는다",
    (await text(A.page)).includes("함께 편집 중"),
  );

  // 박준호가 친 글자가 이하람 화면에 나타나는가
  const FROM_A = `가나다-${Date.now().toString(36).slice(-4)}`;
  await (await A.page.$(`[data-ilm-block="${BLOCK}"]`)).click();
  await A.page.keyboard.press("End");
  await A.page.keyboard.type(FROM_A);
  ok(
    "박준호가 친 글자가 이하람 화면에 나타난다",
    await until(async () => (await text(Bw.page)).includes(FROM_A), 12_000),
    "12초 안에 안 왔다",
  );

  // 반대 방향 — 같은 문단의 **다른 자리**에 동시에 친다
  const FROM_B = `라마바-${Date.now().toString(36).slice(-4)}`;
  await (await Bw.page.$(`[data-ilm-block="${BLOCK}"]`)).click();
  await Bw.page.keyboard.press("Home");
  await Bw.page.keyboard.type(FROM_B);
  ok(
    "이하람이 친 글자가 박준호 화면에 나타난다",
    await until(async () => (await text(A.page)).includes(FROM_B), 12_000),
    "12초 안에 안 왔다",
  );

  // 둘의 문단이 **글자 단위로 합쳐졌는가** — 어느 쪽도 남의 글을 지우지 않았다
  const readBlock = (page) =>
    page.evaluate((id) => document.querySelector(`[data-ilm-block="${id}"]`)?.textContent ?? "", BLOCK);
  const ta = await readBlock(A.page);
  const tb = await readBlock(Bw.page);
  ok("두 화면의 문단이 글자까지 같다", ta === tb, `A="${ta}" / B="${tb}"`);
  ok("둘 다 살아 있다", ta.includes(FROM_A) && ta.includes(FROM_B), ta);

  // 서식도 오는가.
  // 내 화면부터 확인한다 — 상대만 보면 「안 걸린 것」과 「안 온 것」이
  // 구별되지 않아서, 어느 층이 틀렸는지 모른 채 시험만 빨개진다.
  const bolded = (page) =>
    page.evaluate(
      (id) => /<strong>/.test(document.querySelector(`[data-ilm-block="${id}"]`)?.innerHTML ?? ""),
      BLOCK,
    );

  await (await A.page.$(`[data-ilm-block="${BLOCK}"]`)).click();
  // Home 은 **보이는 줄**의 처음으로 간다. 문단이 두 줄로 접혀 있으면
  // 문단 처음이 아니다. 문단 처음을 확실히 잡으려면 Ctrl+Home 이 아니라
  // 선택을 직접 놓는 편이 낫다 — 여기서는 앞 세 글자를 고르는 것이 목적이다.
  await A.page.evaluate((id) => {
    const el = document.querySelector(`[data-ilm-block="${id}"]`);
    const node = el?.firstChild;
    if (!node) return;
    const r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, Math.min(3, node.textContent?.length ?? 0));
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }, BLOCK);
  await wait(200);
  await A.page.keyboard.press("Control+b");
  ok("굵게가 내 화면에 걸린다", await until(() => bolded(A.page), 6_000));
  ok("굵게가 상대 화면에도 걸린다", await until(() => bolded(Bw.page), 12_000));

  // 문단을 새로 만드는 것도 오는가
  await A.page.keyboard.press("End");
  await A.page.keyboard.press("Enter");
  await A.page.keyboard.type("새 문단입니다");
  ok(
    "새 문단이 상대 화면에 생긴다",
    await until(async () => (await text(Bw.page)).includes("새 문단입니다"), 12_000),
  );

  // 마지막으로 DB 에 합쳐진 결과가 들어가는가
  /**
   * ⚠ 저장된 JSON 을 **문자열째로** 뒤지면 안 된다.
   *
   * 서식이 걸리면 한 토막이 둘로 갈라진다. 「라마바-38tz」에 앞 세 글자만
   * 굵게 하면 `{"m":["b"],"t":"라마바"},{"t":"-38tz…"}` 가 되어, 글자는 멀쩡히
   * 다 있는데 `includes("라마바-38tz")` 는 거짓이 된다. 실제로 이 시험이 그렇게
   * 헛짚어 멀쩡한 저장을 결함으로 보고했다. 토막을 이어 붙여 **글자만** 본다.
   */
  const plainOf = (blocks) =>
    (blocks?.blocks ?? [])
      .map((bk) => (bk.spans ?? []).map((sp) => sp.t).join(""))
      .join("\n");

  let dbShot = "";
  const merged = await until(async () => {
    const { data } = await owner.from("document").select("blocks").eq("id", docId).single();
    dbShot = plainOf(data?.blocks);
    return dbShot.includes(FROM_A) && dbShot.includes(FROM_B) && dbShot.includes("새 문단입니다");
  }, 25_000);
  ok(
    "합쳐진 결과가 DB 에 저장된다",
    merged,
    `A=${dbShot.includes(FROM_A)} B=${dbShot.includes(FROM_B)} 새문단=${dbShot.includes("새 문단입니다")} | ${dbShot.slice(0, 160)}`,
  );

  await Bw.ctx.close();

  // -------------------------------------------------------------------------
  console.log("\n[3] 스크립트 없이 문단을 고치는 길");
  // -------------------------------------------------------------------------
  const noJs = await browser.newContext({
    viewport: { width: 1300, height: 900 },
    locale: "ko-KR",
    javaScriptEnabled: false,
    storageState: await A.ctx.storageState(),
  });
  const np = await noJs.newPage();
  await np.goto(DOC_URL, { waitUntil: "domcontentloaded" });
  ok("문단별 편집 폼이 뜬다", (await text(np)).includes("간단 편집 화면"));

  // 「고치기」를 누르면 **편집칸이 있는 화면**으로 가야 한다.
  // 예전에는 여기가 읽기 전용 미리보기로 튕겼다.
  await np.locator('form:has(input[value="' + BLOCK + '"]) button[type=submit]').first().click();
  await np.waitForLoadState("domcontentloaded");
  ok("고치기가 편집칸으로 데려간다", (await np.locator("textarea[name=body]").count()) > 0);

  const NOJS = `무JS-${Date.now().toString(36).slice(-4)}`;
  await np.locator("textarea[name=body]").fill(NOJS);
  await np.locator('button:has-text("저장")').first().click();
  await np.waitForLoadState("domcontentloaded");

  const nojsSaved = await until(async () => {
    const { data } = await owner.from("document").select("blocks").eq("id", docId).single();
    return JSON.stringify(data?.blocks ?? {}).includes(NOJS);
  }, 10_000);
  ok("스크립트 없이 고친 것이 DB 에 저장된다", nojsSaved);
  ok("저장 결과를 화면이 말해 준다", (await text(np)).includes("저장했습니다"));

  // 문단 넣기.
  // ⚠ 「고치기」 단추 수로 세면 안 된다 — 새로 넣은 문단은 곧바로 편집칸으로
  //   열리므로 그 문단에는 「고치기」가 없다. 수가 그대로여서 「안 먹는다」로
  //   헛짚었다. 문단 자체를 센다.
  const countBlocks = async () =>
    (await owner.from("document").select("blocks").eq("id", docId).single()).data.blocks
      .blocks.length;
  const before = await countBlocks();
  await np.locator('button:has-text("넣기")').last().click();
  await np.waitForLoadState("domcontentloaded");
  const afterAdd = await countBlocks();
  ok("문단 넣기가 먹는다", afterAdd === before + 1, `${before} → ${afterAdd}`);
  ok("넣은 문단이 곧바로 편집칸으로 열린다", (await np.locator("textarea[name=body]").count()) > 0);

  await noJs.close();

  // -------------------------------------------------------------------------
  console.log("\n[4] 내보내기가 실제 문서로 나온다");
  // -------------------------------------------------------------------------
  for (const [ext, mime] of [
    ["hwpx", "haansofthwpx"],
    ["docx", "wordprocessingml"],
  ]) {
    const res = await A.ctx.request.get(`${DOC_URL}/export/${ext}`);
    const body = await res.body();
    ok(
      `${ext} 가 200 · ZIP · 내용이 들어 있다`,
      res.status() === 200 &&
        body.slice(0, 2).toString("latin1") === "PK" &&
        body.length > 1000 &&
        (res.headers()["content-type"] ?? "").includes(mime),
      `status=${res.status()} size=${body.length}`,
    );
  }

  await A.ctx.close();
} finally {
  await browser.close();
  const left = await sweep();
  console.log(`\n${MARK} 업무를 지웠습니다${left ? "" : " (이미 없었습니다)"}`);
}

console.log(
  fails.length === 0 ? `\n전부 통과 — ${pass}건` : `\n실패 — ${pass}건 통과, ${fails.length}건 실패`,
);
for (const f of fails) console.log(`  · ${f}`);
process.exit(fails.length ? 1 : 0);
