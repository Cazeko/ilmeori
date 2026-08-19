/**
 * 클립보드·인쇄용 HTML — 나가는 길과 들어오는 길.
 *
 * ── 왜 클래스가 아니라 인라인 style 인가 ───────────────────────────────────
 *
 * 목적은 하나다. **한/글이나 워드에 붙여넣었을 때 표와 굵기가 살아남는 것.**
 * 붙여넣기는 스타일시트를 가져가지 않는다 — `class="doc-title"` 만 남기고
 * 그 클래스가 무슨 뜻인지는 버린다. 그래서 크기·정렬·들여쓰기·테두리를
 * 전부 `style=""` 로 적는다. 화면에서 쓰는 CSS 와 값이 겹치지만, 겹치는 쪽이
 * 「붙여넣으면 서식이 사라진다」보다 낫다.
 *
 * 표도 진짜 `<table>` 로 그린다. `<div>` 격자로 그리면 화면에서는 표처럼
 * 보이지만 붙여넣는 순간 줄바꿈만 남은 글월이 된다.
 *
 * ── 나가는 길은 순수 함수다 ────────────────────────────────────────────────
 *
 * `toHtml` 은 DOM 을 만지지 않는다. 서버에서도 돌아야 하기 때문이다 —
 * 인쇄 화면은 자바스크립트 없이도 그려져야 한다. 이 파일 **최상단에서 DOM 을
 * 부르지 않는 것**도 같은 이유다. `fromHtml` 은 브라우저에서만 불리지만
 * 이 파일 자체는 서버 번들에도 들어간다.
 *
 * ── 들어오는 길은 아무것도 믿지 않는다 ─────────────────────────────────────
 *
 * `fromHtml` 이 받는 것은 사용자가 어디선가 복사해 온 HTML 이다. 한/글과
 * 워드는 `<o:p>`·`mso-` 스타일·의미 없는 `<span>` 중첩을 잔뜩 붙여 보낸다.
 * **아는 태그만 살리고 나머지는 글자만 건진다.** 그리고 결과는 반드시
 * `parseRichDoc()` 를 통과시킨다 — 이 파일이 실수해도 문서 모델은 안 깨진다.
 */

import {
  emptyDoc,
  normalizeSpans,
  parseRichDoc,
  spansText,
  ALIGNS,
  BLOCK_META,
  MARKS,
  HIGHLIGHTS,
  TEXT_COLORS,
  clampIndent,
  computeOrdinals,
  markerFor,
  type Align,
  type BlockKind,
  type Highlight,
  type Mark,
  type RichDoc,
  type Span,
  type TableCell,
  type TableData,
  type TableRow,
  type TextColor,
} from "./model";
// 글자색은 한/글·워드 파일과 **같은 표**를 본다. 여기만 다른 값을 쓰면
// 「붙여넣은 글」과 「내려받은 파일」의 색이 갈린다. (가져오는 것은 상수 하나뿐이고,
//  to-hwpx.ts 가 pack.ts 에서 타입만 가져오므로 node:zlib 이 딸려 오지 않는다)
import { DOC_COLOR } from "./to-hwpx";

// ===========================================================================
// 0. 이스케이프
//
// 직접 쓴다. 사용자 글이 그대로 들어오는 자리이고, 라이브러리를 하나 더 다는
// 것보다 열 줄을 읽는 편이 낫다. `&apos;` 는 HTML 4 에 없는 이름이라
// **`&#39;` 로 적는다** — XML 쪽(pack.ts 의 esc)과 다른 유일한 자리다.
// ===========================================================================

function esc(text: string): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c === 0x09 || c === 0x0a || c === 0x0d) {
      out += " ";
      continue;
    }
    // 제어문자와 짝 잃은 서로게이트는 버린다. 남겨 두면 붙여넣은 쪽에서
    // 물음표 마름모(U+FFFD)가 되어 인용문 끝에 붙는다.
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
    else if (ch === "'") out += "&#39;";
    else out += ch;
  }
  return out;
}

// ===========================================================================
// 1. 나가는 길
// ===========================================================================

/** 형광펜 색. globals.css 의 상태 배경 토큰을 그대로 쓴다(대비를 재 둔 값). */
const HIGHLIGHT_CSS: Record<Highlight, string> = {
  none: "",
  yellow: "#FFF3DB",
  green: "#EAF6EC",
  blue: "#E7F4FE",
  pink: "#FDEFEC",
};

/** 들여쓰기 한 단(mm). HWPX 의 1700 HWPUNIT ≈ 6mm 과 같은 길이다. */
const INDENT_MM = 6;

/**
 * 문단 갈래마다의 모양.
 *
 * 크기는 HWPX·DOCX 와 같은 값이다(16 / 11.5 / 10.5 / 10 / 9 pt). 세 길로
 * 나간 같은 문서가 서로 다른 모양이면, 어느 것이 「그 문서」인지 알 수 없다.
 */
type BlockStyle = { tag: string; css: string };

