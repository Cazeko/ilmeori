/**
 * 편집기의 DOM 층 — 모델의 「몇 번째 글자」와 브라우저의 「어느 노드의 몇 칸」을
 * 서로 옮긴다.
 *
 * ── 글자 세는 단위를 하나로 못박는다 ────────────────────────────────────────
 *
 * 자바스크립트의 문자열 길이는 UTF-16 **코드 단위**다. 「😀」는 length 가 2 이고,
 * 「𠀋」 같은 확장 한자도 마찬가지다. 그 단위로 자르면 한 글자가 반으로 갈라져
 * 짝 잃은 서로게이트가 되고, 그 값은 XML 에서 U+FFFD(�) 로 바뀐다 —
 * 결재 문서에 마름모가 박혀 나간다는 뜻이다(pack.ts 의 esc() 주석에 같은 사고).
 *
 * 그래서 이 편집기는 **코드포인트**를 단위로 쓴다. CRDT 의 offset 도, 커서 위치도,
 * 의견이 가리키는 범위도 전부 코드포인트다. DOM 만이 코드 단위로 말하므로,
 * 그 경계에서 옮기는 일을 이 파일이 한 곳에서 맡는다.
 *
 * `[...s].length` 로 세지 않는 이유는 이 함수들이 커서가 움직일 때마다 불리기
 * 때문이다. 배열을 만들지 않고 서로게이트 상위 짝만 건너뛴다.
 */

import {
  MARKS,
  spansText,
  type Block,
  type Mark,
  type Span,
} from "@/lib/editor/model";

// ===========================================================================
// 코드포인트 셈
// ===========================================================================

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** 코드포인트 개수. */
export function cpLen(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    n += 1;
    if (isHighSurrogate(s.charCodeAt(i)) && i + 1 < s.length) i += 1;
  }
  return n;
}

/** 코드포인트 번호 → UTF-16 자리. 범위를 넘으면 문자열 끝. */
export function cpToUnit(s: string, cp: number): number {
  if (cp <= 0) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (n === cp) return i;
    n += 1;
    if (isHighSurrogate(s.charCodeAt(i)) && i + 1 < s.length) i += 1;
  }
  return s.length;
}

/** UTF-16 자리 → 코드포인트 번호. */
export function unitToCp(s: string, unit: number): number {
  const stop = unit < s.length ? unit : s.length;
  let n = 0;
  for (let i = 0; i < stop; i += 1) {
    n += 1;
    if (isHighSurrogate(s.charCodeAt(i)) && i + 1 < s.length) i += 1;
  }
  return n;
}

/** 코드포인트 기준으로 자른다. */
export function cpSlice(s: string, from: number, to?: number): string {
  const a = cpToUnit(s, from);
  const b = to === undefined ? s.length : cpToUnit(s, to);
  return s.slice(a, b < a ? a : b);
}

// ===========================================================================
// 글자만 바뀌었을 때의 최소 변경
// ===========================================================================

export type TextDiff = { at: number; remove: number; insert: string };

/**
 * 두 글월의 차이를 「한 자리에서 지우고 넣기」 한 번으로.
 *
 * 앞뒤로 같은 부분을 걷어내면 남는 것이 실제로 바뀐 곳이다. 편집기에서
 * 한 번에 여러 곳이 바뀌는 일은 없다 — 커서가 하나이기 때문이다.
 * (여러 곳이 한꺼번에 바뀌면 이 함수는 그 전체를 한 덩어리로 본다. 결과가
 *  틀리지는 않고, 필요 이상으로 크게 지웠다 넣을 뿐이다)
 *
 * ⚠ 앞뒤를 걷어낼 때 **코드포인트 경계에서** 멈춰야 한다. 코드 단위로 세면
 * 「😀」의 상위 짝만 같다고 판정해 반쪽이 남는다.
 */
export function diffText(before: string, after: string): TextDiff | null {
  if (before === after) return null;

  const a = [...before];
  const b = [...after];

  let head = 0;
  const min = a.length < b.length ? a.length : b.length;
  while (head < min && a[head] === b[head]) head += 1;

  let tail = 0;
  while (
    tail < min - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }

  return {
    at: head,
    remove: a.length - head - tail,
    insert: b.slice(head, b.length - tail).join(""),
  };
}

