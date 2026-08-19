/**
 * 편집 엔진 시험 — 되돌리기가 글을 잃지 않는가.
 *
 * ── 왜 이 파일이 생겼는가 ───────────────────────────────────────────────────
 *
 * 코드 검토에서 **글이 사라지는 길 넷**이 실제로 재현됐다. 넷 다 뿌리가 같다:
 * CRDT 는 한 번 지운 블록 id 를 무덤에 넣고 같은 id 로 다시 넣으라는 요청을
 * 조용히 버리는데, 되돌리기가 그 옛 id 를 그대로 쓰고 있었다.
 *
 *   · 문단 맨 앞에서 Backspace 로 앞 문단과 합친 뒤 Ctrl+Z  → 그 문단이 영영 사라짐
 *   · 여러 문단을 골라 지운 뒤 Ctrl+Z                       → 첫 문단만 돌아옴
 *   · Ctrl+Shift+↑↓ 로 옮긴 뒤 Ctrl+Z                       → 옮긴 문단이 없어짐
 *   · 문단 지우기 뒤 Ctrl+Z                                  → 그대로 지워진 채
 *
 * 화면에는 아무 표시도 없었고, 2.5초 뒤 자동 저장이 그 손실을 DB 에 굳혔다.
 * 문서 판 이력이 없어 되찾을 길도 없었다. **되돌리기가 못 되돌리는 것보다
 * 나쁜 것은, 되돌리기가 글을 지우는 것이다.**
 *
 * 브라우저 없이 엔진만 직접 불러 확인한다. 자판·DOM 을 거치지 않으므로
 * 「어느 층이 틀렸는가」가 흐려지지 않는다.
 *
 * 돌리는 법
 *   node --import ./tests/alias-hook-register.mjs tests/editor-engine.test.mjs
 */

const { Engine } = await import("../src/components/editor/engine.ts");
const { spansText, spansLength } = await import("../src/lib/editor/model.ts");

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

/** 글자만 뽑아 늘어놓는다. 견주기 좋게. */
const lines = (e) =>
  e.blocks().map((b) => (b.table ? `표(${b.table.rows.length})` : spansText(b.spans)));

function doc(...texts) {
  return {
    v: 1,
    blocks: texts.map((t, i) => ({ id: `b${i}`, kind: "body", spans: t ? [{ t }] : [] })),
  };
}

/** 검문소를 찍고 무언가 한 다음 다시 찍는다 — 화면이 하는 것과 같은 순서다. */
function step(engine, fn) {
  engine.checkpoint(null, null);
  fn();
  engine.checkpoint(null, null);
}

// ===========================================================================
console.log("\n[1] 되돌리기가 지운 문단을 되살린다");
// ===========================================================================
{
  const e = new Engine(doc("가나", "다라"), "t1");
  step(e, () => e.mergeBackward("b1"));
  ok("앞 문단과 합쳐졌다", lines(e).join("|") === "가나다라", lines(e).join("|"));

  e.undo();
  ok("Ctrl+Z 로 두 문단이 돌아온다", lines(e).join("|") === "가나|다라", lines(e).join("|"));
  ok("되돌리기 뒤에도 다시 하기가 살아 있다", e.canRedo());

  e.redo();
  ok("다시 하기가 먹는다", lines(e).join("|") === "가나다라", lines(e).join("|"));

  // 여기가 예전에 두 번째로 죽던 자리다. 되살린 블록은 id 가 바뀌는데,
  // 이력의 나머지 걸음이 여전히 옛 id 를 가리키면 그다음 되돌리기가 조용히
  // 아무 일도 하지 않는다.
  e.undo();
  ok("한 번 더 되돌려도 그대로 산다", lines(e).join("|") === "가나|다라", lines(e).join("|"));
}

{
  const e = new Engine(doc("문단0", "문단1", "문단2", "문단3"), "t2");
  step(e, () => e.removeBlock("b2"));
  ok("문단을 지웠다", lines(e).join("|") === "문단0|문단1|문단3", lines(e).join("|"));
  e.undo();
  ok(
    "지운 문단이 제자리로 돌아온다",
    lines(e).join("|") === "문단0|문단1|문단2|문단3",
    lines(e).join("|"),
  );
}

