/**
 * 내보내기 시험 — DOCX · HWPX(서식 문서에서) · 클립보드 HTML.
 *
 * ⚠ **이 시험은 「워드에서 열린다」를 증명하지 않는다.** 그건 워드가 있는
 * 컴퓨터에서 사람이 한 번 열어 봐야만 안다(hwpx.test.mjs 가 한/글에 대해
 * 적어 둔 것과 같다). 여기서 보는 것은 그 앞 단계다 — 규격대로 된 ZIP 인가,
 * XML 이 잘 짜였는가, 넣은 글자가 제자리에 들어갔는가, 문서가 가리키는
 * 스타일이 실제로 정의돼 있는가, 그리고 **본문에 섞인 `<`·`&` 가 파일을
 * 깨뜨리지 않는가.**
 *
 * 이 다섯이 통과한다고 워드가 연다는 보장은 없지만, 하나라도 깨지면 워드는
 * **반드시** 못 연다.
 *
 * 돌리는 법
 *   npm run test:docx
 *
 * 별칭 훅을 얹어 돈다 — docx.ts 가 `../zip` 을 확장자 없이 부르기 때문이다.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { buildDocx, docxFileName } = await import("../src/lib/editor/docx.ts");
const { richToHwpxDoc } = await import("../src/lib/editor/to-hwpx.ts");
const { toHtml, fromHtml } = await import("../src/lib/editor/html.ts");
const { buildHwpx, hwpxFileName } = await import("../src/lib/hwpx/pack.ts");
const { parseRichDoc, docPlainText, docTitle } = await import(
  "../src/lib/editor/model.ts"
);

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

const dir = mkdtempSync(join(tmpdir(), "ilmeori-docx-"));

/** 부품 하나를 파일로 떨궈 xmllint 에 물린다. */
function wellFormed(label, name, text) {
  const path = join(dir, name.replace(/[/[\]]/g, "_"));
  writeFileSync(path, text);
  try {
    execFileSync("xmllint", ["--noout", path], { stdio: "pipe" });
    ok(`${label} 이 잘 짜인 XML 이다`, true);
  } catch (e) {
    ok(`${label} 이 잘 짜인 XML 이다`, false, String(e.stderr ?? e).slice(0, 300));
  }
}

