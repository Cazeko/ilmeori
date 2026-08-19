/**
 * 편집 엔진 — 문서를 고치는 모든 동작이 여기 한 곳에 있다.
 *
 * ── 왜 React 밖인가 ─────────────────────────────────────────────────────────
 *
 * 편집기는 자판 한 번에 상태가 바뀌고, 그때마다 컴포넌트가 다시 그려지면
 * contenteditable 안의 텍스트 노드가 갈린다. 한글을 조합하는 중에 그 일이
 * 일어나면 「한」이 「ㅎㅏㄴ」이 되거나 두 번 들어간다 — 이 편집기가 가장
 * 조심해야 하는 단 하나의 사고다.
 *
 * 그래서 문서 상태는 React 밖의 이 객체가 들고 있고, 화면은
 * `useSyncExternalStore` 로 **판 번호만** 구독한다. 실제로 DOM 을 갈아 끼우는
 * 시점은 block-view.tsx 가 조합 여부를 보고 스스로 정한다.
 *
 * ── 글자 세는 단위 ──────────────────────────────────────────────────────────
 *
 * 이 파일에 나오는 모든 `at`·`from`·`to` 는 **코드포인트** 번호다.
 * UTF-16 코드 단위가 아니다. 이유는 dom.ts 머리말에 적었다.
 *
 * ── 되돌리기를 스냅숏 차이로 하는 이유 ──────────────────────────────────────
 *
 * CRDT 연산 하나하나의 역연산을 만들 수도 있지만, 그러면 서식 되돌리기가
 * 「글자마다의 이전 서식」을 전부 들고 다녀야 한다. 여기서는 검문소마다
 * **바뀐 블록만** 통째로 기억했다가, 되돌릴 때 그 모습으로 가는 최소 변경을
 * 다시 계산한다. 손대지 않은 블록에 남이 쓴 글은 그대로 살아남는다.
 * 손댄 블록 안에서는 되돌리기가 이긴다 — 그게 「되돌리기」의 뜻이다.
 */

import { DocCrdt } from "@/lib/editor/crdt";
import {
  BLOCK_META,
  clampIndent,
  computeOrdinals,
  makeBlock,
  makeTable,
  newId,
  normalizeSpans,
  sliceSpans,
  spansLength,
  spansText,
  type Align,
  type Block,
  type BlockKind,
  type DocComment,
  type RichDoc,
  type Span,
  type TableCell,
  type TableData,
} from "@/lib/editor/model";
import { newSite, type Site } from "@/lib/editor/pos";
import type { FmtPatch, Op } from "@/lib/editor/wire";
import { diffText, type BlockRange } from "./dom";

/** 커서 한 자리. 그릇 이름과 그 안의 글자 번호. */
export type Caret = { container: string; at: number; to?: number };

type Delta = {
  /** 블록 id → 그 전 모습. null 이면 그때는 없던 블록이다. */
  before: Map<string, Block | null>;
  after: Map<string, Block | null>;
  beforeOrder: string[];
  afterOrder: string[];
  caretBefore: Caret | null;
  caretAfter: Caret | null;
  commentsBefore: DocComment[];
  commentsAfter: DocComment[];
};

/** 되돌리기로 거슬러 갈 수 있는 걸음 수. 넘으면 오래된 것부터 버린다. */
const HISTORY_LIMIT = 100;

export class Engine {
  readonly site: Site;
  private crdt: DocCrdt;
  private cache: RichDoc;
  /** 블록 id → 지난 판의 모양(JSON). build() 의 구조 공유가 쓴다. */
  private blockKeys = new Map<string, string>();
  private blockRefs = new Map<string, Block>();
  private version = 0;
  private listeners = new Set<() => void>();

  /** 의견은 CRDT 를 거치지 않는다. 이유는 model.ts 의 DocComment 주석에 있다. */
  private comments: DocComment[] = [];

  /**
   * 커서만 놓고 Ctrl+B 를 눌렀을 때 「다음에 칠 글자」에 붙일 서식.
   *
   * 이것이 없으면 굵게를 누른 뒤 글자를 쳐도 굵어지지 않는다 — 서식은 글자에
   * 붙는 것이고 아직 글자가 없기 때문이다. 커서가 움직이면 버린다.
   */
  private pending: { container: string; at: number; fmt: FmtPatch } | null = null;

  private undoStack: Delta[] = [];
  private redoStack: Delta[] = [];
  /** 검문소를 찍은 시점의 모습. 다음 검문소에서 이것과 견준다. */
  private mark: { blocks: Map<string, Block>; order: string[]; comments: DocComment[]; caret: Caret | null };

  /** 지역 편집이 만든 연산. use-collab 이 가져가 내보낸다. */
  onLocalOps: ((ops: Op[]) => void) | null = null;
  /** 저장이 필요해졌다는 신호. */
  onDirty: (() => void) | null = null;

  constructor(doc: RichDoc, site: Site = newSite()) {
    this.site = site;
    this.crdt = DocCrdt.seed(doc, site);
    this.comments = doc.comments ? doc.comments.map((c) => ({ ...c })) : [];
    this.cache = this.build();
    this.mark = this.takeMark();
  }

  // ── 구독 ────────────────────────────────────────────────────────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = (): number => this.version;

  /** 화면이 그리는 값. 판 번호가 그대로면 이 객체도 그대로다. */
  getDoc = (): RichDoc => this.cache;

  getComments = (): DocComment[] => this.comments;

