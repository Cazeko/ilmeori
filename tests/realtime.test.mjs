/**
 * 실시간 왕복 시험 — **창 두 개를 띄워 놓고** 돌린다.
 *
 * 다른 시험(tests/browser.test.mjs)은 자바스크립트를 끈 채로 돈다. 이 제품의 화면이
 * 스크립트 없이 전부 동작하는 것을 확인하기 위해서다. 실시간만은 그럴 수 없으므로
 * 여기만 스크립트를 켜고, **덧붙인 층이 실제로 도는지**를 따로 본다.
 *
 * 무엇을 보는가
 *   [1] 두 사람이 같은 업무를 열면 서로가 접속자로 보인다
 *   [2] 한쪽이 고치면 다른 쪽 화면이 **아무것도 누르지 않아도** 따라간다
 *   [3] 편집칸을 열어 둔 사람의 화면은 가로채지 않는다 (알리기만 한다)
 *
 * 돌리는 법
 *   npm i -D playwright && npx playwright install chromium
 *   npm run build && npm start &          # ← 반드시 새로 빌드한 것을 띄운다
 *   npm run test:realtime
 *
 * ⚠ 이 시험은 **실제 Supabase 프로젝트**에 붙는다. 그리고 확인용 업무를 하나
 *   만들었다가 끝나면 지운다(제목이 「[실시간 검증]」으로 시작한다). 시연 데이터를
 *   건드리지 않기 위해서다. 도중에 죽어 남은 것이 있으면 다음 실행이 먼저 치운다.
 *
 * 0012_realtime.sql 을 아직 SQL Editor 에서 돌리지 않았다면 [1]에서 멈추고
 * 무엇을 해야 하는지 알려 준다. 그 경우 **통과로 세지 않는다** —
 * 건너뛴 초록불은 초록불이 아니다.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    [
      "playwright 가 없습니다. 이 시험은 브라우저가 있어야 돌아갑니다.",
      "",
      "  npm i -D playwright && npx playwright install chromium",
    ].join("\n"),
  );
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://127.0.0.1:3210";

const env = {};
for (const line of (await readFile(join(HERE, "..", ".env.local"), "utf8").catch(() => "")).split(
  "\n",
)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PW = process.env.DEMO_ACCOUNT_PASSWORD ?? env.DEMO_ACCOUNT_PASSWORD;
if (!URL_ || !KEY || !PW) {
  console.error("이 시험은 실제 프로젝트에 붙습니다. .env.local 의 값 3개가 필요합니다.");
  process.exit(2);
}

// 로그인 화면의 한 번에 들어가기 버튼에 실리는 값
const ACCOUNTS = {
  박준호: "70000000-0000-4000-8000-000000000002",
  이하람: "70000000-0000-4000-8000-000000000003",
};

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

/**
 * 제출 버튼을 누르고 **주소가 실제로 바뀔 때까지** 기다린다.
 *
 * waitForLoadState("networkidle") 로는 안 된다. 서버 액션은 응답을 받은 뒤에
 * 리다이렉트가 따로 일어나서, networkidle 이 풀린 시점에는 아직 옛 화면이다.
 * 그 틈에 입력칸을 채우면 **다른 칸에 글자를 넣고** 곧바로 화면이 갈린다.
 * (이 시험이 실제로 그렇게 헛짚어, 멀쩡한 기능을 결함으로 보고했다)
 */