/** ZIP 을 풀어 {이름: 글월} 로. 파이썬 zipfile 이 규격 판정까지 해 준다. */
function unzip(file) {
  const out = execFileSync(
    "python3",
    [
      "-c",
      [
        "import sys, json, zipfile",
        "z = zipfile.ZipFile(sys.argv[1])",
        "bad = z.testzip()",
        "names = z.namelist()",
        "data = {n: z.read(n).decode('utf-8', 'replace') for n in names if n != 'mimetype'}",
        "print(json.dumps({'bad': bad, 'names': names, 'data': data}))",
      ].join("\n"),
      file,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

// ---------------------------------------------------------------------------
// 시험용 문서 — 실제 결재 문서가 담는 것들을 한 벌에 다 넣는다
// ---------------------------------------------------------------------------

const AT = new Date("2026-08-14T05:30:00.000Z");

/** 본문에 그대로 흘러 들어오는 험한 글자들. */
const NASTY =
  '깨뜨리기 <w:t> & "따옴표" \'홑\' ]]> ' + String.fromCharCode(7) + " 제어문자";

const RAW = {
  v: 1,
  blocks: [
    { id: "b1", kind: "title", spans: [{ t: "2026년 음식물류폐기물 대행 원가산정 결과" }] },
    { id: "b2", kind: "heading", spans: [{ t: "1. 개요" }] },
    { id: "b3", kind: "subheading", spans: [{ t: "가. 관련 근거" }] },
    {
      id: "b4",
      kind: "body",
      spans: [
        { t: "제출 기한은 " },
        { t: "8월 30일", m: ["b"] },
        { t: "까지이며, " },
        { t: "기울임", m: ["i"] },
        { t: " · " },
        { t: "밑줄", m: ["u"] },
        { t: " · " },
        { t: "취소선", m: ["s"] },
        { t: " · " },
        { t: "위", m: ["sup"] },
        { t: "아래", m: ["sub"] },
        { t: " · " },
        { t: "파랑", c: "primary" },
        { t: " · " },
        { t: "형광", h: "yellow" },
      ],
    },
    { id: "b5", kind: "numbered", spans: [{ t: "첫째 항목" }] },
    { id: "b6", kind: "numbered", spans: [{ t: "둘째 항목" }], indent: 1 },
    { id: "b7", kind: "numbered", spans: [{ t: "셋째 항목" }] },
    { id: "b8", kind: "bullet", spans: [{ t: NASTY }] },
    { id: "b9", kind: "quote", spans: [{ t: "원문 그대로 인용합니다." }] },
    { id: "b10", kind: "source", spans: [{ t: "근거: 업무 대화 · 배도현 주무관, 7월 30일" }] },
    { id: "b11", kind: "spacer", spans: [] },
    { id: "b12", kind: "divider", spans: [] },
    {
      id: "b13",
      kind: "table",
      spans: [],
      table: {
        widths: [1, 2, 2, 2],
        header: true,
        rows: [
          {
            cells: [
              { id: "c1", spans: [{ t: "구분" }] },
              { id: "c2", spans: [{ t: "기안" }] },
              { id: "c3", spans: [{ t: "결재" }] },
              { id: "c4", spans: [{ t: "최종결재" }] },
            ],
          },
          {
            cells: [
              { id: "c5", spans: [{ t: "성명" }] },
              { id: "c6", spans: [{ t: "박준호" }], align: "right" },
              { id: "c7", spans: [{ t: "정다은" }] },
              { id: "c8", spans: [{ t: "한상우" }] },
            ],
          },
          {
            // 가로 병합 — 협조란 한 줄이 이것을 쓴다
            cells: [
              { id: "c9", spans: [{ t: "협조" }] },
              { id: "c10", spans: [{ t: "건축과 박도윤 <의견 있음>" }], colSpan: 3 },
            ],
          },
        ],
      },
    },
    { id: "b14", kind: "pagebreak", spans: [] },
    { id: "b15", kind: "body", spans: [{ t: "다음 쪽 첫 줄" }], align: "center" },
    { id: "b16", kind: "note", spans: [{ t: "이 문서는 「일머리」가 조립했습니다." }] },
  ],
};

const doc = parseRichDoc(RAW);
if (!doc) {
  console.log("시험용 문서가 parseRichDoc 를 통과하지 못했다 — 시험을 시작할 수 없다");
  process.exit(1);
}

const META = { title: "2026년 음식물류폐기물 대행 원가산정 결과", createdAt: AT };
const bytes = buildDocx(doc, META);

// ---------------------------------------------------------------------------
console.log("\n[1] ZIP 규격");
// ---------------------------------------------------------------------------

ok("바이트가 나온다", bytes instanceof Uint8Array && bytes.length > 1000, `${bytes?.length}B`);
ok(
  "지역 헤더 서명으로 시작한다",
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
);
// HWPX 와 달리 맨 앞 항목에 규격이 정한 것이 없다 — [Content_Types].xml 이
// 무엇인지 말한다. 그래서 「첫 항목이 무압축인가」는 여기서 볼 것이 아니다.
const head = Buffer.from(bytes.subarray(0, 60)).toString("latin1");
ok("첫 항목이 [Content_Types].xml 이다", head.slice(30, 49) === "[Content_Types].xml", head.slice(30, 55));

// ---------------------------------------------------------------------------
console.log("\n[2] 실제로 풀리는가 (python zipfile)");
// ---------------------------------------------------------------------------

const file = join(dir, "doc.docx");
writeFileSync(file, bytes);

let listing = [];
let readBack = {};
try {
  const parsed = unzip(file);
  listing = parsed.names;
  readBack = parsed.data;
  ok("깨진 항목이 없다 (testzip)", parsed.bad === null, String(parsed.bad));
} catch (e) {
  ok("압축을 풀 수 있다", false, String(e.message ?? e).slice(0, 200));
}

const REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels",
  "word/styles.xml",
  "word/numbering.xml",
  "docProps/core.xml",
  "docProps/app.xml",
];
for (const name of REQUIRED) {
  ok(`${name} 이 들어 있다`, listing.includes(name));
}

// ---------------------------------------------------------------------------
console.log("\n[3] XML 이 잘 짜였는가 (xmllint)");
// ---------------------------------------------------------------------------

for (const [name, text] of Object.entries(readBack)) {
  if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
  wellFormed(name, name, text);
}

const document = readBack["word/document.xml"] ?? "";
const styles = readBack["word/styles.xml"] ?? "";
const core = readBack["docProps/core.xml"] ?? "";
const types = readBack["[Content_Types].xml"] ?? "";

// ---------------------------------------------------------------------------
console.log("\n[4] 글자가 제자리에 들어갔는가");
// ---------------------------------------------------------------------------

ok("제목이 본문에 있다", document.includes("음식물류폐기물 대행 원가산정"));
ok("항목 제목이 있다", document.includes("1. 개요"));
ok("작은 항목이 있다", document.includes("가. 관련 근거"));
ok("근거 꼬리표가 있다", document.includes("근거: 업무 대화 · 배도현 주무관"));
ok("표 안의 이름이 있다", document.includes("박준호") && document.includes("한상우"));
ok("제목이 꾸러미 메타에도 있다", core.includes("음식물류폐기물"));
ok("만든 시각이 W3CDTF 로 적혔다", core.includes("2026-08-14T05:30:00Z"), core.slice(0, 400));

// 험한 글자 — 깨지지 않고 **글자로** 들어가야 한다.
ok("본문의 <w:t> 가 태그가 아니라 글자로 들어갔다", document.includes("&lt;w:t&gt;"));
ok("본문의 & 가 &amp; 로 들어갔다", document.includes("깨뜨리기 &lt;w:t&gt; &amp;"));
ok(
  "제어문자(U+0007)가 통째로 빠졌다",
  !document.includes(String.fromCharCode(7)) && !document.includes("&#7;"),
);
ok("]]> 가 본문을 끊지 않았다", document.includes("]]&gt;"));
ok("표 안의 꺾쇠도 글자로 들어갔다", document.includes("건축과 박도윤 &lt;의견 있음&gt;"));
ok(
  "공백이 접히지 않게 xml:space 가 붙었다",
  !/<w:t>/.test(document) && document.includes('<w:t xml:space="preserve">'),
);

// ---------------------------------------------------------------------------
console.log("\n[5] 글자 서식");
// ---------------------------------------------------------------------------

ok("굵게가 있다", document.includes("<w:b/><w:bCs/><w:i/>") || document.includes("<w:b/><w:bCs/>"));
ok("기울임이 있다", document.includes("<w:i/><w:iCs/>"));
ok("밑줄이 있다", document.includes('<w:u w:val="single"/>'));
ok("취소선이 있다", document.includes("<w:strike/>"));
ok("위첨자가 있다", document.includes('<w:vertAlign w:val="superscript"/>'));
ok("아래첨자가 있다", document.includes('<w:vertAlign w:val="subscript"/>'));
ok(
  "색은 # 없이 적힌다",
  document.includes('<w:color w:val="004696"/>') && !document.includes('w:val="#'),
);
ok("정렬을 문단에 적었다", document.includes('<w:jc w:val="center"/>'));

/**
 * rPr 안의 차례가 규격대로인가.
 *
 * 잘 짜인 XML 인지만 보면 이 실수를 못 잡는다. 워드는 순서가 어긋난 rPr 을
 * 만나면 문서를 **복구 모드**로 열고, 그때 사용자에게 보이는 말은
 * 「내용에 문제가 있습니다」뿐이라 어디가 틀렸는지 알 길이 없다.
 */
{
  const ORDER = ["w:b", "w:bCs", "w:i", "w:iCs", "w:strike", "w:color", "w:u", "w:vertAlign"];
  let bad = null;
  for (const m of document.matchAll(/<w:rPr>([\s\S]*?)<\/w:rPr>/g)) {
    const seen = [...m[1].matchAll(/<(w:[A-Za-z]+)[ />]/g)].map((x) => x[1]);
    const ranked = seen.map((t) => ORDER.indexOf(t)).filter((i) => i >= 0);
    for (let i = 1; i < ranked.length; i += 1) {
      if (ranked[i] < ranked[i - 1]) bad = seen.join(",");
    }
    if (bad) break;
  }
  ok("rPr 자식의 차례가 규격대로다", bad === null, bad ?? "");
}

// ---------------------------------------------------------------------------
console.log("\n[6] 표 · 쪽 나눔 · 가로줄");
// ---------------------------------------------------------------------------

const tbl = document.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)?.[0] ?? "";
ok("표가 하나 들어갔다", tbl.length > 0);
ok("행이 셋이다", (tbl.match(/<w:tr>/g) ?? []).length === 3);
ok("가로 병합 칸이 3칸을 먹는다", tbl.includes('<w:gridSpan w:val="3"/>'));
ok("첫 줄을 쪽마다 되풀이한다", tbl.includes("<w:tblHeader/>"));
{
  const cols = [...tbl.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
  const sum = cols.reduce((n, w) => n + w, 0);
  ok("열 폭의 합이 본문 폭(9638)과 같다", sum === 9638, String(sum));
  ok("열이 넷이다", cols.length === 4, String(cols.length));
}
{
  // 행마다 칸이 먹는 열의 합이 열 수와 같아야 표가 어긋나지 않는다.
  const rows = tbl.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [];
  const sums = rows.map((r) => {
    const cells = r.match(/<w:tc>/g)?.length ?? 0;
    const extra = [...r.matchAll(/<w:gridSpan w:val="(\d+)"\/>/g)].reduce(
      (n, m) => n + Number(m[1]) - 1,
      0,
    );
    return cells + extra;
  });
  ok("행마다 칸이 먹는 열의 합이 4다", sums.every((n) => n === 4), sums.join(","));
}
ok("표 뒤에 빈 문단이 있다", /<\/w:tbl><w:p>/.test(document));
ok("쪽 나눔이 있다", document.includes('<w:br w:type="page"/>'));
ok("가로줄이 아래쪽 테두리로 그려졌다", document.includes("<w:pBdr><w:bottom"));

// ---------------------------------------------------------------------------
console.log("\n[7] 참조 — 문서가 가리키는 스타일이 실제로 있는가");
// ---------------------------------------------------------------------------

const usedStyles = new Set(
  [...document.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g)].map((m) => m[1]),
);
const definedStyles = new Set(
  [...styles.matchAll(/<w:style [^>]*w:styleId="([^"]+)"/g)].map((m) => m[1]),
);
ok(
  "본문이 쓰는 스타일이 전부 정의돼 있다",
  [...usedStyles].every((id) => definedStyles.has(id)),
  `쓰는 것 ${[...usedStyles].join(",")} · 있는 것 ${[...definedStyles].join(",")}`,
);
ok("기본 스타일이 하나뿐이다", (styles.match(/w:default="1"/g) ?? []).length === 1);
ok("글꼴을 끼워 넣지 않았다", !listing.some((n) => n.startsWith("word/fonts/")));
ok(
  "함초롬바탕이 eastAsia 로 적혔다",
  styles.includes('w:eastAsia="함초롬바탕"') && styles.includes('w:ascii="맑은 고딕"'),
);
ok(
  "선언한 부품이 전부 들어 있다",
  [...types.matchAll(/PartName="\/([^"]+)"/g)].every((m) => listing.includes(m[1])),
);
ok(
  "관계가 가리키는 부품이 전부 들어 있다",
  ["word/styles.xml", "word/numbering.xml"].every((n) => listing.includes(n)),
);

// ---------------------------------------------------------------------------
console.log("\n[8] 같은 문서는 같은 바이트");
// ---------------------------------------------------------------------------

ok(
  "두 번 만들어도 바이트가 같다",
  Buffer.from(bytes).equals(Buffer.from(buildDocx(doc, META))),
);

// ---------------------------------------------------------------------------
console.log("\n[9] 파일 이름");
// ---------------------------------------------------------------------------

ok("확장자가 붙는다", docxFileName("보고서") === "보고서.docx");
ok(
  "경로로 읽힐 글자가 빠진다",
  !docxFileName("../../etc/passwd").includes("/") && !docxFileName("..\\x").includes("\\"),
  docxFileName("../../etc/passwd"),
);
ok("이름이 통째로 비면 기본 이름을 쓴다", docxFileName("///").startsWith("결재문서"));
ok(
  "제어문자가 이름에 남지 않는다",
  !/[\u0000-\u001f\u007f-\u009f]/.test(
    docxFileName(`보고${String.fromCharCode(0)}서${String.fromCharCode(7)}끝`),
  ),
);
{
  // hwpxFileName 과 **같은 함정**이다. 80자 경계에 보조평면 글자가 걸치면
  // 반쪽 서로게이트가 남고, 그 값이 라우트의 encodeURIComponent 에서 터진다.
  let bad = null;
  for (let n = 70; n <= 90; n += 1) {
    const name = docxFileName(`${"가".repeat(n)}😀보고서`);
    try {
      encodeURIComponent(name);
    } catch {
      bad = n;
      break;
    }
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name)) {
      bad = n;
      break;
    }
  }
  ok("80자 경계에 이모지가 걸쳐도 이름이 안 깨진다", bad === null, bad === null ? "" : `${bad}자`);
}

