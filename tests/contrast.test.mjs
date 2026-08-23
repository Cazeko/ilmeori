/**
 * 명도 대비 시험 — 화면의 글자가 바탕에서 읽히는가.
 *
 * README 에 「위반 0건」이라고 적혀 있던 자리다. 개발 중에 axe-core 를 한 번
 * 돌려 보고 적은 숫자였고, **그 숫자를 다시 뽑을 코드가 저장소에 없었다.**
 * 한 번 보고 만 초록불은 이 프로젝트가 세지 않기로 한 것이라, 남은 일로
 * 적어 두었던 것을 여기서 갚는다.
 *
 * 색을 12개에서 4개로 줄이면서 이 시험이 필요해졌다. 토큰을 하나 건드리면
 * 그 색을 쓰는 자리가 전부 흔들리는데, 흔들린 것을 사람이 눈으로 다시 재면
 * 반드시 빠뜨린다. 실제로 이 시험을 처음 돌렸을 때 **주석 두 개가 서로 다른
 * 값을 말하고 있는 것**이 잡혔다(gray-50 을 두고 한쪽은 4.6, 한쪽은 4.32).
 *
 * ── 재는 방법 ──────────────────────────────────────────────────────────────
 * WCAG 2.1 의 상대 휘도 정의를 그대로 옮겼다.
 *   C = (L_밝은 + 0.05) / (L_어두운 + 0.05)
 * 기준은 KWCAG 2.2 / WCAG AA 와 같다.
 *   본문 글자      4.5:1
 *   큰 글자(24px+) 3:1
 *   비문자 요소    3:1  (테두리·아이콘·상태 표시)
 *
 * 색값은 globals.css 에서 **직접 읽는다.** 여기에 헥사를 다시 적어 두면
 * 토큰을 고쳤을 때 시험만 옛 값을 붙들고 통과한다.
 *
 * 돌리는 법
 *   npm run test:contrast
 */

import { readFile } from "node:fs/promises";

const CSS = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

/**
 * globals.css 의 @theme 에서 --color-* 를 긁어 온다.
 *
 * 값이 헥사인 것과 **다른 토큰을 가리키는 것**(--color-rule-hair:
 * var(--color-gray-20)) 두 종류가 있다. 뒤엣것을 못 읽으면 선 굵기 네 단이
 * 통째로 시험 밖으로 빠지므로, 가리킨 곳을 따라간다.
 */
function readTokens(css) {
  const direct = new Map();
  const alias = new Map();
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, raw] = m;
    const value = raw.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) direct.set(name, value);
    else {
      const ref = value.match(/^var\(\s*--color-([a-z0-9-]+)\s*\)$/);
      if (ref) alias.set(name, ref[1]);
    }
  }
  // 가리키기가 겹쳐 있어도 풀리도록 몇 번 돈다. 고리가 있으면 안 풀린 채로
  // 남고, 그 이름을 쓰는 검사가 「globals.css 에 없다」로 터진다 — 조용히
  // 통과하는 것보다 낫다.
  for (let pass = 0; pass < 4 && alias.size > 0; pass += 1) {
    for (const [name, target] of [...alias]) {
      if (direct.has(target)) {
        direct.set(name, direct.get(target));
        alias.delete(name);
      }
    }
  }
  return direct;
}

const TOKENS = readTokens(CSS);

function parseHex(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // 알파는 뗀다 — 겹친 색은 따로 적는다
  if (h.length !== 6) throw new Error(`읽을 수 없는 색: ${hex}`);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}

/** sRGB 한 채널을 선형광으로. WCAG 2.1 relative luminance. */
function toLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** 토큰 이름이면 값으로 바꾸고, 헥사면 그대로 쓴다. */
function resolve(name) {
  if (name.startsWith("#")) return name;
  const hex = TOKENS.get(name);
  if (!hex) throw new Error(`globals.css 에 --color-${name} 이 없다`);
  return hex;
}

let pass = 0;
const fails = [];

