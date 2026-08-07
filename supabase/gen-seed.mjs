/**
 * 시드 SQL 생성기 — src/lib/mock 을 그대로 SQL로 옮긴다.
 *
 *   node supabase/gen-seed.mjs
 *   → supabase/seed/demo.sql
 *
 * 손으로 SQL을 다시 쓰지 않는 이유는 하나다. 두 벌이 되는 순간 반드시 어긋나고,
 * 그러면 "데모에서 본 화면"과 "DB에 들어간 데이터"가 달라진다.
 * 목업이 유일한 출처이고, 이 파일은 그것을 옮겨 적기만 한다.
 *
 * 목업은 TypeScript라 그대로는 못 읽는다. tsc로 임시 폴더에 CommonJS로 뽑아서 읽는다.
 * (@/lib/types 는 전부 `import type` 이라 컴파일하면 사라지므로 별칭 해석이 필요 없다)
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const out = mkdtempSync(join(tmpdir(), "ilmeori-seed-"));
try {
  // tsc CLI에는 --paths 옵션이 없어서 임시 설정 파일을 만들어 넘긴다.
  // (@/lib/types 별칭을 풀어 주지 않으면 타입 오류로 멈춘다)
  const tsconfig = join(out, "tsconfig.json");
  writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        module: "commonjs",
        target: "es2022",
        moduleResolution: "node",
        skipLibCheck: true,
        esModuleInterop: true,
        baseUrl: ROOT,
        paths: { "@/*": ["src/*"] },
        outDir: out,
      },
      files: [
        join(ROOT, "src/lib/mock/org.ts"),
        join(ROOT, "src/lib/mock/works.ts"),
      ],
    }),
    "utf8",
  );

  // tsc는 "rootDir 밖의 파일" 같은 경고성 오류로도 0이 아닌 값을 돌려주는데,
  // 그 경우에도 자바스크립트는 정상적으로 나온다. (여기서는 @/lib/types 가 그렇다.
  //  전부 `import type` 이라 실제로 emit되는 것이 없다)
  // 그래서 종료 코드가 아니라 **결과물이 나왔는지**로 판단한다.
  let tscOutput = "";
  try {
    execFileSync("npx", ["tsc", "--project", tsconfig], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    tscOutput = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }

  const require = createRequire(import.meta.url);
  const org = require(find(out, "org.js", tscOutput));
  const works = require(find(out, "works.js", tscOutput));

  writeFileSync(join(HERE, "seed", "demo.sql"), build(org, works), "utf8");
  writeFileSync(join(HERE, "seed", "reset-demo.sql"), buildReset(), "utf8");

  // 몇 행이 들어가야 하는지도 같이 적어 둔다.
  // 검증 스크립트가 이 값을 읽으므로 기대치가 두 벌로 갈라지지 않는다.
  writeFileSync(
    join(HERE, "seed", "demo.counts.json"),
    JSON.stringify(
      {
        department: org.departments.length,
        profile: org.profiles.length,
        work: works.works.length,
        work_member: works.workMembers.length,
        document: works.documents.length,
        doc_section: works.docSections.length,
        comment: works.comments.length,
        attachment: works.attachments.length,
        activity: works.activities.length,
        handover: works.handovers.length,
        handover_item: works.handoverItems.length,
        access_log: works.accessLogs.length,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log("supabase/seed/demo.sql · demo.counts.json 생성 완료");
} finally {
  rmSync(out, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

/**
 * 시연을 처음 상태로 되돌리는 질의.
 *
 * 실제 DB에서는 인계가 되돌릴 수 없다. 그게 맞는 동작이다 —
 * 지울 수 있는 감사 기록은 감사 기록이 아니다.
 * 그런데 시연은 여러 사람이 돌아가며 본다. 심사위원 한 명이 인계를 실행하면
 * 다음 사람은 완료된 화면만 보게 된다.
 *
 * 그래서 "제품 기능"이 아니라 **운영자가 SQL로 하는 일**로 분리했다.
 * 화면에는 이 버튼이 없고, 시연 사이사이에 이 파일을 돌린다.
 *
 * 사람·부서·계정은 건드리지 않고, 업무 이후의 것만 비운다.
 * 비운 뒤 demo.sql 을 다시 돌리면 원래 상태가 된다.
 */