// ---------------------------------------------------------------------------
console.log("\n[10] 서식 문서 → HWPX (to-hwpx.ts)");
// ---------------------------------------------------------------------------

const hwpxBytes = buildHwpx(richToHwpxDoc(doc, META));
const hwpxFile = join(dir, "doc.hwpx");
writeFileSync(hwpxFile, hwpxBytes);

let hwpx = {};
try {
  const parsed = unzip(hwpxFile);
  hwpx = parsed.data;
  ok("HWPX 가 깨진 항목 없이 풀린다", parsed.bad === null, String(parsed.bad));
  ok("mimetype 이 첫 번째다", parsed.names[0] === "mimetype");
} catch (e) {
  ok("HWPX 압축을 풀 수 있다", false, String(e.message ?? e).slice(0, 200));
}

const section = hwpx["Contents/section0.xml"] ?? "";
const header = hwpx["Contents/header.xml"] ?? "";
wellFormed("HWPX section0.xml", "hwpx_section0.xml", section);
wellFormed("HWPX header.xml", "hwpx_header.xml", header);

ok("제목이 두 번 찍히지 않는다", (section.match(/음식물류폐기물 대행 원가산정/g) ?? []).length === 1);
ok("번호가 글자로 구워졌다", section.includes("<hp:t>1. </hp:t>"), "「1. 」");
ok("한 단 들어간 번호는 「가.」다", section.includes("<hp:t>가. </hp:t>"));
ok("얕은 단으로 돌아오면 번호가 이어진다", section.includes("<hp:t>2. </hp:t>"));
ok("글머리표가 글자로 구워졌다", section.includes("<hp:t>○ </hp:t>"));
ok("쪽 나눔이 문단에 섰다", section.includes('pageBreak="1"'));
ok("표 안 꺾쇠가 글자로 들어갔다", section.includes("건축과 박도윤 &lt;의견 있음&gt;"));

ok("기울임 글자모양이 등록됐다", header.includes("<hh:italic/>"));
ok("밑줄 글자모양이 등록됐다", header.includes("<hh:underline"));
ok("취소선 글자모양이 등록됐다", header.includes("<hh:strikeout"));
ok("위·아래첨자가 등록됐다", header.includes("<hh:supscript/>") && header.includes("<hh:subscript/>"));
ok("색이 등록됐다", header.includes('textColor="#004696"'));

/** 등록부가 붙인 참조가 실제로 header 에 있는가 — 여기가 깨지면 서식이 무너진다. */
{
  const used = new Set([...section.matchAll(/charPrIDRef="(\d+)"/g)].map((m) => m[1]));
  const defined = new Set([...header.matchAll(/<hh:charPr id="(\d+)"/g)].map((m) => m[1]));
  ok(
    "본문이 쓰는 글자모양이 전부 정의돼 있다",
    [...used].every((id) => defined.has(id)),
    `쓰는 것 ${[...used].join(",")} · 있는 것 ${[...defined].join(",")}`,
  );
  ok("기본 여섯 개 말고도 붙었다", defined.size > 6, `${defined.size}개`);

  const usedPara = new Set([...section.matchAll(/paraPrIDRef="(\d+)"/g)].map((m) => m[1]));
  const definedPara = new Set([...header.matchAll(/<hh:paraPr id="(\d+)"/g)].map((m) => m[1]));
  ok(
    "본문이 쓰는 문단모양이 전부 정의돼 있다",
    [...usedPara].every((id) => definedPara.has(id)),
    `쓰는 것 ${[...usedPara].join(",")} · 있는 것 ${[...definedPara].join(",")}`,
  );

  for (const [listTag, itemTag] of [
    ["charProperties", "charPr"],
    ["paraProperties", "paraPr"],
  ]) {
    const block = header.match(
      new RegExp(`<hh:${listTag} itemCnt="(\\d+)">([\\s\\S]*?)</hh:${listTag}>`),
    );
    const declared = block ? Number(block[1]) : -1;
    const actual = block ? (block[2].match(new RegExp(`<hh:${itemTag}\\b`, "g")) ?? []).length : -2;
    ok(`${listTag} itemCnt 가 실제와 같다`, declared === actual, `선언 ${declared} · 실제 ${actual}`);
  }
}