// ===========================================================================
// 블록 하나를 HTML 로
// ===========================================================================

const MARK_TAG: Record<Mark, string> = {
  b: "strong",
  i: "em",
  u: "u",
  s: "s",
  sup: "sup",
  sub: "sub",
};

/**
 * 글자색·형광펜의 클래스 이름.
 *
 * 인라인 style 을 쓰지 않는다. 여기서 만든 HTML 은 contenteditable 안에 들어가고,
 * 사용자가 그것을 복사해 다른 곳에 붙일 수 있다 — 그때 우리 CSS 변수는 따라가지
 * 않으므로 색이 통째로 사라진다. 내보내기·클립보드용 HTML 은 따로 만든다
 * (src/lib/editor/html.ts 가 그 자리에서 인라인 style 을 쓴다).
 */
function colorClass(c: string): string {
  return `ilm-c-${c}`;
}
function highlightClass(h: string): string {
  return `ilm-h-${h}`;
}

export function escapeHtml(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else out += ch;
  }
  return out;
}

/** 글자 범위에 덧씌우는 표시(의견이 달린 자리, 찾은 낱말). */
export type Overlay = {
  from: number;
  to: number;
  className: string;
  /** 눌렀을 때 무엇을 여는지 — data-속성으로 심는다. */
  id?: string;
};

/**
 * 토막을 겹쳐진 표시에 맞춰 다시 쪼갠다.
 *
 * 의견이 「가나다라」의 「나다」에만 달려 있으면 한 토막을 셋으로 나눠야 한다.
 * 모델을 건드리지 않고 그리는 순간에만 나눈다 — 의견은 본문이 아니기 때문이다.
 */
function splitByOverlays(
  spans: readonly Span[],
  overlays: readonly Overlay[],
): Array<{ span: Span; overlays: Overlay[] }> {
  const out: Array<{ span: Span; overlays: Overlay[] }> = [];
  if (overlays.length === 0) {
    for (const s of spans) out.push({ span: s, overlays: [] });
    return out;
  }

  // 경계를 모아 오름차순으로. 그 사이사이가 한 조각이 된다.
  const bounds = new Set<number>([0]);
  let total = 0;
  for (const s of spans) {
    total += cpLen(s.t);
    bounds.add(total);
  }
  for (const o of overlays) {
    if (o.from > 0 && o.from < total) bounds.add(o.from);
    if (o.to > 0 && o.to < total) bounds.add(o.to);
  }
  const cuts = [...bounds].sort((x, y) => x - y);

  let at = 0;
  for (const s of spans) {
    const len = cpLen(s.t);
    const end = at + len;
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b <= at || a >= end) continue;
      const from = a > at ? a : at;
      const to = b < end ? b : end;
      if (to <= from) continue;
      out.push({
        span: { ...s, t: cpSlice(s.t, from - at, to - at) },
        overlays: overlays.filter((o) => o.from <= from && o.to >= to),
      });
    }
    at = end;
  }
  return out;
}

function spanHtml(span: Span, overlays: readonly Overlay[]): string {
  let html = escapeHtml(span.t);

  // 마크는 안쪽부터 감싼다. 순서를 MARKS 로 고정해 두면 같은 서식이 언제나
  // 같은 HTML 이 되고, 「다시 그릴 필요가 있는가」를 문자열 비교로 물을 수 있다.
  const marks = span.m ?? [];
  for (let i = MARKS.length - 1; i >= 0; i -= 1) {
    const m = MARKS[i];
    if (!marks.includes(m)) continue;
    const tag = MARK_TAG[m];
    html = `<${tag}>${html}</${tag}>`;
  }

  const classes: string[] = [];
  if (span.c && span.c !== "default") classes.push(colorClass(span.c));
  if (span.h && span.h !== "none") classes.push(highlightClass(span.h));
  for (const o of overlays) classes.push(o.className);

  if (classes.length) {
    const anchored = overlays.find((o) => o.id);
    const attr = anchored ? ` data-cm="${escapeHtml(anchored.id!)}"` : "";
    html = `<span class="${classes.join(" ")}"${attr}>${html}</span>`;
  }
  return html;
}