  /**
   * 화면이 그릴 값을 만든다.
   *
   * ── 안 바뀐 블록은 **같은 객체**를 그대로 물려준다 ─────────────────────
   *
   * CRDT 의 snapshot() 은 부를 때마다 블록을 전부 새로 만든다. 그대로 쓰면
   * React 의 memo 가 한 블록도 막지 못한다 — `a.block !== b.block` 이 언제나
   * 참이라, 자판 한 번에 300개 문단이 전부 다시 그려진다. block-view.tsx 의
   * sameProps 가 「막겠다」고 적어 둔 바로 그 경우가 통째로 헛돈다.
   *
   * 그래서 여기서 이전 판과 견주어, 모양이 같으면 **이전 객체를 재사용**한다.
   * 그러면 참조 비교 하나로 「이 블록이 바뀌었는가」를 물을 수 있게 되고,
   * 그 성질에 두 가지가 함께 얹힌다.
   *   · React memo 가 실제로 걸린다
   *   · 되돌리기 검문소가 깊은 복사 없이 참조만 들고 있어도 된다(takeMark)
   *
   * 견주는 값은 JSON 문자열이다. 블록 하나가 대개 수십~수백 바이트라 300개를
   * 훑어도 1ms 안쪽이고, 그 대가로 리렌더 300번이 사라진다.
   */
  private build(): RichDoc {
    const snap = this.crdt.snapshot();
    const nextKeys = new Map<string, string>();
    const blocks = snap.blocks.map((b) => {
      const key = JSON.stringify(b);
      nextKeys.set(b.id, key);
      const had = this.blockKeys.get(b.id);
      if (had === key) {
        const prev = this.blockRefs.get(b.id);
        if (prev) return prev;
      }
      this.blockRefs.set(b.id, b);
      return b;
    });
    // 사라진 블록의 기억은 함께 버린다. 안 그러면 긴 편집에서 계속 자란다.
    for (const id of this.blockKeys.keys()) {
      if (!nextKeys.has(id)) this.blockRefs.delete(id);
    }
    this.blockKeys = nextKeys;

    const same =
      blocks.length === snap.blocks.length &&
      blocks.every((b, i) => b === snap.blocks[i]);
    const next: RichDoc = same ? snap : { ...snap, blocks };
    return this.comments.length ? { ...next, comments: this.comments } : next;
  }

  /** batch() 안에서는 실제 갱신을 미룬다. 0 이면 바로 그린다. */
  private held = 0;
  private heldDirty = false;

  private bump(dirty = true): void {
    if (this.held > 0) {
      this.heldDirty = this.heldDirty || dirty;
      return;
    }
    this.cache = this.build();
    this.version += 1;
    for (const fn of this.listeners) fn();
    if (dirty) this.onDirty?.();
  }

  /**
   * 여러 동작을 한 걸음으로 묶는다.
   *
   * 붙여넣기 때문에 생겼다. 한/글에서 한 쪽(200줄)을 복사해 붙이면 예전에는
   * 줄마다 `insertBlockAfter` → `bump()` → **문서 전체 스냅숏 재생성**이
   * 돌았다. 200줄이면 200번, 그때마다 문서가 커지므로 O(n²) 이고, 실측으로
   * 탭이 십수 초 동안 프레임을 한 장도 못 냈다.
   *
   * ⚠ 묶는 동안에는 `this.cache` 가 옛 판이다. 넣은 것을 곧바로 되찾아
   * 읽어야 하는 동작은 여기에 넣으면 안 된다. 붙여넣기는 새 블록의 id 를
   * 이미 손에 들고 있어서 되찾을 일이 없다.
   */
  batch<T>(fn: () => T): T {
    this.held += 1;
    try {
      return fn();
    } finally {
      this.held -= 1;
      if (this.held === 0) {
        const dirty = this.heldDirty;
        this.heldDirty = false;
        if (dirty) this.bump(true);
        else this.bump(false);
      }
    }
  }

  private emit(ops: Op[]): void {
    if (ops.length && this.onLocalOps) this.onLocalOps(ops);
  }

  // ── 조회 ────────────────────────────────────────────────────────────────

  blocks(): Block[] {
    return this.cache.blocks;
  }

  blockOf(container: string): Block | null {
    for (const b of this.cache.blocks) {
      if (b.id === container) return b;
      if (b.table) {
        for (const row of b.table.rows) {
          for (const cell of row.cells) if (cell.id === container) return b;
        }
      }
    }
    return null;
  }

  /** 그릇의 토막들. 블록 본문이면 블록의 것, 표 칸이면 그 칸의 것. */
  spansOf(container: string): Span[] {
    const b = this.blockOf(container);
    if (!b) return [];
    if (b.id === container) return b.spans;
    for (const row of b.table?.rows ?? []) {
      for (const cell of row.cells) if (cell.id === container) return cell.spans;
    }
    return [];
  }

  textOf(container: string): string {
    return spansText(this.spansOf(container));
  }

  indexOf(blockId: string): number {
    return this.cache.blocks.findIndex((b) => b.id === blockId);
  }

  /** 문서 순서로 늘어놓은 편집 가능한 그릇들. 커서를 옮길 때 쓴다. */
  containerOrder(): string[] {
    const out: string[] = [];
    for (const b of this.cache.blocks) {
      if (b.kind === "table" && b.table) {
        for (const row of b.table.rows) for (const c of row.cells) out.push(c.id);
      } else if (BLOCK_META[b.kind].text) {
        out.push(b.id);
      }
    }
    return out;
  }

  /** 이 자리에 새 글자를 치면 붙을 서식. */
  formatAt(container: string, at: number): FmtPatch {
    if (
      this.pending &&
      this.pending.container === container &&
      this.pending.at === at
    ) {
      return { ...this.crdt.formatAt(container, Math.max(0, at - 1)), ...this.pending.fmt };
    }
    return this.crdt.formatAt(container, Math.max(0, at - 1));
  }

  setPending(container: string, at: number, fmt: FmtPatch): void {
    this.pending = { container, at, fmt };
    this.bump(false);
  }

  getPending(container: string, at: number): FmtPatch | null {
    return this.pending && this.pending.container === container && this.pending.at === at
      ? this.pending.fmt
      : null;
  }

  clearPending(): void {
    if (this.pending) {
      this.pending = null;
      this.bump(false);
    }
  }

  // ── 되돌리기 ────────────────────────────────────────────────────────────

  /**
   * 지금 모습을 기억해 둔다.
   *
   * 깊은 복사를 하지 않는다. build() 가 안 바뀐 블록에 **같은 객체**를 물려
   * 주므로(위 주석), 참조만 들고 있어도 「그 뒤로 바뀌었는가」를 `!==` 하나로
   * 물을 수 있다. 예전에는 여기서 문서 전체를 structuredClone 했고, 원격
   * 변경이 올 때마다 그것을 다시 했다 — 남이 이어 치는 동안 주 스레드가
   * 되돌리기 기준점을 베끼는 데만 쓰였다.
   *
   * 이 함수가 기대는 전제는 하나다: **스냅숏의 블록은 아무도 고치지 않는다.**
   * 고쳐야 할 때는 반드시 새 객체를 만든다(moveBlock 의 structuredClone,
   * table* 들의 새 배열). 그 규약이 깨지면 되돌리기가 조용히 틀린다.
   */
  private takeMark() {
    const blocks = new Map<string, Block>();
    for (const b of this.cache.blocks) blocks.set(b.id, b);
    return {
      blocks,
      order: this.cache.blocks.map((b) => b.id),
      comments: this.comments,
      caret: null as Caret | null,
    };
  }

