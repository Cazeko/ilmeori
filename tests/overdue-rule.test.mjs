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

import { derivedStatus, todayISO } from "../src/lib/types.ts";
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
 *   .lt("due_date", todayISO())   그 기한이 오늘보다 앞이다
 *
 * 저 세 줄이 바뀌면 여기도 바뀌어야 하고, 안 바꾸면 아래 대조가 깨진다.
 */
function matchesSqlPredicate(work, today) {
  return work.status !== "done" && work.due_date !== null && work.due_date < today;
}

const today = todayISO();
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
