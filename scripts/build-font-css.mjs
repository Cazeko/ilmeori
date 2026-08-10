#!/usr/bin/env node
/**
 * Pretendard GOV 자체 호스팅 자산을 만든다.
 *
 *   node scripts/build-font-css.mjs
 *
 * 하는 일
 *   1. 원본 dynamic-subset CSS 를 받아
 *   2. 이 앱이 쓰는 굵기(400·700)만 남기고
 *   3. woff2 경로를 같은 출처(/fonts/pretendard-gov/)로 고쳐
 *      public/fonts/pretendard-gov.css 를 쓰고 (layout.tsx 가 <link>로 건다)
 *   4. 거기 걸린 woff2 조각을 public/fonts/pretendard-gov/ 로 내려받는다.
 *
 * 굵기를 늘리려면 WEIGHTS 만 고치면 된다. 늘리기 전에 globals.css 의
 * 「굵기 2가지(400/700)만 사용」 약속을 먼저 확인할 것 — 그 약속이 있어서
 * 888KB 짜리 CSS 가 155KB 로 줄었다.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const VERSION = "v1.3.9";
const WEIGHTS = [400, 700];

const CSS_URL = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@${VERSION}/dist/web/static/pretendard-gov-dynamic-subset.min.css`;
const WOFF2_BASE = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@${VERSION}/packages/pretendard-gov/dist/web/static/woff2-dynamic-subset`;

const CSS_OUT = path.join(process.cwd(), "public", "fonts", "pretendard-gov.css");
const FONT_DIR = path.join(process.cwd(), "public", "fonts", "pretendard-gov");

const HEADER = `/*
 * Pretendard GOV — 자체 호스팅 (dynamic subset)
 *
 * 출처: https://github.com/orioncactus/pretendard ${VERSION} (SIL Open Font License 1.1)
 * 생성: scripts/build-font-css.mjs — 손으로 고치지 말 것.
 *
 * 굵기 ${WEIGHTS.join("·")} 만 남겼다(이 앱이 쓰는 전부다 — globals.css 참조).
 * unicode-range 로 쪼개져 있으므로 브라우저는 화면에 실제로 쓰인 글자의
 * 조각만 받는다. 파일이 여럿이라고 전부 나가는 것이 아니다.
 */
`;

const weightPattern = new RegExp(`font-weight:(${WEIGHTS.join("|")})[;}]`);

async function main() {
  process.stdout.write(`원본 CSS 받는 중… `);
  const css = await (await fetch(CSS_URL)).text();
  console.log(`${css.length.toLocaleString()} 바이트`);

  const blocks = css.match(/@font-face\{.*?\}/gs) ?? [];
  const keep = blocks.filter((b) => weightPattern.test(b));

  const files = new Set();
  const rewritten = keep.map((block) =>
    block.replace(/src:(.*?);/s, (_all, src) => {
      const woff2 = src
        .split(",")
        .map((s) => s.trim())
        .find((s) => s.includes("woff2-dynamic-subset"));
      if (!woff2) throw new Error(`woff2 항목이 없다: ${src.slice(0, 120)}`);
      const name = /woff2-dynamic-subset\/([^)]+)\)/.exec(woff2)[1];
      files.add(name);
      return `src:url(/fonts/pretendard-gov/${name}) format('woff2');`;
    }),
  );

  await mkdir(FONT_DIR, { recursive: true });
  await writeFile(CSS_OUT, HEADER + rewritten.join("\n") + "\n");
  console.log(
    `CSS: @font-face ${blocks.length} → ${keep.length}개, woff2 ${files.size}개`,
  );

  let downloaded = 0;
  for (const name of [...files].sort()) {
    const dest = path.join(FONT_DIR, name);
    if (existsSync(dest)) continue;
    const res = await fetch(`${WOFF2_BASE}/${name}`);
    if (!res.ok) throw new Error(`${name} 내려받기 실패: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // woff2 매직 넘버. CDN 이 오류 페이지를 200 으로 주는 경우를 여기서 잡는다.
    if (buf.subarray(0, 4).toString("latin1") !== "wOF2") {
      throw new Error(`${name} 이 woff2 가 아니다`);
    }
    await writeFile(dest, buf);
    downloaded += 1;
  }
  console.log(`woff2: ${downloaded}개 새로 받음 (이미 있던 것은 건너뜀)`);

  // 실제로 쓰이는지 확인 — 참조는 있는데 파일이 없으면 글자가 통째로 안 나온다.
  const missing = [...files].filter((n) => !existsSync(path.join(FONT_DIR, n)));
  if (missing.length > 0) throw new Error(`빠진 파일: ${missing.join(", ")}`);
  console.log("완료.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
