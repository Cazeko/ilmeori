/**
 * 서식 문서(RichDoc) → .docx 바이트 (OOXML WordprocessingML).
 *
 * ── 왜 DOCX 도 만드는가 ────────────────────────────────────────────────────
 *
 * 공문서의 정본은 한/글이다. 그런데 이 제품이 만든 HWPX 는 **실제 한/글에서
 * 열어 본 적이 없고**(pack.ts 머리말), 그 확인이 끝나기 전까지는 「받는 사람이
 * 열 수 있는 파일」이 하나뿐이면 위험하다. 워드는 관공서에서 두 번째로 흔한
 * 편집기이고, 무엇보다 **규격 문서가 공개돼 있어 우리가 틀린 자리를 찾을 수
 * 있다.** 한/글이 못 열면 워드로, 워드도 못 열면 인쇄(A4)로 — 길을 셋 둔다.
 *
 * ⚠ **실제 워드에서 열어 본 적이 없다.** 이 저장소는 리눅스 컨테이너이고
 * MS Word 가 없다. `npm run test:docx` 가 확인하는 것은 「ZIP 이 규격대로인가 ·
 * XML 이 잘 짜였는가 · 넣은 글자가 제자리에 들어갔는가」까지다. LibreOffice 로도
 * 열어 보지 않았다. 이 파일을 처음 실제로 여는 사람은 **그 사실을 알고** 열어야
 * 한다. pack.ts 가 같은 자리에 같은 경고를 달고 있고, 이유도 같다.
 *
 * ── 규격 ───────────────────────────────────────────────────────────────────
 *
 *   DOCX = OPC(Open Packaging Conventions) 로 묶은 ZIP.
 *   HWPX 와 달리 **mimetype 을 맨 앞 무압축으로 둘 필요가 없다** — 무엇인지는
 *   `[Content_Types].xml` 이 말한다. 그래서 항목 차례를 우리가 정할 수 있다.
 *
 *     [Content_Types].xml       ← 확장자·부품마다의 미디어 타입
 *     _rels/.rels               ← 꾸러미 뿌리의 관계
 *     word/document.xml         ← 본문
 *     word/_rels/document.xml.rels
 *     word/styles.xml           ← 제목·본문·인용 …
 *     word/numbering.xml
 *     docProps/core.xml         ← 제목·만든이·시각
 *     docProps/app.xml
 *
 * 길이 단위는 twip = 1/1440 인치다(HWPUNIT 의 1/5). 글자 크기(w:sz)만 **반 pt**
 * 라 10pt 가 20 이다 — HWPX 의 1/100 pt 와 다르니 옮길 때 헷갈리지 말 것.
 */

import {
  clampIndent,
  computeOrdinals,
  markerFor,
  type Block,
  type RichDoc,
  type Span,
  type TableCell,
  type TableData,
} from "./model";
// XML 이스케이프는 pack.ts 의 것을 그대로 쓴다. 규칙(제어문자·서로게이트 낱짝)이
// OOXML 에서도 똑같고, 베껴 두면 한쪽만 고쳐진 채 남는다 — zip.ts 를 따로 뺀
// 것과 같은 판단이다. 가져오는 것은 이 함수 하나뿐이다.
import { esc, isNotLoneSurrogate } from "../hwpx/pack";
import { zip, type ZipEntry } from "../zip";
import { DOC_COLOR } from "./to-hwpx";

const utf8 = new TextEncoder();
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function part(xml: string): Uint8Array {
  return utf8.encode(XML_DECL + xml);
}

// ===========================================================================
// 1. 종이와 글꼴
// ===========================================================================

/** A4 세로. twip = 1/1440 인치 (210mm × 297mm) */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN_SIDE = 1134; // 20mm
const MARGIN_TOP = 1134; // 20mm
const MARGIN_BOTTOM = 850; // 15mm
/** 글이 실제로 놓이는 폭. 표 너비를 이 값에서 나눈다. */
const TEXT_WIDTH = PAGE_WIDTH - MARGIN_SIDE * 2; // 9638

