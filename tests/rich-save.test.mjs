/**
 * 서식 편집기의 저장 왕복 — 판 경쟁에서 진 탭이 다시 저장할 수 있는가.
 *
 * 이 시험이 있는 이유. 코드리뷰에서 실제로 뚫렸다.
 *
 *   저장은 `where blocks_rev = <내가 본 판>` 한 문장으로 덮어쓰기를 막는다(0018 §4).
 *   서버는 판이 밀렸을 때 **지금 서버에 있는 판**을 함께 돌려주는데, 편집기가
 *   그 값을 성공했을 때만 받고 있었다. 그래서 한 번 진 탭은 자기 판이 뒤처진
 *   채로 굳고, 조건이 다시는 맞지 않아 **그 뒤 한 글자도 저장되지 않았다.**
 *   화면에는 「저장하지 못했습니다」가 뜨지만, 여덟 시간 쓴 글이 그대로 사라진다.
 *
 *   방아쇠는 두 사람이 아니어도 된다. 같은 사람이 편집기를 연 채 다른 탭에서
 *   무JS 문단 폼으로 한 번만 저장해도 판이 오른다.
 *
 * 그래서 두 가지를 본다.
 *   1) 규칙 자체 — nextRev 를 **rich-doc-editor.tsx 원본에서 읽어** 돌린다.
 *      시험용으로 구현을 복사해 두면 두 벌이 되고, 두 벌은 반드시 어긋난다
 *      (tests/safe-next.test.mjs 와 같은 방식).
 *   2) 그 규칙을 부르는 자리 — 버그는 규칙이 아니라 **어느 갈래에서 부르는가**
 *      였다. 성공 갈래 안으로 다시 들어가면 같은 사고가 그대로 재현되므로,
 *      호출이 `if (result.ok)` 보다 앞에 있는지 원본에서 확인한다.
 *
 * 의존성이 없다. `npm run check` 에 들어 있다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src", "components", "editor", "rich-doc-editor.tsx");
const source = readFileSync(SRC, "utf8");

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 원본에서 규칙 하나만 떼어 온다
// ---------------------------------------------------------------------------
function cut(from, to) {
  const a = source.indexOf(from);
  if (a < 0) throw new Error(`원본에서 ${from} 를 찾지 못했습니다`);
  const b = source.indexOf(to, a);
  if (b < 0) throw new Error(`원본에서 ${from} 의 끝을 찾지 못했습니다`);
  return source.slice(a, b + to.length);
}

const nextRevSrc = cut("export function nextRev(", "\n}").replace(
  "export function nextRev(seen: number, result: SaveResult): number",
  "function nextRev(seen, result)",
);
const nextRev = new Function(`${nextRevSrc}\nreturn nextRev;`)();

console.log("\n[1] 판 번호 규칙");
ok("성공하면 서버가 준 새 판을 받는다", nextRev(1, { ok: true, rev: 2 }) === 2);
ok("실패해도 서버가 준 현재 판을 받는다", nextRev(1, { ok: false, rev: 7 }) === 7);
ok("판을 안 주면 들고 있던 값을 지킨다", nextRev(5, { ok: false }) === 5);
ok("0판도 값이다 (문서를 막 만든 직후)", nextRev(3, { ok: true, rev: 0 }) === 0);
ok("음수·소수·NaN 은 값이 아니다", nextRev(4, { ok: false, rev: -1 }) === 4);
ok("소수", nextRev(4, { ok: false, rev: 1.5 }) === 4);
ok("NaN", nextRev(4, { ok: false, rev: Number.NaN }) === 4);

// ---------------------------------------------------------------------------
// 서버를 흉내 낸다 — rich-doc.ts 의 saveRichDoc + diagnose 와 같은 규칙
//   판이 맞으면  → 저장하고 새 판을 준다
//   판이 밀렸으면 → 저장하지 않고 **지금 판**을 준다 (rich.stale_retry)
// (같은 규칙이 실제 Postgres 에서도 그렇게 도는지는 supabase/rls.test.mjs 가 본다)
// ---------------------------------------------------------------------------
function makeServer() {
  const store = { rev: 1, text: "처음" };
  return {
    store,
    save(seen, text) {
      if (seen !== store.rev) return { ok: false, rev: store.rev, reason: "rich.stale_retry" };
      store.rev += 1;
      store.text = text;
      return { ok: true, rev: store.rev };
    },
  };
}

/** 탭 하나. 편집기가 revRef 를 다루는 방식 그대로. */
function makeTab(server, name) {
  let rev = 1; // 화면을 열 때 서버가 준 판(initialRev)
  return {
    name,
    get rev() {
      return rev;
    },
    save(text) {
      const result = server.save(rev, text);
      rev = nextRev(rev, result);
      return result;
    },
  };
}

