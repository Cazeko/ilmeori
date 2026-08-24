"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { spansText, type Block, type TableData } from "@/lib/editor/model";
import { cn } from "@/lib/cn";
import { domToCp, placeCaret, readText, renderInner } from "./dom";
import type { Engine } from "./engine";

/**
 * 표.
 *
 * ── 칸 하나가 그릇 하나다 ───────────────────────────────────────────────────
 *
 * 칸 안의 글자는 블록 본문과 **똑같은 방식**으로 CRDT 에 담긴다(칸 id 가
 * 그릇 이름이다). 그래서 같은 칸을 둘이 동시에 고쳐도 글자 단위로 합쳐진다.
 *
 * 표의 **뼈대**(몇 줄 몇 칸·칸 이름·너비)는 그렇지 않다 — 블록 속성 하나의
 * LWW 다. 두 사람이 동시에 줄을 넣으면 나중 사람의 것만 남는다. 글자를 잃지는
 * 않지만(칸 id 가 그대로면 글자도 그대로다) 한쪽의 「줄 추가」는 사라진다.
 * 표 구조를 동시에 바꾸는 일은 드물어서 이 대가를 치른다.
 *
 * ── 세로 병합이 없는 이유 ───────────────────────────────────────────────────
 *
 * 내보내기가 못 한다. pack.ts 가 cellAddr 를 병합에 맞춰 어긋나게 적는 순간
 * 한/글이 표를 통째로 못 그린다고 적어 두었고, 우리 서식은 세로 병합 없이도
 * 전부 그릴 수 있다. 화면에서만 되는 기능을 만들면 내보낸 파일이 화면과 달라진다.
 */

const MIN_WIDTH = 0.15;

export const TableView = memo(function TableView({
  block,
  engine,
  readOnly,
  activeCell,
  showGutter,
}: {
  block: Block;
  engine: Engine;
  readOnly: boolean;
  activeCell: string | null;
  showGutter: boolean;
}) {
  const table = block.table;
  const [drag, setDrag] = useState<{ col: number; x: number; base: number[] } | null>(
    null,
  );
  const boxRef = useRef<HTMLDivElement>(null);

  if (!table) return null;
  const total = table.widths.reduce((n, w) => n + w, 0) || 1;

  const startResize = (col: number) => (e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ col, x: e.clientX, base: [...table.widths] });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !boxRef.current) return;
    const px = boxRef.current.getBoundingClientRect().width || 1;
    // 잡은 경계의 왼쪽 칸이 넓어지면 오른쪽 칸이 그만큼 좁아진다.
    // 전체 폭은 그대로 둔다 — 표가 종이 밖으로 나가면 안 된다.
    const sum = drag.base.reduce((n, w) => n + w, 0) || 1;
    const delta = ((e.clientX - drag.x) / px) * sum;
    const next = [...drag.base];
    const a = next[drag.col];
    const b = next[drag.col + 1];
    if (b === undefined) return;
    const lo = MIN_WIDTH * (sum / next.length);
    const moved = Math.max(lo - a, Math.min(b - lo, delta));
    next[drag.col] = a + moved;
    next[drag.col + 1] = b - moved;
    engine.tableSetWidths(block.id, next);
  };

  const endResize = () => setDrag(null);

  return (
    <div
      data-ilm-shell={block.id}
      className={cn("ilm-shell", activeCell && "ilm-shell-active")}
    >
      {showGutter ? (
        <span className="ilm-gutter" aria-hidden>
          표 {table.rows.length}×{table.widths.length}
        </span>
      ) : null}

      <div
        ref={boxRef}
        className="ilm-tablebox"
        onPointerMove={drag ? onMove : undefined}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        <table className="ilm-table">
          <colgroup>
            {table.widths.map((w, i) => (
              <col key={i} style={{ width: `${(w / total) * 100}%` }} />
            ))}
          </colgroup>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.cells.map((cell, c) => {
                  const head = table.header && r === 0;
                  const Cell = head ? "th" : "td";
                  return (
                    <Cell
                      key={cell.id}
                      scope={head ? "col" : undefined}
                      colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                      className={cn(
                        "ilm-cell",
                        activeCell === cell.id && "ilm-cell-active",
                      )}
                      style={cell.align ? { textAlign: cell.align } : undefined}
                    >
                      <CellBody
                        cell={cell}
                        ownerId={block.id}
                        readOnly={readOnly}
                        label={`${r + 1}번째 줄 ${c + 1}번째 칸`}
                      />
                      {/* 열 너비 손잡이. 마지막 열에는 없다 — 밀 곳이 없다. */}
                      {!readOnly && c < row.cells.length - 1 && r === 0 ? (
                        <span
                          className="ilm-colgrip"
                          onPointerDown={startResize(c)}
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`${c + 1}번째 열 너비 조절`}
                        />
                      ) : null}
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {!readOnly ? (
          <TableTools block={block} table={table} engine={engine} activeCell={activeCell} />
        ) : null}
      </div>
    </div>
  );
});

