/**
 * HWPX 만들기 — ZIP 포장과 OWPML 조립.
 *
 * ── 부르는 것은 `../zip` 하나뿐이다 ────────────────────────────────────────
 *
 * 이 파일은 오래 **바깥을 하나도 부르지 않았다.** 시험이 화면을 거쳐야만 닿을
 * 수 있는 코드는 사실상 시험되지 않고, 여기가 이 제품에서 **바이트를 직접 쓰는
 * 자리**라서 그 자리만은 눈으로 확인할 수 있어야 했기 때문이다.
 *
 * 그 규칙에 예외를 하나 두었다 — ZIP 포장(`src/lib/zip.ts`). DOCX 내보내기가
 * 같은 ZIP 을 필요로 하는데, 베껴 두면 CRC·헤더를 한쪽에서 고칠 때 다른 쪽이
 * 조용히 옛날 것으로 남는다. **바이트를 쓰는 코드가 두 벌 있는 것이 import
 * 하나보다 위험하다**고 보았다. `@/` 별칭은 여전히 쓰지 않는다.
 *
 * 그래서 시험은 해석 훅을 얹어 돌린다(확장자 없는 상대경로를 풀어 준다):
 *
 *     npm run test:hwpx
 *     = node --import ./tests/alias-hook-register.mjs tests/hwpx.test.mjs
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
 * ✅ **한/글에서 열리는 것을 실물로 확인했다.** 오랫동안 이 자리에는 「실제
 * 한/글에서 열어 본 적이 없다」가 붙어 있었다 — 이 저장소는 리눅스 컨테이너라
 * 한/글이 없고, `npm run test:hwpx` 가 확인하는 것은 「ZIP 이 규격대로인가 ·
 * XML 이 잘 짜였는가 · 글자가 제자리에 들어갔는가」까지이기 때문이다.
 * 계획서 §5.3의 「실제 한/글로 여는 검증」은 한/글이 있는 자리에서 끝냈다
 * (`PRODUCT.md` Evidence on Hand · 내보내기 화면 주석).
 *
 * 인쇄(A4) 폴백은 **그대로 둔다.** 폴백은 「안 열릴까 봐」만이 아니라
 * **「그 자리에 한/글이 없을 수도 있어서」** 있는 것이고, 그건 여전하다.
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

import { zip, crc32, type ZipEntry } from "../zip";

// 기존 시험(tests/hwpx.test.mjs)이 이 이름으로 가져다 쓴다. CRC 는 규격값이
// 있어 시험이 값 하나로 검증할 수 있는 몇 안 되는 자리라, 옮겼다고 해서
// 시험에서 사라지게 두지 않는다.
export { crc32 };

// ===========================================================================
// 1. 화면이 넘겨주는 모양
// ===========================================================================

/** 문단 안에서 정렬을 바꿀 때 쓴다. 갈래마다의 기본값을 덮어쓴다. */
export type HwpxAlign = "left" | "center" | "right" | "justify";

/**
 * 글자 토막 하나 — 문단 **안에서** 서식이 바뀌는 자리.
 *
 * 한 문단이 글자 한 덩어리였을 때는 「이 문단은 굵다」밖에 말할 수 없었다.
 * 결재 본문에는 「기한은 **8월 30일**까지」처럼 한 낱말만 굵은 문장이 흔하고,
 * 그것을 못 옮기면 사람이 한/글에서 다시 칠해야 한다.
 *
 * color 는 `#RRGGBB` 다. 고를 수 있는 값은 부르는 쪽이 닫아 둔다
 * (editor/model.ts 의 TEXT_COLORS — 대비를 재 둔 토큰만 쓴다).
 */
export type HwpxRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  sup?: boolean;
  sub?: boolean;
  color?: string;
};

/** 표 한 칸. 세로 병합은 쓰지 않는다 — 없어도 그릴 수 있게 표를 설계했다. */
export type HwpxCell = {
  text: string;
  bold?: boolean;
  align?: HwpxAlign;
  /** 가로로 몇 칸을 먹는가. 기본 1 */
  colSpan?: number;
  /** 칸 안에서도 서식이 섞일 수 있다. 있으면 text 대신 이것을 쓴다. */
  runs?: HwpxRun[];
};

export type HwpxRow = { cells: HwpxCell[] };

export type HwpxTable = {
  /** 열 너비 비율. 합이 얼마든 정규화한다. */
  widths: number[];
  rows: HwpxRow[];
};