/**
 * @param {string} fg   글자색 토큰 이름 또는 헥사
 * @param {string} bg   바탕색 토큰 이름 또는 헥사
 * @param {number} min  요구 대비 (4.5 본문 / 3 큰 글자·비문자)
 * @param {string} where 어디에 쓰이는 조합인가 — 실패했을 때 고칠 자리를 찾는 실마리
 */
function contrast(fg, bg, min, where) {
  const got = ratio(resolve(fg), resolve(bg));
  const name = `${where} — ${fg} on ${bg}`;
  if (got >= min) {
    pass += 1;
    console.log(`  ✓ ${name}  ${got.toFixed(2)}:1 (요구 ${min})`);
  } else {
    fails.push(`${name} — ${got.toFixed(2)}:1, ${min}:1 에 미달`);
    console.log(`  ✗ ${name}  ${got.toFixed(2)}:1 — 요구 ${min}:1 미달`);
  }
}

/**
 * 세 색이 판 위에서 **점점 세지는 순서**인가.
 *
 * 절대값 문턱만으로는 축이 무너지는 것을 못 잡는다. 네 단을 만들어 놓고
 * 두 단의 값이 서로 붙어 버리면 문턱은 통과하면서 축은 하나로 줄어든다.
 * 순서를 직접 잰다.
 */
function ordered(...args) {
  const label = args.pop();
  const values = args.map((n) => ({ name: n, r: ratio(resolve(n), resolve("surface")) }));
  const rising = values.every((v, i) => i === 0 || v.r > values[i - 1].r);
  const shown = values.map((v) => `${v.name} ${v.r.toFixed(2)}`).join(" < ");
  if (rising) {
    pass += 1;
    console.log(`  ✓ ${label} — ${shown}`);
  } else {
    fails.push(`${label} — 순서가 어긋났다: ${shown}`);
    console.log(`  ✗ ${label} — 순서가 어긋났다: ${shown}`);
  }
}

/** 대비가 **낮아야** 하는 것. 물러나 있어야 할 것이 튀어나오지 않았는지 본다. */
function atMost(fg, bg, max, where) {
  const got = ratio(resolve(fg), resolve(bg));
  const name = `${where} — ${fg} on ${bg}`;
  if (got <= max) {
    pass += 1;
    console.log(`  ✓ ${name}  ${got.toFixed(2)}:1 (상한 ${max})`);
  } else {
    fails.push(`${name} — ${got.toFixed(2)}:1, 상한 ${max}:1 초과`);
    console.log(`  ✗ ${name}  ${got.toFixed(2)}:1 — 상한 ${max}:1 초과`);
  }
}

console.log("\n판(surface) 위의 글자");
contrast("gray-90", "surface", 4.5, "본문");
contrast("gray-70", "surface", 4.5, "보조 본문");
contrast("gray-60", "surface", 4.5, "메타·캡션");
contrast("primary", "surface", 4.5, "링크·강조");
contrast("accent-text", "surface", 4.5, "보조색 글자");

console.log("\n바탕(gray-5) 위의 글자");
contrast("gray-90", "gray-5", 4.5, "본문");
contrast("gray-70", "gray-5", 4.5, "보조 본문");
contrast("gray-60", "gray-5", 4.5, "메타·캡션");

console.log("\n색 위에 얹는 흰 글자");
contrast("gray-0", "primary", 4.5, "기본 단추");
contrast("gray-0", "primary-hover", 4.5, "기본 단추 hover");
contrast("gray-0", "danger", 4.5, "위험 단추");
contrast("gray-0", "status-overdue", 4.5, "지연 채움");

console.log("\n상태 배지 — 지연만 색을 쓰고 나머지는 명도로 나뉜다");
contrast("status-overdue-text", "status-overdue-bg", 4.5, "지연");
contrast("gray-90", "gray-10", 4.5, "진행중");
contrast("gray-70", "gray-10", 4.5, "검토");
contrast("gray-70", "gray-5", 4.5, "대기");
contrast("gray-60", "gray-5", 4.5, "완료");

