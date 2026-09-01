/**
 * 브라우저 왕복 시험 — **거의 전부 자바스크립트를 끈 상태로** 돌린다.
 *
 * 예외는 네 건뿐이고, 넷 다 「스크립트가 있을 때만 나타나야 하는 것」을 본다
 * (인쇄 버튼 1건, 실시간 상자 3건). 나머지는 전부 스크립트를 끈 채로 돈다.
 *
 * 이 제품의 화면은 스크립트 없이 전부 동작하는 것을 전제로 만들었다.
 * 그 전제는 코드를 읽어서는 확인되지 않는다. 실제로 물린 적이 있다 —
 * Next의 notFound()는 응답 코드가 404인데 본문이 RSC 페이로드에만 실려,
 * 스크립트를 끈 브라우저에서는 빈 화면이 나왔다. 여기서 잡았다.
 *
 * 무엇을 보는가
 *   [1] 인계서가 대화를 읽어 「1-다. 현안사항」을 채우는가
 *   [2] 인쇄하면 별지 제12호서식 모양 A4가 나오는가
 *   [3] 「이 업무가 보이는 이유」와 같은 주소·다른 계정
 *   [4] 기존 동선이 안 깨졌는가
 *   [5] 코드리뷰에서 고친 것들이 실제로 고쳐졌는가
 *   [6] 실시간 상자가 스크립트 없이는 아예 안 나타나는가
 *   [7] 인계자가 서식 항목에 보태고, 그것이 종이에도 실리는가
 *       (0014·0015 를 SQL Editor 에서 돌린 뒤라야 통과한다)
 *   [8] 결재 — 결재함·결재란·업무 상세 탭이 DB 판정과 같은 말을 하는가
 *   [9] 「온나라로 넘기기」 — 화면·파일·종이 셋이 같은 말을 하는가
 *   [10] PWA 가 덧붙이는 층인가 (설명서·서비스워커가 익명으로 읽히는가)
 *
 * 돌리는 법 (playwright 는 이 저장소의 의존성이 아니다 — 시험 전용이라 일부러 뺐다)
 *   npm i -D playwright && npx playwright install chromium
 *   npm run build && npm start &          # ← 반드시 새로 빌드한 것을 띄운다.
 *                                         #   next start 는 뜰 때의 빌드를 붙들고 있어서,
 *                                         #   고치고도 옛 화면을 보며 한참을 헤매게 된다
 *   npm run test:browser
 *
 * 주소는 BASE 환경변수로 바꿀 수 있다(배포본에 그대로 쏘아도 된다).
 */
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  // 없다고 시험이 실패한 것처럼 보이면 안 된다. 아직 안 돌린 것뿐이다.
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
const ACCOUNTS = {
  김서연: "70000000-0000-4000-8000-000000000001",
  박준호: "70000000-0000-4000-8000-000000000002",
  이하람: "70000000-0000-4000-8000-000000000003",
  최민재: "70000000-0000-4000-8000-000000000004",
};

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

async function pick(page, name) {
  await page.locator(`form:has(input[value="${ACCOUNTS[name]}"]) button[type=submit]`).click();
  await page.waitForLoadState("domcontentloaded");
}

async function login(ctx, name) {
  // 세션을 먼저 비운다. 같은 컨텍스트에서 계정을 바꿔 가며 볼 때, 앞의 세션이
  // 남아 있으면 /login 이 홈으로 튕겨(proxy 의 「로그인한 사람은 로그인 화면에
  // 머물지 않는다」) 계정 카드가 아예 없다. 그러면 다음 줄이 30초를 기다리다
  // 시험 블록이 통째로 죽는다 — 실제로 [8] 결재가 그렇게 멈춰 있었고,
  // 그 뒤 [9]·[10]은 한 번도 돌지 않았다.
  await ctx.clearCookies();

  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await pick(page, name);
  return page;
}

/** 접힌 details 안의 글자는 innerText 에 안 잡힌다. 통째로 본다. */
const allText = (page) => page.locator("body").evaluate((b) => b.textContent ?? "");

const browser = await chromium.launch();

// ── 1. 인계서가 대화를 읽는가 ────────────────────────────────────────────────
console.log("\n[1] 인계서 — 대화에서 현안 뽑기");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await login(ctx, "박준호");
  await page.goto(`${BASE}/handover`, { waitUntil: "domcontentloaded" });
  const body = await allText(page);

  ok("인계 화면이 열린다", body.includes("업무인계·인수서"));
  ok("근거 안내에 대화 건수가 있다", /대화 \d+건/.test(body), body.match(/대화 \d+건/)?.[0]);
  ok("현안사항에 대화 인용이 들어갔다", body.includes("[대화 —"));
  ok(
    "인용에 사람·날짜·고른 이유가 붙는다",
    /\[대화 — .+?, .+?· (기한|질문|결정 대기|이견·유의|약속)/.test(body),
    body.match(/\[대화 — [^\]]+\]/)?.[0],
  );
  ok("배도현의 기한 충돌 대화가 실렸다", body.includes("요구서 제출 기한과 겹칩니다"));
  ok("박준호의 후속 약속이 실렸다", body.includes("8월 8일까지 반영본을 받기로 했으니"));
  // 「안 실렸다」는 **서식**에 대한 말이다. 같은 화면의 「규칙이 무엇을 걸렀나」는
  // 바로 그 대화를 원문으로 내놓으므로 body 전체로 재면 늘 빨갛다.
  const sheetText = await page.locator(".sheet").evaluate((el) => el.textContent ?? "");
  ok(
    "현안이 아닌 대화는 안 실렸다",
    !sheetText.includes("정기인사로 이 업무를 이하람 주무관에게"),
  );
  ok(
    "안 실린 대화는 「규칙이 무엇을 걸렀나」에 원문으로 남는다",
    body.includes("정기인사로 이 업무를 이하람 주무관에게"),
  );
  ok("「확인된 현안사항이 없습니다」가 사라졌다", !body.includes("확인된 현안사항이 없습니다"));
  ok("근거 꼬리표가 몇 건 중 몇 건인지 밝힌다", /대화 \d+건 중 .*?\d+건/.test(body));
  ok("인용은 원문 그대로다(요약이 아니다)", body.includes("“") && body.includes("”"));

  // ── 2. 인쇄 서식 ──────────────────────────────────────────────────────────
  console.log("\n[2] 인쇄 서식");
  const sheet = page.locator(".sheet");
  ok("서식이 DOM에 있다", (await sheet.count()) === 1);
  // 예전에는 `hidden print:block` 이라 **Ctrl+P 를 눌러야만 보였다.** 이 제품에서
  // 가장 강한 물건이 화면에 없었던 셈이라, 서식을 화면의 「문서」로 올렸다
  // (DESIGN.md T6). 그래서 여기서 재는 것이 뒤집힌다 — 감춰져 있으면 실패다.
  ok("서식이 화면에도 보인다", await sheet.isVisible());

  const raw = (await sheet.textContent()) ?? "";
  ok("서식 제목이 있다", raw.includes("업무인계·인수서"));
  ok("인계자·인수자 표가 있다", raw.includes("인계자") && raw.includes("인수자"));
  ok("인계일이 찍힌다", raw.includes("인계일"));
  ok("서명란이 있다", raw.includes("(서명 또는 인)") && raw.includes("입회자"));
  ok("일곱 항목이 모두 들어간다", raw.includes("1-가.") && raw.includes("4. 그 밖의 참고사항"));
  ok("종이에도 대화 인용이 실린다", raw.includes("[대화 —"));
  ok("출처 요약이 맨 아래에 있다", raw.includes("서식 순서대로 뽑아 정리한 것입니다"));
  ok("물품·예산은 손으로 적을 빈칸이다", raw.includes("재무회계시스템"));

  await page.emulateMedia({ media: "print" });
  // 「근거:」 줄은 이제 서식 **안**의 화면 장치다(print-sheet 의 blockLead).
  // 글자로 찾지 않는다 — 인용된 문서 본문에도 「근거:」로 시작하는 줄이 있다.
  // 인쇄 매체에서 그 요소가 **그려지지 않는가**를 본다.
  ok(
    "종이에는 근거 꼬리표가 안 나온다",
    (await page.locator(".sheet .block-sources:visible").count()) === 0,
  );
  ok(
    "종이에는 누를 것이 없다",
    (await page.locator(".sheet form:visible, .sheet button:visible").count()) === 0,
  );
  ok("인쇄에서 상단 바가 사라진다", (await page.locator("header").first().isVisible()) === false);
  ok("인쇄에서 왼쪽 메뉴가 사라진다", (await page.locator("aside").first().isVisible()) === false);
  ok("인쇄에서 서식이 나타난다", await sheet.isVisible());
  ok(
    "인쇄에서 화면용 안내가 사라진다",
    (await page.locator("text=이 초안은 사람이 쓰지 않았습니다").first().isVisible()) === false,
  );
  const cssHref = await page.locator('link[rel=stylesheet]').first().getAttribute("href");
  const css = await (await fetch(BASE + cssHref)).text();
  ok("A4 용지 설정이 실려 있다", css.includes("@page{size:A4"), cssHref);
  ok("본문 항목이 페이지 경계에서 안 잘리게 했다", css.includes("break-after:avoid"));
  await page.emulateMedia({ media: "screen" });

  ok(
    "스크립트가 없으면 인쇄 버튼이 없다",
    (await page.locator("button:has-text('인쇄')").count()) === 0,
  );
  ok("대신 Ctrl+P 안내가 남는다", body.includes("Ctrl"));

  await ctx.close();
}

