/**
 * RLS 행동 테스트
 *
 * 정책이 "존재하는 것"과 "실제로 막는 것"은 다르다.
 * 여기서는 실제 Postgres(PGlite)에 사용자를 흉내 내어 접속해, 막혀야 할 것이 막히는지 확인한다.
 *
 * 실행: node supabase/rls.test.mjs
 *
 * 이 테스트가 통과한다는 것은 다음을 의미한다:
 *   애플리케이션 코드에 버그가 있어도, 권한 없는 사용자에게 데이터가 나가지 않는다.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const SUPABASE_STUB = `
create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/') $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
`;

// ---------------------------------------------------------------------------
// 테스트 하네스
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, note = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}${note ? ` — ${note}` : ""}`);
  }
}

const db = await PGlite.create();

/** 특정 사용자로 로그인한 것처럼 쿼리한다. */
async function as(userId, sql, params = []) {
  await db.exec("set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return { ok: true, rows: (await db.query(sql, params)).rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec("reset role;");
  }
}

/** 관리자(마이그레이션) 권한으로 실행 */
async function admin(sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  return (await db.query(sql, params)).rows;
}

/** 막혀야 하는 동작: 오류가 나거나 0행이어야 통과 */
async function denied(userId, sql, params = []) {
  const r = await as(userId, sql, params);
  if (!r.ok) return true;
  return r.rows.length === 0;
}

// ---------------------------------------------------------------------------
// 준비
// ---------------------------------------------------------------------------
console.log("\n[준비] 스키마 적용");
await db.exec(SUPABASE_STUB);
const files = (await readdir(join(HERE, "migrations"))).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  await db.exec(await readFile(join(HERE, "migrations", f), "utf8"));
}
console.log(`  마이그레이션 ${files.length}개 적용 완료`);

console.log("\n[준비] 가상 조직 구성");
// 부서 2개: 자원순환과 / 대중교통과
const [deptA] = await admin(
  `insert into department (name) values ('자원순환과') returning id`,
);
const [deptB] = await admin(
  `insert into department (name) values ('대중교통과') returning id`,
);

async function makeUser(name, deptId) {
  const [u] = await admin(
    `insert into auth.users (email) values ($1) returning id`,
    [`${name}@korea.kr`],
  );
  await admin(
    `insert into profile (id, name, department_id, email, position)
     values ($1, $2, $3, $4, '주무관')`,
    [u.id, name, deptId, `${name}@korea.kr`],
  );
  return u.id;
}

const kim = await makeUser("김담당", deptA.id); // 자원순환과 · 업무 소유자
const park = await makeUser("박협업", deptA.id); // 자원순환과 · 같은 부서
const lee = await makeUser("이타부서", deptB.id); // 대중교통과 · 남
const choi = await makeUser("최후임", deptA.id); // 자원순환과 · 후임자
console.log("  사용자 4명 / 부서 2개");

// 김담당이 private 업무를 만든다
const [w] = await admin(
  `insert into work (title, department_id, owner_id, created_by, visibility, status)
   values ('2026년 폐기물 감량 시행계획', $1, $2, $2, 'private', 'doing') returning id`,
  [deptA.id, kim],
);
const workId = w.id;

// 부서 공개 업무도 하나
const [wDept] = await admin(
  `insert into work (title, department_id, owner_id, created_by, visibility)
   values ('재활용 정거장 운영', $1, $2, $2, 'department') returning id`,
  [deptA.id, kim],
);

// ---------------------------------------------------------------------------
console.log("\n[1] 열람 권한 — 참여자가 아니면 볼 수 없다");
// ---------------------------------------------------------------------------
{
  const r = await as(kim, `select id from work where id = $1`, [workId]);
  check("소유자는 자기 업무를 본다", r.ok && r.rows.length === 1);
}
check(
  "같은 부서라도 private 업무는 못 본다",
  await denied(park, `select id from work where id = $1`, [workId]),
);
check(
  "타 부서는 private 업무를 못 본다",
  await denied(lee, `select id from work where id = $1`, [workId]),
);
{
  const r = await as(park, `select id from work where id = $1`, [wDept.id]);
  check("부서 공개 업무는 같은 부서원이 본다", r.ok && r.rows.length === 1);
}
check(
  "부서 공개 업무를 타 부서는 못 본다",
  await denied(lee, `select id from work where id = $1`, [wDept.id]),
);

// ---------------------------------------------------------------------------
console.log("\n[2] IDOR — UUID를 알아도 뚫리지 않는다");
// ---------------------------------------------------------------------------
await admin(
  `insert into document (work_id, title, created_by) values ($1, '시행계획 초안', $2)`,
  [workId, kim],
);
const [doc] = await admin(`select id from document where work_id = $1`, [workId]);
check(
  "문서 ID를 정확히 알아도 권한 없으면 못 본다",
  await denied(lee, `select id from document where id = $1`, [doc.id]),
);
await admin(
  `insert into comment (work_id, author_id, body) values ($1, $2, '예산 확인 필요')`,
  [workId, kim],
);
check(
  "댓글도 업무 권한을 따라 차단된다",
  await denied(lee, `select id from comment where work_id = $1`, [workId]),
);
check(
  "이력도 업무 권한을 따라 차단된다",
  await denied(lee, `select id from activity where work_id = $1`, [workId]),
);