console.log("\n지연은 화면에서 유일하게 튀어야 한다");
// 지연 배지가 나머지 넷보다 확실히 세게 읽히는지 — 색을 줄인 뒤의 핵심 전제다.
// 나머지 넷은 무채색이므로 「튄다」는 것을 대비로 못 잰다. 대신 지연 배지의
// 바탕이 무채색 배지 바탕들과 실제로 구별되는지를 본다(비문자 3:1 은 과하고,
// 여기서는 '같은 색이 아니다'만 확인하면 된다).
contrast("status-overdue", "gray-5", 3, "지연 표시(비문자)");

console.log("\n주황 — 「내가 움직여야 하는 것」 하나만 가리킨다");
contrast("accent-text", "accent-bg", 4.5, "내 차례 칩 · 인계 알림");
// 흰 글자를 accent(#dc6e2d) 위에 얹으면 3.33:1 로 미달이다. 채운 배지에는
// 반드시 accent-text 를 바탕으로 쓴다(결재함 「대기」 숫자).
contrast("gray-0", "accent-text", 4.5, "채운 주황 배지");

console.log("\n색 없이 튀게 하는 법 — 뒤집기");
contrast("gray-0", "gray-90", 4.5, "대외비 칩");
contrast("gray-0", "gray-80", 4.5, "상태 바꾸기의 켜진 칸");

console.log("\n아바타 — 사람 얼굴 자리는 화면에서 채도가 가장 높으면 안 된다");
contrast("gray-70", "gray-10", 4.5, "아바타 글자");
contrast("gray-60", "gray-10", 4.5, "아바타 겹침의 +N");

console.log("\n선 굵기 네 단 — 이 시스템의 주력 위계 축");
// 네 단이 **서로 구별되는지**가 요점이다. 값이 하나라도 이웃과 붙으면 축이
// 도로 하나가 되고, 그때가 화면이 다시 평평해지는 순간이다.
contrast("rule-hair", "surface", 1.3, "hair — 표 칸선");
contrast("rule-frame", "surface", 2.5, "frame — 판의 바깥선");
contrast("rule-head", "surface", 10, "head — 문서 제목 아래 검은 선");
contrast("rule-alarm", "surface", 3, "alarm — 유일한 경보 모서리");

// frame(2.95) 은 WCAG 1.4.11 의 3:1 **바로 아래**다. 문턱을 2.5 로 둔 것은
// 봐주기가 아니라 판단이고, 그 판단을 여기 적어 둔다.
//
//   · 1.4.11 은 「이해에 필요한」 요소에 걸린다. 판의 바깥선은 거기 없다 —
//     뜻을 나르는 선은 head(15.50)와 alarm(4.03)이고 둘 다 넉넉히 넘는다.
//   · gray-50(4.32)으로 올리면 3:1 은 넘지만 **입력칸 테두리와 같은 값**이 되어
//     「누를 수 있는 칸」과 「그냥 판」이 같은 굵기로 보인다.
//
// 아래 두 줄이 그 판단을 잠근다: frame 은 hair 보다 확실히 세고, 입력칸보다는
// 확실히 약하다. 셋 중 하나라도 뒤집히면 시험이 먼저 안다.
ordered("rule-hair", "rule-frame", "gray-50", "칸선 < 판선 < 입력칸");

console.log("\n물러나 있어야 하는 것");
// 판과 바탕은 층이 나뉘되 경계가 도드라지면 안 된다. 1.2 를 넘으면 판이
// 「떠 있는 것」이 아니라 「다른 색 칸」으로 읽힌다.
// 이 상한이 있기 때문에 **대비는 채움이 아니라 선에서 벌어야 한다.**
atMost("surface", "gray-5", 1.2, "판과 바탕의 층");

console.log("\n입력칸 (비문자 3:1)");
contrast("gray-50", "surface", 3, "입력칸 테두리");

console.log("\n큰 글자 (24px 이상은 3:1)");
contrast("status-overdue-text", "surface", 3, "히어로의 「N일 지남」");

console.log(
  `\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`,
);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