/**
 * 함초롬바탕 — 한/글이 기본으로 들고 있는 글꼴이다.
 *
 * **끼워 넣지 않는다.** 글꼴을 파일에 심으려면 바이너리를 담아야 하고, 담지 않은
 * 채 이름만 적으면 그 글꼴이 없는 컴퓨터에서 편집기가 제멋대로 바꾼다.
 * 공문서는 어느 자리에서 열어도 같은 모양이어야 한다(pack.ts 의 FONT 와 같은
 * 판단이다). 대신 워드가 흔히 들고 있는 「맑은 고딕」을 대체로 적어 둔다 —
 * 함초롬바탕이 없는 컴퓨터에서 명조가 아니라 고딕으로 떨어지는 편이,
 * 편집기가 고른 알 수 없는 글꼴로 떨어지는 것보다 예측할 수 있다.
 */
const FONT_EAST = "함초롬바탕";
const FONT_LATIN = "맑은 고딕";

/** 들여쓰기 한 단. HWPX 의 INDENT_STEP(1700 HWPUNIT)과 **같은 길이**다. */
const INDENT_STEP = 340;

// ===========================================================================
// 2. 스타일
//
// 크기·굵기는 HWPX 쪽(pack.ts 의 KIND_STYLE)과 같은 값으로 맞춘다. 같은 문서를
// 두 파일로 내려받았을 때 모양이 다르면, 어느 쪽이 「그 문서」인지 알 수 없다.
// ===========================================================================

type StyleDef = {
  id: string;
  /** 워드 서식 목록에 뜨는 이름. 사용자가 보는 말이므로 한국어다. */
  name: string;
  /** 반 pt. 10pt = 20 */
  size: number;
  bold: boolean;
  jc: "left" | "center" | "right" | "both";
  /** 240 이 한 줄. 160% = 384 */
  line: number;
  /** 문단 뒤 여백(twip) */
  after: number;
  color?: string;
};

const STYLES: readonly StyleDef[] = [
  { id: "Normal", name: "본문", size: 20, bold: false, jc: "both", line: 384, after: 0 },
  { id: "DocTitle", name: "제목", size: 32, bold: true, jc: "center", line: 384, after: 240 },
  { id: "Heading1", name: "큰항목", size: 23, bold: true, jc: "both", line: 384, after: 60 },
  { id: "Heading2", name: "작은항목", size: 21, bold: true, jc: "both", line: 384, after: 40 },
  { id: "Quote", name: "인용", size: 20, bold: false, jc: "both", line: 384, after: 0 },
  // 근거·붙임말에 **색을 주지 않는다.** 회색으로 옅게 그리면 화면에서는 보기
  // 좋지만, 같은 문단을 HWPX 로 내려받으면 순검정이다(pack.ts 의 KIND_STYLE
  // 은 크기만 9pt 로 낮추고 색은 건드리지 않는다). 두 파일이 다르면 어느 쪽이
  // 그 문서인지 답할 수 없다 — 이 파일 머리말의 규칙이 그것이다. 잔글씨라는
  // 것은 9pt 라는 크기가 이미 말한다.
  { id: "Source", name: "근거", size: 18, bold: false, jc: "both", line: 360, after: 0 },
  { id: "Note", name: "붙임말", size: 18, bold: false, jc: "both", line: 384, after: 0 },
];

/** 갈래 → 스타일 id. 표 안 문단은 본문 스타일을 그대로 쓴다. */
const STYLE_OF: Record<Block["kind"], string> = {
  title: "DocTitle",
  heading: "Heading1",
  subheading: "Heading2",
  body: "Normal",
  bullet: "Normal",
  numbered: "Normal",
  quote: "Quote",
  source: "Source",
  note: "Note",
  spacer: "Normal",
  divider: "Normal",
  pagebreak: "Normal",
  table: "Normal",
};