// ---------------------------------------------------------------------------
console.log("\n[3] 역할 — 열람자는 고칠 수 없다");
// ---------------------------------------------------------------------------
await admin(
  `insert into work_member (work_id, profile_id, role, added_by) values ($1, $2, 'viewer', $3)`,
  [workId, park, kim],
);
{
  const r = await as(park, `select id from work where id = $1`, [workId]);
  check("참여자로 추가되면 열람 가능해진다", r.ok && r.rows.length === 1);
}
check(
  "열람자(viewer)는 업무를 수정할 수 없다",
  await denied(park, `update work set title = '무단수정' where id = $1 returning id`, [workId]),
);
check(
  "열람자는 문서를 수정할 수 없다",
  await denied(park, `update document set title = '무단수정' where id = $1 returning id`, [doc.id]),
);
{
  // viewer도 의견은 남길 수 있어야 한다(협업 촉진). 이건 허용되어야 정상.
  const r = await as(
    park,
    `insert into comment (work_id, author_id, body) values ($1, $2, '검토 의견') returning id`,
    [workId, park],
  );
  check("열람자도 의견은 남길 수 있다", r.ok && r.rows.length === 1);
}
check(
  "열람자는 참여자를 추가할 수 없다",
  await denied(
    park,
    `insert into work_member (work_id, profile_id, role) values ($1, $2, 'editor') returning work_id`,
    [workId, lee],
  ),
);

// ---------------------------------------------------------------------------
console.log("\n[4] 이력 위조 — 감사 기록은 손댈 수 없다");
// ---------------------------------------------------------------------------
check(
  "사용자는 이력을 직접 삽입할 수 없다",
  await denied(
    kim,
    `insert into activity (work_id, actor_id, kind, summary)
     values ($1, $2, 'work.updated', '위조된 기록') returning id`,
    [workId, kim],
  ),
);
check(
  "소유자라도 이력을 수정할 수 없다",
  await denied(kim, `update activity set summary = '조작됨' where work_id = $1 returning id`, [workId]),
);
check(
  "소유자라도 이력을 삭제할 수 없다",
  await denied(kim, `delete from activity where work_id = $1 returning id`, [workId]),
);
{
  const r = await as(kim, `select count(*)::int as n from activity where work_id = $1`, [workId]);
  check(
    "그런데 이력은 자동으로 쌓여 있다",
    r.ok && r.rows[0].n > 0,
    r.ok ? `${r.rows[0].n}건` : r.error,
  );
}

// ---------------------------------------------------------------------------
console.log("\n[5] 권한 상승 — 소속을 바꿔 남의 부서를 엿볼 수 없다");
// ---------------------------------------------------------------------------
check(
  "본인 소속 부서를 스스로 바꿀 수 없다",
  await denied(lee, `update profile set department_id = $1 where id = $2 returning id`, [
    deptA.id,
    lee,
  ]),
);
check(
  "본인 직급을 스스로 바꿀 수 없다",
  await denied(lee, `update profile set position = '시장' where id = $1 returning id`, [lee]),
);
check(
  "남의 프로필은 수정할 수 없다",
  await denied(lee, `update profile set name = '해킹됨' where id = $1 returning id`, [kim]),
);
{
  const r = await as(lee, `update profile set avatar_url = '/me.png' where id = $1 returning id`, [
    lee,
  ]);
  check("본인 아바타는 바꿀 수 있다", r.ok && r.rows.length === 1);
}

// ---------------------------------------------------------------------------
console.log("\n[6] 섹션 편집 잠금 — DB가 강제한다");
// ---------------------------------------------------------------------------
await admin(
  `insert into work_member (work_id, profile_id, role, added_by) values ($1, $2, 'editor', $3)`,
  [workId, choi, kim],
);
const [sec] = await admin(
  `insert into doc_section (document_id, heading, body) values ($1, '추진 배경', '초안') returning id`,
  [doc.id],
);
// 김담당이 섹션을 잠근다
await as(kim, `update doc_section set locked_by = $1, locked_at = now() where id = $2`, [kim, sec.id]);
check(
  "다른 사람이 잠근 섹션은 수정할 수 없다",
  await denied(choi, `update doc_section set body = '가로채기' where id = $1 returning id`, [sec.id]),
);
{
  const r = await as(kim, `update doc_section set body = '본인 수정' where id = $1 returning id`, [
    sec.id,
  ]);
  check("잠근 본인은 수정할 수 있다", r.ok && r.rows.length === 1);
}
// 잠금 만료(5분) 후에는 다른 사람도 편집 가능해야 한다
await admin(`update doc_section set locked_at = now() - interval '10 minutes' where id = $1`, [sec.id]);
{
  const r = await as(choi, `update doc_section set body = '만료 후 수정' where id = $1 returning id`, [
    sec.id,
  ]);
  check("잠금이 만료되면 다른 편집자가 이어받는다", r.ok && r.rows.length === 1);
}
{
  const r = await as(kim, `select count(*)::int as n from doc_version where section_id = $1`, [sec.id]);
  check(
    "섹션을 저장할 때마다 버전이 남는다",
    r.ok && r.rows[0].n >= 2,
    r.ok ? `${r.rows[0].n}개 버전` : r.error,
  );
}