{
  const ctx = await browser.newContext({ javaScriptEnabled: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // 하이드레이션 전에 누르면 클릭이 버려진다
  await pick(page, "박준호");
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/handover`, { waitUntil: "networkidle" });
  ok(
    "스크립트가 있으면 인쇄 버튼이 나타난다",
    (await page.locator("button:has-text('인쇄')").count()) === 1,
    `${page.url()} / ${await page.locator("button:has-text('인쇄')").count()}개`,
  );
  await ctx.close();
}

// ── 3. 보이는 이유 + 같은 주소 다른 계정 ────────────────────────────────────
console.log("\n[3] 보이는 이유 · 같은 주소 다른 계정");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await login(ctx, "박준호");

  await page.goto(`${BASE}/works`, { waitUntil: "domcontentloaded" });
  const hrefs = await page.locator('a[href^="/works/"]').evaluateAll((els) =>
    els
      .map((e) => e.getAttribute("href"))
      .filter((h) => /^\/works\/[0-9a-f-]{36}$/.test(h)),
  );
  ok("업무 목록에서 업무를 찾았다", hrefs.length > 0, `${hrefs.length}건`);

  await page.goto(BASE + hrefs[0], { waitUntil: "domcontentloaded" });
  let body = await allText(page);
  ok("「이 업무가 보이는 이유」가 있다", body.includes("이 업무가 보이는 이유"));
  ok("이유가 한 줄로 요약된다", /참여자\(|소속이기 때문입니다|전 직원에게 공개된/.test(body));
  ok("공개 범위를 함께 말한다", body.includes("공개 범위가 「"));
  ok("DB가 정한다는 점을 밝힌다", body.includes("DB가 내어 주지 않은 것"));
  ok("다른 계정으로 열어 보기 버튼이 있다", body.includes("이 주소를 다른 계정으로 열어"));
  ok(
    "펼치기 전에는 설명이 접혀 있다",
    (await page.locator("details:has-text('이 업무가 보이는 이유')").count()) === 1,
  );

  // 전 직원 공개가 아닌 업무를 고른다 — 계정을 바꾸면 막혀야 한다.
  // (시드에는 private 업무가 없고 department 공개가 가장 좁다)
  let privatePath = null;
  for (const h of hrefs) {
    await page.goto(BASE + h, { waitUntil: "domcontentloaded" });
    const t = await allText(page);
    if (t.includes("공개 범위가 「부서 공개」")) {
      privatePath = h;
      break;
    }
  }
  ok("좁게 공개된 업무를 찾았다", Boolean(privatePath), privatePath ?? "없음");
  if (privatePath) {
    await page.goto(BASE + privatePath, { waitUntil: "domcontentloaded" });
    const t = await allText(page);
    ok("계정을 바꾸면 막힐 수 있다고 말한다", t.includes("볼 수 없는 계정으로 오면"));
  }

  if (privatePath) {
    await page.goto(BASE + privatePath, { waitUntil: "domcontentloaded" });
    const form = page.locator(`form:has(input[name=next][value="${privatePath}"])`);
    ok("폼이 이 주소를 들고 있다", (await form.count()) === 1);
    ok("펼치기 전에는 버튼이 안 보인다", (await form.locator("button").isVisible()) === false);

    // details 는 스크립트 없이 열린다. 그것도 함께 확인하는 셈이다.
    //
    // ── 왜 한 번 더 눌러 보는가 ────────────────────────────────────────────
    // 이 줄은 간헐적으로 실패해 왔다. 따로 떼어 돌리면 언제나 열리는데,
    // 전체 시험처럼 컨텍스트를 여럿 띄운 채로 돌리면 클릭이 페이지가 자리를
    // 잡기 전에 닿아 토글이 먹지 않는 일이 있다. **화면의 문제가 아니라
    // 시험의 문제다.**
    //
    // 그래서 무엇을 보는지는 그대로 두고, 여는 일만 확실히 한다. 세 번을
    // 눌러도 안 열리면 넘어가지 않고 그 사실대로 실패시킨다 —
    // 못 연 것을 조용히 통과시키면 이 시험이 지키던 것이 사라진다.
    const reasonDetails = page.locator("details:has-text('이 업무가 보이는 이유')");
    for (let i = 0; i < 3; i += 1) {
      if (await reasonDetails.evaluate((e) => e.open)) break;
      await reasonDetails.locator("summary").click();
      await page.waitForTimeout(150);
    }
    ok("펼치면 설명이 열린다", await reasonDetails.evaluate((e) => e.open));
    ok("펼치면 버튼이 보인다", await form.locator("button").isVisible());
    await form.locator("button[type=submit]").click();
    await page.waitForLoadState("domcontentloaded");

    ok("로그인 화면으로 나왔다", page.url().includes("/login"), page.url());
    ok("돌아갈 주소가 붙어 있다", page.url().includes(encodeURIComponent(privatePath)));
    body = await allText(page);
    ok("돌아간다는 안내가 뜬다", body.includes("방금 보던 주소"));
    ok("주소를 화면에 되읊지 않는다", !body.includes(`>${privatePath}<`));

    await pick(page, "최민재");
    ok("같은 주소로 돌아왔다", page.url().endsWith(privatePath), page.url());
    body = await allText(page);
    ok("막힘 화면이 나온다", body.includes("업무를 찾을 수 없습니다"));
    ok("실제로 눈에 보인다(빈 화면이 아니다)", (await page.locator("body").innerText()).length > 200);
    ok("없는지 못 보는지 구분해 주지 않는다", body.includes("둘 중 어느 쪽인지 알려 주지 않습니다"));
    ok("판단 주체가 DB임을 밝힌다", body.includes("행 수준 보안"));
    ok(
      "여기서도 다른 계정으로 다시 열 수 있다",
      (await page.locator(`form:has(input[name=next][value="${privatePath}"])`).count()) === 1,
    );

    // 볼 수 있는 계정으로 돌아가면 같은 주소가 열린다.
    await page
      .locator(`form:has(input[name=next][value="${privatePath}"]) button[type=submit]`)
      .click();
    await page.waitForLoadState("domcontentloaded");
    await pick(page, "박준호");
    ok("볼 수 있는 계정으로 오면 같은 주소가 열린다", page.url().endsWith(privatePath));
    body = await allText(page);
    ok("막힘 화면이 아니다", !body.includes("업무를 찾을 수 없습니다"));
  }

  // 없는 업무 주소도 같은 화면
  await page.goto(`${BASE}/works/00000000-0000-4000-8000-000000000000`, {
    waitUntil: "domcontentloaded",
  });
  ok(
    "없는 업무도 같은 화면으로 답한다",
    (await page.locator("body").innerText()).includes("업무를 찾을 수 없습니다"),
  );

  const res2 = await page.goto(`${BASE}/works/새업무`, { waitUntil: "domcontentloaded" });
  ok("uuid가 아닌 주소도 같은 화면", (await page.locator("body").innerText()).includes("찾을 수 없습니다"), String(res2.status()));

  const res3 = await page.goto(`${BASE}/없는화면`, { waitUntil: "domcontentloaded" });
  ok("없는 경로는 전역 404", res3.status() === 404);
  ok(
    "전역 404도 스크립트 없이 보인다",
    (await page.locator("body").innerText()).includes("이 주소에는 아무것도 없습니다"),
  );

  // 고칠 권한이 없는 업무의 편집 주소
  await page.goto(`${BASE}/works`, { waitUntil: "domcontentloaded" });
  const readable = await page.locator('a[href^="/works/"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")).filter((h) => /^\/works\/[0-9a-f-]{36}$/.test(h)),
  );
  let sawNoEdit = false;
  for (const h of readable) {
    const r = await page.goto(`${BASE}${h}/edit`, { waitUntil: "domcontentloaded" });
    const t = await page.locator("body").innerText();
    if (t.includes("고칠 수 없는 업무입니다")) {
      sawNoEdit = true;
      ok("편집 권한 없는 주소도 빈 화면이 아니다", t.length > 200 && r.status() === 200);
      break;
    }
  }
  if (!sawNoEdit) console.log("  · (박준호가 못 고치는 업무가 없어 편집 경로는 건너뜀)");

  await ctx.close();
}

// ── 4. 기존 동선이 안 깨졌는지 ──────────────────────────────────────────────
console.log("\n[4] 기존 동선");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await login(ctx, "김서연");
  for (const [path, needle] of [
    ["/", "일머리"],
    ["/works", "업무 보드"],
    ["/audit", "열람기록"],
    ["/handover", "인계"],
    ["/works/new", "새 업무"],
  ]) {
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    const t = await page.locator("body").innerText();
    ok(`${path} 가 열린다`, res.status() === 200 && t.includes(needle), String(res.status()));
  }
  await page.goto(`${BASE}/works`, { waitUntil: "domcontentloaded" });
  // 머리 줄에 폼이 하나뿐이던 시절의 선택자였다. 알림 종이 들어오면서
  // 「전부 읽음」 폼이 하나 더 생겨 strict mode 로 걸렸다. 무엇을 누르는지
  // **이름으로** 고른다 — 자리로 고르면 옆에 뭔가 생길 때마다 또 깨진다.
  await page
    .getByRole("button", { name: "계정 전환" })
    .click();
  await page.waitForLoadState("domcontentloaded");
  ok("상단 계정 전환은 그대로 동작한다", page.url().endsWith("/login"), page.url());
  await ctx.close();
}

// ── 5. 코드리뷰에서 나온 것들 ───────────────────────────────────────────────
console.log("\n[5] 코드리뷰 수정분");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await login(ctx, "이하람");

  // 고칠 권한이 없는 업무의 편집 주소 — 「이 주소 다시 열기」가 그 주소를 들어야 한다
  await page.goto(`${BASE}/works`, { waitUntil: "domcontentloaded" });
  const hrefs = await page.locator('a[href^="/works/"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")).filter((h) => /^\/works\/[0-9a-f-]{36}$/.test(h)),
  );
  let blocked = null;
  for (const h of hrefs) {
    await page.goto(`${BASE}${h}/edit`, { waitUntil: "domcontentloaded" });
    if ((await page.locator("body").innerText()).includes("고칠 수 없는 업무입니다")) {
      blocked = h;
      break;
    }
  }
  if (blocked) {
    const v = await page.locator("input[name=next]").getAttribute("value");
    ok("편집 막힘 화면이 막힌 그 주소를 들고 있다", v === `${blocked}/edit`, String(v));
  } else {
    console.log("  · (이 계정이 못 고치는 업무가 없어 건너뜀)");
  }

  // 인쇄용 표 머리글 굵기 — @layer 밖 규칙이 Tailwind를 이기는 자리
  await page.goto(`${BASE}/handover`, { waitUntil: "domcontentloaded" });
  await page.emulateMedia({ media: "print" });
  const th = await page
    .locator(".sheet thead th")
    .first()
    .evaluate((el) => getComputedStyle(el).fontWeight);
  ok("인쇄용 표 머리글이 굵다", th === "700", th);
  const td = await page
    .locator(".sheet tbody td")
    .first()
    .evaluate((el) => getComputedStyle(el).fontWeight);
  ok("데이터 칸은 굵지 않다", td === "400", td);
  const foot = (await page.locator(".sheet footer").textContent()) ?? "";
  ok(
    "인계 시작 시각과 인쇄본 조립 시각을 나눠 적는다",
    foot.includes("인계 시작") && foot.includes("이 인쇄본은"),
  );
  await page.emulateMedia({ media: "screen" });
  await ctx.close();
}

{
  // 로그인하지 않은 상태에서 next 안내와 오픈 리다이렉트
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login?next=%2Faudit`, { waitUntil: "domcontentloaded" });
  let t = await page.locator("body").innerText();
  ok(
    "업무가 아닌 주소에는 「없습니다」를 말하지 않는다",
    t.includes("방금 보던 주소") && !t.includes("「없습니다」"),
  );

  await page.goto(
    `${BASE}/login?next=%2Fworks%2Ff0000000-0000-4000-8000-000000000005`,
    { waitUntil: "domcontentloaded" },
  );
  ok(
    "업무 주소에는 「없습니다」를 말한다",
    (await page.locator("body").innerText()).includes("「없습니다」"),
  );

  // 탭이 낀 next — 브라우저 URL 파서는 탭을 지우고 읽는다
  await page.goto(`${BASE}/login?next=%2F%09%2Fevil.example.com`, {
    waitUntil: "domcontentloaded",
  });
  const hidden = await page.locator("form input[name=next]").first().getAttribute("value");
  ok("탭이 낀 next 는 폼에도 안 실린다", hidden === "/", JSON.stringify(hidden));
  await pick(page, "김서연");
  ok("탭 우회로도 우리 도메인 안에 남는다", page.url().startsWith(`${BASE}/`), page.url());

  await ctx.close();
}

// ── 6. 실시간은 덧붙이는 층이다 ─────────────────────────────────────────────
console.log("\n[6] 실시간 — 스크립트가 없으면 나타나지 않는다");
{
  // 박준호가 볼 수 있는 업무. (같은 주소를 김서연은 못 본다 — 위 [3]에서 확인한다)
  const WORK = `${BASE}/works/f0000000-0000-4000-8000-000000000005`;

  const off = await browser.newContext({ javaScriptEnabled: false });
  const p1 = await login(off, "박준호");
  await p1.goto(WORK, { waitUntil: "domcontentloaded" });
  const text = await allText(p1);
  // 「업무 보드」는 왼쪽 메뉴에 늘 있다. 그걸로 보면 업무를 못 열어도 통과한다.
  ok(
    "업무 상세가 스크립트 없이 열린다",
    text.includes("2026년 음식물류폐기물") && !text.includes("없거나 보이지 않습니다"),
    p1.url(),
  );
  ok(
    "실시간 상자가 아예 그려지지 않는다",
    !text.includes("실시간 연결"),
    "눌러도 아무 일 없는 자리를 남기면 고장 난 것으로 읽힌다",
  );
  ok(
    "접속자 표시도 없다",
    !text.includes("함께 보고 있습니다") && !text.includes("나만 보고 있습니다"),
  );
  await off.close();

  const on = await browser.newContext({ javaScriptEnabled: true });
  const p2 = await on.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p2.waitForTimeout(1200); // 하이드레이션 전에 누르면 클릭이 버려진다
  await pick(p2, "박준호");
  // 고정 대기로 로그인을 기다리지 않는다. 배포본은 로컬보다 느려서, 덜 기다리면
  // 아직 /login 인 채로 다음 주소로 가고 화면이 엉뚱한 곳을 가리킨다.
  await p2.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await p2.goto(WORK, { waitUntil: "networkidle" });

  // 구독은 세션 확인 → 웹소켓 → 채널 참가 세 왕복이다. 배포본에서는 이게 몇 초 걸리고,
  // 콜드 스타트가 겹치면 더 걸린다. 고정 대기로 재면 느린 날 빨간불이 뜬다 —
  // 실제로 배포 직후에 그렇게 헛짚어, 멀쩡한 배포를 결함으로 보고했다.
  let live = "";
  for (let i = 0; i < 40; i += 1) {
    live = await p2.locator("body").innerText();
    if (/실시간 연결(됨| 끊김)/.test(live)) break; // 「연결 중」은 아직 진행 중이다
    await p2.waitForTimeout(500);
  }
  ok(
    "스크립트가 있으면 실시간 상자가 나타난다",
    /실시간 연결(됨| 중| 끊김)/.test(live),
    live.slice(0, 120).replace(/\n/g, " "),
  );
  // 「연결 중」에 멈춰 있는 것도 결함이다 — subscribe 콜백이 한 번도 안 불린 것이고,
  // 사용자에게는 영원히 돌아가는 표시로 보인다. 붙었든 못 붙었든 답은 나와야 한다.
  ok(
    "연결 중에서 멈추지 않는다 (붙거나, 못 붙었다고 말하거나)",
    !live.includes("실시간 연결 중"),
    "20초가 지나도 「실시간 연결 중」이다",
  );
  // 그리고 적은 대로여야 한다. 끊겼는데 「연결됨」이라고 적으면 화면이 거짓말이다.
  ok(
    "연결 상태를 있는 그대로 적는다",
    live.includes("실시간 연결됨")
      ? live.includes("보고 있습니다")
      : live.includes("새로고침하면 최신 상태를 볼 수 있습니다"),
    live.includes("실시간 연결됨")
      ? "「연결됨」인데 접속자 줄이 없다"
      : live.slice(0, 100).replace(/\n/g, " "),
  );
  await on.close();
}

// ── 7. 인계서에 사람이 보태기 ───────────────────────────────────────────────
//
// 화면은 오랫동안 「인계자가 확인하고 고쳐야 하는 초안」이라고 적어 두고 고칠
// 칸을 주지 않았다. 특히 3번(물품·예산)은 코드가 "직접 적어야 합니다"라고 적고
// 표시까지 달아 두고 적을 자리가 없었다.
//
// 여기서 보는 것은 넷이다.
//   · 스크립트 없이 적히는가 (이 앱의 전제다)
//   · 규칙이 뽑은 문단과 섞이지 않고 「인계자 보충」으로 따로 표시되는가
//   · 넘겨받는 사람에게는 보이되 고칠 칸은 없는가
//   · 종이에도 그렇게 실리는가 — 결재에 올라간 뒤 "이 문장은 누가 썼느냐"에
//     종이만 보고 답할 수 있어야 한다
//
// 문구 검사는 **그 줄 안에서** 본다. 화면 전체 글자에서 「인계자 보충」을 찾으면
// 맨 위 안내문에 그 낱말이 이미 있어서, 보충이 한 줄도 안 그려져도 통과한다.
// (코드리뷰에서 실제로 그렇게 새어 나갔다)
//
// ⚠ 0014·0015 를 SQL Editor 에서 돌린 뒤라야 통과한다.
//   돌리기 전에는 "표가 없다"고 말하고 **통과로 세지 않는다** —
//   건너뛴 초록불은 초록불이 아니다(db:realtime 과 같은 규칙).
console.log("\n[7] 인계서 보충 — 스크립트 없이 적고, 종이에 실린다");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await login(ctx, "박준호");

  /** 이 실행이 남긴 것만 지우기 위한 표식. */
  const MARK = `[검증 ${Date.now().toString(36)}]`;
  // 보충 한 줄은 이제 서식 안의 .note 다(print-sheet). 지우기 폼이 그 안에 선다.
  const rows = (p = page) => p.locator('.sheet .note:has(input[name="noteId"])');

  /** 표식이 붙은 보충을 지운다. 지우고 나면 화면이 다시 그려지므로 매번 다시 찾는다. */
  const sweep = async (mark) => {
    for (let i = 0; i < 12; i += 1) {
      const stale = rows().filter({ hasText: mark });
      if ((await stale.count()) === 0) return true;
      await stale.first().locator("button[type=submit]").click();
      await page.waitForLoadState("domcontentloaded");
    }
    return (await rows().filter({ hasText: mark }).count()) === 0;
  };

  try {
    await page.goto(`${BASE}/handover`, { waitUntil: "domcontentloaded" });
    // 앞선 실행이 도중에 죽어 남긴 것이 있으면 먼저 치운다. 이때만 공통 표식을
    // 본다 — 사람이 쓸 리 없는 낱말이라 시연 데이터를 건드리지 않는다.
    await sweep("[검증");

    const before = await allText(page);
    ok("물품·예산 항목에 보충 칸이 있다", (await page.locator("#note-3-assets").count()) === 1);
    ok("시작할 때 보충 줄이 하나도 없다", (await rows().count()) === 0);
    ok("아직 비어 있으면 「사람이 직접 적어야 합니다」", before.includes("사람이 직접 적어야 합니다"));
    ok(
      "종이에는 손으로 적을 빈칸이 인쇄된다",
      (await page.locator(".sheet div.border-black").count()) === 1,
    );

    const text = `${MARK} 물품관리대장 확인 결과 인계 대상 물품 3건(노트북 1, 계측기 2).`;
    await page.locator("#note-3-assets").fill(text);
    await page.locator("form:has(#note-3-assets) button[type=submit]").click();
    await page.waitForLoadState("domcontentloaded");

    const after = await allText(page);
    if (after.includes("저장하지 못했습니다")) {
      // 표가 없는 것과 코드가 틀린 것은 다르다. 무엇을 해야 하는지까지 적어 준다.
      ok(
        "보충이 저장된다",
        false,
        "supabase/migrations/0014_handover_note.sql 을 SQL Editor 에서 먼저 돌려야 한다",
      );
    } else {
      const row = rows().filter({ hasText: MARK });
      const rowText = (await row.count()) === 1 ? ((await row.textContent()) ?? "") : "";

      ok("스크립트 없이 보충이 저장된다", rowText.includes(text), page.url());
      // includes 로 보지 않는다. `/handover#block-3-assets?msg=…` 도 그 검사를
      // 통과하는데, 그건 조각 이름이 통째로 깨진 바로 그 모양이다.
      ok(
        "적은 항목으로 돌아온다",
        page.url().endsWith("?msg=handover.note.added#block-3-assets"),
        page.url(),
      );
      ok("성공했다고 화면이 말한다", after.includes("보충 내용을 적었습니다"));
      ok("「인계자 보충」으로 그 줄에 따로 표시된다", rowText.includes("인계자 보충"));
      ok("누가 적었는지 그 줄에 남는다", /박준호\s*주무관/.test(rowText), rowText.slice(0, 60));
      ok("언제 적었는지도 그 줄에 남는다", /\d{4}년/.test(rowText), rowText.slice(0, 60));
      ok(
        "다 적은 뒤에는 「인계자가 직접 적었습니다」로 바뀐다",
        after.includes("인계자가 직접 적었습니다"),
      );
      // 적어 넣은 글 위에 "아직 적어야 한다"가 남으면 한 상자가 앞뒤로 다른 말을 한다.
      ok("적어 넣은 뒤에는 「적어야 합니다」가 남지 않는다", !after.includes("직접 적어야 합니다"));
      ok("규칙이 뽑은 문단은 그대로다 (대화 인용이 사라지지 않았다)", after.includes("[대화 —"));

      const sheet = (await page.locator(".sheet").textContent()) ?? "";
      ok("종이에도 실린다", sheet.includes(text));
      ok("종이에서는 이름과 날짜가 붙는다", sheet.includes("인계자 보충: 박준호"));
      ok(
        "적어 넣었으면 손으로 적을 빈칸은 인쇄하지 않는다",
        (await page.locator(".sheet div.border-black").count()) === 0,
      );
      ok("종이에서도 「적어야 하는 칸」 안내가 사라진다", !sheet.includes("직접 적어야 하는 칸입니다"));
      ok(
        "종이 맨 아래 출처에도 사람이 보탠 것이 있다고 적는다",
        sheet.includes("인계자가 직접 적어 넣은 것"),
      );

      // ── 넘겨받는 사람 쪽 ──────────────────────────────────────────────
      // 읽히기는 해야 하고(못 보면 적을 이유가 없다), 고칠 칸은 없어야 한다.
      const other = await browser.newContext({ javaScriptEnabled: false });
      try {
        const p2 = await login(other, "이하람");
        await p2.goto(`${BASE}/handover`, { waitUntil: "domcontentloaded" });
        const seen = await allText(p2);
        ok("인수자도 보충을 읽는다", seen.includes(text));
        ok("인수자에게는 적는 칸이 없다", (await p2.locator("#note-3-assets").count()) === 0);
        ok("인수자에게는 지우는 버튼도 없다", (await p2.locator('input[name="noteId"]').count()) === 0);
        ok(
          "인수자 화면은 없는 칸을 있다고 말하지 않는다",
          !seen.includes("항목마다 「보충 적기」 칸을 뒀습니다"),
        );
      } finally {
        await other.close();
      }

      // 실행 전에는 지울 수 있다 — 오타를 고치는 길. 겸사겸사 뒷정리다.
      await rows().filter({ hasText: MARK }).first().locator("button[type=submit]").click();
      await page.waitForLoadState("domcontentloaded");
      const gone = await allText(page);
      ok("실행 전에는 지울 수 있다", !gone.includes(text));
      ok("지웠다고 화면이 말한다", gone.includes("보충 내용을 지웠습니다"));
      ok("지우면 다시 「사람이 직접 적어야 합니다」", gone.includes("사람이 직접 적어야 합니다"));
    }
  } finally {
    // 중간에 죽어도 검증용 줄을 실제 시연 데이터에 남기지 않는다.
    let clean = false;
    try {
      clean = await sweep(MARK);
    } catch {
      clean = false;
    }
    ok("뒷정리가 끝났다 (검증용 줄이 남지 않는다)", clean);
    await ctx.close();
  }
}