/**
 * 블록의 속을 HTML 로.
 *
 * 빈 블록에 `<br>` 을 넣는 것은 장식이 아니다. 속이 완전히 비면 그 줄의 높이가
 * 0 이 되어 **누를 수가 없다** — 커서를 놓을 방법이 사라진다.
 */
export function renderInner(
  block: Block,
  overlays: readonly Overlay[] = [],
): string {
  const spans = block.spans;
  if (!spans.length || !spansText(spans)) return "<br>";
  return splitByOverlays(spans, overlays)
    .map(({ span, overlays: o }) => spanHtml(span, o))
    .join("");
}

// ===========================================================================
// DOM ↔ 글자 번호
// ===========================================================================

/** 그 요소 안의 글자. 줄바꿈 요소는 없는 것으로 본다(우리 모델에 없다). */
export function readText(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      // contenteditable 이 넣는 줄바꿈 없는 빈칸( )을 보통 빈칸으로 되돌린다.
      // 블록에 white-space: pre-wrap 을 걸어 두었으므로 브라우저가 이것을 넣을
      // 이유가 없지만, 붙여넣기로는 들어온다.
      out += (node as Text).data.replace(/ /g, " ");
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    // 우리가 그리지 않은 것(브라우저가 끼워 넣은 것)도 글자는 건진다.
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
  };
  for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
  return out;
}

/** DOM 의 (노드, 칸) 을 이 블록 안의 글자 번호로. */
export function domToCp(root: HTMLElement, node: Node, offset: number): number {
  let count = 0;
  let found = -1;

  const walk = (n: Node): boolean => {
    if (n === node && n.nodeType !== 3) {
      // 요소 위에 커서가 있다 — offset 은 자식의 번호다.
      let i = 0;
      for (let c = n.firstChild; c && i < offset; c = c.nextSibling) i += 1;
      // 그 자식 앞까지의 글자를 세려면 계속 걸어야 하므로, 표시만 남긴다.
      let seen = 0;
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (seen >= offset) break;
        count += cpLen(textOf(c));
        seen += 1;
      }
      found = count;
      return true;
    }
    if (n.nodeType === 3) {
      if (n === node) {
        const data = (n as Text).data.replace(/ /g, " ");
        found = count + unitToCp(data, offset);
        return true;
      }
      count += cpLen((n as Text).data.replace(/ /g, " "));
      return false;
    }
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (walk(c)) return true;
    }
    return false;
  };

  if (node === root) {
    let seen = 0;
    let n = 0;
    for (let c = root.firstChild; c && seen < offset; c = c.nextSibling) {
      n += cpLen(textOf(c));
      seen += 1;
    }
    return n;
  }

  walk(root);
  return found >= 0 ? found : 0;
}

function textOf(n: Node): string {
  return (n.textContent ?? "").replace(/ /g, " ");
}

/** 글자 번호 → DOM 의 (노드, 칸). 커서를 되돌려 놓는 데 쓴다. */
export function cpToDom(
  root: HTMLElement,
  cp: number,
): { node: Node; offset: number } {
  let left = cp < 0 ? 0 : cp;
  let last: Text | null = null;

  const walk = (n: Node): { node: Node; offset: number } | null => {
    if (n.nodeType === 3) {
      const t = n as Text;
      const data = t.data.replace(/ /g, " ");
      const len = cpLen(data);
      if (left <= len) return { node: t, offset: cpToUnit(t.data, left) };
      left -= len;
      last = t;
      return null;
    }
    if (n.nodeType !== 1) return null;
    for (let c = n.firstChild; c; c = c.nextSibling) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };

  for (let c = root.firstChild; c; c = c.nextSibling) {
    const hit = walk(c);
    if (hit) return hit;
  }
  // 글자보다 뒤를 가리켰다 — 마지막 글자 끝, 아니면 블록 자체.
  if (last) return { node: last, offset: (last as Text).data.length };
  return { node: root, offset: 0 };
}

