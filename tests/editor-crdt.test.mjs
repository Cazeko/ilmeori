/**
 * 동시 편집 CRDT 시험 — 「어떤 순서로 받아도 같은 문서」를 기계가 지킨다.
 *
 * ⚠ 이 시험은 「두 사람이 실제로 같이 써도 안 깨진다」를 증명하지 않는다.
 * 여기서 흉내 내는 것은 **연산 집합과 도착 순서**뿐이다. 진짜 신호에는
 * 유실·부분 배달이 있고, 재접속은 use-collab 의 합류 절차가 맡는다(그 절차를
 * 흉내 낸 판이 「재합류」 시험이다). 다만 아래 넷 중 하나라도 깨지면 실제
 * 협업은 **반드시** 갈라진다:
 *
 *   ① 같은 스냅샷에서 씨를 뿌리면 누가 뿌려도 같은 상태다
 *   ② 같은 연산 집합이면 순서·중복과 무관하게 같은 문서다
 *   ③ 내가 만든 연산은 남의 wire.readOp 를 반드시 통과한다
 *   ④ 위조된 신호로 편집기가 죽지도, 문서가 갈리지도 않는다
 *
 * 돌리는 법
 *   node tests/editor-crdt.test.mjs
 *
 * (crdt.ts 는 `./model` 처럼 확장자 없이 이웃을 부른다. 노드는 그 모양을 못
 *  찾으므로 기존 해석 훅을 이 파일 안에서 켠다 — 그래서 `--import` 없이 돈다.
 *  훅은 tsconfig 의 paths 와 같은 규칙을 적어 둔 tests/alias-hook.mjs 다)
 */

import { register } from "node:module";

register("./alias-hook.mjs", import.meta.url);

const { DocCrdt } = await import("../src/lib/editor/crdt.ts");
const { parseRichDoc, BLOCK_META } = await import("../src/lib/editor/model.ts");
const { posKey } = await import("../src/lib/editor/pos.ts");
const { readOp, readOps } = await import("../src/lib/editor/wire.ts");

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

const J = (v) => JSON.stringify(v);

/** 실제 배선대로 한 바퀴 — JSON 으로 굳혀 readOps 를 통과한 것만 넘긴다. */
function wire(ops) {
  return readOps(JSON.parse(J({ ops })));
}

/** 칸 순서를 따지지 않는 비교. 왕복 시험은 「같은 값인가」만 물으면 된다. */
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEq(x, b[i]));
  }
  if (typeof a !== "object") return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => deepEq(a[k], b[k]));
}

/** 재현 가능한 난수. 시드가 같으면 언제나 같은 시험을 돌린다. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** 반쪽만 남은 서로게이트 — 이게 하나라도 있으면 내보내기가 깨진다. */
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function allText(doc) {
  let out = "";
  for (const b of doc.blocks) {
    for (const s of b.spans) out += s.t;
    if (b.table) for (const r of b.table.rows) for (const c of r.cells) for (const s of c.spans) out += s.t;
  }
  return out;
}

