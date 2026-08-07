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
  const rows = (p = page) => p.locator('li:has(input[name="noteId"])');

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
      (await page.locator(".print-sheet div.border-black").count()) === 1,
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

      const sheet = (await page.locator(".print-sheet").textContent()) ?? "";
      ok("종이에도 실린다", sheet.includes(text));
      ok("종이에서는 이름과 날짜가 붙는다", sheet.includes("인계자 보충 — 박준호"));
      ok(
        "적어 넣었으면 손으로 적을 빈칸은 인쇄하지 않는다",
        (await page.locator(".print-sheet div.border-black").count()) === 0,
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

await browser.close();

console.log(`\n통과 ${pass}건 / 실패 ${fails.length}건`);
if (fails.length) {
  console.log("\n실패한 것:");
  for (const f of fails) console.log(" - " + f);
  process.exit(1);
}