/**
 * 갈래가 기본으로 갖는 들여쓰기(twip).
 *
 * 스타일이 아니라 문단(pPr)에 적는다. 단(indent)마다 값이 달라지는데 그것을
 * 스타일로 만들면 갈래 × 단만큼 스타일이 생기고, 워드의 서식 목록이 그 전부로
 * 채워진다. 들여쓰기는 한 곳에서만 계산한다.
 */
const BASE_INDENT: Record<Block["kind"], number> = {
  title: 0,
  heading: 0,
  subheading: INDENT_STEP / 2,
  body: 0,
  bullet: INDENT_STEP,
  numbered: INDENT_STEP,
  quote: INDENT_STEP,
  source: INDENT_STEP,
  note: 0,
  spacer: 0,
  divider: 0,
  pagebreak: 0,
  table: 0,
};

function styleXml(s: StyleDef): string {
  const rPr =
    `<w:rPr>` +
    `<w:rFonts w:ascii="${esc(FONT_LATIN)}" w:eastAsia="${esc(FONT_EAST)}" w:hAnsi="${esc(FONT_LATIN)}" w:cs="${esc(FONT_LATIN)}"/>` +
    (s.bold ? `<w:b/><w:bCs/>` : "") +
    (s.color ? `<w:color w:val="${s.color}"/>` : "") +
    `<w:sz w:val="${s.size}"/><w:szCs w:val="${s.size}"/>` +
    `</w:rPr>`;
  const pPr =
    `<w:pPr>` +
    `<w:spacing w:after="${s.after}" w:line="${s.line}" w:lineRule="auto"/>` +
    `<w:jc w:val="${s.jc}"/>` +
    `</w:pPr>`;
  return (
    `<w:style w:type="paragraph"${s.id === "Normal" ? ' w:default="1"' : ""} w:styleId="${s.id}">` +
    `<w:name w:val="${esc(s.name)}"/>` +
    (s.id === "Normal" ? "" : `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>`) +
    `<w:qFormat/>` +
    pPr +
    rPr +
    `</w:style>`
  );
}

function stylesXml(): Uint8Array {
  return part(
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:docDefaults><w:rPrDefault><w:rPr>` +
      `<w:rFonts w:ascii="${esc(FONT_LATIN)}" w:eastAsia="${esc(FONT_EAST)}" w:hAnsi="${esc(FONT_LATIN)}" w:cs="${esc(FONT_LATIN)}"/>` +
      `<w:sz w:val="20"/><w:szCs w:val="20"/>` +
      `<w:lang w:val="en-US" w:eastAsia="ko-KR" w:bidi="ar-SA"/>` +
      `</w:rPr></w:rPrDefault>` +
      `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="384" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
      `</w:docDefaults>` +
      STYLES.map(styleXml).join("") +
      `</w:styles>`,
  );
}

// ===========================================================================
// 3. 글자
// ===========================================================================

/**
 * 토막의 색.
 *
 * 이 값은 XML **속성**에 그대로 박히고 속성값은 `esc` 를 거치지 않는다.
 * `Span.c` 가 TEXT_COLORS 밖이면 표 조회가 `undefined` 가 되어 `.slice(1)` 이
 * 그 자리에서 터지고, 어쩌다 표에 없는 문자열이 들어오면 색 하나로 문서 전체를
 * 깨뜨릴 수 있다. 라우트는 언제나 `parseRichDoc` 를 거치지만 `buildDocx` 는
 * 내보낸 함수라 그렇지 않은 값도 받는다 — pack.ts 의 `safeColor` 가 같은 자리를
 * 같은 이유로 막아 두었고, 한쪽만 막아 두면 두 길의 안전이 갈린다.
 */
function safeColor(name: Span["c"]): string {
  const value: string | undefined = DOC_COLOR[name as keyof typeof DOC_COLOR];
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DOC_COLOR.default;
}

