/**
 * safeNext() — 로그인 뒤 돌아갈 경로 검사.
 *
 * 이 시험이 있는 이유. 코드리뷰에서 실제로 뚫렸다.
 *
 *   safeNext 는 "슬래시 하나로 시작하고 두 개는 아닌가"를 **받은 문자열 그대로** 보았는데,
 *   브라우저 URL 파서는 해석하기 전에 탭·개행·복귀를 통째로 지운다(WHATWG URL 1단계).
 *   그래서 "/%09/evil.example.com" 이 검사를 통과해 Location 헤더에 원문 그대로 실리고,
 *   브라우저가 탭을 지우면서 "//evil.example.com" — 프로토콜 상대 URL이 되어 밖으로 나갔다.
 *
 *   검사하는 문자열과 이동하는 문자열이 서로 달랐던 것이 원인이다.
 *
 * 제출물에 깃헙 주소와 배포 주소가 함께 들어간다. 심사위원을 외부 사이트로 보내는
 * 링크 하나면 그걸로 끝이라, 이 함수만은 회귀 시험을 붙여 둔다.
 *
 * 의존성이 없다. `npm run check` 에 들어 있다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// TypeScript 파일이지만 이 함수에는 타입 표기 한 줄뿐이라 그것만 걷어 내면 그대로 돈다.
// 시험을 위해 구현을 복사해 두면 두 벌이 되고, 두 벌은 반드시 어긋난다.
const source = readFileSync(join(here, "..", "src", "lib", "safe-next.ts"), "utf8").replace(
  "export function safeNext(raw: unknown): string",
  "function safeNext(raw)",
);
const safeNext = new Function(`${source}\nreturn safeNext;`)();

const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const NUL = String.fromCharCode(0);

const CASES = [
  ["평범한 경로는 그대로 통과한다", "/works/abc", "/works/abc"],
  ["질의 문자열도 남긴다", "/works/x?tab=talk", "/works/x?tab=talk"],
  ["프로토콜 상대 URL", "//evil.example.com", "/"],
  ["역슬래시 변형", "/\\evil.example.com", "/"],
  ["절대 URL", "https://evil.example.com", "/"],
  ["탭을 끼운 프로토콜 상대 URL", `/${TAB}/evil.example.com`, "/"],
  ["탭 + 역슬래시", `/${TAB}\\evil.example.com`, "/"],
  ["개행을 끼운 것", `/${LF}//evil.example.com`, "/"],
  ["복귀+개행을 끼운 것", `/${CR}${LF}/evil.example.com`, "/"],
  ["널 문자 (Location 헤더에 못 싣는다)", `/works${NUL}/x`, "/"],
  ["슬래시로 시작하지 않는 것", " /works", "/"],
  ["빈 문자열", "", "/"],
  ["문자열이 아닌 것 — null", null, "/"],
  ["문자열이 아닌 것 — undefined", undefined, "/"],
  ["문자열이 아닌 것 — 숫자", 123, "/"],
];

let failed = 0;

console.log("safeNext");
for (const [name, input, want] of CASES) {
  const got = safeNext(input);
  if (got === want) {
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name} — ${JSON.stringify(got)} (기대: ${JSON.stringify(want)})`);
  }
}

// 통과한 값이 **브라우저 눈으로도** 우리 안에 남는지 본다.
// 위 검사는 "무엇을 돌려주나"를 보고, 아래는 "그것이 어디로 가나"를 본다.
console.log("\n브라우저가 실제로 해석한 결과");
const ORIGIN = "https://ilmeori.example";
for (const probe of [
  `/${TAB}/evil.example.com`,
  `/${TAB}\\evil.example.com`,
  "//evil.example.com",
  `/${LF}//evil.example.com`,
  "/works/abc",
]) {
  const stripped = safeNext(probe).replace(/[\t\n\r]/g, ""); // URL 파서가 하는 일
  const url = new URL(stripped, ORIGIN);
  if (url.origin === ORIGIN) {
    console.log(`  ✓ ${JSON.stringify(probe)} → ${url.href}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${JSON.stringify(probe)} → ${url.href} (바깥으로 나갔다)`);
  }
}

if (failed > 0) {
  console.error(`\n실패 ${failed}건`);
  process.exit(1);
}
console.log("\n전체 통과");