// ===========================================================================
console.log("\n[2] 여러 문단에 걸친 삭제를 되돌린다");
// ===========================================================================
{
  const e = new Engine(doc("첫줄ABCD", "가운데", "맨끝줄"), "t3");
  // 「맨끝줄」의 앞 두 글자까지 고른다(맨·끝). 남는 꼬리 「줄」이 첫 문단에
  // 붙어야 한다 — 여러 문단에 걸친 삭제에서 워드·한/글이 하는 일과 같다.
  step(e, () =>
    e.deleteRange({ from: "b0", fromAt: 2, to: "b2", toAt: 2, reversed: false }),
  );
  ok("걸친 부분이 지워지고 앞뒤가 붙었다", lines(e).join("|") === "첫줄줄", lines(e).join("|"));

  e.undo();
  ok(
    "세 문단이 전부 돌아온다",
    lines(e).join("|") === "첫줄ABCD|가운데|맨끝줄",
    lines(e).join("|"),
  );
}

{
  // 글자를 담지 않는 블록(빈 줄·가로줄)이 가운데 끼어 있으면 예전에는
  // 그것만 남았다 — containerOrder() 가 그 블록들을 세지 않기 때문이다.
  const e = new Engine(
    {
      v: 1,
      blocks: [
        { id: "b0", kind: "body", spans: [{ t: "위" }] },
        { id: "b1", kind: "spacer", spans: [] },
        { id: "b2", kind: "divider", spans: [] },
        { id: "b3", kind: "body", spans: [{ t: "아래" }] },
      ],
    },
    "t4",
  );
  step(e, () =>
    e.deleteRange({ from: "b0", fromAt: 1, to: "b3", toAt: 1, reversed: false }),
  );
  ok("빈 줄·가로줄도 함께 지워진다", lines(e).join("|") === "위래", lines(e).join("|"));
  e.undo();
  ok("되돌리면 넷 다 돌아온다", e.blocks().length === 4, `${e.blocks().length}개`);
}

// ===========================================================================
console.log("\n[3] 표는 칸을 지운다고 사라지지 않는다");
// ===========================================================================
{
  const table = {
    v: 1,
    blocks: [
      { id: "b0", kind: "body", spans: [{ t: "앞" }] },
      {
        id: "t0",
        kind: "table",
        spans: [],
        table: {
          widths: [1, 1],
          header: false,
          rows: [
            {
              cells: [
                { id: "c00", spans: [{ t: "가나" }] },
                { id: "c01", spans: [{ t: "다라" }] },
              ],
            },
          ],
        },
      },
      { id: "b1", kind: "body", spans: [{ t: "뒤" }] },
    ],
  };
  const e = new Engine(table, "t5");
  step(e, () =>
    e.deleteRange({ from: "c00", fromAt: 1, to: "c01", toAt: 1, reversed: false }),
  );
  const after = e.blocks();
  ok("표가 그대로 있다", after.some((b) => b.kind === "table"), lines(e).join("|"));
  ok("문서 블록 수가 그대로다", after.length === 3, `${after.length}개`);
  const t = after.find((b) => b.kind === "table");
  ok(
    "고른 칸의 글자만 지워졌다",
    spansText(t.table.rows[0].cells[0].spans) === "가" &&
      spansText(t.table.rows[0].cells[1].spans) === "라",
    JSON.stringify(t.table.rows[0].cells.map((c) => spansText(c.spans))),
  );
}

{
  // 문서가 표로 시작하면 예전에는 전체 선택 삭제가 **블록을 하나도 남기지
  // 않았다.** 0블록이 되면 커서 놓을 자리가 없고, parseRichDoc 이 그 문서를
  // null 로 떨어뜨려 다음 새로고침에 「서식 문서가 아닌 것」이 된다.
  const e = new Engine(
    {
      v: 1,
      blocks: [
        {
          id: "t0",
          kind: "table",
          spans: [],
          table: {
            widths: [1],
            header: false,
            rows: [{ cells: [{ id: "c0", spans: [{ t: "칸" }] }] }],
          },
        },
        { id: "b1", kind: "body", spans: [{ t: "뒤" }] },
      ],
    },
    "t6",
  );
  step(e, () =>
    e.deleteRange({ from: "c0", fromAt: 0, to: "b1", toAt: 1, reversed: false }),
  );
  ok("블록이 하나도 안 남는 일은 없다", e.blocks().length > 0, `${e.blocks().length}개`);
}

// ===========================================================================
console.log("\n[4] 문단 옮기기를 되돌린다");
// ===========================================================================
{
  const e = new Engine(doc("A", "B", "C"), "t7");
  step(e, () => e.moveBlock("b0", 1));
  ok("옮겨졌다", lines(e).join("") === "BAC", lines(e).join(""));
  e.undo();
  ok("되돌리면 셋 다 산다", lines(e).join("") === "ABC", lines(e).join(""));
  e.redo();
  ok("다시 하면 옮긴 자리로", lines(e).join("") === "BAC", lines(e).join(""));
}

