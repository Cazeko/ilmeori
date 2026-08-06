/**
 * 시드 검증
 *
 * supabase/seed/demo.sql 이 실제로 들어가는지 PGlite에서 확인한다.
 * 열 이름 오타, 외래키 순서, enum 값, 따옴표 이스케이프처럼
 * "붙여 넣고 실행 눌렀을 때 비로소 터지는 것"들을 미리 잡는 것이 목적이다.
 *
 * 실행: node supabase/seed.test.mjs
 *
 * 한계: auth.users 생성 블록은 Supabase 전용(extensions.crypt, auth.identities)이라
 *      여기서는 건너뛰고, 같은 id의 사용자를 스텁 표에 직접 넣어 대신한다.
 *      즉 **데이터 부분만** 검증한다. 계정 생성은 실제 프로젝트에서 확인해야 한다.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const STUB = `
create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users (id uuid primary key, email text);
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

const db = await PGlite.create();
await db.exec(STUB);

const dir = join(HERE, "migrations");
for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(await readFile(join(dir, f), "utf8"));
}
console.log("마이그레이션 4개 적용 ✓");

const raw = await readFile(join(HERE, "seed", "demo.sql"), "utf8");

/**
 * 비밀번호가 파일에 박혀 커밋되는 것을 막는다.
 *
 * 제출물에 깃헙 주소가 포함되므로 키·비밀번호 유출이 가장 현실적인 사고 경로다.
 * 이 파일은 자리표시자를 그대로 둔 채 커밋하고, 실제 값은 SQL Editor에 붙여 넣을 때만 바꾼다.
 */
if (!raw.includes("CHANGE-ME-BEFORE-RUNNING")) {
  console.error("\n✗ demo.sql 에 비밀번호가 박혀 있습니다.");
  console.error("  자리표시자(CHANGE-ME-BEFORE-RUNNING)를 되돌리고,");
  console.error("  실제 값은 Supabase SQL Editor에 붙여 넣을 때만 바꾸세요.");
  process.exit(1);
}

/**
 * 계정 생성 블록을 스텁으로 바꾼다.
 * 블록 안의 (uuid, email, name) 목록을 그대로 뽑아 auth.users에 넣는다.
 */
const block = raw.match(/do \$\$[\s\S]*?end \$\$;/);
if (!block) throw new Error("계정 생성 블록을 찾지 못했습니다.");
const accounts = [...block[0].matchAll(/\('([0-9a-f-]{36})'::uuid, '([^']+)'/g)];
if (accounts.length === 0) throw new Error("계정 목록을 찾지 못했습니다.");
await db.exec(
  `insert into auth.users (id, email) values ${accounts
    .map(([, id, email]) => `('${id}', '${email}')`)
    .join(",")};`,
);
console.log(`계정 ${accounts.length}개 스텁 삽입 ✓`);

const dataOnly = raw.replace(block[0], "");
try {
  await db.exec(dataOnly);
} catch (err) {
  console.error("\n✗ 시드 실행 실패");
  console.error(`  ${err.message}`);
  if (err.position) {
    const line = dataOnly.slice(0, Number(err.position)).split("\n").length;
    console.error(`  → ${line}번째 줄 부근: ${dataOnly.split("\n")[line - 1]?.trim()}`);
  }
  process.exit(1);
}
console.log("시드 실행 ✓");

// 기대치는 생성기가 적어 둔 것을 쓴다. 숫자를 여기 또 적으면 반드시 어긋난다.
const EXPECTED = JSON.parse(
  await readFile(join(HERE, "seed", "demo.counts.json"), "utf8"),
);

console.log("\n행 수 (목업 대비)");
let failed = false;
for (const [table, expected] of Object.entries(EXPECTED)) {
  const { rows } = await db.query(`select count(*)::int as n from ${table}`);
  const n = rows[0].n;
  const ok = n === expected;
  if (!ok) failed = true;
  console.log(`  ${ok ? "✓" : "✗"} ${table.padEnd(14)} ${n}${ok ? "" : ` (기대 ${expected})`}`);
}

// 데이터가 서로 맞물리는지 — 화면이 실제로 그려지려면 이것들이 성립해야 한다
console.log("\n정합성");
const checks = [
  ["모든 업무에 소유자 참여자가 있다", `
    select count(*)::int as n from work w
    where not exists (select 1 from work_member m
      where m.work_id = w.id and m.profile_id = w.owner_id and m.role = 'owner')`],
  ["「작년 이맘때」 연결이 살아 있다", `
    select count(*)::int as n from work
    where previous_year_work_id is not null
      and previous_year_work_id not in (select id from work)`],
  ["이력이 가리키는 업무가 모두 존재한다", `
    select count(*)::int as n from activity a
    where a.work_id not in (select id from work)`],
  ["인계 대상이 인계자 소유다", `
    select count(*)::int as n from handover_item i
    join handover h on h.id = i.handover_id
    join work w on w.id = i.work_id
    where w.owner_id <> h.from_profile_id`],
];
for (const [label, sql] of checks) {
  const { rows } = await db.query(sql);
  const ok = rows[0].n === 0;
  if (!ok) failed = true;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — 어긋난 행 ${rows[0].n}개`}`);
}

// 시드가 RLS를 끄고 들어가므로, 끝난 뒤 반드시 원래대로 켜져 있어야 한다.
// 여기서 못 잡으면 "데이터는 들어갔는데 표가 전부 열린 상태"로 배포된다.
{
  const { rows } = await db.query(`
    select coalesce(string_agg(c.relname, ', '), '') as off
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  const ok = rows[0].off === "";
  if (!ok) failed = true;
  console.log(`  ${ok ? "✓" : "✗"} 시드 후 RLS가 다시 켜져 있다${ok ? "" : ` — 꺼진 표: ${rows[0].off}`}`);
}
{
  const { rows } = await db.query(`
    select coalesce(string_agg(c.relname, ', '), '') as unforced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relrowsecurity and not c.relforcerowsecurity`);
  console.log(`  · force 미적용 표: ${rows[0].unforced || "없음"}`);
}

// 같은 시드를 두 번 돌려도 안전해야 한다(대시보드에서 실수로 두 번 누를 수 있다)
await db.exec(dataOnly.replace(/insert into (activity|access_log)[\s\S]*?;\n/g, ""));
const { rows: again } = await db.query("select count(*)::int as n from work");
if (again[0].n !== EXPECTED.work) {
  failed = true;
  console.log(`  ✗ 두 번 실행하면 업무가 ${again[0].n}건으로 늘어난다`);
} else {
  console.log("  ✓ 두 번 실행해도 늘어나지 않는다");
}

console.log(failed ? "\n실패\n" : "\n전체 통과\n");
process.exit(failed ? 1 : 0);
