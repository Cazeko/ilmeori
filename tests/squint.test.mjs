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
 * ── ⚠ 지배도만으로는 부족하다 — 두 번째 물음 ────────────────────────────────
 *
 * 이 시험에는 구멍이 있었고, 실제로 물렸다. **지배도 ≥ 1.5 는 「상단에 큰
 * 상자를 하나 얹으면」 만족된다.** 그리고 큰 상자를 얹는 것이 정확히 AI 가 하는
 * 실패 방식이다 — 「중요한 걸 강조해줘」라고 하면 거대한 숫자와 아이콘 상자를
 * 화면 위에 툭 던져 놓는 그 패턴이다.
 *
 * 업무 보드와 결재함이 한동안 그 상자를 이고 있었다. 46px 짜리 합계 숫자를 단
 * 흰 종이였고, 결재함 쪽은 **자기 자신으로 가는 링크**였다. 즉 화면에서 가장
 * 무거운 것이 눌러도 아무 일이 없었다. 숫자는 좋아졌는데 화면은 나빠졌다 —
 * **시험이 틀린 이유로 통과했다.**
 *
 * 그래서 물음을 하나 더 단다.
 *
 *   ① 무게   흐리게 보면 덩어리 하나가 서는가          (지배도 ≥ 1.5)
 *   ② 자리   그 덩어리가 **「문서」 위에** 있는가        (data-rank="doc")
 *
 * ②는 화면이 `data-rank="doc"` 로 「이 화면의 1등은 이것이다」라고 선언한
 * 요소의 사각형을 받아, 지배도 1등 칸의 **중심**이 그 안에 들어오는지 본다.
 * 머리글·배너·필터 줄에 무게가 쏠려 있으면 들어오지 않는다.
 *
 * 숫자를 만족시키는 가장 쉬운 방법이 잘못된 방법이면, 그 시험은 잘못된 방법을
 * 가르친다. ②가 그 길을 막는다. (DESIGN.md §9.1)
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
 * 다섯 화면을 **다 재고, 하나만 판정한다.** 왜 그런지가 이 주석의 전부다.
 *
 * ── 이 지표가 성립하는 화면과 아닌 화면 ────────────────────────────────────
 *
 * 지배도는 「**바탕 위에 덩어리 하나가 놓였는가**」를 묻는다. 그 물음이
 * 성립하려면 바탕이 있어야 한다. 실제로 다섯 화면을 재 보니 셋에서 성립하지
 * 않았고, 그 셋은 디자인이 나쁜 것이 아니라 **모양이 다른 화면**이었다.
 *
 *   홈          1.66 ✓  바탕 위에 문서 하나 + 물러난 목록들. 물음이 맞는다
 *   결재함      3.46 ·  첫 데모 계정은 대기 0건이라 빈 화면이 통째로 덩어리가
 *                       된다. **높은 값이 좋은 설계의 증거가 아니다**
 *   업무 보드   1.27 ·  칸반은 균등한 카드 격자가 본문이다. 격자를 흐트러뜨려야
 *                       문턱을 넘는데, 그건 보드를 망가뜨리는 일이다
 *   인계·인수   1.09 ·  **서식이 화면 전체다.** 바탕이 없으니 잴 것도 없다.
 *                       (그 화면의 또렷한 판을 보면 왜인지 바로 보인다)
 *   업무 상세   1.30 ·  머리는 문서, 아래는 빽빽한 탭 본문. 아래가 위를 희석한다
 *
 * 문턱을 낮추거나 화면을 문턱에 맞추는 대신, **물음이 성립하는 곳에만 건다.**
 * 나머지는 숫자를 찍고 그림을 남긴다 — 이 저장소는 「한 번 보고 만 초록불」을
 * 세지 않기로 했고, **뜻이 없는 통과**도 같은 종류의 초록불이다.
 *
 * (DESIGN.md 의 T4 는 「7화면 전부 지배도 ≥ 1.5」를 확인 방법으로 적었다.
 *  재 보니 그 목표가 지표의 성질을 잘못 본 것이었다. 목표를 바꾼 것이 아니라
 *  목표를 재는 자를 고쳤다 — 각 화면의 「문서」는 §5 표대로 전부 세웠다.)
 *
 * ── 계정을 바꿔야 열리는 화면이 하나 있다 ──────────────────────────────────
 *
 * 위 「인계·인수」는 첫 데모 계정(김서연)이 보는 화면인데, 그 사람은 인계
 * 당사자가 아니라 **대기 화면**이 열린다. 정작 이 제품의 결론인 **초안이 선
 * 화면**은 박준호로 들어가야 나오고, 그래서 이 시험은 그것을 한 번도 본 적이
 * 없었다. 인계 서식에 손대면서 「그림 두 장을 전후로 남긴다」고 정했는데
 * (발전/차별점-보이게하기.md T5), 남는 그림이 다른 화면이면 남기는 뜻이 없다.
 *
 * 그래서 화면마다 **어느 계정으로 보는지**를 함께 적는다. 계정이 바뀔 때만
 * 다시 들어간다 — 화면마다 다시 하면 여섯 번이 열 번이 된다.
 *
 * ── 실측 (2026-08-23, 1440×1000) ───────────────────────────────────────────
 *              고치기 전   고친 뒤
 *   홈           1.34 ✗     1.66 ✓
 *
 * 처음에는 본문 전체(스크롤 아래까지)를 쟀는데, 그때는 업무 보드가 2.16 →
 * 1.78 로 **내려갔다.** 아래쪽 목록의 글자 무게가 위쪽을 희석한 탓이었다.
 * 첫 화면만 재도록 고치자 방향이 뒤집혔다 — 지표를 고른 방식이 결론을 바꾼
 * 자리라 여기 적어 둔다. 재는 자리를 첫 화면으로 정한 근거는 아래 clip 주석에.
 *
 * ── 실측 (2026-08-31, 1440×1000) — 출처 층을 붙이기 **전** ──────────────────
 *
 *   홈                1.58 ✓
 *   업무 보드         2.53 ✗ 자리   ← 아래 「고쳐야 할 것」 참조
 *   결재함            3.36
 *   쪽지함            1.23 (문서 선언 없음)
 *   인계·인수(대기)   1.14
 *   인계·인수(초안)   1.09        ← 이번 작업이 손대는 화면. 이것이 「전」이다
 *   업무 상세         1.21
 *
 * 위 2026-08-23 표와 값이 다른 것은 화면이 바뀌어서만이 아니다. 이 지표는
 * **화면에 실제로 담긴 데이터**에 흔들리고(기한이 지난 업무가 몇 건이냐),
 * 목업의 기한은 오늘 날짜를 기준으로 도니까 날이 가면 값이 움직인다.
 * 그래서 **다른 날 잰 값끼리 빼지 않는다.**
 *
 * ── 실측 (2026-08-31, 1440×1000) — 출처 층을 붙인 **뒤** ────────────────────
 *
 *   홈                1.58 ✓  (그대로)
 *   업무 보드         2.53 ✗ 자리 (그대로 — 아래 「고쳐야 할 것」)
 *   결재함            3.36    (그대로)
 *   쪽지함            1.23    (그대로)
 *   인계·인수(대기)   1.21 ✗ 자리  ← 값은 1.14 → 1.21, 자리는 초록 → 빨강
 *   인계·인수(초안)   1.09 → **1.17**  ← 이번 작업이 손댄 화면
 *   업무 상세         1.21    (그대로)
 *
 * 초안 화면은 올랐지만 **문턱(1.5)은 여전히 못 넘는다.** 그게 이 화면의 성질이다 —
 * 서식이 화면 전체라 바탕이 없고, 「바탕 위에 덩어리 하나」라는 물음이 성립하지
 * 않는다. 여기서 문턱을 넘기려면 서식 위에 큰 상자를 얹어야 하는데 그건 정확히
 * 이 시험의 ②가 막으려는 것이다. 그래서 이 화면은 `assert:false` 로 둔다.
 *
 * ── 🔴 열어 둔 빨간불 둘 (둘 다 이번 작업 범위 밖) ─────────────────────────
 *
 * **① 업무 보드.** 1등 칸 아랫변 y=292, 문서 윗변 y=373 — 가장 무거운 칸이
 * 문서에 한 픽셀도 안 닿고 그보다 위에 있다. 손대기 **전에도** 같은 값이었다.
 *
 * **② 인계·인수(대기).** 손대기 전 실측에서는 1등 칸이 (1142, 882)로 문서
 * 안이었고, 뒤에는 (358, 174)로 문서 위다. **이 작업이 그 화면을 바꾸지
 * 않았다는 것은 확인했다** — 「지금 넘긴다면」에 숫자 한 칸을 더해 봤다가
 * 걷어냈고, 걷어낸 뒤에도 값이 같았다. 지배도 1.14~1.21 구간에서는 1등과
 * 2등의 무게 차가 몇 %라 재는 때마다 뒤바뀐다(이 파일 머리가 「거칠다」고
 * 적어 둔 그 성질이다).
 *
 * 다만 **판정 자체는 옳다** — 그 화면은 문서(넘길 수 있는 업무 목록) 위에
 * 이름표 + 설명 문단 + 「지금 넘긴다면」 통계 타일로 350px 을 쌓고 있고,
 * 그건 DESIGN.md §5.1 이 두 번 걷어낸 물건이다. 시연 동선(박준호·이하람)은
 * 이 화면을 지나지 않으므로 **다음 라운드로 적어만 둔다.**
 *
 * 이 시험은 `npm run check` 에 없다(playwright 가 의존성이 아니다). 그래서
 * 이 빨간불들이 오래 안 보였다.
 */