const BLOCK_STYLE: Record<BlockKind, BlockStyle> = {
  title: {
    tag: "h1",
    css: "font-size:16pt;font-weight:700;text-align:center;margin:0 0 8pt",
  },
  heading: {
    tag: "h2",
    css: "font-size:11.5pt;font-weight:700;margin:10pt 0 3pt",
  },
  subheading: {
    tag: "h3",
    css: "font-size:10.5pt;font-weight:700;margin:8pt 0 2pt",
  },
  body: { tag: "p", css: "font-size:10pt;margin:0 0 2pt;text-align:justify" },
  bullet: { tag: "p", css: "font-size:10pt;margin:0 0 2pt" },
  numbered: { tag: "p", css: "font-size:10pt;margin:0 0 2pt" },
  quote: {
    tag: "blockquote",
    css: "font-size:10pt;margin:4pt 0;padding-left:4mm;border-left:2px solid #CDD1D5",
  },
  source: { tag: "p", css: "font-size:9pt;color:#58616A;margin:0 0 2pt" },
  note: { tag: "p", css: "font-size:9pt;color:#58616A;margin:0 0 2pt" },
  spacer: { tag: "p", css: "font-size:10pt;margin:0" },
  divider: {
    tag: "hr",
    css: "border:none;border-top:1px solid #33363D;margin:6pt 0",
  },
  pagebreak: { tag: "div", css: "" },
  table: { tag: "table", css: "" },
};

/** 갈래마다의 기본 들여쓰기(단). 여기에 블록의 indent 가 더해진다. */
const BASE_INDENT: Partial<Record<BlockKind, number>> = {
  bullet: 1,
  numbered: 1,
  source: 1,
};

function spanHtml(span: Span): string {
  const marks = span.m ?? [];
  const color = DOC_COLOR[span.c ?? "default"];
  const highlight = HIGHLIGHT_CSS[span.h ?? "none"];

  let inner = esc(span.t);
  // 안쪽부터 감싼다. 순서를 뒤집어도 보이는 것은 같지만, 한/글은 바깥 태그를
  // 먼저 읽고 안쪽을 버리는 경우가 있어 **뜻이 강한 것을 안쪽에** 둔다.
  if (marks.includes("sup")) inner = `<sup>${inner}</sup>`;
  if (marks.includes("sub")) inner = `<sub>${inner}</sub>`;
  if (marks.includes("s")) inner = `<s>${inner}</s>`;
  if (marks.includes("u")) inner = `<u>${inner}</u>`;
  if (marks.includes("i")) inner = `<em>${inner}</em>`;
  if (marks.includes("b")) inner = `<strong>${inner}</strong>`;

  const css =
    (color !== DOC_COLOR.default ? `color:${color};` : "") +
    (highlight ? `background-color:${highlight};` : "");
  return css ? `<span style="${css}">${inner}</span>` : inner;
}

function spansHtml(spans: readonly Span[]): string {
  return spans.map(spanHtml).join("");
}

function cellHtml(cell: TableCell, head: boolean): string {
  const tag = head ? "th" : "td";
  const align = cell.align ?? (head ? "center" : "left");
  const css =
    "border:1px solid #33363D;padding:1.5mm 2mm;font-size:10pt;" +
    `text-align:${align};vertical-align:middle` +
    (head ? ";font-weight:700;background-color:#F0F1F2" : "");
  const span = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
  const body = spansHtml(cell.spans) || "&#160;";
  const data = cell.align ? ` data-a="${cell.align}"` : "";
  return `<${tag}${span}${data} style="${css}">${body}</${tag}>`;
}

function tableHtml(table: TableData): string {
  const total = table.widths.reduce((n, w) => n + w, 0) || 1;
  const cols = table.widths
    .map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%"/>`)
    .join("");
  const rows = table.rows
    .map(
      (row: TableRow, i) =>
        `<tr>${row.cells.map((c) => cellHtml(c, table.header && i === 0)).join("")}</tr>`,
    )
    .join("");
  // `border-collapse:collapse` 가 없으면 붙여넣은 쪽에서 칸마다 두 줄이 그어진다.
  // 너비 비율은 `data-w` 로도 적어 둔다 — 우리 편집기끼리 오갈 때 되살리려고.
  return (
    `<table data-k="table" data-w="${table.widths.join(",")}"` +
    (table.header ? ` data-h="1"` : "") +
    ` style="border-collapse:collapse;width:100%;margin:4pt 0">` +
    `<colgroup>${cols}</colgroup><tbody>${rows}</tbody></table>`
  );
}

/**
 * 서식 문서를 HTML 한 덩어리로.
 *
 * `forClipboard` 가 켜지면 **문단마다 글꼴을 적는다.** 붙여넣기를 받는 쪽이
 * 바깥 컨테이너를 통째로 버리는 일이 있어서다. 인쇄용은 바깥 `<div>` 한 번이면
 * 되므로 그렇게 하지 않는다 — 같은 문서에서 글꼴 선언이 수백 번 되풀이되면
 * 인쇄 미리보기가 눈에 띄게 느려진다.
 *
 * ⚠ 실제로 한/글·워드에 붙여넣어 본 적이 없다. 확인한 것은 「이 함수가
 * 무엇을 내놓는가」까지다(tests/docx.test.mjs).
 */