// ── 8. 결재 화면 ────────────────────────────────────────────────────────────
//
// 읽는 쪽만 본다. 서명·상신은 DB가 있어야 도는데(절차로만 찍히므로 목업에는
// 아예 길이 없다), 그 판정은 db:test 의 [15] 41개가 이미 지키고 있다.
// 여기서 확인할 것은 **화면이 그 판정과 같은 말을 하는가**다 —
// 결재함의 「대기」와 문서의 「지금 내 차례」가 어긋나면 두 화면 다 못 믿게 된다.
console.log("\n[8] 결재 — 결재함 · 결재란 · 업무 상세 탭");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    // ── 협조자 쪽: 내 차례인 문서가 대기함에 있다 ─────────────────────────
    const choi = await login(ctx, "최민재");
    await choi.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const home = await allText(choi);
    ok("홈이 내 차례인 결재를 알린다", /내 차례인 결재가\s*1\s*건 있습니다/.test(home));

    await choi.goto(`${BASE}/approvals`, { waitUntil: "domcontentloaded" });
    const inbox = await allText(choi);
    ok("결재함이 열린다", inbox.includes("결재함"));
    // 목록 줄 안에서 본다. 화면 전체 글자에서 찾으면 왼쪽 분류 링크의 「대기」로
    // 통과해 버린다 — 문서가 한 건도 없어도 초록불이 되는 시험이 된다.
    const rows = choi.locator("main ul > li:has(h3)");
    const first = (await rows.first().textContent()) ?? "";
    ok("대기함에 문서가 있다", (await rows.count()) >= 1, `${await rows.count()}건`);
    ok("그 줄에 「지금 내 차례」가 붙는다", first.includes("지금 내 차례"), first.slice(0, 80));
    ok("진행률이 분자·분모로 보인다", /진행 중 \d+\/\d+/.test(first), first.slice(0, 80));
    ok(
      "문서번호가 하이웍스 체계다",
      /HS-(보고|계획|검토|협조)-\d{8}-\d{4}/.test(first),
      first.slice(0, 80),
    );

    // ── 결재란 ────────────────────────────────────────────────────────────
    await rows.first().locator("h3 a").click();
    await choi.waitForLoadState("domcontentloaded");
    const doc = await allText(choi);
    ok("결재 문서가 열린다", doc.includes("결재란"));
    ok("서명 당시 직위가 결재란에 있다", doc.includes("단장") && doc.includes("팀장"));
    ok("서명한 칸에는 날짜가 찍힌다", /8월 5일/.test(doc));
    ok("아직 안 온 칸은 「대기」다", doc.includes("대기"));
    ok("협조 줄이 따로 있다", doc.includes("대기(병렬)"));
    ok(
      "본문이 그대로 실린다",
      doc.includes("동탄 트램 1호선 개통 일정이 확정되지 않아"),
    );
    ok("직위가 서명 당시의 것임을 화면이 밝힌다", doc.includes("서명 당시의 것"));

    // ── 같은 문서, 다른 계정 ──────────────────────────────────────────────
    // 기안자에게는 「내 차례」가 없다. 상신하면서 기안란에 이미 서명했기 때문이다.
    const url = choi.url();
    const other = await browser.newContext({ javaScriptEnabled: false });
    try {
      const kim = await login(other, "김서연");
      await kim.goto(url, { waitUntil: "domcontentloaded" });
      const seen = await allText(kim);
      ok("기안자도 같은 문서를 본다", seen.includes("결재란"));
      ok("기안자에게는 「지금 내 차례」가 없다", !seen.includes("지금 내 차례입니다"));
    } finally {
      await other.close();
    }

    // ── 기안 중인 문서는 기안자만 본다 ────────────────────────────────────
    const draftId = "ab000000-0000-4000-8000-000000000005";
    await choi.goto(`${BASE}/approvals/${draftId}`, { waitUntil: "domcontentloaded" });
    const denied = await allText(choi);
    ok(
      "남의 기안 중 문서는 열리지 않는다",
      denied.includes("결재 문서를 찾을 수 없습니다"),
    );
    ok(
      "권한이 없다고 말하지 않는다",
      denied.includes("없거나") && denied.includes("보이지 않습니다"),
    );

    // ── 업무 상세의 결재 탭 ───────────────────────────────────────────────
    const park = await login(ctx, "박준호");
    await park.goto(
      `${BASE}/works/f0000000-0000-4000-8000-000000000005?tab=approval`,
      { waitUntil: "domcontentloaded" },
    );
    const tab = await allText(park);
    // 탭이 그려졌는지는 그 안의 «문구»가 아니라 «자리»로 본다. 예전에는
    // 소개 문단의 한 구절을 표시로 삼았는데, 그 문단은 화면에서 지워질 수
    // 있는 글이고 실제로 지워졌다 — 그때 이 시험이 「결재 탭이 없다」고 말했다.
    ok(
      "업무 상세에 결재 탭이 있다",
      (await park.locator("#approval-heading").count()) === 1,
    );
    ok(
      "그 업무의 결재가 탭에 실린다",
      tab.includes("2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청"),
    );
    // 결재는 별도 이력 표를 만들지 않는다. 업무 이력에 함께 쌓이는 것이 그 증거다.
    await park.goto(
      `${BASE}/works/f0000000-0000-4000-8000-000000000005?tab=history`,
      { waitUntil: "domcontentloaded" },
    );
    const history = await allText(park);
    ok("결재 사건이 업무 이력에 함께 쌓인다", history.includes("상신했습니다"));
    ok("서명도 업무 이력에 남는다", history.includes("결재란에 서명했습니다"));

    // ── 기안자의 기안 중 문서 ─────────────────────────────────────────────
    await park.goto(`${BASE}/approvals?box=drafting`, { waitUntil: "domcontentloaded" });
    const drafts = await allText(park);
    ok("기안자에게는 기안 중 문서가 보인다", drafts.includes("청소차량 운행기록 전산화 도입 검토"));
    ok("기안 중인 문서에는 번호가 없다", !drafts.includes("HS-검토-"));

    // ── 전결 ──────────────────────────────────────────────────────────────
    await park.goto(`${BASE}/approvals/ab000000-0000-4000-8000-000000000002`, {
      waitUntil: "domcontentloaded",
    });
    const delegated = await allText(park);
    ok("전결란에 「전결」이 찍힌다", delegated.includes("전결"));
    ok(
      "전결 뒤 칸은 사선이고, 그 사실을 글자로도 적는다",
      delegated.includes("전결로 끝나 결재하지 않았습니다"),
    );
  } finally {
    await ctx.close();
  }
}