/**
 * 토막 하나를 `<w:r>` 로.
 *
 * `w:rPr` 의 **자식 차례는 규격이 정한다**(b → i → strike → color → u →
 * vertAlign). 순서를 흐트러뜨리면 워드가 「내용에 문제가 있습니다」로 문서를
 * 복구 모드로 연다. 잘 짜인 XML 인지만 보는 시험으로는 이 실수를 못 잡는다.
 *
 * `xml:space="preserve"` 를 늘 붙인다. 안 붙이면 「붙임 」처럼 뒤에 붙은 공백이
 * 사라져 다음 낱말과 달라붙는다.
 *
 * ── 형광펜(Span.h)은 싣지 않는다 ───────────────────────────────────────────
 *
 * OOXML 에는 `w:highlight`(열거형)도 `w:shd`(임의 색)도 있어 **넣을 수는 있다.**
 * 그런데 HWPX 쪽은 못 넣는다 — HwpxRun 에 자리를 두지 않기로 했고(to-hwpx.ts
 * 머리말: 형광펜은 「읽는 중 표시」이지 결재로 나가는 문서의 내용이 아니다),
 * 여기만 넣으면 **같은 문서를 두 파일로 내려받았을 때 한쪽만 색칠이 있다.**
 * 두 벌을 맞춰 두겠다는 이 파일의 규칙이 그것보다 앞선다. 클립보드 HTML 에만
 * 남는 것은 편집기끼리 오려 붙일 때 표시가 살아 있어야 하기 때문이고, 그것은
 * 파일이 아니다. 이 판단을 뒤집는다면 고칠 자리는 여기가 아니라 HwpxRun 이다.
 */
