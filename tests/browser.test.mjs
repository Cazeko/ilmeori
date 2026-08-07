/**
 * 브라우저 왕복 시험 — **거의 전부 자바스크립트를 끈 상태로** 돌린다.
 *
 * 예외는 세 건뿐이고, 셋 다 「스크립트가 있을 때만 나타나야 하는 것」을 본다
 * (인쇄 버튼 1건, 실시간 상자 2건). 나머지는 전부 스크립트를 끈 채로 돈다.
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
  ok(
    "현안이 아닌 대화는 안 실렸다",
    !body.includes("정기인사로 이 업무를 이하람 주무관에게"),
  );
  ok("「확인된 현안사항이 없습니다」가 사라졌다", !body.includes("확인된 현안사항이 없습니다"));
  ok("근거 꼬리표가 몇 건 중 몇 건인지 밝힌다", /대화 \d+건 중 .*?\d+건/.test(body));
  ok("인용은 원문 그대로다(요약이 아니다)", body.includes("“") && body.includes("”"));

  // ── 2. 인쇄 서식 ──────────────────────────────────────────────────────────
  console.log("\n[2] 인쇄 서식");
  const sheet = page.locator(".print-sheet");
  ok("인쇄용 문서가 DOM에 있다", (await sheet.count()) === 1);
  ok("화면에서는 감춰져 있다", (await sheet.isVisible()) === false);

  const raw = (await sheet.textContent()) ?? "";
  ok("서식 제목이 있다", raw.includes("업무인계·인수서"));
  ok("인계자·인수자 표가 있다", raw.includes("인계자") && raw.includes("인수자"));
  ok("인계일이 찍힌다", raw.includes("인계일"));
  ok("서명란이 있다", raw.includes("(서명 또는 인)") && raw.includes("입회자"));
  ok("일곱 항목이 모두 들어간다", raw.includes("1-가.") && raw.includes("4. 그 밖의 참고사항"));
  ok("종이에도 대화 인용이 실린다", raw.includes("[대화 —"));
  ok("출처 요약이 맨 아래에 있다", raw.includes("서식 순서대로 뽑아 정리한 것입니다"));
  ok("종이에는 근거 꼬리표가 안 나온다", !raw.includes("근거:"));
  ok("물품·예산은 손으로 적을 빈칸이다", raw.includes("재무회계시스템"));

  await page.emulateMedia({ media: "print" });
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
    await page.locator("details:has-text('이 업무가 보이는 이유') summary").click();
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
  await page.locator("header form button[type=submit]").click();
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
    .locator(".print-sheet thead th")
    .first()
    .evaluate((el) => getComputedStyle(el).fontWeight);
  ok("인쇄용 표 머리글이 굵다", th === "700", th);
  const td = await page
    .locator(".print-sheet tbody td")
    .first()
    .evaluate((el) => getComputedStyle(el).fontWeight);
  ok("데이터 칸은 굵지 않다", td === "400", td);
  const foot = (await page.locator(".print-sheet footer").textContent()) ?? "";
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
  await p2.waitForTimeout(1200);
  await pick(p2, "박준호");
  await p2.waitForTimeout(1500);
  await p2.goto(WORK, { waitUntil: "networkidle" });
  await p2.waitForTimeout(8000); // 구독 왕복에 몇 초가 걸린다
  const live = await p2.locator("body").innerText();
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
    "8초가 지나도 「실시간 연결 중」이다",
  );
  // 그리고 적은 대로여야 한다. 끊겼는데 「연결됨」이라고 적으면 화면이 거짓말이다.
  ok(
    "연결 상태를 있는 그대로 적는다",
    live.includes("실시간 연결됨")
      ? live.includes("보고 있습니다")
      : live.includes("새로고침하면 최신 상태를 볼 수 있습니다"),
    live.includes("실시간 연결됨")
      ? "「연결됨」인데 접속자 줄이 없다"
      : "0012 를 SQL Editor 에서 돌리면 「연결됨」이 된다",
  );
  await on.close();
}

await browser.close();

console.log(`\n통과 ${pass}건 / 실패 ${fails.length}건`);
if (fails.length) {
  console.log("\n실패한 것:");
  for (const f of fails) console.log(" - " + f);
  process.exit(1);
}