  /**
   * 여기까지를 한 걸음으로 묶는다.
   *
   * 자판 한 번마다 걸음을 나누면 Ctrl+Z 를 스무 번 눌러야 한 낱말이 지워진다.
   * 부르는 쪽이 「쉬는 참」(입력이 끊긴 400ms)과 구조가 바뀌는 동작에서 부른다.
   */
  checkpoint(caretBefore: Caret | null, caretAfter: Caret | null): void {
    const now = this.takeMark();
    const before = new Map<string, Block | null>();
    const after = new Map<string, Block | null>();

    const ids = new Set([...this.mark.blocks.keys(), ...now.blocks.keys()]);
    for (const id of ids) {
      const a = this.mark.blocks.get(id) ?? null;
      const b = now.blocks.get(id) ?? null;
      if (a === null && b === null) continue;
      // 참조 비교로 충분하다 — build() 가 안 바뀐 블록에 같은 객체를 물려준다.
      if (a === b) continue;
      before.set(id, a);
      after.set(id, b);
    }

    const orderChanged =
      this.mark.order.length !== now.order.length ||
      this.mark.order.some((id, i) => now.order[i] !== id);
    // 의견도 같다. 고치는 메서드가 전부 새 배열을 만들므로 참조가 곧 판이다.
    const commentsChanged = this.mark.comments !== now.comments;

    if (before.size === 0 && !orderChanged && !commentsChanged) {
      this.mark = now;
      return;
    }

    this.undoStack.push({
      before,
      after,
      beforeOrder: this.mark.order,
      afterOrder: now.order,
      caretBefore,
      caretAfter,
      commentsBefore: this.mark.comments,
      commentsAfter: now.comments,
    });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    // 새 걸음을 디디면 앞으로 갈 길은 사라진다. 편집기의 보편적 규칙이다.
    this.redoStack = [];
    this.mark = now;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): Caret | null {
    const step = this.undoStack.pop();
    if (!step) return null;
    const moved = this.restore(step.before, step.beforeOrder, step.commentsBefore);
    this.redoStack.push(step);
    this.rename(moved);
    this.mark = this.takeMark();
    return this.renameCaret(step.caretBefore, moved);
  }

  redo(): Caret | null {
    const step = this.redoStack.pop();
    if (!step) return null;
    const moved = this.restore(step.after, step.afterOrder, step.commentsAfter);
    this.undoStack.push(step);
    this.rename(moved);
    this.mark = this.takeMark();
    return this.renameCaret(step.caretAfter, moved);
  }

  /**
   * 되살아난 블록의 새 id 를 이력 전체에 반영한다.
   *
   * 되살린 블록은 옛 id 를 그대로 쓸 수 없다(restore 주석). 그런데 되돌리기
   * 스택의 다른 걸음들은 여전히 옛 id 로 그 블록을 가리키고 있다. 여기서
   * 갈아 끼우지 않으면 **한 번 더 되돌릴 때 없는 id 를 찾다가 아무 일도
   * 일어나지 않는다** — 되돌리기가 두 번째부터 조용히 죽는 길이다.
   */
  private rename(moved: Map<string, string>): void {
    if (moved.size === 0) return;
    const swap = (id: string) => moved.get(id) ?? id;

    for (const step of [...this.undoStack, ...this.redoStack]) {
      for (const map of [step.before, step.after]) {
        for (const [oldId, newId] of moved) {
          if (!map.has(oldId)) continue;
          const val = map.get(oldId) ?? null;
          map.delete(oldId);
          map.set(newId, val ? { ...val, id: newId } : null);
        }
      }
      step.beforeOrder = step.beforeOrder.map(swap);
      step.afterOrder = step.afterOrder.map(swap);
      step.commentsBefore = step.commentsBefore.map((c) =>
        moved.has(c.blockId) ? { ...c, blockId: swap(c.blockId) } : c,
      );
      step.commentsAfter = step.commentsAfter.map((c) =>
        moved.has(c.blockId) ? { ...c, blockId: swap(c.blockId) } : c,
      );
      step.caretBefore = this.renameCaret(step.caretBefore, moved);
      step.caretAfter = this.renameCaret(step.caretAfter, moved);
    }

    let touched = false;
    const next = this.comments.map((c) => {
      if (!moved.has(c.blockId)) return c;
      touched = true;
      return { ...c, blockId: swap(c.blockId) };
    });
    if (touched) {
      this.comments = next;
      this.bump();
    }
  }

  private renameCaret(caret: Caret | null, moved: Map<string, string>): Caret | null {
    if (!caret || !moved.has(caret.container)) return caret;
    return { ...caret, container: moved.get(caret.container)! };
  }

