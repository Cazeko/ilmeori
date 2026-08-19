import { Fragment, type ReactNode } from "react";
import {
  BLOCK_META,
  MARKS,
  clampIndent,
  computeOrdinals,
  markerFor,
  spansText,
  type Block,
  type RichDoc,
  type Span,
} from "@/lib/editor/model";
import { cn } from "@/lib/cn";

/**
 * 문서 미리보기 — 업무 상세의 문서 탭이 그리는 읽기 전용 한 벌.
 *
 * ── 왜 편집기를 여기 넣지 않았는가 ──────────────────────────────────────────
 *
 * A4 종이(794px)에 개요(190px)와 의견(250px)을 양옆에 두면 1,230px 이 든다.
 * 업무 상세는 오른쪽에 첨부·참여자 칸을 이미 두고 있어서 본문에 남는 폭이
 * 그 절반이다. 거기에 편집기를 넣으면 종이가 옆으로 잘리거나 가로 스크롤이
 * 생기는데, **가로로 스크롤하며 쓰는 문서 편집기는 쓸 수 없는 물건이다.**
 *
 * 그래서 편집은 /works/[id]/doc 이 맡고 여기서는 보여 주기만 한다. 한/글을
 * 눌렀을 때 창이 따로 뜨는 것과 같은 모양이라 낯설지도 않다.
 *
 * ── 서버에서 그린다 ─────────────────────────────────────────────────────────
 *
 * 이 컴포넌트에는 "use client" 가 없다. 문서를 **읽기만** 하는 화면에
 * 자바스크립트를 한 줄도 딸려 보내지 않으려는 것이다. 편집기는 그 아래
 * 단추를 눌렀을 때 비로소 내려온다.
 */

const MARK_TAG = {
  b: "strong",
  i: "em",
  u: "u",
  s: "s",
  sup: "sup",
  sub: "sub",
} as const;

function spanNode(span: Span, key: number): ReactNode {
  let node: ReactNode = span.t;
  // MARKS 순서로 안쪽부터 감싼다. 편집기(dom.ts)와 같은 순서라야 같은 모양이 된다.
  for (let i = MARKS.length - 1; i >= 0; i -= 1) {
    const m = MARKS[i];
    if (!(span.m ?? []).includes(m)) continue;
    const Tag = MARK_TAG[m];
    node = <Tag>{node}</Tag>;
  }
  const classes = [
    span.c && span.c !== "default" ? `ilm-c-${span.c}` : "",
    span.h && span.h !== "none" ? `ilm-h-${span.h}` : "",
  ].filter(Boolean);
  return classes.length ? (
    <span key={key} className={classes.join(" ")}>
      {node}
    </span>
  ) : (
    <Fragment key={key}>{node}</Fragment>
  );
}

function Line({ block, ordinal }: { block: Block; ordinal: number }) {
  const indent = clampIndent(block.indent);
  const marker = markerFor(block.kind, indent, ordinal);
  return (
    <div
      className="ilm-row"
      style={indent ? { paddingInlineStart: `${indent * 22}px` } : undefined}
    >
      {marker ? (
        <span className="ilm-marker" aria-hidden>
          {marker}
        </span>
      ) : null}
      <div
        className={cn("ilm-block", `ilm-k-${block.kind}`)}
        style={block.align ? { textAlign: block.align } : undefined}
      >
        {block.spans.length ? block.spans.map(spanNode) : " "}
      </div>
    </div>
  );
}

export function DocPreview({ doc }: { doc: RichDoc }) {
  const ordinals = computeOrdinals(doc.blocks);
  const openComments = (doc.comments ?? []).filter((c) => !c.done).length;

  return (
    <div className="ilm-previewbox">
      <article className="ilm-sheet ilm-sheet-fluid" aria-label="문서 미리보기">
        {doc.blocks.map((b, i) => {
          if (b.kind === "table" && b.table) {
            const total = b.table.widths.reduce((n, w) => n + w, 0) || 1;
            return (
              <div key={b.id} className="ilm-tablebox">
                <table className="ilm-table">
                  <colgroup>
                    {b.table.widths.map((w, c) => (
                      <col key={c} style={{ width: `${(w / total) * 100}%` }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {b.table.rows.map((row, r) => (
                      <tr key={r}>
                        {row.cells.map((cell) => {
                          const Cell = b.table!.header && r === 0 ? "th" : "td";
                          return (
                            <Cell
                              key={cell.id}
                              scope={b.table!.header && r === 0 ? "col" : undefined}
                              colSpan={
                                cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined
                              }
                              className="ilm-cell"
                              style={cell.align ? { textAlign: cell.align } : undefined}
                            >
                              {cell.spans.length ? cell.spans.map(spanNode) : " "}
                            </Cell>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          if (b.kind === "divider") return <hr key={b.id} className="ilm-divider" />;
          if (b.kind === "spacer") return <div key={b.id} className="ilm-spacer" />;
          if (b.kind === "pagebreak") {
            return (
              <div key={b.id} className="ilm-pagebreak" role="separator" aria-label="쪽 나눔">
                <span>쪽 나눔</span>
              </div>
            );
          }
          if (!BLOCK_META[b.kind].text) return null;
          return <Line key={b.id} block={b} ordinal={ordinals[i]} />;
        })}
      </article>

      {openComments > 0 ? (
        // 의견은 미리보기에 그리지 않는다 — 문단 옆에 붙는 것이라 좁은 칸에서는
        // 본문을 밀어낸다. 다만 **있다는 사실**은 알려야 한다. 감추면 편집기를
        // 열어 보기 전까지 아무도 모른다.
        <p className="mt-2 text-body-xs text-gray-60">
          이 문서에 아직 해결하지 않은 의견 {openComments}건이 달려 있습니다. 편집기를
          열면 문단 옆에서 볼 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}

/** 문서 첫머리 몇 줄. 목록·카드에서 「무슨 문서인가」를 한 줄로 보여 줄 때 쓴다. */
export function docSummary(doc: RichDoc, max = 120): string {
  for (const b of doc.blocks) {
    if (b.kind === "title" || !BLOCK_META[b.kind].text) continue;
    const t = spansText(b.spans).trim();
    if (t) return t.length > max ? `${t.slice(0, max)}…` : t;
  }
  return "";
}