/** 중앙값(ms). 성능 시험은 평균이 아니라 중앙값으로 본다 — GC 한 번에 안 흔들린다. */
function median(times) {
  const s = [...times].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ---------------------------------------------------------------------------
// 시험용 문서 — 실제 결재 문서가 담는 것을 한 벌에 다 넣는다
// ---------------------------------------------------------------------------

const RAW = {
  v: 1,
  blocks: [
    { id: "t0", kind: "title", spans: [{ t: "2026년 음식물류폐기물 대행 원가산정 결과" }] },
    { id: "h1", kind: "heading", spans: [{ t: "1. 추진 배경" }] },
    {
      id: "b1",
      kind: "body",
      indent: 1,
      spans: [{ t: "원가산정 " }, { t: "용역", m: ["b"] }, { t: " 결과를 붙임과 같이 알려 드립니다." }],
    },
    { id: "u1", kind: "bullet", indent: 2, spans: [{ t: "산출 내역 😀 확인 요망" }] },
    {
      id: "q1",
      kind: "quote",
      align: "center",
      spans: [{ t: "관련 근거", m: ["i", "u"], c: "primary", h: "yellow" }],
    },
    { id: "sp", kind: "spacer", spans: [] },
    {
      id: "tb1",
      kind: "table",
      spans: [],
      table: {
        widths: [1, 2],
        header: true,
        rows: [
          { cells: [{ id: "c00", spans: [{ t: "구분" }] }, { id: "c01", spans: [{ t: "금액" }] }] },
          { cells: [{ id: "c10", spans: [{ t: "2026년" }] }, { id: "c11", spans: [], align: "right" }] },
        ],
      },
    },
    { id: "n1", kind: "note", spans: [{ t: "※ 붙임 참조" }] },
  ],
};

const DOC = parseRichDoc(RAW);
ok("시험 문서가 parseRichDoc 를 통과한다", DOC !== null && DOC.blocks.length === 8);

// ---------------------------------------------------------------------------
console.log("\n· 씨 뿌리기");
// ---------------------------------------------------------------------------

{
  const a = DocCrdt.seed(DOC, "aaaaaa");
  const b = DocCrdt.seed(DOC, "zzzzzz");
  ok(
    "같은 문서를 두 자리에서 뿌려도 상태가 글자 그대로 같다",
    J(a.state()) === J(b.state()),
  );
  const again = DocCrdt.seed(parseRichDoc(RAW), "aaaaaa");
  ok(
    "문서를 다시 읽어 뿌려도 같다(난수를 안 쓴다)",
    J(a.state()) === J(again.state()),
  );

  // 최고 수위표가 생긴 뒤에도 씨는 그대로여야 한다 — 안 그러면 「같은 문서를
  // 연 두 사람이 같은 상태」라는 합류 절차의 전제가 깨진다.
  const worn = DocCrdt.seed(DOC, "aaaaaa");
  worn.insertText("b1", 0, "먼저 친 글");
  worn.formatText("b1", 0, 3, { b: true });
  ok(
    "이 자리가 한참 편집한 뒤에 뿌려도 씨는 같다",
    J(DocCrdt.seed(DOC, "aaaaaa").state()) === J(a.state()),
  );

  const snap = a.snapshot();
  ok("왕복 — seed → snapshot 이 원본과 같다", deepEq(snap, DOC), J(snap).slice(0, 200));
  ok("snapshot 은 편집이 없으면 같은 값을 준다", a.snapshot() === snap);
  ok(
    "blockIds 가 문서 순서를 준다",
    J(a.blockIds()) === J(DOC.blocks.map((b2) => b2.id)),
    J(a.blockIds()),
  );
  ok("표 칸도 그릇이다", a.containerText("c00") === "구분" && a.containerText("c11") === "");
  ok("본문 그릇의 글자", a.containerText("b1") === "원가산정 용역 결과를 붙임과 같이 알려 드립니다.");
  ok("formatAt 이 굵은 자리를 알아본다", a.formatAt("b1", 6).b === true, J(a.formatAt("b1", 6)));
  ok("formatAt 이 안 굵은 자리를 알아본다", a.formatAt("b1", 2).b === undefined, J(a.formatAt("b1", 2)));
}

// ---------------------------------------------------------------------------
console.log("\n· 지역 편집");
// ---------------------------------------------------------------------------

{
  const a = DocCrdt.seed(DOC, "aaaaaa");
  const ops = a.insertText("b1", 0, "재차 ");
  ok("글자 넣기", a.containerText("b1").startsWith("재차 원가산정"), a.containerText("b1"));
  ok("코드포인트마다 연산 하나", ops.length === 3, `${ops.length}`);
  ok("넣기 연산이 전부 규약을 통과한다", ops.every((o) => readOp(o) !== null));

  a.deleteText("b1", 0, 3);
  ok("글자 지우기", a.containerText("b1").startsWith("원가산정 용역"), a.containerText("b1"));

  const f = a.formatText("b1", 0, 2, { b: true, h: "green" });
  ok("서식 연산 한 개", f.length === 1 && readOp(f[0]) !== null, J(f));
  const spans = a.snapshot().blocks.find((b) => b.id === "b1").spans;
  ok("서식이 토막으로 나온다", spans[0].m?.includes("b") && spans[0].h === "green", J(spans[0]));

  const before = a.snapshot();
  ok("빈 구간 서식은 아무 일도 안 한다", a.formatText("b1", 3, 3, { b: true }).length === 0);
  ok("빈 글자 넣기는 아무 일도 안 한다", a.insertText("b1", 0, "").length === 0);
  ok("건드리지 않았으면 snapshot 이 그대로다", a.snapshot() === before);

  const blockOps = a.insertBlock("h1", {
    id: "nb1",
    kind: "body",
    spans: [{ t: "새 문단", m: ["b"] }],
  });
  ok("블록 넣기 연산에 bi 와 ti 가 함께 있다", blockOps[0][0] === "bi" && blockOps.some((o) => o[0] === "ti"));
  ok("블록 넣기 연산이 전부 규약을 통과한다", blockOps.every((o) => readOp(o) !== null));
  ok(
    "넣은 블록이 지정한 자리에 들어간다",
    a.blockIds()[2] === "nb1",
    J(a.blockIds()),
  );
  ok("넣은 블록의 글자가 딸려 온다", a.containerText("nb1") === "새 문단");

  a.insertBlock(null, { id: "nb0", kind: "body", spans: [] });
  ok("afterId 가 null 이면 맨 앞", a.blockIds()[0] === "nb0", J(a.blockIds()));

  a.setBlockAttrs("nb1", { kind: "heading", indent: 3, align: "right" });
  const nb1 = a.snapshot().blocks.find((b) => b.id === "nb1");
  ok(
    "속성 바꾸기 — 갈래는 들여쓰기를 안 받는다(BLOCK_META)",
    nb1.kind === "heading" && nb1.indent === undefined && nb1.align === "right",
    J(nb1),
  );

  a.deleteBlock("u1");
  ok("블록 지우기", !a.blockIds().includes("u1"));
  ok("지운 블록에 다시 지우기는 연산을 안 낸다", a.deleteBlock("u1").length === 0);

  const tableOps = a.setTable("tb1", {
    widths: [1, 2],
    header: false,
    rows: [
      { cells: [{ id: "c00", spans: [] }, { id: "c01", spans: [] }] },
      { cells: [{ id: "c10", spans: [] }, { id: "c11", spans: [] }] },
      { cells: [{ id: "c20", spans: [{ t: "합계" }] }, { id: "c21", spans: [] }] },
    ],
  });
  const tb = a.snapshot().blocks.find((b) => b.id === "tb1").table;
  ok("표에 줄을 더해도 있던 칸 글자는 그대로다", tb.rows[0].cells[0].spans[0]?.t === "구분", J(tb.rows[0]));
  ok("새 칸에 실려 온 글자는 함께 들어간다", tb.rows[2].cells[0].spans[0]?.t === "합계", J(tb.rows[2]));
  ok("표 연산이 전부 규약을 통과한다", tableOps.every((o) => readOp(o) !== null));
  ok("header 도 바뀐다", tb.header === false);
}

// ---------------------------------------------------------------------------
console.log("\n· 이름이 긴 id — 나에게만 있는 블록이 생기면 안 된다");
// ---------------------------------------------------------------------------

{
  const a = DocCrdt.seed(DOC, "aaaaaa");
  const long = "x".repeat(40);
  const ops = a.insertBlock("h1", { id: long, kind: "body", spans: [{ t: "글자" }] });
  ok("32자를 넘는 id 로는 블록을 안 만든다", ops.length === 0 && !a.blockIds().includes(long));
  ok("32자를 넘는 그릇에는 글자도 안 넣는다", a.insertText("y".repeat(40), 0, "가나").length === 0);
  ok("32자짜리 id 는 그대로 쓴다", a.insertBlock("h1", { id: "z".repeat(32), kind: "body", spans: [] }).length === 1);

  // 칸 이름을 뒤에서 자르면 표의 네 칸이 그릇 하나를 함께 쓴다.
  const wide = DocCrdt.seed({ v: 1, blocks: [{ id: "a".repeat(32), kind: "table", spans: [] }] }, "aaaaaa");
  const cells = wide.snapshot().blocks[0].table.rows.flatMap((r) => r.cells.map((c) => c.id));
  ok("긴 블록 id 로도 칸 이름이 안 뭉친다", new Set(cells).size === cells.length, J(cells));
  wide.insertText(cells[0], 0, "왼쪽위");
  const filled = wide.snapshot().blocks[0].table.rows.flatMap((r) => r.cells.map((c) => c.spans[0]?.t ?? ""));
  ok("한 칸에 친 글자가 다른 칸에 안 나온다", J(filled) === J(["왼쪽위", "", "", ""]), J(filled));
  ok("만들어 준 칸 이름도 32자를 안 넘는다", cells.every((c) => c.length <= 32), J(cells));
}

// ---------------------------------------------------------------------------
console.log("\n· 함정 ① ti 가 bi 보다 먼저 온다");
// ---------------------------------------------------------------------------

{
  const P = (n, s, k) => [[n, s, k]];
  const ti1 = ["ti", "zz1", P(100, "bbbbbb", 1), "가"];
  const ti2 = ["ti", "zz1", P(200, "bbbbbb", 2), "나"];
  const bi = ["bi", P(500, "bbbbbb", 3), { id: "zz1", kind: "body" }];
  const ba = ["ba", "zz1", { align: "center" }, [7, "bbbbbb"]];
  ok("손으로 만든 연산이 규약을 통과한다", [ti1, ti2, bi, ba].every((o) => readOp(o) !== null));

  const early = new DocCrdt("aaaaaa");
  early.apply([ti1, ba, ti2, bi]);
  const late = new DocCrdt("aaaaaa");
  late.apply([bi, ti1, ba, ti2]);
  ok("글자와 속성이 블록보다 먼저 와도 같은 문서", J(early.snapshot()) === J(late.snapshot()));
  ok("먼저 온 글자가 살아 있다", early.containerText("zz1") === "가나", early.containerText("zz1"));
  ok("먼저 온 속성도 살아 있다", early.snapshot().blocks[0].align === "center");

  const orphan = new DocCrdt("aaaaaa");
  orphan.apply([ti1, ba]);
  ok("bi 가 안 온 블록은 안 그려진다", orphan.snapshot().blocks.length === 0);
  ok("그래도 글자는 그릇에 있다", orphan.containerText("zz1") === "가");
}

// ---------------------------------------------------------------------------
console.log("\n· 함정 ② td 가 ti 보다 먼저 온다");
// ---------------------------------------------------------------------------

{
  const p1 = [[100, "bbbbbb", 1]];
  const p2 = [[200, "bbbbbb", 2]];
  const bi = ["bi", [[500, "bbbbbb", 3]], { id: "zz2", kind: "body" }];
  const ti1 = ["ti", "zz2", p1, "가"];
  const ti2 = ["ti", "zz2", p2, "나"];
  const td = ["td", "zz2", posKey(p1)];
  ok("손으로 만든 연산이 규약을 통과한다", [bi, ti1, ti2, td].every((o) => readOp(o) !== null));

  const early = new DocCrdt("aaaaaa");
  early.apply([td, bi, ti1, ti2]);
  const late = new DocCrdt("aaaaaa");
  late.apply([bi, ti1, td, ti2]);
  ok("지우기가 넣기보다 먼저 와도 같은 문서", J(early.snapshot()) === J(late.snapshot()));
  ok("먼저 온 지우기가 나중 글자를 막는다", early.containerText("zz2") === "나", early.containerText("zz2"));
  ok("같은 지우기를 두 번 받아도 그대로다", early.apply([td, td]) === false);

  // 겉모습만 다른 열쇠(앞의 0). 그대로 묘비에 담으면 나중에 온 ti 의 열쇠와
  // 안 맞아 **막아야 할 글자를 못 막는다** — 받은 순서에 따라 글자가 살고 죽는다.
  const odd = ["td", "zz2", "0100.bbbbbb.1|"];
  ok("겉모습이 다른 열쇠도 규약은 통과한다", readOp(odd) !== null);
  const x = new DocCrdt("aaaaaa");
  x.apply([odd, ti1]);
  const y = new DocCrdt("aaaaaa");
  y.apply([ti1, odd]);
  ok("정규형이 아닌 열쇠도 순서와 무관하다", J(x.snapshot()) === J(y.snapshot()));
  ok("그 열쇠가 가리키는 글자는 안 남는다", x.containerText("zz2") === "" && y.containerText("zz2") === "");

  const junk = new DocCrdt("aaaaaa");
  junk.apply([["td", "zz2", "이건 자리표 열쇠가 아니다"], ti1]);
  ok("되읽지 못하는 열쇠는 버린다(묘비로 안 쌓는다)", junk.containerText("zz2") === "가");
  ok("버린 열쇠는 상태에도 안 남는다", J(junk.state().gone) === "[]", J(junk.state().gone));
}

// ---------------------------------------------------------------------------
console.log("\n· 함정 ③ bd 가 bi 보다 먼저 온다");
// ---------------------------------------------------------------------------

{
  const bi = ["bi", [[500, "bbbbbb", 3]], { id: "zz3", kind: "body" }];
  const ba = ["ba", "zz3", { kind: "heading" }, [9, "bbbbbb"]];
  const bd = ["bd", "zz3"];
  const keep = ["bi", [[700, "bbbbbb", 4]], { id: "zz4", kind: "body" }];
  ok("손으로 만든 연산이 규약을 통과한다", [bi, ba, bd, keep].every((o) => readOp(o) !== null));

  const early = new DocCrdt("aaaaaa");
  early.apply([bd, ba, keep, bi]);
  const late = new DocCrdt("aaaaaa");
  late.apply([keep, bi, ba, bd]);
  ok("블록 지우기가 넣기보다 먼저 와도 같은 문서", J(early.snapshot()) === J(late.snapshot()));
  ok("죽은 블록은 되살아나지 않는다", early.blockIds().length === 1 && early.blockIds()[0] === "zz4");
}

// ---------------------------------------------------------------------------
console.log("\n· 함정 ④ tf(구간 서식) 가 ti 보다 먼저 온다");
// ---------------------------------------------------------------------------

{
  const bi = ["bi", [[500, "bbbbbb", 3]], { id: "zz5", kind: "body" }];
  const lo = [[100, "bbbbbb", 0]];
  const hi = [[900, "bbbbbb", 0]];
  const mid = [[400, "cccccc", 1]];
  const ti = ["ti", "zz5", mid, "가"];
  const tf = ["tf", "zz5", lo, hi, { b: true }, [4, "bbbbbb"]];
  ok("손으로 만든 연산이 규약을 통과한다", [bi, ti, tf].every((o) => readOp(o) !== null));

  const early = new DocCrdt("aaaaaa");
  early.apply([tf, bi, ti]);
  const late = new DocCrdt("aaaaaa");
  late.apply([bi, ti, tf]);
  ok("구간 서식이 글자보다 먼저 와도 같은 문서", J(early.snapshot()) === J(late.snapshot()));
  ok(
    "구간 안에 나중에 떨어진 글자도 굵어진다",
    early.snapshot().blocks[0].spans[0].m?.includes("b"),
    J(early.snapshot().blocks[0].spans),
  );

  // 키별 LWW — 도장이 큰 쪽이 이기고, 다른 키는 둘 다 남는다
  const tfOld = ["tf", "zz5", lo, hi, { b: false }, [2, "zzzzzz"]];
  const tfNew = ["tf", "zz5", lo, hi, { h: "yellow" }, [6, "aaaaaa"]];
  const one = new DocCrdt("dddddd");
  one.apply([bi, ti, tf, tfOld, tfNew]);
  const two = new DocCrdt("dddddd");
  two.apply([tfNew, tfOld, ti, tf, bi]);
  ok("서식 순서를 뒤집어도 같은 문서", J(one.snapshot()) === J(two.snapshot()));
  const span = one.snapshot().blocks[0].spans[0];
  ok("도장이 큰 쪽이 이긴다", span.m?.includes("b") === true, J(span));
  ok("다른 키는 함께 남는다", span.h === "yellow", J(span));

  // 넣을 때 붙인 서식은 도장이 가장 약하다 — 나중 구간 서식이 이긴다
  const withFmt = ["ti", "zz5", [[600, "cccccc", 2]], "나", { b: true }];
  const off = ["tf", "zz5", lo, hi, { b: null }, [8, "bbbbbb"]];
  const three = new DocCrdt("dddddd");
  three.apply([bi, withFmt, off]);
  const four = new DocCrdt("dddddd");
  four.apply([off, withFmt, bi]);
  ok("떼라(null)도 순서와 무관하다", J(three.snapshot()) === J(four.snapshot()));
  ok(
    "나중 구간 서식이 넣을 때 붙인 서식을 이긴다",
    three.snapshot().blocks[0].spans[0].m === undefined,
    J(three.snapshot().blocks[0].spans),
  );

  // 도장·범위가 같고 **서식만 다른** 두 tf. 중복 열쇠에 서식이 빠져 있으면
  // 뒤엣것이 통째로 버려져 먼저 온 쪽이 이긴다 — 굵게와 형광펜이 갈린다.
  const twinA = ["tf", "zz5", lo, hi, { b: true }, [7, "eeeeee"]];
  const twinB = ["tf", "zz5", lo, hi, { h: "yellow" }, [7, "eeeeee"]];
  const t1 = new DocCrdt("dddddd");
  t1.apply([bi, ti, twinA, twinB]);
  const t2 = new DocCrdt("dddddd");
  t2.apply([bi, ti, twinB, twinA]);
  ok("도장이 같고 서식만 다른 tf 도 순서와 무관하다", J(t1.snapshot()) === J(t2.snapshot()), J(t1.snapshot().blocks[0].spans));
  ok("둘 다 살아 있다", J(t1.state().ranges[0][1].length) === "2", J(t1.state().ranges));

  // 더 센 구간에 통째로 먹힌 구간은 버린다 — 어느 순서로 받아도 같은 집합.
  const small = ["tf", "zz5", lo, hi, { b: true }, [10, "aaaaaa"]];
  const big = ["tf", "zz5", lo, hi, { b: false, i: true }, [11, "aaaaaa"]];
  const s1 = new DocCrdt("dddddd");
  s1.apply([bi, ti, small, big]);
  const s2 = new DocCrdt("dddddd");
  s2.apply([bi, ti, big, small]);
  ok("먹힌 구간을 버려도 순서와 무관하다", J(s1.state()) === J(s2.state()));
  ok("먹힌 구간은 상태에서 사라진다", s1.state().ranges[0][1].length === 1, J(s1.state().ranges));
}

// ---------------------------------------------------------------------------
console.log("\n· 남이 걸어 둔 구간 안에 굵게 켜고 치기");
// ---------------------------------------------------------------------------

{
  // A 가 문단 전체를 안 굵게 만든 뒤, B 가 그 안에 굵게를 켜고 친다.
  // 구간 서식을 그대로 두면 B 화면에서만 굵고 나머지는 안 굵어 갈린다.
  const a = DocCrdt.seed(DOC, "aaaaaa");
  const b = DocCrdt.seed(DOC, "bbbbbb");
  const off = a.formatText("b1", 0, 10, { b: false });
  b.apply(off);
  const typed = b.insertText("b1", 3, "굵게", { b: true });
  a.apply(typed);
  ok("굵게 켜고 친 글자가 남의 구간 서식에 안 먹힌다", J(a.snapshot()) === J(b.snapshot()));
  const spans = a.snapshot().blocks.find((x) => x.id === "b1").spans;
  const bold = spans.filter((s) => s.m?.includes("b")).map((s) => s.t).join("");
  ok("굵은 것은 방금 친 글자뿐이다", bold === "굵게", bold);
  ok("보태는 연산도 규약을 통과한다", typed.every((o) => readOp(o) !== null));

  // 한 자씩 이어 치면 되덮기 구간이 타건마다 쌓인다. 이어 친 것은 한 묶음으로
  // 접혀야 한다 — 안 그러면 2000자 문단 하나의 상태가 300KB 를 넘는다.
  const c = DocCrdt.seed(DOC, "cccccc");
  c.apply(off);
  for (let i = 0; i < 300; i += 1) c.insertText("b1", 3 + i, "가", { b: true });
  const kept = c.state().ranges.find((r) => r[0] === "b1")[1].length;
  ok("이어 친 되덮기 구간이 한 묶음으로 접힌다", kept <= 4, `${kept}개`);
  const d = DocCrdt.seed(DOC, "dddddd");
  d.apply(off);
  d.apply(wire(c.state ? [] : []));
  ok("접힌 뒤에도 굵기는 그대로다", c.snapshot().blocks.find((x) => x.id === "b1").spans.some((s) => s.m?.includes("b")));
}

// ---------------------------------------------------------------------------
console.log("\n· 자리표 상한 — 내가 만든 것은 남이 반드시 읽는다");
// ---------------------------------------------------------------------------

{
  // 두 자리가 같은 문단 **같은 자리**에 번갈아 한 자씩 넣는다. 자리표가
  // 깊어지다가 wire 의 상한(80마디·열쇠 1024자)을 넘으면, 상대는 조용히
  // 버리는데 나는 넣은 상태가 되어 본문이 영영 갈린다.
  const doc = parseRichDoc({ v: 1, blocks: [{ id: "p1", kind: "body", spans: [{ t: "가나다라" }] }] });
  const A = DocCrdt.seed(doc, "aaaaaa");
  const B = DocCrdt.seed(doc, "zzzzzz");
  let dropped = 0;
  for (let round = 0; round < 600; round += 1) {
    const oa = A.insertText("p1", 2, "A");
    const ob = B.insertText("p1", 2, "B");
    const ra = wire(oa);
    const rb = wire(ob);
    dropped += oa.length - ra.length + (ob.length - rb.length);
    B.apply(ra);
    A.apply(rb);
  }
  ok("한 틈에 600번씩 넣어도 버려지는 연산이 없다", dropped === 0, `${dropped}개 버려짐`);
  ok("두 자리의 본문이 같다", A.containerText("p1") === B.containerText("p1"));
  ok("두 자리의 상태가 같다", J({ ...A.state(), clock: 0 }) === J({ ...B.state(), clock: 0 }));
  // 상한에 걸린 뒤에는 그 틈에 더 못 넣는다. 잃는 것을 시험으로 못박아 둔다.
  const len = [...A.containerText("p1")].length;
  ok("상한에 걸리면 그 틈은 더 못 받는다(알고 지는 값)", len < 1204 && len > 300, `${len}자`);
  ok("다른 틈에는 그대로 넣을 수 있다", A.insertText("p1", 0, "머리").length === 2);

  // 지우기도 통과해야 한다 — 열쇠가 1024자를 넘으면 남이 못 지운다.
  const dels = A.deleteText("p1", 0, 40);
  ok("지우기 연산도 전부 규약을 통과한다", dels.length > 0 && wire(dels).length === dels.length);
}

// ---------------------------------------------------------------------------
console.log("\n· 위조된 자리표");
// ---------------------------------------------------------------------------

{
  const doc = parseRichDoc({ v: 1, blocks: [{ id: "b1", kind: "body", spans: [{ t: "가나다" }] }] });

  // pos.ts 의 불변식은 「마지막 마디의 숫자는 1 이상」이다. 그것을 깨는 자리표가
  // 하나 섞이면 그 앞에 넣으려던 글자가 뒤로 가고, 깊이가 한 번에 81이 된다.
  const deep = [];
  for (let i = 0; i < 80; i += 1) deep.push([0, "z", i]);
  const a = DocCrdt.seed(doc, "aaaaaa");
  ok("80마디 위조 자리표가 규약을 통과한다", readOp(["ti", "b1", deep, "☠"]) !== null);
  a.apply([["ti", "b1", deep, "☠"]]);
  ok("마지막 마디가 0 인 자리표는 안 들어온다", a.containerText("b1") === "가나다", a.containerText("b1"));
  const typed = a.insertText("b1", 0, "보고서");
  ok("그 뒤에 친 글자가 제자리에 들어간다", a.containerText("b1") === "보고서가나다", a.containerText("b1"));
  ok("내가 낸 연산의 깊이가 안 깊어진다", typed.every((o) => o[2].length <= 2 && readOp(o) !== null));

  const shallow = new DocCrdt("bbbbbb");
  shallow.apply([["ti", "b1", [[0, "z", 1]], "X"]]);
  ok("얕은 위조 자리표도 거른다", shallow.containerText("b1") === "");

  // 자리표는 같은데 글자가 다른 두 ti. 값 갈림쇠가 없으면 먼저 온 쪽이 남아
  // 본문이 자리마다 영구히 갈린다.
  const P = [[524288, "a1", 1]];
  const x = new DocCrdt("x1");
  x.apply([["ti", "b1", P, "가"], ["ti", "b1", P, "나"]]);
  const y = new DocCrdt("y1");
  y.apply([["ti", "b1", P, "나"], ["ti", "b1", P, "가"]]);
  ok("같은 자리표·다른 글자가 순서와 무관하다", x.containerText("b1") === y.containerText("b1"), `${x.containerText("b1")} / ${y.containerText("b1")}`);
  ok("한 자리표에는 여전히 글자 하나다", [...x.containerText("b1")].length === 1);

  const x2 = new DocCrdt("x1");
  x2.apply([["ti", "b1", P, "가", { b: true }], ["ti", "b1", P, "가", { h: "yellow" }]]);
  const y2 = new DocCrdt("y1");
  y2.apply([["ti", "b1", P, "가", { h: "yellow" }], ["ti", "b1", P, "가", { b: true }]]);
  ok("같은 자리표·다른 서식도 순서와 무관하다", J(x2.state()) === J(y2.state()), J(x2.state().text));
}

// ---------------------------------------------------------------------------
console.log("\n· 코드포인트");
// ---------------------------------------------------------------------------

{
  const a = DocCrdt.seed(DOC, "aaaaaa");
  const text = "가😀나👨‍👩‍👦다🇰🇷라";
  const ops = a.insertText("n1", 0, text);
  ok("이모지 한 자가 코드포인트 수만큼 연산이 된다", ops.length === [...text].length, `${ops.length}`);
  ok("이모지 연산이 규약을 통과한다", ops.every((o) => readOp(o) !== null));
  ok("넣은 그대로 읽힌다", a.containerText("n1").startsWith(text), a.containerText("n1"));
  ok("반쪽 서로게이트가 없다", !LONE.test(allText(a.snapshot())));

  a.formatText("n1", 1, 4, { b: true, c: "danger" });
  ok("이모지에 서식을 걸어도 안 깨진다", !LONE.test(allText(a.snapshot())));
  const spans = a.snapshot().blocks.find((x) => x.id === "n1").spans;
  ok("서식 구간의 글자가 코드포인트 경계로 잘린다", spans[1].t === "😀나👨", J(spans.map((s) => s.t)));

  a.deleteText("n1", 2, 5);
  // 자모 묶음(👨‍👩‍👦)의 가운데를 지우면 다른 그림이 된다 — 그건 맞는 동작이고,
  // 묶음 단위로 커서를 움직이는 것은 화면 코드의 몫이다(crdt.ts 머리말).
  const left = [...text].filter((_, i) => i < 2 || i >= 5).join("");
  ok("가운데를 지워도 안 깨진다", !LONE.test(allText(a.snapshot())));
  ok("지운 뒤 글자는 코드포인트 셈 그대로다", a.containerText("n1").startsWith(left), a.containerText("n1"));

  const b = DocCrdt.seed(DOC, "bbbbbb");
  b.apply(a.insertText("n1", 0, ""));
  const emoji = a.insertText("n1", 1, "🎉");
  b.apply(emoji);
  ok("이모지 하나가 연산 하나다", emoji.length === 1);
  ok("UTF-16 이 아니라 코드포인트로 센다", [...a.containerText("n1")][1] === "🎉", a.containerText("n1"));

  // 상태 한 벌은 글자를 문자열 하나로 눌러 담는다. 이모지가 거기서 반쪽이
  // 나면 파일이 통째로 깨지므로 왕복을 따로 겨눈다.
  const round = DocCrdt.fromState(JSON.parse(J(a.state())), "cccccc");
  ok("눌러 담은 상태를 되읽어도 이모지가 그대로다", round.containerText("n1") === a.containerText("n1"), round.containerText("n1"));
  ok("되읽은 문서에도 반쪽 서로게이트가 없다", !LONE.test(allText(round.snapshot())));

  // 여러 코드포인트를 한 자리표에 실은 연산은 버린다(규약 위반)
  const bad = ["ti", "n1", [[7, "cccccc", 9]], "가나"];
  ok("두 글자짜리 ti 는 규약은 통과하지만", readOp(bad) !== null);
  const before = a.containerText("n1");
  a.apply([bad]);
  ok("한 자리표에 한 코드포인트가 아니면 버린다", a.containerText("n1") === before);
}

// ---------------------------------------------------------------------------
console.log("\n· 상태 한 벌 왕복");
// ---------------------------------------------------------------------------

{
  const a = DocCrdt.seed(DOC, "aaaaaa");
  a.insertText("b1", 0, "머리말 ");
  a.formatText("b1", 0, 3, { b: true, h: "pink" });
  a.deleteText("u1", 0, 2);
  a.insertBlock("h1", { id: "x1", kind: "bullet", spans: [{ t: "붙임 😀", m: ["i"] }] });
  a.setBlockAttrs("q1", { align: "right", kind: "source" });
  a.deleteBlock("sp");

  const packed = JSON.parse(JSON.stringify(a.state()));
  const b = DocCrdt.fromState(packed, "bbbbbb");
  ok("fromState 가 상태를 읽는다", b !== null);
  ok("왕복해도 문서가 같다", J(a.snapshot()) === J(b.snapshot()));
  ok("왕복해도 상태가 같다", J(a.state()) === J(b.state()));

  // 합류한 사람이 이어서 편집해도 어긋나지 않는다
  const more = b.insertText("b1", 2, "칸");
  a.apply(more);
  ok("합류한 자리의 편집이 원래 자리에 그대로 먹힌다", J(a.snapshot()) === J(b.snapshot()));

  ok("모양이 아닌 상태는 null", DocCrdt.fromState(null, "x") === null);
  ok("판이 다른 상태는 null", DocCrdt.fromState({ v: 1 }, "x") === null);
  ok("칸이 빠진 상태는 null", DocCrdt.fromState({ v: 2, blocks: [] }, "x") === null);
  ok("문자열은 null", DocCrdt.fromState("{}", "x") === null);
  const half = DocCrdt.fromState(
    {
      v: 2,
      clock: 3,
      sites: ["q"],
      blocks: [["a", null, null], [1, 2, 3]],
      text: [["c", "nope"], ["d", "가나", "흐름", []]],
      dead: [1],
      gone: [[]],
      ranges: [["c", [[1]]]],
    },
    "x",
  );
  ok("칸 안이 이상하면 그것만 버리고 산다", half !== null && half.snapshot().blocks.length === 0);

  // 상태 한 벌은 남이 통째로 만들어 보낸 값이다. 표 뼈대가 모양이 아니면
  // snapshot 이 터질 수 있는 자리라 따로 겨눈다.
  const evilState = {
    v: 2,
    clock: 1,
    sites: ["eeeeee"],
    blocks: [
      ["tb9", [[10, "eeeeee", 1]], [["kind", "table", 0, ""], ["table", { rows: ["줄", { cells: 3 }] }, 5, "e"]]],
      ["b9", [[20, "eeeeee", 2]], [["kind", "table", 0, ""]]],
    ],
    text: [],
    dead: [],
    gone: [],
    ranges: [],
  };
  let boom = null;
  let evilDoc = null;
  try {
    evilDoc = DocCrdt.fromState(evilState, "x")?.snapshot() ?? null;
  } catch (err) {
    boom = err;
  }
  ok("모양이 아닌 표 뼈대로도 snapshot 이 안 터진다", boom === null, boom ? String(boom) : "");
  ok("표 없는 표 블록은 기본 표로 그려진다", evilDoc?.blocks?.[1]?.table?.rows.length === 2, J(evilDoc?.blocks?.[1]?.table));

  // 되풀이 수를 크게 적은 압축 폭탄. 20바이트가 힙을 먹으면 안 된다.
  const bombStart = Date.now();
  let bombErr = null;
  let bomb = null;
  try {
    bomb = DocCrdt.fromState(
      {
        v: 2,
        clock: 0,
        sites: ["z"],
        blocks: [],
        text: [["b1", "가나다", [1, 5, 0, 1, 2000000000]]],
        dead: [],
        gone: [],
        ranges: [],
      },
      "x",
    );
  } catch (err) {
    bombErr = err;
  }
  ok("되풀이 폭탄이 안 터진다", bombErr === null, bombErr ? String(bombErr) : "");
  ok("되풀이는 글자 수만큼만 편다", bomb?.containerText("b1") === "가나다", bomb?.containerText("b1"));
  ok("폭탄을 읽는 데 시간이 안 걸린다", Date.now() - bombStart < 1000, `${Date.now() - bombStart}ms`);

  // 위조된 긴 묘비 열쇠(규약은 1024자까지 받는다)를 그대로 담으면 상태가 불어난다.
  const fat = DocCrdt.fromState(
    { v: 2, clock: 0, sites: [], blocks: [], text: [], dead: [], gone: [["b1", ["9".repeat(1000)]]], ranges: [] },
    "x",
  );
  ok("되읽지 못하는 묘비 열쇠는 안 담는다", J(fat.state().gone) === "[]", J(fat.state().gone));
}

// ---------------------------------------------------------------------------
console.log("\n· 상태 한 벌 크기");
// ---------------------------------------------------------------------------

{
  const blocks = [];
  for (let i = 0; i < 375; i += 1) blocks.push({ id: `b${i}`, kind: "body", spans: [{ t: "가".repeat(80) }] });
  const big = DocCrdt.seed(parseRichDoc({ v: 1, blocks }), "aaaaaa");
  const size = J(big.state()).length;
  // broadcast 한 통이 256KB 다(wire.ts). 씨만 뿌린 3만 자가 거기 못 실리면
  // 합류 절차가 조용히 실패한다 — 예전 모양은 808KB 였다.
  ok(`씨만 뿌린 30000자의 상태가 100KB 안이다 (${(size / 1024).toFixed(0)}KB)`, size < 100 * 1024, `${size}`);

  const round = DocCrdt.fromState(JSON.parse(J(big.state())), "bbbbbb");
  ok("눌러 담은 30000자를 되읽어도 문서가 같다", J(round.snapshot()) === J(big.snapshot()));

  // 고친 자리가 많으면 눌러 담기가 덜 먹는다. 얼마나 덜 먹는지 적어 둔다.
  const rnd = mulberry32(99);
  for (let i = 0; i < 2000; i += 1) {
    const c = `b${Math.floor(rnd() * 375)}`;
    const at = Math.floor(rnd() * 60);
    if (rnd() < 0.5) big.insertText(c, at, "다", rnd() < 0.3 ? { b: true } : undefined);
    else big.deleteText(c, at, at + 2);
  }
  const worn = J(big.state()).length;
  ok(`2000번 고친 뒤에도 256KB 안이다 (${(worn / 1024).toFixed(0)}KB)`, worn < 256 * 1024, `${worn}`);
  const back = DocCrdt.fromState(JSON.parse(J(big.state())), "cccccc");
  ok("고친 뒤에도 왕복이 정확하다", J(back.state()) === J(big.state()));
}

// ---------------------------------------------------------------------------
console.log("\n· 재합류 — 같은 자리 이름으로 상태를 갈아탄다");
// ---------------------------------------------------------------------------

{
  // use-collab 은 5분마다 다시 들어가고 그때마다 동료의 state() 로 갈아탄다
  // (engine.adoptState). **자리 이름은 그대로다.** 새 인스턴스가 번호를 0부터
  // 다시 세면 이미 방송한 자리표·도장을 되풀이해 문서가 갈린다.
  const doc = parseRichDoc({ v: 1, blocks: [{ id: "p1", kind: "body", spans: [] }] });
  let clash = 0;
  let split = 0;
  for (let i = 0; i < 200; i += 1) {
    const A = DocCrdt.seed(doc, "a1");
    const B = DocCrdt.seed(doc, "b2");
    const first = A.insertText("p1", 0, "회의록초안");
    const A2 = DocCrdt.fromState(JSON.parse(J(B.state())), "a1"); // 합류 창에서 갈아탄다
    const second = A2.insertText("p1", 0, "다음안건");
    if (posKey(first[0][2]) === posKey(second[0][2])) clash += 1;
    const X = DocCrdt.seed(doc, "x9");
    X.apply(wire([...first, ...second]));
    const Y = DocCrdt.seed(doc, "y9");
    Y.apply(wire([...second, ...first]));
    if (X.containerText("p1") !== Y.containerText("p1")) split += 1;
  }
  ok("재합류 뒤 자리표가 안 겹친다", clash === 0, `${clash}/200`);
  ok("재합류 앞뒤 연산을 어느 순서로 받아도 같다", split === 0, `${split}/200`);

  const doc2 = parseRichDoc({ v: 1, blocks: [{ id: "p1", kind: "body", spans: [{ t: "가나다" }] }] });
  const A = DocCrdt.seed(doc2, "a1");
  const B = DocCrdt.seed(doc2, "b2");
  const tf1 = A.formatText("p1", 0, 3, { b: true });
  const A2 = DocCrdt.fromState(JSON.parse(J(B.state())), "a1");
  const tf2 = A2.formatText("p1", 0, 3, { h: "yellow" });
  ok("재합류 뒤 도장이 자기 예전 도장보다 크다", tf2[0][5][0] > tf1[0][5][0], `${J(tf1[0][5])} → ${J(tf2[0][5])}`);
  const X = DocCrdt.seed(doc2, "x9");
  X.apply(wire([...tf1, ...tf2]));
  const Y = DocCrdt.seed(doc2, "y9");
  Y.apply(wire([...tf2, ...tf1]));
  ok("재합류 앞뒤 서식을 어느 순서로 받아도 같다", J(X.snapshot()) === J(Y.snapshot()), J(X.snapshot().blocks[0].spans));
  const span = X.snapshot().blocks[0].spans[0];
  ok("두 서식이 다 남는다", span.m?.includes("b") && span.h === "yellow", J(span));
}

// ---------------------------------------------------------------------------
console.log("\n· 악의적 입력");
// ---------------------------------------------------------------------------

{
  const a = DocCrdt.seed(DOC, "aaaaaa");
  const P = (n) => [[n, "eeeeee", 1]];
  const evil = [
    ["ba", "없는블록", { kind: "heading" }, [3, "eeeeee"]],
    ["ba", "b1", { kind: "귀신", align: "위쪽", indent: 1e9, table: "표" }, [4, "eeeeee"]],
    ["ba", "b1", { table: { rows: [{ cells: [{}, { id: 1 }] }, "줄"] } }, [5, "eeeeee"]],
    ["tf", "b1", P(900), P(100), { b: true }, [6, "eeeeee"]],
    ["tf", "b1", P(100), P(900), { b: "참" }, [-5, "eeeeee"]],
    ["tf", "없는그릇", P(1), P(2), { b: true }, [7, "eeeeee"]],
    ["td", "b1", "이건 자리표 열쇠가 아니다"],
    ["td", "b1", "9.9.9|"],
    ["ti", "b1", P(3), "가나다"],
    ["ti", "b1", P(4), "라", { 짧: "값", b: "참", c: "없는색" }],
    ["bi", P(5), { id: "ev1", kind: "머시기", align: "위쪽", indent: -9 }],
    ["bi", P(5), { id: "ev1", kind: "body" }],
    ["bd", "ev1"],
    ["bi", P(6), { id: "ev1", kind: "body" }],
    ["ba", "ev1", { kind: "heading" }, [8, "eeeeee"]],
    ["ti", "c00", P(7), "ㄱ", { h: "yellow" }],
    ["ti", "b1", P(8), "마", JSON.parse('{"__proto__":"x"}')],
    ["tf", "b1", P(1), P(2), JSON.parse('{"__proto__":"x"}'), [9, "eeeeee"]],
    ["ba", "b1", JSON.parse('{"__proto__":{"kind":"heading"}}'), [10, "eeeeee"]],
  ];
  ok("악의적 연산이 readOp 를 통과한다(그래서 위험하다)", evil.every((o) => readOp(o) !== null));

  let threw = null;
  try {
    a.apply(evil);
    a.apply(evil);
    a.snapshot();
  } catch (err) {
    threw = err;
  }
  ok("apply 가 예외를 던지지 않는다", threw === null, threw ? String(threw) : "");
  ok("죽은 블록은 되살아나지 않는다", !a.blockIds().includes("ev1"));
  ok("모르는 갈래는 본문으로 떨어진다", a.snapshot().blocks.find((b) => b.id === "b1").kind === "body");
  ok("모르는 정렬·색은 안 나온다", !J(a.snapshot()).includes("위쪽") && !J(a.snapshot()).includes("없는색"));
  ok("Object.prototype 이 안 더러워진다", ({}).kind === undefined && ({}).x === undefined);
  const junkRanges = a.state().ranges.flatMap((r) => r[1]).filter((r) => J(r[2]) === "{}");
  ok("빈 서식은 구간으로 안 쌓인다", junkRanges.length === 0, J(junkRanges));

  // 시계 폭탄 — 남의 도장을 그대로 따라 올리면 내 서식이 영영 못 이긴다
  const bomb = ["tf", "b1", P(1), P(2), { b: true }, [1e15, "eeeeee"]];
  ok("시계 폭탄이 readOp 를 통과한다", readOp(bomb) !== null);
  a.apply([bomb]);
  const mine = a.formatText("b1", 0, 2, { i: true });
  ok("내 시계가 폭탄을 그대로 따라가지 않는다", mine[0][5][0] < 1e15, J(mine[0][5]));

  const nothing = new DocCrdt("aaaaaa");
  ok("아무것도 없는 문서의 snapshot", J(nothing.snapshot()) === '{"v":1,"blocks":[]}');
  ok("모르는 갈래의 연산은 조용히 버린다", nothing.apply([["xx", "b1"]]) === false);
  ok("연산이 배열이 아니어도 안 죽는다", nothing.apply("연산") === false);
}

// ---------------------------------------------------------------------------
console.log("\n· 값이 큰 신호 한 통");
// ---------------------------------------------------------------------------

{
  // wire 가 한 통에 800연산까지 받는다(readOps). 그 한 통이 남의 탭을 몇십 초
  // 멈추면 그것으로 편집이 끝난다 — 위조한 사람은 문서를 고칠 수 있는 사람뿐이지만
  // 「고칠 수 있다」가 「남의 브라우저를 멈출 수 있다」로 번지면 안 된다.
  const doc = parseRichDoc({ v: 1, blocks: [{ id: "b1", kind: "body", spans: [{ t: "가".repeat(2000) }] }] });
  const c = DocCrdt.seed(doc, "aaaaaa");
  const ops = [];
  for (let i = 0; i < 800; i += 1) {
    ops.push(["tf", "b1", [[1, "z", 0]], [[1048576, "z", 0]], { b: true, i: true, u: true, s: true, sup: true, c: "gray", h: "pink", x: "1" }, [i + 1, "zzzzzzzz"]]);
  }
  const t0 = Date.now();
  c.apply(wire(ops));
  const spent = Date.now() - t0;
  ok(`tf 800개짜리 한 통이 2초 안에 끝난다 (${spent}ms)`, spent < 2000, `${spent}ms`);
  const kept = c.state().ranges[0][1].length;
  ok("같은 범위를 덮는 구간은 하나로 접힌다", kept === 1, `${kept}개`);
}

// ---------------------------------------------------------------------------
console.log("\n· 타건 하나의 값 — snapshot 은 매 렌더 돈다");
// ---------------------------------------------------------------------------

{
  const blocks = [];
  for (let i = 0; i < 300; i += 1) {
    const spans = [];
    for (let k = 0; k < 20; k += 1) spans.push({ t: "가".repeat(5), m: k % 2 ? ["b"] : undefined });
    blocks.push({ id: `b${i}`, kind: "body", spans });
  }
  const big = DocCrdt.seed(parseRichDoc({ v: 1, blocks }), "aaaaaa");
  big.snapshot();
  const times = [];
  for (let i = 0; i < 120; i += 1) {
    const t = process.hrtime.bigint();
    big.insertText(`b${i % 300}`, 0, "가");
    big.snapshot();
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  const mid = median(times);
  // 화면 예산은 한 프레임 50ms 다. 예전에는 안 바뀐 블록까지 다시 만들어
  // 3만 자에서 100ms 를 넘었다.
  ok(`서식 섞인 30000자에서 타건 하나가 10ms 안이다 (중앙 ${mid.toFixed(1)}ms)`, mid < 10, `${mid.toFixed(1)}ms`);
}

// ---------------------------------------------------------------------------
console.log("\n· 무작위 수렴");
// ---------------------------------------------------------------------------

const KINDS = ["body", "heading", "subheading", "bullet", "numbered", "quote", "note", "spacer", "divider"];
const LETTERS = [..."가나다라마바사아자차 abc123", "😀", "👍", "字"];
const FMT_KEYS = ["b", "i", "u", "s", "sup", "sub", "c", "h"];
const COLORS = ["default", "primary", "accent", "danger", "gray"];
const HL = ["none", "yellow", "green", "blue", "pink"];

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

function randomText(rnd) {
  const n = 1 + Math.floor(rnd() * 5);
  let out = "";
  for (let i = 0; i < n; i += 1) out += pick(LETTERS, rnd);
  return out;
}

function randomPatch(rnd) {
  const key = pick(FMT_KEYS, rnd);
  const roll = rnd();
  if (key === "c") return { c: pick(COLORS, rnd) };
  if (key === "h") return { h: pick(HL, rnd) };
  return { [key]: roll < 0.4 ? true : roll < 0.7 ? false : null };
}

/** 이 자리가 아는 그릇 목록. 라운드마다 한 번만 훑는다(snapshot 이 비싸다). */
function scan(peer) {
  const doc = peer.crdt.snapshot();
  peer.containers = [];
  peer.blocks = [];
  peer.tables = [];
  for (const b of doc.blocks) {
    peer.blocks.push(b.id);
    if (b.kind === "table" && b.table) {
      peer.tables.push(b);
      for (const r of b.table.rows) for (const c of r.cells) peer.containers.push(c.id);
    } else if (BLOCK_META[b.kind].text) {
      peer.containers.push(b.id);
    }
  }
}

function act(peer, rnd) {
  const roll = rnd();
  const c = peer.containers.length ? pick(peer.containers, rnd) : null;
  const len = c ? [...peer.crdt.containerText(c)].length : 0;

  if (roll < 0.4 && c) {
    return peer.crdt.insertText(
      c,
      Math.floor(rnd() * (len + 1)),
      randomText(rnd),
      rnd() < 0.3 ? randomPatch(rnd) : undefined,
    );
  }
  if (roll < 0.55 && c && len > 0) {
    const from = Math.floor(rnd() * len);
    return peer.crdt.deleteText(c, from, from + 1 + Math.floor(rnd() * 3));
  }
  if (roll < 0.7 && c && len > 0) {
    const from = Math.floor(rnd() * len);
    return peer.crdt.formatText(c, from, from + 1 + Math.floor(rnd() * 4), randomPatch(rnd));
  }
  if (roll < 0.8 && peer.blocks.length < 24) {
    const id = `${peer.site}${peer.n++}`;
    const after = rnd() < 0.15 ? null : pick(peer.blocks, rnd);
    if (rnd() < 0.2) {
      return peer.crdt.insertBlock(after, {
        id,
        kind: "table",
        spans: [],
        table: {
          widths: [1, 1],
          header: true,
          rows: [0, 1].map((r) => ({
            cells: [0, 1].map((x) => ({ id: `${id}-${r}${x}`, spans: [{ t: randomText(rnd) }] })),
          })),
        },
      });
    }
    return peer.crdt.insertBlock(after, {
      id,
      kind: pick(KINDS, rnd),
      spans: [{ t: randomText(rnd), m: rnd() < 0.3 ? ["b"] : undefined }],
    });
  }
  if (roll < 0.87 && peer.blocks.length > 3) {
    return peer.crdt.deleteBlock(pick(peer.blocks, rnd));
  }
  if (roll < 0.96 && peer.blocks.length) {
    const attrs = {};
    if (rnd() < 0.5) attrs.kind = pick(KINDS, rnd);
    if (rnd() < 0.5) attrs.indent = Math.floor(rnd() * 7);
    if (rnd() < 0.4) attrs.align = pick(["left", "center", "right", "justify"], rnd);
    return peer.crdt.setBlockAttrs(pick(peer.blocks, rnd), attrs);
  }
  if (peer.tables.length) {
    const tb = pick(peer.tables, rnd);
    const rows = tb.table.rows.map((r) => ({ cells: r.cells.map((x) => ({ id: x.id, spans: [] })) }));
    if (rnd() < 0.5 && rows.length < 6) {
      const id = `${peer.site}${peer.n++}`;
      rows.push({ cells: rows[0].cells.map((_, i) => ({ id: `${id}c${i}`, spans: [{ t: randomText(rnd) }] })) });
    } else if (rows.length > 1) {
      rows.pop();
    }
    return peer.crdt.setTable(tb.id, { widths: tb.table.widths, header: rnd() < 0.5, rows });
  }
  return [];
}

/**
 * 한 판.
 *
 * `rejoin` 이 참이면 라운드마다 한 자리가 동료의 state() 로 갈아탄다 —
 * **자리 이름은 그대로**다(use-collab 의 재합류). 갈아탄 뒤에는 자기가 알던
 * 연산(낸 것 + 받은 것)을 새 판에 다시 먹인다. 진짜 재합류에서는 그 사이
 * 알던 것이 실제로 지워지지만(그건 use-collab 의 몫이다), 여기서 물어야 할
 * 것은 「같은 연산 집합이면 같은 문서인가」이므로 모두가 같은 집합을 갖게
 * 맞춘 뒤에 비교한다. 갈아탄 판이 예전 번호를 되쓰면 여기서 갈린다.
 */
function trial(seed, rejoin) {
  const rnd = mulberry32(seed);
  const count = 3 + Math.floor(rnd() * 2);
  const doc = parseRichDoc(RAW);
  const peers = [];
  for (let i = 0; i < count; i += 1) {
    const site = `s${i}`;
    peers.push({ site, crdt: DocCrdt.seed(doc, site), inbox: [], out: [], seen: [], n: 0, containers: [], blocks: [], tables: [] });
  }

  let badOp = null;
  for (let round = 0; round < 10; round += 1) {
    for (const p of peers) {
      scan(p);
      for (let k = 0; k < 20; k += 1) {
        const ops = act(p, rnd);
        for (const op of ops) if (readOp(op) === null && !badOp) badOp = op;
        p.out.push(...ops);
        if (rejoin) p.seen.push(...ops);
      }
    }
    // 서로에게 보낸다. 자기 것은 다시 반영하지 않는다(wire.readSender 규약).
    for (const p of peers) {
      for (const q of peers) if (q !== p) q.inbox.push(...p.out);
      p.out.length = 0;
    }
    // 일부만, 뒤섞인 순서로 배달한다. 나머지는 다음 라운드로 밀린다.
    for (const p of peers) {
      shuffle(p.inbox, rnd);
      const take = p.inbox.splice(0, Math.floor(p.inbox.length * (0.4 + rnd() * 0.6)));
      if (take.length && rnd() < 0.3) take.push(take[Math.floor(rnd() * take.length)]); // 중복 배달
      if (rejoin) p.seen.push(...take);
      while (take.length) p.crdt.apply(take.splice(0, 1 + Math.floor(rnd() * 20)));
    }
    if (rejoin && rnd() < 0.4) {
      const me = peers[Math.floor(rnd() * peers.length)];
      const other = peers[Math.floor(rnd() * peers.length)];
      if (me !== other) {
        const next = DocCrdt.fromState(JSON.parse(J(other.crdt.state())), me.site);
        if (next) {
          me.crdt = next;
          me.crdt.apply(me.seen); // 내가 알던 것은 새 판에도 있어야 비교가 성립한다
        }
      }
    }
  }

  // 남은 것을 전부 배달한다 — 이제 모두가 같은 연산 집합을 가진다.
  for (const p of peers) {
    for (const q of peers) if (q !== p) q.inbox.push(...p.out);
    p.out.length = 0;
  }
  for (const p of peers) {
    shuffle(p.inbox, rnd);
    while (p.inbox.length) p.crdt.apply(p.inbox.splice(0, 1 + Math.floor(rnd() * 20)));
  }

  const snaps = peers.map((p) => J(p.crdt.snapshot()));
  const states = peers.map((p) => {
    const s = p.crdt.state();
    s.clock = 0; // 램포트 시계는 자리마다 다르다 — 문서의 일부가 아니다
    return J(s);
  });
  return {
    badOp,
    diverged: snaps.some((s) => s !== snaps[0]) || states.some((s) => s !== states[0]),
  };
}

{
  const TRIALS = 300;
  let diverged = -1;
  let badOp = null;
  const started = Date.now();
  for (let i = 0; i < TRIALS && diverged < 0; i += 1) {
    const r = trial(0x51ee0 + i, false);
    if (r.badOp && !badOp) badOp = r.badOp;
    if (r.diverged) diverged = i;
  }
  ok(`무작위 수렴 ${TRIALS}회 — 자리 3~4개가 각자 200회 편집, 뒤섞어 배달`, diverged < 0, diverged >= 0 ? `${diverged}번째 시도에서 갈림` : "");
  ok("만들어 낸 연산이 전부 규약을 통과한다", badOp === null, badOp ? J(badOp) : "");
  console.log(`    (${((Date.now() - started) / 1000).toFixed(1)}초)`);
}

{
  const TRIALS = 120;
  let diverged = -1;
  const started = Date.now();
  for (let i = 0; i < TRIALS && diverged < 0; i += 1) {
    if (trial(0x9ee00 + i, true).diverged) diverged = i;
  }
  ok(`재합류 섞은 무작위 수렴 ${TRIALS}회 — 같은 자리 이름으로 state() 갈아타기`, diverged < 0, diverged >= 0 ? `${diverged}번째 시도에서 갈림` : "");
  console.log(`    (${((Date.now() - started) / 1000).toFixed(1)}초)`);
}

// ---------------------------------------------------------------------------
console.log(`\n${fails.length === 0 ? "전부 통과" : "실패"} — ${pass}건 통과, ${fails.length}건 실패`);
if (fails.length > 0) {
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log(
  "\n⚠ 이 시험은 실제 브라우저 두 대를 Supabase broadcast 로 붙여 본 것이 아닙니다.\n" +
    "  신호 유실은 use-collab 의 합류 절차(state 한 벌 받기)가 맡습니다.\n" +
    "⚠ 같은 틈에 250번쯤 동시에 넣으면 자리표 상한에 걸려 그 틈이 막힙니다\n" +
    "  (모든 자리가 똑같이 막히므로 갈리지는 않습니다 — crdt.ts 머리말 참조).",
);
