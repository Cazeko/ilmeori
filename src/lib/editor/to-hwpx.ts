/**
 * 서식 문서(RichDoc) → 한/글 파일(HwpxDoc).
 *
 * ── 이 파일이 하는 일은 「옮기기」뿐이다 ───────────────────────────────────
 *
 * 판단은 두 곳에 이미 있다. 무엇이 어떤 갈래인가는 `model.ts` 가, 그 갈래를
 * 어떤 크기·들여쓰기로 그릴 것인가는 `hwpx/pack.ts` 의 KIND_STYLE 이 정한다.
 * 여기서는 세 가지만 한다 — 갈래 이름 맞추기, 번호·글머리표를 **글자로 굽기**,
 * 토막(Span)을 토막(HwpxRun)으로 옮기기.
 *
 * ── 번호를 왜 글자로 굽는가 ────────────────────────────────────────────────
 *
 * 한/글의 자동 번호(개요)를 쓰지 않는다. 이유는 pack.ts 의 `numberings()`
 * 주석에 적혀 있다 — 「1-가.」는 「행정업무의 운영 및 혁신에 관한 규정
 * 시행규칙」제2조가 정한 **이름**이지 자동 번호가 아니다. 자동 번호로 넘기면
 * 받는 사람이 한/글에서 문단 하나를 옮기는 순간 번호가 다시 매겨지고,
 * 그러면 결재 문서 안의 「2. 사전 검토」라는 **고유명사**가 바뀐다.
 * 화면에서 본 번호와 파일 안의 번호가 같아야 한다.
 *
 * ── 옮기지 못하는 것 ───────────────────────────────────────────────────────
 *
 * 형광펜(Span.h)은 버린다. HwpxRun 에 자리를 두지 않았다 — 형광펜은 「읽는
 * 중 표시」이지 결재로 나가는 문서의 내용이 아니라고 보았다. 이 판단이 틀렸다면
 * 고칠 자리는 여기가 아니라 HwpxRun 이다.
 *
 * **DOCX 도 같은 판단을 따른다**(docx.ts 의 runXml). OOXML 은 `w:highlight`·
 * `w:shd` 로 넣을 수 있지만, 한쪽만 넣으면 같은 문서를 두 파일로 내려받았을 때
 * 색칠이 다르다. 클립보드 HTML 에만 남는 것은 편집기끼리 오려 붙일 때 표시가
 * 살아 있어야 하기 때문이고, 그것은 파일이 아니다.
 */

import type {
  HwpxAlign,
  HwpxCell,
  HwpxDoc,
  HwpxParagraph,
  HwpxRun,
  HwpxTable,
} from "../hwpx/pack";
import {
  BLOCK_META,
  clampIndent,
  computeOrdinals,
  markerFor,
  spansText,
  type Block,
  type RichDoc,
  type Span,
  type TableData,
  type TextColor,
} from "./model";

/**
 * 글자색 토큰 → 문서 파일에 적는 `#RRGGBB`.
 *
 * 값은 `globals.css` 의 KRDS 토큰 그대로다(대비를 이미 재 둔 값이라 여기서
 * 다시 고르지 않는다). 다만 `default` 만은 화면의 gray-90(#1e2124)이 아니라
 * **순검정**이다 — 종이와 공문서의 본문색은 검정이고, 화면에서 눈이 편하라고
 * 한 칸 내린 값을 인쇄물까지 가져가면 옅게 나온다.
 *
 * HWPX·DOCX·클립보드 HTML 이 **같은 표 하나**를 본다. 세 벌로 베껴 두면
 * 색을 한 번 고쳤을 때 내려받은 파일과 붙여넣은 글의 색이 갈린다.
 * (이 파일에 두는 것은 여기가 이 표를 처음 필요로 한 자리이기 때문이고,
 *  pack.ts 에서 가져오는 것은 **타입뿐**이라 브라우저 번들에 node:zlib 이
 *  딸려 오지 않는다 — html.ts 가 이 표를 가져다 쓸 수 있는 이유다)
 */
export const DOC_COLOR: Record<TextColor, string> = {
  default: "#000000",
  primary: "#004696",
  accent: "#A55221",
  danger: "#DE3412",
  gray: "#58616A",
};

