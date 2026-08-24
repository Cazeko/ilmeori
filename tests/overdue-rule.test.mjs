/**
 * 지연의 정의는 한 곳이어야 한다 — 그리고 검색어는 질의를 깨면 안 된다.
 *
 * ── 왜 이 시험이 생겼나 ────────────────────────────────────────────────────
 *
 * 업무 보드의 조회에 상한(100건)을 걸면서 「지연만 보기」와 「지연 N건」을
 * **SQL 로** 옮겼다. 그 전에는 전 행을 받아 와 `derivedStatus` 로 걸렀으므로
 * 정의가 한 곳(types.ts)뿐이었는데, 이제 같은 뜻이 두 곳에 있다.
 *
 *   types.ts   derivedStatus  — 화면이 카드 하나를 보고 판정한다
 *   data/db.ts worksFiltered  — DB 가 행을 고른다 (neq/not/lt 세 줄)
 *
 * 둘이 갈라지면 조용히 틀린다. 목록에는 지연 카드가 셋인데 위의 알림은 둘이라
 * 적히는 식이고, 공문서를 다루는 화면에서 「조용히」가 제일 나쁘다.
 *
 * SQL 쪽은 실제 Postgres 없이 못 돌린다. 대신 **그 세 줄이 뜻하는 술어**를
 * 여기 한 번 더 적어 놓고, 온갖 경우에 대해 derivedStatus 와 같은 답을 내는지
 * 잰다. 누가 한쪽만 고치면 이 시험이 먼저 안다.
 *
 * 돌리는 법
 *   npm run test:overdue
 */

import { derivedStatus } from "../src/lib/types.ts";
import { daysUntil, todayKST } from "../src/lib/format.ts";
import { ilikePattern } from "../src/lib/search-term.ts";

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n지연 — 화면의 판정과 DB 의 조건이 같은 답을 하는가");
// ---------------------------------------------------------------------------

/**
 * `data/db.ts` 의 worksFiltered 가 overdueOnly 일 때 거는 세 조건.
 *
 *   .neq("status", "done")        끝나지 않았고
 *   .not("due_date", "is", null)  기한이 있고
 *   .lt("due_date", todayKST())   그 기한이 오늘보다 앞이다
 *
 * 저 세 줄이 바뀌면 여기도 바뀌어야 하고, 안 바꾸면 아래 대조가 깨진다.
 */
function matchesSqlPredicate(work, today) {
  return work.status !== "done" && work.due_date !== null && work.due_date < today;
}

const today = todayKST();
const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000)
  .toISOString()
  .slice(0, 10);
const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000)
  .toISOString()
  .slice(0, 10);

const STATUSES = ["todo", "doing", "review", "done"];
const DATES = [null, yesterday, today, tomorrow, "2020-01-01", "2999-12-31"];

const mismatches = [];
for (const status of STATUSES) {
  for (const due_date of DATES) {
    const work = { status, due_date };
    const screen = derivedStatus(work) === "overdue";
    const db = matchesSqlPredicate(work, today);
    if (screen !== db) {
      mismatches.push(`status=${status} due=${due_date} 화면=${screen} DB=${db}`);
    }
  }
}
ok(
  "derivedStatus 와 SQL 조건이 모든 경우에 같다",
  mismatches.length === 0,
  mismatches.length ? mismatches.join(" / ") : `${STATUSES.length * DATES.length}가지`,
);

// 못박아 두는 몇 가지. 위 대조가 통과해도 **둘 다 틀린** 경우를 잡는다.
ok("어제 기한 + 미완료 = 지연", derivedStatus({ status: "doing", due_date: yesterday }) === "overdue");
ok("오늘 기한 = 아직 지연 아님", derivedStatus({ status: "doing", due_date: today }) === "doing");
ok("기한 없음 = 지연 아님", derivedStatus({ status: "todo", due_date: null }) === "todo");
ok(
  "끝난 일은 기한이 한참 지나도 지연이 아니다",
  derivedStatus({ status: "done", due_date: "2020-01-01" }) === "done",
);

// ---------------------------------------------------------------------------
console.log("\n「오늘」은 하나뿐인가 — 아침 여덟 시 반");
// ---------------------------------------------------------------------------