ok(
  "HWPX 도 두 번 만들면 바이트가 같다",
  Buffer.from(hwpxBytes).equals(Buffer.from(buildHwpx(richToHwpxDoc(doc, META)))),
);

// ---------------------------------------------------------------------------
console.log("\n[11] 클립보드 HTML — 나가는 길");
// ---------------------------------------------------------------------------

const html = toHtml(doc);
ok("진짜 표를 그린다", html.includes("<table") && html.includes("<td") && html.includes("<th"));
ok("테두리가 인라인 style 로 붙었다", html.includes("border:1px solid"));
ok("굵기는 태그로 나간다", html.includes("<strong>8월 30일</strong>"));
ok("기울임·밑줄·취소선이 태그로 나간다", html.includes("<em>") && html.includes("<u>") && html.includes("<s>"));
ok("위·아래첨자가 태그로 나간다", html.includes("<sup>위</sup>") && html.includes("<sub>아래</sub>"));
ok("형광펜이 배경색으로 나간다", html.includes("background-color:#FFF3DB"));
ok("클래스를 쓰지 않는다", !html.includes(' class="'));
ok("가로 병합이 colspan 으로 나간다", html.includes('colspan="3"'));
ok("꺾쇠가 이스케이프된다", html.includes("&lt;w:t&gt;") && !html.includes("<w:t>"));
ok("홑따옴표는 &#39; 로 나간다", html.includes("&#39;홑&#39;"), html.slice(0, 0));
ok(
  "제어문자가 빠진다",
  !html.includes(String.fromCharCode(7)),
);
ok("쪽 나눔이 인쇄용 CSS 로 나간다", html.includes("page-break-after:always"));
ok(
  "붙여넣기용은 문단마다 글꼴을 적는다",
  (toHtml(doc, { forClipboard: true }).match(/함초롬바탕/g) ?? []).length > 3,
);

// ---------------------------------------------------------------------------
console.log("\n[12] 클립보드 HTML — 되읽기(왕복)");
// ---------------------------------------------------------------------------

/**
 * 아주 작은 HTML 파서.
 *
 * 의존성을 더하지 않기로 한 저장소라 jsdom 을 못 쓴다(README:197). `fromHtml`
 * 이 실제로 쓰는 것은 `nodeType`·`tagName`·`childNodes`·`children`·
 * `getAttribute` 다섯 뿐이라, 그 다섯만 흉내 내면 진짜 왕복을 시험할 수 있다.
 * **브라우저 파서와 같지 않다** — 여기서 통과한다고 브라우저에서 같다는 뜻은
 * 아니고, 확인하는 것은 「fromHtml 의 규칙이 뜻대로 도는가」까지다.
 */
const VOID = new Set(["BR", "HR", "IMG", "COL", "META", "LINK", "INPUT"]);

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function makeEl(tagName, attrs) {
  return {
    nodeType: 1,
    tagName,
    attrs,
    childNodes: [],
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    get children() {
      return this.childNodes.filter((c) => c.nodeType === 1);
    },
  };
}

