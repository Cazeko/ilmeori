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
await db.close();
console.log(`\n${pass}개 통과 · ${fail}개 실패`);
if (fail) {
  console.log("\n실패 항목:");
  failures.forEach((f) => console.log(`  - ${f}`));
  console.log();
}
process.exit(fail ? 1 : 0);