function runXml(span: Span, forceBold: boolean): string {
  const marks = span.m ?? [];
  const color = safeColor(span.c);
  const rPr =
    `<w:rPr>` +
    (forceBold || marks.includes("b") ? `<w:b/><w:bCs/>` : "") +
    (marks.includes("i") ? `<w:i/><w:iCs/>` : "") +
    (marks.includes("s") ? `<w:strike/>` : "") +
    // 워드의 색값에는 `#` 을 붙이지 않는다. 붙이면 검정으로 떨어진다.
    (color !== DOC_COLOR.default ? `<w:color w:val="${color.slice(1)}"/>` : "") +
    (marks.includes("u") ? `<w:u w:val="single"/>` : "") +
    (marks.includes("sup")
      ? `<w:vertAlign w:val="superscript"/>`
      : marks.includes("sub")
        ? `<w:vertAlign w:val="subscript"/>`
        : "") +
    `</w:rPr>`;
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(span.t)}</w:t></w:r>`;
}

function runsXml(spans: readonly Span[], forceBold = false): string {
  let out = "";
  for (const s of spans) {
    if (!s.t) continue;
    out += runXml(s, forceBold);
  }
  return out;
}

// ===========================================================================
// 4. 문단
// ===========================================================================

type ParaOpts = {
  style: string;
  indent: number;
  jc?: string;
  /** 아래쪽 테두리 — 가로줄을 이것으로 그린다. */
  bottomBorder?: boolean;
};

const JC_OF: Record<string, string> = {
  left: "left",
  center: "center",
  right: "right",
  justify: "both",
};

function paraXml(runs: string, o: ParaOpts): string {
  // pPr 의 자식 차례도 규격이 정한다: pStyle → pBdr → spacing → ind → jc
  const pPr =
    `<w:pPr>` +
    `<w:pStyle w:val="${o.style}"/>` +
    (o.bottomBorder
      ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>`
      : "") +
    (o.indent > 0 ? `<w:ind w:left="${o.indent}"/>` : "") +
    (o.jc ? `<w:jc w:val="${o.jc}"/>` : "") +
    `</w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

/**
 * 표.
 *
 * 세로 병합은 쓰지 않는다 — pack.ts 와 같은 이유이고, 같은 서식을 그린다.
 * 첫 줄 되풀이(`w:tblHeader`)는 쪽이 넘어갈 때 칸 이름을 다시 찍게 한다.
 * 그게 없으면 두 쪽짜리 표의 뒷장은 숫자만 남은 종이가 된다.
 */
function tableXml(table: TableData): string {
  const total = table.widths.reduce((n, w) => n + w, 0) || 1;
  const cols = table.widths.map((w) =>
    Math.max(1, Math.round((w / total) * TEXT_WIDTH)),
  );
  // 반올림 오차를 마지막 열이 흡수한다. 합이 본문 폭과 어긋나면 표가 삐져나간다.
  cols[cols.length - 1] += TEXT_WIDTH - cols.reduce((n, w) => n + w, 0);

  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;

  /**
   * 줄마다 `w:gridCol` 수만큼 칸을 채운다.
   *
   * `w:tblGrid` 로 열을 선언해 놓고 어느 줄이 그보다 좁으면 워드는 남은 자리를
   * 알아서 메우지 않는다 — 표가 어긋나거나 문서를 복구 모드로 연다. 짧은 줄은
   * 붙여넣기에서 실제로 들어온다(세로 병합을 펼친 표, 모델의 parseTable 이
   * 열 수만 「가장 넓은 줄」로 잡는 것). pack.ts 의 tableXml 이 같은 자리를
   * 같은 이유로 막고 있다 — 한쪽만 고치면 두 파일이 다시 갈린다.
   */
  const cellXml = (
    cell: TableCell,
    span: number,
    width: number,
    isHead: boolean,
  ): string => {
    // tcPr 자식 차례: tcW → gridSpan → vAlign
    const tcPr =
      `<w:tcPr>` +
      `<w:tcW w:w="${width}" w:type="dxa"/>` +
      (span > 1 ? `<w:gridSpan w:val="${span}"/>` : "") +
      `<w:vAlign w:val="center"/>` +
      `</w:tcPr>`;
    const body = paraXml(runsXml(cell.spans, isHead), {
      style: "Normal",
      indent: 0,
      jc: JC_OF[cell.align ?? (isHead ? "center" : "left")] ?? "left",
    });
    return `<w:tc>${tcPr}${body}</w:tc>`;
  };

  const rows = table.rows
    .map((row, rowIndex) => {
      const isHead = table.header && rowIndex === 0;
      let at = 0;
      let cells = "";
      for (const cell of row.cells) {
        if (at >= cols.length) break;
        const span = Math.max(1, Math.min(cell.colSpan ?? 1, cols.length - at));
        const width = cols.slice(at, at + span).reduce((n, w) => n + w, 0);
        cells += cellXml(cell, span, width, isHead);
        at += span;
      }
      while (at < cols.length) {
        cells += cellXml({ id: "", spans: [] }, 1, cols[at], isHead);
        at += 1;
      }
      const trPr = isHead ? `<w:trPr><w:tblHeader/></w:trPr>` : "";
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join("");

  const tblPr =
    `<w:tblPr>` +
    `<w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/>` +
    `<w:tblBorders>${border("top")}${border("left")}${border("bottom")}${border("right")}${border("insideH")}${border("insideV")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>` +
    `</w:tblPr>`;
  const grid = `<w:tblGrid>${cols.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;

  // 표 뒤에 빈 문단을 하나 둔다. 워드는 표와 표가 맞붙으면 하나로 합쳐 읽고,
  // 본문이 표로 끝나면 그 뒤에 커서를 놓을 자리가 없어 문서를 복구 모드로 연다.
  return `<w:tbl>${tblPr}${grid}${rows}</w:tbl><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>`;
}

function blockXml(block: Block, ordinal: number): string {
  const indentLevel = clampIndent(block.indent);
  const indent = BASE_INDENT[block.kind] + indentLevel * INDENT_STEP;
  const style = STYLE_OF[block.kind];
  const jc = block.align ? JC_OF[block.align] : undefined;

  switch (block.kind) {
    case "spacer":
      return paraXml("", { style, indent: 0 });
    case "divider":
      // 가로줄은 아래쪽 테두리를 그은 빈 문단이다. 워드에는 「가로줄」이라는
      // 물건이 따로 없고, 그림으로 넣으면 받는 사람이 지우지도 옮기지도 못한다.
      return paraXml("", { style, indent: 0, bottomBorder: true });
    case "pagebreak":
      return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`;
    case "table":
      return block.table ? tableXml(block.table) : "";

    case "bullet":
    case "numbered": {
      // 번호·글머리표는 **글자로 굽는다.** 워드의 자동 목록으로 넘기면 받는
      // 사람이 문단 하나를 옮기는 순간 번호가 다시 매겨지는데, 「2. 사전 검토」는
      // 시행규칙이 정한 **이름**이지 순번이 아니다(to-hwpx.ts 와 같은 판단).
      const marker = markerFor(block.kind, indentLevel, ordinal);
      const head = marker
        ? runXml({ t: `${marker} ` }, false)
        : "";
      return paraXml(head + runsXml(block.spans), { style, indent, jc });
    }

    default:
      return paraXml(runsXml(block.spans), { style, indent, jc });
  }
}

// ===========================================================================
// 5. 부품
// ===========================================================================

const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_OFFICE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function contentTypesXml(): Uint8Array {
  const override = (name: string, type: string) =>
    `<Override PartName="${name}" ContentType="${type}"/>`;
  const wml = "application/vnd.openxmlformats-officedocument.wordprocessingml";
  return part(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      override("/word/document.xml", `${wml}.document.main+xml`) +
      override("/word/styles.xml", `${wml}.styles+xml`) +
      override("/word/numbering.xml", `${wml}.numbering+xml`) +
      override(
        "/docProps/core.xml",
        "application/vnd.openxmlformats-package.core-properties+xml",
      ) +
      override(
        "/docProps/app.xml",
        "application/vnd.openxmlformats-officedocument.extended-properties+xml",
      ) +
      `</Types>`,
  );
}

function rootRelsXml(): Uint8Array {
  return part(
    `<Relationships xmlns="${NS_REL}">` +
      `<Relationship Id="rId1" Type="${NS_OFFICE_REL}/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="${NS_OFFICE_REL}/extended-properties" Target="docProps/app.xml"/>` +
      `</Relationships>`,
  );
}

function documentRelsXml(): Uint8Array {
  return part(
    `<Relationships xmlns="${NS_REL}">` +
      `<Relationship Id="rId1" Type="${NS_OFFICE_REL}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId2" Type="${NS_OFFICE_REL}/numbering" Target="numbering.xml"/>` +
      `</Relationships>`,
  );
}

/**
 * 목록 정의.
 *
 * 번호·글머리표를 글자로 굽기 때문에 **이 부품을 가리키는 문단이 하나도 없다.**
 * 그래도 넣는 이유는 관계(rels)에 선언해 두기 위해서다 — 나중에 목록 서식을
 * 쓰는 문단이 하나라도 생겼을 때 numbering.xml 이 없으면 워드가 문서를 복구
 * 모드로 열고, 그 증상은 「어떤 문서만 안 열린다」로 나타나 원인을 찾기 어렵다.
 * 비어 있는 채로 두면 규격에 어긋나므로 쓸 수 있는 한 단계를 담아 둔다.
 */
function numberingXml(): Uint8Array {
  return part(
    `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:abstractNum w:abstractNumId="0">` +
      `<w:multiLevelType w:val="singleLevel"/>` +
      `<w:lvl w:ilvl="0">` +
      `<w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="○"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${INDENT_STEP}" w:hanging="${INDENT_STEP}"/></w:pPr>` +
      `</w:lvl>` +
      `</w:abstractNum>` +
      `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
      `</w:numbering>`,
  );
}

/** 워드 문서 정보에 뜨는 시각. 「2026-08-14T05:30:00Z」 모양이어야 한다. */
function w3cDate(d: Date): string {
  return `${d.toISOString().replace(/\.\d{3}Z$/, "")}Z`;
}

function corePropsXml(title: string, at: Date): Uint8Array {
  return part(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(title)}</dc:title>` +
      `<dc:creator>일머리</dc:creator>` +
      `<cp:lastModifiedBy>일머리</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${w3cDate(at)}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${w3cDate(at)}</dcterms:modified>` +
      `</cp:coreProperties>`,
  );
}

function appPropsXml(): Uint8Array {
  return part(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<Application>Ilmeori</Application>` +
      `<DocSecurity>0</DocSecurity>` +
      `<ScaleCrop>false</ScaleCrop>` +
      `<LinksUpToDate>false</LinksUpToDate>` +
      `<SharedDoc>false</SharedDoc>` +
      `<HyperlinksChanged>false</HyperlinksChanged>` +
      `<AppVersion>1.0000</AppVersion>` +
      `</Properties>`,
  );
}

function documentXml(doc: RichDoc): Uint8Array {
  const ordinals = computeOrdinals(doc.blocks);
  const body = doc.blocks.map((b, i) => blockXml(b, ordinals[i])).join("");

  // sectPr 자식 차례: pgSz → pgMar → cols → docGrid
  const sectPr =
    `<w:sectPr>` +
    `<w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/>` +
    `<w:pgMar w:top="${MARGIN_TOP}" w:right="${MARGIN_SIDE}" w:bottom="${MARGIN_BOTTOM}" w:left="${MARGIN_SIDE}" w:header="850" w:footer="850" w:gutter="0"/>` +
    `<w:cols w:space="425"/>` +
    `<w:docGrid w:linePitch="360"/>` +
    `</w:sectPr>`;

  return part(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${body}${sectPr}</w:body>` +
      `</w:document>`,
  );
}

// ===========================================================================
// 6. 꾸러미
// ===========================================================================

/**
 * .docx 한 벌을 바이트로.
 *
 * `meta.createdAt` 은 **저장 시각**이어야 하고 「지금」이면 안 된다. ZIP 항목의
 * 시각이 이 값으로 고정되므로, 같은 문서를 두 번 내려받으면 바이트까지 같다.
 * 그래야 「내가 받은 파일이 그때 그 파일인가」를 해시로 답할 수 있다.
 */
export function buildDocx(
  doc: RichDoc,
  meta: { title: string; createdAt: Date },
): Uint8Array {
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: contentTypesXml() },
    { name: "_rels/.rels", data: rootRelsXml() },
    { name: "word/document.xml", data: documentXml(doc) },
    { name: "word/_rels/document.xml.rels", data: documentRelsXml() },
    { name: "word/styles.xml", data: stylesXml() },
    { name: "word/numbering.xml", data: numberingXml() },
    { name: "docProps/core.xml", data: corePropsXml(meta.title, meta.createdAt) },
    { name: "docProps/app.xml", data: appPropsXml() },
  ];
  return zip(entries, meta.createdAt);
}