  /**
   * 기억해 둔 모습으로 되돌린다.
   *
   * 통째로 갈아 끼우지 않고 **차이만** 되돌리는 이유는 동시 편집이다.
   * 내가 손대지 않은 블록에 남이 쓴 글까지 지워 버리면, 되돌리기 한 번이
   * 남의 일을 지우는 단추가 된다.
   */
  private restore(
    target: Map<string, Block | null>,
    order: string[],
    comments: DocComment[],
  ): Map<string, string> {
    const ops: Op[] = [];
    const live = new Map(this.cache.blocks.map((b) => [b.id, b]));
    /** 되살리면서 id 가 바뀐 블록. 부르는 쪽이 이력에 반영한다. */
    const moved = new Map<string, string>();

    // 1. 그때 없던 블록은 지운다.
    for (const [id, want] of target) {
      if (want === null && live.has(id)) ops.push(...this.crdt.deleteBlock(id));
    }
    // 2. 그때 있던 블록은 그 모습으로.
    for (const [id, want] of target) {
      if (!want) continue;
      if (live.has(id)) {
        ops.push(...this.reshape(id, want));
        continue;
      }
      /**
       * 지웠던 블록을 되살린다 — **반드시 새 id 로.**
       *
       * CRDT 는 한 번 지운 블록 id 를 무덤에 넣고, 같은 id 로 다시 넣으라는
       * 요청을 조용히 버린다(연산을 하나도 내지 않는다). 도착 순서가 뒤바뀐
       * 신호가 지운 블록을 되살리지 못하게 하려는 것이라 그 규칙 자체는 옳다.
       *
       * 그래서 옛 id 를 그대로 쓰면 되돌리기가 **아무 일도 하지 않는다.**
       * 실제로 그랬다: 문단 맨 앞에서 Backspace 로 앞 문단과 합친 뒤 Ctrl+Z 를
       * 누르면 그 문단이 영영 사라지고 되돌리기 단추까지 꺼졌다. 자동 저장이
       * 2.5초 뒤 그 손실을 DB 에 굳혔고, 문서 판 이력이 없어 되찾을 길도 없었다.
       * 옮기기(moveBlock)도 지우고 새로 넣는 방식이라 같은 길로 사라졌다.
       *
       * 새 id 로 복사해 넣고, 바뀐 이름을 돌려준다. 표는 칸 id 도 함께 간다 —
       * 칸이 곧 글자 그릇이라 옛 이름을 쓰면 그 글자도 무덤에 걸린다.
       */
      const fresh = this.reborn(want);
      moved.set(id, fresh.id);
      const at = order.indexOf(id);
      // 앞 블록이 이번에 함께 되살아났다면 그쪽의 새 이름을 따라간다.
      const prevId = at > 0 ? order[at - 1] : null;
      const afterId = prevId ? (moved.get(prevId) ?? prevId) : null;
      ops.push(...this.crdt.insertBlock(afterId, fresh));
    }

    const swap = (id: string) => moved.get(id) ?? id;
    this.comments = comments.map((c) =>
      moved.has(c.blockId) ? { ...c, blockId: swap(c.blockId) } : c,
    );
    this.emit(ops);
    this.bump();
    return moved;
  }

  /** 되살릴 블록 한 벌을 새 이름으로 복사한다. */
  private reborn(block: Block): Block {
    const fresh: Block = { ...block, id: newId(), spans: block.spans.map((x) => ({ ...x })) };
    if (block.table) {
      fresh.table = {
        ...block.table,
        widths: [...block.table.widths],
        rows: block.table.rows.map((r) => ({
          cells: r.cells.map((c) => ({ ...c, id: newId(), spans: c.spans.map((x) => ({ ...x })) })),
        })),
      };
    }
    return fresh;
  }

  /** 블록 하나를 원하는 모습으로 만드는 최소 변경. */
  private reshape(id: string, want: Block): Op[] {
    const ops: Op[] = [];
    const now = this.cache.blocks.find((b) => b.id === id);
    if (!now) return ops;

    if (now.kind !== want.kind || now.align !== want.align || now.indent !== want.indent) {
      // undefined 를 그대로 넘기면 CRDT 가 「안 바꾼다」로 읽는다. 그래서
      // 「가운데 맞춤 → 왼쪽으로 되돌리기」와 「한 단 들여씀 → 0단으로
      // 되돌리기」가 아무 일도 하지 않았다. 기본값을 **명시**해야 돌아간다.
      ops.push(
        ...this.crdt.setBlockAttrs(id, {
          kind: want.kind,
          align: want.align ?? "left",
          indent: want.indent ?? 0,
        }),
      );
    }
    if (want.table && JSON.stringify(now.table) !== JSON.stringify(want.table)) {
      ops.push(...this.crdt.setTable(id, want.table));
    }
    ops.push(...this.setSpans(id, want.spans));
    if (want.table) {
      for (const row of want.table.rows) {
        for (const cell of row.cells) ops.push(...this.setSpans(cell.id, cell.spans));
      }
    }
    return ops;
  }

  /** 그릇의 내용을 원하는 토막들로. 글자 차이 + 서식 차이를 각각 최소로. */
  private setSpans(container: string, want: readonly Span[]): Op[] {
    const ops: Op[] = [];
    const have = this.crdt.containerText(container);
    const target = spansText(want);

    const d = diffText(have, target);
    if (d) {
      if (d.remove > 0) ops.push(...this.crdt.deleteText(container, d.at, d.at + d.remove));
      if (d.insert) ops.push(...this.crdt.insertText(container, d.at, d.insert));
    }

    // 서식은 토막마다 통째로 다시 건다. 글자 수가 같아진 뒤이므로 자리가 맞는다.
    let at = 0;
    for (const s of want) {
      const len = [...s.t].length;
      if (len > 0) {
        ops.push(...this.crdt.formatText(container, at, at + len, spanToPatch(s)));
      }
      at += len;
    }
    return ops;
  }

  // ── 글자 ────────────────────────────────────────────────────────────────

  /** block-view 가 DOM 을 읽어 「이 그릇의 글자는 지금 이것이다」라고 알린다. */
  syncText(container: string, text: string): boolean {
    const have = this.crdt.containerText(container);
    const d = diffText(have, text);
    if (!d) return false;

    const ops: Op[] = [];
    if (d.remove > 0) {
      ops.push(...this.crdt.deleteText(container, d.at, d.at + d.remove));
    }
    if (d.insert) {
      // 새 글자에 붙일 서식: 커서 앞 글자에서 물려받되, 방금 누른 굵게가 있으면 그것.
      const fmt = this.formatAt(container, d.at);
      ops.push(...this.crdt.insertText(container, d.at, d.insert, fmt));
      this.pending = null;
    }
    this.emit(ops);
    this.bump();
    return true;
  }

  insertText(container: string, at: number, text: string, fmt?: FmtPatch): void {
    if (!text) return;
    this.emit(this.crdt.insertText(container, at, text, fmt ?? this.formatAt(container, at)));
    this.pending = null;
    this.bump();
  }

  deleteText(container: string, from: number, to: number): void {
    if (to <= from) return;
    this.emit(this.crdt.deleteText(container, from, to));
    this.bump();
  }

  // ── 선택 영역 ───────────────────────────────────────────────────────────