console.log("\n[2] 두 탭이 같은 판으로 열려 있다");
{
  const server = makeServer();
  const a = makeTab(server, "A");
  const b = makeTab(server, "B");

  const first = a.save("가");
  ok("A 는 저장된다", first.ok && server.store.rev === 2);

  const lost = b.save("나1");
  ok("B 는 이번 저장을 넘긴다 (앞사람 글을 덮어쓰지 않는다)", !lost.ok && server.store.text === "가");
  ok("B 가 서버의 판을 받아 갔다", b.rev === 2, `내 판 ${b.rev}`);

  const again = b.save("나2");
  ok("B 의 다음 저장은 통과한다", again.ok && server.store.text === "나2");
}

console.log("\n[3] 진 탭이 계속 쓴다 — 스무 번");
{
  const server = makeServer();
  const a = makeTab(server, "A");
  const b = makeTab(server, "B");
  a.save("가");

  let saved = 0;
  for (let i = 1; i <= 20; i += 1) {
    if (b.save(`나${i}`).ok) saved += 1;
  }
  ok(
    "첫 한 번만 밀리고 나머지는 전부 저장된다",
    saved === 19,
    `저장된 횟수 ${saved}/20`,
  );
  ok("마지막에 쓴 글이 서버에 있다", server.store.text === "나20", server.store.text);
}

console.log("\n[4] 무JS 문단 폼이 끼어들어도 (같은 사람, 다른 탭)");
{
  const server = makeServer();
  const editor = makeTab(server, "편집기");
  // rich-doc-blocks.ts 의 store() 는 같은 칸에 쓰고 판을 올린다.
  server.save(1, "무JS 로 고친 문단");
  const first = editor.save("편집기에서 쓴 글");
  ok("편집기는 한 번 밀린다", !first.ok);
  const second = editor.save("편집기에서 쓴 글");
  ok("두 번째에 저장된다 (영영 막히지 않는다)", second.ok && server.store.rev === 3);
  // ⚠ 이때 무JS 로 고친 문단은 덮인다. 편집기 화면에 그 글이 없기 때문이다.
  //   막을 방법이 없어 문구로 알린다 — feedback.ts 의 rich.stale_retry.
  ok("덮어쓴 사실은 감추지 않는다", first.reason === "rich.stale_retry");
}

// ---------------------------------------------------------------------------
// 규칙을 **어디서 부르는가**. 여기가 실제로 뚫린 자리다.
// ---------------------------------------------------------------------------
console.log("\n[5] 부르는 자리 (원본을 읽어 확인한다)");
{
  /* 끝 표식이 한동안 `[engine, onSave],` 였다. 그 뒤 flushSave 에 retry
     의존성이 붙어 `[engine, onSave, retry],` 가 되었고, **시험이 조용히
     터진 채로 있었다** — npm run check 가 이 자리에서 멈춰 있었다.
     의존성 배열은 앞으로도 늘어날 수 있으므로, 안 흔들리는 것을 표식으로
     삼는다. 바로 다음 줄의 flushRef 대입은 이 함수의 존재 이유다. */
  const flush = cut("const flushSave = useCallback(", "flushRef.current = flushSave");
  const at = flush.indexOf("revRef.current = nextRev(");
  const okBranch = flush.indexOf("if (result.ok)");
  ok("flushSave 가 nextRev 로 판을 받는다", at >= 0);
  ok(
    "성공 갈래보다 **먼저** 받는다 (실패해도 받아야 한다)",
    at >= 0 && okBranch >= 0 && at < okBranch,
    `nextRev ${at} · if(ok) ${okBranch}`,
  );
}

console.log("\n[6] 떠날 때 마지막 한 번 (원본을 읽어 확인한다)");
{
  // beforeunload·visibilitychange 는 빵부스러기 링크·뒤로가기에서 오지 않는다.
  // 그 길에서 마지막 2.5초치 타자를 잃지 않으려면 언마운트 정리에서 저장해야 한다.
  const effect = cut("engine.onDirty = () => {", "}, [engine, flushSave, onLeave]);");
  const cleanup = effect.slice(effect.indexOf("return () => {"));
  ok("언마운트 정리가 마지막 저장을 보낸다", cleanup.includes('flushSave("leave")'));
  ok("타이머만 지우고 끝내지 않는다", /clearTimeout/.test(cleanup) && cleanup.includes("flushSave"));
  ok("고칠 것이 없으면 캐시만 무른다", cleanup.includes("onLeave"));
}

console.log(`\n${pass}개 통과${fails.length ? ` · ${fails.length}개 실패` : ""}`);
if (fails.length) {
  console.log("\n실패 항목:");
  fails.forEach((f) => console.log(`  - ${f}`));
  console.log();
  process.exit(1);
}