/**
 * 글자를 담는 문단이 함께 받는 것.
 *
 * 셋 다 **선택 항목**이다. 하나도 안 주면 이 파일이 오래 해 오던 것과 똑같이
 * 동작한다 — 그래야 이미 내보낸 결재 문서의 바이트가 그대로 남는다.
 */
type HwpxTextOpts = {
  /** 문단 안의 서식. 있으면 `text` 대신 이것이 본문이 된다. */
  runs?: HwpxRun[];
  /** 갈래의 기본 정렬을 덮어쓴다. */
  align?: HwpxAlign;
  /** 들여쓰기 단계. 갈래의 기본 들여쓰기에 **더한다**. */
  indent?: number;
};

/**
 * 문단 한 줄.
 *
 * `source` 가 이 제품의 주장이 실리는 자리다 — 문단마다 어느 기록에서 나왔는지.
 * 종이(print-sheet.tsx)에서는 맨 아래에 한 번 모아 적지만, 한/글 파일은
 * **온나라에 올라가는 문서 자체**라 문단 옆에 그대로 붙여 보낸다.
 */
export type HwpxParagraph =
  | ({ kind: "title"; text: string } & HwpxTextOpts)
  | ({ kind: "heading"; text: string } & HwpxTextOpts)
  | ({ kind: "subheading"; text: string } & HwpxTextOpts)
  | ({ kind: "body"; text: string } & HwpxTextOpts)
  | ({ kind: "bullet"; text: string } & HwpxTextOpts)
  | ({ kind: "quote"; text: string } & HwpxTextOpts)
  | ({ kind: "source"; text: string } & HwpxTextOpts)
  | ({ kind: "note"; text: string } & HwpxTextOpts)
  | { kind: "spacer" }
  /** 가로줄. 밑줄만 그은 빈 문단으로 흉내 낸다(아래 dividerXml 참조). */
  | { kind: "divider" }
  /** 쪽 나눔. 이 문단부터 새 쪽이다. */
  | { kind: "pagebreak" }
  | { kind: "table"; table: HwpxTable };

/** 글자를 담는 갈래인가. 미리보기·요약이 이 판단을 쓴다. */
type TextParagraph = Extract<HwpxParagraph, { text: string }>;

/** 문단의 평문. runs 가 있으면 그것이 본문이므로 그쪽을 본다. */
function paraPlainText(p: TextParagraph): string {
  if (p.runs && p.runs.length > 0) return p.runs.map((r) => r.text).join("");
  return p.text;
}

export type HwpxDoc = {
  /** 파일 메타의 제목. 한/글 문서 정보에 그대로 뜬다. */
  title: string;
  /**
   * 종이 맨 위에 찍히는 제목의 **서식 있는 모양**.
   *
   * 없으면 `title` 을 평문 한 덩어리로 찍는다(오래 그래 왔고, 그 문서의 바이트가
   * 그대로 남아야 한다). 있으면 이것이 제목 줄의 본문이 된다 — 제목 안의 한
   * 낱말만 붉거나 밑줄인 문서가 실제로 있고, 그것을 못 옮기면 화면·워드와
   * 한/글이 서로 다른 제목을 보여 준다.
   *
   * 굵기는 토막이 끄지 못한다(runChar 참조). 제목은 언제나 굵다.
   */
  titleRuns?: HwpxRun[];
  paragraphs: HwpxParagraph[];
  /**
   * 문서에 찍히는 시각. ZIP 의 항목 시각도 이 값으로 맞춘다 —
   * 같은 문서를 두 번 내려받으면 바이트까지 같아야 한다.
   * 그래야 「내가 받은 파일이 그때 그 파일인가」를 해시로 답할 수 있다.
   */
  createdAt: Date;
};

// ===========================================================================
// 2. XML
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
// 3. 참조 목록 — Contents/header.xml
//
// 여기에 정의한 것만 본문에서 쓸 수 있다. 쓰지 않는 것은 정의하지 않는다.
// 아래 번호는 **미리 깔아 두는 것**이고, 인라인 서식·정렬·들여쓰기가 이 밖의
// 조합을 요구하면 등록부가 6번·4번부터 이어 붙인다(CharRegistry 참조).
//
//   글자모양(charPr)   0 본문 10pt · 1 굵게 10pt · 2 제목 16pt 굵게
//                     3 잔글씨 9pt · 4 잔글씨 굵게 9pt · 5 항목제목 11.5pt 굵게
//   문단모양(paraPr)   0 본문 · 1 가운데 · 2 들여쓰기(근거) · 3 표 안
//   테두리(borderFill) 1 없음 · 2 실선(표)  ← 이것만 고정이다
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