// ── 9. 「온나라로 넘기기」 ───────────────────────────────────────────────────
//
// 화면·파일·종이 셋이 **같은 모델**에서 나오는지를 본다. 하나라도 다른 말을
// 하면 근거를 붙이려고 만든 장치가 그 자리에서 거짓이 된다.
//
// 파일이 한/글에서 열리는지는 여기서 확인할 수 없다(브라우저가 하는 일이
// 아니다). 파일 쪽은 `npm run test:hwpx` 가 규격까지 보고, 한/글 실물 확인은
// 사람이 한 번 해야 한다 — 그때까지 정본은 인쇄(A4)다.
console.log("\n[9] 온나라로 넘기기 — 근거 꼬리표가 붙은 내보내기");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    const park = await login(ctx, "박준호");
    const submitted = "ab000000-0000-4000-8000-000000000001";

    // ── 문서에서 가는 길 ──────────────────────────────────────────────────
    await park.goto(`${BASE}/approvals/${submitted}`, {
      waitUntil: "domcontentloaded",
    });
    const detail = await allText(park);
    ok("상신된 문서에 「온나라로 넘기기」가 있다", detail.includes("온나라로 넘기기"));

    await park.goto(`${BASE}/approvals/${submitted}/export`, {
      waitUntil: "domcontentloaded",
    });
    const ex = await allText(park);

    ok("내보내기 화면이 열린다", ex.includes("한/글 파일로 내려받기"));
    ok(
      "온나라를 대체하지 않는다고 화면이 먼저 말한다",
      ex.includes("최종 결재권자의 서명은 「일머리」에서 받지 않습니다"),
    );
    // 이 제품은 「초록불을 본 적이 없으면 통과했다고 세지 않는다」를 지켜 왔다.
    // 화면에서만 예외를 두면 그 규칙이 무너진다.
    //
    // 문구는 「확인한 것 + 확인하지 못한 것」을 한 문장에 담도록 바뀌었다.
    // 시험이 지키는 것은 글자 그대로가 아니라 **못 한 일을 숨기지 않는가**이므로,
    // 둘 다 화면에 있는지 본다 — 규격 통과만 적고 실물 미확인을 빼면 실패한다.
    // 한동안 「아직 확인하지 못했습니다」가 있는지를 봤다. 실물로 열리는 것을
    // 확인해 그 문장을 걷어냈으므로, 이제는 **확인했다고 적는지**를 본다.
    // 지키는 것은 그대로다 — 검증 상태를 화면이 밝히는가.
    ok(
      "한/글 실물 검증 결과를 화면이 밝힌다",
      ex.includes("한/글에서 열리는 것을 확인했습니다"),
    );
    ok(
      "한/글이 없는 자리를 위한 폴백도 함께 밝힌다",
      ex.includes("한/글이 없는") && ex.includes("A4"),
    );
    ok("인쇄 폴백을 함께 안내한다", ex.includes("Ctrl+P"));

    // ── 근거 꼬리표 — **그 줄 안에서** 본다 ───────────────────────────────
    // 화면 전체 글자에서 「근거」를 찾으면 맨 아래 안내문으로 통과한다.
    // (인계서 보충 시험에서 실제로 그렇게 새어 나갔다)
    const sourced = park.locator("main p:has-text('근거:')");
    ok("근거 꼬리표가 줄마다 붙는다", (await sourced.count()) >= 5, `${await sourced.count()}줄`);
    const tags = (await sourced.allTextContents()).join(" | ");
    ok("협조란 서명이 근거로 실린다", tags.includes("결재 협조란 서명"));
    ok("「의견 있음」이 근거로 실린다", tags.includes("시행규칙 제4조"));
    ok("업무 대화가 근거로 실린다", tags.includes("업무 대화"));
    ok(
      "대화를 왜 골랐는지가 함께 적힌다",
      /업무 대화 · .+? · (협의|확인·회신|법령·기준|금액·수치|기한|약속)/.test(tags),
      tags.slice(0, 120),
    );
    // 인계 이야기는 이 결재의 근거가 아니다. 좁게 잡기로 한 규칙이 실제로 도는가.
    ok(
      "상관없는 대화(인사이동)는 근거로 안 실린다",
      !ex.includes("정기인사로 이 업무를 이하람 주무관에게"),
    );
    ok(
      "몇 건 중 몇 건인지 밝힌다",
      /대화\s*\d+\s*건 중\s*\d+\s*건/.test(ex.replace(/\s+/g, " ")),
    );

    // ── 종이 ──────────────────────────────────────────────────────────────
    const sheet = park.locator(".sheet");
    ok("인쇄용 문서가 DOM에 있다", (await sheet.count()) === 1);
    ok("화면에서는 감춰져 있다", (await sheet.isVisible()) === false);
    const paper = (await sheet.textContent()) ?? "";
    ok("종이에 별지 제2호서식이라고 적힌다", paper.includes("별지 제2호서식"));
    ok("종이에도 문서번호가 찍힌다", /HS-협조-\d{8}-\d{4}/.test(paper));
    ok("종이에도 결재란이 있다", paper.includes("결재") && paper.includes("협조"));
    // 종이와 화면이 같은 말을 하는가 — 여기가 이 마당의 핵심이다.
    ok("종이에도 근거 꼬리표가 실린다", paper.includes("근거: 결재 협조란 서명"));
    ok(
      "직위가 서명 당시의 것임을 종이도 밝힌다",
      paper.includes("서명 당시의 것"),
    );

    // ── 기안 중인 문서는 내보내지 않는다 ──────────────────────────────────
    const draft = "ab000000-0000-4000-8000-000000000005";
    await park.goto(`${BASE}/approvals/${draft}/export`, {
      waitUntil: "domcontentloaded",
    });
    const blocked = await allText(park);
    ok("기안 중인 문서는 내보내기가 막힌다", blocked.includes("아직 내보낼 수 없습니다"));
    ok(
      "왜 막는지를 적는다",
      blocked.includes("문서번호가 없고 본문도 얼어붙지 않았으므로"),
    );
    // 화면만 막고 주소로는 뚫리면 막은 것이 아니다.
    const direct = await ctx.request.get(`${BASE}/approvals/${draft}/export/hwpx`, {
      maxRedirects: 0,
    });
    ok(
      "주소를 직접 쳐도 파일이 안 나온다",
      direct.status() === 303,
      `status=${direct.status()}`,
    );

    // ── 실제로 파일이 떨어지는가 ──────────────────────────────────────────
    const file = await ctx.request.get(`${BASE}/approvals/${submitted}/export/hwpx`);
    ok("파일이 내려온다", file.status() === 200, `status=${file.status()}`);
    const headers = file.headers();
    ok(
      "첨부로 내려간다(브라우저가 열지 않는다)",
      (headers["content-disposition"] ?? "").startsWith("attachment;"),
      headers["content-disposition"],
    );
    ok(
      "한글 파일 이름이 RFC 5987 로 실린다",
      (headers["content-disposition"] ?? "").includes("filename*=UTF-8''"),
    );
    ok(
      "공문서라 캐시하지 않는다",
      (headers["cache-control"] ?? "").includes("no-store"),
      headers["cache-control"],
    );
    const body = await file.body();
    ok("ZIP 이다", body[0] === 0x50 && body[1] === 0x4b, `${body[0]},${body[1]}`);
    ok(
      "첫 항목이 무압축 mimetype 이다",
      body.subarray(30, 38).toString("latin1") === "mimetype" &&
        body.readUInt16LE(8) === 0,
    );
    ok(
      "내용이 application/hwp+zip 이다",
      body.subarray(38, 57).toString("latin1") === "application/hwp+zip",
    );

    // ── 남이 못 보는 문서는 파일도 안 나온다 ──────────────────────────────
    const outsider = await browser.newContext({ javaScriptEnabled: false });
    try {
      await login(outsider, "이하람");
      const denied = await outsider.request.get(
        `${BASE}/approvals/${draft}/export/hwpx`,
        { maxRedirects: 0 },
      );
      ok(
        "볼 수 없는 문서는 파일이 안 나온다",
        denied.status() === 303,
        `status=${denied.status()}`,
      );
      ok(
        "결재함으로 돌려보낸다",
        (denied.headers()["location"] ?? "").includes("/approvals?msg=denied"),
        denied.headers()["location"],
      );
    } finally {
      await outsider.close();
    }
  } finally {
    await ctx.close();
  }
}