export function toHtml(doc: RichDoc, opts?: { forClipboard?: boolean }): string {
  const clip = opts?.forClipboard === true;
  const font = "font-family:'함초롬바탕','맑은 고딕',serif;color:#000000";
  const ordinals = computeOrdinals(doc.blocks);
  const parts: string[] = [];

  doc.blocks.forEach((block, i) => {
    const style = BLOCK_STYLE[block.kind];

    if (block.kind === "table") {
      parts.push(block.table ? tableHtml(block.table) : "");
      return;
    }
    if (block.kind === "divider") {
      parts.push(`<hr data-k="divider" style="${style.css}"/>`);
      return;
    }
    if (block.kind === "pagebreak") {
      // 붙여넣기에는 쪽 나눔이 따라가지 않는다. 그 자리에 빈 줄 하나를 두는 편이
      // 아무것도 없는 것보다 원래 문서에 가깝다.
      parts.push(
        clip
          ? `<p data-k="pagebreak" style="${font};margin:0">&#160;</p>`
          : `<div data-k="pagebreak" style="page-break-after:always;break-after:page"></div>`,
      );
      return;
    }

    const indent = (BASE_INDENT[block.kind] ?? 0) + clampIndent(block.indent);
    const marker = markerFor(block.kind, block.indent ?? 0, ordinals[i]);
    const css =
      style.css +
      (indent > 0 ? `;margin-left:${indent * INDENT_MM}mm` : "") +
      (block.align ? `;text-align:${block.align}` : "") +
      (clip ? `;${font}` : "");

    const body =
      // 번호·글머리표는 **글자로 굽는다.** `<ol>` 로 넘기면 「1. 가. 1)」이라는
      // 시행규칙의 순서를 받는 쪽 브라우저·편집기가 자기 규칙으로 다시 매긴다.
      // 되읽을 때 이 부호만 도로 걷어내려고 `data-marker` 를 달아 둔다.
      (marker ? `<span data-marker="1">${esc(marker)} </span>` : "") +
      (spansHtml(block.spans) || (block.kind === "spacer" ? "&#160;" : ""));

    // `data-*` 는 우리 편집기끼리 오갈 때의 유일한 출처다. 갈래마다의 기본
    // 정렬이 style 에 박혀 나가므로(본문은 text-align:justify), 되읽을 때
    // style 을 보면 **정렬을 지정한 적 없는 문단에 정렬이 붙어 돌아온다.**
    const attrs =
      ` data-k="${block.kind}"` +
      (block.indent ? ` data-in="${clampIndent(block.indent)}"` : "") +
      (block.align ? ` data-a="${block.align}"` : "") +
      ` style="${css}"`;
    parts.push(`<${style.tag}${attrs}>${body}</${style.tag}>`);
  });

  const wrap = clip ? font : `${font};font-size:10pt;line-height:1.6`;
  return `<div data-ilmeori="1" style="${wrap}">${parts.join("")}</div>`;
}

// ===========================================================================
// 2. 들어오는 길
// ===========================================================================

/** 살릴 인라인 태그 → 마크. 이 표에 없는 인라인 태그는 글자만 건진다. */
const INLINE_MARK: Record<string, Mark> = {
  STRONG: "b",
  B: "b",
  EM: "i",
  I: "i",
  U: "u",
  S: "s",
  STRIKE: "s",
  SUP: "sup",
  SUB: "sub",
};

/** 통째로 버릴 태그. 안의 글자도 살리지 않는다. */
const DROP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "HEAD",
  "META",
  "LINK",
  "TITLE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
]);

/** 제목 태그 → 갈래. h4 아래는 만들지 않는다 — 우리 서식에 그 단이 없다. */
const HEADING_KIND: Record<string, BlockKind> = {
  H1: "title",
  H2: "heading",
  H3: "subheading",
  H4: "subheading",
};

type InlineStyle = { marks: Mark[]; color: TextColor; highlight: Highlight };

type WalkCtx = {
  style: InlineStyle;
  /** 목록 안이면 그 갈래와 깊이(1부터). */
  list: { kind: "bullet" | "numbered"; depth: number } | null;
};

/** 정규화를 거치기 전의 블록. id 는 parseRichDoc 가 붙여 준다. */
type RawBlock = {
  kind: BlockKind;
  spans: Span[];
  align?: Align;
  indent?: number;
  table?: TableData;
  /**
   * 글자 맨 앞의 부호를 걷어내도 되는 문단인가.
   *
   * `data-k` 를 달고 온(= 우리가 내보낸) 문단인데 `data-marker` 표시가 없을 때만
   * 참이다. 왜 이 조건이 필요한지는 stripMarker 주석에 적었다. parseRichDoc 는
   * 모르는 칸을 무시하므로 그대로 넘겨도 문서에 남지 않는다.
   */
  strip?: boolean;
};

