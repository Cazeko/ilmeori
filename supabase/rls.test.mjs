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
console.log("\n[9-1] 인계 건의 주인 — 넘겨받는 사람이 남의 인계서를 가로챌 수 없다");
// ---------------------------------------------------------------------------
// 0014의 보충 정책이 handover.from_profile_id 를 신뢰 기준으로 쓴다.
// 그런데 0002의 handover_update 는 당사자 둘 모두에게 UPDATE 를 열어 두고 어떤
// 칸을 고치는지는 보지 않았다. 인수자가 from_profile_id 를 자기로 바꾸면
// 남의 인계서에 자기 문장을 넣고 원래 인계자를 밀어낼 수 있었다(PGlite 로 재현).
// 0015가 정책과 트리거 두 겹으로 막는다.
{
  const [hg] = await admin(
    `insert into handover (from_profile_id, to_profile_id, status)
     values ($1, $2, 'generated') returning id`,
    [kim, choi],
  );

  check(
    "인수자는 인계 건을 고칠 수 없다 (인계서는 넘기는 사람의 문서다)",
    await denied(
      choi,
      `update handover set from_profile_id = $2 where id = $1 returning id`,
      [hg.id, choi],
    ),
  );
  check(
    "인수자는 인계를 완료로 만들 수 없다 (실행은 execute_handover 만 한다)",
    await denied(choi, `update handover set status = 'completed' where id = $1 returning id`, [hg.id]),
  );
  {
    const r = await as(
      kim,
      `update handover set to_profile_id = $2 where id = $1 returning id`,
      [hg.id, park],
    );
    check(
      "인계자라도 인수자를 바꿔칠 수 없다 (취소하고 새로 시작해야 기록에 남는다)",
      !r.ok && /인계자와 인수자는 바꿀 수 없습니다/.test(r.error ?? ""),
      r.ok ? "바뀌었다" : r.error,
    );
  }
  {
    const r = await as(kim, `update handover set status = 'confirmed' where id = $1 returning id`, [hg.id]);
    check("인계자는 확인 단계로 넘길 수 있다 (막은 것은 칸이지 흐름이 아니다)",
      r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  }
  {
    // 「완료」는 권한이 실제로 옮겨 갔다는 뜻이다. 손으로 적을 수 있으면 업무가
    // 한 건도 안 넘어간 인계서에 완료 도장이 찍히고, 그 뒤로는 0011의 잠금 때문에
    // 되돌리지도 취소하지도 못한다 — 되돌릴 수 없는 거짓이 남는다.
    const r = await as(
      kim,
      `update handover set status = 'completed', completed_at = now() where id = $1 returning id`,
      [hg.id],
    );
    check(
      "인계자도 손으로 완료 도장을 찍을 수 없다 (실행 절차로만 기록된다)",
      !r.ok && /인계 완료는 실행 절차로만/.test(r.error ?? ""),
      r.ok ? "찍혔다" : r.error,
    );
  }
  await admin(`delete from handover where id = $1`, [hg.id]);
}

// ---------------------------------------------------------------------------
console.log("\n[9-2] 인계서에 사람이 보태는 칸 — 규칙이 뽑은 문단은 못 고친다");
// ---------------------------------------------------------------------------
// 화면은 「인계자가 확인하고 보태야 하는 초안」이라고 적어 두고 오랫동안 고칠
// 수단을 주지 않았다. 그렇다고 전문 편집을 열면 규칙이 뽑은 문단을 사람이
// 덮어쓸 수 있게 되고, 그 옆의 근거 꼬리표가 그 순간 거짓말이 된다.
// 그래서 보태는 것만 열었다. 여기서 확인하는 것은 그 경계가 DB에서 지켜지는가다.
const NOTE_INSERT = `insert into handover_note (handover_id, block_key, body, author_id)
                     values ($1, $2, $3, $4) returning id`;
{
  const [hn] = await admin(
    `insert into handover (from_profile_id, to_profile_id, status)
     values ($1, $2, 'generated') returning id`,
    [kim, choi],
  );

  {
    const r = await as(kim, NOTE_INSERT, [hn.id, "3-assets", "물품관리대장 확인: 노트북 1대", kim]);
    check("인계자는 항목에 보충을 적을 수 있다", r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  }
  check(
    "인수자는 남의 인계서에 문장을 넣을 수 없다 (인계서는 넘기는 사람이 쓴다)",
    await denied(choi, NOTE_INSERT, [hn.id, "3-assets", "제가 대신 적습니다", choi]),
  );
  check(
    "남의 이름으로 보충을 적을 수 없다",
    await denied(kim, NOTE_INSERT, [hn.id, "3-assets", "인수자가 적은 것처럼", choi]),
  );
  check(
    "제3자는 남의 인계서 보충을 읽을 수 없다",
    await denied(lee, `select id from handover_note where handover_id = $1`, [hn.id]),
  );
  {
    const r = await as(choi, `select id from handover_note where handover_id = $1`, [hn.id]);
    check("인수자는 보충을 읽을 수 있다 (넘겨받는 사람이 못 보면 적을 이유가 없다)",
      r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  }

  // 아래 넷은 denied() 로 보지 않는다. denied() 는 "오류가 났거나 0행"이면 참이라,
  // 칸 이름에 오타가 나서 질의가 죽어도 통과한다. 무엇이 막았는지까지 확인한다.
  for (const [name, params] of [
    ["서식에 없는 칸에는 적을 수 없다 (칸은 시행규칙이 정한 일곱 개다)",
     [hn.id, "8-etc", "여덟 번째 칸", kim]],
    ["빈 보충은 들어가지 않는다 (종이에 이름과 날짜만 찍힌 줄이 남는다)",
     [hn.id, "4-notes", "   ", kim]],
    // btrim(body) 는 공백만 걷어낸다. 줄바꿈만 담긴 글이 그대로 통과했었다.
    ["줄바꿈만 담긴 보충도 들어가지 않는다", [hn.id, "4-notes", "\n\n\t", kim]],
    // 걷어낼 문자를 나열하면 반드시 빠진다. 전각 공백과 nbsp 는 한글 환경에서
    // 실제로 밟는 값이다 — 붙여넣기 한 번이면 들어온다.
    ["전각 공백만 담긴 보충도 들어가지 않는다", [hn.id, "4-notes", "　　", kim]],
    ["nbsp·BOM 만 담긴 보충도 들어가지 않는다", [hn.id, "4-notes", " ﻿", kim]],
    ["1000자를 넘는 보충은 들어가지 않는다 (앱의 상한과 같은 값이다)",
     [hn.id, "4-notes", "가".repeat(1001), kim]],
  ]) {
    const r = await as(kim, NOTE_INSERT, params);
    check(
      name,
      !r.ok && /handover_note_.*_check|23514/i.test(r.error ?? ""),
      r.ok ? "들어갔다" : `check 제약이 아니라 다른 이유로 막혔다: ${r.error}`,
    );
  }
  {
    const r = await as(kim, NOTE_INSERT, [hn.id, "4-notes", "가".repeat(1000), kim]);
    check("1000자까지는 들어간다 (한글도 글자 수로 센다)", r.ok && r.rows.length === 1,
      r.ok ? "" : r.error);
  }

  // 서식 칸 일곱 개가 **전부** 실제로 열려 있는가. 둘만 찔러 보면 나머지 다섯에
  // 오타가 있어도 초록불이고, 그 오타는 화면에 입력칸은 보이는데 저장만 안 되는
  // 모양으로 나온다.
  {
    const sqlKeys = [
      ...(await readFile(join(HERE, "migrations", "0014_handover_note.sql"), "utf8"))
        .matchAll(/^\s*'([0-9a-z-]+)',?\s*--/gm),
    ].map((m) => m[1]);
    const tsKeys = [
      ...(await readFile(join(HERE, "..", "src", "lib", "types.ts"), "utf8"))
        .match(/HANDOVER_BLOCK_KEYS = \[([^\]]+)\]/)[1]
        .matchAll(/"([^"]+)"/g),
    ].map((m) => m[1]);

    check(
      "서식 칸 목록이 DB와 앱에서 같다 (두 벌은 반드시 어긋난다)",
      sqlKeys.length === 7 && JSON.stringify(sqlKeys) === JSON.stringify(tsKeys),
      `DB ${JSON.stringify(sqlKeys)} / 앱 ${JSON.stringify(tsKeys)}`,
    );

    let opened = 0;
    for (const key of tsKeys) {
      const r = await as(kim, NOTE_INSERT, [hn.id, key, `${key} 칸에 적는다`, kim]);
      if (r.ok && r.rows.length === 1) opened += 1;
    }
    check(`서식 칸 ${tsKeys.length}개 전부에 적을 수 있다`, opened === tsKeys.length,
      `${opened}개만 열려 있다`);
  }

  // 상한은 앱이 아니라 DB가 지킨다. 앱은 사용자에게 읽을 말을 해 주려고 미리
  // 셀 뿐이고, 서버 액션은 폼을 거치지 않고 부를 수 있다. 상한이 없으면
  // 인계자가 자기 인계서 하나로 인수자의 화면과 인쇄본을 못 쓰게 만들 수 있고,
  // 실행이 끝나면 그 줄들은 아무도 지울 수 없다.
  {
    const [{ n: already }] = await admin(
      `select count(*)::int as n from handover_note where handover_id = $1`, [hn.id]);
    let inserted = 0;
    let blocked = null;
    for (let i = already; i < 40; i += 1) {
      const r = await as(kim, NOTE_INSERT, [hn.id, "4-notes", `${i}번째 줄`, kim]);
      if (r.ok) inserted += 1;
      else { blocked = r.error; break; }
    }
    const [{ n: total }] = await admin(
      `select count(*)::int as n from handover_note where handover_id = $1`, [hn.id]);
    check(
      "한 인계 건에 30개까지만 쌓인다 (DB가 막는다)",
      total === 30 && /보충을 더 담을 수 없습니다/.test(blocked ?? ""),
      blocked ? `${total}건에서 멈췄다` : `${already + inserted}건까지 들어갔다`,
    );
  }

  // 적은 순서대로 돌아와야 한다. 서식 안에서 순서가 뒤집히면 나중에 고쳐 적은
  // 내용이 먼저 적은 것 위로 올라간다.
  {
    const r = await as(
      kim,
      `select body from handover_note where handover_id = $1 and block_key = '4-notes' order by created_at`,
      [hn.id],
    );
    check(
      "보충은 적은 순서대로 나온다",
      r.ok && r.rows.length >= 2 && r.rows[0].body === "가".repeat(1000),
      r.ok ? r.rows.map((x) => x.body.slice(0, 6)).join(" → ") : r.error,
    );
  }
  {
    // 고쳐 쓰는 길은 두지 않았다. 적은 시각이 인쇄본에 찍히므로, 몸통만 나중에
    // 바뀌면 종이에 찍힌 날짜가 거짓이 된다.
    const r = await as(kim, `update handover_note set body = '슬쩍 바꾼다' where handover_id = $1`, [hn.id]);
    check(
      "적어 둔 보충은 고칠 수 없다 (권한층에서 차단)",
      !r.ok && /permission denied|42501/i.test(r.error ?? ""),
      r.ok ? "정책만 막고 있다 — GRANT가 열려 있다" : "",
    );
  }
  {
    // 위에서 여러 건을 적어 두었다. 몇 건이 있었는지 먼저 세고, 지운 수가 그것과
    // 같은지 본다 — "1행이 지워졌다"로만 보면 정책이 일부만 내주어도 통과한다.
    const [before] = await admin(
      `select count(*)::int as n from handover_note where handover_id = $1`, [hn.id]);
    const r = await as(kim, `delete from handover_note where handover_id = $1 returning id`, [hn.id]);
    check("실행 전에는 자기가 적은 보충을 지울 수 있다 (오타를 고치는 길)",
      r.ok && before.n > 0 && r.rows.length === before.n,
      r.ok ? `${before.n}건 중 ${r.rows.length}건만 지워졌다` : r.error);
  }
}
{
  // 실행이 끝난 인계 — 0011의 완료된 인계 잠금과 같은 규칙을 따른다.
  const [hdone] = await admin(
    `insert into handover (from_profile_id, to_profile_id, status, completed_at)
     values ($1, $2, 'completed', now()) returning id`,
    [kim, choi],
  );
  const [note] = await admin(NOTE_INSERT, [hdone.id, "4-notes", "실행 전에 적어 둔 것", kim]);

  check(
    "실행이 끝난 인계에는 보충을 더할 수 없다",
    await denied(kim, NOTE_INSERT, [hdone.id, "4-notes", "끝난 뒤에 덧붙인다", kim]),
  );
  check(
    "실행이 끝난 인계의 보충은 지울 수 없다 (그때 무엇이 적혀 있었는가가 곧 기록이다)",
    await denied(kim, `delete from handover_note where id = $1 returning id`, [note.id]),
  );
  {
    const r = await as(kim, `select id from handover_note where id = $1`, [note.id]);
    check("실행이 끝난 뒤에도 보충은 읽힌다 (잠그는 것은 쓰기이지 읽기가 아니다)",
      r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  }
}

// ---------------------------------------------------------------------------
console.log("\n[9-3] 인계 문답 — 양쪽이 쓰고, 끝난 뒤에도 쓰고, 아무도 못 지운다");
// ---------------------------------------------------------------------------
// 0014 의 보충과 **갈리는 자리**만 본다. 보충은 인계자만 쓰고 실행 전까지만
// 열리지만, 문답은 양쪽이 쓰고 실행 뒤가 오히려 물어볼 일이 가장 많은 때다.
// 그 둘이 뒤집히면 이 표가 있을 이유가 없어진다.
const MSG_INSERT = `insert into handover_message (handover_id, author_id, body)
                    values ($1, $2, $3) returning id`;
{
  const [hm] = await admin(
    `insert into handover (from_profile_id, to_profile_id, status)
     values ($1, $2, 'generated') returning id`,
    [kim, choi],
  );

  {
    const r = await as(choi, MSG_INSERT, [hm.id, choi, "1-나 항목의 반영본 기한이 언제까지인가요?"]);
    check("인수자가 물을 수 있다 (0014 의 보충과 갈리는 첫 자리)",
      r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  }
  {
    const r = await as(kim, MSG_INSERT, [hm.id, kim, "8월 8일까지입니다. 대행업체에 이미 통보했습니다."]);
    check("인계자가 답할 수 있다", r.ok && r.rows.length === 1, r.ok ? "" : r.error);
  }
  check(
    "남의 이름으로 쓸 수 없다",
    await denied(kim, MSG_INSERT, [hm.id, choi, "인수자가 적은 것처럼"]),
  );
  check(
    "제3자는 남의 인계 문답에 쓸 수 없다",
    await denied(lee, MSG_INSERT, [hm.id, lee, "끼어들기"]),
  );
  check(
    "제3자는 남의 인계 문답을 읽을 수 없다",
    await denied(lee, `select id from handover_message where handover_id = $1`, [hm.id]),
  );
  {
    const r = await as(choi, `select id from handover_message where handover_id = $1`, [hm.id]);
    check("당사자 둘은 같은 것을 본다 (한쪽만 가진 사본이 없다)",
      r.ok && r.rows.length === 2, r.ok ? `${r.rows?.length}행` : r.error);
  }

  // 빈 글. denied() 로 보지 않는다 — 오타로 질의가 죽어도 통과하기 때문이다.
  {
    const r = await as(kim, MSG_INSERT, [hm.id, kim, "   "]);
    check(
      "눈에 보이는 글자가 없으면 안 들어간다",
      !r.ok && /handover_message_body_check|23514/i.test(r.error ?? ""),
      r.ok ? "들어갔다" : r.error,
    );
  }

  // ── 실행이 끝난 뒤 ────────────────────────────────────────────────────────
  await admin(`update handover set status = 'completed', completed_at = now() where id = $1`, [hm.id]);
  {
    const r = await as(choi, MSG_INSERT, [hm.id, choi, "넘겨받고 보니 대행업체 연락처가 안 보입니다."]);
    check(
      "끝난 뒤에도 물을 수 있다 (이 표가 있을 이유가 바로 이때다)",
      r.ok && r.rows.length === 1,
      r.ok ? "" : r.error,
    );
  }
  // 보충은 이때 잠긴다. 문답과 갈리는 것을 같은 자리에서 함께 확인한다.
  check(
    "같은 시점에 서식 보충은 잠긴다 (둘의 규칙이 다르다는 것이 이 표의 전제다)",
    await denied(kim, NOTE_INSERT, [hm.id, "4-notes", "끝난 뒤 보충", kim]),
  );

  // ── 아무도 못 고치고 못 지운다 ────────────────────────────────────────────
  {
    const r = await as(kim, `update handover_message set body = '슬쩍 바꾼다' where handover_id = $1`, [hm.id]);
    check(
      "고칠 수 없다 — 권한 자체가 없다",
      !r.ok && /permission denied/i.test(r.error ?? ""),
      r.ok ? "고쳐졌다" : r.error,
    );
  }
  {
    const r = await as(kim, `delete from handover_message where handover_id = $1 returning id`, [hm.id]);
    check(
      "자기가 쓴 것도 못 지운다 (반쪽만 남은 문답은 안 읽느니만 못하다)",
      !r.ok && /permission denied/i.test(r.error ?? ""),
      r.ok ? `${r.rows?.length}행 지워졌다` : r.error,
    );
  }
  {
    const r = await as(kim, `select count(*)::int as n from handover_message where handover_id = $1`, [hm.id]);
    check("그래서 세 줄이 그대로 남아 있다", r.ok && r.rows[0].n === 3, r.ok ? `${r.rows[0].n}행` : r.error);
  }
}

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
  [
    "인계서에 적은 보충을 고칠 수",
    `update handover_note set body = '고쳐 쓴다' where handover_id = $1`,
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
console.log("\n[15] 결재 — 서명은 손으로 찍히지 않는다");
// ---------------------------------------------------------------------------
// 결재가 증빙인 이유는 「그때 님이 결재해 주셨는데 이제 와서 왜 딴소리」가
// 성립하기 때문이다. 그러려면 결재란이 나중에 바뀌지 않아야 한다.
// 여기서 확인하는 것은 그 한 가지다.
{
  const boss = await makeUser("정팀장", deptA.id);
  const head = await makeUser("한과장", deptA.id);
  const coop = await makeUser("오협조", deptB.id); // 타 부서 협조자
  await admin(`update profile set rank = 40, position = '팀장' where id = $1`, [boss]);
  await admin(`update profile set rank = 30, position = '과장' where id = $1`, [head]);

  const [w15] = await admin(
    `insert into work (title, department_id, owner_id, created_by, visibility)
     values ('종이컵 구매 건', $1, $2, $2, 'private') returning id`,
    [deptA.id, kim],
  );
  await admin(
    `insert into work_member (work_id, profile_id, role, added_by) values ($1, $2, 'viewer', $3)`,
    [w15.id, park, kim],
  );

  const newApproval = async (title, form) => {
    const r = await as(
      kim,
      `insert into approval (work_id, form, title, drafter_id)
       values ($1, $2, $3, $4) returning id`,
      [w15.id, form, title, kim],
    );
    return r.rows?.[0]?.id;
  };
  const addStep = (approvalId, seq, kind, who, position) =>
    as(
      kim,
      `insert into approval_step (approval_id, seq, kind, approver_id, position)
       values ($1, $2, $3, $4, $5) returning id`,
      [approvalId, seq, kind, who, position],
    );
  const stepOf = async (approvalId, seq) =>
    (
      await admin(`select id from approval_step where approval_id = $1 and seq = $2`, [
        approvalId,
        seq,
      ])
    )[0]?.id;

  // ── 기안 ────────────────────────────────────────────────────────────────
  const a1 = await newApproval("종이컵 구매 협조 요청", "cooperation");
  check("업무를 고칠 수 있는 사람은 결재를 올린다", !!a1);
  check(
    "열람자는 결재를 올릴 수 없다",
    await denied(
      park,
      `insert into approval (work_id, form, title, drafter_id)
       values ($1, 'report', '무단 기안', $2) returning id`,
      [w15.id, park],
    ),
  );
  check(
    "기안 중인 결재는 기안자만 본다",
    await denied(park, `select id from approval where id = $1`, [a1]),
  );

  // ── 상신 ────────────────────────────────────────────────────────────────
  check(
    "결재선이 없으면 상신되지 않는다",
    await denied(kim, `select public.submit_approval($1)`, [a1]),
  );
  await addStep(a1, 1, "draft", kim, "주무관");
  check(
    "기안란만 있고 결재자가 없으면 상신되지 않는다",
    await denied(kim, `select public.submit_approval($1)`, [a1]),
  );
  await addStep(a1, 2, "review", boss, "팀장");
  await addStep(a1, 3, "final", head, "과장");
  await addStep(a1, 4, "concur_par", coop, "주무관");

  {
    const r = await as(kim, `select public.submit_approval($1) as doc`, [a1]);
    check(
      "상신하면 문서번호가 붙는다",
      r.ok && /^HS-협조-\d{8}-0001$/.test(r.rows[0]?.doc ?? ""),
      r.error ?? r.rows[0]?.doc,
    );
  }
  {
    const r = await admin(
      `select signed_at from approval_step where approval_id = $1 and kind = 'draft'`,
      [a1],
    );
    check("상신하는 순간 기안란에 서명이 찍힌다", r[0]?.signed_at != null);
  }

  // ── 누가 이 문서를 보는가 ────────────────────────────────────────────────
  check(
    "결재선에 없고 업무도 못 보면 결재 문서가 보이지 않는다",
    await denied(lee, `select id from approval where id = $1`, [a1]),
  );
  {
    const r = await as(coop, `select id from approval where id = $1`, [a1]);
    check("결재선에 있으면 업무를 못 봐도 그 문서는 본다", r.ok && r.rows.length === 1);
  }
  check(
    "결재선에 있어도 그 업무까지 열리지는 않는다",
    await denied(coop, `select id from work where id = $1`, [w15.id]),
  );

  // ── 서명 ────────────────────────────────────────────────────────────────
  const s2 = await stepOf(a1, 2);
  const s3 = await stepOf(a1, 3);

  check("남의 결재칸에 서명할 수 없다", await denied(head, `select public.sign_approval($1)`, [s2]));
  check(
    "앞 순서가 남아 있으면 서명할 수 없다",
    await denied(head, `select public.sign_approval($1)`, [s3]),
  );
  check(
    "서명은 UPDATE 로 찍히지 않는다",
    await denied(boss, `update approval_step set signed_at = now() where id = $1 returning id`, [s2]),
  );
  check(
    "상신된 결재의 본문은 기안자도 못 고친다",
    await denied(kim, `update approval set body = '몰래 바꾼 본문' where id = $1 returning id`, [a1]),
  );
  check(
    "진행 상태를 손으로 적을 수 없다",
    await denied(
      kim,
      `update approval set state = 'completed', closed_at = now() where id = $1 returning id`,
      [a1],
    ),
  );
  check(
    "상신된 뒤에는 결재선에 칸을 더할 수 없다",
    await denied(
      kim,
      `insert into approval_step (approval_id, seq, kind, approver_id, position)
       values ($1, 9, 'review', $2, '팀장') returning id`,
      [a1, park],
    ),
  );
  check(
    "상신된 뒤에는 결재란을 뺄 수 없다",
    await denied(kim, `delete from approval_step where id = $1 returning id`, [s3]),
  );

  {
    const r = await as(boss, `select public.sign_approval($1, $2) as st`, [s2, "예산 확인했습니다"]);
    check("내 차례가 오면 서명한다", r.ok && r.rows[0]?.st === "in_progress", r.error);
  }
  {
    const r = await as(coop, `select public.sign_approval($1) as st`, [await stepOf(a1, 4)]);
    check("병렬협조는 줄을 서지 않는다", r.ok, r.error);
  }
  {
    const r = await as(head, `select public.sign_approval($1) as st`, [s3]);
    check("마지막 칸이 서명되면 완결된다", r.ok && r.rows[0]?.st === "completed", r.error);
  }
  check(
    "완결된 결재는 기안자도 못 고친다",
    await denied(kim, `update approval set title = '고친 제목' where id = $1 returning id`, [a1]),
  );
  check(
    "완결된 결재는 지울 수 없다",
    await denied(kim, `delete from approval where id = $1 returning id`, [a1]),
  );

  // ── 전결 ────────────────────────────────────────────────────────────────
  const a2 = await newApproval("비품 구매 전결 건", "report");
  await addStep(a2, 1, "draft", kim, "주무관");
  await addStep(a2, 2, "delegated", boss, "팀장");
  await addStep(a2, 3, "final", head, "과장");
  await as(kim, `select public.submit_approval($1)`, [a2]);
  {
    const r = await as(boss, `select public.sign_approval($1) as st`, [await stepOf(a2, 2)]);
    check("전결이 찍히면 그 자리에서 완결된다", r.ok && r.rows[0]?.st === "completed", r.error);
  }
  check(
    "전결이 찍히면 그 뒤 순서는 서명할 수 없다",
    await denied(head, `select public.sign_approval($1)`, [await stepOf(a2, 3)]),
  );

  // ── 반려 ────────────────────────────────────────────────────────────────
  const a3 = await newApproval("반려될 건", "plan");
  await addStep(a3, 1, "draft", kim, "주무관");
  await addStep(a3, 2, "review", boss, "팀장");
  await as(kim, `select public.submit_approval($1)`, [a3]);
  check(
    "사유 없는 반려는 받지 않는다",
    await denied(boss, `select public.reject_approval($1, '   ')`, [await stepOf(a3, 2)]),
  );
  {
    const r = await as(boss, `select public.reject_approval($1, $2)`, [
      await stepOf(a3, 2),
      "예산 근거가 빠졌습니다",
    ]);
    check("사유를 적으면 반려된다", r.ok, r.error);
  }
  check(
    "반려된 결재는 되돌릴 수 없다",
    await denied(kim, `update approval set state = 'in_progress' where id = $1 returning id`, [a3]),
  );

  // ── 회수 ────────────────────────────────────────────────────────────────
  const a4 = await newApproval("회수될 건", "review");
  await addStep(a4, 1, "draft", kim, "주무관");
  await addStep(a4, 2, "review", boss, "팀장");
  await as(kim, `select public.submit_approval($1)`, [a4]);
  check(
    "남의 결재를 대신 회수할 수 없다",
    await denied(boss, `select public.withdraw_approval($1)`, [a4]),
  );
  {
    const r = await as(kim, `select public.withdraw_approval($1)`, [a4]);
    check("아무도 서명하지 않았으면 회수한다", r.ok, r.error);
  }

  const a5 = await newApproval("회수 못 할 건", "review");
  await addStep(a5, 1, "draft", kim, "주무관");
  await addStep(a5, 2, "review", boss, "팀장");
  await addStep(a5, 3, "final", head, "과장");
  await as(kim, `select public.submit_approval($1)`, [a5]);
  await as(boss, `select public.sign_approval($1)`, [await stepOf(a5, 2)]);
  check(
    "서명이 시작된 뒤에는 회수할 수 없다",
    await denied(kim, `select public.withdraw_approval($1)`, [a5]),
  );

  // ── 결재선의 모양 ───────────────────────────────────────────────────────
  // 셋 다 검토에서 나왔다. 막지 않으면 「완결되지 않는 문서」가 만들어진다.
  {
    const a = await newApproval("기안란 둘", "report");
    await addStep(a, 1, "draft", kim, "주무관");
    const dup = await addStep(a, 2, "draft", boss, "팀장");
    check("기안란은 한 문서에 하나뿐이다", !dup.ok, dup.error);

    const b = await newApproval("뒤집힌 결재선", "report");
    await addStep(b, 1, "review", boss, "팀장");
    await addStep(b, 2, "draft", kim, "주무관");
    check(
      "기안란보다 앞선 칸이 있으면 상신되지 않는다",
      await denied(kim, `select public.submit_approval($1)`, [b]),
    );
  }

  // 하루에 만 건을 넘기면 연번이 다섯 자리가 된다. lpad 가 그것을 **자르면**
  // 이미 쓴 번호대로 되돌아간다. 실무에서 닿을 일은 없지만, 닿으면 조용히 틀린다.
  {
    const a = await newApproval("만 번째", "cooperation");
    await addStep(a, 1, "draft", kim, "주무관");
    await addStep(a, 2, "review", boss, "팀장");
    await as(kim, `select public.submit_approval($1)`, [a]);
    await admin(
      `update approval
       set doc_no = 'HS-협조-' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD') || '-9999'
       where id = $1`,
      [a],
    );
    const b = await newApproval("만 하나째", "cooperation");
    await addStep(b, 1, "draft", kim, "주무관");
    await addStep(b, 2, "review", boss, "팀장");
    const r = await as(kim, `select public.submit_approval($1) as doc`, [b]);
    check(
      "하루 만 건을 넘겨도 번호가 되돌아가지 않는다",
      r.ok && /-10000$/.test(r.rows[0]?.doc ?? ""),
      r.error ?? r.rows[0]?.doc,
    );
  }

  // ── 실시간 신호 ─────────────────────────────────────────────────────────
  // 기안 중인 문서는 기안자만 본다. 그런데 신호는 업무를 열어 둔 사람 전원에게
  // 간다. 화면에는 아무것도 안 나타나지만 「초안을 쓰고 있다」가 새어 나간다.
  {
    const topic = `work:${w15.id}`;
    const signals = async () =>
      (
        await admin(`select count(*)::int as n from realtime.messages where topic = $1`, [topic])
      )[0].n;

    await admin(`truncate realtime.messages`);
    const quiet = await newApproval("신호 시험", "report");
    await addStep(quiet, 1, "draft", kim, "주무관");
    await addStep(quiet, 2, "review", boss, "팀장");
    check("기안 중인 결재는 실시간 신호를 보내지 않는다", (await signals()) === 0, `${await signals()}건`);

    await admin(`truncate realtime.messages`);
    await as(kim, `select public.submit_approval($1)`, [quiet]);
    check("상신하면 신호가 나간다", (await signals()) > 0);

    await admin(`truncate realtime.messages`);
    await as(boss, `select public.sign_approval($1)`, [await stepOf(quiet, 2)]);
    check("서명해도 신호가 나간다", (await signals()) > 0);
  }

  // ── 문서번호 · 서열 ─────────────────────────────────────────────────────
  {
    const r = await admin(
      `select count(*)::int as n, count(distinct doc_no)::int as d
       from approval where doc_no is not null`,
    );
    check(
      "문서번호는 중복되지 않는다",
      r[0].n === r[0].d && r[0].n >= 5,
      `${r[0].n}건 / ${r[0].d}종`,
    );
  }
  const a6 = await newApproval("번호 위조 시도", "report");
  check(
    "문서번호를 손으로 적을 수 없다",
    await denied(
      kim,
      `update approval set doc_no = 'HS-보고-19700101-0001' where id = $1 returning id`,
      [a6],
    ),
  );
  check(
    "남의 결재선에 칸을 끼워 넣을 수 없다",
    await denied(
      boss,
      `insert into approval_step (approval_id, seq, kind, approver_id, position)
       values ($1, 9, 'review', $2, '팀장') returning id`,
      [a6, boss],
    ),
  );
  check(
    "직급 서열은 본인이 바꿀 수 없다",
    await denied(kim, `update profile set rank = 10 where id = $1 returning id`, [kim]),
  );

  // 이력은 결재도 함께 받는다. 새 표를 만들지 않았다는 뜻이다.
  {
    const r = await admin(
      `select count(*)::int as n from activity
       where work_id = $1 and kind::text like 'approval.%'`,
      [w15.id],
    );
    check("결재 사건은 업무 이력에 함께 쌓인다", r[0].n >= 8, `${r[0].n}건`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n[16] 서식 문서 — 자동 저장이 권한도 이력도 밀어내지 않는가");
// ---------------------------------------------------------------------------
// 0018 이 막으려는 것은 셋이다.
//   ① 열람 권한만 있는 사람이 본문을 고치는 것
//   ② 몇 초마다 도는 자동 저장이 업무 이력과 실시간 신호를 뒤덮는 것
//   ③ 늦게 저장한 사람이 앞사람 글을 통째로 덮어쓰는 것
// ①은 정책이, ②는 트리거 조건이, ③은 blocks_rev 를 건 한 문장이 막는다.
//
// ②에는 반대쪽 함정이 있다. 「뒤덮지 않게」를 「한 줄도 남기지 않게」로 하면
// 서식 문서로 옮긴 뒤부터 **본문을 누가 언제 고쳤는지가 감사에서 사라진다.**
// 그래서 0013 처럼 10분을 한 번으로 묶는다. 아래는 그 둘을 함께 본다 —
// 연달아 저장해도 한 줄, 창이 지나면 다시 한 줄.
//
// 앞 절들이 kim·park·choi 의 역할을 여러 번 바꿔 놓았으므로 자기 자산으로만 돈다.
{
  const [w16] = await admin(
    `insert into work (title, department_id, owner_id, created_by, visibility, status)
     values ('서식 문서 확인용 업무', $1, $2, $2, 'private', 'doing') returning id`,
    [deptA.id, kim],
  );
  const [doc16] = await admin(
    `insert into document (work_id, title, created_by) values ($1, '서식 문서 확인용 문서', $2) returning id`,
    [w16.id, kim],
  );
  // park 는 열람만, choi 는 편집.
  await admin(
    `insert into work_member (work_id, profile_id, role, added_by) values ($1, $2, 'viewer', $3)`,
    [w16.id, park, kim],
  );
  await admin(
    `insert into work_member (work_id, profile_id, role, added_by) values ($1, $2, 'editor', $3)`,
    [w16.id, choi, kim],
  );

  const DOC = '{"v":1,"blocks":[{"id":"aaaaaaaaaa","kind":"title","spans":[{"t":"확인용"}]}]}';
  const save = (who, rev, body) =>
    as(
      who,
      `update document
          set blocks = $1::jsonb, blocks_rev = $2, blocks_updated_by = $3, blocks_updated_at = now()
        where id = $4 and blocks_rev = $5
      returning blocks_rev`,
      [body, rev + 1, who, doc16.id, rev],
    );

  // --- ① 권한 -------------------------------------------------------------
  check(
    "열람 권한만 있는 사람은 blocks 를 못 고친다",
    await denied(park, `update document set blocks = $1::jsonb where id = $2 returning id`, [
      DOC,
      doc16.id,
    ]),
  );
  check(
    "업무를 아예 못 보는 사람도 blocks 를 못 고친다",
    await denied(lee, `update document set blocks = $1::jsonb where id = $2 returning id`, [
      DOC,
      doc16.id,
    ]),
  );
  {
    // 첫 저장은 항목 문서가 서식 문서가 되는 순간이다(convertToRichDoc).
    // 화면이 통째로 달라지므로 이때만은 신호가 나가야 하고, 되돌릴 수 없는
    // 사건이라 이력에도 한 줄 남아야 한다.
    await admin(`truncate realtime.messages`);
    const r = await save(choi, 0, DOC);
    const sig = await admin(
      `select payload->>'kind' as kind from realtime.messages where topic = $1`,
      [`work:${w16.id}`],
    );
    check(
      "편집 권한이 있으면 blocks 를 고친다",
      r.ok && r.rows.length === 1 && Number(r.rows[0].blocks_rev) === 1,
      r.ok ? JSON.stringify(r.rows) : r.error,
    );
    check(
      "항목 문서가 서식 문서가 되는 순간에는 신호가 나간다",
      sig.length === 1 && sig[0].kind === "document",
      `${sig.length}건 ${sig[0]?.kind ?? ""}`,
    );
    const conv = await admin(
      `select summary, detail from activity
        where work_id = $1 and detail->>'converted' = 'true'`,
      [w16.id],
    );
    check(
      "서식 문서로 옮긴 사실이 이력에 남는다",
      conv.length === 1 && conv[0].summary.includes("서식 문서로 옮겼습니다"),
      conv.map((c) => c.summary).join(" / "),
    );
  }
  check(
    "열람자는 남이 써 둔 blocks 를 읽기는 한다",
    (await as(park, `select blocks from document where id = $1`, [doc16.id])).rows?.[0]?.blocks !== undefined,
  );

  // --- ② 자동 저장이 이력·신호를 뒤덮지 않는가 -----------------------------
  const countActivity = `select count(*)::int as n from activity where work_id = $1`;
  const countVersion = `select count(*)::int as n from doc_version where document_id = $1`;
  const DOC_TOPIC_WORK = `work:${w16.id}`;

  /** 이 업무의 「본문을 고쳤습니다」 이력만 센다(제목 변경과 갈라 본다). */
  const countBlockEdits = `select count(*)::int as n from activity
    where work_id = $1 and kind = 'document.updated' and detail->>'blocks' = 'true'`;
  /** 10분 창을 지나가게 한다. 시험에서 10분을 기다릴 수는 없다. */
  const ageActivity = `update activity set created_at = created_at - interval '20 minutes'
    where work_id = $1`;

  {
    await admin(`truncate realtime.messages`);
    const a0 = await admin(countActivity, [w16.id]);
    const v0 = await admin(countVersion, [doc16.id]);
    // 자동 저장 다섯 번. 실제 편집기는 몇 초마다 이만큼을 보낸다.
    for (let i = 1; i <= 5; i += 1) await save(choi, i, DOC);
    const a1 = await admin(countActivity, [w16.id]);
    const v1 = await admin(countVersion, [doc16.id]);
    const sig = await admin(`select count(*)::int as n from realtime.messages where topic = $1`, [
      DOC_TOPIC_WORK,
    ]);
    check(
      "이어지는 자동 저장은 이력을 한 줄도 더하지 않는다 (앞의 한 줄에 묶인다)",
      a0[0].n === a1[0].n,
      `${a0[0].n} → ${a1[0].n}`,
    );
    check("blocks 만 고치면 문서 판(doc_version)도 늘지 않는다", v0[0].n === v1[0].n);
    check(
      "blocks 만 고치면 업무 토픽으로 신호가 나가지 않는다",
      sig[0].n === 0,
      `${sig[0].n}건`,
    );
  }
  {
    // 창이 지나면 다시 한 줄. 이것이 없으면 「고친 사람이 아무도 없다」가 된다.
    await admin(ageActivity, [w16.id]);
    const b0 = await admin(countBlockEdits, [w16.id]);
    const [cur] = await admin(`select blocks_rev from document where id = $1`, [doc16.id]);
    let rev = Number(cur.blocks_rev);
    for (let i = 0; i < 5; i += 1) {
      const r = await save(choi, rev, DOC);
      if (r.ok && r.rows.length) rev = Number(r.rows[0].blocks_rev);
    }
    const b1 = await admin(countBlockEdits, [w16.id]);
    check(
      "10분이 지난 뒤의 저장은 이력 한 줄을 남긴다 (다섯 번 저장해도 한 줄)",
      b1[0].n === b0[0].n + 1,
      `${b0[0].n} → ${b1[0].n}`,
    );
    const last = await admin(
      `select actor_id, summary from activity
        where work_id = $1 and detail->>'blocks' = 'true' order by created_at desc limit 1`,
      [w16.id],
    );
    check(
      "그 한 줄은 고친 사람 이름으로 남는다",
      last[0].actor_id === choi && last[0].summary.includes("본문을 고쳤습니다"),
      `${last[0].summary}`,
    );
  }
  {
    // 창은 사람마다 따로다. 옆 사람이 방금 고쳤다고 내 편집이 안 남으면
    // 「누가 고쳤는가」가 뒤바뀐다 — 감사에서 가장 나쁜 종류의 거짓이다.
    const b0 = await admin(countBlockEdits, [w16.id]);
    const [cur] = await admin(`select blocks_rev from document where id = $1`, [doc16.id]);
    const r = await save(kim, Number(cur.blocks_rev), DOC);
    const b1 = await admin(countBlockEdits, [w16.id]);
    check(
      "다른 사람이 고치면 그 사람 몫으로 한 줄이 남는다",
      r.ok && b1[0].n === b0[0].n + 1,
      `${b0[0].n} → ${b1[0].n}`,
    );
  }
  {
    // 기존 동작이 살아 있는가. 여기가 빨간불이면 트리거를 너무 많이 잘라 낸 것이다.
    await admin(`truncate realtime.messages`);
    const a0 = await admin(countActivity, [w16.id]);
    await as(kim, `update document set title = '이름을 바꾼 문서' where id = $1`, [doc16.id]);
    const a1 = await admin(countActivity, [w16.id]);
    const sig = await admin(
      `select payload->>'kind' as kind from realtime.messages where topic = $1`,
      [DOC_TOPIC_WORK],
    );
    check("문서 이름을 바꾸면 지금까지처럼 이력이 남는다", a1[0].n === a0[0].n + 1);
    check(
      "문서 이름을 바꾸면 지금까지처럼 신호가 나간다",
      sig.length === 1 && sig[0].kind === "document",
      `${sig.length}건 ${sig[0]?.kind ?? ""}`,
    );
  }

  // --- ③ 판 밀림 -----------------------------------------------------------
  {
    const [cur] = await admin(`select blocks_rev from document where id = $1`, [doc16.id]);
    const rev = Number(cur.blocks_rev);
    const late = await save(choi, rev - 1, '{"v":1,"blocks":[{"id":"b","kind":"body","spans":[]}]}');
    const still = await admin(`select blocks_rev from document where id = $1`, [doc16.id]);
    check(
      "내가 본 판이 이미 밀렸으면 저장은 0행이다 (앞사람 글을 덮어쓰지 않는다)",
      late.ok && late.rows.length === 0 && Number(still[0].blocks_rev) === rev,
      late.ok ? `${late.rows.length}행` : late.error,
    );
  }
  {
    const [cur] = await admin(`select blocks_rev from document where id = $1`, [doc16.id]);
    const rev = Number(cur.blocks_rev);
    const r = await save(choi, rev, DOC);
    check("판이 맞으면 그 다음 저장은 통과한다", r.ok && r.rows.length === 1);
  }

  // --- 크기 제한 -----------------------------------------------------------
  {
    const [cur] = await admin(`select blocks_rev from document where id = $1`, [doc16.id]);
    const rev = Number(cur.blocks_rev);
    const r = await as(
      choi,
      `update document set blocks = jsonb_build_object('v', 1, 'blocks', repeat('x', 2200000)),
              blocks_rev = $1
        where id = $2 and blocks_rev = $3 returning id`,
      [rev + 1, doc16.id, rev],
    );
    check(
      "2MB 를 넘는 본문은 DB 가 막는다 (편집기가 폭주해도)",
      !r.ok && /check constraint|document_blocks_size/i.test(r.error ?? ""),
      r.ok ? "통과해 버렸다" : "",
    );
  }

  // --- doc: 채널 -----------------------------------------------------------
  const DOC_TOPIC = `doc:${doc16.id}`;
  await admin(`insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [
    DOC_TOPIC,
  ]);
  const countDoc = `select count(*)::int as n from realtime.messages where topic = $1`;

  {
    const r = await admin(
      `select app.topic_document_id($1) as a, app.topic_document_id('doc:zzz') as b,
              app.topic_document_id(null) as c, app.topic_document_id($2) as d,
              app.topic_document_id($3) as e`,
      [DOC_TOPIC, DOC_TOPIC_WORK, doc16.id],
    );
    check(
      "app.topic_document_id 는 모양이 맞을 때만 문서 id 를 돌려준다",
      r[0].a === doc16.id && r[0].b === null && r[0].c === null && r[0].d === null && r[0].e === null,
      JSON.stringify(r[0]),
    );
  }
  {
    const r = await onTopic(choi, DOC_TOPIC, countDoc, [DOC_TOPIC]);
    check("문서를 고칠 수 있는 사람은 doc: 채널을 듣는다", r.ok && r.rows[0].n > 0, r.error ?? "");
  }
  {
    // 여기가 이 채널의 존재 이유다. park 는 업무를 **볼 수** 있어서 work: 토픽은
    // 열려 있지만, 아직 저장되지 않은 남의 글이 흐르는 이 채널에는 못 들어온다.
    const work = await onTopic(park, DOC_TOPIC_WORK, countDoc, [DOC_TOPIC_WORK]);
    const doc = await onTopic(park, DOC_TOPIC, countDoc, [DOC_TOPIC]);
    check(
      "열람 권한만 있는 사람은 work: 는 듣고 doc: 는 못 듣는다",
      work.ok && doc.ok && doc.rows[0].n === 0,
      `work ${work.rows?.[0]?.n} / doc ${doc.rows?.[0]?.n}`,
    );
  }
  {
    const r = await onTopic(lee, DOC_TOPIC, countDoc, [DOC_TOPIC]);
    check("타 부서는 doc: 채널에서 한 건도 못 듣는다", r.ok && r.rows[0].n === 0);
  }
  {
    // 접속자 표시·편집 연산은 쓰기다. 커서 하나도 열람자에게는 열려 있으면 안 된다.
    const ins = `insert into realtime.messages (topic, extension) values ($1, 'presence')`;
    const n = `select count(*)::int as n from realtime.messages where topic = $1 and extension = 'presence'`;
    const b = await admin(n, [DOC_TOPIC]);
    const mine = await onTopic(choi, DOC_TOPIC, ins, [DOC_TOPIC]);
    const a = await admin(n, [DOC_TOPIC]);
    check("편집자는 doc: 채널에 쓸 수 있다 (커서·연산)", mine.ok && a[0].n === b[0].n + 1);

    const theirs = await onTopic(park, DOC_TOPIC, ins, [DOC_TOPIC]);
    const a2 = await admin(n, [DOC_TOPIC]);
    check(
      "열람자는 doc: 채널에 쓸 수 없다",
      !theirs.ok && /row-level security|42501/i.test(theirs.error ?? "") && a2[0].n === a[0].n,
      theirs.ok ? "들어가졌다" : "",
    );
  }
  for (const bad of ["doc:", "doc:새문서", "doc:00000000-0000-0000-0000", "lobby", "doc"]) {
    const r = await onTopic(choi, bad, countDoc, [DOC_TOPIC]);
    check(`이상한 doc 토픽(${bad})은 예외 없이 0행이다`, r.ok && r.rows[0].n === 0, r.error ?? "");
  }
  {
    // 정책이 하나 늘었다고 0012 의 판정이 넓어지면 안 된다. 같은 명령의 permissive
    // 정책은 OR 로 합쳐지므로, 두 정책이 겹치는 순간 조용히 열린다.
    const r = await onTopic(lee, DOC_TOPIC_WORK, countDoc, [DOC_TOPIC_WORK]);
    check("doc: 정책이 늘어도 work: 토픽은 그대로 닫혀 있다", r.ok && r.rows[0].n === 0);
  }
}

// ---------------------------------------------------------------------------
// 쪽지 (0019)
// ---------------------------------------------------------------------------
//
// 설계가 내린 결정 셋을 DB 가 증명하게 한다
// (docs/plans/2026-08-23-쪽지-알림-design.md §3 · §5 · §10-1).
//
//   ① 물어도 업무를 열어 주지 않는다 — 받은 사람은 그 업무를 여전히 못 읽는다
//   ② 쪽지는 비밀이 아니다 — 그 업무를 읽을 수 있는 사람은 쪽지도 읽는다
//   ③ 남의 실에는 끼어들 수 없다
//
// ①이 없으면 「안 보여준다」는 말일 뿐이고, ②가 없으면 「문답이 인계서까지
// 간다」가 거짓이 된다. 둘은 반대 방향이라 함께 재야 뜻이 성립한다.
console.log("\n[쪽지] 물어도 열어 주지는 않는다");
{
  const count = async (userId, sql, params) => {
    const r = await as(userId, sql, params);
    return r.ok ? r.rows[0].n : -1;
  };

  // 김담당(자원순환과)이 자기 private 업무에 대해 이타부서(대중교통과)에게 묻는다.
  // 이타부서는 그 업무의 참여자도 아니고 같은 부서도 아니다 — 쪽지가 필요한 자리다.
  const sent = await as(
    kim,
    `insert into note (work_id, author_id, recipient_id, body)
     values ($1, $2, $3, '통제 협의를 언제까지 넣어야 하나요?') returning id, thread_id`,
    [workId, kim, lee],
  );
  check("업무를 볼 수 있으면 바깥 사람에게 물을 수 있다", sent.ok, sent.error ?? "");
  const noteId = sent.ok ? sent.rows[0].id : null;
  check(
    "뿌리 쪽지는 thread_id 가 자기 id 다",
    Boolean(noteId) && sent.rows[0].thread_id === noteId,
  );

  // ① 핵심. 쪽지를 받았다고 업무가 열리지 않는다.
  check(
    "★ 쪽지를 받아도 그 업무는 여전히 못 읽는다",
    (await count(lee, `select count(*)::int n from work where id = $1`, [workId])) === 0,
  );
  check(
    "★ 업무의 대화도 못 읽는다",
    (await count(lee, `select count(*)::int n from comment where work_id = $1`, [
      workId,
    ])) === 0,
  );

  check(
    "받은 사람은 자기 쪽지를 읽는다",
    (await count(lee, `select count(*)::int n from note where id = $1`, [noteId])) === 1,
  );

  // ② 업무를 읽을 수 있는 사람은 쪽지도 읽는다 — 주담당이 인계서를 뽑을 때
  //    이 문답이 실리려면 읽을 수 있어야 한다.
  check(
    "★ 업무를 읽을 수 있는 사람은 쪽지도 읽는다",
    (await count(kim, `select count(*)::int n from note where id = $1`, [noteId])) === 1,
  );

  // 아무 상관 없는 사람은 못 읽는다.
  // 최후임(choi)을 쓰지 않는다 — 이 파일 앞의 인계 시나리오에서 그 사람이
  // 이 업무의 주담당이 되었다. 앞 시나리오의 부산물을 뒤 시나리오의 전제로
  // 쓰면, 앞을 고치는 날 뒤가 조용히 뜻을 잃는다. 새 사람을 하나 만든다.
  const nobody = await makeUser("남남", deptB.id);
  check(
    "업무도 못 보고 당사자도 아니면 쪽지를 못 읽는다",
    (await count(nobody, `select count(*)::int n from note where id = $1`, [noteId])) === 0,
  );

  // 답장은 방향이 뒤집힌 쪽지다. 받은 사람은 업무를 못 봐도 답할 수 있어야 한다.
  const reply = await as(
    lee,
    `insert into note (work_id, thread_id, author_id, recipient_id, body)
     values ($1, $2, $3, $4, '두 달 전까지 넣으셔야 합니다.') returning id`,
    [workId, noteId, lee, kim],
  );
  check("★ 업무를 못 봐도 받은 실에는 답할 수 있다", reply.ok, reply.error ?? "");

  // ③ 남의 실에 끼어들기. 최후임은 이 업무를 읽을 수 있지만(인계로 주담당이
  //    되었다) 이 실의 당사자는 아니다 — 읽는 것과 끼어드는 것은 다르다.
  check(
    "★ 남의 쪽지 실에는 끼어들 수 없다",
    await denied(
      choi,
      `insert into note (work_id, thread_id, author_id, recipient_id, body)
       values ($1, $2, $3, $4, '끼어들기')`,
      [workId, noteId, choi, lee],
    ),
  );

  // 못 보는 업무를 걸어 두고 묻기. 통과하면 그 업무의 존재가 새어 나간다.
  check(
    "못 보는 업무에 대해서는 물을 수 없다",
    await denied(
      lee,
      `insert into note (work_id, author_id, recipient_id, body)
       values ($1, $2, $3, '이 업무 뭔가요')`,
      [workId, lee, kim],
    ),
  );

  check(
    "남의 이름으로 쪽지를 보낼 수 없다",
    await denied(
      park,
      `insert into note (work_id, author_id, recipient_id, body)
       values ($1, $2, $3, '사칭')`,
      [workId, kim, lee],
    ),
  );

  check(
    "자기 자신에게는 못 보낸다 (메모장이 아니다)",
    await denied(
      kim,
      `insert into note (work_id, author_id, recipient_id, body)
       values ($1, $2, $2, '메모')`,
      [workId, kim],
    ),
  );

  // ── 칸 잠금 ───────────────────────────────────────────────────────────
  check(
    "쪽지 본문은 보낸 뒤에 못 고친다",
    await denied(kim, `update note set body = '고쳤다' where id = $1`, [noteId]),
  );
  check(
    "보낸 사람은 자기 쪽지를 읽음으로 표시할 수 없다",
    await denied(kim, `update note set read_at = now() where id = $1`, [noteId]),
  );
  const mark = await as(lee, `update note set read_at = now() where id = $1 returning id`, [
    noteId,
  ]);
  check("받은 사람은 읽음으로 표시한다", mark.ok && mark.rows.length === 1, mark.error ?? "");
  check(
    "★ 읽음은 되돌릴 수 없다 (보낸 사람이 보는 표시가 거짓이 되면 안 된다)",
    await denied(lee, `update note set read_at = null where id = $1`, [noteId]),
  );
  check(
    "받은 사람은 남의 쪽지를 지울 수 없다",
    await denied(lee, `update note set deleted_at = now() where id = $1`, [noteId]),
  );
  check(
    "쪽지를 진짜로 지우는 길은 없다 (soft delete 만)",
    await denied(kim, `delete from note where id = $1`, [noteId]),
  );

  // ── 이력 ──────────────────────────────────────────────────────────────
  // activity 는 업무를 읽을 수 있는 모두가 본다. 쪽지는 그보다 좁게 열려 있으므로
  // 요약에 본문을 넣지 않는다 — 「누구에게 물었다」까지만이다.
  const acts = await as(
    kim,
    `select summary from activity where work_id = $1 and kind::text like 'note.%' order by id`,
    [workId],
  );
  check("쪽지를 보내면 이력이 남는다", acts.ok && acts.rows.length === 2, acts.error ?? "");
  check(
    "★ 이력에 쪽지 본문은 안 적힌다",
    acts.ok && acts.rows.every((a) => !a.summary.includes("통제 협의")),
  );
}

// ---------------------------------------------------------------------------
// 부르기 (0020)
// ---------------------------------------------------------------------------
//
// 부를 수 있는 사람은 **그 업무의 참여자**다. can_read_work 로 열면 전 직원
// 공개 업무에서 1,700명이 통과한다 — 부른다는 것은 「당신이 이 일에 관여한다」는
// 말이고, 그 말이 맞는 범위는 참여자다.
console.log("\n[부르기] 참여자만 부를 수 있다");
{
  // 부서 공개 업무(wDept)에 박협업을 참여자로 넣는다.
  await admin(
    `insert into work_member (work_id, profile_id, role) values ($1, $2, 'editor')
     on conflict do nothing`,
    [wDept.id, park],
  );
  const c = await as(
    kim,
    `insert into comment (work_id, author_id, body) values ($1, $2, '확인 부탁드립니다')
     returning id`,
    [wDept.id, kim],
  );
  check("대화를 남긴다", c.ok, c.error ?? "");
  const cid = c.ok ? c.rows[0].id : null;

  const ok1 = await as(
    kim,
    `insert into comment_mention (comment_id, profile_id) values ($1, $2) returning comment_id`,
    [cid, park],
  );
  check("참여자를 부를 수 있다", ok1.ok, ok1.error ?? "");

  // 이타부서는 대중교통과라 이 부서 공개 업무의 참여자가 아니다.
  check(
    "★ 참여자가 아닌 사람은 못 부른다",
    await denied(
      kim,
      `insert into comment_mention (comment_id, profile_id) values ($1, $2)`,
      [cid, lee],
    ),
  );

  check(
    "★ 남의 글에 부름을 얹을 수 없다",
    await denied(
      park,
      `insert into comment_mention (comment_id, profile_id) values ($1, $2)`,
      [cid, kim],
    ),
  );

  // 부른 것은 사실이고 사실은 안 바뀐다.
  check(
    "부름은 고칠 수 없다",
    await denied(
      kim,
      `update comment_mention set profile_id = $2 where comment_id = $1`,
      [cid, kim],
    ),
  );
  check(
    "부름은 지울 수 없다",
    await denied(kim, `delete from comment_mention where comment_id = $1`, [cid]),
  );

  // 댓글을 볼 수 있으면 누가 불렸는지도 본다.
  const seen = await as(
    park,
    `select count(*)::int n from comment_mention where comment_id = $1`,
    [cid],
  );
  check("댓글을 볼 수 있으면 부름도 본다", seen.ok && seen.rows[0].n === 1);

  // 타 부서는 그 업무를 못 보므로 부름도 못 본다.
  const hidden = await as(
    lee,
    `select count(*)::int n from comment_mention where comment_id = $1`,
    [cid],
  );
  check("업무를 못 보면 부름도 못 본다", hidden.ok && hidden.rows[0].n === 0);
}

// ---------------------------------------------------------------------------
// 알림 (0021)
// ---------------------------------------------------------------------------
//
// 「처리해야 사라지는 것은 알림이 아니다」가 이 표의 규칙이다. 여기서 재는
// 것은 그 규칙이 아니라 **소음과 권한** 셋이다.
//
//   ① 만드는 길은 app.notify 하나뿐이다 — 사람이 남에게 꽂아 넣을 수 없다
//   ② 내가 한 일은 나에게 안 온다
//   ③ 안 읽은 work_touched 는 묶인다 (안 묶으면 하루에 스무 줄이 쌓인다)
console.log("\n[알림] 소음과 권한");
{
  const inbox = async (userId) => {
    const r = await as(userId, `select count(*)::int n from notification`);
    return r.ok ? r.rows[0].n : -1;
  };

  // 박협업을 wDept 참여자로 이미 넣어 두었다(위 [부르기]). 그 블록이 이미
  // 안 읽은 work_touched 를 하나 만들어 두었으므로, **먼저 다 읽는다** —
  // 안 그러면 첫 건드림이 그 줄에 묶여 「줄이 안 늘었다」로 보인다.
  // (앞 시나리오의 부산물을 전제로 쓰지 않는다는 규칙을 여기서도 지킨다)
  await as(park, `update notification set read_at = now() where read_at is null`);
  const before = await inbox(park);
  const mineBefore = await inbox(kim);

  const c = await as(
    kim,
    `insert into comment (work_id, author_id, body) values ($1, $2, '진행 상황 공유합니다') returning id`,
    [wDept.id, kim],
  );
  check("대화를 남긴다 (알림의 방아쇠)", c.ok, c.error ?? "");

  const after = await inbox(park);
  check("★ 참여자에게 알림이 간다", after === before + 1, `${before} → ${after}`);
  check(
    "★ 내가 한 일은 나에게 안 온다",
    (await inbox(kim)) === mineBefore,
  );

  // ③ 한 번 더 건드려도 안 읽은 것이 있으면 줄이 안 는다.
  await as(
    kim,
    `insert into comment (work_id, author_id, body) values ($1, $2, '하나 더') returning id`,
    [wDept.id, kim],
  );
  const merged = await inbox(park);
  check("★ 안 읽은 것이 있으면 묶인다 (줄이 안 는다)", merged === after, `${after} → ${merged}`);
  const cnt = await as(
    park,
    `select count from notification where kind = 'work_touched' and work_id = $1 and read_at is null`,
    [wDept.id],
  );
  check("묶인 개수가 오른다", cnt.ok && cnt.rows[0]?.count >= 2, JSON.stringify(cnt.rows));

  // ① 남에게 꽂아 넣기.
  check(
    "★ 사람이 알림을 만들 수 없다",
    await denied(
      kim,
      `insert into notification (recipient_id, kind, summary) values ($1, 'mention', '가짜')`,
      [park],
    ),
  );
  check(
    "알림을 지울 수 없다",
    await denied(park, `delete from notification where recipient_id = $1`, [park]),
  );

  // 남의 알림은 안 보인다.
  const mine = await as(
    lee,
    `select count(*)::int n from notification where recipient_id = $1`,
    [park],
  );
  check("남의 알림은 못 읽는다", mine.ok && mine.rows[0].n === 0);

  // 고칠 수 있는 것은 read_at 뿐.
  check(
    "요약을 고칠 수 없다",
    await denied(park, `update notification set summary = '조작' where recipient_id = $1`, [
      park,
    ]),
  );
  const read = await as(
    park,
    `update notification set read_at = now() where recipient_id = $1 and read_at is null returning id`,
    [park],
  );
  check("읽음으로 표시한다", read.ok && read.rows.length > 0, read.error ?? "");

  // 묶임은 **안 읽은 것**에만 붙는다. 다 읽은 뒤에 또 움직이면 새 줄이 생겨야
  // 한다 — 안 그러면 읽고 나서 벌어진 일이 조용히 사라진다.
  const afterRead = await inbox(park);
  await as(
    kim,
    `insert into comment (work_id, author_id, body) values ($1, $2, '읽은 뒤에 하나 더') returning id`,
    [wDept.id, kim],
  );
  check(
    "★ 다 읽은 뒤에 움직이면 새 줄이 생긴다",
    (await inbox(park)) === afterRead + 1,
  );
}

// ---------------------------------------------------------------------------
console.log("\n[연락처] 휴대전화는 공개한 사람 것만 나온다");
// ---------------------------------------------------------------------------
{
  // 내선은 profile 의 칸이라 재직자 전원이 본다. 본인이 고칠 수 있어야 한다.
  const setExt = await as(
    kim,
    `update profile set phone_ext = '031-5189-2100' where id = $1 returning id`,
    [kim],
  );
  check("내선번호는 본인이 고친다", setExt.ok && setExt.rows.length === 1, setExt.error ?? "");
  {
    const r = await as(lee, `select phone_ext from profile where id = $1`, [kim]);
    check(
      "내선번호는 타 부서도 본다",
      r.ok && r.rows[0]?.phone_ext === "031-5189-2100",
    );
  }
  check(
    "남의 내선번호는 못 고친다",
    await denied(lee, `update profile set phone_ext = '000' where id = $1 returning id`, [kim]),
  );
  check(
    "내선번호에 아무 글자나 못 넣는다",
    await denied(kim, `update profile set phone_ext = '내선 없음' where id = $1 returning id`, [kim]),
  );

  // 휴대전화는 별도 표. 기본은 비공개다.
  const ins = await as(
    kim,
    `insert into profile_contact (profile_id, mobile) values ($1, '010-2000-1234') returning profile_id`,
    [kim],
  );
  check("휴대전화를 본인이 등록한다", ins.ok && ins.rows.length === 1, ins.error ?? "");
  check(
    "★ 비공개 휴대전화는 남에게 행 자체가 안 보인다",
    await denied(park, `select mobile from profile_contact where profile_id = $1`, [kim]),
  );
  {
    const r = await as(kim, `select mobile from profile_contact where profile_id = $1`, [kim]);
    check("비공개여도 본인은 본다", r.ok && r.rows.length === 1);
  }
  check(
    "남의 번호를 대신 등록할 수 없다",
    await denied(
      lee,
      `insert into profile_contact (profile_id, mobile) values ($1, '010-9999-9999') returning profile_id`,
      [park],
    ),
  );
  check(
    "남의 번호를 공개로 돌릴 수 없다",
    await denied(
      lee,
      `update profile_contact set is_public = true where profile_id = $1 returning profile_id`,
      [kim],
    ),
  );
  check(
    "번호 형식이 틀리면 들어가지 않는다",
    await denied(
      park,
      `insert into profile_contact (profile_id, mobile) values ($1, '01012345678') returning profile_id`,
      [park],
    ),
  );

  // 본인이 공개로 돌리면 그때 보인다.
  await as(kim, `update profile_contact set is_public = true where profile_id = $1`, [kim]);
  {
    const r = await as(park, `select mobile from profile_contact where profile_id = $1`, [kim]);
    check(
      "공개로 돌리면 그때부터 보인다",
      r.ok && r.rows[0]?.mobile === "010-2000-1234",
    );
  }
  {
    const r = await as(kim, `delete from profile_contact where profile_id = $1 returning profile_id`, [kim]);
    check("본인은 번호를 내릴 수 있다", r.ok && r.rows.length === 1);
  }
}

// ---------------------------------------------------------------------------
console.log("\n[부서 이동] 소속은 승인으로만 바뀐다");
// ---------------------------------------------------------------------------
{
  // 대중교통과에 과장을 하나 세운다. 최고 서열자가 승인자가 되는 규칙을
  // 확인하려면 rank 가 갈리는 사람이 있어야 한다.
  const [u] = await admin(
    `insert into auth.users (email) values ('한과장@korea.kr') returning id`,
  );
  await admin(
    `insert into profile (id, name, department_id, email, position, rank)
     values ($1, '한과장', $2, '한과장@korea.kr', '과장', 30)`,
    [u.id, deptB.id],
  );
  const han = u.id;

  // 김담당이 참여자가 아닌 부서 공개 업무. 「옮겨가면 안 보인다」를 확인하려면
  // 이런 업무여야 한다 — 자기가 만든 업무는 주담당이라 참여자로도 붙어 있어서
  // 부서를 옮겨도 계속 보인다(app.can_read_work 가 참여자를 먼저 본다).
  const [wTheirs] = await admin(
    `insert into work (title, department_id, owner_id, created_by, visibility)
     values ('음식물류 폐기물 수수료 개편', $1, $2, $2, 'department') returning id`,
    [deptA.id, park],
  );
  {
    const r = await as(kim, `select id from work where id = $1`, [wTheirs.id]);
    check("옮기기 전에는 같은 과의 부서공개 업무가 보인다", r.ok && r.rows.length === 1);
  }

  // ── 이 기능이 존재하는 이유 ─────────────────────────────────────────────
  check(
    "★ 자기 소속을 직접 바꿀 수 없다",
    await denied(
      kim,
      `update profile set department_id = $2 where id = $1 returning id`,
      [kim, deptB.id],
    ),
  );
  check(
    "표에 직접 신청을 적을 수 없다",
    await denied(
      kim,
      `insert into transfer_request (profile_id, from_department_id, to_department_id, approver_id)
       values ($1, $2, $3, $1) returning id`,
      [kim, deptA.id, deptB.id],
    ),
  );

  // ── 신청 ────────────────────────────────────────────────────────────────
  const req = await as(kim, `select request_transfer($1, $2) as id`, [
    deptB.id,
    "  대중교통과 자원순환 연계 업무  ",
  ]);
  check("이동을 신청한다", req.ok && req.rows[0]?.id, req.error ?? "");
  const reqId = req.rows?.[0]?.id;

  {
    const r = await admin(`select approver_id, reason, status from transfer_request where id = $1`, [reqId]);
    check("★ 승인자는 옮겨갈 부서의 최고 서열자다", r[0]?.approver_id === han);
    check("사유의 앞뒤 공백은 깎인다", r[0]?.reason === "대중교통과 자원순환 연계 업무");
    check("처음 상태는 대기다", r[0]?.status === "pending");
  }
  check(
    "같은 곳으로 두 번 신청할 수 없다",
    !(await as(kim, `select request_transfer($1, null) as id`, [deptB.id])).ok,
  );
  check(
    "이미 있는 부서로는 신청할 수 없다",
    !(await as(park, `select request_transfer($1, null) as id`, [deptA.id])).ok,
  );

  // ── 열람 ────────────────────────────────────────────────────────────────
  {
    const r = await as(kim, `select id from transfer_request where id = $1`, [reqId]);
    check("신청자는 자기 신청을 본다", r.ok && r.rows.length === 1);
  }
  {
    const r = await as(han, `select id from transfer_request where id = $1`, [reqId]);
    check("승인자는 그 신청을 본다", r.ok && r.rows.length === 1);
  }
  check(
    "★ 남의 이동 신청은 보이지 않는다",
    await denied(park, `select id from transfer_request where id = $1`, [reqId]),
  );

  // ── 결정 ────────────────────────────────────────────────────────────────
  check(
    "★ 승인자가 아니면 결정할 수 없다",
    !(await as(park, `select decide_transfer($1, true, null)`, [reqId])).ok,
  );
  check(
    "★ 신청자가 자기 신청을 승인할 수 없다",
    !(await as(kim, `select decide_transfer($1, true, null)`, [reqId])).ok,
  );
  check(
    "당사자가 아니면 남는 업무 수도 못 묻는다",
    !(await as(park, `select transfer_impact($1)`, [reqId])).ok,
  );
  {
    // 남고 갈 업무의 수를 여기서 다시 세어 맞춘다. 앞 절들이 김담당 이름으로
    // 업무를 더 만들기 때문에 상수로 적으면 그쪽을 고칠 때 여기가 깨진다.
    const [expected] = await admin(
      `select count(*)::int as n from work
       where owner_id = $1 and department_id = $2 and status <> 'done'`,
      [kim, deptA.id],
    );
    const r = await as(han, `select transfer_impact($1) as n`, [reqId]);
    check(
      "★ 승인자는 남고 갈 업무 수를 본다",
      r.ok && expected.n > 0 && r.rows[0]?.n === expected.n,
      r.error ?? `${r.rows?.[0]?.n} ≠ ${expected.n}`,
    );
  }

  const ok = await as(han, `select decide_transfer($1, true, '연계 업무 인정')`, [reqId]);
  check("승인자가 승인한다", ok.ok, ok.error ?? "");
  {
    const r = await admin(`select department_id from profile where id = $1`, [kim]);
    check("★ 승인하면 소속이 실제로 바뀐다", r[0]?.department_id === deptB.id);
  }
  {
    const r = await admin(`select status, decided_note from transfer_request where id = $1`, [reqId]);
    check("신청이 승인으로 닫힌다", r[0]?.status === "approved" && r[0]?.decided_note === "연계 업무 인정");
  }
  check(
    "이미 처리된 신청은 다시 결정할 수 없다",
    !(await as(han, `select decide_transfer($1, false, null)`, [reqId])).ok,
  );

  // ── 옮겨간 뒤 ───────────────────────────────────────────────────────────
  check(
    "★ 옮겨가면 옛 부서의 부서공개 업무가 안 보인다",
    await denied(kim, `select id from work where id = $1`, [wTheirs.id]),
  );
  {
    // 반대로, 주담당으로 붙어 있는 업무는 부서를 옮겨도 계속 보인다.
    // 「소속만 바뀌고 맡은 일은 그대로 남는다」가 화면이 경고해야 하는 상태다.
    const r = await as(kim, `select id from work where id = $1`, [wDept.id]);
    check("주담당인 업무는 옮겨가도 남는다", r.ok && r.rows.length === 1);
  }

  // ── 승인으로도 열리지 않는 칸 ───────────────────────────────────────────
  check(
    "직급은 승인 경로로도 안 바뀐다",
    await denied(kim, `update profile set position = '과장' where id = $1 returning id`, [kim]),
  );
  check(
    "서열은 승인 경로로도 안 바뀐다",
    await denied(kim, `update profile set rank = 10 where id = $1 returning id`, [kim]),
  );
  check(
    "이메일도 본인이 못 바꾼다",
    await denied(kim, `update profile set email = 'x@korea.kr' where id = $1 returning id`, [kim]),
  );

  // ── 반려와 취소 ─────────────────────────────────────────────────────────
  const back = await as(kim, `select request_transfer($1, null) as id`, [deptA.id]);
  check("옮긴 뒤 되돌아가는 신청도 된다", back.ok, back.error ?? "");
  const backId = back.rows?.[0]?.id;
  {
    // 돌아가는 쪽도 같은 규칙이다 — 자원순환과에는 rank 30 인 과장이 있으므로
    // 주무관 여럿을 제치고 그 사람에게 간다.
    const r = await admin(
      `select p.rank, p.department_id from transfer_request r
       join profile p on p.id = r.approver_id where r.id = $1`,
      [backId],
    );
    check(
      "되돌아가는 신청도 그 부서의 최고 서열자에게 간다",
      r[0]?.rank === 30 && r[0]?.department_id === deptA.id,
      `rank=${r[0]?.rank}`,
    );
  }
  {
    const r = await as(kim, `select cancel_transfer($1)`, [backId]);
    check("신청자는 대기 중인 신청을 취소한다", r.ok, r.error ?? "");
  }
  {
    const r = await admin(`select status from transfer_request where id = $1`, [backId]);
    check("취소로 닫힌다", r[0]?.status === "canceled");
  }

  const again = await as(kim, `select request_transfer($1, null) as id`, [deptA.id]);
  const againId = again.rows?.[0]?.id;
  check("취소한 뒤에는 다시 신청할 수 있다", again.ok, again.error ?? "");
  {
    const approver = (await admin(`select approver_id from transfer_request where id = $1`, [againId]))[0].approver_id;
    const r = await as(approver, `select decide_transfer($1, false, '이번 분기는 어렵습니다')`, [againId]);
    check("반려한다", r.ok, r.error ?? "");
    const after = await admin(`select status, department_id from transfer_request r join profile p on p.id = r.profile_id where r.id = $1`, [againId]);
    check("★ 반려하면 소속이 그대로다", after[0]?.status === "rejected" && after[0]?.department_id === deptB.id);
  }
  check(
    "남의 신청을 취소할 수 없다",
    !(await as(park, `select cancel_transfer($1)`, [againId])).ok,
  );

  // ── 승인할 사람이 없는 부서 ─────────────────────────────────────────────
  //
  // 「그 부서의 최고 서열자」가 신청자 본인뿐이면 자기 승인이 된다. 그 경로가
  // 열려 있으면 이 기능 전체가 무의미하므로, 후보가 없으면 **신청 자체가
  // 만들어지지 않아야** 한다.
  {
    const [empty] = await admin(
      `insert into department (name) values ('빈과') returning id`,
    );
    const r = await as(kim, `select request_transfer($1, null) as id`, [empty.id]);
    check(
      "★ 승인할 사람이 없는 부서로는 신청이 안 된다",
      !r.ok && /승인할 사람이 없습니다/.test(r.error ?? ""),
      r.error ?? "신청이 통과했다",
    );

    // 그 부서에 나만 있어도 마찬가지다 — 상위 조직이 없으면 올라갈 곳도 없다.
    await admin(`update profile set department_id = $1 where id = $2`, [empty.id, choi]);
    const alone = await as(choi, `select request_transfer($1, null) as id`, [deptA.id]);
    check("혼자인 부서에서 나가는 신청은 된다", alone.ok, alone.error ?? "");
    await admin(`update profile set department_id = $1 where id = $2`, [deptA.id, choi]);
  }

  // ── 임베드로 우회되지 않는가 ────────────────────────────────────────────
  //
  // PostgREST 는 `profile?select=*,profile_contact(*)` 같은 임베드를 허용한다.
  // 정책이 **임베드된 표에도** 걸리는지 확인한다 — 안 걸리면 조인 한 줄로
  // 비공개 번호가 전부 새어 나간다. 여기서는 조인으로 같은 것을 흉내 낸다.
  {
    await as(park, `insert into profile_contact (profile_id, mobile) values ($1, '010-3000-7777')`, [park]);
    const r = await as(
      lee,
      `select c.mobile from profile p join profile_contact c on c.profile_id = p.id
       where p.id = $1`,
      [park],
    );
    check(
      "★ 조인으로도 비공개 번호가 새지 않는다",
      r.ok && r.rows.length === 0,
      r.rows?.[0]?.mobile ?? "",
    );
  }
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