// ── 10. PWA 는 덧붙이는 층이다 ──────────────────────────────────────────────
//
// 설치하지 않아도, 서비스워커가 없어도, 스크립트가 꺼져 있어도 앱은 그대로
// 돌아야 한다. 여기서 보는 것은 「얹은 것이 새는 데가 없는가」다.
console.log("\n[10] PWA — 설명서 · 서비스워커 · 오프라인 안내");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    // 셋 다 **로그인하지 않은 채로** 읽혀야 한다. 로그인 화면으로 튕기면
    // 설치는 「설명서를 못 읽는다」로, 서비스워커는 「스크립트가 아니다」로
    // 조용히 실패한다.
    const manifest = await ctx.request.get(`${BASE}/manifest.webmanifest`);
    ok("설명서가 익명으로 읽힌다", manifest.status() === 200, `${manifest.status()}`);
    const m = await manifest.json();
    ok("설치 이름이 있다", m.short_name === "일머리");
    ok("시작 주소가 있다", m.start_url === "/");
    ok(
      "192·512 아이콘이 둘 다 있다",
      m.icons?.some((i) => i.sizes === "192x192") &&
        m.icons?.some((i) => i.sizes === "512x512"),
    );
    ok(
      "잘려도 되는 아이콘(maskable)이 따로 있다",
      m.icons?.some((i) => i.purpose === "maskable"),
    );

    const sw = await ctx.request.get(`${BASE}/sw.js`);
    ok("서비스워커가 익명으로 읽힌다", sw.status() === 200, `${sw.status()}`);
    ok(
      "서비스워커는 캐시되지 않는다",
      (sw.headers()["cache-control"] ?? "").includes("no-cache"),
      sw.headers()["cache-control"],
    );
    const swBody = await sw.text();
    // 이 파일의 주장 자체를 시험한다 — 화면(HTML)은 한 줄도 캐시하지 않는다.
    ok(
      "화면 이동은 네트워크로만 간다",
      swBody.includes('request.mode === "navigate"') &&
        /navigate[\s\S]{0,400}fetch\(request\)\.catch/.test(swBody),
    );
    ok(
      "GET 이 아니면 손대지 않는다",
      swBody.includes('request.method !== "GET"'),
    );

    const offline = await ctx.request.get(`${BASE}/offline`);
    ok("오프라인 안내가 익명으로 읽힌다", offline.status() === 200);
    const offlineText = await offline.text();
    ok("연결이 끊겼다고 말한다", offlineText.includes("연결이 끊겼습니다"));
    // 미리 담아 두는 유일한 화면이라 내용이 하나도 없어야 한다.
    ok(
      "그 화면에는 업무도 이름도 없다",
      !offlineText.includes("박준호") && !offlineText.includes("자원순환과"),
    );

    // 스크립트가 꺼져 있어도 앱은 그대로 돈다 — 그게 「덧붙이는 층」의 뜻이다.
    // (「서비스워커가 등록되지 않았다」를 재려던 줄이 있었는데 상수식이라
    //  아무것도 증명하지 못했다. 통과 건수만 올리는 줄은 지운다 —
    //  「초록불을 본 적 없으면 통과했다고 세지 않는다」와 같은 규칙이다)
    const page = await login(ctx, "박준호");
    await page.goto(`${BASE}/works`, { waitUntil: "domcontentloaded" });
    ok("보드는 그대로 돈다", (await allText(page)).includes("업무 보드"));
  } finally {
    await ctx.close();
  }
}