/**
 * 글을 모아 블록으로 떨어뜨리는 그릇.
 *
 * `<p>` 하나가 블록 하나가 되는 것이 보통이지만 `<br>` 이 그것을 깬다.
 * 그래서 「지금 모으는 중인 문단」을 밖에 두고, 경계에서만 떨어뜨린다.
 */
class Sink {
  readonly blocks: RawBlock[] = [];
  /**
   * 이 HTML 이 우리 toHtml 에서 나온 것인가(`data-ilmeori="1"`).
   *
   * 「붙여넣기가 만든 잡음」과 「사람이 친 빈 줄」을 가르는 유일한 단서다.
   * fromHtml 이 끝의 빈 줄을 걷어낼지 말지를 이 값으로 정한다.
   */
  sawOurs = false;
  private spans: Span[] = [];
  private kind: BlockKind = "body";
  private align: Align | undefined;
  private indent = 0;
  /** 지금 모으는 문단이 `data-k` 를 달고 왔는가. */
  private ours = false;
  /** 지금 모으는 문단에서 `data-marker` 토막을 이미 버렸는가. */
  private markerSeen = false;

  shape(
    kind: BlockKind,
    indent: number,
    align: Align | undefined,
    ours = false,
  ): void {
    this.kind = kind;
    this.indent = indent;
    this.align = align;
    this.ours = ours;
  }

  /** `data-marker` 토막을 버렸다고 알린다. 부호는 이미 없어졌다는 뜻이다. */
  markerDropped(): void {
    this.markerSeen = true;
  }

  text(raw: string, style: InlineStyle): void {
    // 붙임없는 공백(U+00A0)은 보통 공백으로 눕힌다. 워드가 들여쓰기 대신
    // 이것을 줄줄이 넣는데, 그대로 두면 낱말 사이가 안 끊기는 글이 된다.
    const text = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    if (!text) return;
    // 문단 첫머리의 공백만 버린다. 「가 나」의 가운데 공백은 뜻이 있다.
    if (text === " " && this.spans.length === 0) return;
    const span: Span = { t: text };
    if (style.marks.length > 0) span.m = [...style.marks];
    if (style.color !== "default") span.c = style.color;
    if (style.highlight !== "none") span.h = style.highlight;
    this.spans.push(span);
  }

  /** `<br>` — 같은 갈래로 다음 줄을 시작한다. */
  lineBreak(): void {
    this.flush(true);
  }

  /** 표·가로줄처럼 글이 아닌 블록. */
  add(block: RawBlock): void {
    this.flush(false);
    this.blocks.push(block);
  }

  /**
   * 모아 둔 글을 블록 하나로.
   *
   * `force` 가 아니면 빈 문단은 버린다 — 태그 사이의 줄바꿈·들여쓰기가 그대로
   * 빈 블록이 되면 붙여넣은 글의 절반이 빈 줄이 된다.
   */
  flush(force: boolean): void {
    const spans = trimSpans(this.spans);
    this.spans = [];
    // 부호를 걷어낼지는 **문단 하나에 한 번만** 따진다. 물려주면 `<br>` 로
    // 갈라진 둘째 줄이 첫 줄의 표시를 물려받아, 사람이 친 「2. 」이 잘린다.
    // (우리 toHtml 은 `<br>` 를 쓰지 않지만, 우리 HTML 이 워드를 한 번 거치면
    //  워드가 넣는다)
    const markerSeen = this.markerSeen;
    const ours = this.ours;
    this.markerSeen = false;
    this.ours = false;
    if (spans.length === 0 && !force) return;
    if (spans.length === 0) {
      // 빈 문단은 빈 줄로 읽는다. 워드는 빈 줄을 `<p><o:p>&nbsp;</o:p></p>` 로
      // 보내는데, 그것을 그냥 버리면 문단이 다 달라붙는다.
      this.blocks.push({ kind: this.kind === "body" ? "spacer" : this.kind, spans: [] });
      return;
    }
    const block: RawBlock = { kind: this.kind, spans };
    if (this.align) block.align = this.align;
    if (this.indent > 0) block.indent = this.indent;
    if (ours && !markerSeen) block.strip = true;
    this.blocks.push(block);
  }
}

/** 앞뒤에 붙은 공백을 걷어낸다. 붙여넣은 글은 거의 언제나 이것을 달고 온다. */
function trimSpans(spans: readonly Span[]): Span[] {
  const out = spans.map((s) => ({ ...s }));
  while (out.length > 0) {
    out[0].t = out[0].t.replace(/^\s+/, "");
    if (out[0].t) break;
    out.shift();
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    last.t = last.t.replace(/\s+$/, "");
    if (last.t) break;
    out.pop();
  }
  return normalizeSpans(out);
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? "";
}