/**
 * 내려받는 파일 이름.
 *
 * 규칙은 `hwpxFileName` 과 **똑같다.** 그 함수의 주석에 적힌 사고를 여기서
 * 되풀이하지 않는다 — 경로로 읽힐 글자를 걷어내고, 코드포인트로 자르고
 * (UTF-16 코드 단위로 자르면 보조평면 글자가 반으로 쪼개져 라우트의
 * `encodeURIComponent` 가 URIError 를 던진다), **제목에 이미 들어 있던 짝 잃은
 * 서로게이트도 걷어내고**(자른 적이 없어도 같은 예외가 난다), 빈 이름을 막는다.
 *
 * 함수를 하나로 합치지 않은 것은 확장자와 기본 이름이 다르기 때문이고, 그
 * 둘을 인자로 받게 만들면 부르는 쪽마다 확장자를 손으로 적게 되어 오히려
 * 틀릴 자리가 는다. 규칙이 바뀌면 **두 곳을 함께 고쳐야 한다.**
 */
export function docxFileName(title: string): string {
  // 제어문자는 **이스케이프로** 적는다. 원시 바이트로 박아 두면 편집기·git
  // diff·grep 에는 다른 정규식으로 보이는데 실제로 도는 것은 그것이 아니다.
  // (hwpxFileName 이 같은 자리에서 한 번 사고를 냈고 코드리뷰에서 잡혔다)
  const safe = title
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cut = [...safe].filter(isNotLoneSurrogate).slice(0, 80).join("");
  return `${cut || "결재문서"}.docx`;
}