function parseAttrs(raw) {
  const out = {};
  const re = /([a-zA-Z0-9:_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function parseHtml(html) {
  const root = makeEl("BODY", {});
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9:_-]+)\s*>|<([a-zA-Z0-9:_-]+)((?:"[^"]*"|'[^']*'|[^>])*?)\/?>/g;
  let last = 0;
  let m;
  const addText = (text) => {
    if (text) stack[stack.length - 1].childNodes.push({ nodeType: 3, data: decode(text) });
  };
  while ((m = re.exec(html))) {
    if (m.index > last) addText(html.slice(last, m.index));
    last = re.lastIndex;
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const name = m[1].toUpperCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const name = m[2].toUpperCase();
    const el = makeEl(name, parseAttrs(m[3] ?? ""));
    stack[stack.length - 1].childNodes.push(el);
    if (!VOID.has(name) && !m[0].endsWith("/>")) stack.push(el);
  }
  addText(html.slice(last));
  return root;
}

const back = fromHtml(parseHtml(html));

/**
 * 왕복이 **일부러** 잃는 것 둘.
 *
 *   ① 잇단 공백 — HTML 이 그렇게 정해져 있다. `<p>가  나</p>` 는 브라우저에서도
 *      「가 나」다. 되살리려면 `white-space:pre` 를 걸어야 하는데, 그러면
 *      붙여넣기를 받는 쪽(한/글·워드)에서 줄이 안 접힌다.
 *   ② 제어문자 — 나가는 길에서 esc 가 버린다. 문서 모델은 이것을 들고 있을 수
 *      있지만(DB 에서 그런 값이 올 수 있다), 파일·클립보드로는 내보내지 않는다.
 *
 * 둘 다 **알려진 한계**이므로 비교할 때 양쪽을 같은 규칙으로 눕힌다. 줄바꿈은
 * 문단 경계라 남긴다 — 그것까지 지우면 이 비교가 아무것도 안 보게 된다.
 */
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g;
const flat = (text) => text.replace(CONTROL, "").replace(/ +/g, " ");

ok(
  "잇단 공백은 하나로 접힌다 (HTML 의 규칙)",
  docPlainText(back).includes("]]> 제어문자"),
  JSON.stringify(docPlainText(back).slice(0, 40)),
);
ok(
  "제어문자는 왕복에서 사라진다",
  docPlainText(doc).includes(String.fromCharCode(7)) &&
    !docPlainText(back).includes(String.fromCharCode(7)),
);
ok(
  "왕복해도 평문이 같다 (잇단 공백 제외)",
  flat(docPlainText(back)) === flat(docPlainText(doc)),
  `\n     원본: ${JSON.stringify(docPlainText(doc).slice(0, 120))}\n     왕복: ${JSON.stringify(docPlainText(back).slice(0, 120))}`,
);
ok(
  "왕복해도 갈래가 같다",
  back.blocks.map((b) => b.kind).join(",") === doc.blocks.map((b) => b.kind).join(","),
  `\n     원본: ${doc.blocks.map((b) => b.kind).join(",")}\n     왕복: ${back.blocks.map((b) => b.kind).join(",")}`,
);
ok(
  "왕복해도 들여쓰기가 같다",
  back.blocks.map((b) => b.indent ?? 0).join(",") === doc.blocks.map((b) => b.indent ?? 0).join(","),
);
ok(
  "왕복해도 정렬이 같다",
  back.blocks.map((b) => b.align ?? "-").join(",") === doc.blocks.map((b) => b.align ?? "-").join(","),
  `\n     원본: ${doc.blocks.map((b) => b.align ?? "-").join(",")}\n     왕복: ${back.blocks.map((b) => b.align ?? "-").join(",")}`,
);
{
  const marksOf = (d) =>
    d.blocks
      .flatMap((b) => b.spans)
      .map((s) => `${flat(s.t)}:${(s.m ?? []).join("")}:${s.c ?? "-"}:${s.h ?? "-"}`)
      .join("|");
  ok("왕복해도 글자 서식이 같다", marksOf(back) === marksOf(doc), `\n     원본: ${marksOf(doc)}\n     왕복: ${marksOf(back)}`);
}
{
  const t = back.blocks.find((b) => b.kind === "table")?.table;
  ok("왕복해도 표가 표다", !!t && t.rows.length === 3, JSON.stringify(t?.rows?.length));
  ok("왕복해도 가로 병합이 남는다", t?.rows?.[2]?.cells?.[1]?.colSpan === 3, String(t?.rows?.[2]?.cells?.[1]?.colSpan));
  ok("왕복해도 첫 줄이 칸 이름이다", t?.header === true);
  ok("왕복해도 칸 정렬이 남는다", t?.rows?.[1]?.cells?.[1]?.align === "right", String(t?.rows?.[1]?.cells?.[1]?.align));
  ok("왕복해도 열 너비 비율이 남는다", t?.widths?.join(",") === "1,2,2,2", String(t?.widths));
}

// ---------------------------------------------------------------------------
console.log("\n[13] 한/글·워드가 붙여넣는 쓰레기");
// ---------------------------------------------------------------------------

/** 워드가 실제로 내놓는 모양에 가깝게 만든 것 — o:p · mso- 스타일 · 빈 span 중첩 */
const WORD_JUNK = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word">
<head><style>p.MsoNormal { mso-style-parent:""; }</style></head>
<body lang=KO>
<div class=WordSection1>
  <p class=MsoNormal style='mso-margin-top-alt:auto'>
    <span style='mso-fareast-font-family:함초롬바탕'>협조 요청드립니다.<o:p></o:p></span>
  </p>
  <p class=MsoNormal><o:p>&nbsp;</o:p></p>
  <p class=MsoNormal>
    <span><span><b style='mso-bidi-font-weight:normal'>기한</b></span></span>
    <span style="font-weight:700">엄수</span>
    <span style="font-style:italic">바랍니다</span>
  </p>
  <table class=MsoTableGrid border=1>
    <tr><td><p class=MsoNormal>구분</p></td><td><p class=MsoNormal>내용</p></td></tr>
    <tr><td><p class=MsoNormal>기한</p></td><td><p class=MsoNormal>8월 30일</p></td></tr>
  </table>
  <script>alert(1)</script>
</div>
</body></html>`;

const cleaned = fromHtml(parseHtml(WORD_JUNK));
const cleanedText = docPlainText(cleaned);

ok("o:p 가 사라졌다", !JSON.stringify(cleaned).includes("o:p"));
ok("mso- 스타일이 사라졌다", !JSON.stringify(cleaned).includes("mso-"));
ok("클래스 이름이 사라졌다", !JSON.stringify(cleaned).includes("MsoNormal"));
ok("script 안의 글자가 안 들어왔다", !cleanedText.includes("alert"));
ok("style 안의 글자가 안 들어왔다", !cleanedText.includes("mso-style-parent"));
ok("본문 글자는 살았다", cleanedText.includes("협조 요청드립니다."));
ok(
  "b 태그 굵기가 살았다",
  cleaned.blocks.some((b) => b.spans.some((s) => s.t.includes("기한") && (s.m ?? []).includes("b"))),
);
ok(
  "font-weight:700 도 굵기로 읽는다",
  cleaned.blocks.some((b) => b.spans.some((s) => s.t.includes("엄수") && (s.m ?? []).includes("b"))),
);
ok(
  "font-style:italic 을 기울임으로 읽는다",
  cleaned.blocks.some((b) => b.spans.some((s) => s.t.includes("바랍니다") && (s.m ?? []).includes("i"))),
);
{
  const t = cleaned.blocks.find((b) => b.kind === "table")?.table;
  ok("표가 표로 살았다", !!t && t.rows.length === 2 && t.rows[0].cells.length === 2);
  ok(
    "칸 안의 글자가 제자리다",
    t?.rows?.[1]?.cells?.[1]?.spans?.[0]?.t === "8월 30일",
    JSON.stringify(t?.rows?.[1]?.cells?.[1]?.spans),
  );
}
ok("빈 문단이 빈 줄로 남았다", cleaned.blocks.some((b) => b.kind === "spacer"));
ok("결과가 parseRichDoc 를 지난 값이다", cleaned.v === 1 && cleaned.blocks.every((b) => typeof b.id === "string" && b.id));

// 아무것도 못 건진 HTML 도 편집기가 쓸 수 있는 문서여야 한다.
{
  const empty = fromHtml(parseHtml("<div><script>x</script></div>"));
  ok("건질 것이 없으면 빈 문서를 준다", empty.blocks.length > 0 && empty.v === 1);
}

// ---------------------------------------------------------------------------
console.log("\n[14] 코드리뷰에서 잡힌 것들 — 되풀이 방지");
// ---------------------------------------------------------------------------

/**
 * 아래는 전부 **한 번 실제로 났던 결함**이다. 세 사람이 반증을 시도해 찾았고,
 * 각각을 재현한 뒤에 고쳤다. 여기 적어 두지 않으면 다음 사람이 같은 자리를
 * 같은 이유로 되돌린다 — 특히 「부호가 두 번 붙는 것을 막는다」처럼 **막으려는
 * 것과 부수는 것이 한 줄 차이**인 자리가 그렇다.
 */

let seq = 0;
/** 바이트 뭉치를 풀어 {이름: 글월} 로. */
function open(bytes, tag) {
  seq += 1;
  const file = join(dir, `rv${seq}-${tag}`);
  writeFileSync(file, bytes);
  return unzip(file).data;
}

// --- 짧은 줄(칸이 모자란 행) -------------------------------------------------
//
// 한/글·워드에서 세로 병합된 표를 붙여넣으면 정확히 이 모양이 된다. 격자를
// colCnt 로 선언해 놓고 칸이 없는 자리를 남기면 한/글은 표를 통째로 못 그린다.
{
  const cell = (t) => ({ id: "", spans: t ? [{ t }] : [] });
  const ragged = parseRichDoc({
    v: 1,
    blocks: [
      {
        id: "t",
        kind: "table",
        table: {
          widths: [1, 1, 1],
          header: true,
          rows: [
            { cells: [cell("머리1"), cell("머리2"), cell("머리3")] },
            { cells: [cell("짧은줄1"), cell("짧은줄2")] },
            { cells: [cell("가"), cell("나"), cell("다")] },
          ],
        },
      },
    ],
  });
  ok(
    "모델은 짧은 줄을 그대로 들고 있다(그래서 내보내기가 막아야 한다)",
    ragged.blocks[0].table.rows[1].cells.length === 2,
  );

  const hz = open(buildHwpx(richToHwpxDoc(ragged, META)), "ragged.hwpx");
  const sec = hz["Contents/section0.xml"] ?? "";
  const declared = /<hp:tbl [^>]*colCnt="(\d+)"/.exec(sec);
  const trs = sec.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g) ?? [];
  const colCnt = declared ? Number(declared[1]) : -1;
  ok(
    "HWPX — 줄마다 칸이 먹는 열의 합이 colCnt 와 같다",
    trs.length === 3 &&
      trs.every(
        (tr) =>
          [...tr.matchAll(/colSpan="(\d+)"/g)].reduce((n, m) => n + Number(m[1]), 0) ===
          colCnt,
      ),
    trs
      .map((tr) => [...tr.matchAll(/colSpan="(\d+)"/g)].reduce((n, m) => n + Number(m[1]), 0))
      .join(","),
  );
  ok(
    "HWPX — 줄마다 칸 폭의 합이 본문 폭(48190)과 같다",
    trs.every(
      (tr) =>
        [...tr.matchAll(/<hp:cellSz width="(\d+)"/g)].reduce(
          (n, m) => n + Number(m[1]),
          0,
        ) === 48190,
    ),
  );
  ok(
    "HWPX — 격자에 빠진 자리가 없다(colAddr 이 0..colCnt-1 을 다 덮는다)",
    trs.every((tr) => {
      const at = [...tr.matchAll(/colAddr="(\d+)"/g)].map((m) => Number(m[1]));
      return at.join(",") === [...Array(colCnt).keys()].join(",");
    }),
  );

  const dz = open(buildDocx(ragged, META), "ragged.docx");
  const body = dz["word/document.xml"] ?? "";
  const gridCols = (body.match(/<w:gridCol /g) ?? []).length;
  const wtrs = body.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [];
  ok(
    "DOCX — 줄마다 칸 수가 gridCol 수와 같다",
    wtrs.length === 3 && wtrs.every((tr) => (tr.match(/<w:tc>/g) ?? []).length === gridCols),
    wtrs.map((tr) => (tr.match(/<w:tc>/g) ?? []).length).join(","),
  );
  ok(
    "DOCX — 줄마다 칸 폭의 합이 표 폭(9638)과 같다",
    wtrs.every(
      (tr) =>
        [...tr.matchAll(/<w:tcW w:w="(\d+)"/g)].reduce((n, m) => n + Number(m[1]), 0) ===
        9638,
    ),
  );
  wellFormed("짧은 줄 표의 document.xml", "ragged_document.xml", body);
}

// --- 세로 병합된 표를 붙여넣기 ------------------------------------------------
//
// 도달 경로. rowspan 을 무시하면 아래 줄의 값이 **다른 열**로 밀린다.
{
  const back = fromHtml(
    parseHtml(
      `<table><tr><td rowspan="2">구분</td><td>첫째</td></tr><tr><td>둘째</td></tr></table>`,
    ),
  );
  const rows = back.blocks[0]?.table?.rows ?? [];
  const grid = rows.map((r) => r.cells.map((c) => c.spans.map((s) => s.t).join("")));
  ok("세로 병합이 빈 칸으로 펼쳐진다", JSON.stringify(grid) === '[["구분","첫째"],["","둘째"]]', JSON.stringify(grid));
  ok(
    "펼친 뒤 격자가 네모다",
    rows.length > 0 && new Set(rows.map((r) => r.cells.length)).size === 1,
  );
}

// --- 표 안 칸의 기본 정렬 ------------------------------------------------------
//
// 화면·클립보드 HTML·DOCX 는 「머리줄만 가운데, 본문 칸은 왼쪽」이다. HWPX 만
// 가운데로 그리면 같은 문서가 네 자리에서 달라 보인다.
{
  const cell = (t) => ({ id: "", spans: [{ t }] });
  const plain = parseRichDoc({
    v: 1,
    blocks: [
      {
        id: "t",
        kind: "table",
        table: {
          widths: [1, 1],
          header: true,
          rows: [
            { cells: [cell("구분"), cell("내용")] },
            { cells: [cell("본문칸1"), cell("본문칸2")] },
          ],
        },
      },
    ],
  });
  const hz = open(buildHwpx(richToHwpxDoc(plain, META)), "cellalign.hwpx");
  const sec = hz["Contents/section0.xml"] ?? "";
  const hdr = hz["Contents/header.xml"] ?? "";
  const alignOf = new Map(
    [...hdr.matchAll(/<hh:paraPr id="(\d+)"[\s\S]*?<hh:align horizontal="(\w+)"/g)].map(
      (m) => [m[1], m[2]],
    ),
  );
  const cellAligns = [...sec.matchAll(/<hp:subList[^>]*>\s*<hp:p id="\d+" paraPrIDRef="(\d+)"/g)].map(
    (m) => alignOf.get(m[1]),
  );
  ok(
    "HWPX — 머리줄은 가운데, 본문 칸은 가운데가 아니다",
    cellAligns.length === 4 &&
      cellAligns[0] === "CENTER" &&
      cellAligns[1] === "CENTER" &&
      cellAligns[2] !== "CENTER" &&
      cellAligns[3] !== "CENTER",
    cellAligns.join(","),
  );
  const dz = open(buildDocx(plain, META), "cellalign.docx");
  const jc = [...(dz["word/document.xml"] ?? "").matchAll(/<w:tc>[\s\S]*?<w:jc w:val="(\w+)"/g)].map(
    (m) => m[1],
  );
  ok("DOCX — 같은 표에서 본문 칸이 왼쪽이다", jc.join(",") === "center,center,left,left", jc.join(","));
  const ta = [...toHtml(plain).matchAll(/text-align:(\w+)/g)].map((m) => m[1]);
  ok("HTML — 같은 표에서 본문 칸이 왼쪽이다", ta.join(",") === "center,center,left,left", ta.join(","));
}

// --- 근거·붙임말의 색 ---------------------------------------------------------
{
  const only = parseRichDoc({
    v: 1,
    blocks: [
      { id: "s", kind: "source", spans: [{ t: "근거: 결재 협조란" }] },
      { id: "n", kind: "note", spans: [{ t: "붙임 1부" }] },
    ],
  });
  const dz = open(buildDocx(only, META), "gray.docx");
  ok(
    "DOCX — 근거·붙임말에 회색을 넣지 않는다(HWPX 는 순검정이다)",
    !(dz["word/styles.xml"] ?? "").includes("58616A"),
  );
  const hz = open(buildHwpx(richToHwpxDoc(only, META)), "gray.hwpx");
  const colors = new Set(
    [...(hz["Contents/header.xml"] ?? "").matchAll(/textColor="([^"]+)"/g)].map((m) => m[1]),
  );
  ok("HWPX — 같은 문단이 순검정이다", colors.size === 1 && colors.has("#000000"), [...colors].join(","));
}

// --- 형광펜은 두 파일 **모두** 싣지 않는다 --------------------------------------
//
// 어느 한쪽만 실으면 같은 문서를 두 파일로 내려받았을 때 색칠이 다르다.
// 클립보드 HTML 에만 남는 것은 편집기끼리 오려 붙일 때 표시가 살아 있어야
// 하기 때문이고, 그것은 파일이 아니다. (이 판단을 뒤집으려면 HwpxRun 부터다)
{
  const hi = parseRichDoc({
    v: 1,
    blocks: [{ id: "b", kind: "body", spans: [{ t: "보통 " }, { t: "중요", h: "yellow" }, { t: " 끝" }] }],
  });
  ok("클립보드 HTML 에는 형광펜이 남는다", toHtml(hi).includes("background-color"));
  const dz = open(buildDocx(hi, META), "hl.docx");
  const wbody = dz["word/document.xml"] ?? "";
  ok(
    "DOCX 에는 형광펜이 없다(HWPX 와 같은 판단)",
    !wbody.includes("<w:highlight") && !wbody.includes("<w:shd"),
  );
  const hz = open(buildHwpx(richToHwpxDoc(hi, META)), "hl.hwpx");
  ok(
    "HWPX 에도 형광펜이 없다",
    !/shadeColor="(?!none)/.test(hz["Contents/header.xml"] ?? ""),
  );
}

// --- 모르는 색이 와도 안 터진다 -------------------------------------------------
//
// 라우트는 언제나 parseRichDoc 를 거치지만 buildDocx 는 내보낸 함수다.
// pack.ts 가 같은 자리를 safeColor 로 막아 두었는데 DOCX 만 안 막고 있었다.
{
  const bad = { v: 1, blocks: [{ id: "b", kind: "body", spans: [{ t: "글자", c: 'zzz" w:val="1' }] }] };
  let threw = null;
  let out = null;
  try {
    out = buildDocx(bad, META);
  } catch (e) {
    threw = String(e);
  }
  ok("DOCX — TEXT_COLORS 밖 색이 와도 안 터진다", threw === null, threw ?? "");
  if (out) {
    const dz = open(out, "badcolor.docx");
    const wbody = dz["word/document.xml"] ?? "";
    ok("DOCX — 그 색이 속성으로 새 나가지 않는다", !wbody.includes('w:val="1"'));
    wellFormed("모르는 색이 섞인 document.xml", "badcolor_document.xml", wbody);
  }
  let hwpxThrew = null;
  try {
    buildHwpx({
      title: "t",
      createdAt: META.createdAt,
      paragraphs: [{ kind: "body", text: "글자", runs: [{ text: "글자", color: 'zzz" x="1' }] }],
    });
  } catch (e) {
    hwpxThrew = String(e);
  }
  ok("HWPX — 같은 값에서도 안 터진다", hwpxThrew === null, hwpxThrew ?? "");
}

// --- 파일 이름에 이미 들어 있던 짝 잃은 서로게이트 --------------------------------
//
// 자르는 자리만 막아서는 모자란다. 제목에 처음부터 들어 있으면 자른 적이
// 없어도 라우트의 encodeURIComponent 가 URIError 를 던진다.
{
  const dirty = `보고${"\uD83D"}서`;
  for (const [label, name] of [
    ["docx", docxFileName(dirty)],
    ["hwpx", hwpxFileName(dirty)],
  ]) {
    let err = null;
    try {
      encodeURIComponent(name);
    } catch (e) {
      err = String(e);
    }
    ok(`${label} — 제목에 있던 낱짝이 이름에 남지 않는다`, err === null, `${JSON.stringify(name)} ${err ?? ""}`);
  }
  ok("정상 이모지는 이름에 그대로 남는다", docxFileName("보고😀서") === "보고😀서.docx");
}

// --- 구워 넣은 부호를 걷어내는 자리 ------------------------------------------------
//
// 편집기 안의 복사→붙여넣기가 정확히 fromHtml(toHtml(…)) 이다. 부호 모양을
// 무조건 자르면 사용자 글의 앞이 왕복마다 한 토막씩 뜯긴다.
{
  const round = (d) => fromHtml(parseHtml(toHtml(d, { forClipboard: true })));
  const one = (kind, t) => parseRichDoc({ v: 1, blocks: [{ id: "x", kind, spans: [{ t }] }] });
  const textOf = (d) => d.blocks.map((b) => b.spans.map((s) => s.t).join("")).join("|");

  for (const [kind, t] of [
    ["numbered", "2026. 3. 1. 부터 시행"],
    ["numbered", "1) 항의 뜻으로 쓴 괄호"],
    ["numbered", "3. 1. 절 기념행사"],
    ["bullet", "- 20% 절감"],
    ["bullet", "○ 표시를 글자로 쓴 줄"],
  ]) {
    ok(`왕복해도 「${t}」의 앞이 안 잘린다`, textOf(round(one(kind, t))) === t, textOf(round(one(kind, t))));
  }

  // 되풀이해도 누적되지 않는다 — 예전에는 왕복마다 한 토막씩 없어졌다.
  let d = one("numbered", "1. 2. 3. 순서대로");
  for (let i = 0; i < 3; i += 1) d = round(d);
  ok("세 번 왕복해도 그대로다", textOf(d) === "1. 2. 3. 순서대로", textOf(d));

  // 남의 HTML 도 마찬가지다. `<li>` 의 부호는 브라우저가 그리는 것이라
  // 글자에 없고, 글자에 있는 것은 사람이 친 것이다.
  const foreign = fromHtml(parseHtml("<ol><li>2026. 3. 1. 자 시행</li></ol>"));
  ok("남의 목록에서도 앞이 안 잘린다", textOf(foreign) === "2026. 3. 1. 자 시행", textOf(foreign));

  // 그래도 부호가 두 번 붙지는 않는다 — 나갈 때 구워 넣은 「1. 」은
  // data-marker 토막째로 버려진다.
  const marked = one("numbered", "추진 배경");
  const html = toHtml(marked, { forClipboard: true });
  ok("나갈 때는 부호가 글자로 구워진다", html.includes('data-marker="1"') && html.includes("1. "));
  ok("되읽으면 부호가 글자에 남지 않는다", textOf(round(marked)) === "추진 배경", textOf(round(marked)));

  // `<br>` 로 갈라진 둘째 줄은 첫 줄의 판단을 물려받지 않는다. (우리 toHtml 은
  // `<br>` 를 안 쓰지만, 우리 HTML 이 워드를 한 번 거치면 워드가 넣는다)
  const split = fromHtml(
    parseHtml('<p data-k="numbered"><span data-marker="1">1. </span>첫째<br>2. 둘째</p>'),
  );
  ok(
    "br 로 갈라진 둘째 줄의 「2. 」이 안 잘린다",
    textOf(split) === "첫째|2. 둘째",
    textOf(split),
  );

  // 속성이 날아간 우리 HTML — 부호가 글자로만 남은 경우에는 걷어낸다.
  const stripped = html.replace(/<span data-marker="1">/g, "<span>");
  const rescued = fromHtml(parseHtml(stripped));
  ok(
    "data-marker 가 날아가도 부호는 걷어낸다",
    textOf(rescued) === "추진 배경",
    textOf(rescued),
  );
}

// --- 끝에 붙은 빈 줄 -----------------------------------------------------------
{
  const withTail = parseRichDoc({
    v: 1,
    blocks: [
      { id: "1", kind: "body", spans: [{ t: "본문" }] },
      { id: "2", kind: "spacer", spans: [] },
      { id: "3", kind: "spacer", spans: [] },
      { id: "4", kind: "body", spans: [{ t: "서명란 앞" }] },
      { id: "5", kind: "spacer", spans: [] },
      { id: "6", kind: "spacer", spans: [] },
      { id: "7", kind: "spacer", spans: [] },
    ],
  });
  const back = fromHtml(parseHtml(toHtml(withTail, { forClipboard: true })));
  ok(
    "우리 HTML 이면 끝의 빈 줄은 사람이 친 것이라 남는다",
    back.blocks.map((b) => b.kind).join(",") === withTail.blocks.map((b) => b.kind).join(","),
    back.blocks.map((b) => b.kind).join(","),
  );
  const junk = fromHtml(
    parseHtml("<div><p>본문</p><p>&nbsp;</p><p>&nbsp;</p></div>"),
  );
  ok(
    "남의 HTML 이면 끝의 빈 줄은 붙여넣기가 만든 잡음이라 걷어낸다",
    junk.blocks[junk.blocks.length - 1].kind !== "spacer",
    junk.blocks.map((b) => b.kind).join(","),
  );
}

// --- 칸 안의 표 ---------------------------------------------------------------
{
  const nested = fromHtml(
    parseHtml(
      `<table><tr><td>바깥칸<table><tr><td>안쪽하나</td><td>안쪽둘</td></tr></table></td><td>옆칸</td></tr></table>`,
    ),
  );
  const dump = JSON.stringify(nested);
  ok("칸 안의 표에서도 글자는 살아남는다", dump.includes("안쪽하나") && dump.includes("안쪽둘"), dump.slice(0, 200));
  ok("바깥 칸의 글자도 그대로다", dump.includes("바깥칸") && dump.includes("옆칸"));
}

// --- 제목 줄을 비워 둔 문서 -------------------------------------------------------
//
// docTitle() 은 title 블록이 비면 **첫 글자 있는 블록**을 제목으로 돌려준다.
// emptyDoc() 이 만드는 모양이 정확히 그것이라 아주 흔하게 났다.
{
  const noTitle = parseRichDoc({
    v: 1,
    blocks: [
      { id: "t", kind: "title", spans: [] },
      { id: "b", kind: "body", spans: [{ t: "안건 검토 결과를 아래와 같이 보고합니다" }] },
      { id: "h", kind: "heading", spans: [{ t: "추진 배경" }] },
    ],
  });
  const title = docTitle(noTitle);
  const hz = open(buildHwpx(richToHwpxDoc(noTitle, { ...META, title })), "notitle.hwpx");
  const sec = hz["Contents/section0.xml"] ?? "";
  ok(
    "제목 블록이 비어도 첫 문장이 두 번 찍히지 않는다",
    (sec.match(/안건 검토 결과를 아래와 같이 보고합니다/g) ?? []).length === 1,
    String((sec.match(/안건 검토 결과를 아래와 같이 보고합니다/g) ?? []).length),
  );
  ok(
    "미리보기에도 두 번 들어가지 않는다",
    ((hz["Preview/PrvText.txt"] ?? "").match(/안건 검토 결과/g) ?? []).length === 1,
  );
  ok("뒤 문단은 그대로 남는다", sec.includes("추진 배경"));
}

// --- 제목 안의 부분 서식 ------------------------------------------------------------
{
  const fancy = parseRichDoc({
    v: 1,
    blocks: [
      {
        id: "t",
        kind: "title",
        spans: [{ t: "2026년 " }, { t: "긴급", c: "danger", m: ["u"] }, { t: " 추진계획" }],
      },
      { id: "b", kind: "body", spans: [{ t: "본문" }] },
    ],
  });
  const hz = open(buildHwpx(richToHwpxDoc(fancy, { ...META, title: docTitle(fancy) })), "titlefmt.hwpx");
  const sec = hz["Contents/section0.xml"] ?? "";
  const hdr = hz["Contents/header.xml"] ?? "";
  ok("제목 안의 색이 HWPX 에 남는다", hdr.includes('textColor="#DE3412"'));
  ok("제목 안의 밑줄이 HWPX 에 남는다", hdr.includes("<hh:underline"));
  ok(
    "제목이 세 토막으로 나간다",
    (sec.match(/<hp:t>2026년 <\/hp:t>/g) ?? []).length === 1 &&
      (sec.match(/<hp:t>긴급<\/hp:t>/g) ?? []).length === 1,
  );
  ok("제목이 두 번 찍히지 않는다", (sec.match(/추진계획/g) ?? []).length === 1);
  wellFormed("서식 있는 제목의 section0.xml", "titlefmt_section0.xml", sec);
}

// --- 서식 없는 제목은 참조를 늘리지 않는다 ---------------------------------------
//
// 제목을 토막으로 넘길 수 있게 고치면서 **안 쓴 문서의 바이트가 움직이지
// 않는 것**이 조건이었다. 미리 깔린 여섯 개 안에서 끝나야 한다.
{
  const plain = {
    title: "서식 없는 제목",
    createdAt: META.createdAt,
    paragraphs: [{ kind: "body", text: "본문 한 줄" }],
  };
  const hz = open(buildHwpx(plain), "plaintitle.hwpx");
  const hdr = hz["Contents/header.xml"] ?? "";
  const sec = hz["Contents/section0.xml"] ?? "";
  ok(
    "서식을 안 쓴 문서의 글자모양은 여전히 여섯 개다",
    (hdr.match(/<hh:charPr id="/g) ?? []).length === 6,
    String((hdr.match(/<hh:charPr id="/g) ?? []).length),
  );
  ok("제목 줄이 CHAR.title(2) 하나로 나간다", sec.includes('<hp:run charPrIDRef="2">'));
}

// ---------------------------------------------------------------------------
rmSync(dir, { recursive: true, force: true });

console.log(`\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log(
  "\n⚠ 이 시험은 「워드·한/글에서 열린다」를 증명하지 않습니다. 그 확인은 워드와\n" +
    "  한/글이 있는 컴퓨터에서 한 번 해야 하고, 그때까지 결재 문서의 정본 출력\n" +
    "  경로는 인쇄(A4)입니다.",
);