/** 토막 하나를 옮긴다. 기본값인 것은 적지 않는다 — 적으면 참조가 늘어난다. */
function toRuns(spans: readonly Span[]): HwpxRun[] {
  const out: HwpxRun[] = [];
  for (const s of spans) {
    if (!s.t) continue;
    const marks = s.m ?? [];
    const run: HwpxRun = { text: s.t };
    if (marks.includes("b")) run.bold = true;
    if (marks.includes("i")) run.italic = true;
    if (marks.includes("u")) run.underline = true;
    if (marks.includes("s")) run.strike = true;
    if (marks.includes("sup")) run.sup = true;
    if (marks.includes("sub")) run.sub = true;
    const color = DOC_COLOR[s.c ?? "default"];
    if (color !== DOC_COLOR.default) run.color = color;
    out.push(run);
  }
  return out;
}

/**
 * 부호를 글자로 앞에 붙인다.
 *
 * 부호에는 뒤 글의 서식을 물려주지 않는다. 첫 낱말이 굵다고 「1.」까지 굵어지면
 * 같은 목록 안에서 번호 굵기가 줄마다 달라져, 서식이 아니라 실수로 보인다.
 */
function withMarker(marker: string, runs: HwpxRun[]): HwpxRun[] {
  if (!marker) return runs;
  return [{ text: `${marker} ` }, ...runs];
}

function toTable(table: TableData): HwpxTable {
  const rows = table.rows.map((row, rowIndex) => ({
    cells: row.cells.map((c): HwpxCell => {
      const head = table.header && rowIndex === 0;
      const runs = toRuns(c.spans);
      const cell: HwpxCell = { text: spansText(c.spans) };
      if (runs.length > 0) cell.runs = runs;
      // 첫 줄이 칸 이름이면 굵게. 표는 「무엇을 읽는 표인가」가 첫 줄에 있고,
      // 그 줄이 본문과 같은 굵기면 쪽이 넘어갔을 때 어느 줄이 머리인지 잃는다.
      if (head) cell.bold = true;
      // 정렬을 **반드시 적는다.** 비워 두면 pack.ts 가 가운데로 그린다 —
      // 결재란(approval-export)이 오래 그렇게 써 왔고 그 기본값은 못 바꾼다.
      // 그런데 서식 문서의 표는 화면·클립보드 HTML·DOCX 가 모두 「머리줄만
      // 가운데, 본문 칸은 왼쪽」이라, 안 적으면 한/글에서만 본문 칸이 가운데로
      // 나온다. 같은 문서가 네 자리에서 달라 보이면 어느 것이 그 문서인지
      // 답할 수 없다(docx.ts 머리말과 같은 규칙).
      cell.align = (c.align ?? (head ? "center" : "left")) as HwpxAlign;
      if (c.colSpan && c.colSpan > 1) cell.colSpan = c.colSpan;
      return cell;
    }),
  }));
  return { widths: table.widths, rows };
}

function toParagraph(block: Block, ordinal: number): HwpxParagraph | null {
  const indent = clampIndent(block.indent);
  const align = block.align as HwpxAlign | undefined;
  const runs = toRuns(block.spans);
  const text = spansText(block.spans);

  switch (block.kind) {
    case "spacer":
      return { kind: "spacer" };
    case "divider":
      return { kind: "divider" };
    case "pagebreak":
      return { kind: "pagebreak" };
    case "table":
      // 표 없는 table 블록은 parseRichDoc 가 만들지 않지만, 이 함수는 정규화를
      // 거치지 않은 값도 받을 수 있으므로 조용히 버린다.
      return block.table ? { kind: "table", table: toTable(block.table) } : null;

    case "bullet":
    case "numbered": {
      const marker = markerFor(block.kind, indent, ordinal);
      return {
        kind: "bullet",
        text: marker ? `${marker} ${text}` : text,
        runs: withMarker(marker, runs),
        ...(align ? { align } : {}),
        ...(indent ? { indent } : {}),
      };
    }

    default: {
      // title · heading · subheading · body · quote · source · note 는
      // pack.ts 에 같은 이름의 갈래가 있다. 이름을 맞춰 둔 것이 이 대응을
      // 표로 적을 필요를 없앤다.
      return {
        kind: block.kind,
        text,
        ...(runs.length > 0 ? { runs } : {}),
        ...(align ? { align } : {}),
        ...(indent ? { indent } : {}),
      };
    }
  }
}

