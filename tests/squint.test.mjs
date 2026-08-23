/**
 * 실눈 시험 — 화면을 흐리게 만들었을 때 **덩어리 하나가 남는가.**
 *
 * 1차예선 심사평이 이렇게 말했다. "대시보드의 각 디자인들이 모두 평평하기
 * 때문에, 바로 무엇이 핵심이고 무엇이 보조이고 무엇을 봐야하는지 시선이
 * 직관적으로 눈에 들어오지 않음."
 *
 * 「평평하다」를 눈으로만 판정하면 고쳤는지 아닌지를 매번 다투게 된다.
 * 그래서 재는 방법을 정한다 — **본문에 8px 블러를 먹인다.** 글자가 다
 * 뭉개지고 덩어리만 남는데, 그때 눈에 남는 덩어리가 하나면 위계가 있는
 * 것이고 비슷한 사각형 여럿이면 평평한 것이다.
 *
 * ── 무엇을 재는가 ───────────────────────────────────────────────────────────
 *
 * 흐린 본문을 6×4 격자로 나누고 칸마다 평균 밝기를 잰다.
 *
 *   기준선   칸들의 **중앙값** — 아무것도 없는 바탕의 밝기
 *   무게(칸) |칸 평균 - 기준선|  ← 밝은 쪽이든 어두운 쪽이든 「뭔가 있다」
 *   지배도   1등 칸의 무게 / 2~5등 칸 무게의 평균
 *
 * 기준선을 최댓값이나 최솟값이 아니라 중앙값으로 잡는 이유: 이 앱은 판이
 * 바탕(#f0f1f2)보다 **밝고**(#fafafa) 글자는 어둡다. 한쪽 끝을 기준으로
 * 잡으면 밝은 판과 어두운 글자 중 한쪽만 「무게」로 세게 된다.
 *
 * ── 이 숫자를 얼마나 믿는가 ────────────────────────────────────────────────
 *
 * 거칠다. 격자를 어디서 끊느냐에 따라 몇 십분의 일은 움직이고, 화면에 실제로
 * 담긴 데이터(급한 일이 한 건이냐 다섯 건이냐)에도 흔들린다. 그래서 **되돌아
 * 가는 것만 막는 문턱**으로 쓴다 — 1.5 아래로 떨어지면 그건 「히어로가 다시
 * 주변과 같은 무게가 됐다」는 뜻이고, 그 정도는 이 숫자로도 잡힌다.
 *
 * 이 시험의 진짜 결과물은 숫자가 아니라 **남는 그림 두 장**이다.
 * docs/screenshots/squint-*.png 에 또렷한 판과 흐린 판이 나란히 남는다.
 * 고치기 전 판과 나란히 두면 무엇이 달라졌는지 한 장으로 설명된다.
 *
 * 돌리는 법 (playwright 는 이 저장소의 의존성이 아니다 — 시험 전용이라 일부러 뺐다)
 *   npm i -D playwright && npx playwright install chromium
 *   npm run build && npm start &
 *   npm run test:squint
 */

import { mkdir, writeFile } from "node:fs/promises";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright 가 없다. 시험이 실패한 것이 아니라 아직 안 돌린 것이다.\n" +
      "  npm i -D playwright && npx playwright install chromium",
  );
  process.exit(0);
}

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("../docs/screenshots/", import.meta.url);

/**
 * 어느 화면을 재는가.
 *
 * `assert: true` 는 **히어로를 하나 두기로 설계한 화면**에만 붙인다.
 *
 * 업무 보드는 재되 판정하지 않는다. 칸반은 **네 열이 균등한 것이 옳고**,
 * 그 안의 위계는 「지연된 카드 한 장이 튀는가」이지 「한 덩어리가 화면을
 * 지배하는가」가 아니다. 문턱을 만족시키려고 열을 불균등하게 만드는 것은
 * 앞뒤가 바뀐 일이다. 그림은 두 화면 다 남는다.
 *
 * ── 실측 (2026-08-23, 1440×1000) ───────────────────────────────────────────
 *              고치기 전   고친 뒤
 *   홈           1.34 ✗     1.67 ✓
 *   업무 보드    1.96       2.52
 *
 * 처음에는 본문 전체(스크롤 아래까지)를 쟀는데, 그때는 업무 보드가 2.16 →
 * 1.78 로 **내려갔다.** 아래쪽 목록의 글자 무게가 위쪽을 희석한 탓이었다.
 * 첫 화면만 재도록 고치자 방향이 뒤집혔다 — 지표를 고른 방식이 결론을 바꾼
 * 자리라 여기 적어 둔다. 재는 자리를 첫 화면으로 정한 근거는 아래 clip 주석에.
 */