  /** 선택이 걸친 그릇들과 각 그릇 안의 범위. */
  private spanOfRange(range: BlockRange): Array<{ container: string; from: number; to: number }> {
    const order = this.containerOrder();
    const a = order.indexOf(range.from);
    const b = order.indexOf(range.to);
    if (a < 0 || b < 0) return [];
    if (a === b) {
      return [{ container: range.from, from: Math.min(range.fromAt, range.toAt), to: Math.max(range.fromAt, range.toAt) }];
    }
    const out: Array<{ container: string; from: number; to: number }> = [];
    for (let i = a; i <= b; i += 1) {
      const c = order[i];
      const len = [...this.crdt.containerText(c)].length;
      out.push({
        container: c,
        from: i === a ? range.fromAt : 0,
        to: i === b ? range.toAt : len,
      });
    }
    return out;
  }

  /**
   * 선택한 곳을 지운다. 여러 블록에 걸쳐 있으면 사이의 블록은 통째로 사라지고
   * 첫 블록과 마지막 블록이 하나로 붙는다 — 워드·한/글과 같은 동작이다.
   */
  deleteRange(range: BlockRange): Caret | null {
    const parts = this.spanOfRange(range);
    if (parts.length === 0) return null;
    if (parts.length === 1) {
      const p = parts[0];
      if (p.to <= p.from) return null;
      this.deleteText(p.container, p.from, p.to);
      return { container: p.container, at: p.from };
    }

    const first = parts[0];
    const last = parts[parts.length - 1];
    const firstBlock = this.blockOf(first.container);
    const lastBlock = this.blockOf(last.container);
    if (!firstBlock || !lastBlock) return null;

    const ops: Op[] = [];

    // 1) 걸친 그릇마다 고른 글자를 지운다. 표 칸이든 문단이든 똑같이 다룬다.
    //    첫 그릇은 [from, 끝), 마지막은 [0, to), 가운데 그릇은 통째로.
    for (const p of parts) {
      const len = spansLength(this.spansOf(p.container));
      const to = p === last ? p.to : len;
      if (to > p.from) ops.push(...this.crdt.deleteText(p.container, p.from, to));
    }

    /**
     * 2) 첫 블록과 마지막 블록 **사이의** 블록을 통째로 지운다.
     *
     * 그릇이 아니라 **블록 번호**로 센다. 예전에는 가운데 그릇마다
     * `blockOf(그릇)` 으로 주인 블록을 되물어 지웠는데, 표 칸의 주인은 표
     * 자체라 **두 칸에 걸친 선택이 표를 통째로 없앴다.** 문서 첫 블록이
     * 표이면 문서가 0블록이 되기도 했다.
     *
     * 번호로 세면 빈 줄·가로줄·쪽 나눔도 함께 지워진다 — containerOrder()
     * 는 글자를 담지 않는 블록을 세지 않아서, 예전에는 다 지운 자리에
     * 그것들만 남았다.
     */
    const a = this.indexOf(firstBlock.id);
    const b = this.indexOf(lastBlock.id);
    for (let i = a + 1; i < b; i += 1) {
      ops.push(...this.crdt.deleteBlock(this.cache.blocks[i].id));
    }

    this.emit(ops);
    this.bump();

    /**
     * 3) 마지막 블록에 남은 꼬리를 첫 블록 뒤에 붙이고 그 블록을 지운다.
     *
     * **양쪽이 다 평범한 글자 블록일 때만** 한다. 한쪽이라도 표 칸이면
     * 붙이지 않는다 — 칸의 글자를 문단으로 옮기면 표의 칸 수가 어긋나고,
     * 반대로 문단 글자를 칸에 밀어 넣으면 표 밖의 내용이 표 안으로 들어간다.
     * 워드·한/글도 표 경계를 넘는 선택 삭제에서 표를 지키는 쪽을 고른다.
     */
    const merging =
      firstBlock.id !== lastBlock.id &&
      firstBlock.id === first.container &&
      lastBlock.id === last.container &&
      BLOCK_META[firstBlock.kind].text &&
      BLOCK_META[lastBlock.kind].text;

    if (merging) {
      const tail = this.spansOf(last.container);
      const more: Op[] = [];
      if (tail.length) {
        more.push(...this.crdt.insertText(first.container, first.from, spansText(tail)));
        let at = first.from;
        for (const sp of tail) {
          const len = spansLength([sp]);
          more.push(...this.crdt.formatText(first.container, at, at + len, spanToPatch(sp)));
          at += len;
        }
      }
      more.push(...this.crdt.deleteBlock(lastBlock.id));
      this.emit(more);
      this.bump();
    }

    this.ensureNotEmpty();
    return { container: first.container, at: first.from };
  }

  /**
   * 문서에 블록이 하나도 남지 않는 일을 막는다.
   *
   * 커서를 놓을 자리가 사라지고, parseRichDoc 이 빈 배열을 null 로 떨어뜨려
   * 그 문서는 다음 새로고침에 **「서식 문서가 아닌 것」이 된다** — 화면이
   * 항목 문서로 되돌아가면서 쓰던 글이 통째로 안 보이게 된다.
   */
  private ensureNotEmpty(): void {
    if (this.cache.blocks.length > 0) return;
    this.emit(this.crdt.insertBlock(null, makeBlock("body")));
    this.bump();
  }

  /** 선택한 글자의 서식을 바꾼다. */
  format(range: BlockRange, patch: FmtPatch): void {
    const parts = this.spanOfRange(range);
    const ops: Op[] = [];
    for (const p of parts) {
      if (p.to > p.from) ops.push(...this.crdt.formatText(p.container, p.from, p.to, patch));
    }
    this.emit(ops);
    this.bump();
  }

  /** 선택 안의 글자가 모두 그 서식을 갖고 있는가. 도구모임의 눌림 상태. */
  isActive(range: BlockRange | null, key: string, value: string | boolean = true): boolean {
    if (!range) return false;
    if (range.from === range.to && range.fromAt === range.toAt) {
      const p = this.getPending(range.from, range.fromAt);
      if (p && key in p) return p[key] === value;
      return this.crdt.formatAt(range.from, Math.max(0, range.fromAt - 1))[key] === value;
    }
    for (const p of this.spanOfRange(range)) {
      const spans = this.spansOf(p.container);
      let at = 0;
      for (const s of spans) {
        const len = [...s.t].length;
        const lo = Math.max(at, p.from);
        const hi = Math.min(at + len, p.to);
        if (hi > lo) {
          const got = spanToPatch(s)[key];
          if ((got ?? false) !== value) return false;
        }
        at += len;
      }
    }
    return true;
  }

