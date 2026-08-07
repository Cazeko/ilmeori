/**
 * 실시간 왕복 확인 — **실제 Supabase 프로젝트에 붙어서** 돈다.
 *
 * 실행:  node supabase/realtime.probe.mjs
 *        (.env.local 의 URL·anon key·DEMO_ACCOUNT_PASSWORD 를 읽는다)
 *
 * ── 왜 PGlite 검사로는 부족한가 ─────────────────────────────────────────────
 *
 * npm run db:test 는 정책이 막아야 할 것을 막는지 확인한다. 하지만 PGlite 의
 * 접속 사용자는 superuser 라 realtime.messages 의 RLS 를 통째로 지나가고,
 * 웹소켓·채널 참가 판정·토큰 전달은 아예 재현되지 않는다.
 *
 * 이 프로젝트에서 실제로 물렸던 것들이 전부 그런 부류였다(GRANT 층이 없었던 것,
 * storage 가 contentType 을 버린 것). 그래서 여기서 한 번 더 찌른다.
 *
 * 확인하는 것
 *   [1] 볼 수 있는 사람은 그 업무 채널에 들어간다      ← 0012 정책이 실물에서 산다
 *   [2] 볼 수 없는 사람은 거부된다                     ← 토픽이 권한 경계다
 *   [3] 남이 고치면 신호가 온다                        ← 트리거가 실물에서 산다
 *   [4] 신호에 내용이 실려 있지 않다                    ← 페이로드 규약
 *   [5] 접속자 표시가 서로에게 보인다                   ← presence
 *
 * 0012 를 아직 SQL Editor 에서 돌리지 않았다면 [1]부터 실패한다. 그게 정상이고,
 * 그때의 실패 메시지가 "무엇을 눌러야 하는지"를 알려 준다.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// ---------------------------------------------------------------------------
// 환경
// ---------------------------------------------------------------------------
const env = {};
for (const line of (await readFile(join(ROOT, ".env.local"), "utf8").catch(() => "")).split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PW = process.env.DEMO_ACCOUNT_PASSWORD ?? env.DEMO_ACCOUNT_PASSWORD;

if (!URL_ || !KEY || !PW) {
  console.error(
    [
      ".env.local 에 다음 셋이 있어야 합니다.",
      "  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / DEMO_ACCOUNT_PASSWORD",
      "",
      "이 확인은 실제 프로젝트에 붙습니다. 데모 모드에서는 돌릴 수 없습니다.",
    ].join("\n"),
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 하네스
// ---------------------------------------------------------------------------
let pass = 0;
const fails = [];
const ok = (name, cond, note = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (note ? ` — ${note}` : ""));
    console.log(`  ✗ ${name}${note ? ` — ${note}` : ""}`);
  }
};

const clients = [];
async function signIn(email) {
  const c = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email} 로그인 실패: ${error.message}`);
  // 앱과 같은 순서다. 토큰은 subscribe() 를 부르는 그 순간 정해지므로,
  // 세션을 먼저 확정하지 않으면 익명으로 붙는다.
  await c.auth.getSession();
  clients.push(c);
  return c;
}

/** 채널에 들어가 본다. 결과를 던지지 않고 그대로 돌려준다. (path.join 과 이름이 겹치지 않게 enter) */
function enter(client, topic, { onTouch } = {}) {
  return new Promise((resolve) => {
    const ch = client.channel(topic, {
      config: { private: true, presence: { key: client.__id } },
    });
    ch.on("presence", { event: "sync" }, () => {});
    if (onTouch) ch.on("broadcast", { event: "work.touched" }, ({ payload }) => onTouch(payload));
    const timer = setTimeout(() => resolve({ status: "NO_ANSWER", ch }), 12_000);
    ch.subscribe((status, err) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        resolve({ status, error: err?.message ?? "", ch });
      }
    });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 시연 데이터에서 쓸 만한 업무 한 건을 고른다
// ---------------------------------------------------------------------------
console.log("\n[준비] 실제 프로젝트에서 확인할 업무 고르기");

const a = await signIn("demo02@ilmeori.demo"); // 박준호 · 자원순환과
const { data: me } = await a.auth.getUser();
a.__id = me.user.id;

const { data: works, error: worksErr } = await a
  .from("work")
  .select("id, title, visibility, department_id, work_member(profile_id, role)")
  .is("archived_at", null)
  .limit(50);
if (worksErr) throw new Error(`업무를 읽지 못했습니다: ${worksErr.message}`);

// 내가 고칠 수 있고, 나 말고 다른 참여자가 있고, 전체공개가 아닌 업무.
// 전체공개면 "못 보는 사람"이 없어 [2]를 확인할 수 없다.
// 그리고 문서 항목이 하나는 있어야 한다 — 흔적을 남기지 않는 변경을 거기서 만든다.
const candidates = works.filter(
  (w) =>
    w.visibility !== "city" &&
    w.work_member.some((m) => m.profile_id === a.__id && (m.role === "owner" || m.role === "editor")) &&
    w.work_member.some((m) => m.profile_id !== a.__id),
);

let target = null;
let section = null;
for (const w of candidates) {
  const { data: rows } = await a
    .from("doc_section")
    .select("id, heading, document!inner(work_id)")
    .eq("document.work_id", w.id)
    .limit(1);
  if (rows?.[0]) {
    target = w;
    section = rows[0];
    break;
  }
}
if (!target) {
  console.error(
    [
      "확인에 쓸 업무를 찾지 못했습니다. 다음을 모두 만족하는 업무가 하나는 있어야 합니다.",
      "  · demo02(박준호)가 소유자나 편집자",
      "  · 참여자가 2명 이상",
      "  · 공개 범위가 전체공개가 아님",
      "  · 문서 항목이 1개 이상",
      "",
      `지금 조건에 근접한 업무 ${candidates.length}건에 문서 항목이 없습니다.`,
      "시드를 다시 채운 뒤(supabase/seed/demo.sql) 돌려 주세요.",
    ].join("\n"),
  );
  process.exit(2);
}

// 듣는 사람 = 같은 업무의 다른 참여자
const listenerId = target.work_member.find((m) => m.profile_id !== a.__id).profile_id;
const { data: listener } = await a.from("profile").select("email, name").eq("id", listenerId).single();

// 못 보는 사람 = 참여자도 아니고 소관 부서도 아닌 직원
const { data: outsiders } = await a
  .from("profile")
  .select("id, email, name, department_id")
  .eq("is_active", true)
  .neq("department_id", target.department_id)
  .limit(20);
const outsider = outsiders?.find((p) => !target.work_member.some((m) => m.profile_id === p.id));
if (!outsider) {
  console.error("못 보는 사람으로 쓸 계정을 찾지 못했습니다.");
  process.exit(2);
}

const TOPIC = `work:${target.id}`;
console.log(`  업무: ${target.title} (${target.visibility})`);
console.log(`  듣는 사람: ${listener.name} / 못 보는 사람: ${outsider.name}`);

// ---------------------------------------------------------------------------
console.log("\n[1] 볼 수 있는 사람은 채널에 들어간다");
// ---------------------------------------------------------------------------
const b = await signIn(listener.email);
const { data: bUser } = await b.auth.getUser();
b.__id = bUser.user.id;

const signals = [];
const joined = await enter(b, TOPIC, { onTouch: (p) => signals.push(p) });
ok(
  "참여자는 그 업무 채널에 참가한다",
  joined.status === "SUBSCRIBED",
  joined.status === "SUBSCRIBED"
    ? ""
    : `${joined.status} ${joined.error} — 0012_realtime.sql 을 SQL Editor 에서 돌렸는지 확인해 주세요`,
);

if (joined.status !== "SUBSCRIBED") {
  console.log("\n채널에 못 들어가면 나머지는 볼 것이 없습니다. 여기서 멈춥니다.");
  await Promise.all(clients.map((c) => c.auth.signOut()));
  process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("\n[2] 볼 수 없는 사람은 거부된다");
// ---------------------------------------------------------------------------
const c = await signIn(outsider.email);
const refused = await enter(c, TOPIC);
ok(
  "못 보는 업무의 채널에는 들어가지 못한다",
  refused.status === "CHANNEL_ERROR",
  refused.status === "SUBSCRIBED" ? "들어가졌다 — 토픽 정책을 확인해야 합니다" : refused.status,
);

// ---------------------------------------------------------------------------
console.log("\n[3] 남이 고치면 신호가 온다");
// ---------------------------------------------------------------------------
// 흔적이 남지 않는 변경을 고른다. 항목 잠금은 이력에도 이전 판에도 남지 않고,
// 곧바로 되돌릴 수 있다. 시연 데이터를 더럽히지 않는 것이 중요하다.
signals.length = 0;

// PostgREST 는 RLS 에 막혀 0행이 되어도 error 를 주지 않는다. 행 수를 세야 한다.
// (이 저장소가 이미 한 번 물린 함정이다 — guard.ts 의 changed() 주석 참조)
const { data: lockedRows, error: lockErr } = await a
  .from("doc_section")
  .update({ locked_by: a.__id, locked_at: new Date().toISOString() })
  .eq("id", section.id)
  .select("id");
const locked = !lockErr && lockedRows?.length === 1;
ok("확인용 변경(항목 잠금)이 실제로 저장된다", locked, lockErr?.message ?? `${lockedRows?.length ?? 0}행`);

/** 잠금을 반드시 되돌린다. 남기면 시연 데이터의 항목이 5분간 잠긴 채로 있게 된다. */
async function unlock() {
  if (!locked) return;
  const { data } = await a
    .from("doc_section")
    .update({ locked_by: null, locked_at: null })
    .eq("id", section.id)
    .select("id");
  if (data?.length !== 1) {
    console.error(`\n⚠ 확인용 잠금을 되돌리지 못했습니다. 항목 ${section.id} 이(가) 잠긴 채입니다.`);
  }
}
// 중간에 Ctrl+C 로 끊어도 되돌린다.
process.once("SIGINT", async () => {
  await unlock();
  process.exit(130);
});

for (let i = 0; i < 40 && signals.length === 0; i += 1) await wait(200);
ok("듣고 있던 사람에게 신호가 왔다", signals.length > 0, signals.length === 0 ? "8초 동안 없음" : "");

await unlock();

// ---------------------------------------------------------------------------
console.log("\n[4] 신호에 내용이 실려 있지 않다");
// ---------------------------------------------------------------------------
if (signals.length > 0) {
  // 전달된 페이로드에는 서버가 붙이는 칸이 하나 더 있다 — 메시지 자체의 uuid 다.
  // (같은 값이 meta.id 로도 온다. 재전송·중복 제거에 쓰는 값이고 우리 데이터가 아니다)
  // PGlite 스텁은 이 층을 재현하지 못한다. 그래서 저장된 행만 보는 npm run db:test 는
  // 넷을 보고, 실제로 배달된 것을 보는 여기는 다섯을 본다.
  const OURS = ["actor", "at", "kind", "work_id"];
  const keys = Object.keys(signals[0]).sort();
  const extra = keys.filter((k) => !OURS.includes(k));
  ok("우리가 싣는 칸은 kind·work_id·actor·at 뿐이다", OURS.every((k) => keys.includes(k)), keys.join(","));
  ok(
    "서버가 덧붙이는 것은 메시지 id 하나뿐이다 (내용이 아니다)",
    extra.length === 1 &&
      extra[0] === "id" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(signals[0].id)) &&
      signals[0].id !== target.id &&
      signals[0].id !== section.id,
    extra.join(",") || "없음",
  );
  ok("갈래가 「문서 항목」으로 온다", signals[0].kind === "section", String(signals[0].kind));
  ok("누가 고쳤는지가 담긴다 (내 변경이면 다시 읽지 않기 위해)", signals[0].actor === a.__id);
  const dump = JSON.stringify(signals[0]);
  ok(
    "업무 제목·항목 제목이 신호에 없다",
    !dump.includes(target.title) && !dump.includes(section.heading ?? " "),
    dump,
  );
} else {
  ok("신호가 없어 내용 확인을 건너뜀", false, "위 [3] 이 먼저 통과해야 합니다");
}

// ---------------------------------------------------------------------------
console.log("\n[5] 접속자 표시");
// ---------------------------------------------------------------------------
const mine = await enter(a, TOPIC);
ok("고친 사람도 같은 채널에 들어간다", mine.status === "SUBSCRIBED", mine.error ?? mine.status);
if (mine.status === "SUBSCRIBED") {
  await mine.ch.track({});
  await joined.ch.track({});
  await wait(1500);
  const seen = Object.keys(joined.ch.presenceState());
  ok(
    "서로가 접속자 목록에 보인다",
    seen.includes(a.__id) && seen.includes(b.__id),
    `보이는 사람: ${seen.length}명`,
  );
  ok(
    "접속자 표시에는 이름이 실려 오지 않는다 (이름은 서버가 준 목록에서 찾는다)",
    Object.values(joined.ch.presenceState()).every((metas) =>
      metas.every((m) => !("name" in m)),
    ),
  );
}

// ---------------------------------------------------------------------------
for (const cl of clients) {
  await cl.removeAllChannels();
  await cl.auth.signOut();
}
console.log(`\n통과 ${pass}건 / 실패 ${fails.length}건`);
if (fails.length) {
  console.log("\n실패 항목:");
  fails.forEach((f) => console.log(`  - ${f}`));
}
process.exit(fails.length ? 1 : 0);
