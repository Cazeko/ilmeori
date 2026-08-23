import { JSDOM } from "jsdom";
const M = await import("../src/lib/editor/model.ts");
const { toHtml, fromHtml } = await import("../src/lib/editor/html.ts");
const { parseRichDoc } = M;

const rt = (blocks) => {
  const doc = parseRichDoc({ v: 1, blocks });
  const html = toHtml(doc);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  return { doc, html, back: fromHtml(dom.window.document.body) };
};
const P = (h) => fromHtml(new JSDOM(`<!doctype html><body>${h}</body>`).window.document.body);
const show = (d) => d.blocks.map((b) => `${b.kind}/${b.indent ?? 0}: ${JSON.stringify(b.spans)}`);

console.log("### A. 표 칸 안 서식 왕복 ###");
{
  const { doc, back, html } = rt([
    { id: "t", kind: "table", spans: [], table: { widths: [1,1], header: true, rows: [
      { cells: [{ id:"1", spans:[{t:"머리",m:["b"]}] }, { id:"2", spans:[{t:"머리2"}] }] },
      { cells: [{ id:"3", spans:[{t:"굵게",m:["b"]},{t:"기울임",m:["i"]},{t:"색",c:"danger"},{t:"형광",h:"green"},{t:"윗",m:["sup"]}] }, { id:"4", spans:[{t:"평범"}] }] },
    ] } },
  ]);
  const cells = (d) => JSON.stringify(d.blocks[0].table.rows.map(r=>r.cells.map(c=>c.spans)));
  console.log("원본", cells(doc));
  console.log("왕복", cells(back));
  console.log("같은가:", cells(doc)===cells(back));
}

console.log("\n### B. 구글독스 모양 목록 ###");
console.log(show(P(`<ol><li dir="ltr"><p dir="ltr"><span>첫째</span></p></li><li dir="ltr"><p dir="ltr"><span>둘째</span></p></li></ol>`)));
console.log("\n### B2. 맨몸 li ###");
console.log(show(P(`<ul><li>첫째</li><li>둘째</li></ul>`)));
console.log("\n### B3. 중첩 목록 ###");
console.log(show(P(`<ul><li>바깥<ul><li>안쪽</li></ul></li></ul>`)));

console.log("\n### C. th 안 굵기 표시가 본문 굵기로 되살아나는가 ###");
{
  const { doc, back } = rt([
    { id: "t", kind: "table", spans: [], table: { widths: [1], header: true, rows: [
      { cells: [{ id:"1", spans:[{t:"머리"}] }] }, { cells: [{ id:"2", spans:[{t:"몸"}] }] },
    ] } },
  ]);
  console.log(JSON.stringify(back.blocks[0].table));
}

console.log("\n### D. 표만 있는 문서(래퍼 div 판정) ###");
{
  const { doc, back, html } = rt([
    { id: "t", kind: "table", spans: [], table: { widths: [1], header: false, rows: [{ cells: [{ id:"1", spans:[{t:"단독표"}] }] }] } },
  ]);
  console.log(show(back), back.blocks[0]?.table && JSON.stringify(back.blocks[0].table.rows));
}

console.log("\n### E. pagebreak 만 있는 문서 ###");
{
  const { back, html } = rt([{ id:"p", kind:"pagebreak", spans: [] }, {id:"b",kind:"body",spans:[{t:"뒤"}]}]);
  console.log(html.slice(0,300));
  console.log(show(back));
}

console.log("\n### F. clipboard 판(forClipboard) 왕복 ###");
{
  const doc = parseRichDoc({ v:1, blocks: [
    {id:"a",kind:"title",spans:[{t:"제목"}]},
    {id:"b",kind:"numbered",spans:[{t:"하나"}]},
    {id:"c",kind:"pagebreak",spans:[]},
    {id:"d",kind:"body",spans:[{t:"뒤"}]},
  ]});
  const html = toHtml(doc, { forClipboard: true });
  console.log(show(P(html)));
}

console.log("\n### G. 이어진 spacer 여러 개 ###");
{
  const { doc, back } = rt([
    {id:"a",kind:"body",spans:[{t:"앞"}]},
    {id:"b",kind:"spacer",spans:[]},
    {id:"c",kind:"spacer",spans:[]},
    {id:"d",kind:"spacer",spans:[]},
    {id:"e",kind:"body",spans:[{t:"뒤"}]},
  ]);
  console.log(show(doc)); console.log(show(back));
}

console.log("\n### H. 문서 끝의 빈 줄(spacer) ###");
{
  const { doc, back } = rt([
    {id:"a",kind:"body",spans:[{t:"앞"}]},
    {id:"b",kind:"spacer",spans:[]},
    {id:"c",kind:"spacer",spans:[]},
  ]);
  console.log(show(doc)); console.log(show(back));
}