  // ── 블록 ────────────────────────────────────────────────────────────────

  /**
   * Enter — 커서 자리에서 문단을 나눈다.
   *
   * 빈 목록 항목에서 Enter 를 치면 목록을 빠져나온다. 한 단 들어가 있으면
   * 한 단 나오고, 맨 바깥이면 본문이 된다. 목록을 끝내려고 Enter 를 두 번
   * 치는 것은 모든 편집기가 같으므로, 여기서 다르면 손이 걸린다.
   */
  splitBlock(container: string, at: number): Caret | null {
    const block = this.blockOf(container);
    if (!block || block.id !== container) return null; // 표 칸에서는 나누지 않는다
    const spans = block.spans;
    const len = [...spansText(spans)].length;
    const meta = BLOCK_META[block.kind];

    if (len === 0 && (block.kind === "bullet" || block.kind === "numbered" || block.kind === "quote")) {
      const indent = clampIndent(block.indent);
      if (indent > 0) {
        this.emit(this.crdt.setBlockAttrs(block.id, { indent: indent - 1 }));
      } else {
        this.emit(this.crdt.setBlockAttrs(block.id, { kind: "body" }));
      }
      this.bump();
      return { container, at: 0 };
    }

    const tail = sliceSpans(spans, at, len);
    const nextKind: BlockKind = meta.next;
    const fresh: Block = {
      id: newId(),
      kind: nextKind,
      spans: tail,
    };
    if (BLOCK_META[nextKind].indentable && block.indent) fresh.indent = block.indent;
    if (block.align) fresh.align = block.align;

    const ops: Op[] = [];
    if (len > at) ops.push(...this.crdt.deleteText(container, at, len));
    ops.push(...this.crdt.insertBlock(block.id, fresh));
    this.emit(ops);
    this.bump();
    return { container: fresh.id, at: 0 };
  }

  /**
   * 문단 맨 앞에서 Backspace.
   *
   * 순서대로 물어본다 — 서식이 붙어 있으면 서식을 먼저 벗기고, 벗을 것이
   * 없을 때 비로소 앞 문단과 붙인다. 한 번 누를 때마다 한 가지만 일어나야
   * 무엇이 일어났는지 눈으로 따라갈 수 있다.
   */
  mergeBackward(container: string): Caret | null {
    const block = this.blockOf(container);
    if (!block || block.id !== container) return null;

    const indent = clampIndent(block.indent);
    if (indent > 0) {
      this.emit(this.crdt.setBlockAttrs(block.id, { indent: indent - 1 }));
      this.bump();
      return { container, at: 0 };
    }
    if (block.kind !== "body" && BLOCK_META[block.kind].text) {
      this.emit(this.crdt.setBlockAttrs(block.id, { kind: "body" }));
      this.bump();
      return { container, at: 0 };
    }

    const i = this.indexOf(block.id);
    if (i <= 0) return null;
    const prev = this.cache.blocks[i - 1];

    // 앞이 글자를 담지 않는 블록(가로줄·쪽나눔·표)이면 그것을 지운다.
    if (!BLOCK_META[prev.kind].text) {
      this.emit(this.crdt.deleteBlock(prev.id));
      this.bump();
      return { container, at: 0 };
    }

    const prevLen = [...spansText(prev.spans)].length;
    const mine = block.spans;
    const ops: Op[] = [];
    if (mine.length) {
      ops.push(...this.crdt.insertText(prev.id, prevLen, spansText(mine)));
      let at = prevLen;
      for (const s of mine) {
        const l = [...s.t].length;
        ops.push(...this.crdt.formatText(prev.id, at, at + l, spanToPatch(s)));
        at += l;
      }
    }
    ops.push(...this.crdt.deleteBlock(block.id));
    this.emit(ops);
    this.reanchor(block.id, prev.id, prevLen);
    this.bump();
    return { container: prev.id, at: prevLen };
  }

  /** Delete 키 — 뒤 문단을 이리로 끌어온다. */
  mergeForward(container: string): Caret | null {
    const block = this.blockOf(container);
    if (!block || block.id !== container) return null;
    const i = this.indexOf(block.id);
    if (i < 0 || i >= this.cache.blocks.length - 1) return null;
    const next = this.cache.blocks[i + 1];
    if (!BLOCK_META[next.kind].text) {
      this.emit(this.crdt.deleteBlock(next.id));
      this.bump();
      return { container, at: [...spansText(block.spans)].length };
    }
    const at = [...spansText(block.spans)].length;
    const ops: Op[] = [];
    if (next.spans.length) {
      ops.push(...this.crdt.insertText(block.id, at, spansText(next.spans)));
      let k = at;
      for (const s of next.spans) {
        const l = [...s.t].length;
        ops.push(...this.crdt.formatText(block.id, k, k + l, spanToPatch(s)));
        k += l;
      }
    }
    ops.push(...this.crdt.deleteBlock(next.id));
    this.emit(ops);
    this.reanchor(next.id, block.id, at);
    this.bump();
    return { container, at };
  }

  setKind(ids: readonly string[], kind: BlockKind): void {
    const ops: Op[] = [];
    for (const id of ids) {
      const b = this.blockOf(id);
      if (!b) continue;
      ops.push(...this.crdt.setBlockAttrs(b.id, { kind }));
      // 들여쓰기를 받지 않는 갈래로 가면 들여쓰기를 접는다. 그러지 않으면
      // 큰 항목이 이유 없이 오른쪽으로 밀려 있다.
      if (!BLOCK_META[kind].indentable && b.indent) {
        ops.push(...this.crdt.setBlockAttrs(b.id, { indent: 0 }));
      }
    }
    this.emit(ops);
    this.bump();
  }

  setAlign(ids: readonly string[], align: Align): void {
    const ops: Op[] = [];
    for (const id of ids) {
      const b = this.blockOf(id);
      if (b) ops.push(...this.crdt.setBlockAttrs(b.id, { align }));
    }
    this.emit(ops);
    this.bump();
  }