async function submitAndWait(page, selector, urlPattern) {
  await page.locator(selector).click();
  await page.waitForURL(urlPattern, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

/** 조건이 될 때까지 기다린다. 안 되면 마지막 화면을 그대로 돌려준다. */
async function until(page, test, ms = 10_000) {
  const end = Date.now() + ms;
  let text = "";
  while (Date.now() < end) {
    text = await page.locator("body").evaluate((b) => b.textContent ?? "");
    if (test(text)) return { hit: true, text };
    await wait(300);
  }
  return { hit: false, text };
}

// ---------------------------------------------------------------------------
// 확인용 업무를 만든다 (끝나면 지운다)
// ---------------------------------------------------------------------------
console.log("\n[준비] 확인용 업무 만들기");

const MARK = "[실시간 검증]";
const owner = createClient(URL_, KEY, { auth: { persistSession: false } });
{
  const { error } = await owner.auth.signInWithPassword({
    email: "demo02@ilmeori.demo",
    password: PW,
  });
  if (error) throw new Error(`박준호 로그인 실패: ${error.message}`);
}
const ownerId = (await owner.auth.getUser()).data.user.id;
const helperId = ACCOUNTS.이하람;

/** 이전 실행이 남긴 것을 먼저 치운다. 남은 것을 안고 시작하면 결과를 못 믿는다. */
async function sweep() {
  const { data } = await owner.from("work").select("id, title").like("title", `${MARK}%`);
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

// id 를 여기서 정해 두고 넣는다. insert(...).select() 로 돌려받지 않는 이유는
// 앱의 createWork 와 같다 — 비공개 업무는 참여자 행이 만들어지기 전이라
// RETURNING 이 열람 정책을 통과하지 못하고, 그것이 "정책 위반"으로 보인다.
const work = { id: crypto.randomUUID() };
const { error: workErr } = await owner.from("work").insert({
  id: work.id,
  title: `${MARK} 지워도 되는 업무`,
  description: "실시간 왕복 시험이 만들었습니다. 시험이 끝나면 스스로 지웁니다.",
  department_id: profile.department_id,
  owner_id: ownerId,
  created_by: ownerId,
  visibility: "private",
});
if (workErr) throw new Error(`업무를 만들지 못했습니다: ${workErr.message}`);

/** 확인용 업무를 지운다. 지웠는지 확인까지 하고 돌려준다 — 못 지웠으면 말해야 한다. */
const cleanup = async () => {
  const { data, error } = await owner.from("work").delete().eq("id", work.id).select("id");
  await owner.auth.signOut();
  return !error && data?.length === 1;
};

try {
  await owner
    .from("work_member")
    .insert({ work_id: work.id, profile_id: helperId, role: "editor", added_by: ownerId });

  const doc = { id: crypto.randomUUID() };
  const { error: docErr } = await owner
    .from("document")
    .insert({ id: doc.id, work_id: work.id, title: "확인용 문서", created_by: ownerId });
  if (docErr) throw new Error(`문서를 만들지 못했습니다: ${docErr.message}`);
  const { error: secErr } = await owner.from("doc_section").insert([
    { document_id: doc.id, sort_order: 0, heading: "첫째 항목", body: "내용", updated_by: ownerId },
    { document_id: doc.id, sort_order: 1, heading: "둘째 항목", body: "내용", updated_by: ownerId },
  ]);
  if (secErr) throw new Error(`문서 항목을 만들지 못했습니다: ${secErr.message}`);
  console.log(`  ${MARK} 업무 1건 · 참여자 2명 · 문서 항목 2개`);

  const WORK_URL = `${BASE}/works/${work.id}`;
  const browser = await chromium.launch();

  const open = async (name) => {
    const ctx = await browser.newContext({ javaScriptEnabled: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000); // 하이드레이션 전에 누르면 클릭이 버려진다
    await page
      .locator(`form:has(input[value="${ACCOUNTS[name]}"]) button[type=submit]`)
      .click();
    await page.waitForTimeout(1200);
    await page.goto(WORK_URL, { waitUntil: "networkidle" });
    return { ctx, page };
  };

  // -------------------------------------------------------------------------
  console.log("\n[1] 두 사람이 같은 업무를 열면 서로가 보인다");
  // -------------------------------------------------------------------------
  const A = await open("박준호");
  const B = await open("이하람");

  const linkedA = await until(A.page, (t) => /실시간 연결됨|실시간 연결 끊김/.test(t), 15_000);
  if (linkedA.text.includes("실시간 연결 끊김")) {
    console.log(
      [
        "",
        "  실시간 채널에 들어가지 못했습니다.",
        "",
        "  supabase/migrations/0012_realtime.sql 을 Supabase SQL Editor 에서 실행했는지",
        "  확인해 주세요. 실행 전에는 realtime.messages 에 정책이 없어 모든 채널이 거부됩니다.",
        "  (한 번도 private 채널을 쓴 적 없는 프로젝트라면 첫 시도가 MissingPartition 으로",
        "   실패할 수 있습니다. 그때는 한 번 더 돌려 주세요.)",
        "",
        "  DB 쪽만 확인하려면: node supabase/realtime.probe.mjs",
      ].join("\n"),
    );
    await browser.close();
    if (!(await cleanup())) console.log(`${MARK} ⚠ 업무를 지우지 못했습니다: ${work.id}`);
    process.exit(2);
  }
  ok("박준호 화면이 실시간에 붙었다", linkedA.hit && linkedA.text.includes("실시간 연결됨"));

  const linkedB = await until(B.page, (t) => t.includes("실시간 연결됨"), 15_000);
  ok("이하람 화면도 실시간에 붙었다", linkedB.hit);

  const seesB = await until(A.page, (t) => t.includes("이하람") && t.includes("함께 보고 있습니다"));
  ok("박준호 화면에 이하람이 접속자로 보인다", seesB.hit);

  const seesA = await until(B.page, (t) => t.includes("박준호") && t.includes("함께 보고 있습니다"));
  ok("이하람 화면에 박준호가 접속자로 보인다", seesA.hit);

  // -------------------------------------------------------------------------
  console.log("\n[2] 한쪽이 고치면 다른 쪽이 따라간다");
  // -------------------------------------------------------------------------
  // 박준호가 첫째 항목을 편집하기 시작한다(= 잠금). 이하람은 아무것도 누르지 않는다.
  await submitAndWait(A.page, 'button[aria-label="첫째 항목 편집"]', /[?&]edit=/);

  const sawLock = await until(B.page, (t) => t.includes("박준호") && t.includes("편집 중"));
  ok("누르지 않아도 「박준호님 편집 중」이 나타난다", sawLock.hit, sawLock.hit ? "" : "10초 안에 안 나옴");
  ok(
    "화면이 바뀐 사실을 소리로도 알린다",
    sawLock.text.includes("화면을 새로 불러오는 중입니다"),
    "sr-only 안내가 없다",
  );

  // 박준호가 취소하면 잠금이 풀리고, 그것도 따라와야 한다.
  await submitAndWait(A.page, 'form button:has-text("취소")', /^(?!.*[?&]edit=).*$/);
  const lockGone = await until(B.page, (t) => !t.includes("편집 중"));
  ok("잠금을 풀면 그것도 따라온다", lockGone.hit);

  // -------------------------------------------------------------------------
  console.log("\n[3] 편집칸을 열어 둔 사람의 화면은 가로채지 않는다");
  // -------------------------------------------------------------------------
  // 이번에는 이하람이 둘째 항목을 편집한다. 그 사이 박준호가 대화를 남긴다.
  await submitAndWait(B.page, 'button[aria-label="둘째 항목 편집"]', /[?&]edit=/);
  // 편집칸이 실제로 열렸는지 확인하고 채운다. 열리기 전이면 「항목 추가」칸에 들어간다.
  const editBox = B.page.locator('form:has(input[name=sectionId]) textarea[name=body]').first();
  await editBox.waitFor({ state: "visible", timeout: 10_000 });
  await editBox.fill("쓰다 만 내용입니다");

  await A.page.goto(`${WORK_URL}?tab=talk`, { waitUntil: "networkidle" });
  await A.page.locator("textarea[name=body]").fill("편집 중에 끼어드는 대화");
  await A.page.locator('button:has-text("남기기")').click();
  await A.page.waitForLoadState("networkidle");

  const banner = await until(B.page, (t) => t.includes("쓰고 있는 내용을 지키기 위해"));
  ok("편집 중에는 알리기만 하고 화면을 바꾸지 않는다", banner.hit);
  ok(
    "쓰고 있던 글자가 그대로 남아 있다",
    (await editBox.inputValue()) === "쓰다 만 내용입니다",
    await editBox.inputValue(),
  );
  // 화면 전체에서 「대화」를 찾으면 탭 이름 때문에 언제나 통과한다. 배너 안에서 본다.
  const bannerText = await B.page
    .locator('p:has-text("쓰고 있는 내용을 지키기 위해")')
    .first()
    .innerText();
  ok(
    "무엇이 바뀌었는지 말해 준다",
    /다른 사람이 대화를 고쳤습니다/.test(bannerText),
    bannerText.slice(0, 80),
  );

  // 누르면 그때 반영된다.
  await B.page.locator('button:has-text("지금 반영")').click();
  const applied = await until(B.page, (t) => !t.includes("쓰고 있는 내용을 지키기 위해"));
  ok("「지금 반영」을 누르면 배너가 사라진다", applied.hit);

  await browser.close();
} finally {
  const gone = await cleanup();
  if (gone) {
    console.log(`\n${MARK} 업무를 지웠습니다.`);
  } else {
    console.log(`\n${MARK} ⚠ 업무를 지우지 못했습니다: ${work.id}`);
    fails.push("확인용 업무를 지우지 못했다");
  }
}

console.log(`\n통과 ${pass}건 / 실패 ${fails.length}건`);
if (fails.length) {
  console.log("\n실패한 것:");
  for (const f of fails) console.log(" - " + f);
  process.exit(1);
}
