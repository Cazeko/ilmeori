/** 내용 손실 탐지 — 13 kind × 6 mark × color × highlight × align × indent × table */
import { JSDOM } from "jsdom";

const M = await import("/home/jovyan/work/ilmeori/src/lib/editor/model.ts");
const { toHtml, fromHtml } = await import("/home/jovyan/work/ilmeori/src/lib/editor/html.ts");
const { richToHwpxDoc } = await import("/home/jovyan/work/ilmeori/src/lib/editor/to-hwpx.ts");
const { buildDocx } = await import("/home/jovyan/work/ilmeori/src/lib/editor/docx.ts");
const { buildHwpx } = await import("/home/jovyan/work/ilmeori/src/lib/hwpx/pack.ts");

const { BLOCK_KINDS, MARKS, TEXT_COLORS, HIGHLIGHTS, ALIGNS, MAX_INDENT, parseRichDoc, docPlainText } = M;

console.log("BLOCK_KINDS", BLOCK_KINDS.join(","));
console.log("MARKS", MARKS.join(","));

let n = 0;
const id = () => `x${(n += 1)}`;

const blocks = [];

// --- 모든 kind, 각각 알아볼 수 있는 글자 ---
for (const kind of BLOCK_KINDS) {
  const b = { id: id(), kind, spans: [{ t: `KIND_${kind}_텍스트` }] };
  if (kind === "table") {
    b.spans = [];
    b.table = {
      widths: [1, 1, 2],
      header: true,
      rows: [
        { cells: [{ id: id(), spans: [{ t: "머리1" }] }, { id: id(), spans: [{ t: "머리2" }] }, { id: id(), spans: [{ t: "머리3" }] }] },
        { cells: [{ id: id(), spans: [{ t: "칸A" }] }, { id: id(), spans: [] }, { id: id(), spans: [{ t: "칸C", m: ["b"] }], align: "right" }] },
        { cells: [{ id: id(), spans: [{ t: "병합칸" }], colSpan: 2 }, { id: id(), spans: [{ t: "끝" }] }] },
      ],
    };
  }
  if (kind === "spacer" || kind === "divider" || kind === "pagebreak") b.spans = [];
  blocks.push(b);
}

// --- 모든 mark ---
for (const m of MARKS) blocks.push({ id: id(), kind: "body", spans: [{ t: `MARK_${m}`, m: [m] }] });
blocks.push({ id: id(), kind: "body", spans: [{ t: "MARK_ALL", m: ["b", "i", "u", "s", "sup"] }] });

// --- 모든 색 ---
for (const c of TEXT_COLORS) blocks.push({ id: id(), kind: "body", spans: [{ t: `COLOR_${c}`, c }] });
// --- 모든 형광펜 ---
for (const h of HIGHLIGHTS) blocks.push({ id: id(), kind: "body", spans: [{ t: `HL_${h}`, h }] });
// --- 모든 정렬 ---
for (const a of ALIGNS) blocks.push({ id: id(), kind: "body", spans: [{ t: `ALIGN_${a}` }], align: a });
// --- indent 0..5 ---
for (let i = 0; i <= MAX_INDENT; i += 1) blocks.push({ id: id(), kind: "body", spans: [{ t: `INDENT_${i}` }], indent: i });
for (let i = 0; i <= MAX_INDENT; i += 1) blocks.push({ id: id(), kind: "numbered", spans: [{ t: `NUM_${i}` }], indent: i });
for (let i = 0; i <= MAX_INDENT; i += 1) blocks.push({ id: id(), kind: "bullet", spans: [{ t: `BUL_${i}` }], indent: i });
// --- header 없는 표 ---
blocks.push({
  id: id(), kind: "table", spans: [],
  table: { widths: [1, 1], header: false, rows: [{ cells: [{ id: id(), spans: [{ t: "NOHDR_a" }] }, { id: id(), spans: [{ t: "NOHDR_b" }] }] }] },
});
// --- 빈 문단 ---
blocks.push({ id: id(), kind: "body", spans: [] });
blocks.push({ id: id(), kind: "body", spans: [{ t: "빈문단_뒤" }] });

