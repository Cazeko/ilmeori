/**
 * `@/…` 별칭을 노드가 알아듣게 해 주는 해석 훅.
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
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);

import { existsSync } from "node:fs";

/** 타입스크립트처럼 확장자 없이 적은 경로를 실제 파일로 맞춰 준다. */
function withExtension(filePath) {
  if (existsSync(filePath)) return filePath;
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    if (existsSync(filePath + ext)) return filePath + ext;
  }
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    const index = path.join(filePath, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return filePath;
}

/** Next 런타임 모듈은 대역으로 바꾼다. 시험은 요청 밖에서 돌기 때문이다. */
const STUBS = new Map([
  ["next/headers", "./stubs/next-headers.mjs"],
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
    if (existsSync(guess)) return nextResolve(pathToFileURL(guess).href, context);
  }

  return nextResolve(specifier, context);
}