/**
 * 인라인 style 에서 값 하나를 꺼낸다.
 *
 * `mso-` 로 시작하는 것은 워드가 붙이는 것이라 애초에 찾지 않는다 —
 * 우리가 아는 속성 이름만 물어보므로 자동으로 걸러진다.
 */
function styleValue(el: Element, prop: string): string {
  const style = attr(el, "style").toLowerCase();
  if (!style) return "";
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(style);
  return m ? m[1].trim() : "";
}

function asAlign(raw: string): Align | undefined {
  return (ALIGNS as readonly string[]).includes(raw) ? (raw as Align) : undefined;
}

/**
 * 정렬을 어디서 읽을 것인가.
 *
 * 우리가 내보낸 것(`data-k` 가 붙어 있다)이면 `data-a` 만 본다. 갈래마다의 기본
 * 정렬이 style 에 박혀 나가기 때문에 — 본문은 `text-align:justify`, 제목은
 * `center` — style 을 읽으면 **정렬을 지정한 적 없는 문단 전부에 정렬이 붙어
 * 돌아온다.** 남이 준 HTML 이면 그때는 style·align 밖에 단서가 없다.
 *
 * 표 칸에는 `data-k` 가 없어서(갈래는 표 하나가 들고 있다) 「우리 것인가」를
 * 밖에서 알려 준다.
 */
function readAlign(el: Element, ours = false): Align | undefined {
  if (ours || attr(el, "data-k")) return asAlign(attr(el, "data-a"));
  return asAlign(styleValue(el, "text-align") || attr(el, "align").toLowerCase());
}

function readColor(el: Element): TextColor | null {
  // 임의의 hex 는 받지 않는다(model.ts 의 TEXT_COLORS 주석 — 대비가 조용히
  // 깨진다). 우리가 내보낸 색만 되읽고, 남의 색은 검정으로 떨어뜨린다.
  const raw = styleValue(el, "color");
  if (!raw) return null;
  for (const name of TEXT_COLORS) {
    if (raw === DOC_COLOR[name].toLowerCase()) return name;
  }
  return null;
}

/** 형광펜도 되읽는다 — 편집기 안에서 오려 붙일 때 표시가 살아 있어야 한다. */
function readHighlight(el: Element): Highlight | null {
  const raw = styleValue(el, "background-color") || styleValue(el, "background");
  if (!raw) return null;
  for (const name of HIGHLIGHTS) {
    const css = HIGHLIGHT_CSS[name];
    if (css && raw === css.toLowerCase()) return name;
  }
  return null;
}

/** `<span style="font-weight:bold">` 처럼 태그 대신 스타일로 온 서식. */
function marksFromStyle(el: Element): Mark[] {
  const out: Mark[] = [];
  const weight = styleValue(el, "font-weight");
  if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) out.push("b");
  const fontStyle = styleValue(el, "font-style");
  if (fontStyle === "italic" || fontStyle === "oblique") out.push("i");
  const deco = styleValue(el, "text-decoration") + " " + styleValue(el, "text-decoration-line");
  if (deco.includes("underline")) out.push("u");
  if (deco.includes("line-through")) out.push("s");
  return out;
}

function addMarks(style: InlineStyle, marks: readonly Mark[]): InlineStyle {
  if (marks.length === 0) return style;
  const set = new Set([...style.marks, ...marks]);
  return { ...style, marks: MARKS.filter((m) => set.has(m)) };
}

function childrenOf(node: Node): ChildNode[] {
  return Array.from(node.childNodes);
}

/** 이 요소 아래에서 태그 이름이 맞는 것을 찾되, **중첩된 표 안으로는 안 들어간다.** */
function descend(el: Element, names: ReadonlySet<string>, stopAt: string): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toUpperCase();
    if (names.has(tag)) out.push(child);
    else if (tag !== stopAt) out.push(...descend(child, names, stopAt));
  }
  return out;
}

const TR = new Set(["TR"]);
const TD = new Set(["TD", "TH"]);

/** 격자를 채우려고 넣는 빈 칸. id 는 parseRichDoc 가 붙인다. */
function blankCell(): TableCell {
  return { id: "", spans: [] };
}

/** 이 줄이 먹는 열 수. 가로 병합을 펼친 값이다. */
function rowWidth(row: TableRow): number {
  return row.cells.reduce((n, c) => n + Math.max(1, c.colSpan ?? 1), 0);
}