  indent(ids: readonly string[], delta: number): void {
    const ops: Op[] = [];
    for (const id of ids) {
      const b = this.blockOf(id);
      if (!b || !BLOCK_META[b.kind].indentable) continue;
      const next = clampIndent(clampIndent(b.indent) + delta);
      if (next !== clampIndent(b.indent)) {
        ops.push(...this.crdt.setBlockAttrs(b.id, { indent: next }));
      }
    }
    this.emit(ops);
    this.bump();
  }

  insertBlockAfter(afterId: string | null, block: Block): string {
    this.emit(this.crdt.insertBlock(afterId, block));
    this.bump();
    return block.id;
  }

  removeBlock(id: string): void {
    // 마지막 한 줄까지 지우면 커서 놓을 자리가 사라진다. 빈 본문을 남긴다.
    if (this.cache.blocks.length <= 1) {
      const only = this.cache.blocks[0];
      if (only) {
        const len = [...spansText(only.spans)].length;
        const ops: Op[] = [];
        if (len) ops.push(...this.crdt.deleteText(only.id, 0, len));
        ops.push(...this.crdt.setBlockAttrs(only.id, { kind: "body", indent: 0 }));
        this.emit(ops);
        this.bump();
      }
      return;
    }
    this.emit(this.crdt.deleteBlock(id));
    this.comments = this.comments.filter((c) => c.blockId !== id);
    this.bump();
  }

  /**
   * 블록을 위아래로 옮긴다.
   *
   * ⚠ 옮긴 블록은 **id 가 바뀐다.** 자리표를 나중에 갈아 끼우는 연산이 규약에
   * 없어서(wire.ts 의 Op), 지우고 새로 넣는 것으로 흉내 낸다. 그래서 옮기는
   * 그 순간 남이 그 문단에 치고 있던 글자는 살아남지 못한다. 옮기기는 드물고
   * 되돌리기로 회복되므로 이 대가를 치른다 — 규약에 연산을 하나 더 만드는
   * 것보다 여기서 정직하게 적어 두는 편이 낫다고 판단했다.
   */
  moveBlock(id: string, delta: number): string | null {
    const i = this.indexOf(id);
    if (i < 0) return null;
    const to = i + delta;
    if (to < 0 || to >= this.cache.blocks.length) return null;

    const block = structuredClone(this.cache.blocks[i]);
    const rest = this.cache.blocks.filter((b) => b.id !== id);
    const anchor = to > 0 ? rest[to - 1] ?? null : null;

    const fresh: Block = { ...block, id: newId() };
    if (fresh.table) {
      fresh.table = {
        ...fresh.table,
        rows: fresh.table.rows.map((r) => ({
          cells: r.cells.map((c) => ({ ...c, id: newId() })),
        })),
      };
    }
    const ops: Op[] = [];
    ops.push(...this.crdt.deleteBlock(id));
    ops.push(...this.crdt.insertBlock(anchor ? anchor.id : null, fresh));
    this.emit(ops);
    for (const c of this.comments) if (c.blockId === id) c.blockId = fresh.id;
    this.bump();
    return fresh.id;
  }

  // ── 표 ──────────────────────────────────────────────────────────────────

  private table(blockId: string): { block: Block; table: TableData } | null {
    const b = this.cache.blocks.find((x) => x.id === blockId);
    return b?.table ? { block: b, table: b.table } : null;
  }

  tableInsertRow(blockId: string, at: number): void {
    const t = this.table(blockId);
    if (!t) return;
    const cols = t.table.widths.length;
    const rows = [...t.table.rows];
    rows.splice(Math.max(0, Math.min(at, rows.length)), 0, {
      cells: Array.from({ length: cols }, () => ({ id: newId(), spans: [] as Span[] })),
    });
    this.emit(this.crdt.setTable(blockId, { ...t.table, rows }));
    this.bump();
  }

  tableInsertCol(blockId: string, at: number): void {
    const t = this.table(blockId);
    if (!t) return;
    const widths = [...t.table.widths];
    const idx = Math.max(0, Math.min(at, widths.length));
    widths.splice(idx, 0, 1);
    const rows = t.table.rows.map((r) => {
      const cells = [...r.cells];
      cells.splice(Math.min(idx, cells.length), 0, { id: newId(), spans: [] as Span[] });
      return { cells };
    });
    this.emit(this.crdt.setTable(blockId, { ...t.table, widths, rows }));
    this.bump();
  }

  tableDeleteRow(blockId: string, at: number): void {
    const t = this.table(blockId);
    if (!t || t.table.rows.length <= 1) return;
    const rows = t.table.rows.filter((_, i) => i !== at);
    this.emit(this.crdt.setTable(blockId, { ...t.table, rows }));
    this.bump();
  }

  tableDeleteCol(blockId: string, at: number): void {
    const t = this.table(blockId);
    if (!t || t.table.widths.length <= 1) return;
    const widths = t.table.widths.filter((_, i) => i !== at);
    const rows = t.table.rows.map((r) => ({ cells: r.cells.filter((_, i) => i !== at) }));
    this.emit(this.crdt.setTable(blockId, { ...t.table, widths, rows }));
    this.bump();
  }

  tableSetWidths(blockId: string, widths: number[]): void {
    const t = this.table(blockId);
    if (!t || widths.length !== t.table.widths.length) return;
    this.emit(this.crdt.setTable(blockId, { ...t.table, widths }));
    this.bump();
  }

  tableToggleHeader(blockId: string): void {
    const t = this.table(blockId);
    if (!t) return;
    this.emit(this.crdt.setTable(blockId, { ...t.table, header: !t.table.header }));
    this.bump();
  }

  tableSetCellAlign(blockId: string, cellId: string, align: Align): void {
    const t = this.table(blockId);
    if (!t) return;
    const rows = t.table.rows.map((r) => ({
      cells: r.cells.map((c) => (c.id === cellId ? { ...c, align } : c)),
    }));
    this.emit(this.crdt.setTable(blockId, { ...t.table, rows }));
    this.bump();
  }