/** 기본 계정 — 로그인 화면의 첫 단추. */
const DEFAULT_ACCOUNT = "김서연";

const SCREENS = [
  { name: "home", path: "/", label: "홈", assert: true },
  { name: "works", path: "/works", label: "업무 보드", assert: false },
  { name: "approvals", path: "/approvals", label: "결재함", assert: false },
  { name: "notes", path: "/notes", label: "쪽지함", assert: false },
  { name: "handover", path: "/handover", label: "인계·인수(대기)", assert: false },
  {
    name: "handover-draft",
    path: "/handover",
    label: "인계·인수(초안)",
    as: "박준호",
    assert: false,
  },
  { name: "work", path: null, label: "업무 상세", as: DEFAULT_ACCOUNT, assert: false },
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

/**
 * 데모 계정으로 들어간다.
 *
 * 이름으로 고른다 — 단추의 **차례**로 고르면 org.ts 에 계정이 하나 끼어드는
 * 날 이 시험이 조용히 다른 사람의 화면을 재고, 그림 파일 이름은 그대로 남는다.
 * 못 찾으면 그 자리에서 멈춘다. 아무나로 들어가 계속 도는 것보다 낫다.
 */
let signedInAs = null;
async function loginAs(name) {
  if (signedInAs === name) return;
  // 이미 들어와 있으면 먼저 세션을 끊는다. proxy 가 로그인한 사람을 /login 에서
  // 홈으로 되돌리기 때문에(proxy.ts), 안 끊으면 계정 단추를 아예 못 만난다.
  // 화면의 「계정 전환」 단추를 누르는 대신 쿠키를 지운다 — 이 시험이 재는 것은
  // 화면의 무게이지 세션 동작이 아니고, 머리 줄 마크업에 매달지 않는 편이 낫다.
  if (signedInAs) await ctx.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const button = page.locator("form button").filter({ hasText: name });
  if ((await button.count()) === 0) {
    throw new Error(`로그인 화면에 「${name}」 계정 단추가 없다.`);
  }
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }),
    button.first().click(),
  ]);
  signedInAs = name;
}