/*
 * 이 앱에는 한동안 「오늘」이 둘이었다.
 *
 *   카드의 날짜 글자   format.ts 의 daysUntil → todayKST()  Asia/Seoul
 *   지연 배지·개수     types.ts 의 todayISO()               UTC
 *
 * 한국은 UTC+9 라 **매일 00:00~09:00 KST 동안 두 값이 다른 날짜**였다.
 * 그 아홉 시간에 어제 마감인 업무는 이렇게 보였다.
 *
 *     날짜 글자 「1일 지남」(붉게)  ·  배지 「진행중」  ·  지연 개수 제외
 *
 * 공무원 출근 시각이 정확히 그 창 안이라 9시가 지나면 조용히 맞아졌고,
 * 그래서 버그로 신고되지 않고 「가끔 이상하다」로 남는 종류였다.
 *
 * 아래는 그 창의 한복판을 못박는다. 누가 UTC 기준 「오늘」을 다시 만들면
 * 여기가 먼저 터진다.
 */
const 아침 = new Date("2026-08-24T23:30:00Z"); // = 2026-08-25 08:30 KST
const kstDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(아침);
const utcDay = 아침.toISOString().slice(0, 10);

ok(
  "그 시각에 UTC 와 KST 는 실제로 다른 날짜다",
  kstDay !== utcDay,
  `KST ${kstDay} · UTC ${utcDay}`,
);

// 기한이 「어제(KST)」인 업무 하나를 그 시각에 본다.
const 어제KST = utcDay; // 2026-08-24 — KST 로는 어제, UTC 로는 아직 오늘
const 날짜글자 = daysUntil(어제KST, kstDay); // 음수면 「N일 지남」
const 배지가지연 = 어제KST < kstDay; // derivedStatus 가 하는 바로 그 비교

ok(
  "날짜 글자와 배지가 같은 날을 본다",
  날짜글자 < 0 && 배지가지연,
  `${-날짜글자}일 지남 · 지연=${배지가지연}`,
);

ok(
  "UTC 를 기준으로 삼았다면 어긋났다 — 그래서 쓰지 않는다",
  (어제KST < utcDay) === false,
  "UTC 기준으로는 「아직 오늘」이라 지연이 아니다",
);

// 실제 함수가 KST 를 본다는 것. 위 세 줄은 산술이고 이 줄이 구현을 잡는다.
ok(
  "todayKST() 가 Asia/Seoul 을 본다",
  todayKST() ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
  todayKST(),
);

// ---------------------------------------------------------------------------
console.log("\n검색어 — PostgREST 필터 값으로 안전한가");
// ---------------------------------------------------------------------------

/*
 * 검색을 DB 로 내리면서 사용자가 친 글자가 `or=(...)` 문자열에 들어간다.
 * 질의 문법을 깨는 글자와 ILIKE 와일드카드가 남아 있으면 안 된다.
 */
const DANGEROUS = ["%", "_", "*", '"', "\\", ",", "(", ")"];

/**
 * 사용자가 친 글자만 남긴다.
 *
 * 돌아오는 값은 `"%…%"` 모양이고 겹따옴표도 앞뒤 `%` 도 **우리가 붙인 것**이다.
 * 처음에는 겹따옴표만 벗겼는데, 그러면 감싸개의 `%` 를 사용자 입력으로 착각해
 * 「% 가 샜다」고 잡았다 — 시험이 자기가 만든 글자를 보고 실패한 셈이다.
 */
const userPart = (out) => (out === null ? "" : out.slice(2, -2));

const leaked = [];
for (const ch of DANGEROUS) {
  const out = ilikePattern(`가${ch}나`);
  if (userPart(out).includes(ch)) leaked.push(`${ch} → ${out}`);
}
ok("질의를 깨는 글자가 값에 남지 않는다", leaked.length === 0, leaked.join(" / ") || `${DANGEROUS.length}종`);

ok("평범한 검색어는 그대로 통과한다", ilikePattern("전국체전") === '"%전국체전%"');
ok("앞뒤 공백은 다듬는다", ilikePattern("  수송 대책  ") === '"%수송 대책%"');
ok("빈 검색어는 조건을 걸지 않는다(null)", ilikePattern("") === null);
ok("공백뿐인 검색어도 null", ilikePattern("   ") === null);
ok("undefined 도 null", ilikePattern(undefined) === null);
ok(
  "와일드카드만 친 경우 전 행이 돌아오지 않는다",
  ilikePattern("%") === null,
  "걸러 내면 남는 것이 없으므로 조건 자체가 안 걸린다",
);
ok(
  "탈출 시도가 조건을 하나 더 만들지 못한다",
  !userPart(ilikePattern('a","b')).includes('"'),
);

// ---------------------------------------------------------------------------
console.log(
  fails.length === 0
    ? `\n전부 통과 — ${pass}건 통과, 0건 실패\n`
    : `\n실패 — ${pass}건 통과, ${fails.length}건 실패\n`,
);
if (fails.length) process.exit(1);