/**
 * 붙여넣은 표를 **네모진 격자**로 눕힌다.
 *
 * ── 세로 병합을 왜 여기서 푸는가 ───────────────────────────────────────────
 *
 * 우리 모델에는 세로 병합이 없다(model.ts 의 TableCell — pack.ts 가 rowSpan 을
 * 안 쓰기로 한 것과 같은 판단). 그런데 한/글·워드는 칸 맞추기로 세로 병합을
 * 아주 흔히 쓴다. `rowspan` 을 그냥 무시하면 아래 줄의 칸이 **왼쪽으로 밀려**
 * 다른 열의 값이 되고, 줄마다 칸 수가 달라진 채로 내보내기까지 간다.
 * 그 상태의 표는 OWPML 격자에 「칸이 아예 없는 자리」를 만들어 한/글이 표를
 * 못 그린다(내보내기 쪽에도 같은 방어를 두었지만, 값이 엉뚱한 열에 들어가는
 * 것은 여기서만 막을 수 있다).
 *
 * 그래서 세로 병합이 먹는 자리를 **빈 칸으로 펼친다.** 병합선은 잃지만 값의
 * 자리는 지킨다 — 표에서 더 중한 것은 「어느 열의 값인가」다.
 *
 * ⚠ HTML 표 배치 알고리즘 전부를 옮긴 것은 아니다. 이어진 자리만 채우므로,
 * 줄 중간에 구멍이 난 기형 표에서는 자리가 어긋날 수 있다. 그때도 아래의
 * 네모 맞추기가 「칸이 없는 자리」만은 없앤다.
 */
function readTable(el: Element, ctx: WalkCtx): TableData | null {
  const trs = descend(el, TR, "TABLE");
  if (trs.length === 0) return null;

  const ours = attr(el, "data-k") === "table";
  let sawHeader = false;
  const rows: TableRow[] = [];
  /** 열마다 「위 줄에서 내려온 세로 병합이 몇 줄 남았는가」. */
  const carry: number[] = [];

  for (const tr of trs) {
    const cells: TableCell[] = [];
    let col = 0;
    const fillCarried = () => {
      while ((carry[col] ?? 0) > 0) {
        carry[col] -= 1;
        cells.push(blankCell());
        col += 1;
      }
    };

    for (const td of descend(tr, TD, "TABLE")) {
      fillCarried();
      if (td.tagName.toUpperCase() === "TH") sawHeader = true;
      const span = Number(attr(td, "colspan"));
      const down = Number(attr(td, "rowspan"));
      const cell: TableCell = {
        // id 는 비워 둔다 — parseRichDoc 가 붙인다. 여기서 지어내면 붙여넣기
        // 한 번에 같은 id 가 두 번 생길 수 있다.
        id: "",
        spans: cellSpans(td, ctx),
      };
      const align = readAlign(td, ours);
      if (align) cell.align = align;
      const wide = Number.isFinite(span) && span > 1 ? Math.floor(span) : 1;
      if (wide > 1) cell.colSpan = wide;
      cells.push(cell);
      if (Number.isFinite(down) && down > 1) {
        for (let k = 0; k < wide; k += 1) carry[col + k] = Math.floor(down) - 1;
      }
      col += wide;
    }
    fillCarried();
    if (cells.length > 0) rows.push({ cells });
  }
  if (rows.length === 0) return null;

  const cols = Math.max(1, ...rows.map(rowWidth));
  // 짧은 줄을 빈 칸으로 채운다. 내보내기가 colCnt 로 선언한 격자에 구멍이
  // 남으면 한/글·워드가 표를 통째로 못 그린다.
  for (const row of rows) {
    for (let w = rowWidth(row); w < cols; w += 1) row.cells.push(blankCell());
  }
  const declared = attr(el, "data-w")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const widths = declared.length === cols ? declared : new Array(cols).fill(1);
  const header = attr(el, "data-h") === "1" || sawHeader;
  return { widths, header, rows };
}

/**
 * 칸 하나의 글자.
 *
 * 칸 안에 문단이 여럿 있어도 우리 표는 한 칸에 한 줄이다. 줄바꿈으로 잇지 않고
 * 공백으로 잇는 이유는, 모델의 칸이 여러 줄을 담지 못해서 어차피 눕혀야 하고
 * 줄바꿈 글자를 남기면 내보낼 때 XML 에서 공백으로 바뀌기 때문이다.
 *
 * ── 칸 안의 표 ─────────────────────────────────────────────────────────────
 *
 * 한/글·워드는 칸 맞추기로 표 안에 표를 자주 넣는다. 모델의 칸이 표를 담지
 * 못하는 것은 맞지만, 그렇다고 **글자까지 버리면 안 된다** — 그 칸에 적힌 숫자가
 * 붙여넣기 한 번에 조용히 없어진다. 구조는 잃되 글자는 이어 붙인다.
 */
function cellSpans(td: Element, ctx: WalkCtx): Span[] {
  const sink = new Sink();
  walkChildren(td, ctx, sink);
  sink.flush(false);
  const merged: Span[] = [];
  for (const block of sink.blocks) {
    const spans =
      block.kind === "table" && block.table ? flattenTable(block.table) : block.spans;
    if (spans.length === 0) continue;
    if (merged.length > 0) merged.push({ t: " " });
    merged.push(...spans);
  }
  return normalizeSpans(merged);
}

/** 표 하나를 글자 한 줄로 눕힌다. 칸 사이는 공백 하나. */
function flattenTable(table: TableData): Span[] {
  const out: Span[] = [];
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.spans.length === 0) continue;
      if (out.length > 0) out.push({ t: " " });
      out.push(...cell.spans);
    }
  }
  return out;
}