  /** 표에서 커서가 있는 칸의 자리(줄·칸 번호). */
  cellAddress(cellId: string): { blockId: string; row: number; col: number } | null {
    for (const b of this.cache.blocks) {
      if (!b.table) continue;
      for (let r = 0; r < b.table.rows.length; r += 1) {
        const c = b.table.rows[r].cells.findIndex((x) => x.id === cellId);
        if (c >= 0) return { blockId: b.id, row: r, col: c };
      }
    }
    return null;
  }

  makeTableBlock(rows: number, cols: number): Block {
    const b = makeBlock("table");
    b.table = makeTable(rows, cols);
    return b;
  }

  // ── 의견 ────────────────────────────────────────────────────────────────

  addComment(c: Omit<DocComment, "id">): DocComment {
    const made: DocComment = { ...c, id: newId(), replies: [] };
    this.comments = [...this.comments, made];
    this.bump();
    return made;
  }

  replyComment(id: string, reply: { authorId: string; authorName: string; body: string; at: string }): void {
    this.comments = this.comments.map((c) =>
      c.id === id ? { ...c, replies: [...(c.replies ?? []), { ...reply, id: newId() }] } : c,
    );
    this.bump();
  }

  resolveComment(id: string, done: boolean): void {
    this.comments = this.comments.map((c) => (c.id === id ? { ...c, done } : c));
    this.bump();
  }

  /**
   * 지운 의견의 id.
   *
   * 목록에서 빼는 것만으로는 부족하다. 상대는 「없어진 것」과 「아직 못 받은
   * 것」을 구별할 수 없어서, 상대가 다음 신호를 보내는 순간 지운 의견이
   * **되살아나** 자동 저장이 그것을 DB 에 다시 쓴다. 한 판(세션) 동안만
   * 들고 있으면 되고, 저장된 문서에는 남지 않는다.
   */
  private goneComments = new Set<string>();

  removeComment(id: string): void {
    this.comments = this.comments.filter((c) => c.id !== id);
    this.goneComments.add(id);
    this.bump();
  }

  /** 지운 의견 목록. use-collab 이 신호에 함께 실어 보낸다. */
  removedComments(): string[] {
    return [...this.goneComments];
  }

  /** 원격에서 온 의견을 합친다. 같은 id 면 나중 것이 이기고, 지운 것은 안 살린다. */
  mergeComments(incoming: readonly DocComment[], gone: readonly string[] = []): void {
    const byId = new Map(this.comments.map((c) => [c.id, c]));
    let changed = false;

    for (const id of gone) {
      if (!this.goneComments.has(id)) this.goneComments.add(id);
      if (byId.delete(id)) changed = true;
    }
    for (const c of incoming) {
      // 내가 지운 것은 남이 보내와도 되살리지 않는다.
      if (this.goneComments.has(c.id)) continue;
      const have = byId.get(c.id);
      if (!have || JSON.stringify(have) !== JSON.stringify(c)) {
        byId.set(c.id, c);
        changed = true;
      }
    }
    if (!changed) return;
    const live = new Set(this.cache.blocks.map((b) => b.id));
    this.comments = [...byId.values()].filter((c) => live.has(c.blockId));
    this.bump();
  }

  /** 블록이 합쳐질 때 의견도 따라간다. */
  private reanchor(fromBlock: string, toBlock: string, shift: number): void {
    this.comments = this.comments.map((c) =>
      c.blockId === fromBlock
        ? {
            ...c,
            blockId: toBlock,
            ...(c.from !== undefined ? { from: c.from + shift } : {}),
            ...(c.to !== undefined ? { to: c.to + shift } : {}),
          }
        : c,
    );
  }

  // ── 원격 ────────────────────────────────────────────────────────────────

  applyRemote(ops: Op[]): boolean {
    const changed = this.crdt.apply(ops);
    if (changed) {
      // 원격 변경은 「내가 저장할 것」이 아니므로 dirty 를 올리지 않는다.
      // 저장은 이 문서를 편집 중인 사람 중 하나가 대표로 한다(use-collab).
      this.cache = this.build();
      this.version += 1;
      for (const fn of this.listeners) fn();
      // 검문소의 기준도 함께 옮긴다. 그러지 않으면 다음 되돌리기가 남의
      // 변경까지 「내가 한 것」으로 착각해 되돌린다.
      this.mark = this.takeMark();
    }
    return changed;
  }

  /** 합류한 사람에게 보낼 상태 한 벌. */
  exportState(): unknown {
    return this.crdt.state();
  }

  /** 남이 준 상태로 갈아탄다. 합류 절차에서 딱 한 번 부른다. */
  adoptState(state: unknown): boolean {
    const next = DocCrdt.fromState(state, this.site);
    if (!next) return false;
    this.crdt = next;
    this.undoStack = [];
    this.redoStack = [];
    this.cache = this.build();
    this.mark = this.takeMark();
    this.version += 1;
    for (const fn of this.listeners) fn();
    return true;
  }

  /** 저장할 값. 의견을 다시 붙여 내보낸다. */
  toSaved(): RichDoc {
    return this.build();
  }

  /** 화면이 쓰는 번호 매김. 저장하지 않고 그릴 때 센다. */
  ordinals(): number[] {
    return computeOrdinals(this.cache.blocks);
  }
}

/** 토막의 서식을 CRDT 가 쓰는 모양으로. */
export function spanToPatch(s: Span): FmtPatch {
  const out: FmtPatch = {};
  for (const m of ["b", "i", "u", "s", "sup", "sub"] as const) {
    out[m] = (s.m ?? []).includes(m);
  }
  out.c = s.c ?? "default";
  out.h = s.h ?? "none";
  return out;
}

/** 서식 한 벌을 토막으로. 붙여넣기·미리보기에서 쓴다. */
export function patchToSpan(text: string, fmt: FmtPatch): Span {
  const marks = (["b", "i", "u", "s", "sup", "sub"] as const).filter((m) => fmt[m] === true);
  const span: Span = { t: text };
  if (marks.length) span.m = [...marks];
  if (typeof fmt.c === "string" && fmt.c !== "default") span.c = fmt.c as Span["c"];
  if (typeof fmt.h === "string" && fmt.h !== "none") span.h = fmt.h as Span["h"];
  return normalizeSpans([span])[0] ?? { t: text };
}

/** 표 칸 하나를 새로. */
export function newCell(): TableCell {
  return { id: newId(), spans: [] };
}