/**
 * `meta.title` 이 어느 블록에서 나왔는가.
 *
 * `model.ts` 의 `docTitle()` 과 **똑같은 규칙**으로 고른다 — title 블록에 글자가
 * 있으면 그것, 없으면 첫 글자 있는 블록. 부르는 쪽(export/shared.ts)이 거의
 * 언제나 `docTitle(doc)` 을 넘기기 때문이다.
 *
 * 예전에는 `kind === "title"` 만 걸러 냈다. 그런데 제목 줄을 비워 둔 문서에서는
 * docTitle 이 **본문 첫 문장**을 제목으로 돌려주므로, 그 문장이 종이 맨 위에
 * 16pt 가운데 제목으로 한 번 · 본문으로 또 한 번 찍혔다. `emptyDoc()` 이 만드는
 * 모양(빈 제목 + 본문)이 정확히 그 경우라 흔하게 났다.
 */
function titleSource(doc: RichDoc): Block | undefined {
  const titled = doc.blocks.find(
    (b) => b.kind === "title" && spansText(b.spans).trim(),
  );
  if (titled) return titled;
  return doc.blocks.find(
    (b) => BLOCK_META[b.kind].text && spansText(b.spans).trim(),
  );
}

/**
 * 앞뒤 공백을 걷어낸 토막들.
 *
 * pack.ts 는 평문 제목을 `meta.title` 그대로 찍고 부르는 쪽이 그것을 trim 해서
 * 넘긴다. 토막으로 넘길 때도 같은 글자가 나와야 두 길의 결과가 갈리지 않는다.
 */
function trimRuns(runs: readonly HwpxRun[]): HwpxRun[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length > 0) {
    out[0].text = out[0].text.replace(/^\s+/, "");
    if (out[0].text) break;
    out.shift();
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/\s+$/, "");
    if (last.text) break;
    out.pop();
  }
  return out;
}

/**
 * 서식 문서 한 벌을 한/글 문서로.
 *
 * `meta.title` 은 보통 `docTitle(doc)` 이다. 그 글자는 pack.ts 가 **문서의
 * 첫 문단**으로 이미 한 번 찍으므로(구역 설정을 들고 가는 문단이다), 그 글이
 * 나온 블록은 문단으로 다시 내지 않는다. 안 그러면 종이 맨 위에 같은 제목이
 * 두 번 찍힌다.
 *
 * 그 블록의 **부분 서식은 `titleRuns` 로 넘긴다.** 제목 안의 한 낱말만 붉거나
 * 밑줄인 문서가 실제로 있는데, 평문 한 덩어리로 찍으면 화면·클립보드 HTML·DOCX
 * 셋에는 남아 있는 그 표시가 한/글 파일에서만 사라진다.
 *
 * `meta.createdAt` 은 **기안·저장 시각**이어야 하고 「지금」이면 안 된다.
 * ZIP 항목 시각이 이 값으로 고정되므로, 같은 문서를 두 번 내려받았을 때
 * 바이트가 같은지로 「그때 그 파일인가」를 답할 수 있다(pack.ts 의 HwpxDoc 주석).
 */
export function richToHwpxDoc(
  doc: RichDoc,
  meta: { title: string; createdAt: Date },
): HwpxDoc {
  const ordinals = computeOrdinals(doc.blocks);
  const wanted = meta.title.trim();
  const source = wanted ? titleSource(doc) : undefined;
  // 넘겨받은 제목이 그 블록에서 나온 것이 맞을 때만 건너뛴다. 부르는 쪽이
  // 업무 제목 같은 다른 값을 넘겼다면 본문은 한 줄도 빠지면 안 된다.
  const skip =
    source && spansText(source.spans).trim() === wanted ? source : undefined;
  const titleRuns = skip ? trimRuns(toRuns(skip.spans)) : [];

  const paragraphs: HwpxParagraph[] = [];
  doc.blocks.forEach((block, i) => {
    if (block === skip) return;
    const p = toParagraph(block, ordinals[i]);
    if (p) paragraphs.push(p);
  });

  return {
    title: meta.title,
    ...(titleRuns.length > 0 ? { titleRuns } : {}),
    paragraphs,
    createdAt: meta.createdAt,
  };
}