// ── 11. 무JS 전제를 지키는 구조인가 ─────────────────────────────────────────
//
// 위 시험들은 「화면이 도는가」를 본다. 그런데 그것만으로는 이 회귀를 못 잡는다 —
// loading.tsx 나 <Suspense> 를 하나 넣으면 본문이 <div hidden id="S:n"> 조각으로
// 흘러오고 인라인 스크립트가 제자리로 옮기는데, 시험이 textContent 를 읽으면
// display:none 인 글자까지 세어 **초록불이 그대로 남는다**(174건 중 103건).
//
// 그래서 화면이 아니라 **서버가 보낸 HTML 자체**를 본다. 조각이 하나라도 있으면
// 자바스크립트를 끈 브라우저에서 그만큼이 안 보인다는 뜻이다.

console.log("\n[11] 무JS — 본문이 HTML 에 통째로 실려 오는가");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await login(ctx, "박준호");
    for (const path of ["/", "/works", "/approvals", "/handover", "/audit"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      const html = await page.content();
      const fragments = (html.match(/<div hidden id="S:/g) ?? []).length;
      ok(
        `${path} 는 스트리밍 조각 없이 온다`,
        fragments === 0,
        fragments > 0 ? `조각 ${fragments}개 — 무JS 에서 이만큼이 안 보인다` : "",
      );
    }

    // 본문이 실제로 보이는지도 함께 본다. 조각이 0개인데 <main> 이 비어 있으면
    // 다른 이유로 깨진 것이다.
    await page.goto(`${BASE}/works`, { waitUntil: "domcontentloaded" });
    const mainText = await page.locator("main").innerText();
    ok("무JS 에서 <main> 에 본문이 있다", mainText.length > 200, `${mainText.length}자`);
  } finally {
    await ctx.close();
  }
}

// ── 11. 프로필 — 고칠 수 있는 것과 없는 것이 화면에서 갈리는가 ──────────────
console.log("\n[11] 프로필 — 내 것 · 남의 것 · 휴대전화 공개 규칙");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await login(ctx, "김서연");

    // 머리 줄의 이름·아바타가 프로필로 가는 문이다. 이게 없으면 주소를 직접
    // 치지 않는 한 이 화면에 도달할 길이 없다.
    ok(
      "머리 줄에서 내 프로필로 가는 링크가 있다",
      (await page.locator('header a[href="/me"]').count()) === 1,
    );

    await page.goto(`${BASE}/me`, { waitUntil: "domcontentloaded" });
    const me = await allText(page);

    ok("내 프로필이 열린다", me.includes("김서연"));
    ok("가입 때 등록한 이메일이 보인다", me.includes("demo01@ilmeori.demo"));
    ok("내선번호가 보인다", /031-000-\d{4}/.test(me), me.match(/031-000-\d{4}/)?.[0]);
    ok("내 휴대전화가 보인다", /010-0000-\d{4}/.test(me), me.match(/010-0000-\d{4}/)?.[0]);

    // 이 화면의 요점 — 소속은 칸이 아니라 절차다.
    ok("소속을 못 바꾼다고 화면이 말한다", me.includes("본인이 바꿀 수 없습니다"));
    ok("부서 이동 자리가 있다", me.includes("부서 이동"));
    ok(
      "승인이 필요하다고 적혀 있다",
      me.includes("승인해야 소속이 바뀝니다"),
    );
    // 소속을 직접 고치는 칸이 화면에 있으면 안 된다. 서버와 DB 가 막지만,
    // 「막히는 칸」을 그려 두는 것 자체가 이 화면이 하는 말과 어긋난다.
    ok(
      "소속을 직접 고치는 칸이 없다",
      (await page.locator('form select[name="department_id"]').count()) === 0,
    );

    // 스크립트 없이도 폼이 실제로 서 있는가. 데모 모드에서는 읽기 전용이라
    // 폼 자체가 없는 것이 맞다 — 어느 쪽이든 한 가지 상태여야 한다.
    const contactForms = await page.locator('input[name="mobile"]').count();
    const readonly = me.includes("지금은 읽기 전용입니다");
    ok(
      "연락처 폼이 있거나, 없는 이유가 적혀 있다",
      contactForms === 1 || readonly,
      `폼 ${contactForms}개 · 읽기전용 ${readonly}`,
    );

    // ── 남의 프로필 ─────────────────────────────────────────────────────────
    // 박준호는 휴대전화를 등록했지만 **공개하지 않았다**(mock/org.ts).
    // 그러니 남의 화면에는 번호가 없어야 한다. 이 한 줄이 0023 의 전부다.
    await page.goto(`${BASE}/people/${ACCOUNTS["박준호"]}`, {
      waitUntil: "domcontentloaded",
    });
    const other = await allText(page);
    ok("남의 프로필이 열린다", other.includes("박준호"));
    ok("남의 내선번호는 보인다", /031-000-\d{4}/.test(other));
    ok(
      "★ 공개하지 않은 휴대전화는 남에게 안 보인다",
      !/010-0000-\d{4}/.test(other),
      other.match(/010-0000-\d{4}/)?.[0] ?? "",
    );
    ok("대신 공개하지 않았다고 말한다", other.includes("공개하지 않았습니다"));

    // 최민재는 공개했다. 같은 화면이 공개한 사람에게는 번호를 보여야
    // 「안 보이는 것」이 규칙 때문이지 화면이 고장 난 것이 아님이 확인된다.
    await page.goto(`${BASE}/people/${ACCOUNTS["최민재"]}`, {
      waitUntil: "domcontentloaded",
    });
    const open = await allText(page);
    ok("★ 공개한 사람의 휴대전화는 보인다", /010-0000-\d{4}/.test(open));

    // 없는 사람. notFound() 를 안 쓰기로 했으므로 본문이 실제로 그려져야 한다.
    await page.goto(`${BASE}/people/00000000-0000-4000-8000-000000000000`, {
      waitUntil: "domcontentloaded",
    });
    ok(
      "없는 직원 주소가 빈 화면이 아니다",
      (await allText(page)).includes("그런 직원이 없습니다"),
    );
  } finally {
    await ctx.close();
  }
}