function walkChildren(node: Node, ctx: WalkCtx, sink: Sink): void {
  for (const child of childrenOf(node)) walk(child, ctx, sink);
}

function walk(node: Node, ctx: WalkCtx, sink: Sink): void {
  // 3 = 글자마디, 1 = 요소. 상수를 이름(Node.TEXT_NODE)으로 부르지 않는 이유는
  // 이 파일이 서버 번들에도 들어가기 때문이다 — 거기엔 Node 가 없다.
  if (node.nodeType === 3) {
    sink.text((node as Text).data ?? "", ctx.style);
    return;
  }
  if (node.nodeType !== 1) return;

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  // 이름에 `:` 가 있는 것은 오피스가 붙이는 것이다(`<o:p>`, `<w:sdt>`).
  // 안의 글자는 거의 언제나 붙임없는 공백 하나뿐이라 통째로 버린다.
  if (DROP_TAGS.has(tag) || tag.includes(":")) return;

  // 우리가 내보낸 HTML 인가. 끝의 빈 줄을 걷어낼지 말지가 여기에 달렸다.
  if (attr(el, "data-ilmeori") === "1") sink.sawOurs = true;

  // 우리가 구워 넣은 번호·글머리표. 갈래가 다시 그려 주므로 글자로 남기지
  // 않는다. 버렸다고 알려 두면 stripMarker 가 같은 자리를 두 번 자르지 않는다.
  if (attr(el, "data-marker") === "1") {
    sink.markerDropped();
    return;
  }

  if (tag === "BR") {
    sink.lineBreak();
    return;
  }
  if (tag === "HR") {
    sink.add({ kind: "divider", spans: [] });
    return;
  }
  if (tag === "TABLE") {
    const table = readTable(el, ctx);
    if (table) sink.add({ kind: "table", spans: [], table });
    return;
  }
  if (tag === "UL" || tag === "OL") {
    const kind = tag === "OL" ? "numbered" : "bullet";
    const depth = (ctx.list?.depth ?? 0) + 1;
    walkChildren(el, { ...ctx, list: { kind, depth } }, sink);
    return;
  }
  if (tag === "LI") {
    const list = ctx.list ?? { kind: "bullet" as const, depth: 1 };
    sink.flush(false);
    sink.shape(list.kind, clampIndent(list.depth - 1), readAlign(el));
    walkChildren(el, ctx, sink);
    sink.flush(true);
    return;
  }

  const inlineMark = INLINE_MARK[tag];
  if (inlineMark) {
    walkChildren(el, { ...ctx, style: addMarks(ctx.style, [inlineMark]) }, sink);
    return;
  }

  // 문단을 담기만 하는 `<div>`. 워드는 문서 전체를 `<div class=WordSection1>`
  // 로 감싸 보내고, 우리 toHtml 도 바깥 div 를 하나 두른다. 이것을 문단으로
  // 읽으면 붙여넣을 때마다 문서 끝에 빈 줄이 하나씩 쌓인다.
  if (isContainer(el, tag)) {
    walkChildren(el, ctx, sink);
    return;
  }

  const blockKind = blockKindOf(el, tag);
  if (blockKind) {
    sink.flush(false);
    const declared = Number(attr(el, "data-in"));
    sink.shape(
      blockKind,
      Number.isFinite(declared) ? clampIndent(declared) : 0,
      readAlign(el),
      attr(el, "data-k") !== "",
    );
    walkChildren(el, ctx, sink);
    // 빈 문단도 한 줄로 남긴다. 문단 사이의 빈 줄이 문서의 뜻이다.
    sink.flush(true);
    return;
  }

  // 우리가 모르는 태그(span, font, a, 워드가 만든 잡동사니). 태그는 버리고
  // 안의 글자와 style 로 붙은 서식만 건진다.
  const color = readColor(el);
  const highlight = readHighlight(el);
  walkChildren(
    el,
    {
      ...ctx,
      style: {
        ...addMarks(ctx.style, marksFromStyle(el)),
        color: color ?? ctx.style.color,
        highlight: highlight ?? ctx.style.highlight,
      },
    },
    sink,
  );
}

/** 문단을 여는 태그들. 이 중 하나라도 자식으로 들고 있는 div 는 그릇이다. */
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "UL",
  "OL",
  "TABLE",
  "BLOCKQUOTE",
  "HR",
  "LI",
]);

function isContainer(el: Element, tag: string): boolean {
  if (tag !== "DIV") return false;
  // 갈래를 적어 둔 div 는 그릇이 아니라 문단이다(쪽 나눔이 그렇다).
  if (attr(el, "data-k")) return false;
  return Array.from(el.children).some((c) =>
    BLOCK_TAGS.has(c.tagName.toUpperCase()),
  );
}

