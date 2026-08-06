/**
 * 마이그레이션 검증기
 *
 * PGlite(Postgres WASM)에 Supabase 환경을 흉내 낸 뒤 마이그레이션을 실제로 실행한다.
 * 목적은 "배포 당일에 SQL 오류를 발견하는 일"을 없애는 것이다.
 *
 * 실행: node supabase/verify.mjs
 *
 * 한계: Supabase의 auth·storage 스키마는 최소 스텁으로 대체한다.
 *      따라서 문법·의존성·정책 정의는 검증되지만, 실제 인증 동작은 검증되지 않는다.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "migrations");

/** Supabase가 제공하는 것 중 마이그레이션이 의존하는 최소한만 스텁으로 만든다. */
const SUPABASE_STUB = `
create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- 실제 Supabase에서는 JWT 클레임에서 읽는다. 검증용으로는 세션 변수로 대체한다.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text not null,
  owner     uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(name, '/')
$$;

-- Supabase의 기본 롤
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
`;

const db = await PGlite.create();

let failed = false;
const run = async (label, sql) => {
  try {
    await db.exec(sql);
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed = true;
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    if (err.position) {
      const pos = Number(err.position);
      const upto = sql.slice(0, pos);
      const line = upto.split("\n").length;
      console.error(`    → ${line}번째 줄 부근: ${sql.split("\n")[line - 1]?.trim()}`);
    }
  }
};

console.log("\nSupabase 환경 스텁 구성");
await run("auth / storage 스키마", SUPABASE_STUB);

console.log("\n마이그레이션 실행");
const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  await run(f, await readFile(join(MIGRATIONS, f), "utf8"));
}

if (!failed) {
  console.log("\n스키마 점검");
  const q = async (label, sql) => {
    const r = await db.query(sql);
    console.log(`  ${label}: ${r.rows.map((x) => Object.values(x)[0]).join(", ")}`);
  };

  await q(
    "테이블",
    `select string_agg(tablename, ', ' order by tablename) from pg_tables where schemaname='public'`,
  );
  await q(
    "RLS 미적용 테이블",
    `select coalesce(string_agg(c.relname, ', '), '없음 ✓')
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`,
  );
  await q("정책 수", `select count(*)::text from pg_policies where schemaname='public'`);
  await q(
    "정책 없는 RLS 테이블(= 완전 차단)",
    `select coalesce(string_agg(c.relname, ', '), '없음')
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' and c.relrowsecurity
       and not exists (select 1 from pg_policies p where p.tablename=c.relname and p.schemaname='public')`,
  );
  await q(
    "쓰기 정책이 없는 테이블(= append-only 의도)",
    `select coalesce(string_agg(t.tablename, ', '), '없음')
     from pg_tables t
     where t.schemaname='public'
       and not exists (
         select 1 from pg_policies p
         where p.schemaname='public' and p.tablename=t.tablename
           and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))`,
  );
  await q("트리거 수", `select count(*)::text from pg_trigger where not tgisinternal`);
  await q(
    "SECURITY DEFINER 함수 중 search_path 미고정",
    `select coalesce(string_agg(p.proname, ', '), '없음 ✓')
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname in ('app','public') and p.prosecdef
       and (p.proconfig is null or not exists (
         select 1 from unnest(p.proconfig) c where c like 'search_path=%'))`,
  );
}

// ---------------------------------------------------------------------------
// 0005 이벤트 트리거가 실제로 동작하는지 — 정의만 있고 안 도는 경우를 잡는다
// ---------------------------------------------------------------------------
console.log("\n새 테이블 자동 보호");
{
  const check = async (label, sql, table, expect) => {
    try {
      await db.exec(sql);
      const { rows } = await db.query(
        `select coalesce((select relrowsecurity from pg_class c
           join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname=$1), false) as on`,
        [table],
      );
      const ok = rows[0].on === expect;
      if (!ok) failed = true;
      console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    } catch (err) {
      failed = true;
      console.log(`  ✗ ${label} — ${err.message.split("\n")[0]}`);
    }
  };

  await check(
    "create table 하면 RLS가 켜진다",
    "create table _probe_plain (id int);",
    "_probe_plain",
    true,
  );
  await check(
    "create table as select 도 켜진다 (표를 통째로 복사하는 경로)",
    "create table _probe_copy as select 1 as id;",
    "_probe_copy",
    true,
  );
  await db.exec("drop table _probe_plain, _probe_copy;");
}

await db.close();
console.log(failed ? "\n실패 — 위 오류를 수정할 것\n" : "\n전체 통과\n");
process.exit(failed ? 1 : 0);