// ===========================================================================
// 선택 영역
// ===========================================================================

export type BlockRange = {
  /** 시작 블록 id */
  from: string;
  fromAt: number;
  /** 끝 블록 id. from 과 같으면 한 블록 안의 선택이다. */
  to: string;
  toAt: number;
  /** 문서 순서로 뒤집혀 있는가(아래에서 위로 끌었는가). */
  reversed: boolean;
};

/** 이 노드가 들어 있는 편집 가능한 블록. 없으면 null. */
export function blockElOf(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === 1) {
      const el = n as HTMLElement;
      if (el.dataset.ilmBlock) return el;
    }
    n = n.parentNode;
  }
  return null;
}

/** 그 블록(또는 표 칸)의 그릇 이름. CRDT 가 이 이름으로 글자를 담는다. */
export function containerOf(el: HTMLElement): string {
  return el.dataset.ilmContainer ?? el.dataset.ilmBlock ?? "";
}

/**
 * 지금 커서가 어디에 있는가.
 *
 * 블록 두 개에 걸친 선택도 그대로 읽는다. 브라우저는 서로 다른 contenteditable
 * 사이의 선택을 허용하고 파랗게 칠해 주기까지 하지만, **그 위에서 타이핑하면
 * 무슨 일이 일어날지는 정하지 않았다.** 그래서 편집기가 가로채 직접 처리한다.
 */
export function readSelection(root: HTMLElement): BlockRange | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) {
    return null;
  }
  const aEl = blockElOf(sel.anchorNode);
  const fEl = blockElOf(sel.focusNode);
  if (!aEl || !fEl || !root.contains(aEl) || !root.contains(fEl)) return null;

  const aAt = domToCp(aEl, sel.anchorNode, sel.anchorOffset);
  const fAt = domToCp(fEl, sel.focusNode, sel.focusOffset);

  if (aEl === fEl) {
    const id = containerOf(aEl);
    const reversed = fAt < aAt;
    return {
      from: id,
      fromAt: reversed ? fAt : aAt,
      to: id,
      toAt: reversed ? aAt : fAt,
      reversed,
    };
  }

  // 문서 순서로 어느 쪽이 앞인지는 DOM 이 안다.
  const backwards =
    (aEl.compareDocumentPosition(fEl) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  return backwards
    ? {
        from: containerOf(fEl),
        fromAt: fAt,
        to: containerOf(aEl),
        toAt: aAt,
        reversed: true,
      }
    : {
        from: containerOf(aEl),
        fromAt: aAt,
        to: containerOf(fEl),
        toAt: fAt,
        reversed: false,
      };
}

/** 커서를 그 그릇의 그 자리에 놓는다. */
export function placeCaret(el: HTMLElement, at: number, to?: number): void {
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  if (!sel) return;
  const a = cpToDom(el, at);
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  if (to !== undefined && to !== at) {
    const b = cpToDom(el, to);
    range.setEnd(b.node, b.offset);
  } else {
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * 속을 갈아 끼우고 커서를 되돌려 놓는다.
 *
 * innerHTML 을 바꾸면 그 안의 노드가 전부 새로 만들어져 커서가 사라진다.
 * 글자 번호는 코드포인트라 구조가 바뀌어도 뜻이 그대로다 — 그래서 번호로
 * 기억했다가 번호로 되돌린다.
 *
 * ⚠ **조합 중에는 절대 부르지 마라.** 브라우저가 붙들고 있는 텍스트 노드를
 * 갈아 치우면 한글이 「한」 대신 「ㅎㅏㄴ」이 되거나 두 번 들어간다.
 * 부르는 쪽(block-view)이 isComposing 을 보고 막는다.
 */
export function setInner(el: HTMLElement, html: string, caret?: {
  at: number;
  to?: number;
}): void {
  if (el.innerHTML === html) {
    if (caret) placeCaret(el, caret.at, caret.to);
    return;
  }
  el.innerHTML = html;
  if (caret) placeCaret(el, caret.at, caret.to);
}
