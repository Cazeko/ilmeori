/**
 * 실눈 시험을 한 명령으로 돌린다 — 서버를 스스로 띄우고, 재고, 끈다.
 *
 * ── 왜 이 파일이 생겼나 ────────────────────────────────────────────────────
 *
 * `card.tsx` 는 **「규칙: 한 화면에 「문서」는 하나다」**를 굵게 적어 두었고,
 * 그것을 지키는 것이 `tests/squint.test.mjs` 다. 그런데 그 시험은 돌아가는
 * 서버를 요구해서(BASE 환경변수) 사람이 손으로 두 창을 띄워야 했고,
 * `package.json` 의 `check:visual` 은 그냥 `test:squint` 의 별명이라
 * **서버가 없으면 그대로 터졌다.**
 *
 * 그 사이 업무 보드의 문서가 둘이 됐다 — `work-card.tsx` 가 지연된 카드마다
 * 문서 표식을 붙이고 있었고, 지연이 열둘이면 문서가 열둘이 된다. 아무도
 * 몰랐던 이유는 간단하다. **그 시험이 아무 데서도 안 돌았다.**
 *
 * ── 왜 `check` 에 넣지 않는가 ──────────────────────────────────────────────
 *
 * `check` 는 크로미움 없는 자리에서도 도는 정적·단위 시험 사슬이다. 이 저장소가
 * 브라우저 시험을 거기서 빼 둔 것은 의도이고(`docs/발전계획.md` 의 「크로미움
 * 없는 자리에서는 못 돌린다」), 그 판단은 그대로 둔다.
 *
 * 대신 **손이 덜 가게** 만든다. 안 도는 시험의 원인이 「규칙이 없어서」가
 * 아니라 「번거로워서」인 경우가 대부분이다.
 *
 * 돌리는 법
 *   npm run check:visual
 *
 * 이미 서버를 띄워 두었으면 그것을 그대로 쓴다.
 *   BASE=http://localhost:3000 npm run check:visual
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";

const ROOT = new URL("..", import.meta.url).pathname;

/** 비어 있는 포트 하나. 고정 포트를 쓰면 다른 세션과 부딪힌다. */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function reachable(base) {
  try {
    const r = await fetch(`${base}/login`, { redirect: "manual" });
    return r.status > 0;
  } catch {
    return false;
  }
}

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => resolve(code ?? 1));
  });
}

// ── 이미 떠 있는 서버가 있으면 그대로 쓴다 ─────────────────────────────────
const given = process.env.BASE;
if (given && (await reachable(given))) {
  console.log(`이미 떠 있는 서버를 씁니다 — ${given}`);
  process.exit(await run("node", ["tests/squint.test.mjs"], { BASE: given }));
}

// ── 없으면 직접 띄운다 ──────────────────────────────────────────────────────
if (!existsSync(`${ROOT}.next/BUILD_ID`)) {
  console.error(
    "빌드가 없습니다. `npm run build` 를 먼저 돌리거나,\n" +
      "이미 띄워 둔 서버가 있으면 BASE=<주소> 로 알려 주세요.",
  );
  process.exit(1);
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
console.log(`서버를 띄웁니다 — ${base}`);

const server = spawn("npx", ["next", "start", "--port", String(port)], {
  cwd: ROOT,
  stdio: ["ignore", "ignore", "inherit"],
});

// 끄는 일을 반드시 한다. 여기서 빠뜨리면 다음 사람이 포트를 물고 있는 유령
// 프로세스를 만나고, 그게 **옛 빌드를 서빙하면 측정 전체가 거짓이 된다.**
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  server.kill("SIGTERM");
};
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

let up = false;
for (let i = 0; i < 40; i += 1) {
  if (await reachable(base)) {
    up = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
  console.error("서버가 20초 안에 뜨지 않았습니다.");
  stop();
  process.exit(1);
}

const code = await run("node", ["tests/squint.test.mjs"], { BASE: base });
stop();
process.exit(code);
