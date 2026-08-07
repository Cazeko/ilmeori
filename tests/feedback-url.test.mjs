/**
 * withFeedback() — 액션이 끝나고 돌아갈 주소를 만든다.
 *
 * 이 함수가 이 앱의 **모든 결과 알림**을 실어 나른다. 화면은 자바스크립트 없이도
 * 동작해야 하므로 결과를 훅이 아니라 주소로 전달하기 때문이다(feedback.ts 참조).
 * 그래서 여기가 틀어지면 저장은 됐는데 화면이 아무 말도 안 하거나, 방금 실패한
 * 코드가 성공한 것처럼 남는다.
 *
 * 조각(#항목)을 다루게 된 것은 인계서 때문이다. 인계 화면은 서식 항목이 일곱 개라,
 * 보충을 적고 나서 맨 위로 튕기면 무엇이 달라졌는지 볼 수가 없다.
 * 그런데 주소에서 조각은 **언제나 질의 문자열 뒤**에 와야 한다. 그냥 이어 붙이면
 * `/handover#block-3-assets?msg=…` 가 되어 조각 이름이 `block-3-assets?msg=…` 로
 * 읽히고, 어느 항목으로도 가지 못한 채 알림도 안 뜬다.
 *
 * 의존성이 없다. `npm run check` 에 들어 있다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// 구현을 복사해 두면 두 벌이 되고, 두 벌은 반드시 어긋난다. 원본에서 잘라 온다.
// (safe-next.test.mjs 와 같은 방식이다)
const source = readFileSync(
  join(here, "..", "src", "lib", "actions", "feedback.ts"),
  "utf8",
);
const start = source.indexOf("export function withFeedback");
if (start < 0) {
  console.error("withFeedback 을 찾지 못했습니다. 이름이 바뀌었는지 확인하세요.");
  process.exit(1);
}
const end = source.indexOf("\n}", start) + 2;
const slice = source.slice(start, end);

// 서명이 바뀌면 잘라 온 조각이 그대로 자바스크립트가 아니게 되어 SyntaxError 로
// 죽는다. 그 오류만 보고는 무엇을 해야 할지 알 수 없으므로, 먼저 확인하고 말해 준다.
const SIGNATURE =
  "export function withFeedback(path: string, code: FeedbackCode): string";
if (!slice.startsWith(SIGNATURE)) {
  console.error(
    [
      "withFeedback 의 서명이 바뀌었습니다. 이 시험은 원본에서 함수를 잘라 옵니다.",
      "",
      `  기대한 것: ${SIGNATURE}`,
      `  실제      : ${slice.split("\n")[0]}`,
      "",
      "구현을 복사해 두면 두 벌이 되므로, 복사 대신 이 파일의 SIGNATURE 를 맞춰 주세요.",
    ].join("\n"),
  );
  process.exit(1);
}

const body = slice.replace(SIGNATURE, "function withFeedback(path, code)");
const withFeedback = new Function(`${body}\nreturn withFeedback;`)();

const CASES = [
  ["평범한 경로", "/handover", "ok", "/handover?msg=ok"],
  ["기존 검색 조건은 남는다", "/works?q=대행", "ok", "/works?q=%EB%8C%80%ED%96%89&msg=ok"],
  ["탭 같은 조건도 남는다", "/works/x?tab=talk", "ok", "/works/x?tab=talk&msg=ok"],
  // 방금 실패해서 ?msg=failed 가 붙은 상태로 다시 제출하면, 성공했는데도 화면이
  // "저장하지 못했습니다"라고 말하게 된다. 그래서 덮어쓴다(같은 칸이 둘이면 안 된다).
  ["앞선 결과는 덮어쓴다", "/handover?msg=failed", "ok", "/handover?msg=ok"],
  ["조각은 맨 뒤로 간다", "/handover#block-3-assets", "ok", "/handover?msg=ok#block-3-assets"],
  [
    "조건과 조각이 함께 있어도 순서를 지킨다",
    "/works/x?tab=talk#c1",
    "ok",
    "/works/x?tab=talk&msg=ok#c1",
  ],
  // 조각 안의 #은 원래 인코딩되어야 하지만, 잘라 버리면 돌아갈 자리를 잃는다.
  // 첫 #부터 끝까지가 통째로 조각이다.
  ["조각 안에 #이 또 있어도 안 잘린다", "/a#b#c", "ok", "/a?msg=ok#b#c"],
  ["조각만 있는 경우", "/#top", "ok", "/?msg=ok#top"],
];

let pass = 0;
const fails = [];
for (const [name, input, code, expected] of CASES) {
  const got = withFeedback(input, code);
  if (got === expected) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(`${name} — ${input} → ${got} (${expected} 이어야 한다)`);
    console.log(`  ✗ ${name} — ${got}`);
  }
}

console.log(`\n통과 ${pass}건 / 실패 ${fails.length}건`);
if (fails.length) {
  for (const f of fails) console.log(" - " + f);
  process.exit(1);
}
