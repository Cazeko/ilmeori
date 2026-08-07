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
import { REALTIME_STUB } from "./realtime-stub.mjs";
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
await db.exec(REALTIME_STUB);
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
{
  // 잠금만 잡았다 푸는 것은 수정이 아니다. 여기서 시각이 밀리면 읽기 화면에
  // 「이전 사람 이름 · 방금」이라는 있지도 않은 사실이 찍힌다.
  const before = await admin(
    `select updated_at, updated_by from doc_section where id = $1`,
    [sec.id],
  );
  await as(kim, `update doc_section set locked_by = $1, locked_at = now() where id = $2`, [kim, sec.id]);
  await as(kim, `update doc_section set locked_by = null, locked_at = null where id = $1`, [sec.id]);
  const after = await admin(
    `select updated_at, updated_by from doc_section where id = $1`,
    [sec.id],
  );
  check(
    "잠금만 잡았다 풀면 마지막 수정 시각이 밀리지 않는다",
    before[0].updated_at.getTime() === after[0].updated_at.getTime() &&
      before[0].updated_by === after[0].updated_by,
  );
  const v = await admin(`select count(*)::int as n from doc_version where section_id = $1`, [sec.id]);
  check("잠금만으로는 새 판도 생기지 않는다", v[0].n === 2, `${v[0].n}개 판`);
}
{
  // 항목을 지운 사실은 남아야 한다. 인수인계 감사에서 「누가 없앴는가」는
  // 「누가 고쳤는가」만큼 자주 묻는 질문이다.
  const [tmpSec] = await admin(
    `insert into doc_section (document_id, heading, body) values ($1, '없어질 항목', '내용') returning id`,
    [doc.id],
  );
  const r = await as(kim, `delete from doc_section where id = $1 returning id`, [tmpSec.id]);
  check("편집자는 항목을 지울 수 있다", r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  const log = await admin(
    `select summary from activity where work_id = $1 and detail->>'deleted' = 'true'`,
    [workId],
  );
  check("항목을 지운 사실이 이력에 남는다", log.length === 1, log[0]?.summary ?? "기록 없음");
}
{
  const r = await as(kim, `update document set title = '이름 바꾼 문서' where id = $1 returning id`, [doc.id]);
  check("문서 이름을 바꾼다", r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  const log = await admin(
    `select summary from activity where work_id = $1 and kind = 'document.updated'`,
    [workId],
  );
  check("문서 이름을 바꾼 사실이 이력에 남는다", log.length === 1, log[0]?.summary ?? "기록 없음");
}

// ---------------------------------------------------------------------------
console.log("\n[7] 주인 없는 업무 방지 — 그리고 업무 자체는 지워진다");
// ---------------------------------------------------------------------------
check(
  "마지막 소유자는 해제할 수 없다",
  await denied(kim, `delete from work_member where work_id = $1 and profile_id = $2 returning work_id`, [
    workId,
    kim,
  ]),
);
{
  // 0008 이전에는 여기서 막혔다. 업무를 지우면 참여자가 연쇄로 지워지고
  // 그때 위의 가드가 걸려, 소유자를 아무리 늘려도 **어떤 방법으로도** 지울 수 없었다.
  // 정책은 허용한다고 적혀 있는데 실행하면 언제나 실패하는 상태였다.
  const [tmp] = await admin(
    `insert into work (title, department_id, owner_id, created_by, visibility)
     values ('지워질 업무', $1, $2, $2, 'private') returning id`,
    [deptA.id, kim],
  );
  await admin(
    `insert into document (work_id, title, created_by) values ($1, '딸린 문서', $2)`,
    [tmp.id, kim],
  );
  const r = await as(kim, `delete from work where id = $1 returning id`, [tmp.id]);
  check("소유자는 업무를 지울 수 있다 (연쇄 삭제가 가드에 막히지 않는다)", r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  const left = await admin(`select count(*)::int as n from work_member where work_id = $1`, [tmp.id]);
  check("딸린 참여자·문서도 함께 사라진다", left[0].n === 0);
}
check(
  "남은 업무의 마지막 소유자는 여전히 보호된다",
  await denied(kim, `delete from work_member where work_id = $1 and profile_id = $2 returning work_id`, [
    workId,
    kim,
  ]),
);

// ---------------------------------------------------------------------------
console.log("\n[8] 공개 범위 — 편집 권한과 권한 배분 권한은 다르다");
// ---------------------------------------------------------------------------
// 이 시점에 workId의 참여자는 김담당=소유, 박협업=열람, 최후임=편집이다.
check(
  "편집자는 공개 범위를 바꿀 수 없다",
  await denied(choi, `update work set visibility = 'city' where id = $1 returning id`, [workId]),
);
{
  // 칸 하나만 막은 것이지 편집 자체를 막은 것이 아니다.
  // 정책을 소유자로 좁혔다면 이것까지 막혔을 것이고, 그러면 협업 도구가 아니다.
  const r = await as(choi, `update work set title = '제목 수정' where id = $1 returning id`, [workId]);
  check("편집자는 다른 칸은 여전히 고칠 수 있다", r.ok && r.rows.length === 1);
}
{
  const r = await as(kim, `update work set visibility = 'city' where id = $1 returning id`, [workId]);
  check("소유자는 공개 범위를 바꿀 수 있다", r.ok && r.rows.length === 1, r.ok ? "" : r.error);
}
{
  const rows = await admin(`select visibility from work where id = $1`, [workId]);
  check("바뀐 값이 실제로 저장된다", rows[0]?.visibility === "city");
}
// 뒤 시험이 private 전제로 돌아가므로 되돌린다
await admin(`update work set visibility = 'private' where id = $1`, [workId]);

// ── 같은 표의 다른 칸들 — 정책은 행만 보고 칸은 보지 못한다 ──────────────
// 아래 넷은 전부 실제로 뚫려 있던 자리다. 부서를 옮기면 남의 과 전원이 문서·대화를
// 읽게 되는데 이력에는 한 줄도 남지 않았다.
check(
  "편집자는 소관 부서를 옮길 수 없다 (다른 과 전체에 열람 권한이 넘어간다)",
  await denied(choi, `update work set department_id = $1 where id = $2 returning id`, [
    deptB.id,
    workId,
  ]),
);
check(
  "소유자도 소관 부서는 옮길 수 없다 (바꾸는 정상 경로가 없는 값이다)",
  await denied(kim, `update work set department_id = $1 where id = $2 returning id`, [
    deptB.id,
    workId,
  ]),
);
check(
  "편집자는 주담당을 스스로 가져갈 수 없다 (이력 위조가 된다)",
  await denied(choi, `update work set owner_id = $1 where id = $2 returning id`, [choi, workId]),
);
check(
  "편집자는 업무를 보관할 수 없다",
  await denied(choi, `update work set archived_at = now() where id = $1 returning id`, [workId]),
);
check(
  "소유 권한이 없는 사람을 주담당으로 앉힐 수 없다",
  await denied(kim, `update work set owner_id = $1 where id = $2 returning id`, [park, workId]),
);
{
  // 한 폼으로 여러 칸을 함께 고친다. elsif 사슬이던 시절에는 첫 하나만 남았다.
  const before = await admin(
    `select count(*)::int as n from activity where work_id = $1 and kind = 'work.updated'`,
    [workId],
  );
  const r = await as(
    kim,
    `update work set title = '제목과 마감을 함께', due_date = '2026-12-31', description = '설명도'
     where id = $1 returning id`,
    [workId],
  );
  const after = await admin(
    `select count(*)::int as n from activity where work_id = $1 and kind = 'work.updated'`,
    [workId],
  );
  check(
    "여러 칸을 함께 고치면 칸마다 이력이 남는다",
    r.ok && after[0].n - before[0].n === 3,
    `${after[0].n - before[0].n}줄`,
  );
}
{
  const r = await as(kim, `update work set archived_at = now() where id = $1 returning id`, [workId]);
  const log = await admin(
    `select summary from activity where work_id = $1 order by id desc limit 1`,
    [workId],
  );
  check("보관도 이력에 남는다", r.ok && log[0]?.summary === "업무를 보관했습니다", log[0]?.summary ?? "");
  await as(kim, `update work set archived_at = null where id = $1`, [workId]);
}

// ---------------------------------------------------------------------------
console.log("\n[9] 인수인계 — 제품의 클라이맥스");
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
{
  // 인수자를 잘못 골라 초안을 만들었을 때 되돌릴 길 — 아무 일도 일어나지 않은 초안은 지운다.
  const [draft] = await admin(
    `insert into handover (from_profile_id, to_profile_id, status)
     values ($1, $2, 'generated') returning id`,
    [choi, lee],
  );
  check(
    "제3자는 남의 인계를 취소할 수 없다",
    await denied(kim, `delete from handover where id = $1 returning id`, [draft.id]),
  );
  const r = await as(choi, `delete from handover where id = $1 returning id`, [draft.id]);
  check("실행 전 인계는 인계자가 취소할 수 있다", r.ok && r.rows.length === 1, r.ok ? "" : r.error);
}
check(
  "완료된 인계는 지울 수 없다 (권한이 실제로 옮겨 간 기록이다)",
  await denied(kim, `delete from handover where id = $1 returning id`, [ho.id]),
);
check(
  "완료된 인계를 되돌려 놓고 지우는 우회도 막힌다",
  await denied(kim, `update handover set status = 'confirmed' where id = $1 returning id`, [ho.id]),
);

// ---------------------------------------------------------------------------
console.log("\n[10] 열람 로그 — 누가 봤는지 남는다");
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
console.log("\n[11] GRANT 층 — RLS가 아니라 권한에서 막히는가");
// ---------------------------------------------------------------------------
// 아래는 전부 RLS 정책도 없어서 어차피 0행으로 끝난다. 그런데 0행과 42501은 다르다.
// 0행은 "정책이 지금 막고 있다"이고, 42501은 "이 동작 자체가 이 역할에 없다"이다.
// 정책은 실수로 열릴 수 있고 권한은 그렇지 않다. 그래서 두 겹을 다 확인한다.
for (const [name, sql, params] of [
  ["부서를 지울 수", `delete from department where id = $1`, [deptB.id]],
  ["프로필을 지울 수", `delete from profile where id = $1`, [lee]],
  ["대화를 진짜로 지울 수", `delete from comment where work_id = $1`, [workId]],
  [
    "인계 대상의 이관 표시를 직접 켤 수",
    `update handover_item set transferred = true where handover_id = $1`,
    [ho.id],
  ],
]) {
  const r = await as(kim, sql, params);
  check(
    `${name} 없다 (권한층에서 차단)`,
    !r.ok && /permission denied|42501/i.test(r.error ?? ""),
    r.ok ? "정책만 막고 있다 — GRANT가 열려 있다" : "",
  );
}

// ---------------------------------------------------------------------------
console.log("\n[12] 익명 접근");
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
console.log("\n[13] 실시간 — 신호는 나가는가, 그리고 아무에게나 가지는 않는가");
// ---------------------------------------------------------------------------
// 실시간에서 새는 경로는 두 가지다.
//   ① 신호를 못 볼 사람이 듣는다        → 토픽 정책으로 막는다
//   ② 신호 자체에 내용이 실려 나간다     → 페이로드를 신호로만 유지해서 막는다
// broadcast 는 채널에 들어올 때 한 번만 판정하고 행 단위 필터가 없으므로,
// ②가 뚫리면 ①을 통과한 사람 전원에게 그 내용이 그대로 간다.
//
// 한계 하나를 적어 둔다. PGlite 의 접속 사용자는 superuser 라 realtime.messages 의
// RLS 를 통째로 지나간다. 그래서 "트리거(security definer)가 자기 정책에 막히지
// 않는가"는 여기서 검증되지 않는다 — 실물에서 supabase/realtime.probe.mjs 로 본다.

/** 토픽을 세팅한 채로 그 사용자처럼 질의한다. Realtime 이 채널 참가를 판정하는 모양. */
async function onTopic(userId, topic, sql, params = []) {
  await db.query("select set_config('realtime.topic', $1, false)", [topic]);
  const r = await as(userId, sql, params);
  await db.query("select set_config('realtime.topic', '', false)");
  return r;
}

// 앞의 절들이 kim 의 역할과 잠금 상태를 여러 번 바꿔 놓았다. 여기서 그 상태에
// 기대면 왜 실패했는지 알 수 없는 시험이 된다. 이 절은 자기 자산으로만 돈다.
const [w13] = await admin(
  `insert into work (title, department_id, owner_id, created_by, visibility, status)
   values ('실시간 확인용 업무', $1, $2, $2, 'private', 'doing') returning id`,
  [deptA.id, kim],
);
const [doc13] = await admin(
  `insert into document (work_id, title, created_by) values ($1, '실시간 확인용 문서', $2) returning id`,
  [w13.id, kim],
);
const [sec13] = await admin(
  `insert into doc_section (document_id, heading, body) values ($1, '항목', '내용') returning id`,
  [doc13.id],
);

const TOPIC = `work:${w13.id}`;
const COUNT_SIGNALS = `select count(*)::int as n from realtime.messages where topic = $1`;

await admin(`truncate realtime.messages`);
await as(kim, `insert into comment (work_id, author_id, body) values ($1, $2, '실시간 확인용 대화')`, [
  w13.id,
  kim,
]);

{
  const r = await admin(
    `select event, payload, private, extension from realtime.messages where topic = $1`,
    [TOPIC],
  );

  // 이 업무에 있는 사람 글자를 전부 모은다. 하나라도 페이로드에 있으면 유출이다.
  // 칸 이름만 세면 기존 칸의 **값**에 제목을 실어도 초록불이 된다.
  //
  // 여기서 보는 것은 **저장된 행**이라 우리가 넣은 넷뿐이다. 실제로 브라우저에
  // 배달될 때는 서버가 메시지 uuid 를 `id` 로 하나 더 붙인다 — 그 층은 PGlite 가
  // 재현하지 못하므로 supabase/realtime.probe.mjs(실물)가 따로 확인한다.
  // 스텁이 실물과 다른 지점은 이렇게 양쪽에 적어 둔다. 한쪽만 알면 다른 쪽이 거짓말이 된다.
  const texts = (
    await admin(
      `select w.title as t from work w where w.id = $1
       union all select d.title from document d where d.work_id = $1
       union all select s.heading from doc_section s join document d on d.id = s.document_id where d.work_id = $1
       union all select s.body    from doc_section s join document d on d.id = s.document_id where d.work_id = $1
       union all select c.body    from comment c where c.work_id = $1`,
      [w13.id],
    )
  )
    .map((x) => x.t)
    .filter(Boolean);
  const json = r.length === 1 ? JSON.stringify(r[0].payload) : "";
  // src/lib/realtime.ts 의 TOUCH_KINDS 와 같아야 한다.
  const KINDS = ["work", "member", "document", "section", "comment", "attachment"];

  check("대화를 남기면 그 업무 토픽으로 신호가 나간다", r.length === 1 && r[0].event === "work.touched");
  check(
    "신호는 private broadcast 로만 나간다",
    r.length === 1 && r[0].private === true && r[0].extension === "broadcast",
    r.length === 1 ? `private=${r[0].private} extension=${r[0].extension}` : "",
  );
  check(
    "신호에는 내용이 없다 (칸 이름도, 칸 값도)",
    r.length === 1 &&
      Object.keys(r[0].payload).sort().join(",") === "actor,at,kind,work_id" &&
      KINDS.includes(r[0].payload.kind) &&
      r[0].payload.work_id === w13.id &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r[0].payload.at) &&
      texts.every((t) => !json.includes(t)),
    json,
  );
  check("신호가 누가 일으켰는지는 담는다 (내 변경이면 다시 읽지 않기 위해)", r[0]?.payload?.actor === kim);
}

{
  // 잠금은 이력(activity)에 남지 않는다 — 남기면 이력이 잠금 기록으로 뒤덮인다.
  // 그래서 이력에 기대는 방식으로는 「○○○ 편집 중」이 상대 화면에 뜨지 않는다.
  await admin(`truncate realtime.messages`);
  const before = await admin(`select count(*)::int as n from activity where work_id = $1`, [w13.id]);
  const locked = await as(
    kim,
    `update doc_section set locked_by = $1, locked_at = now() where id = $2 returning id`,
    [kim, sec13.id],
  );
  const after = await admin(`select count(*)::int as n from activity where work_id = $1`, [w13.id]);
  const sig = await admin(COUNT_SIGNALS, [TOPIC]);
  check(
    "이력에 남지 않는 변경(항목 잠금)도 신호는 나간다",
    locked.ok && locked.rows.length === 1 && before[0].n === after[0].n && sig[0].n === 1,
    `잠금 ${locked.rows?.length ?? locked.error}행, 이력 ${before[0].n}→${after[0].n}, 신호 ${sig[0].n}건`,
  );
  await as(kim, `update doc_section set locked_by = null, locked_at = null where id = $1`, [sec13.id]);
}

{
  const r = await onTopic(kim, TOPIC, COUNT_SIGNALS, [TOPIC]);
  check("업무를 볼 수 있는 사람은 그 토픽을 듣는다", r.ok && r.rows[0].n > 0);
}
{
  const r = await onTopic(lee, TOPIC, COUNT_SIGNALS, [TOPIC]);
  check("업무를 볼 수 없는 사람은 같은 토픽에서 한 건도 못 듣는다", r.ok && r.rows[0].n === 0);
}
{
  // wDept 에도 신호를 하나 만들어 둔다. 신호가 없으면 정책이 통째로 없어도
  // count 가 0 으로 나와 초록불이 된다 — 아무것도 증명하지 못하는 검사가 된다.
  const DEPT_TOPIC = `work:${wDept.id}`;
  await as(kim, `insert into comment (work_id, author_id, body) values ($1, $2, '부서 공개 확인용')`, [
    wDept.id,
    kim,
  ]);
  const r = await onTopic(park, DEPT_TOPIC, COUNT_SIGNALS, [DEPT_TOPIC]);
  check("부서 공개 업무의 토픽은 같은 부서원에게 열린다", r.ok && r.rows[0].n > 0, r.error ?? "0건");
  const out = await onTopic(lee, DEPT_TOPIC, COUNT_SIGNALS, [DEPT_TOPIC]);
  check("부서 공개 업무의 토픽도 타 부서에는 닫혀 있다", out.ok && out.rows[0].n === 0);
  const mine = await onTopic(park, TOPIC, COUNT_SIGNALS, [TOPIC]);
  check("같은 부서라도 비공개 업무의 토픽은 닫혀 있다", mine.ok && mine.rows[0].n === 0);
}
{
  const r = await onTopic(kim, "", COUNT_SIGNALS, [TOPIC]);
  check("토픽 없이는 아무것도 못 듣는다", r.ok && r.rows[0].n === 0);
}

// 토픽 문자열을 정책 안에서 맨몸으로 uuid 캐스팅하면 여기서 22P02 로 터진다.
// 터지면 "막힌다"가 아니라 "판정이 실패한다"이고, 그건 다른 종류의 사고다.
for (const bad of ["lobby", "work:새업무", "work:", "work:00000000-0000-0000-0000", "system"]) {
  const r = await onTopic(kim, bad, COUNT_SIGNALS, [TOPIC]);
  check(`이상한 토픽(${bad})은 예외 없이 0행이다`, r.ok && r.rows[0].n === 0, r.error ?? "");
}

{
  const r = await admin(
    `select app.topic_work_id($1) as a, app.topic_work_id('work:zzz') as b,
            app.topic_work_id(null) as c, app.topic_work_id($2) as d`,
    [TOPIC, w13.id],
  );
  check(
    "app.topic_work_id 는 모양이 맞을 때만 업무 id 를 돌려준다",
    r[0].a === w13.id && r[0].b === null && r[0].c === null && r[0].d === null,
  );
}

{
  // 접속자 표시(presence)는 쓰기다. 못 보는 업무의 접속자 목록에 들어갈 수 없어야 한다.
  //
  // returning 을 붙이면 insert 에 **읽기 정책**이 함께 걸린다. 그러면 빨간불이
  // 쓰기 정책 때문인지 읽기 정책 때문인지 구분되지 않고, 쓰기가 통째로 열려 있어도
  // 초록불이 된다. 행 수를 세는 방식으로 바꾼다.
  const count = `select count(*)::int as n from realtime.messages where topic = $1 and extension = 'presence'`;
  const ins = `insert into realtime.messages (topic, extension) values ($1, 'presence')`;

  const b1 = await admin(count, [TOPIC]);
  const mine = await onTopic(kim, TOPIC, ins, [TOPIC]);
  const a1 = await admin(count, [TOPIC]);
  check("볼 수 있는 사람은 접속자 목록에 들어간다", mine.ok && a1[0].n === b1[0].n + 1);

  const theirs = await onTopic(lee, TOPIC, ins, [TOPIC]);
  const a2 = await admin(count, [TOPIC]);
  check(
    "볼 수 없는 사람은 접속자 목록에도 못 들어간다",
    !theirs.ok && /row-level security|42501/i.test(theirs.error ?? "") && a2[0].n === a1[0].n,
    theirs.ok ? "들어가졌다" : "",
  );
}

{
  // Realtime 이 채널 참가를 판정할 때 넣어 보는 행에는 topic 과 extension 만 있다.
  // payload·event 는 비어 있고 private 는 기본값이다. 정책이 그 칸들을 참조하면
  // 실물에서 채널 참가가 조용히 거부된다 — 0012 에서 가장 밟기 쉬운 함정이다.
  await admin(`insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [TOPIC]);
  const probe = `select count(*)::int as n from realtime.messages where topic = $1 and payload is null`;
  const k = await onTopic(kim, TOPIC, probe, [TOPIC]);
  const l = await onTopic(lee, TOPIC, probe, [TOPIC]);
  check(
    "판정용 행(payload 가 빈 행)도 볼 수 있는 사람에게만 보인다",
    k.ok && k.rows[0].n > 0 && l.ok && l.rows[0].n === 0,
    `kim ${k.rows?.[0]?.n} / lee ${l.rows?.[0]?.n}`,
  );
}

// ---------------------------------------------------------------------------
// 표마다 신호가 실제로 나가는가
//
// 여기까지의 검사는 comment INSERT 와 doc_section UPDATE 둘만 발화시킨다.
// 나머지 트리거 넷(work·member·document·attachment)을 통째로 지워도 전부 초록불이었다.
// ⚠ work_member 를 건드리므로 위의 토픽 검사들 **뒤에** 두어야 한다.
//   (park 를 참여자로 넣으면 「같은 부서라도 비공개 업무의 토픽은 닫혀 있다」가 깨진다)
// ---------------------------------------------------------------------------
const fires = async (label, kind, sql, params) => {
  await admin(`truncate realtime.messages`);
  let err = "";
  try {
    await admin(sql, params);
  } catch (e) {
    err = e.message.split("\n")[0];
  }
  const r = await admin(`select payload->>'kind' as kind from realtime.messages where topic = $1`, [
    TOPIC,
  ]);
  check(
    `${label} → 신호 1건 (kind=${kind})`,
    r.length === 1 && r[0].kind === kind,
    `${r.length}건 ${r[0]?.kind ?? ""} ${err}`,
  );
};

await fires("업무 수정", "work", `update work set status = 'review' where id = $1`, [w13.id]);
await fires(
  "참여자 추가",
  "member",
  `insert into work_member (work_id, profile_id, role, added_by) values ($1, $2, 'viewer', $3)`,
  [w13.id, park, kim],
);
await fires(
  "참여자 권한 변경",
  "member",
  `update work_member set role = 'editor' where work_id = $1 and profile_id = $2`,
  [w13.id, park],
);
await fires("참여자 제외", "member", `delete from work_member where work_id = $1 and profile_id = $2`, [
  w13.id,
  park,
]);
await fires("문서 수정", "document", `update document set title = '바뀐 제목' where id = $1`, [doc13.id]);
await fires(
  "항목 추가",
  "section",
  `insert into doc_section (document_id, heading, body) values ($1, '둘째', '내용')`,
  [doc13.id],
);
await fires("항목 삭제", "section", `delete from doc_section where document_id = $1 and heading = '둘째'`, [
  doc13.id,
]);
await fires("대화 수정", "comment", `update comment set body = '고친 대화' where work_id = $1`, [w13.id]);

// ---------------------------------------------------------------------------
console.log("\n[14] 열람기록 — 화면이 다시 그려질 때마다 쌓이지 않는가");
// ---------------------------------------------------------------------------
// 실시간 신호 한 건은 그 업무를 열어 둔 사람 전원의 화면을 다시 그리게 하고,
// 그 서버 렌더가 log_access 를 다시 부른다. 0013 이 그것을 한 번의 열람으로 묶는다.
{
  const countLogs = `select count(*)::int as n from access_log where work_id = $1 and actor_id = $2 and kind = 'work.viewed'`;
  const before = await admin(countLogs, [w13.id, kim]);
  for (let i = 0; i < 4; i += 1) {
    await as(kim, `select public.log_access($1, 'work.viewed')`, [w13.id]);
  }
  const after = await admin(countLogs, [w13.id, kim]);
  check(
    "같은 사람이 잇달아 열어도 열람기록은 한 줄이다",
    after[0].n === before[0].n + 1,
    `${before[0].n} → ${after[0].n}`,
  );

  // 묶는 것은 '업무 열람'뿐이다. 파일 내려받기는 횟수가 곧 뜻이라 그대로 쌓인다.
  const att = `select count(*)::int as n from access_log where work_id = $1 and kind = 'attachment.downloaded'`;
  const b2 = await admin(att, [w13.id]);
  await as(kim, `select public.log_access($1, 'attachment.downloaded', $2)`, [w13.id, doc13.id]);
  await as(kim, `select public.log_access($1, 'attachment.downloaded', $2)`, [w13.id, doc13.id]);
  const a3 = await admin(att, [w13.id]);
  check("파일 내려받기는 부를 때마다 남는다", a3[0].n === b2[0].n + 2, `${b2[0].n} → ${a3[0].n}`);

  // 10분이 지나면 다른 열람이다.
  await admin(
    `update access_log set created_at = now() - interval '11 minutes'
     where work_id = $1 and actor_id = $2 and kind = 'work.viewed'`,
    [w13.id, kim],
  );
  const b3 = await admin(countLogs, [w13.id, kim]);
  await as(kim, `select public.log_access($1, 'work.viewed')`, [w13.id]);
  const a4 = await admin(countLogs, [w13.id, kim]);
  check("10분이 지나면 다시 한 줄이 남는다", a4[0].n === b3[0].n + 1, `${b3[0].n} → ${a4[0].n}`);
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