function buildReset() {
  // 지우는 순서를 신경 쓰지 않아도 되도록 cascade 를 쓴다.
  const tables = [
    "work",
    "work_member",
    "document",
    "doc_section",
    "doc_version",
    "attachment",
    "comment",
    "activity",
    "access_log",
    "handover",
    "handover_item",
  ];
  return [
    "-- =============================================================================",
    "-- 시연 되돌리기",
    "--",
    "-- 이 파일을 먼저 돌리고, 이어서 seed/demo.sql 을 다시 돌린다.",
    "-- 사람(profile)·부서(department)·로그인 계정(auth.users)은 건드리지 않는다.",
    "--",
    "-- delete 가 아니라 truncate 를 쓴다. delete 는 행 단위 트리거를 타기 때문에",
    "-- work_member 를 지울 때 「마지막 소유자 보호」 트리거에 막힌다.",
    "-- 트리거와 RLS를 껐다 켜서 우회할 수도 있지만, 껐다 켜는 단계가 있으면",
    "-- 중간에 어긋날 여지가 생긴다. truncate 는 애초에 그 둘을 타지 않는다.",
    "-- =============================================================================",
    "",
    "truncate",
    tables.map((t) => `  ${t}`).join(",\n"),
    "restart identity cascade;",
    "",
    "-- 이제 seed/demo.sql 을 다시 돌린다.",
    "",
  ].join("\n");
}

/**
 * 컴파일 결과 위치는 tsc가 프로그램 전체의 공통 상위 폴더를 보고 정하므로
 * 미리 알 수 없다. 그래서 이름으로 찾는다.
 */
function find(dir, name, tscOutput) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const hit = find(full, name, tscOutput);
      if (hit) return hit;
    } else if (entry === name) {
      return full;
    }
  }
  if (!tscOutput) return null;
  throw new Error(`컴파일 결과에 ${name} 이 없습니다.\n\n${tscOutput}`);
}