/** 이 요소가 문단을 여는가. `data-k` 가 있으면 그것이 먼저다(우리가 내보낸 글). */
function blockKindOf(el: Element, tag: string): BlockKind | null {
  const declared = attr(el, "data-k");
  if (declared && declared in BLOCK_META) return declared as BlockKind;
  if (tag in HEADING_KIND) return HEADING_KIND[tag];
  if (tag === "BLOCKQUOTE") return "quote";
  if (tag === "P" || tag === "DIV") return "body";
  return null;
}

/**
 * 붙여넣은 HTML 을 서식 문서로.
 *
 * **브라우저에서만 부른다.** 서버에는 DOM 이 없다. 그래서 파싱은 부르는 쪽이
 * 하고(`new DOMParser().parseFromString(html, "text/html").body`), 여기서는
 * 이미 만들어진 마디만 걷는다 — 이 파일이 서버 번들에 들어가도 아무 일도
 * 일어나지 않게 하려는 것이다.
 *
 * 결과는 반드시 `parseRichDoc()` 를 지난다. 여기서 실수해도 문서 모델은
 * 안 깨지고, id·들여쓰기 상한·표 열 수 같은 것을 한 곳에서만 정한다.
 */
export function fromHtml(root: ParentNode): RichDoc {
  const sink = new Sink();
  // ParentNode 에는 childNodes 가 없다(그 이름은 Node 쪽에 있다). 이 자리에
  // 오는 것은 언제나 Element·DocumentFragment·Document 라 셋 다 Node 다.
  walkChildren(
    root as unknown as Node,
    { style: { marks: [], color: "default", highlight: "none" }, list: null },
    sink,
  );
  sink.flush(false);

  // 우리가 내보낸 글을 되읽을 때 부호가 두 번 붙지 않게 걷어낸다.
  const blocks = sink.blocks.map(stripMarker);
  // 끝에 붙은 빈 줄.
  //
  // 남이 준 HTML 이면 붙여넣기가 만든 잡음이다 — 태그 사이의 줄바꿈·워드의
  // `<o:p>` 가 그대로 빈 문단이 된다. 그러나 **우리 toHtml 에서 나온 글이면
  // 사람이 친 빈 줄이다.** 서명란 앞의 간격 같은 것이 편집기 안에서 오려
  // 붙일 때마다 한 줄씩 사라지면, 그건 잡음 제거가 아니라 문서 훼손이다.
  // 가르는 단서는 바깥 그릇의 `data-ilmeori="1"` 뿐이다.
  if (!sink.sawOurs) {
    while (blocks.length > 0 && blocks[blocks.length - 1].kind === "spacer") blocks.pop();
  }

  return parseRichDoc({ v: 1, blocks } as unknown) ?? emptyDoc();
}

/**
 * 구워 넣은 번호·글머리표를 도로 걷어낸다.
 *
 * 나갈 때 「1. 」을 글자로 박았으므로(그래야 한/글·워드에서 번호가 다시
 * 매겨지지 않는다), 되읽을 때 그대로 두면 다음번 내보내기에서 「1. 1. 」이 된다.
 *
 * ── 언제나 돌면 안 된다 ────────────────────────────────────────────────────
 *
 * 이 검사는 **글자 모양**을 본다. 그런데 사람이 친 글도 그 모양일 수 있다 —
 * 「2026. 3. 1. 부터 시행」, 「1) 항의 뜻으로 쓴 괄호」, 「- 20% 절감」.
 * 이것을 가리지 않고 자르면 편집기 안의 복사→붙여넣기(= fromHtml(toHtml(…)))가
 * 돌 때마다 사용자 글의 앞이 한 토막씩 뜯긴다. 되풀이하면 누적된다.
 *
 * 그래서 **부호가 아직 글자로 남아 있을 수 있는 자리에서만** 돈다:
 *
 *   · `data-marker` 토막을 이미 버린 문단  → 부호는 없어졌다. 돌지 않는다
 *   · 진짜 `<li>` 에서 온 문단             → 부호는 브라우저가 그린 것이라
 *                                            글자에 없다. 돌지 않는다
 *   · `data-k` 는 살아남았는데 `data-marker` 는 날아간 문단 → 여기만 돈다
 *     (다른 편집기를 거치며 속성 하나가 떨어져 나간 경우)
 *
 * 그 판단을 Sink 가 `strip` 으로 적어 준다.
 */
function stripMarker(block: RawBlock): RawBlock {
  if (block.strip !== true) return block;
  if (block.kind !== "bullet" && block.kind !== "numbered") return block;
  const text = spansText(block.spans);
  const m = /^(?:[0-9]+[.)]|\([0-9]+\)|[가-힣][.)]|\([가-힣]\)|[○\-·▪◦‣])\s+/.exec(text);
  if (!m) return block;
  const cut = m[0].length;
  let left = cut;
  const spans: Span[] = [];
  for (const s of block.spans) {
    if (left >= s.t.length) {
      left -= s.t.length;
      continue;
    }
    spans.push({ ...s, t: s.t.slice(left) });
    left = 0;
  }
  return { ...block, spans: normalizeSpans(spans) };
}