const doc = parseRichDoc({ v: 1, blocks });
if (!doc) throw new Error("parseRichDoc null");
console.log("blocks parsed:", doc.blocks.length, "/", blocks.length);

const AT = new Date("2026-08-14T05:30:00.000Z");
const META = { title: "KIND_title_텍스트", createdAt: AT };

const html = toHtml(doc);
const clip = toHtml(doc, { forClipboard: true });
const hwpxDoc = richToHwpxDoc(doc, META);
const hwpxBytes = buildHwpx(hwpxDoc);
const docxBytes = buildDocx(doc, META);
const plain = docPlainText(doc);

// docx / hwpx 안의 텍스트를 얻으려면 unzip 이 필요. 일단 파일로 떨군다.
import { writeFileSync } from "node:fs";
const dir = "/tmp/claude-1000/-home-jovyan-work-ilmeori/98a019ac-a904-47c0-a95e-a4891b560dc4/scratchpad";
writeFileSync(`${dir}/out.docx`, docxBytes);
writeFileSync(`${dir}/out.hwpx`, hwpxBytes);
writeFileSync(`${dir}/out.html`, html);
writeFileSync(`${dir}/clip.html`, clip);
writeFileSync(`${dir}/plain.txt`, plain);
writeFileSync(`${dir}/hwpxdoc.json`, JSON.stringify(hwpxDoc, null, 1));

// --- 어느 표지 글자가 어디서 사라졌나 ---
const markers = [];
for (const kind of BLOCK_KINDS) if (kind !== "table") markers.push(`KIND_${kind}_텍스트`);
for (const m of MARKS) markers.push(`MARK_${m}`);
markers.push("MARK_ALL");
for (const c of TEXT_COLORS) markers.push(`COLOR_${c}`);
for (const h of HIGHLIGHTS) markers.push(`HL_${h}`);
for (const a of ALIGNS) markers.push(`ALIGN_${a}`);
for (let i = 0; i <= MAX_INDENT; i += 1) markers.push(`INDENT_${i}`, `NUM_${i}`, `BUL_${i}`);
markers.push("머리1", "머리2", "머리3", "칸A", "칸C", "병합칸", "끝", "NOHDR_a", "NOHDR_b", "빈문단_뒤");

const hwpxText = JSON.stringify(hwpxDoc);
const miss = { html: [], plain: [], hwpx: [] };
for (const t of markers) {
  if (!html.includes(t)) miss.html.push(t);
  if (!plain.includes(t)) miss.plain.push(t);
  if (!hwpxText.includes(t)) miss.hwpx.push(t);
}
console.log("\n=== 표지 글자 누락 ===");
console.log("toHtml 에서 빠진 것:", miss.html);
console.log("docPlainText 에서 빠진 것:", miss.plain);
console.log("richToHwpxDoc 에서 빠진 것:", miss.hwpx);

// --- 왕복 ---
const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
const back = fromHtml(dom.window.document.body);
writeFileSync(`${dir}/roundtrip.json`, JSON.stringify(back, null, 1));

console.log("\n=== 왕복 ===");
console.log("원본 블록", doc.blocks.length, "→ 왕복", back.blocks.length);
const sig = (d) => d.blocks.map((b) => `${b.kind}|${b.indent ?? 0}|${b.align ?? "-"}|${JSON.stringify(b.spans)}${b.table ? "|T" + JSON.stringify(b.table.rows.map(r=>r.cells.map(c=>[M.spansText(c.spans),c.colSpan??1,c.align??"-"]))) + "|h" + b.table.header + "|w" + b.table.widths : ""}`);
const a = sig(doc), c = sig(back);
const max = Math.max(a.length, c.length);
let diffs = 0;
for (let i = 0; i < max; i += 1) {
  if (a[i] !== c[i]) {
    diffs += 1;
    if (diffs <= 60) console.log(`#${i}\n  원본: ${a[i]}\n  왕복: ${c[i]}`);
  }
}
console.log("차이 개수:", diffs);
