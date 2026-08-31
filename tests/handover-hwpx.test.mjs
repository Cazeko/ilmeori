/**
 * 인계서 한/글 내보내기 시험 — **파일에 실제로 들어간 글자**를 되읽어서 본다.
 *
 * ── 무엇이 위험한가 ────────────────────────────────────────────────────────
 *
 * 이 제품의 주장은 「인계서의 문장마다 어느 기록에서 나왔는지 적는다」이고,
 * 그 주장이 사는 자리는 화면이다. 그런데 실제 공공기관에서 다음 걸음으로
 * 오가는 것은 **한/글 파일**이다. 파일이 화면과 다른 문장을 담고 있으면,
 * 심사장에서 화면으로 증명한 것이 결재로 올라가는 물건에는 없다는 뜻이 된다.
 * 그리고 그 어긋남은 **화면에서 티가 안 난다** — 파일을 열어 봐야 안다.
 *
 * 그래서 이 시험은 「내보내기가 죽지 않는다」를 보지 않는다. 아래 넷을 본다.
 *
 *   [1] ZIP·XML 로서 성립한다 (한/글이 열 수 있는 최소 조건)
 *   [2] 서식의 뼈대가 전부 있다 — 일곱 칸 이름·사람 표·서명란·출처
 *   [3] **문단의 글자가 데이터 그대로다** — 화면·종이와 한 글자도 안 다르다
 *   [4] 화면의 장치(링크·꼬리표·토글)가 파일로 새지 않는다
 *
 * [3] 이 이 파일의 핵심이다. print-sheet 시험([2])이 종이에 대해 하는 대조와
 * 같은 것을 파일에 대해 한다 — 두 매체가 같은 `DraftParagraph` 에서 나오므로,
 * 한쪽만 통과하는 상태가 생기면 그건 구조가 갈라졌다는 뜻이다.
 *
 * 돌리는 법
 *   npm run test:handover-hwpx
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

const { buildHandoverDraft, chunkParagraphs, draftBlockText, draftParagraphText } =
  await import("@/lib/handover-draft.ts");
const { handoverToHwpxDoc } = await import("@/lib/handover-export.ts");
const { buildHwpx } = await import("@/lib/hwpx/pack.ts");
const mock = await import("@/lib/data/mock.ts");
const { profiles } = await import("@/lib/mock/org.ts");

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 한 벌 짓기 — 화면(handover/page.tsx)이 넘기는 것과 같은 값으로.
// ---------------------------------------------------------------------------

const from = profiles.find((p) => p.name === "박준호");
const view = await mock.getHandoverFor(from);
if (!view) {
  console.log("목업에 인계 건이 없다. 시험할 것이 없으므로 여기서 멈춘다.");
  process.exit(1);
}
const draft = await buildHandoverDraft(view);
const [fromDept, toDept] = await Promise.all([
  view.from.department_id ? mock.getDepartment(view.from.department_id) : null,
  view.to.department_id ? mock.getDepartment(view.to.department_id) : null,
]);

/** 시각을 고정한다 — 같은 문서를 두 번 만들면 바이트까지 같아야 한다(pack.ts). */
const CREATED_AT = new Date("2026-08-31T09:00:00+09:00");

function build(notesByBlock = new Map()) {
  return handoverToHwpxDoc({
    draft,
    notesByBlock,
    from: view.from,
    to: view.to,
    fromDept,
    toDept,
    generatedAt: view.handover.generated_at,
    completedAt: view.handover.completed_at,
    method: view.handover.ai_model ?? "rule-based/v1",
    createdAt: CREATED_AT,
  });
}

const bytes = buildHwpx(build());

// ---------------------------------------------------------------------------
// ZIP 을 푼다 — **우리 코드로 풀지 않는다.**
//
// src/lib/zip.ts 로 풀면 시험이 아니라 되풀이가 된다. CRC 를 우리가 쓰고 우리가
// 검산하면 둘 다 같은 방향으로 틀릴 수 있고, 그때 나오는 파일은 한/글이 못 연다.
// 그래서 파이썬 zipfile 에 맡긴다 — `testzip()` 이 CRC 를 실제로 대조한다.
// (tests/hwpx.test.mjs 가 이미 같은 길을 쓴다. 새 의존성은 하나도 안 는다)
//
// 이 문서는 hwpx.test.mjs 가 만드는 문서와 **다르다** — 칸 안에 여러 줄이 든
// 표가 여기에만 있다. 그래서 이 파일도 규격 검사를 스스로 한 번 해야 한다.
// ---------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "ilmeori-handover-hwpx-"));