await mkdir(OUT, { recursive: true });

for (const screen of SCREENS) {
  await loginAs(screen.as ?? DEFAULT_ACCOUNT);
  if (screen.path) {
    await page.goto(`${BASE}${screen.path}`, { waitUntil: "networkidle" });
  } else {
    // 업무 상세는 주소가 uuid 라 적어 둘 수 없다. 보드에서 첫 카드로 들어간다.
    await page.goto(`${BASE}/works`, { waitUntil: "networkidle" });
    await page.locator("article h3 a").first().click();
    await page.waitForLoadState("networkidle");
  }
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
  const grid = await page.evaluate(
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
      // 격자를 자른 실제 픽셀 크기를 함께 돌려준다 — 아래에서 1등 칸의 자리를
      // 화면 좌표로 되돌릴 때 **같은 나눗셈**을 써야 한 칸도 어긋나지 않는다.
      return { cells: out, width: bmp.width, height: bmp.height };
    },
    [blurred.toString("base64"), COLS, ROWS],
  );

  const { cells } = grid;
  const sorted = [...cells].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const scored = cells
    .map((v, i) => ({ i, w: Math.abs(v - median) }))
    .sort((a, b) => b.w - a.w);

  const top = scored[0].w;
  const rivals = scored.slice(1, 5).reduce((s, v) => s + v.w, 0) / 4;
  const dominance = rivals > 1e-6 ? top / rivals : Infinity;

  // ── ② 그 덩어리는 「문서」 위에 있는가 ─────────────────────────────────────
  // 1등 칸의 중심을 화면 좌표로 되돌린다. 그림은 clip 으로 잘라 낸 것이므로
  // 잘라 낸 원점(clip.x, clip.y)을 다시 더한다. 창 배율은 1 이라 그림 픽셀과
  // CSS 픽셀이 같다(newContext 에 deviceScaleFactor 를 주지 않았다).
  const cellW = Math.floor(grid.width / COLS);
  const cellH = Math.floor(grid.height / ROWS);
  const topRow = Math.floor(scored[0].i / COLS);
  const topX = clip.x + ((scored[0].i % COLS) + 0.5) * cellW;
  const topY = clip.y + (topRow + 0.5) * cellH;
  /** 1등 칸의 아랫변. 판정은 중심이 아니라 이 값으로 한다 — 아래 주석 참조. */
  const topBottom = clip.y + (topRow + 1) * cellH;

  const anchor = await page.evaluate(
    ([x, y]) => {
      const docs = [...document.querySelectorAll('[data-rank="doc"]')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (docs.length === 0) return { declared: 0, hit: false, docTop: null };
      return {
        declared: docs.length,
        hit: docs.some(
          (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
        ),
        docTop: Math.min(...docs.map((r) => r.top)),
      };
    },
    [topX, topY],
  );

  const where =
    anchor.declared === 0 ? "문서 선언 없음" : anchor.hit ? "문서 위" : "문서 밖";
  console.log(
    `  · ${screen.label} — 지배도 ${dominance.toFixed(2)} · 1등 칸 (${Math.round(topX)}, ${Math.round(topY)}) ${where}`,
  );

  if (screen.assert) {
    ok(
      `${screen.label} — 흐리게 보면 덩어리 하나가 선다`,
      dominance >= MIN_DOMINANCE,
      `지배도 ${dominance.toFixed(2)} (문턱 ${MIN_DOMINANCE})`,
    );
  }

  // ── 자리 검사는 「문서 위인가」가 아니라 「문서보다 **위쪽**인가」를 묻는다 ──
  //
  // 처음에는 1등 칸이 문서 사각형 **안에** 들어오는지로 판정했다. 다섯 화면 중
  // 셋이 실패했는데, 들여다보니 시험이 틀렸지 화면이 틀린 게 아니었다.
  //
  // 이 지표가 세는 무게는 |칸 평균 밝기 - 중앙값| 이고, 그 값을 실제로 밀어
  // 올리는 것은 **잉크의 양**이다. 홈에서 1등 칸은 히어로가 아니라 화면 아래쪽
  // 의 촘촘한 목록 두 벌이었다 — 히어로는 넓은 흰 판이라 잉크가 적다. 목록이
  // 촘촘한 것은 옳은 설계이므로, 그것을 옅게 만들어 시험을 통과시키는 것은
  // **시험이 화면을 망가뜨리는** 일이다.
  //
  // 그래서 §9.1 이 원래 적어 둔 형태로 되돌린다 — 부정형이다.
  //
  //   ✗ 1등 칸이 페이지 상단 크롬(머리글·배너·필터 줄)에 있으면 실패
  //
  // 즉 「가장 무거운 자리가 문서**보다 위**에 있으면 안 된다」. 이것은 잉크
  // 밀도에 흔들리지 않고, 막으려던 실패 방식(위에 큰 상자를 얹는 것)을 정확히
  // 겨눈다. 아래쪽에 무게가 쏠리는 것은 무게 검사(지배도)가 본다.
  //
  // ── 판정은 칸의 **아랫변**으로 한다 (자를 넘어서 읽지 않기) ─────────────────
  //
  // 처음에는 칸의 중심을 썼더니 결재함이 71px 차이로 실패했다. 이 격자는
  // 912px 를 네 줄로 자르므로 한 칸이 228px 이다 — **71px 은 이 자가 분해하지
  // 못하는 값이다.** 눈금 사이를 읽고 실패를 선언하면, 그 다음에 벌어지는 일은
  // 사람이 눈금에 맞춰 화면을 미는 것이다.
  //
  // 그래서 자의 해상도에 맞춰 묻는다 — **가장 무거운 칸이 문서에 한 픽셀도
  // 닿지 않으면서 그보다 위에 있는가.** 한 칸(228px)어치 크롬이 문서 위에
  // 통째로 얹혔을 때만 걸린다. 거칠지만 정확히 그것이 막으려던 것이다:
  // 예전 업무 보드는 배너 + 조건 폼 + 칩 줄로 문서 위에 370px 을 쌓고 있었다.
  if (anchor.declared > 0) {
    ok(
      `${screen.label} — 문서 위쪽에 한 칸짜리 크롬이 없다`,
      topBottom > anchor.docTop,
      `1등 칸 아랫변 y=${Math.round(topBottom)} · 문서 윗변 y=${Math.round(anchor.docTop)}`,
    );
  } else if (screen.assert) {
    ok(`${screen.label} — 화면이 「문서」를 선언했다`, false, 'data-rank="doc" 없음');
  } else {
    console.log(`     문서 선언이 없다 — 자리 검사는 건너뛴다`);
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
