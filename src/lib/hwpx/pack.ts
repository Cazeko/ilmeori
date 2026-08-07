/**
 * HWPX 만들기 — ZIP 포장과 OWPML 조립.
 *
 * ── 왜 한 파일인가 ─────────────────────────────────────────────────────────
 *
 * 이 파일은 **바깥을 하나도 부르지 않는다.** `node:zlib` 말고는 import 가 없고,
 * `@/` 별칭도 쓰지 않는다. 그래야 `tests/hwpx.test.mjs` 가 이 파일을 그대로
 * 불러 돌릴 수 있다(Node 22의 타입 벗기기). 시험이 화면을 거쳐야만 닿을 수 있는
 * 코드는 사실상 시험되지 않는다 — 여기가 이 제품에서 **바이트를 직접 쓰는
 * 유일한 자리**라서, 그 자리만은 눈으로 확인할 수 있어야 한다.
 *
 * ── 왜 직접 조립하는가 ─────────────────────────────────────────────────────
 *
 * 계획서(§5.1)는 「한/글로 만든 템플릿을 열어 자리표시자만 치환」이었다.
 * 그 길을 못 갔다 — 이 저장소에는 한/글이 없고, 템플릿 자체를 만들 수 없다.
 * 그래서 OWPML 을 직접 쓴다. 대신 **위험을 그대로 안고 간다**:
 *
 *   · 문단과 표만 쓴다. 그림·수식·글상자·머리말은 한 줄도 만들지 않는다
 *   · 참조(글꼴·글자모양·문단모양·테두리)는 쓰는 것만 정의한다
 *   · itemCnt 는 실제 개수와 반드시 같게 센다 (`countAttr`)
 *
 * ⚠ **실제 한/글에서 열어 본 적이 없다.** 이 저장소는 리눅스 컨테이너이고
 * 한/글이 없다. `npm run test:hwpx` 가 확인하는 것은 「ZIP 이 규격대로인가 ·
 * XML 이 잘 짜였는가 · 글자가 제자리에 들어갔는가」까지다. 계획서 §5.3의
 * 「실제 한/글로 여는 검증」은 **한/글이 있는 자리에서 한 번 해야 한다.**
 * 그때까지 이 제품의 결재 문서 출력 경로는 **인쇄(A4)가 계속 정본**이다
 * (계획서 §5.3의 폴백 조항이 바로 이 상황을 위한 것이다).
 *
 * ── 규격 ───────────────────────────────────────────────────────────────────
 *
 *   HWPX = OWPML 문서들을 OCF(ODF·EPUB 와 같은 계열)로 묶은 ZIP
 *
 *     mimetype                 ← 무압축(stored)으로 **맨 앞**에. 규격이 정한다
 *     version.xml
 *     META-INF/container.xml
 *     META-INF/manifest.xml
 *     Contents/content.hpf     ← 꾸러미 목차(OPF)
 *     Contents/header.xml      ← 글꼴·글자모양·문단모양 같은 참조 목록
 *     Contents/section0.xml    ← 실제 내용
 *     Preview/PrvText.txt      ← 미리보기 글월
 *
 * 길이 단위는 HWPUNIT = 1/7200 인치다. 글자 크기(charPr@height)만 1/100 pt 다.
 */

import { deflateRawSync } from "node:zlib";

// ===========================================================================
// 1. 화면이 넘겨주는 모양
// ===========================================================================

/** 표 한 칸. 세로 병합은 쓰지 않는다 — 없어도 그릴 수 있게 표를 설계했다. */
export type HwpxCell = {
  text: string;
  bold?: boolean;
  align?: "left" | "center";
  /** 가로로 몇 칸을 먹는가. 기본 1 */
  colSpan?: number;
};

export type HwpxRow = { cells: HwpxCell[] };

export type HwpxTable = {
  /** 열 너비 비율. 합이 얼마든 정규화한다. */
  widths: number[];
  rows: HwpxRow[];
};

