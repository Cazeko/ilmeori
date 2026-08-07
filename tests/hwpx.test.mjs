/**
 * HWPX 시험 — 바이트를 직접 쓰는 유일한 자리를 눈으로 확인한다.
 *
 * ⚠ **이 시험은 「한/글에서 열린다」를 증명하지 않는다.** 그건 한/글이 있는
 * 컴퓨터에서 사람이 한 번 열어 봐야만 안다(계획서 §5.3). 여기서 보는 것은
 * 그 앞의 단계다 — 규격대로 된 ZIP 인가, XML 이 잘 짜였는가, 넣은 글자가
 * 제자리에 들어갔는가, 그리고 **본문에 섞인 `<`·`&` 가 파일을 깨뜨리지 않는가.**
 *
 * 이 셋이 통과한다고 한/글이 연다는 보장은 없지만, 셋 중 하나라도 깨지면
 * 한/글은 **반드시** 못 연다. 그래서 여기까지는 기계가 지킨다.
 *
 * 돌리는 법
 *   npm run test:hwpx
 *
 * (Node 22 는 .ts 를 그대로 불러 돌린다. src/lib/hwpx/pack.ts 가 바깥을
 *  하나도 부르지 않는 이유가 이것이다 — 그 파일 주석에 적어 두었다)
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { buildHwpx, crc32, esc, hwpxFileName } = await import(
  "../src/lib/hwpx/pack.ts"
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

// ---------------------------------------------------------------------------
// 시험용 문서 — 실제 결재 문서가 담는 것들을 한 벌에 다 넣는다
// ---------------------------------------------------------------------------

const AT = new Date("2026-08-14T05:30:00.000Z");

/** 본문에 그대로 흘러 들어오는 험한 글자들. 대화·문서 본문이 이런 모양일 수 있다. */
const NASTY =
  '깨뜨리기 <hp:t> & "따옴표" \'홑\' ]]> ' + String.fromCharCode(7) + ' 제어문자';

const doc = {
  title: "2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청",
  createdAt: AT,
  paragraphs: [
    { kind: "heading", text: "1. 개요" },
    { kind: "body", text: "원가산정 용역 결과를 협조 요청합니다." },
    { kind: "bullet", text: `· ${NASTY}` },
    { kind: "source", text: "근거: 업무 대화 · 배도현 주무관, 7월 30일" },
    { kind: "spacer" },
    {
      kind: "table",
      table: {
        widths: [1, 2, 2, 2],
        rows: [
          {
            cells: [
              { text: "구분", bold: true },
              { text: "기안", bold: true },
              { text: "결재", bold: true },
              { text: "최종결재", bold: true },
            ],
          },
          {
            cells: [
              { text: "성명" },
              { text: "박준호" },
              { text: "정다은" },
              { text: "한상우" },
            ],
          },
          {
            // 가로 병합 — 협조란 한 줄이 이것을 쓴다
            cells: [{ text: "협조" }, { text: "건축과 박도윤 (의견 있음)", colSpan: 3 }],
          },
        ],
      },
    },
    { kind: "note", text: "이 문서는 「일머리」가 조립했습니다." },
  ],
};

const bytes = buildHwpx(doc);

// ---------------------------------------------------------------------------
console.log("\n[1] ZIP 규격");
// ---------------------------------------------------------------------------

ok("바이트가 나온다", bytes instanceof Uint8Array && bytes.length > 500, `${bytes?.length}B`);
ok(
  "지역 헤더 서명으로 시작한다",
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
);

// mimetype 은 규격상 **맨 앞에 무압축**으로 들어가야 한다(ODF·EPUB 과 같다).
const head = Buffer.from(bytes.subarray(0, 60)).toString("latin1");
ok("첫 항목이 mimetype 이다", head.slice(30, 38) === "mimetype", head.slice(30, 45));
const method = new DataView(bytes.buffer, bytes.byteOffset).getUint16(8, true);
ok("mimetype 이 무압축(STORED)이다", method === 0, `method=${method}`);
ok(
  "mimetype 내용이 application/hwp+zip 이다",
  head.slice(38, 38 + 19) === "application/hwp+zip",
  head.slice(38, 60),
);