const SCREENS = [
  { name: "home", path: "/", label: "홈", assert: true },
  { name: "works", path: "/works", label: "업무 보드", assert: false },
];

/** 이 아래로 떨어지면 히어로가 주변과 같은 무게가 된 것이다. */
const MIN_DOMINANCE = 1.5;
const BLUR_PX = 8;
const COLS = 6;
const ROWS = 4;

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

// 데모 계정으로 들어간다. 로그인 화면의 첫 계정 단추가 김서연이다.
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }),
  page.locator("form button").first().click(),
]);

await mkdir(OUT, { recursive: true });

for (const screen of SCREENS) {
  await page.goto(`${BASE}${screen.path}`, { waitUntil: "networkidle" });
  // 폰트가 다 앉은 뒤에 찍는다 — 글자가 아직 없는 화면을 재면 전부 평평하다.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  // **첫 화면만** 잰다. 심사평이 말한 것은 「첫인상」이고, 실제로 심사위원이
  // 보는 것도 스크롤하기 전의 한 판이다. element.screenshot() 을 그냥 쓰면
  // 본문 전체(스크롤 아래까지)가 잡혀서, 아래쪽 목록의 글자 무게가 위쪽
  // 히어로를 희석한다.
  // 맨 위로 올린 뒤에 잰다. boundingBox() 는 **지금 보이는 창 기준**이라,
  // 앞 화면에서 스크롤이 남아 있으면 y 가 창 밖으로 나가고 자를 높이가
  // 음수가 된다(실제로 여기서 한 번 터졌다).
  await page.evaluate(() => window.scrollTo(0, 0));
  const view = page.viewportSize();
  const box = await page.locator("main").boundingBox();
  const clip = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: Math.max(1, Math.min(box.height, view.height - box.y)),
  };

  await writeFile(
    new URL(`squint-${screen.name}-sharp.png`, OUT),
    await page.screenshot({ clip }),
  );

  // 블러는 브라우저에게 시킨다. 직접 짜면 반드시 사람 눈과 다른 커널이 된다.
  // 옆줄·머리 줄은 모든 화면에서 같으므로 본문(main)에만 건다.
  await page.evaluate((px) => {
    const el = document.querySelector("main");
    if (el) el.style.filter = `blur(${px}px)`;
  }, BLUR_PX);
  const blurred = await page.screenshot({ clip });
  await writeFile(new URL(`squint-${screen.name}-blur.png`, OUT), blurred);

  // 흐린 그림 한 장을 브라우저 안에서 한 번에 격자로 잰다.
  // (칸마다 스크린샷을 따로 찍으면 24번 왕복이고, 그만큼 느리다)
  const cells = await page.evaluate(
    async ([b64, cols, rows]) => {
      // fetch("data:…") 로 풀지 않는다 — 이 앱의 CSP(proxy.ts)가 data: 를
      // connect-src 에 넣어 주지 않아 「Failed to fetch」로 막힌다. 시험을
      // 통과시키려고 제품의 CSP 를 느슨하게 하는 것은 앞뒤가 바뀐 일이라,
      // 여기서 바이트로 직접 푼다.
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0);
      const out = [];
      const cw = Math.floor(bmp.width / cols);
      const ch = Math.floor(bmp.height / rows);
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const { data } = cx.getImageData(c * cw, r * ch, cw, ch);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            sum +=
              (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) /
              255;
          }
          out.push(sum / (data.length / 4));
        }
      }
      return out;
    },
    [blurred.toString("base64"), COLS, ROWS],
  );

  const sorted = [...cells].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const weights = cells.map((v) => Math.abs(v - median)).sort((a, b) => b - a);

  const top = weights[0];
  const rivals = weights.slice(1, 5).reduce((s, v) => s + v, 0) / 4;
  const dominance = rivals > 1e-6 ? top / rivals : Infinity;

  if (screen.assert) {
    ok(
      `${screen.label} — 흐리게 보면 덩어리 하나가 선다`,
      dominance >= MIN_DOMINANCE,
      `지배도 ${dominance.toFixed(2)} (문턱 ${MIN_DOMINANCE})`,
    );
  } else {
    console.log(
      `  · ${screen.label} — 지배도 ${dominance.toFixed(2)} (판정하지 않는다: 위 SCREENS 주석)`,
    );
  }

  await page.evaluate(() => {
    const el = document.querySelector("main");
    if (el) el.style.filter = "";
  });
}

await browser.close();

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
console.log("그림: docs/screenshots/squint-*.png");
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