/**
 * 문단 한 줄.
 *
 * `source` 가 이 제품의 주장이 실리는 자리다 — 문단마다 어느 기록에서 나왔는지.
 * 종이(print-sheet.tsx)에서는 맨 아래에 한 번 모아 적지만, 한/글 파일은
 * **온나라에 올라가는 문서 자체**라 문단 옆에 그대로 붙여 보낸다.
 */
export type HwpxParagraph =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "body"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "source"; text: string }
  | { kind: "note"; text: string }
  | { kind: "spacer" }
  | { kind: "table"; table: HwpxTable };

export type HwpxDoc = {
  /** 파일 메타의 제목. 한/글 문서 정보에 그대로 뜬다. */
  title: string;
  paragraphs: HwpxParagraph[];
  /**
   * 문서에 찍히는 시각. ZIP 의 항목 시각도 이 값으로 맞춘다 —
   * 같은 문서를 두 번 내려받으면 바이트까지 같아야 한다.
   * 그래야 「내가 받은 파일이 그때 그 파일인가」를 해시로 답할 수 있다.
   */
  createdAt: Date;
};

// ===========================================================================
// 2. ZIP
//
// 라이브러리를 넣지 않는다. 필요한 것은 STORED 와 DEFLATE 둘뿐이고,
// `node:zlib` 에 이미 있다. 의존성 하나가 늘면 그 하나가 배포에 실려 나간다.
// ===========================================================================

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

type ZipEntry = {
  name: string;
  data: Uint8Array;
  /** 압축하지 않고 그대로 넣는다. mimetype 은 규격이 그렇게 정한다. */
  store?: boolean;
};

/**
 * DOS 시각.
 *
 * ZIP 은 1980년 이전을 담지 못하고, 초는 2초 단위다. 시간대는 **로컬 시각**으로
 * 적게 되어 있는데, 서버가 UTC 로 돌면 파일 시각이 아홉 시간 어긋난다.
 * 문서에 찍히는 시각은 어차피 본문에 한국 시각으로 들어가므로, 여기서는
 * **어느 서버에서 만들어도 같은 값**이 나오도록 UTC 로 고정한다.
 */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time:
      (d.getUTCHours() << 11) |
      (d.getUTCMinutes() << 5) |
      (Math.floor(d.getUTCSeconds() / 2) & 0x1f),
    date:
      ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function ascii(s: string): Uint8Array {
  // 항목 이름은 전부 ASCII 다(아래 buildHwpx 가 그런 이름만 쓴다).
  // 한글 이름이 섞이면 UTF-8 플래그를 세워야 하므로, 애초에 안 쓴다.
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) throw new Error(`ZIP 항목 이름에 ASCII 밖 글자: ${s}`);
    out[i] = c;
  }
  return out;
}