// ===========================================================================
console.log("\n[5] 정렬·들여쓰기 되돌리기");
// ===========================================================================
{
  const e = new Engine(doc("가", "나"), "t8");
  step(e, () => e.setAlign(["b0"], "center"));
  ok("가운데 맞춤이 걸렸다", e.blocks()[0].align === "center", String(e.blocks()[0].align));
  e.undo();
  // 예전에는 undefined 를 그대로 CRDT 에 넘겨 「안 바꾼다」로 읽혔다.
  ok(
    "왼쪽으로 되돌아간다",
    (e.blocks()[0].align ?? "left") === "left",
    String(e.blocks()[0].align),
  );

  step(e, () => e.indent(["b1"], 1));
  ok("한 단 들여썼다", e.blocks()[1].indent === 1, String(e.blocks()[1].indent));
  e.undo();
  ok("0단으로 되돌아간다", (e.blocks()[1].indent ?? 0) === 0, String(e.blocks()[1].indent));
}

// ===========================================================================
console.log("\n[6] 보조평면 글자(이모지·확장한자)를 반으로 자르지 않는다");
// ===========================================================================
{
  const e = new Engine(doc("😀가나다"), "t9");
  step(e, () => e.splitBlock("b0", 2));
  ok("Enter 로 나눠도 글자가 그대로다", lines(e).join("|") === "😀가|나다", lines(e).join("|"));
  ok(
    "짝 잃은 서로게이트가 없다",
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      lines(e).join(""),
    ),
  );

  const f = new Engine(doc("𠀋한자"), "t10");
  step(f, () => f.splitBlock("b0", 1));
  ok("확장한자도 마찬가지다", lines(f).join("|") === "𠀋|한자", lines(f).join("|"));
}

// ===========================================================================
console.log("\n[7] 묶어 넣기(붙여넣기)가 한 걸음으로 끝난다");
// ===========================================================================
{
  const e = new Engine(doc("처음"), "t11");
  let renders = 0;
  e.subscribe(() => {
    renders += 1;
  });
  e.batch(() => {
    let anchor = "b0";
    for (let i = 0; i < 50; i += 1) {
      const b = { id: `p${i}`, kind: "body", spans: [{ t: `줄${i}` }] };
      e.insertBlockAfter(anchor, b);
      anchor = b.id;
    }
  });
  ok("50줄을 넣어도 화면 갱신은 한 번", renders === 1, `${renders}번`);
  ok("50줄이 다 들어갔다", e.blocks().length === 51, `${e.blocks().length}개`);
  ok("순서가 맞는다", spansText(e.blocks()[1].spans) === "줄0", spansText(e.blocks()[1].spans));
}

// ===========================================================================
console.log("\n[8] 안 바뀐 블록은 같은 객체를 물려받는다 (React memo 가 걸리는 조건)");
// ===========================================================================
{
  const e = new Engine(doc("첫째", "둘째", "셋째"), "t12");
  const before = e.blocks();
  e.insertText("b0", 2, "X");
  const after = e.blocks();
  ok("고친 블록은 새 객체다", before[0] !== after[0]);
  ok("안 고친 블록은 같은 객체다", before[1] === after[1] && before[2] === after[2]);
}

// ===========================================================================
console.log("\n[9] 의견을 지우면 남이 되살리지 못한다");
// ===========================================================================
{
  const e = new Engine(doc("가"), "t13");
  const made = e.addComment({
    blockId: "b0",
    authorId: "u1",
    authorName: "이하람",
    body: "왜 이렇게 정했는지",
    at: "2026-08-19T10:00:00Z",
  });
  ok("의견이 달렸다", e.getComments().length === 1);

  e.removeComment(made.id);
  ok("지워졌다", e.getComments().length === 0);
  ok("지운 목록에 들어갔다", e.removedComments().includes(made.id));

  // 상대가 아직 못 받고 옛 목록을 그대로 보내온다.
  e.mergeComments([{ ...made }], []);
  ok("남이 보내와도 되살아나지 않는다", e.getComments().length === 0);
}

console.log(
  fails.length === 0
    ? `\n전부 통과 — ${pass}건`
    : `\n실패 — ${pass}건 통과, ${fails.length}건 실패`,
);
for (const f of fails) console.log(`  · ${f}`);
process.exit(fails.length ? 1 : 0);
