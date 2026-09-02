/**
 * 인계 3인 확인 절차를 실제 화면에서 눌러 본다(0026).
 *
 *   npm run test:handover-flow
 *
 * 데모 모드 빌드가 :3210 에 떠 있어야 한다(tests/browser.test.mjs 와 같은 전제).
 * 계정을 세 번 갈아타며 박준호 확인 → 이하람 확인 → 한상우 승인까지 간다.
 *
 * 이 절차는 표 하나로도, 화면 하나로도 확인이 안 된다 — **세 사람이 차례로
 * 눌러야** 비로소 서식의 서명란 세 줄이 찬다. 그래서 단위 시험이 아니라
 * 브라우저를 세우고 실제로 눌러 보는 시험으로 둔다.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3210";
let failed = 0;
const ok = (label, cond, detail = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed++;
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

async function login(name) {
  // 세션 쿠키만 지운다. 데모 진행 상태(ilmeori.state)까지 지우면 방금 누른
  // 확인 서명이 함께 날아가고, 이 시험이 검사하려는 것이 사라진다.
  const keep = (await ctx.cookies()).filter((c) => c.name !== "ilmeori.demo");
  await ctx.clearCookies();
  await ctx.addCookies(keep);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }),
    page.getByRole("button", { name: new RegExp(name) }).first().click(),
  ]);
  await page.waitForLoadState("networkidle");
}

async function handoverText() {
  await page.goto(`${BASE}/handover`, { waitUntil: "networkidle" });
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

console.log("\n[1] 로그인 화면에 다섯 계정이 선다");
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
{
  const body = await page.locator("body").innerText();
  for (const n of ["김서연", "박준호", "이하람", "최민재", "한상우"]) {
    ok(`${n} 계정이 있다`, body.includes(n));
  }
}

console.log("\n[2] 인계자(박준호) — 확인 서명");
await login("박준호");
{
  const t = await handoverText();
  ok("확인 서명 단계다", t.includes("확인 서명"), t.match(/\d\/4 [^ ]+/)?.[0] ?? "");
  ok("한/글 내려받기가 아직 안 나온다", !t.includes("한/글 파일(.hwpx)"));
  const btn = page.getByRole("button", { name: "내용을 확인했습니다" });
  ok("확인 단추가 있다", (await btn.count()) > 0);
  await btn.first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  ok("혼자 눌러서는 안 넘어간다", after.includes("확인 서명"));
  ok("인수자를 기다린다고 말한다", after.includes("이하람"));
}

console.log("\n[3] 인수자(이하람) — 확인 서명");
await login("이하람");
{
  const t = await handoverText();
  ok("인수자에게도 확인 단추가 있다", t.includes("내용을 확인했습니다"));
  await page.getByRole("button", { name: "내용을 확인했습니다" }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  ok("★ 둘 다 확인하면 결재 상신으로 넘어간다", after.includes("결재 상신"));
  ok("입회자 이름이 나온다", after.includes("한상우"));
  ok("결재용 한/글이 나온다", after.includes("한/글 파일(.hwpx)"));
  ok("인수자에게는 완료 단추가 없다", !after.includes("인계 완료 처리"));
}

console.log("\n[4] 서식 서명란에 확인 시각이 찍힌다");
{
  // 서식 맨 위에도 「인계자」가 붙은 표가 있다(소속·직급·성명). 서명란만 본다.
  const all = await page.locator("body").innerText();
  const sign = all.slice(all.indexOf("위와 같이 업무를 인계·인수합니다"));
  const box = sign.slice(0, 300);
  ok("인계자 줄에 확인한 날짜가 찍힌다", /인계자\s+박준호[^\n]*확인/.test(box), box.split("\n").find((l) => l.startsWith("인계자")) ?? "");
  ok("인수자 줄에도 찍힌다", /인수자\s+이하람[^\n]*확인/.test(box), box.split("\n").find((l) => l.startsWith("인수자")) ?? "");
  ok("입회자 줄에 이름이 찍힌다", /입회자\s+한상우/.test(box));
  ok("입회자는 아직 서명 전이다", /입회자[^\n]*\(서명 또는 인\)/.test(box));
}

console.log("\n[5] 입회자(한상우) — 결재 결과를 적고 완료");
await login("한상우");
{
  const t = await handoverText();
  ok("입회자가 인계 건을 본다", t.includes("업무인계·인수"), t.slice(0, 60));
  ok("입회자 차례라고 말한다", t.includes("인계 완료 처리"));
  await page.getByText("인계 완료 처리").first().click();
  const input = page.locator('input[name="witnessNote"]');
  ok("결재 문서번호 칸이 있다", (await input.count()) > 0);
  await input.first().fill("자원순환과-2026-0812");
  await page.getByRole("button", { name: /인계를 완료합니다/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  ok("★ 인계가 완료된다", after.includes("인수 완료"), after.slice(0, 120));
}

console.log("\n[6] 인수자에게 업무가 넘어왔다");
await login("이하람");
{
  const t = await handoverText();
  ok("인수 완료로 보인다", t.includes("인수 완료"));
}

console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