function zip(entries: ZipEntry[], modified: Date): Uint8Array {
  const { time, date } = dosDateTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = ascii(entry.name);
    const raw = entry.data;
    const stored = entry.store === true;
    const body = stored ? raw : new Uint8Array(deflateRawSync(raw, { level: 9 }));
    const sum = crc32(raw);

    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // 지역 헤더 서명
    lv.setUint16(4, stored ? 10 : 20, true); // 풀려면 필요한 판
    lv.setUint16(6, 0, true); // 플래그 — 이름이 ASCII 라 0
    lv.setUint16(8, stored ? 0 : 8, true); // 0 = 그대로, 8 = deflate
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra 없음
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // 만든 판
    cv.setUint16(6, stored ? 10 : 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, stored ? 0 : 8, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // 주석
    cv.setUint16(34, 0, true); // 디스크 번호
    cv.setUint16(36, 0, true); // 내부 속성
    cv.setUint32(38, 0, true); // 외부 속성
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total =
    locals.reduce((n, l) => n + l.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ===========================================================================
// 3. XML
// ===========================================================================

const utf8 = new TextEncoder();

/**
 * XML 에 넣을 수 있는 글자만 남긴다.
 *
 * 대화·문서 본문이 그대로 흘러 들어오는 자리다. `<`·`&` 를 안 막으면 한/글이
 * 파일을 통째로 못 여는 것으로 끝나고(우리 손해), 제어문자가 섞이면 XML 1.0 이
 * 아예 허용하지 않아 **잘 짜인 XML 이 아니게 된다.**
 * 탭·줄바꿈은 문단을 나눌 때 이미 걷어내므로 여기서는 공백으로 눕힌다.
 */
export function esc(text: string): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c === 0x09 || c === 0x0a || c === 0x0d) {
      out += " ";
      continue;
    }
    // XML 1.0 이 금지하는 것: C0 제어문자, 서로게이트 낱짝, 0xFFFE·0xFFFF
    //
    // 낱짝(lone surrogate)을 실제로 검사한다. `for...of` 는 코드포인트 단위라
    // 정상 이모지는 여기 안 걸리고(codePointAt >= 0x10000), 짝을 잃은 것만
    // 0xD800~0xDFFF 로 들어온다. 안 거르면 TextEncoder 가 U+FFFD(�)로 바꿔
    // **인용 끝에 물음표 마름모가 붙은 채로** 결재 문서에 실린다.
    if (
      c < 0x20 ||
      (c >= 0x7f && c <= 0x9f) ||
      (c >= 0xd800 && c <= 0xdfff) ||
      c === 0xfffe ||
      c === 0xffff
    ) {
      continue;
    }
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (ch === "'") out += "&apos;";
    else out += ch;
  }
  return out;
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** itemCnt 를 손으로 적지 않는다. 실제 개수와 어긋나면 한/글이 참조를 잃는다. */
function countAttr(items: readonly string[]): string {
  return String(items.length);
}

// ===========================================================================
// 4. 참조 목록 — Contents/header.xml
//
// 여기에 정의한 것만 본문에서 쓸 수 있다. 쓰지 않는 것은 정의하지 않는다.
//
//   글자모양(charPr)   0 본문 10pt · 1 굵게 10pt · 2 제목 16pt 굵게
//                     3 잔글씨 9pt · 4 잔글씨 굵게 9pt · 5 항목제목 11.5pt 굵게
//   문단모양(paraPr)   0 본문 · 1 가운데 · 2 들여쓰기(근거) · 3 표 안
//   테두리(borderFill) 1 없음 · 2 실선(표)
// ===========================================================================

const FONT_LANGS = [
  "HANGUL",
  "LATIN",
  "HANJA",
  "JAPANESE",
  "OTHER",
  "SYMBOL",
  "USER",
] as const;

/**
 * 함초롬바탕 — 한/글이 기본으로 들고 있는 글꼴이다.
 *
 * Pretendard 를 심지 않는다. 글꼴을 파일에 끼워 넣으려면 바이너리를 담아야 하고,
 * 담지 않은 채 이름만 적으면 그 글꼴이 없는 컴퓨터에서 한/글이 제멋대로 바꾼다.
 * 공문서는 어느 자리에서 열어도 같은 모양이어야 한다.
 */
const FONT = "함초롬바탕";

function fontfaces(): string {
  const items = FONT_LANGS.map(
    (lang) =>
      `<hh:fontface lang="${lang}" fontCnt="1">` +
      `<hh:font id="0" face="${FONT}" type="TTF" isEmbedded="0">` +
      `<hh:typeInfo familyType="FCAT_MYUNGJO" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>` +
      `</hh:font></hh:fontface>`,
  );
  return `<hh:fontfaces itemCnt="${countAttr(items)}">${items.join("")}</hh:fontfaces>`;
}

function border(tag: string, type: "NONE" | "SOLID"): string {
  return `<hh:${tag} type="${type}" width="0.12 mm" color="#000000"/>`;
}

function borderFills(): string {
  const none =
    `<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    `<hh:slash type="NONE" Crooked="0" isCounter="0"/>` +
    `<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    border("leftBorder", "NONE") +
    border("rightBorder", "NONE") +
    border("topBorder", "NONE") +
    border("bottomBorder", "NONE") +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` +
    `</hh:borderFill>`;
  const solid =
    `<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    `<hh:slash type="NONE" Crooked="0" isCounter="0"/>` +
    `<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    border("leftBorder", "SOLID") +
    border("rightBorder", "SOLID") +
    border("topBorder", "SOLID") +
    border("bottomBorder", "SOLID") +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` +
    `</hh:borderFill>`;
  const items = [none, solid];
  return `<hh:borderFills itemCnt="${countAttr(items)}">${items.join("")}</hh:borderFills>`;
}

/** 글자 크기는 1/100 pt 다. 10pt = 1000. */
function charPr(id: number, height: number, bold: boolean): string {
  const langAttrs = (v: number | string) =>
    `hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"`;
  return (
    `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
    `<hh:fontRef ${langAttrs(0)}/>` +
    `<hh:ratio ${langAttrs(100)}/>` +
    `<hh:spacing ${langAttrs(0)}/>` +
    `<hh:relSz ${langAttrs(100)}/>` +
    `<hh:offset ${langAttrs(0)}/>` +
    (bold ? `<hh:bold/>` : "") +
    `</hh:charPr>`
  );
}

/** 본문 · 굵게 · 제목 · 잔글씨 · 잔글씨 굵게 · 항목제목 */
export const CHAR = {
  body: 0,
  bold: 1,
  title: 2,
  small: 3,
  smallBold: 4,
  heading: 5,
} as const;

function charProperties(): string {
  const items = [
    charPr(CHAR.body, 1000, false),
    charPr(CHAR.bold, 1000, true),
    charPr(CHAR.title, 1600, true),
    charPr(CHAR.small, 900, false),
    charPr(CHAR.smallBold, 900, true),
    charPr(CHAR.heading, 1150, true),
  ];
  return `<hh:charProperties itemCnt="${countAttr(items)}">${items.join("")}</hh:charProperties>`;
}

/** 본문 · 가운데 · 들여쓰기(근거) · 표 안 */
export const PARA = { body: 0, center: 1, indent: 2, cell: 3 } as const;

function paraPr(
  id: number,
  align: "LEFT" | "CENTER" | "JUSTIFY",
  leftMargin: number,
  lineSpacing: number,
): string {
  return (
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
    `<hh:align horizontal="${align}" vertical="BASELINE"/>` +
    `<hh:heading type="NONE" idRef="0" level="0"/>` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
    `<hh:margin>` +
    `<hc:intent value="0" unit="HWPUNIT"/>` +
    `<hc:left value="${leftMargin}" unit="HWPUNIT"/>` +
    `<hc:right value="0" unit="HWPUNIT"/>` +
    `<hc:prev value="0" unit="HWPUNIT"/>` +
    `<hc:next value="0" unit="HWPUNIT"/>` +
    `</hh:margin>` +
    `<hh:lineSpacing type="PERCENT" value="${lineSpacing}" unit="HWPUNIT"/>` +
    `<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` +
    `</hh:paraPr>`
  );
}

function paraProperties(): string {
  const items = [
    paraPr(PARA.body, "JUSTIFY", 0, 160),
    paraPr(PARA.center, "CENTER", 0, 160),
    // 근거 꼬리표는 본문보다 한 칸 들어간다. 2mm ≈ 567 HWPUNIT 의 세 배.
    paraPr(PARA.indent, "JUSTIFY", 1700, 150),
    paraPr(PARA.cell, "CENTER", 0, 140),
  ];
  return `<hh:paraProperties itemCnt="${countAttr(items)}">${items.join("")}</hh:paraProperties>`;
}

/**
 * 개요 번호.
 *
 * 우리는 개요를 쓰지 않지만(항목 번호는 글자로 적는다 — 「1-가.」는 서식이
 * 정한 이름이지 자동 번호가 아니다), 구역(secPr)이 outlineShapeIDRef 로
 * 하나를 가리키게 되어 있어 빈 채로 둘 수 없다.
 */
function numberings(): string {
  const heads = Array.from(
    { length: 7 },
    (_, i) =>
      `<hh:paraHead start="1" level="${i + 1}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^${i + 1}.</hh:paraHead>`,
  ).join("");
  return `<hh:numberings itemCnt="1"><hh:numbering id="1" start="1">${heads}</hh:numbering></hh:numberings>`;
}

function headerXml(): Uint8Array {
  const xml =
    XML_DECL +
    `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1">` +
    `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>` +
    `<hh:refList>` +
    fontfaces() +
    borderFills() +
    charProperties() +
    `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>` +
    numberings() +
    paraProperties() +
    `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>` +
    `</hh:refList>` +
    `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>` +
    `</hh:head>`;
  return utf8.encode(xml);
}

// ===========================================================================
// 5. 본문 — Contents/section0.xml
// ===========================================================================

/** A4 세로. HWPUNIT = 1/7200 인치 (210mm × 297mm) */
const PAGE_WIDTH = 59528;
const PAGE_HEIGHT = 84188;
const MARGIN_SIDE = 5669; // 20mm
const MARGIN_TOP = 5669; // 20mm
const MARGIN_BOTTOM = 4252; // 15mm
/** 글이 실제로 놓이는 폭. 표 너비를 이 값에서 나눈다. */
const TEXT_WIDTH = PAGE_WIDTH - MARGIN_SIDE * 2; // 48190

/** 한 줄 높이(10pt) + 칸 안쪽 여백. 한/글이 다시 계산하지만 비워 둘 수는 없다. */
const CELL_MARGIN = { left: 510, right: 510, top: 141, bottom: 141 } as const;
const ROW_HEIGHT = 1400;

function secPr(): string {
  const pageBorder = (type: "BOTH" | "EVEN" | "ODD") =>
    `<hp:pageBorderFill type="${type}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">` +
    `<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>` +
    `</hp:pageBorderFill>`;

  return (
    `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
    `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0" strtnum="0"/>` +
    `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
    `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
    `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>` +
    // landscape 는 「좁게(세로)/넓게(가로)」다. A4 세로이므로 NARROWLY.
    `<hp:pagePr landscape="NARROWLY" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" gutterType="LEFT_ONLY">` +
    `<hp:margin header="4252" footer="4252" gutter="0" left="${MARGIN_SIDE}" right="${MARGIN_SIDE}" top="${MARGIN_TOP}" bottom="${MARGIN_BOTTOM}"/>` +
    `</hp:pagePr>` +
    `<hp:footNotePr>` +
    `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
    `<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>` +
    `<hp:noteSpacing betweenNotes="850" belowLine="567" aboveLine="567"/>` +
    `<hp:numbering type="CONTINUOUS" newNum="1"/>` +
    `<hp:placement place="EACH_COLUMN" beneathText="0"/>` +
    `</hp:footNotePr>` +
    `<hp:endNotePr>` +
    `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
    `<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>` +
    `<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>` +
    `<hp:numbering type="CONTINUOUS" newNum="1"/>` +
    `<hp:placement place="END_OF_DOCUMENT" beneathText="0"/>` +
    `</hp:endNotePr>` +
    pageBorder("BOTH") +
    pageBorder("EVEN") +
    pageBorder("ODD") +
    `</hp:secPr>`
  );
}

/**
 * 줄 정보.
 *
 * 한/글은 파일을 열면서 배치를 다시 계산하지만, 이 요소가 아예 없는 문단을
 * 만나면 판에 따라 문단을 통째로 건너뛴다. 한 줄짜리로라도 넣어 둔다.
 */
function lineseg(width: number, charHeight: number): string {
  return (
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${charHeight}" textheight="${charHeight}" baseline="${Math.round(charHeight * 0.85)}" spacing="${Math.round(charHeight * 0.6)}" horzpos="0" horzsize="${width}" flags="393216"/></hp:linesegarray>`
  );
}

let paraId = 0;
function nextParaId(): number {
  paraId += 1;
  return paraId;
}

function charHeightOf(charPrId: number): number {
  switch (charPrId) {
    case CHAR.title:
      return 1600;
    case CHAR.heading:
      return 1150;
    case CHAR.small:
    case CHAR.smallBold:
      return 900;
    default:
      return 1000;
  }
}

/** 문단 하나. inner 는 run 안에 들어갈 것(글자 또는 표). */
function para(
  paraPrId: number,
  charPrId: number,
  inner: string,
  width: number,
): string {
  return (
    `<hp:p id="${nextParaId()}" paraPrIDRef="${paraPrId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${charPrId}">${inner}</hp:run>` +
    lineseg(width, charHeightOf(charPrId)) +
    `</hp:p>`
  );
}

function textPara(
  paraPrId: number,
  charPrId: number,
  text: string,
  width = TEXT_WIDTH,
): string {
  return para(paraPrId, charPrId, `<hp:t>${esc(text)}</hp:t>`, width);
}

/**
 * 표.
 *
 * 세로 병합(rowSpan)은 만들지 않는다. cellAddr 를 병합에 맞춰 어긋나게 적는
 * 순간 한/글이 표를 못 그리는데, 우리 서식은 세로 병합 없이도 전부 그릴 수 있다.
 * 가로 병합(colSpan)만 쓴다 — 협조란 한 줄이 그것을 필요로 한다.
 */
function tableXml(table: HwpxTable): string {
  const totalRatio = table.widths.reduce((n, w) => n + w, 0) || 1;
  const colWidths = table.widths.map((w) =>
    Math.max(1, Math.round((w / totalRatio) * TEXT_WIDTH)),
  );
  // 반올림 오차를 마지막 열이 흡수한다. 합이 본문 폭과 어긋나면 표가 삐져나간다.
  const drift = TEXT_WIDTH - colWidths.reduce((n, w) => n + w, 0);
  colWidths[colWidths.length - 1] += drift;

  const colCnt = colWidths.length;
  const rowCnt = table.rows.length;
  const height = ROW_HEIGHT * rowCnt;

  const rows = table.rows
    .map((row, rowAddr) => {
      let colAddr = 0;
      const cells = row.cells
        .map((cell) => {
          const span = Math.max(1, Math.min(cell.colSpan ?? 1, colCnt - colAddr));
          const width = colWidths
            .slice(colAddr, colAddr + span)
            .reduce((n, w) => n + w, 0);
          const inner = width - CELL_MARGIN.left - CELL_MARGIN.right;
          const cp = cell.bold ? CHAR.bold : CHAR.body;
          const pp = (cell.align ?? "center") === "center" ? PARA.cell : PARA.body;
          const body = textPara(pp, cp, cell.text, Math.max(1, inner));
          const at = colAddr;
          colAddr += span;
          return (
            `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">` +
            `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
            body +
            `</hp:subList>` +
            `<hp:cellAddr colAddr="${at}" rowAddr="${rowAddr}"/>` +
            `<hp:cellSpan colSpan="${span}" rowSpan="1"/>` +
            `<hp:cellSz width="${width}" height="${ROW_HEIGHT}"/>` +
            `<hp:cellMargin left="${CELL_MARGIN.left}" right="${CELL_MARGIN.right}" top="${CELL_MARGIN.top}" bottom="${CELL_MARGIN.bottom}"/>` +
            `</hp:tc>`
          );
        })
        .join("");
      return `<hp:tr>${cells}</hp:tr>`;
    })
    .join("");

  const tbl =
    `<hp:tbl id="${nextParaId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="2" noAdjust="0">` +
    `<hp:sz width="${TEXT_WIDTH}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:inMargin left="${CELL_MARGIN.left}" right="${CELL_MARGIN.right}" top="${CELL_MARGIN.top}" bottom="${CELL_MARGIN.bottom}"/>` +
    rows +
    `</hp:tbl>`;

  return para(PARA.body, CHAR.body, tbl, TEXT_WIDTH);
}

function sectionXml(doc: HwpxDoc): Uint8Array {
  paraId = 0;

  const parts: string[] = [];
  // 첫 문단이 구역 설정을 들고 간다. 규격이 그렇게 정한다.
  parts.push(
    `<hp:p id="${nextParaId()}" paraPrIDRef="${PARA.center}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
      `<hp:run charPrIDRef="${CHAR.title}">${secPr()}<hp:t>${esc(doc.title)}</hp:t></hp:run>` +
      lineseg(TEXT_WIDTH, charHeightOf(CHAR.title)) +
      `</hp:p>`,
  );

  for (const p of doc.paragraphs) {
    switch (p.kind) {
      case "title":
        parts.push(textPara(PARA.center, CHAR.title, p.text));
        break;
      case "heading":
        parts.push(textPara(PARA.body, CHAR.heading, p.text));
        break;
      case "body":
        parts.push(textPara(PARA.body, CHAR.body, p.text));
        break;
      case "bullet":
        parts.push(textPara(PARA.indent, CHAR.body, p.text));
        break;
      case "source":
        parts.push(textPara(PARA.indent, CHAR.small, p.text));
        break;
      case "note":
        parts.push(textPara(PARA.body, CHAR.small, p.text));
        break;
      case "spacer":
        parts.push(textPara(PARA.body, CHAR.body, ""));
        break;
      case "table":
        parts.push(tableXml(p.table));
        break;
    }
  }

  const xml =
    XML_DECL +
    `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">` +
    parts.join("") +
    `</hs:sec>`;
  return utf8.encode(xml);
}

// ===========================================================================
// 6. 꾸러미
// ===========================================================================

/** 한/글 문서 정보에 뜨는 시각. 「2026-08-08T14:32:00」 모양이어야 한다. */
function hpfDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}

function contentHpf(doc: HwpxDoc): Uint8Array {
  const items = [
    ["header", "Contents/header.xml"],
    ["section0", "Contents/section0.xml"],
  ] as const;
  const xml =
    XML_DECL +
    `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id="">` +
    `<opf:metadata>` +
    `<opf:title>${esc(doc.title)}</opf:title>` +
    `<opf:language>ko</opf:language>` +
    `<opf:meta name="creator" content="일머리"/>` +
    `<opf:meta name="CreatedDate" content="${hpfDate(doc.createdAt)}"/>` +
    `<opf:meta name="ModifiedDate" content="${hpfDate(doc.createdAt)}"/>` +
    `</opf:metadata>` +
    `<opf:manifest>` +
    items
      .map(
        ([id, href]) =>
          `<opf:item id="${id}" href="${href}" media-type="application/xml"/>`,
      )
      .join("") +
    `</opf:manifest>` +
    `<opf:spine>` +
    items.map(([id]) => `<opf:itemref idref="${id}" linear="yes"/>`).join("") +
    `</opf:spine>` +
    `</opf:package>`;
  return utf8.encode(xml);
}

function containerXml(): Uint8Array {
  const xml =
    XML_DECL +
    `<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">` +
    `<ocf:rootfiles>` +
    `<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>` +
    `<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>` +
    `</ocf:rootfiles>` +
    `</ocf:container>`;
  return utf8.encode(xml);
}

function manifestXml(names: readonly string[]): Uint8Array {
  const xml =
    XML_DECL +
    `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" version="1.2">` +
    names
      .map(
        (n) =>
          `<odf:file-entry full-path="${n}" media-type="${
            n.endsWith(".xml") || n.endsWith(".hpf")
              ? "application/xml"
              : "text/plain"
          }"/>`,
      )
      .join("") +
    `</odf:manifest>`;
  return utf8.encode(xml);
}

function versionXml(): Uint8Array {
  const xml =
    XML_DECL +
    `<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="0" os="1" xmlVersion="1.4" application="Ilmeori" appVersion="1.0"/>`;
  return utf8.encode(xml);
}

/**
 * 미리보기 글월.
 *
 * 탐색기·한/글 열기 창이 이 글자를 보여 준다. 결재 문서는 제목만으로도
 * 무엇인지 알아야 하는 물건이라, 앞머리 몇 줄을 그대로 담는다.
 */
function previewText(doc: HwpxDoc): Uint8Array {
  const lines: string[] = [doc.title];
  for (const p of doc.paragraphs) {
    if (lines.length >= 20) break;
    if (p.kind === "table" || p.kind === "spacer") continue;
    if (p.text.trim()) lines.push(p.text.trim());
  }
  // 여기도 코드포인트로 자른다. 반쪽 남은 서로게이트는 U+FFFD 로 바뀌어
  // 탐색기 미리보기 끝에 마름모가 붙는다(hwpxFileName 과 같은 이유).
  return utf8.encode([...lines.join("\n")].slice(0, 2000).join(""));
}

/**
 * HWPX 한 벌을 바이트로.
 *
 * mimetype 이 **맨 앞에 무압축으로** 들어가는 것이 규격의 요구다(ODF·EPUB 과
 * 같다). 파일 앞 30바이트만 읽고도 무엇인지 알 수 있어야 하기 때문이고,
 * 압축해 넣으면 그 판정이 깨진다.
 */
export function buildHwpx(doc: HwpxDoc): Uint8Array {
  const contents: Array<[string, Uint8Array]> = [
    ["version.xml", versionXml()],
    ["Contents/header.xml", headerXml()],
    ["Contents/section0.xml", sectionXml(doc)],
    ["Contents/content.hpf", contentHpf(doc)],
    ["Preview/PrvText.txt", previewText(doc)],
  ];

  const entries: ZipEntry[] = [
    { name: "mimetype", data: utf8.encode("application/hwp+zip"), store: true },
    { name: "META-INF/container.xml", data: containerXml() },
    {
      name: "META-INF/manifest.xml",
      data: manifestXml(contents.map(([n]) => n)),
    },
    ...contents.map(([name, data]) => ({ name, data })),
  ];

  return zip(entries, doc.createdAt);
}

/**
 * 내려받는 파일 이름.
 *
 * 한/글 파일 이름에 쓸 수 없는 글자와, 경로로 읽힐 수 있는 글자를 걷어낸다.
 * 제목이 통째로 사라질 수도 있으므로(기호만으로 된 제목) 빈 이름은 막는다.
 *
 * 제어문자를 **이스케이프로** 적는다. 원시 바이트로 박아 두면 편집기·git diff·
 * grep 에는 다른 정규식으로 보이는데 실제로 도는 것은 그것이 아니다 — 이 파일이
 * 스스로 「눈으로 확인할 수 있어야 한다」고 적은 자리에서 그건 사고다.
 * (실제로 한 번 그렇게 들어갔고 코드리뷰에서 잡혔다. grep 이 이 파일을
 *  바이너리로 취급해 파일 전체가 검색에서 빠져 있었다)
 */
export function hwpxFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 코드포인트로 자른다. `slice` 는 UTF-16 **코드 단위**라, 80번째 자리에
  // 보조평면 글자(이모지 등)가 걸치면 결과가 **짝 잃은 서로게이트**로 끝난다.
  // 그 값은 route.ts 의 encodeURIComponent 에서 URIError 를 던지고, 그 예외를
  // 잡는 층이 없어 내려받기가 500 으로 죽는다. 화면은 링크를 멀쩡히 그리므로
  // 「있다고 했는데 안 된다」가 된다.
  const cut = [...safe].slice(0, 80).join("");
  return `${cut || "결재문서"}.hwpx`;
}