/**
 * 칸 하나의 편집칸.
 *
 * BlockView 와 같은 규칙으로 DOM 을 맞춘다 — 조합 중에는 손대지 않고,
 * 모양이 달라졌을 때만 갈아 끼우며, 커서를 글자 번호로 되돌린다.
 */
const CellBody = memo(function CellBody({
  cell,
  ownerId,
  readOnly,
  label,
}: {
  cell: { id: string; spans: Block["spans"] };
  ownerId: string;
  readOnly: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtml = useRef("");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.closest("[data-ilm-root]") as HTMLElement | null;
    if (root?.dataset.ilmComposing === "1") return;

    const html = renderInner({ id: cell.id, kind: "body", spans: cell.spans });
    if (html === lastHtml.current && readText(el) === spansText(cell.spans)) return;
    if (el.innerHTML !== html) {
      const sel = el.ownerDocument.getSelection();
      const inside =
        sel && sel.rangeCount > 0 && sel.anchorNode && el.contains(sel.anchorNode);
      const keep = inside
        ? {
            at: domToCp(el, sel.anchorNode!, sel.anchorOffset),
            to: domToCp(el, sel.focusNode!, sel.focusOffset),
          }
        : null;
      el.innerHTML = html;
      if (keep) placeCaret(el, keep.at, keep.to);
    }
    lastHtml.current = html;
  });

  return (
    <div
      ref={ref}
      data-ilm-block={cell.id}
      data-ilm-container={cell.id}
      data-ilm-owner={ownerId}
      data-ilm-cell="1"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={label}
      className="ilm-cellbody"
    />
  );
});

/**
 * 표 조작기.
 *
 * 커서가 표 안에 있을 때만 나타난다. 늘 떠 있으면 문서를 읽는 화면에 단추가
 * 스물네 개 붙어 있게 된다 — 표가 셋이면 일흔둘이다.
 */
function TableTools({
  block,
  table,
  engine,
  activeCell,
}: {
  block: Block;
  table: TableData;
  engine: Engine;
  activeCell: string | null;
}) {
  const where = activeCell ? engine.cellAddress(activeCell) : null;
  const inside = where?.blockId === block.id;
  if (!inside || !where) return null;

  const btn =
    "inline-flex min-h-8 items-center gap-1 rounded-xs px-2 text-body-xs font-bold text-gray-70 transition-colors duration-150 hover:bg-gray-10 pointer-coarse:min-h-11";

  return (
    <div className="ilm-tabletools" contentEditable={false}>
      <span className="text-body-xs text-gray-60">
        {where.row + 1}줄 {where.col + 1}칸
      </span>
      <span className="ilm-tooldiv" aria-hidden />
      <button type="button" className={btn} onClick={() => engine.tableInsertRow(block.id, where.row + 1)}>
        <Plus aria-hidden className="size-3.5" />줄
      </button>
      <button type="button" className={btn} onClick={() => engine.tableInsertCol(block.id, where.col + 1)}>
        <Plus aria-hidden className="size-3.5" />칸
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => engine.tableDeleteRow(block.id, where.row)}
        disabled={table.rows.length <= 1}
      >
        <Trash2 aria-hidden className="size-3.5" />줄
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => engine.tableDeleteCol(block.id, where.col)}
        disabled={table.widths.length <= 1}
      >
        <Trash2 aria-hidden className="size-3.5" />칸
      </button>
      <span className="ilm-tooldiv" aria-hidden />
      <label className="inline-flex items-center gap-2 text-body-xs text-gray-70">
        <input
          type="checkbox"
          checked={table.header}
          onChange={() => engine.tableToggleHeader(block.id)}
          className="size-4 accent-primary"
        />
        {/* 「칸 이름」이 무엇을 하는지 적어 둔다. 체크 하나로 쪽이 넘어갈 때
            첫 줄이 되풀이되는지가 바뀌는데, 그건 눌러 봐도 화면에서 안 보인다. */}
        <span title="쪽이 넘어가면 첫 줄을 되풀이합니다">첫 줄은 칸 이름</span>
      </label>
    </div>
  );
}