/** 작은따옴표를 두 번 찍어 SQL 문자열로 만든다. null은 NULL로. */
function q(v) {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function ts(v) {
  return v === null || v === undefined ? "NULL" : `${q(v)}::timestamptz`;
}

/**
 * 편집 잠금 시각만은 고정된 값을 적을 수 없다.
 *
 * 잠금은 5분이 지나면 풀린 것으로 본다(app.section_lock_active). 그래서 생성 시각을
 * 박아 두면 시연 당일에는 반드시 만료되어 있고, 「○○님 편집 중」 배지가 영영 안 보인다.
 * 목업(src/lib/mock/works.ts)이 화면을 그릴 때마다 1분 전으로 잡는 것과 같은 이유다.
 *
 * 시드가 **실행되는 순간**을 기준으로 잡도록 SQL 식을 그대로 내보낸다.
 * 심사 직전에 초기화를 돌리면 그때부터 5분간 잠긴 화면을 보여 줄 수 있다.
 */
function lockTs(v) {
  return v === null || v === undefined ? "NULL" : "now() - interval '1 minute'";
}
function bool(v) {
  return v ? "true" : "false";
}

function rows(values) {
  return values.map((v) => `  (${v})`).join(",\n");
}

function build(org, works) {
  const { departments, profiles } = org;
  const {
    works: workRows,
    workMembers,
    documents,
    docSections,
    comments,
    attachments,
    activities,
    handovers,
    handoverItems,
    accessLogs,
  } = works;

  const L = [];
  const p = (...lines) => L.push(...lines);

  p(
    "-- =============================================================================",
    "-- 일머리(Ilmeori) — 시연용 시드 데이터",
    "--",
    "-- ⚠️ 이 파일은 자동 생성된다. 직접 고치지 말고 src/lib/mock 을 고친 뒤",
    "--    node supabase/gen-seed.mjs 를 다시 돌린다.",
    "--",
    "-- 부서명만 화성특례시 공개 조직도(2026. 2. 개편)를 따랐고,",
    "-- 인물·업무·문서·첨부는 전부 지어낸 것이다. 실제 공문서는 한 건도 없다.",
    "--",
    "-- 실행 방법",
    "--   1. 아래 demo_password 값을 바꾼다 (커밋하지 않는다)",
    "--   2. Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 실행",
    "--   3. 같은 비밀번호를 배포 환경변수 DEMO_ACCOUNT_PASSWORD 에 넣는다",
    "--",
    "-- 여러 번 돌려도 안전하다(on conflict do nothing).",
    "-- =============================================================================",
    "",
    "begin;",
    "",
    "-- -----------------------------------------------------------------------------",
    "-- 0. 트리거를 잠시 끈다",
    "--",
    "-- 이력(activity)은 평소 트리거가 자동으로 남긴다. 그게 이 제품의 핵심이다.",
    "-- 그런데 시드는 '다섯 달치 협업이 이미 쌓인 상태'를 만들어야 하므로,",
    "-- 트리거가 켜져 있으면 시각이 전부 지금으로 찍힌 이력이 따로 생긴다.",
    "-- 그래서 데이터를 넣는 동안만 끄고, 이력은 아래에서 직접 넣는다.",
    "-- (외래키 검사는 그대로 살아 있으므로 데이터가 어긋나면 여기서 걸린다)",
    "-- -----------------------------------------------------------------------------",
    "alter table profile      disable trigger user;",
    "alter table work         disable trigger user;",
    "alter table work_member  disable trigger user;",
    "alter table document     disable trigger user;",
    "alter table doc_section  disable trigger user;",
    "alter table comment      disable trigger user;",
    "alter table attachment   disable trigger user;",
    "",
    "-- -----------------------------------------------------------------------------",
    "-- 0-2. RLS도 잠시 끈다",
    "--",
    "-- 우리 표에는 force row level security 가 걸려 있다. FORCE는 **테이블 소유자에게도**",
    "-- 정책을 적용하므로, 소유자 역할에 BYPASSRLS 속성이 없으면 시드를 실행하는",
    "-- postgres 조차 자기 표에 INSERT를 못 한다. (PGlite로 실측했다)",
    "--",
    "-- 특히 activity·access_log 는 INSERT 정책 자체가 없어서 확실히 막힌다.",
    "-- 그게 평소에는 정확히 우리가 원하는 동작이다 — 감사 기록은 아무도 못 쓴다.",
    "--",
    "-- 이 트랜잭션 안에서만 끄고 아래에서 반드시 다시 켠다.",
    "-- 실패하면 통째로 롤백되므로 꺼진 채로 남을 일은 없다.",
    "-- (force 표시는 disable 해도 유지되므로 다시 켜면 원래 상태로 돌아온다)",
    "-- -----------------------------------------------------------------------------",
    "alter table department    disable row level security;",
    "alter table profile       disable row level security;",
    "alter table work          disable row level security;",
    "alter table work_member   disable row level security;",
    "alter table document      disable row level security;",
    "alter table doc_section   disable row level security;",
    "alter table comment       disable row level security;",
    "alter table attachment    disable row level security;",
    "alter table activity      disable row level security;",
    "alter table handover      disable row level security;",
    "alter table handover_item disable row level security;",
    "alter table access_log    disable row level security;",
    "",
  );

  // --- auth.users -----------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 1. 로그인 계정",
    "--",
    "-- profile.id 가 auth.users(id) 를 참조하므로 계정이 먼저 있어야 한다.",
    "-- 데모 계정 16개 모두 같은 비밀번호를 쓴다. 실제 서비스에서는",
    "-- 행정전자서명(GPKI) 연계로 대체할 자리다.",
    "-- -----------------------------------------------------------------------------",
    "do $$",
    "declare",
    "  -- ⚠️ 실행 전에 바꾼다. 이 값을 커밋하지 않는다.",
    "  demo_password text := 'CHANGE-ME-BEFORE-RUNNING';",
    "  u record;",
    "  c record;",
    "begin",
    "  if demo_password = 'CHANGE-ME-BEFORE-RUNNING' then",
    "    raise exception '먼저 demo_password 를 바꾸고 실행하세요.';",
    "  end if;",
    "",
    "  for u in",
    "    select * from (values",
  );
  p(
    rows(profiles.map((x) => `${q(x.id)}::uuid, ${q(x.email)}, ${q(x.name)}`)),
    "    ) as t(id, email, name)",
    "  loop",
    "    insert into auth.users (",
    "      instance_id, id, aud, role, email, encrypted_password,",
    "      email_confirmed_at, created_at, updated_at,",
    "      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous",
    "    ) values (",
    "      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',",
    "      u.email, extensions.crypt(demo_password, extensions.gen_salt('bf')),",
    "      now(), now(), now(),",
    `      '{"provider":"email","providers":["email"]}'::jsonb,`,
    "      jsonb_build_object('name', u.name), false, false",
    "    ) on conflict (id) do nothing;",
    "",
    "    -- 비밀번호 로그인은 identities 행이 있어야 동작한다.",
    "    insert into auth.identities (",
    "      user_id, provider_id, identity_data, provider,",
    "      last_sign_in_at, created_at, updated_at",
    "    ) values (",
    "      u.id, u.id::text,",
    "      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),",
    "      'email', now(), now(), now()",
    "    ) on conflict (provider, provider_id) do nothing;",
    "  end loop;",
    "",
    "  -- GoTrue는 아래 칸들을 문자열로 읽는다. SQL로 직접 만든 행은 NULL로 남는데,",
    "  -- 그 상태로 로그인하면 인증 서버가 500 Database error querying schema 를 낸다.",
    "  -- 칸 이름은 버전마다 다르므로 실제로 있는 것만 빈 문자열로 메운다.",
    "  for c in",
    "    select column_name from information_schema.columns",
    "    where table_schema = 'auth' and table_name = 'users'",
    "      and data_type in ('text', 'character varying')",
    "      and column_name in (",
    "        'confirmation_token', 'recovery_token', 'email_change',",
    "        'email_change_token_new', 'email_change_token_current',",
    "        'phone_change', 'phone_change_token', 'reauthentication_token')",
    "  loop",
    "    execute format('update auth.users set %I = $1 where %I is null', c.column_name, c.column_name) using '';",
    "  end loop;",
    "end $$;",
    "",
  );

  // --- department -----------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 2. 조직 (실·국 19 / 과 74) — 화성특례시 공개 조직도 2026. 2. 개편 기준",
    "-- -----------------------------------------------------------------------------",
    "insert into department (id, name, parent_id, description, sort_order) values",
    rows(
      departments.map(
        (d) =>
          `${q(d.id)}, ${q(d.name)}, ${d.parent_id ? q(d.parent_id) : "NULL"}, ${q(d.description)}, ${d.sort_order}`,
      ),
    ) + "\non conflict (id) do nothing;",
    "",
  );

  // --- profile --------------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 3. 사람 — 전부 가상 인물이다",
    "-- -----------------------------------------------------------------------------",
    "insert into profile (id, name, department_id, position, rank, email, is_active, is_demo) values",
    rows(
      profiles.map(
        (x) =>
          `${q(x.id)}, ${q(x.name)}, ${q(x.department_id)}, ${q(x.position)}, ${x.rank}, ${q(x.email)}, ${bool(x.is_active)}, ${bool(x.is_demo)}`,
      ),
    ) + "\non conflict (id) do nothing;",
    "",
  );

  // --- work -----------------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 4. 업무",
    "--",
    "-- previous_year_work_id 는 같은 표를 가리키므로 먼저 전부 넣고 나중에 연결한다.",
    "-- -----------------------------------------------------------------------------",
    "insert into work (",
    "  id, title, description, status, visibility, department_id, owner_id,",
    "  due_date, fiscal_year, archived_at, created_by, created_at, updated_at",
    ") values",
    rows(
      workRows.map(
        (w) =>
          `${q(w.id)}, ${q(w.title)}, ${q(w.description)}, ${q(w.status)}, ${q(w.visibility)}, ` +
          `${q(w.department_id)}, ${q(w.owner_id)}, ${w.due_date ? `${q(w.due_date)}::date` : "NULL"}, ` +
          `${w.fiscal_year}, ${ts(w.archived_at)}, ${q(w.created_by)}, ${ts(w.created_at)}, ${ts(w.updated_at)}`,
      ),
    ) + "\non conflict (id) do nothing;",
    "",
  );

  const linked = workRows.filter((w) => w.previous_year_work_id);
  if (linked.length > 0) {
    p(
      "-- 「작년 이맘때」 연결",
      ...linked.map(
        (w) =>
          `update work set previous_year_work_id = ${q(w.previous_year_work_id)} where id = ${q(w.id)};`,
      ),
      "",
    );
  }

  // --- work_member ----------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 5. 참여자와 권한",
    "-- -----------------------------------------------------------------------------",
    "insert into work_member (work_id, profile_id, role, created_at) values",
    rows(
      workMembers.map(
        (m) =>
          `${q(m.work_id)}, ${q(m.profile_id)}, ${q(m.role)}, ${ts(m.created_at)}`,
      ),
    ) + "\non conflict (work_id, profile_id) do nothing;",
    "",
  );

  // --- document / doc_section ----------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 6. 문서와 항목",
    "-- -----------------------------------------------------------------------------",
    "insert into document (id, work_id, title, created_by, created_at, updated_at) values",
    rows(
      documents.map(
        (d) =>
          `${q(d.id)}, ${q(d.work_id)}, ${q(d.title)}, ${q(d.created_by)}, ${ts(d.created_at)}, ${ts(d.updated_at)}`,
      ),
    ) + "\non conflict (id) do nothing;",
    "",
    "insert into doc_section (",
    "  id, document_id, sort_order, heading, body, locked_by, locked_at, updated_by, updated_at",
    ") values",
    rows(
      docSections.map(
        (s) =>
          `${q(s.id)}, ${q(s.document_id)}, ${s.sort_order}, ${q(s.heading)}, ${q(s.body)}, ` +
          `${s.locked_by ? q(s.locked_by) : "NULL"}, ${lockTs(s.locked_at)}, ${q(s.updated_by)}, ${ts(s.updated_at)}`,
      ),
    ) + "\non conflict (id) do nothing;",
    "",
  );

  // --- comment / attachment -------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 7. 대화와 첨부",
    "--",
    "-- 첨부는 경로만 넣는다. 실제 파일은 올리지 않는다.",
    "-- 시제품에 실제 공문서를 넣지 않는다는 원칙이 여기에도 적용된다.",
    "-- -----------------------------------------------------------------------------",
    "insert into comment (id, work_id, author_id, body, created_at) values",
    rows(
      comments.map(
        (c) =>
          `${q(c.id)}, ${q(c.work_id)}, ${q(c.author_id)}, ${q(c.body)}, ${ts(c.created_at)}`,
      ),
    ) + "\non conflict (id) do nothing;",
    "",
    "insert into attachment (",
    "  id, work_id, storage_path, file_name, mime_type, byte_size, uploaded_by, created_at",
    ") values",
    rows(
      attachments.map(
        (a) =>
          `${q(a.id)}, ${q(a.work_id)}, ${q(a.storage_path)}, ${q(a.file_name)}, ` +
          `${q(a.mime_type)}, ${a.byte_size}, ${q(a.uploaded_by)}, ${ts(a.created_at)}`,
      ),
    ) + "\non conflict (id) do nothing;",
    "",
  );

  // --- activity -------------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 8. 이력",
    "--",
    "-- 평소에는 트리거가 남기는 표다. 시드에서만 예외적으로 직접 넣는다.",
    "-- id는 identity 열이라 값을 주지 않고 시각 순서대로 넣는다.",
    "-- -----------------------------------------------------------------------------",
    "-- 이력과 열람기록에는 자연키가 없어 on conflict 를 걸 수 없다.",
    "-- 그대로 두면 시드를 두 번 실행했을 때 전부 두 벌이 된다(실제로 그렇게 됐다).",
    "-- 그래서 표가 비어 있을 때만 넣는다.",
    "do $$ begin",
    "if not exists (select 1 from activity) then",
    "insert into activity (work_id, actor_id, kind, summary, created_at) values",
    rows(
      [...activities]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(
          (a) =>
            `${q(a.work_id)}, ${a.actor_id ? q(a.actor_id) : "NULL"}, ${q(a.kind)}, ${q(a.summary)}, ${ts(a.created_at)}`,
        ),
    ) + ";",
    "end if;",
    "end $$;",
    "",
  );

  // --- handover -------------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 9. 인계·인수 (박준호 → 이하람)",
    "-- -----------------------------------------------------------------------------",
    "insert into handover (",
    "  id, from_profile_id, to_profile_id, status, ai_model, generated_at, created_at",
    ") values",
    rows(
      handovers.map(
        (h) =>
          `${q(h.id)}, ${q(h.from_profile_id)}, ${q(h.to_profile_id)}, ${q(h.status)}, ` +
          `${q(h.ai_model)}, ${ts(h.generated_at)}, ${ts(h.created_at)}`,
      ),
    ) +
      // ai_model 만은 덮어쓴다. 「무엇으로 만들었는지」를 적는 감사용 칸이라
      // 실제와 어긋난 값이 남아 있으면 화면이 거짓말을 한다. 실제로 그랬다 —
      // 시드에는 한때 모델 이름이 들어 있었고, do nothing 때문에 시드를 고친
      // 뒤에도 실제 프로젝트의 행은 그대로 'claude-opus-5' 였다.
      // 다른 칸(status·generated_at)은 건드리지 않는다. 시연 도중 시드를
      // 다시 돌렸을 때 진행 중인 인계가 처음으로 되돌아가면 안 된다.
      "\non conflict (id) do update set ai_model = excluded.ai_model;",
    "",
    "insert into handover_item (handover_id, work_id, transferred) values",
    rows(
      handoverItems.map(
        (i) => `${q(i.handover_id)}, ${q(i.work_id)}, ${bool(i.transferred)}`,
      ),
    ) + "\non conflict (handover_id, work_id) do nothing;",
    "",
  );

  // --- access_log -----------------------------------------------------------
  p(
    "-- -----------------------------------------------------------------------------",
    "-- 10. 열람기록",
    "-- -----------------------------------------------------------------------------",
    "do $$ begin",
    "if not exists (select 1 from access_log) then",
    "insert into access_log (work_id, actor_id, kind, created_at) values",
    rows(
      [...accessLogs]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(
          (l) =>
            `${q(l.work_id)}, ${q(l.actor_id)}, ${q(l.kind)}, ${ts(l.created_at)}`,
        ),
    ) + ";",
    "end if;",
    "end $$;",
    "",
  );

  p(
    "-- -----------------------------------------------------------------------------",
    "-- 11. 트리거를 다시 켠다",
    "--",
    "-- 여기서부터는 평소대로 동작한다. 사용자가 무언가 고치면 이력이 자동으로 쌓인다.",
    "-- -----------------------------------------------------------------------------",
    "alter table profile      enable trigger user;",
    "alter table work         enable trigger user;",
    "alter table work_member  enable trigger user;",
    "alter table document     enable trigger user;",
    "alter table doc_section  enable trigger user;",
    "alter table comment      enable trigger user;",
    "alter table attachment   enable trigger user;",
    "",
    "alter table department    enable row level security;",
    "alter table profile       enable row level security;",
    "alter table work          enable row level security;",
    "alter table work_member   enable row level security;",
    "alter table document      enable row level security;",
    "alter table doc_section   enable row level security;",
    "alter table comment       enable row level security;",
    "alter table attachment    enable row level security;",
    "alter table activity      enable row level security;",
    "alter table handover      enable row level security;",
    "alter table handover_item enable row level security;",
    "alter table access_log    enable row level security;",
    "",
    "commit;",
    "",
    "-- 확인",
    "--   select count(*) from work;        -- 18",
    "--   select count(*) from activity;    -- " + activities.length,
    "--   select * from app.security_audit; -- 0행이어야 정상",
    "",
  );

  return L.join("\n");
}