/** 글자모양 한 벌이 정하는 것. 이 조합이 다르면 charPr 도 다른 것이어야 한다. */
type CharSpec = {
  /** 1/100 pt. 10pt = 1000 */
  height: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sup: boolean;
  sub: boolean;
  /** `#RRGGBB` */
  color: string;
};

const BLACK = "#000000";

function baseChar(height: number, bold: boolean): CharSpec {
  return {
    height,
    bold,
    italic: false,
    underline: false,
    strike: false,
    sup: false,
    sub: false,
    color: BLACK,
  };
}

/**
 * 글자 크기는 1/100 pt 다. 10pt = 1000.
 *
 * 자식 요소의 **순서가 규격이 정한 순서**다(fontRef → … → offset → italic →
 * bold → underline → strikeout → supscript → subscript). 순서를 흐트러뜨리면
 * 스키마 검사가 있는 판에서 파일이 통째로 거절된다.
 * ⚠ 이 순서는 문서를 보고 적은 것이고, **실제 한/글로 확인한 적이 없다.**
 *
 * 서식이 하나도 없고 색이 검정이면 결과가 예전(bold 만 있던 시절)과 **글자
 * 하나까지 같다.** 서식을 안 쓴 문서의 바이트가 그대로 남는 것이 그 덕이다.
 */
