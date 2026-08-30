/**
 * `@/…` 별칭을 노드가 알아듣게 해 주는 해석 훅 — 그리고 `.tsx` 를 읽는 적재 훅.
 *
 * 기존 시험들은 의존성이 없는 잎 모듈(approval-cues.ts 등)만 불렀기 때문에
 * 별칭을 만날 일이 없었다. 데이터 층은 그렇지 않다 — mock.ts 하나가
 * `@/lib/types`, `@/lib/mock/works` 를 줄줄이 끌고 온다.
 *
 * 번들러를 붙이거나 의존성을 더하는 대신, tsconfig 의 paths 와 **같은 규칙**을
 * 여기 한 줄로 적어 둔다(`@/*` → `src/*`). 규칙이 두 곳에 있는 셈이라
 * tsconfig 를 고치면 여기도 고쳐야 한다 — 그 대가로 시험이 앱 코드를
 * 그대로 부를 수 있다.
 *
 * `server-only` 는 노드에서 부르면 서버용 진입점이 잡히므로 그냥 통과한다.
 *
 * ── `.tsx` 는 왜 따로 다루나 ──────────────────────────────────────────────
 *
 * 노드는 `.ts` 의 타입을 스스로 벗겨 내지만 **JSX 는 못 읽는다.** 그래서
 * 컴포넌트를 부르는 시험이 한 건도 없었고, 인계서 종이를 그리는 코드
 * (print-sheet.tsx)는 어떤 시험도 지나가지 않았다.
 *
 * 새 의존성은 안 더한다. Next 가 이미 자기 SWC 를 싣고 있으므로 그걸 그대로
 * 쓴다(`next/dist/build/swc` 의 transformSync). 시험 전용 경로라 배포에 나가는
 * 것은 한 바이트도 안 늘고, 「초안 경로에 바깥 패키지 0건」(test:proof)도
 * 그대로 선다.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);

import { existsSync, statSync } from "node:fs";

/**
 * 있기만 한 것이 아니라 **파일**이어야 한다.
 *
 * `existsSync` 는 디렉터리에도 참을 준다. 그래서 `@/lib/data` 처럼 폴더
 * 이름으로 적은 경로가 아래 index 찾기까지 가지 못하고 폴더 경로 그대로
 * 돌아갔고, 노드가 ERR_UNSUPPORTED_DIR_IMPORT 로 멈췄다. 잎 모듈만 부르던
 * 동안에는 드러나지 않던 자리다.
 */
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** 타입스크립트처럼 확장자 없이 적은 경로를 실제 파일로 맞춰 준다. */
function withExtension(filePath) {
  if (isFile(filePath)) return filePath;
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    if (isFile(filePath + ext)) return filePath + ext;
  }
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    const index = path.join(filePath, `index${ext}`);
    if (isFile(index)) return index;
  }
  return filePath;
}

/** Next 런타임 모듈은 대역으로 바꾼다. 시험은 요청 밖에서 돌기 때문이다. */
const STUBS = new Map([
  ["next/headers", "./stubs/next-headers.mjs"],
  ["next/link", "./stubs/next-link.mjs"],
  ["server-only", "./stubs/noop.mjs"],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub) {
    return nextResolve(new URL(stub, import.meta.url).href, context);
  }

  if (specifier.startsWith("@/")) {
    const target = withExtension(path.join(SRC, specifier.slice(2)));
    return nextResolve(pathToFileURL(target).href, context);
  }

  // 상대경로도 확장자가 없을 수 있다(앱 코드는 번들러가 붙여 준다).
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const from = path.dirname(fileURLToPath(context.parentURL));
    const guess = withExtension(path.resolve(from, specifier));
    if (isFile(guess)) return nextResolve(pathToFileURL(guess).href, context);
  }

  return nextResolve(specifier, context);
}

/**
 * `.tsx` 만 SWC 로 옮긴다.
 *
 * `.ts` 는 노드가 스스로 벗겨 내므로 건드리지 않는다 — 여기서 같이 처리하면
 * 이미 도는 시험 열 몇 개가 전부 이 코드를 지나가게 되고, 그 위험은 얻는 것에
 * 비해 크다. **바꾸는 것은 지금까지 아예 못 읽던 갈래 하나뿐이다.**
 *
 * SWC 는 처음 부를 때만 싣는다. 파일마다 다시 부르면 컴포넌트 몇 개짜리
 * 시험에서도 눈에 띄게 느려진다.
 */
let swc;
export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:")) return nextLoad(url, context);

  // 확장자는 **경로에서** 본다. `?v=1` 같은 꼬리가 붙은 URL 은 endsWith 로 보면
  // 그냥 지나가고, 노드가 "Unknown file extension" 하나만 남기고 죽는다.
  const ext = path.extname(new URL(url).pathname);
  if (ext === ".jsx") {
    // 이 저장소에 `.jsx` 는 한 개도 없다. 생기는 날 여기서 멈추는 편이,
    // 노드의 뜻 모를 확장자 오류를 한 시간 들여다보는 것보다 싸다.
    throw new Error(
      `${url} — 이 훅은 .tsx 만 옮긴다. .jsx 가 생겼다면 여기 갈래를 하나 더해야 한다.`,
    );
  }
  if (ext !== ".tsx") return nextLoad(url, context);

  swc ??= createRequire(import.meta.url)("next/dist/build/swc");
  const filename = fileURLToPath(url);
  const { code } = swc.transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: {
      parser: { syntax: "typescript", tsx: true },
      // tsconfig 는 ES2017 이지만 여기서는 노드가 바로 삼킬 수 있으면 된다.
      // 이 훅은 시험 전용이라 배포물과 무관하고, 낮춰 잡으면 헬퍼가 끼어들어
      // 렌더 결과가 아니라 옮긴 방식을 보게 된다.
      target: "es2022",
      // tsconfig 의 "jsx": "react-jsx" 와 같은 뜻이다 — 컴포넌트 파일이 React 를
      // 따로 import 하지 않아도 되는 그 설정.
      transform: { react: { runtime: "automatic" } },
    },
    // ESM 그대로 둔다. 앱 코드가 import/export 로 쓰여 있고, 여기서 CJS 로
    // 바꾸면 `.ts` 이웃 모듈과 서로 못 부른다.
    module: { type: "es6" },
  });

  return { format: "module", source: code, shortCircuit: true };
}