// CRC32 는 직접 구현했다. 값이 틀리면 압축 푸는 쪽이 통째로 거절한다.
ok(
  "CRC32 가 규격값과 맞는다",
  crc32(new TextEncoder().encode("123456789")) === 0xcbf43926,
  crc32(new TextEncoder().encode("123456789")).toString(16),
);

// ---------------------------------------------------------------------------
console.log("\n[2] 실제로 풀리는가 (python zipfile)");
// ---------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "ilmeori-hwpx-"));
const file = join(dir, "doc.hwpx");
writeFileSync(file, bytes);

let listing = null;
let readBack = {};
try {
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
  const parsed = JSON.parse(out);
  listing = parsed.names;
  readBack = parsed.data;
  ok("깨진 항목이 없다 (testzip)", parsed.bad === null, String(parsed.bad));
} catch (e) {
  ok("압축을 풀 수 있다", false, String(e.message ?? e).slice(0, 200));
}

const REQUIRED = [
  "mimetype",
  "META-INF/container.xml",
  "META-INF/manifest.xml",
  "version.xml",
  "Contents/header.xml",
  "Contents/section0.xml",
  "Contents/content.hpf",
  "Preview/PrvText.txt",
];
for (const name of REQUIRED) {
  ok(`${name} 이 들어 있다`, (listing ?? []).includes(name));
}
ok(
  "mimetype 이 목록에서도 첫 번째다",
  (listing ?? [])[0] === "mimetype",
  String((listing ?? [])[0]),
);

// ---------------------------------------------------------------------------
console.log("\n[3] XML 이 잘 짜였는가 (xmllint)");
// ---------------------------------------------------------------------------