function charPrXml(id: number, s: CharSpec): string {
  const langAttrs = (v: number | string) =>
    `hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"`;
  return (
    `<hh:charPr id="${id}" height="${s.height}" textColor="${s.color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
    `<hh:fontRef ${langAttrs(0)}/>` +
    `<hh:ratio ${langAttrs(100)}/>` +
    `<hh:spacing ${langAttrs(0)}/>` +
    `<hh:relSz ${langAttrs(100)}/>` +
    `<hh:offset ${langAttrs(0)}/>` +
    (s.italic ? `<hh:italic/>` : "") +
    (s.bold ? `<hh:bold/>` : "") +
    (s.underline
      ? `<hh:underline type="BOTTOM" shape="SOLID" color="${s.color}"/>`
      : "") +
    (s.strike ? `<hh:strikeout shape="SOLID" color="${s.color}"/>` : "") +
    (s.sup ? `<hh:supscript/>` : "") +
    (s.sub ? `<hh:subscript/>` : "") +
    `</hh:charPr>`
  );
}

/**
 * 본문 · 굵게 · 제목 · 잔글씨 · 잔글씨 굵게 · 항목제목.
 *
 * 등록부가 이 여섯을 **이 번호 그대로** 먼저 깔고 시작한다. 바깥(approval-export)
 * 이 이 상수로 문단을 만들어 왔으므로 번호가 움직이면 안 된다.
 */
export const CHAR = {
  body: 0,
  bold: 1,
  title: 2,
  small: 3,
  smallBold: 4,
  heading: 5,
} as const;

const CHAR_SEED: readonly CharSpec[] = [
  baseChar(1000, false), // CHAR.body
  baseChar(1000, true), // CHAR.bold
  baseChar(1600, true), // CHAR.title
  baseChar(900, false), // CHAR.small
  baseChar(900, true), // CHAR.smallBold
  baseChar(1150, true), // CHAR.heading
];

/**
 * 글자모양 등록부 — 필요할 때 만들어 붙인다.
 *
 * 가능한 조합을 미리 다 깔지 않는 이유: 크기 6등급 × 서식 64가지 × 색 여섯이면
 * 참조가 2천 개가 되고, 한/글은 문서를 열 때 그 전부를 읽는다. 문서 하나가
 * 실제로 쓰는 것은 대개 열 개 안쪽이다.
 *
 * 그래서 **section0.xml 을 먼저 조립하며 등록부를 채우고 header.xml 을 나중에
 * 만든다.** buildHwpx 의 순서가 뒤집혀 있는 것이 이 때문이다.
 */
class CharRegistry {
  private readonly items: string[] = [];
  private readonly byKey = new Map<string, number>();

  constructor() {
    for (const spec of CHAR_SEED) this.add(spec);
  }

  id(spec: CharSpec): number {
    const key = charKey(spec);
    const found = this.byKey.get(key);
    if (found !== undefined) return found;
    return this.add(spec);
  }

  /** 미리 깔린 여섯 개 중 하나의 크기. 줄 높이(lineseg)를 잴 때 쓴다. */
  heightOf(id: number): number {
    return CHAR_SEED[id]?.height ?? 1000;
  }

  private add(spec: CharSpec): number {
    const id = this.items.length;
    this.byKey.set(charKey(spec), id);
    this.items.push(charPrXml(id, spec));
    return id;
  }

  xml(): string {
    return `<hh:charProperties itemCnt="${countAttr(this.items)}">${this.items.join("")}</hh:charProperties>`;
  }
}

function charKey(s: CharSpec): string {
  const flags =
    (s.bold ? "b" : "") +
    (s.italic ? "i" : "") +
    (s.underline ? "u" : "") +
    (s.strike ? "s" : "") +
    (s.sup ? "^" : "") +
    (s.sub ? "_" : "");
  return `${s.height}|${flags}|${s.color}`;
}

/** 본문 · 가운데 · 들여쓰기(근거) · 표 안 */
export const PARA = { body: 0, center: 1, indent: 2, cell: 3 } as const;

type ParaAlign = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";

type ParaSpec = {
  align: ParaAlign;
  leftMargin: number;
  lineSpacing: number;
};

function paraPrXml(id: number, s: ParaSpec): string {
  return (
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
    `<hh:align horizontal="${s.align}" vertical="BASELINE"/>` +
    `<hh:heading type="NONE" idRef="0" level="0"/>` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
    `<hh:margin>` +
    `<hc:intent value="0" unit="HWPUNIT"/>` +
    `<hc:left value="${s.leftMargin}" unit="HWPUNIT"/>` +
    `<hc:right value="0" unit="HWPUNIT"/>` +
    `<hc:prev value="0" unit="HWPUNIT"/>` +
    `<hc:next value="0" unit="HWPUNIT"/>` +
    `</hh:margin>` +
    `<hh:lineSpacing type="PERCENT" value="${s.lineSpacing}" unit="HWPUNIT"/>` +
    `<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` +
    `</hh:paraPr>`
  );
}

const PARA_SEED: readonly ParaSpec[] = [
  { align: "JUSTIFY", leftMargin: 0, lineSpacing: 160 }, // PARA.body
  { align: "CENTER", leftMargin: 0, lineSpacing: 160 }, // PARA.center
  // 근거 꼬리표는 본문보다 한 칸 들어간다. 2mm ≈ 567 HWPUNIT 의 세 배.
  { align: "JUSTIFY", leftMargin: 1700, lineSpacing: 150 }, // PARA.indent
  { align: "CENTER", leftMargin: 0, lineSpacing: 140 }, // PARA.cell
];

/**
 * 들여쓰기 한 단.
 *
 * 근거 꼬리표가 쓰던 값과 같은 1700 이다. 문서 안에 들여쓰기 눈금이 두 가지
 * 있으면 「1-가.」와 그 아래 근거 줄이 서로 안 맞는 것으로 보인다.
 */
const INDENT_STEP = 1700;

/** 문단모양 등록부. CharRegistry 와 같은 구조·같은 이유다. */
class ParaRegistry {
  private readonly items: string[] = [];
  private readonly byKey = new Map<string, number>();

  constructor() {
    for (const spec of PARA_SEED) this.add(spec);
  }

  id(spec: ParaSpec): number {
    const key = paraKey(spec);
    const found = this.byKey.get(key);
    if (found !== undefined) return found;
    return this.add(spec);
  }

  private add(spec: ParaSpec): number {
    const id = this.items.length;
    this.byKey.set(paraKey(spec), id);
    this.items.push(paraPrXml(id, spec));
    return id;
  }

  xml(): string {
    return `<hh:paraProperties itemCnt="${countAttr(this.items)}">${this.items.join("")}</hh:paraProperties>`;
  }
}

function paraKey(s: ParaSpec): string {
  return `${s.align}|${s.leftMargin}|${s.lineSpacing}`;
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

/** 등록부가 다 찬 뒤에 부른다. section0.xml 을 먼저 만드는 이유가 이것이다. */
function headerXml(chars: CharRegistry, paras: ParaRegistry): Uint8Array {
  const xml =
    XML_DECL +
    `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1">` +
    `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>` +
    `<hh:refList>` +
    fontfaces() +
    borderFills() +
    chars.xml() +
    `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>` +
    numberings() +
    paras.xml() +
    `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>` +
    `</hh:refList>` +
    `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>` +
    `</hh:head>`;
  return utf8.encode(xml);
}

// ===========================================================================
// 4. 본문 — Contents/section0.xml
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

/** 미리 깔린 여섯 글자모양의 크기. 줄 높이(lineseg)를 재는 데만 쓴다. */
function charHeightOf(charPrId: number): number {
  return CHAR_SEED[charPrId]?.height ?? 1000;
}

/** 문단 하나. runs 는 이미 조립된 `<hp:run>` 들이다. */
function paraX(
  paraPrId: number,
  runs: string,
  charHeight: number,
  width: number,
  pageBreak = false,
): string {
  return (
    `<hp:p id="${nextParaId()}" paraPrIDRef="${paraPrId}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">` +
    runs +
    lineseg(width, charHeight) +
    `</hp:p>`
  );
}

/** 글자모양 하나로 된 문단. inner 는 run 안에 들어갈 것(글자 또는 표). */
function para(
  paraPrId: number,
  charPrId: number,
  inner: string,
  width: number,
): string {
  return paraX(
    paraPrId,
    `<hp:run charPrIDRef="${charPrId}">${inner}</hp:run>`,
    charHeightOf(charPrId),
    width,
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

// ---------------------------------------------------------------------------
// 인라인 서식
// ---------------------------------------------------------------------------

/**
 * 토막의 색.
 *
 * `#RRGGBB` 가 아니면 갈래의 기본색으로 떨어뜨린다. 이 값은 XML **속성**에
 * 그대로 박히는데 속성값은 `esc` 를 거치지 않으므로, 여기서 막지 않으면
 * 색 하나로 header 전체를 깨뜨릴 수 있다.
 */
function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function runChar(base: CharSpec, r: HwpxRun): CharSpec {
  return {
    height: base.height,
    // 갈래가 이미 굵은 것(제목·항목제목)은 토막이 굵기를 **끄지 못한다.**
    // 제목 안의 한 낱말만 가늘어진 문서는 서식이 아니라 사고로 읽힌다.
    bold: base.bold || r.bold === true,
    italic: r.italic === true,
    underline: r.underline === true,
    strike: r.strike === true,
    sup: r.sup === true,
    // 위·아래첨자는 함께 붙을 수 없다. 위쪽이 이긴다(model.ts 와 같은 규칙).
    sub: r.sub === true && r.sup !== true,
    color: safeColor(r.color, base.color),
  };
}

function runsToXml(
  runs: readonly HwpxRun[],
  base: CharSpec,
  chars: CharRegistry,
): string {
  let out = "";
  for (const r of runs) {
    out += `<hp:run charPrIDRef="${chars.id(runChar(base, r))}"><hp:t>${esc(r.text)}</hp:t></hp:run>`;
  }
  return out;
}

const ALIGN_MAP: Record<HwpxAlign, ParaAlign> = {
  left: "LEFT",
  center: "CENTER",
  right: "RIGHT",
  justify: "JUSTIFY",
};

/** 들여쓰기 단계 상한. editor/model.ts 의 MAX_INDENT 와 같은 값이어야 한다. */
const MAX_INDENT_LEVEL = 5;

function indentLevel(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const n = Math.floor(value);
  return n < 0 ? 0 : n > MAX_INDENT_LEVEL ? MAX_INDENT_LEVEL : n;
}

/**
 * 갈래마다의 기본 글자·문단 모양.
 *
 * 여기 적은 값이 등록부에 미리 깔린 여섯/넷과 **정확히 맞아떨어지게** 골랐다.
 * 그래서 정렬·들여쓰기·인라인 서식을 하나도 안 쓴 문서는 참조를 하나도 새로
 * 만들지 않고, header.xml 이 예전 그대로 나온다. 새로 더한 subheading·quote
 * 만 쓸 때 참조가 붙는다.
 */
const KIND_STYLE: Record<
  TextParagraph["kind"],
  { char: CharSpec; para: ParaSpec }
> = {
  title: { char: baseChar(1600, true), para: PARA_SEED[PARA.center] },
  heading: { char: baseChar(1150, true), para: PARA_SEED[PARA.body] },
  subheading: {
    char: baseChar(1050, true),
    para: { align: "JUSTIFY", leftMargin: INDENT_STEP / 2, lineSpacing: 160 },
  },
  body: { char: baseChar(1000, false), para: PARA_SEED[PARA.body] },
  bullet: { char: baseChar(1000, false), para: PARA_SEED[PARA.indent] },
  quote: {
    char: baseChar(1000, false),
    para: { align: "JUSTIFY", leftMargin: INDENT_STEP, lineSpacing: 160 },
  },
  source: { char: baseChar(900, false), para: PARA_SEED[PARA.indent] },
  note: { char: baseChar(900, false), para: PARA_SEED[PARA.body] },
};

function textParagraphXml(
  p: TextParagraph,
  chars: CharRegistry,
  paras: ParaRegistry,
): string {
  const style = KIND_STYLE[p.kind];
  const paraPrId = paras.id({
    align: p.align ? ALIGN_MAP[p.align] : style.para.align,
    leftMargin: style.para.leftMargin + indentLevel(p.indent) * INDENT_STEP,
    lineSpacing: style.para.lineSpacing,
  });
  const runs = p.runs && p.runs.length > 0 ? p.runs : [{ text: p.text }];
  return paraX(
    paraPrId,
    runsToXml(runs, style.char, chars),
    style.char.height,
    TEXT_WIDTH,
  );
}

/**
 * 가로줄.
 *
 * OWPML 에 「가로줄」이라는 물건은 없다. 문단모양에 아래쪽 테두리를 주는 길도
 * 있지만, 그러려면 테두리채우기(borderFill)를 하나 더 정의해야 하고 그 순간
 * **가로줄을 안 쓴 문서의 header 까지 달라진다.** 그래서 밑줄만 그은 빈 문단으로
 * 흉내 낸다.
 *
 * ⚠ 공백 개수는 10pt 함초롬바탕이 본문 폭(48190 HWPUNIT ≈ 482pt)을 채울 만큼으로
 * 어림한 값이다. **실제 한/글에서 재 본 적이 없다** — 짧거나 길게 나올 수 있고,
 * 한/글이 문단 끝 공백을 접어 버리면 줄이 아예 안 보일 수도 있다.
 */
const DIVIDER_SPACES = 96;

function dividerXml(chars: CharRegistry, paras: ParaRegistry): string {
  const spec = runChar(baseChar(1000, false), { text: "", underline: true });
  const paraPrId = paras.id(PARA_SEED[PARA.body]);
  return paraX(
    paraPrId,
    `<hp:run charPrIDRef="${chars.id(spec)}"><hp:t>${" ".repeat(DIVIDER_SPACES)}</hp:t></hp:run>`,
    1000,
    TEXT_WIDTH,
  );
}

/**
 * 표.
 *
 * 세로 병합(rowSpan)은 만들지 않는다. cellAddr 를 병합에 맞춰 어긋나게 적는
 * 순간 한/글이 표를 못 그리는데, 우리 서식은 세로 병합 없이도 전부 그릴 수 있다.
 * 가로 병합(colSpan)만 쓴다 — 협조란 한 줄이 그것을 필요로 한다.
 */
function tableXml(
  table: HwpxTable,
  chars: CharRegistry,
  paras: ParaRegistry,
): string {
  /**
   * 칸의 문단모양.
   *
   * 「가운데」와 「왼쪽」은 이 파일이 오래 쓰던 번호(PARA.cell · PARA.body)를
   * 그대로 쓴다. 좁은 칸에서 JUSTIFY 와 LEFT 는 사실상 같은 모양이라 바꿀
   * 이득이 없는데, 바꾸면 이미 내보낸 결재 문서와 바이트가 달라져
   * 「내가 받은 파일이 그때 그 파일인가」를 해시로 답하던 것이 깨진다.
   */
  const cellParaId = (align: HwpxAlign | undefined): number => {
    if (align === undefined || align === "center") return PARA.cell;
    if (align === "left" || align === "justify") return PARA.body;
    return paras.id({ align: "RIGHT", leftMargin: 0, lineSpacing: 140 });
  };

  const totalRatio = table.widths.reduce((n, w) => n + w, 0) || 1;
  const colWidths = table.widths.map((w) =>
    Math.max(1, Math.round((w / totalRatio) * TEXT_WIDTH)),
  );
  // 반올림 오차를 마지막 열이 흡수한다. 합이 본문 폭과 어긋나면 표가 삐져나간다.
  const drift = TEXT_WIDTH - colWidths.reduce((n, w) => n + w, 0);
  colWidths[colWidths.length - 1] += drift;

  const colCnt = colWidths.length;
  const rowCnt = table.rows.length;

  /**
   * 칸 안의 줄 — **줄바꿈은 줄바꿈으로 간다.**
   *
   * `esc()` 는 칸에 들어온 `\n` 을 공백으로 눕힌다. 한 줄짜리 칸에서는 그것이
   * 옳다(제어문자가 XML 을 깨뜨린다). 그런데 인계서의 「내용」 칸에는 스무
   * 줄짜리 문단이 통째로 들어오고, 그걸 눕히면 **화면에서 계층이던 것이
   * 파일에서는 한 줄로 뭉개진다** — 문서 항목 목록도, 대화 인용도, 인용 사이의
   * 빈 줄도 전부 한 덩어리가 된다. 화면·종이가 `whitespace-pre-wrap` 으로
   * 지키는 것이 그것이고(print-sheet.tsx), 파일만 다르게 나갈 이유가 없다.
   *
   * ⚠ **한 줄짜리 칸의 바이트는 한 개도 안 바뀐다.** 줄이 하나면 예전과 똑같이
   * 문단 하나를 낸다. 이미 내보낸 결재 문서를 해시로 되짚는 약속이 여기 걸려
   * 있다(위 cellParaId 주석과 같은 이유).
   *
   * `runs` 를 준 칸은 건드리지 않는다. 토막마다 서식이 다른 칸에서 줄을 쪼개면
   * 어느 토막이 어느 줄에 걸치는지를 여기서 다시 판정해야 하고, 그건 부르는
   * 쪽이 이미 아는 것을 이쪽에서 짐작하는 일이다.
   */
  const cellLines = (cell: HwpxCell): string[] =>
    cell.runs && cell.runs.length > 0 ? [] : cell.text.split(/\r\n?|\n/);

  // 줄이 여럿인 칸이 있으면 그 줄만큼 키를 준다. 안 키우면 한/글이 칸을 늘려
  // 그리는 동안 표의 선언 높이와 실제 높이가 어긋나 아래가 밀린다.
  const rowLines = table.rows.map((row) =>
    Math.max(1, ...row.cells.map((c) => cellLines(c).length || 1)),
  );
  const height = rowLines.reduce((n, lines) => n + ROW_HEIGHT * lines, 0);

  /**
   * 줄마다 **colCnt 만큼의 칸을 반드시 채운다.**
   *
   * OWPML 에는 「빈 격자」라는 표현이 없다. rowCnt·colCnt 로 격자를 선언해 놓고
   * 어느 자리에 hp:tc 가 없으면 한/글은 표를 그리다 만다 — 칸 하나가 비는 게
   * 아니라 **표가 통째로 안 나온다.** 짧은 줄은 붙여넣기에서 실제로 들어온다
   * (세로 병합된 표를 펼치면 그 모양이 되고, 모델의 parseTable 은 열 수를
   * 「가장 넓은 줄」로 잡을 뿐 짧은 줄을 채우지 않는다).
   *
   * 반대쪽 — 선언한 열보다 칸이 많은 줄 — 도 막는다. 그대로 두면 격자 밖에
   * 폭 0짜리 칸이 붙는다.
   */
  const rows = table.rows
    .map((row, rowAddr) => {
      let colAddr = 0;
      const cellXml = (cell: HwpxCell): string => {
        const span = Math.max(1, Math.min(cell.colSpan ?? 1, colCnt - colAddr));
        const width = colWidths
          .slice(colAddr, colAddr + span)
          .reduce((n, w) => n + w, 0);
        const inner = width - CELL_MARGIN.left - CELL_MARGIN.right;
        const base = baseChar(1000, cell.bold === true);
        const pp = cellParaId(cell.align);
        const lines = cellLines(cell);
        const body =
          cell.runs && cell.runs.length > 0
            ? paraX(
                pp,
                runsToXml(cell.runs, base, chars),
                base.height,
                Math.max(1, inner),
              )
            : lines
                .map((line) =>
                  paraX(
                    pp,
                    runsToXml([{ text: line }], base, chars),
                    base.height,
                    Math.max(1, inner),
                  ),
                )
                .join("");
        const at = colAddr;
        colAddr += span;
        return (
          `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">` +
          `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
          body +
          `</hp:subList>` +
          `<hp:cellAddr colAddr="${at}" rowAddr="${rowAddr}"/>` +
          `<hp:cellSpan colSpan="${span}" rowSpan="1"/>` +
          `<hp:cellSz width="${width}" height="${ROW_HEIGHT * rowLines[rowAddr]}"/>` +
          `<hp:cellMargin left="${CELL_MARGIN.left}" right="${CELL_MARGIN.right}" top="${CELL_MARGIN.top}" bottom="${CELL_MARGIN.bottom}"/>` +
          `</hp:tc>`
        );
      };

      let cells = "";
      for (const cell of row.cells) {
        if (colAddr >= colCnt) break;
        cells += cellXml(cell);
      }
      // 남은 자리를 빈 칸으로. 칸 모양은 이웃과 같아야 표가 고르게 그려진다.
      while (colAddr < colCnt) cells += cellXml({ text: "" });
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

function sectionXml(
  doc: HwpxDoc,
  chars: CharRegistry,
  paras: ParaRegistry,
): Uint8Array {
  paraId = 0;

  const parts: string[] = [];
  // 첫 문단이 구역 설정을 들고 간다. 규격이 그렇게 정한다 — 그래서 secPr 은
  // **첫 run 안**에 들어가야 하고, 제목이 여러 토막이어도 첫 토막에만 붙인다.
  //
  // 서식 없는 제목(토막 하나·검정)은 runChar 가 CHAR_SEED[2] 와 같은 조합을
  // 내므로 charPrIDRef 가 CHAR.title(2)로 떨어진다 — 예전과 바이트가 같다.
  const titleBase = baseChar(1600, true);
  const given = doc.titleRuns?.filter((r) => r.text !== "") ?? [];
  // 하나는 반드시 남아야 한다. 전부 비면 secPr 을 담을 run 이 없어진다.
  const titleRuns: readonly HwpxRun[] = given.length > 0 ? given : [{ text: doc.title }];
  let lead = secPr();
  let titleXml = "";
  for (const r of titleRuns) {
    titleXml +=
      `<hp:run charPrIDRef="${chars.id(runChar(titleBase, r))}">` +
      lead +
      `<hp:t>${esc(r.text)}</hp:t></hp:run>`;
    lead = "";
  }
  parts.push(
    `<hp:p id="${nextParaId()}" paraPrIDRef="${PARA.center}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
      titleXml +
      lineseg(TEXT_WIDTH, charHeightOf(CHAR.title)) +
      `</hp:p>`,
  );

  for (const p of doc.paragraphs) {
    switch (p.kind) {
      case "spacer":
        parts.push(textPara(PARA.body, CHAR.body, ""));
        break;
      case "divider":
        parts.push(dividerXml(chars, paras));
        break;
      case "pagebreak":
        // 빈 문단에 pageBreak 를 세운다. 이 문단부터 새 쪽이 시작한다.
        parts.push(
          paraX(
            PARA.body,
            `<hp:run charPrIDRef="${CHAR.body}"><hp:t></hp:t></hp:run>`,
            1000,
            TEXT_WIDTH,
            true,
          ),
        );
        break;
      case "table":
        parts.push(tableXml(p.table, chars, paras));
        break;
      default:
        parts.push(textParagraphXml(p, chars, paras));
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
// 5. 꾸러미
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
    if (
      p.kind === "table" ||
      p.kind === "spacer" ||
      p.kind === "divider" ||
      p.kind === "pagebreak"
    ) {
      continue;
    }
    const text = paraPlainText(p).trim();
    if (text) lines.push(text);
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
 *
 * ⚠ **본문을 먼저, 머리를 나중에** 만든다. 글자모양·문단모양 등록부가
 * 본문을 조립하면서 차기 때문이다(CharRegistry 주석 참조). 꾸러미에 담기는
 * 차례는 그대로지만 계산 차례는 뒤집혀 있다 — 이 순서를 되돌리면 서식을 쓴
 * 문서에서 header 가 참조를 잃는다.
 */
export function buildHwpx(doc: HwpxDoc): Uint8Array {
  const chars = new CharRegistry();
  const paras = new ParaRegistry();
  const section = sectionXml(doc, chars, paras);

  const contents: Array<[string, Uint8Array]> = [
    ["version.xml", versionXml()],
    ["Contents/header.xml", headerXml(chars, paras)],
    ["Contents/section0.xml", section],
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
  //
  // 자르는 자리만 막아서는 모자란다. **제목에 이미 낱짝이 들어 있으면** 같은
  // 예외가 그대로 난다 — 자른 적이 없어도. esc() 가 XML 쪽에서 같은 낱짝을
  // 실제로 걸러 내는데(위 esc 주석) 파일 이름 쪽에만 그 검사가 없었다.
  const cut = [...safe].filter(isNotLoneSurrogate).slice(0, 80).join("");
  return `${cut || "결재문서"}.hwpx`;
}

/**
 * 짝 잃은 서로게이트가 **아닌가**.
 *
 * 전개(`[...s]`)는 코드포인트 단위라 정상 이모지는 codePointAt 이 0x10000 이상이고,
 * 짝을 잃은 것만 0xD800~0xDFFF 로 홀로 들어온다. docx.ts 의 파일 이름이 같은
 * 규칙을 쓰므로 여기서 내보낸다 — 규칙이 두 벌이 되면 한쪽만 고쳐진 채 남는다.
 */
export function isNotLoneSurrogate(ch: string): boolean {
  const c = ch.codePointAt(0) as number;
  return c < 0xd800 || c > 0xdfff;
}