// ---------------------------------------------------------------------------
console.log("\n[7] 주인 없는 업무 방지");
// ---------------------------------------------------------------------------
check(
  "마지막 소유자는 해제할 수 없다",
  await denied(kim, `delete from work_member where work_id = $1 and profile_id = $2 returning work_id`, [
    workId,
    kim,
  ]),
);

// ---------------------------------------------------------------------------
console.log("\n[8] 인수인계 — 제품의 클라이맥스");
// ---------------------------------------------------------------------------
const [ho] = await admin(
  `insert into handover (from_profile_id, to_profile_id, status)
   values ($1, $2, 'confirmed') returning id`,
  [kim, choi],
);
await admin(`insert into handover_item (handover_id, work_id) values ($1, $2), ($1, $3)`, [
  ho.id,
  workId,
  wDept.id,
]);

check(
  "당사자가 아니면 인계 내역을 볼 수 없다",
  await denied(lee, `select id from handover where id = $1`, [ho.id]),
);
check(
  "제3자는 남의 인계를 실행할 수 없다",
  await denied(lee, `select public.execute_handover($1)`, [ho.id]),
);

{
  const r = await as(kim, `select public.execute_handover($1) as n`, [ho.id]);
  check("전임자가 인계를 실행한다", r.ok && r.rows[0]?.n === 2, r.ok ? `${r.rows[0].n}건 이관` : r.error);
}
{
  const rows = await admin(`select owner_id from work where id = $1`, [workId]);
  check("업무 주담당이 후임자로 바뀐다", rows[0].owner_id === choi);
}
{
  const rows = await admin(
    `select role from work_member where work_id = $1 and profile_id = $2`,
    [workId, choi],
  );
  check("후임자가 소유 권한을 갖는다", rows[0]?.role === "owner");
}
{
  const rows = await admin(
    `select role from work_member where work_id = $1 and profile_id = $2`,
    [workId, kim],
  );
  check("전임자는 열람 권한으로 남는다 (인계 직후 질의응답 가능)", rows[0]?.role === "viewer");
}
{
  const r = await as(choi, `select id from work where id = $1`, [workId]);
  check("후임자가 인계받은 업무를 연다", r.ok && r.rows.length === 1);
}
{
  const r = await as(choi, `select count(*)::int as n from activity where work_id = $1`, [workId]);
  check(
    "후임자가 전임자의 협업 이력을 그대로 물려받는다",
    r.ok && r.rows[0].n > 0,
    r.ok ? `${r.rows[0].n}건의 이력` : r.error,
  );
}
{
  const r = await as(kim, `select public.execute_handover($1)`, [ho.id]);
  check("완료된 인계는 재실행되지 않는다", !r.ok);
}

// ---------------------------------------------------------------------------
console.log("\n[9] 열람 로그 — 누가 봤는지 남는다");
// ---------------------------------------------------------------------------
{
  const r = await as(choi, `select public.log_access($1, 'work.viewed')`, [workId]);
  check("권한 있는 사용자의 열람은 기록된다", r.ok);
}
check(
  "권한 없는 사용자는 열람 기록조차 남길 수 없다",
  await denied(lee, `select public.log_access($1, 'work.viewed')`, [workId]),
);
check(
  "열람 로그는 본인 것 외에는 보이지 않는다",
  await denied(lee, `select id from access_log where work_id = $1`, [workId]),
);

// ---------------------------------------------------------------------------
console.log("\n[10] 익명 접근");
// ---------------------------------------------------------------------------
{
  await db.exec("set role anon;");
  let blocked = false;
  try {
    await db.query(`select id from work`);
  } catch {
    blocked = true;
  }
  await db.exec("reset role;");
  check("로그인하지 않으면 아무것도 볼 수 없다", blocked);
}

// ---------------------------------------------------------------------------
await db.close();
console.log(`\n${pass}개 통과 · ${fail}개 실패`);
if (fail) {
  console.log("\n실패 항목:");
  failures.forEach((f) => console.log(`  - ${f}`));
  console.log();
}
process.exit(fail ? 1 : 0);