for (const [name, text] of Object.entries(readBack)) {
  if (!name.endsWith(".xml") && !name.endsWith(".hpf")) continue;
  const path = join(dir, name.replace(/\//g, "_"));
  writeFileSync(path, text);
  try {
    execFileSync("xmllint", ["--noout", path], { stdio: "pipe" });
    ok(`${name} 이 잘 짜인 XML 이다`, true);
  } catch (e) {
    ok(`${name} 이 잘 짜인 XML 이다`, false, String(e.stderr ?? e).slice(0, 300));
  }
}

// ---------------------------------------------------------------------------
console.log("\n[4] 글자가 제자리에 들어갔는가");
// ---------------------------------------------------------------------------

const section = readBack["Contents/section0.xml"] ?? "";
const hpf = readBack["Contents/content.hpf"] ?? "";
const header = readBack["Contents/header.xml"] ?? "";
const preview = readBack["Preview/PrvText.txt"] ?? "";

ok("제목이 본문에 있다", section.includes("음식물류폐기물 대행 원가산정"));
ok("항목 제목이 있다", section.includes("1. 개요"));
ok("근거 꼬리표가 있다", section.includes("근거: 업무 대화 · 배도현 주무관"));
ok("표 안의 이름이 있다", section.includes("박준호") && section.includes("한상우"));
ok("제목이 꾸러미 메타에도 있다", hpf.includes("음식물류폐기물"));
ok("미리보기 글월에 제목이 있다", preview.startsWith("2026년 음식물류폐기물"));

// 험한 글자 — 깨지지 않고 **글자로** 들어가야 한다.
ok(
  "본문의 <hp:t> 가 태그가 아니라 글자로 들어갔다",
  section.includes("&lt;hp:t&gt;"),
);
ok("본문의 & 가 &amp; 로 들어갔다", section.includes("깨뜨리기 &lt;hp:t&gt; &amp;"));
ok(
  "제어문자(U+0007)가 통째로 빠졌다",
  !section.includes(String.fromCharCode(7)) && !section.includes("&#7;"),
);
ok("]]> 가 본문을 끊지 않았다", section.includes("]]&gt;"));
ok(
  "esc 가 홑따옴표·큰따옴표까지 막는다",
  esc(`a"b'c`) === "a&quot;b&apos;c",
  esc(`a"b'c`),
);

// ---------------------------------------------------------------------------
console.log("\n[5] 참조가 실제 개수와 맞는가");
// ---------------------------------------------------------------------------

/** itemCnt 와 실제 개수가 어긋나면 한/글이 참조를 잃는다 — 열려도 서식이 무너진다. */
function countMatches(listTag, itemTag) {
  const block = header.match(
    new RegExp(`<hh:${listTag} itemCnt="(\\d+)">([\\s\\S]*?)</hh:${listTag}>`),
  );
  if (!block) return { declared: -1, actual: -1 };
  const declared = Number(block[1]);
  const actual = (block[2].match(new RegExp(`<hh:${itemTag}\\b`, "g")) ?? []).length;
  return { declared, actual };
}
for (const [listTag, itemTag] of [
  ["fontfaces", "fontface"],
  ["borderFills", "borderFill"],
  ["charProperties", "charPr"],
  ["paraProperties", "paraPr"],
  ["styles", "style"],
]) {
  const { declared, actual } = countMatches(listTag, itemTag);
  ok(`${listTag} itemCnt 가 실제와 같다`, declared === actual && declared > 0, `선언 ${declared} · 실제 ${actual}`);
}

// 본문이 가리키는 참조가 header 에 실제로 있는가.
const usedChar = new Set(
  [...section.matchAll(/charPrIDRef="(\d+)"/g)].map((m) => m[1]),
);
const definedChar = new Set(
  [...header.matchAll(/<hh:charPr id="(\d+)"/g)].map((m) => m[1]),
);
ok(
  "본문이 쓰는 글자모양이 전부 정의돼 있다",
  [...usedChar].every((id) => definedChar.has(id)),
  `쓰는 것 ${[...usedChar].join(",")} · 있는 것 ${[...definedChar].join(",")}`,
);
const usedPara = new Set(
  [...section.matchAll(/paraPrIDRef="(\d+)"/g)].map((m) => m[1]),
);
const definedPara = new Set(
  [...header.matchAll(/<hh:paraPr id="(\d+)"/g)].map((m) => m[1]),
);
ok(
  "본문이 쓰는 문단모양이 전부 정의돼 있다",
  [...usedPara].every((id) => definedPara.has(id)),
  `쓰는 것 ${[...usedPara].join(",")} · 있는 것 ${[...definedPara].join(",")}`,
);
ok(
  "구역이 가리키는 개요번호(outlineShapeIDRef)가 정의돼 있다",
  header.includes('<hh:numbering id="1"'),
);
ok(
  "표 테두리(borderFillIDRef=2)가 정의돼 있다",
  header.includes('<hh:borderFill id="2"'),
);

// ---------------------------------------------------------------------------
console.log("\n[6] 표 — 칸 주소와 병합");
// ---------------------------------------------------------------------------

const tbl = section.match(/<hp:tbl [\s\S]*?<\/hp:tbl>/)?.[0] ?? "";
ok("표가 하나 들어갔다", tbl.length > 0);
ok("행·열 수가 선언돼 있다", /rowCnt="3"/.test(tbl) && /colCnt="4"/.test(tbl));
ok("행이 셋이다", (tbl.match(/<hp:tr>/g) ?? []).length === 3);
ok(
  "가로 병합 칸이 3칸을 먹는다",
  tbl.includes('<hp:cellSpan colSpan="3" rowSpan="1"/>'),
);
// 병합이 있으면 그 뒤 칸의 colAddr 가 어긋나기 쉽다. 행마다 합이 열 수와 같아야 한다.
const rows = tbl.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g) ?? [];
const spanSums = rows.map((r) =>
  [...r.matchAll(/colSpan="(\d+)"/g)].reduce((n, m) => n + Number(m[1]), 0),
);
ok("행마다 칸 너비의 합이 열 수와 같다", spanSums.every((n) => n === 4), spanSums.join(","));
// 칸 폭의 합이 본문 폭과 같아야 표가 종이 밖으로 나가지 않는다.
const firstRow = rows[0] ?? "";
const widths = [...firstRow.matchAll(/<hp:cellSz width="(\d+)"/g)].map((m) =>
  Number(m[1]),
);
ok(
  "칸 폭의 합이 본문 폭(48190)과 같다",
  widths.reduce((n, w) => n + w, 0) === 48190,
  String(widths.reduce((n, w) => n + w, 0)),
);

// ---------------------------------------------------------------------------
console.log("\n[7] 같은 문서는 같은 바이트");
// ---------------------------------------------------------------------------

// 「내가 받은 파일이 그때 그 파일인가」를 해시로 답할 수 있어야 한다.
// ZIP 의 시각 칸에 now() 를 넣으면 그 답이 매번 달라진다.
const again = buildHwpx(doc);
ok(
  "두 번 만들어도 바이트가 같다",
  Buffer.from(bytes).equals(Buffer.from(again)),
  `${bytes.length} vs ${again.length}`,
);

// ---------------------------------------------------------------------------
console.log("\n[8] 파일 이름");
// ---------------------------------------------------------------------------

ok("확장자가 붙는다", hwpxFileName("보고서").endsWith(".hwpx"));
ok(
  "경로로 읽힐 글자가 빠진다",
  !hwpxFileName("../../etc/passwd").includes("/") &&
    !hwpxFileName("..\\x").includes("\\"),
  hwpxFileName("../../etc/passwd"),
);
ok(
  "이름이 통째로 비면 기본 이름을 쓴다",
  hwpxFileName("///").startsWith("결재문서"),
  hwpxFileName("///"),
);
ok(
  "줄바꿈이 이름에 들어가지 않는다",
  !hwpxFileName("가\r\n나").includes("\n"),
  JSON.stringify(hwpxFileName("가\r\n나")),
);
ok(
  "제어문자가 이름에 남지 않는다",
  !/[ --]/.test(
    hwpxFileName(`보고${String.fromCharCode(0)}서${String.fromCharCode(7)}끝`),
  ),
  JSON.stringify(
    hwpxFileName(`보고${String.fromCharCode(0)}서${String.fromCharCode(7)}끝`),
  ),
);

/**
 * 80자 경계에 보조평면 글자가 걸치는 제목.
 *
 * `slice` 로 자르면 결과가 **짝 잃은 서로게이트**로 끝나고, 그 값이
 * route.ts 의 `encodeURIComponent` 에서 `URIError` 를 던진다. 잡는 층이 없어
 * 내려받기가 500 으로 죽는데, 화면은 링크를 멀쩡히 그린다.
 * 79자에서만 터지고 78·80자는 멀쩡해서, 「어떤 결재만 안 받아진다」로 나타난다.
 * 그래서 경계를 하나만 보지 않고 앞뒤로 훑는다.
 */
{
  let bad = null;
  for (let n = 70; n <= 90; n += 1) {
    const name = hwpxFileName(`${"가".repeat(n)}😀보고서`);
    try {
      encodeURIComponent(name);
    } catch {
      bad = n;
      break;
    }
    // 반쪽만 남은 서로게이트가 이름에 남아 있으면 그 자체가 결함이다.
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name)) {
      bad = n;
      break;
    }
  }
  ok(
    "80자 경계에 이모지가 걸쳐도 이름이 안 깨진다",
    bad === null,
    bad === null ? "" : `앞머리 ${bad}자에서 깨짐`,
  );
}
ok(
  "esc 가 짝 잃은 서로게이트를 실제로 거른다",
  esc(`가${String.fromCharCode(0xd83d)}나`) === "가나",
  JSON.stringify(esc(`가${String.fromCharCode(0xd83d)}나`)),
);
ok(
  "정상 이모지는 esc 를 그대로 통과한다",
  esc("가😀나") === "가😀나",
  esc("가😀나"),
);

// ---------------------------------------------------------------------------
rmSync(dir, { recursive: true, force: true });

console.log(`\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log(
  "\n⚠ 이 시험은 「한/글에서 열린다」를 증명하지 않습니다. 한/글이 있는 컴퓨터에서\n" +
    "  한 번 열어 확인해야 하고, 그때까지 결재 문서의 정본 출력 경로는 인쇄(A4)입니다.",
);