let seq = 0;
/** 파이썬 zipfile 로 푼다. CRC 대조(testzip)까지 그쪽이 한다. */
function unpack(raw) {
  const file = join(dir, `doc-${(seq += 1)}.hwpx`);
  writeFileSync(file, raw);
  try {
    const out = execFileSync(
      "python3",
      [
        "-c",
        [
          "import sys, json, zipfile",
          "z = zipfile.ZipFile(sys.argv[1])",
          // testzip() 은 항목마다 CRC-32 를 실제로 다시 계산해 맞춰 본다.
          "bad = z.testzip()",
          "names = z.namelist()",
          "first = z.infolist()[0]",
          "data = {n: z.read(n).decode('utf-8', 'replace') for n in names}",
          "print(json.dumps({'bad': bad, 'names': names, 'data': data,",
          "  'firstName': first.filename, 'firstMethod': first.compress_type,",
          "  'firstOffset': first.header_offset}))",
        ].join("\n"),
        file,
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return JSON.parse(out);
  } catch (e) {
    return { error: String(e.message ?? e), names: [], data: {} };
  }
}

/** 본문 XML 한 조각. 보탠 글이 있는 판을 따로 지을 때 쓴다. */
const sectionOf = (raw) => unpack(raw).data["Contents/section0.xml"] ?? "";

const zipOk = unpack(bytes);
const names = zipOk.names;
const readBack = zipOk.data;
const section = readBack["Contents/section0.xml"] ?? "";

// ---------------------------------------------------------------------------
console.log("\n[1] 한/글이 열 수 있는 최소 조건 — ZIP 과 XML");
// ---------------------------------------------------------------------------

ok("빈 파일이 아니다", bytes.byteLength > 1000, `${bytes.byteLength}바이트`);
ok("압축을 풀 수 있다", !zipOk.error, String(zipOk.error ?? "").slice(0, 200));
ok("깨진 항목이 없다 — CRC 를 실제로 다시 계산해 맞춰 본다", zipOk.bad === null, String(zipOk.bad));
ok(
  // 규격이 요구하는 것은 **지역 항목이 파일 맨 앞(offset 0)** 에 있는 것이다.
  // 중앙 디렉터리의 차례만 보면 지역 항목이 뒤로 밀려 있어도 통과한다.
  "mimetype 이 파일 맨 앞에 압축하지 않은 채로 있다",
  zipOk.firstName === "mimetype" &&
    zipOk.firstMethod === 0 &&
    zipOk.firstOffset === 0,
  `${zipOk.firstName} · method ${zipOk.firstMethod} · offset ${zipOk.firstOffset}`,
);
ok(
  "mimetype 의 내용이 한/글 문서다",
  readBack["mimetype"] === "application/hwp+zip",
  readBack["mimetype"],
);
for (const need of [
  "META-INF/container.xml",
  "META-INF/manifest.xml",
  "version.xml",
  "Contents/header.xml",
  "Contents/section0.xml",
  "Contents/content.hpf",
]) {
  ok(`${need} 가 있다`, names.includes(need));
}

// 잘 짜인 XML 인지 — **진짜 파서에게 묻는다.** 여는/닫는 꺾쇠를 세는 방식으로
// 물었다가 고쳤다: 태그 하나가 꺾쇠를 하나씩 내므로 </hp:tc> 를 통째로 빠뜨려도
// 수는 그대로 맞는다. 세는 검사는 esc() 가 이미 보장하는 것만 다시 보고 있었다.
for (const [name, xml] of Object.entries(readBack)) {
  if (!name.endsWith(".xml") && !name.endsWith(".hpf")) continue;
  const out = join(dir, name.replace(/\//g, "_"));
  writeFileSync(out, xml);
  try {
    execFileSync("xmllint", ["--noout", out], { stdio: "pipe" });
    ok(`${name} 이 잘 짜인 XML 이다`, true);
  } catch (e) {
    ok(`${name} 이 잘 짜인 XML 이다`, false, String(e.stderr ?? e).slice(0, 300));
  }
}

// ---------------------------------------------------------------------------
console.log("\n[2] 별지 제12호서식의 뼈대가 전부 있다");
// ---------------------------------------------------------------------------

/** 태그를 벗기고 XML 이스케이프를 되돌린다. `&amp;` 는 맨 끝에 푼다. */
const textOf = (xml) =>
  xml
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const text = textOf(section);

ok("서식 제목이 있다", text.includes("업무인계·인수서"));
ok(
  "서식 근거가 적혀 있다",
  text.includes("별지 제12호서식"),
);
const missingHeadings = draft.blocks.filter((b) => !text.includes(b.heading));
ok(
  "일곱 칸의 이름이 전부 파일에 있다",
  draft.blocks.length === 7 && missingHeadings.length === 0,
  missingHeadings.map((b) => b.heading).join(", "),
);
ok(
  "사람 표의 칸 이름이 있다",
  ["구분", "소속", "직급", "성명", "인계일"].every((h) => text.includes(h)),
);
ok(
  "인계자와 인수자가 이름으로 적힌다",
  text.includes(view.from.name) && text.includes(view.to.name),
);
ok(
  "서명란이 있다",
  text.includes("위와 같이 업무를 인계·인수합니다") &&
    text.includes("입회자") &&
    text.includes("(서명 또는 인)"),
);
ok(
  "출처 문단이 있다 — 무엇을 보고 몇 건을 실었는지",
  text.includes("이 초안은 「일머리」에 쌓인 기록") &&
    text.includes("그대로 제출하는 문서가 아닙니다"),
);
ok(
  "생성 방식이 모델 이름이 아니라 만든 방법으로 적힌다",
  text.includes("생성 방식 rule-based/v1"),
);

// ---------------------------------------------------------------------------
console.log("\n[3] 파일의 글자 = 문단 평탄화 — 화면·종이와 한 칸도 다르지 않다");
// ---------------------------------------------------------------------------

// 이 대조가 이 파일의 핵심이다. 파일이 싣는 글자는 **데이터에서만** 나와야
// 하고, 그 데이터를 글자로 눕히는 식은 handover-draft.ts 에 한 벌만 있다.
//
// 규칙이 채운 칸은 문단마다 따로 실리고, 그중 업무를 가리키는 문단은 두 칸짜리
// 표의 한 행이 된다(chunkParagraphs — print-sheet.tsx 와 **같은 함수**).
//
// ⚠ 표의 한 행을 **한 덩어리로 찾으면 안 된다.** 두 칸 사이에는 XML 태그가
// 들어 있어서, 이은 글자가 통째로 이어져 있는 자리는 파일 어디에도 없다.
// 그래서 둘로 나눠 묻는다.
//
//   ① 파일에 실제로 실리는 조각(칸 하나 = 조각 하나)이 전부 있는가  ← 파일을 본다
//   ② 그 두 조각을 줄바꿈으로 이으면 원래 문단과 같은가            ← 데이터를 본다
//
// ②가 이 표 배치의 전제다(print-sheet.tsx 의 「글자는 한 자도 안 옮긴다」).
// ①만 있으면 칸을 아무렇게나 잘라도 통과하고, ②만 있으면 파일에 안 실려도
// 통과한다. 둘이 함께 서야 「파일의 글자 = 문단 평탄화」가 증명된다.
// **줄 단위로 센다.** 파일이 담는 최소 단위가 줄이기 때문이다 — 칸 안이든
// 본문이든, 한 줄이 `<hp:p>` 하나다(pack.ts 의 cellLines · handover-export 의
// textLines). 문단을 통째로 찾으면 안 된다: 줄 사이에 태그가 들어 있어서
// 이어 붙인 글자가 통째로 있는 자리는 파일 어디에도 없다.
const expected = [];
const rowSplits = [];
for (const block of draft.blocks) {
  if (block.needsHuman) {
    expected.push(...draftBlockText(block.paragraphs).split("\n"));
    continue;
  }
  for (const chunk of chunkParagraphs(block.paragraphs)) {
    if (chunk.kind === "table") {
      for (const p of chunk.rows) {
        const cells = [
          draftParagraphText(p.slice(0, 1)),
          draftParagraphText(p.slice(1)),
        ];
        // 칸마다의 줄. 오른쪽 칸이 빈 행(줄이 하나뿐인 문단)도 있으므로
        // 빈 칸은 줄 0개로 센다 — 없는 줄을 하나로 세면 셈이 어긋난다.
        const cellLines = cells.map((c) => (c === "" ? [] : c.split("\n")));
        expected.push(...cellLines.flat());
        rowSplits.push({ cellLines, lines: p.map((l) => l.text) });
      }
    } else {
      expected.push(...draftParagraphText(chunk.paragraph).split("\n"));
    }
  }
}

// 빈 줄은 파일에서 `spacer`(글자 없는 문단)가 되므로 찾을 글자가 없다.
const searchable = expected.filter((line) => line.trim() !== "");

const missingLines = searchable.filter((line) => !text.includes(line));
ok(
  "규칙이 뽑은 줄이 하나도 빠짐없이 파일에 있다",
  missingLines.length === 0,
  `${missingLines.length}줄 누락 · 첫 줄: ${missingLines[0]?.slice(0, 60) ?? ""}`,
);
ok(
  "빠짐없이 셌다 — 셀 줄이 실제로 여럿이다",
  searchable.length >= 30,
  `${searchable.length}줄`,
);
// 줄바꿈이 공백으로 눕혀지지 않았는지 — **이 시험이 생긴 이유**다.
// 첫 판은 문단을 통째로 넘겨 `esc()` 가 스무 줄을 한 줄로 뭉갰고, 비교하는
// 쪽도 같은 눕힘을 적용해서 그 사실이 안 보였다. 눕힌 모양이 파일에 있으면
// 그건 줄이 사라졌다는 뜻이다.
const flattened = rowSplits
  .map((r) => r.cellLines[1])
  .filter((lines) => lines.length > 1)
  .map((lines) => lines.join(" "));
ok(
  "여러 줄짜리 칸이 한 줄로 눕혀지지 않았다",
  flattened.length > 0 && flattened.every((s) => !text.includes(s)),
  `${flattened.length}칸 검사`,
);

// ⚠ 첫 판은 `cells.join("\n") === whole` 로 물었다. 그건 **셈이 아니었다** —
// `draftParagraphText` 를 1에서 자르고 다시 잇는 항등식이라 줄이 둘 이상이면
// 언제나 참이고, 줄이 하나인 행(설명도 문서도 상태 변화도 없는 업무)에서는
// `"제목\n" !== "제목"` 으로 언제나 거짓이었다. 늘 참이거나 늘 거짓인 항목은
// 시험이 아니라 장식이고, 뒤엣것은 멀쩡한 업무 하나로 npm run check 를
// 빨간불로 만든다.
//
// 실제로 물어야 하는 것은 **자르면서 줄이 없어지거나 순서가 바뀌지 않는가**다.
const badSplit = rowSplits.find(
  (r) =>
    r.cellLines.flat().join("") !== r.lines.join(""),
);
ok(
  "표로 자르면서 줄이 없어지거나 순서가 바뀌지 않는다",
  !badSplit,
  badSplit ? JSON.stringify(badSplit.lines).slice(0, 80) : "",
);
ok(
  "이 셈이 헛돌지 않는다 — 표로 그려진 행이 실제로 있다",
  rowSplits.length > 0,
  `${rowSplits.length}행`,
);

// ── 칸을 두 번 싣지 않는다 ──────────────────────────────────────────────────
//
// 이 자리에서 「같은 글자가 두 번 나오는가」로 물었다가 두 번 고쳤다. 줄 단위로
// 물으면 **되풀이가 맞는 줄**이 잔뜩 걸린다 — 업무 제목은 물론이고 그 아래
// 「소관 … · 공개범위 … · 현재 …」 같은 업무 머리줄도 서식의 여러 칸이 저마다
// 한 번씩 싣는다. 그건 사고가 아니라 서식이 원래 그런 것이다.
//
// 그래서 **칸의 수를 센다.** 한 칸을 두 벌 싣는 결함(print-sheet 이 실제로
// 한 번 냈던 것)은 칸 이름이 두 번 찍히고 표가 한 벌 더 서는 것으로 반드시
// 드러난다. 글자를 세는 것보다 좁지만, 좁은 대신 헛돌지 않는다.
const twice = draft.blocks.filter(
  (b) => text.split(b.heading).length - 1 !== 1,
);
ok(
  "일곱 칸의 이름이 저마다 꼭 한 번씩 찍힌다",
  twice.length === 0,
  twice.map((b) => `${b.heading}×${text.split(b.heading).length - 1}`).join(", "),
);

// 표의 수 = 업무별 표 + 사람 표 + 서명란. 한 칸이 두 벌 실리면 여기서 어긋난다.
const expectedTables =
  draft.blocks
    .filter((b) => !b.needsHuman)
    .flatMap((b) => chunkParagraphs(b.paragraphs))
    .filter((c) => c.kind === "table").length + 2;
ok(
  "표가 꼭 있어야 할 만큼만 있다",
  (section.match(/<hp:tbl\b/g) ?? []).length === expectedTables,
  `${(section.match(/<hp:tbl\b/g) ?? []).length}개 · 기대 ${expectedTables}개`,
);

// 사람이 보탠 글은 규칙이 뽑은 문단과 **섞이지 않는다.**
const NOTE = {
  id: "n1",
  handover_id: view.handover.id,
  block_key: "3-assets",
  body: "청사 3층 창고 열쇠 2개, 자원순환과 공용 노트북 1대.",
  created_at: "2026-08-20T02:00:00Z",
  author: view.from,
};
const withNote = textOf(
  sectionOf(buildHwpx(build(new Map([["3-assets", [NOTE]]])))),
);
ok("보탠 글이 파일에 실린다", withNote.includes(NOTE.body));
ok(
  "누가 언제 적었는지 함께 실린다",
  withNote.includes(`인계자 보충: ${view.from.name}`),
);
ok(
  "보탠 글이 없으면 그것을 설명하는 문장도 없다",
  !text.includes("인계자 보충") && !text.includes("왼쪽에 선이 그어진"),
);
ok(
  "보탠 글이 있으면 그것이 무엇인지 파일이 스스로 말한다",
  withNote.includes("왼쪽에 선이 그어진 「인계자 보충」"),
);

// ---------------------------------------------------------------------------
console.log("\n[4] 화면의 장치는 파일로 새지 않는다");
// ---------------------------------------------------------------------------

// 근거 꼬리표는 화면의 장치다. 온나라에 올라간 문서에 남은 앵커는 오류다.
for (const leak of [
  "/works/",
  "href",
  "data-src",
  "출처 보기",
  "handover-prov",
  "누르세요",
]) {
  ok(`「${leak}」가 파일에 없다`, !section.includes(leak));
}
// 화면에만 있는 물건이 정말로 있었는지 — 이 검사가 헛도는지 스스로 본다.
const linkedLines = draft.blocks
  .flatMap((b) => b.paragraphs.flat())
  .filter((l) => l.ref);
ok(
  "이 검사가 헛돌지 않는다 — 원본 문단에는 가리키는 줄이 실제로 있다",
  linkedLines.length > 0,
  `${linkedLines.length}줄`,
);

// 같은 문서를 두 번 만들면 바이트까지 같아야 한다. 「내가 받은 파일이 그때 그
// 파일인가」를 해시로 답할 수 있어야 하기 때문이다(pack.ts 의 createdAt 주석).
const again = buildHwpx(build());
ok(
  "같은 값으로 두 번 만들면 바이트가 같다",
  Buffer.from(bytes).equals(Buffer.from(again)),
);

// ---------------------------------------------------------------------------
console.log(
  fails.length === 0
    ? `\n전부 통과 — ${pass}건 통과, 0건 실패`
    : `\n${pass}건 통과, ${fails.length}건 실패\n` +
        fails.map((f) => `  · ${f}`).join("\n"),
);
process.exit(fails.length === 0 ? 0 : 1);
