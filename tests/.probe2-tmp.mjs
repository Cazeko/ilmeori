import { JSDOM } from "jsdom";
const M = await import("../src/lib/editor/model.ts");
const { toHtml, fromHtml } = await import("../src/lib/editor/html.ts");
const { parseRichDoc, computeOrdinals, markerFor } = M;

const rt = (blocks) => {
  const doc = parseRichDoc({ v: 1, blocks });
  const html = toHtml(doc);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  return { doc, html, back: fromHtml(dom.window.document.body) };
};
const show = (d) => d.blocks.map((b) => `${b.kind}/${b.indent ?? 0}/${b.align ?? "-"}: ${JSON.stringify(M.spansText(b.spans))}`);
const nums = (d) => {
  const o = computeOrdinals(d.blocks);
  return d.blocks.map((b, i) => markerFor(b.kind, b.indent ?? 0, o[i]) + M.spansText(b.spans)).filter((s) => s);
};

console.log("### 1. 공백 ###");
{
  const { doc, back, html } = rt([
    { id: "a", kind: "body", spans: [{ t: "가    나" }] },
    { id: "b", kind: "body", spans: [{ t: "    앞공백" }] },
    { id: "c", kind: "body", spans: [{ t: "뒤공백    " }] },
    { id: "d", kind: "body", spans: [{ t: "탭\t사이" }] },
  ]);
  console.log("원본", show(doc));
  console.log("왕복", show(back));
}

console.log("\n### 2. stripMarker 가 사용자 글을 먹는가 ###");
{
  const { doc, back, html } = rt([
    { id: "a", kind: "numbered", spans: [{ t: "1. 예산안 심의" }] },
    { id: "b", kind: "numbered", spans: [{ t: "가. 사전 협의" }] },
    { id: "c", kind: "bullet", spans: [{ t: "- 5% 감축" }] },
    { id: "d", kind: "bullet", spans: [{ t: "○ 표시를 그대로" }] },
    { id: "e", kind: "body", spans: [{ t: "1. 본문은 안 먹힘" }] },
  ]);
  console.log("원본", show(doc));
  console.log("왕복", show(back));
}

console.log("\n### 3. 빈 numbered/bullet 의 indent 소실 → 번호 어긋남 ###");
{
  const blocks = [
    { id: "a", kind: "numbered", spans: [{ t: "첫째" }] },
    { id: "b", kind: "numbered", spans: [{ t: "첫째의 하위" }], indent: 1 },
    { id: "c", kind: "numbered", spans: [], indent: 1 },
    { id: "d", kind: "numbered", spans: [{ t: "둘째" }] },
  ];
  const { doc, back } = rt(blocks);
  console.log("원본 번호", nums(doc));
  console.log("왕복 블록", show(back));
  console.log("왕복 번호", nums(back));
}

console.log("\n### 4. 정렬/들여쓰기 붙은 빈 문단 ###");
{
  const { doc, back } = rt([
    { id: "a", kind: "body", spans: [], align: "center", indent: 3 },
    { id: "b", kind: "body", spans: [{ t: "뒤" }] },
  ]);
  console.log("원본", show(doc));
  console.log("왕복", show(back));
}

console.log("\n### 5. 빈 문서 왕복 ###");
{
  const doc = M.emptyDoc("제목", () => 0.5);
  const html = toHtml(doc);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const back = fromHtml(dom.window.document.body);
  console.log("원본", show(doc));
  console.log("왕복", show(back));
}

console.log("\n### 6. 표 안 중첩 표 (붙여넣기) ###");
{
  const html = `<table><tr><td>바깥<table><tr><td>안쪽 숫자 1234</td></tr></table></td><td>둘째칸</td></tr></table>`;
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const back = fromHtml(dom.window.document.body);
  console.log(JSON.stringify(back, null, 1));
}

console.log("\n### 7. 표 뒤 이어지는 문단 kind 이 새는가 ###");
{
  const html = `<h2>큰 항목</h2><table><tr><td>ㄱ</td></tr></table>표 뒤의 맨몸 글자`;
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  console.log(show(fromHtml(dom.window.document.body)));
}

console.log("\n### 8. 표 안 빈 칸 · 빈 행 구조 ###");
{
  const { doc, back } = rt([
    { id: "t", kind: "table", spans: [], table: { widths: [1,1,1], header: true, rows: [
      { cells: [{ id:"1", spans: [{t:"머리"}] }, { id:"2", spans: [] }, { id:"3", spans: [{t:"셋"}] }] },
      { cells: [{ id:"4", spans: [] }, { id:"5", spans: [] }, { id:"6", spans: [] }] },
    ] } },
  ]);
  const t = (d) => JSON.stringify(d.blocks[0].table);
  console.log("원본", t(doc));
  console.log("왕복", t(back));
}

console.log("\n### 9. 목록 안 <p> (워드가 흔히 보내는 모양) ###");
{
  const html = `<ol><li><p>첫째 줄</p></li><li><p>둘째 줄</p></li></ol>`;
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  console.log(show(fromHtml(dom.window.document.body)));
}

console.log("\n### 10. <br> 로 나뉜 문단 ###");
{
  const html = `<p>첫 줄<br>둘째 줄<br>셋째 줄</p>`;
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  console.log(show(fromHtml(dom.window.document.body)));
}