// ── 12. 조직도 — 훑고, 이름을 누르고, 그래도 안 새는가 ──────────────────────
console.log("\n[12] 조직도 — 명부 · 떠 있는 인물 카드");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await login(ctx, "김서연");

    // 왼쪽 메뉴에 자리가 있어야 한다. 주소를 직접 쳐야만 닿는 화면은 없는 것과 같다.
    ok(
      "왼쪽 메뉴에 조직도가 있다",
      (await page.locator('nav a[href="/org"]').count()) >= 1,
    );

    await page.goto(`${BASE}/org`, { waitUntil: "domcontentloaded" });
    const list = await allText(page);

    ok("조직도가 열린다", list.includes("조직도"));
    // 조직도는 일부가 아니라 전부여야 한다. 실·국 첫 것과 끝 것, 그리고
    // 사람이 한 명도 없는 과가 함께 실려 있는지 본다.
    ok("첫 실·국이 있다", list.includes("공보실"));
    ok("끝 실·국이 있다", list.includes("기후에너지환경국"));
    ok("사람이 없는 과도 빠지지 않는다", list.includes("홍보담당관"));
    ok("과가 하는 일이 실린다", list.includes("청소행정, 자원순환, 자원화시설"));
    ok("내 부서에 표시가 붙는다", list.includes("우리 과"));

    // ★ 이 화면의 요점. 명부 자체에는 **어떤 전화번호도 실려 있지 않다.**
    // 스무 명분 카드를 미리 그려 두고 CSS 로 감추는 방법을 안 쓴 이유가 이것이라,
    // 감추기로 되돌아가면 여기서 걸린다.
    ok(
      "★ 명부에는 전화번호가 한 건도 실려 있지 않다",
      !/0(31-000|10-0000)-\d{4}/.test(list),
      list.match(/0(31-000|10-0000)-\d{4}/)?.[0] ?? "",
    );

    // ── 이름을 누른다. 스크립트가 꺼진 채로 ─────────────────────────────────
    await page.locator(`#p-${ACCOUNTS["박준호"]}`).click();
    await page.waitForLoadState("domcontentloaded");

    ok(
      "★ 스크립트 없이도 카드가 열린다",
      (await page.locator('[role="dialog"]').count()) === 1,
    );
    ok("주소에 누른 사람이 남는다", page.url().includes(`person=${ACCOUNTS["박준호"]}`));

    const card = await page.locator('[role="dialog"]').innerText();
    ok("카드에 이름이 있다", card.includes("박준호"));
    ok("카드에 이메일이 있다", card.includes("demo02@ilmeori.demo"));
    ok("카드에 내선번호가 있다", /031-000-\d{4}/.test(card));
    // 박준호는 휴대전화를 등록했지만 공개하지 않았다(mock/org.ts).
    // /people/[id] 와 같은 규칙이 이 창에도 걸리는지 본다 — 조회층이 하나이므로
    // 갈릴 수 없어야 하고, 갈리면 그건 두 벌로 적혔다는 뜻이다.
    ok(
      "★ 공개하지 않은 휴대전화는 카드에도 안 나온다",
      !/010-0000-\d{4}/.test(card),
      card.match(/010-0000-\d{4}/)?.[0] ?? "",
    );
    ok("대신 공개하지 않았다고 말한다", card.includes("공개하지 않았습니다"));

    // 닫는 것도 링크다.
    await page.locator("#person-card-close").click();
    await page.waitForLoadState("domcontentloaded");
    ok(
      "★ 스크립트 없이도 카드가 닫힌다",
      (await page.locator('[role="dialog"]').count()) === 0,
    );
    ok("닫으면 눌렀던 줄로 돌아온다", page.url().endsWith(`#p-${ACCOUNTS["박준호"]}`));

    // 공개한 사람은 보여야 한다. 안 보이는 것이 규칙 때문이지 고장이 아님을
    // 같은 화면에서 확인할 수 있어야 한다.
    await page.goto(`${BASE}/org?person=${ACCOUNTS["최민재"]}`, {
      waitUntil: "domcontentloaded",
    });
    ok(
      "★ 공개한 사람의 휴대전화는 카드에 보인다",
      /010-0000-\d{4}/.test(await page.locator('[role="dialog"]').innerText()),
    );

    // 주소를 손으로 고친 경우. 없는 사람도, uuid 가 아닌 값도 화면을 죽이지 않는다.
    await page.goto(`${BASE}/org?person=00000000-0000-4000-8000-000000000000`, {
      waitUntil: "domcontentloaded",
    });
    ok(
      "없는 사람은 빈 창이 아니라 그렇다고 말한다",
      (await allText(page)).includes("그런 직원이 없습니다"),
    );
    const junk = await page.goto(`${BASE}/org?person=not-a-uuid`, {
      waitUntil: "domcontentloaded",
    });
    ok("uuid 가 아닌 값에 화면이 죽지 않는다", junk.status() === 200, `${junk.status()}`);
    ok(
      "uuid 가 아니면 창을 아예 열지 않는다",
      (await page.locator('[role="dialog"]').count()) === 0,
    );

    // ── 찾기 — GET 폼이라 스크립트가 없어도 돈다 ────────────────────────────
    await page.goto(`${BASE}/org?q=${encodeURIComponent("자원")}`, {
      waitUntil: "domcontentloaded",
    });
    // 본문만 본다. `allText` 는 머리 줄까지 담는데, 거기에는 보고 있는 사람의
    // 소속(김서연 → 전국체전추진단)이 늘 적혀 있다 — 그걸 명부의 결과로 세면
    // 「걸러졌는가」를 묻는 시험이 언제나 실패한다. 실제로 한 번 그렇게 걸렸다.
    const found = await page.locator("main").innerText();
    ok("찾은 것이 남는다", found.includes("자원순환과"));
    ok("걸리지 않은 과는 빠진다", !found.includes("전국체전추진단"));
    ok("하는 일로도 찾는다", found.includes("해양수산과"));
    ok("걸러진 화면에서는 「찾은 사람」이라고 말한다", found.includes("찾은 사람"));

    // ── 오와 열 ─────────────────────────────────────────────────────────────
    // 이 화면의 약속은 「세 열이 한 세로선에 선다」이고, 그건 CSS 격자를 한 곳에서
    // 정의했기 때문에 성립한다. 두 벌로 갈라지면 여기서 걸린다.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/org`, { waitUntil: "domcontentloaded" });
    const columns = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("section ul > li")].slice(0, 12);
      const xs = rows.map((li) =>
        [...li.children].map((c) => Math.round(c.getBoundingClientRect().x)),
      );
      return { rows: xs.length, unique: xs.map((x) => x.join(",")) };
    });
    ok("줄이 실제로 그려졌다", columns.rows >= 5, `${columns.rows}줄`);
    ok(
      "★ 모든 줄의 세 열이 같은 세로선에서 시작한다",
      new Set(columns.unique).size === 1,
      [...new Set(columns.unique)].join(" / "),
    );
  } finally {
    await ctx.close();
  }
}

await browser.close();

console.log(`\n통과 ${pass}건 / 실패 ${fails.length}건`);
if (fails.length) {
  console.log("\n실패한 것:");
  for (const f of fails) console.log(" - " + f);
  process.exit(1);
}
