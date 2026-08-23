"use client";

import { memo, useLayoutEffect, useRef } from "react";
import {
  BLOCK_META,
  clampIndent,
  markerFor,
  spansText,
  type Block,
  type DocComment,
} from "@/lib/editor/model";
import { cn } from "@/lib/cn";
import { domToCp, placeCaret, readText, renderInner, type Overlay } from "./dom";
import { CURSOR_TONES } from "./use-collab";

/**
 * 블록 한 줄.
 *
 * ── 이 컴포넌트는 이벤트를 듣지 않는다 ─────────────────────────────────────
 *
 * 자판·조합·붙여넣기는 전부 편집기 뿌리 하나가 위임으로 받는다
 * (rich-doc-editor.tsx). 블록마다 리스너를 달면 블록 수만큼 달리고, 여러
 * 블록에 걸친 선택을 다룰 때 어느 블록의 리스너가 주인인지가 애매해진다.
 *
 * ── 언제 DOM 을 갈아 끼우는가 ───────────────────────────────────────────────
 *
 * 평범하게 글자를 치는 동안에는 **브라우저가 고친 DOM 을 그대로 둔다.**
 * 모델이 이미 그것과 같아졌기 때문이다(엔진이 DOM 을 읽어 맞춘다).
 * 갈아 끼우는 것은 모양이 실제로 달라졌을 때뿐이다 — 서식이 붙었거나, 남의
 * 변경이 왔거나, 되돌렸거나.
 *
 * **조합 중에는 무슨 일이 있어도 건드리지 않는다.** 브라우저가 붙들고 있는
 * 텍스트 노드를 갈아 치우면 「한」이 「ㅎㅏㄴ」이 되거나 두 번 들어간다.
 * 조합 여부는 뿌리가 data-ilm-composing 으로 알려 준다 — React 상태로 두면
 * 그 상태를 바꾸는 것 자체가 리렌더라서 같은 사고를 부른다.
 */

export type CaretFlag = {
  /** 남의 커서. 이름표를 띄운다. */
  name: string;
  /** 색 번호. 사람마다 다른 색을 준다. */
  tone: number;
  at: number;
  to: number | null;
};

type Props = {
  block: Block;
  /** 번호 목록의 순번. 저장하지 않고 그릴 때 센다. */
  ordinal: number;
  comments: readonly DocComment[];
  carets: readonly CaretFlag[];
  readOnly: boolean;
  /** 커서가 이 블록에 있는가. */
  active: boolean;
  showGutter: boolean;
};

function BlockViewInner({
  block,
  ordinal,
  comments,
  carets,
  readOnly,
  active,
  showGutter,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtml = useRef<string>("");

  const meta = BLOCK_META[block.kind];
  const indent = clampIndent(block.indent);
  const marker = markerFor(block.kind, indent, ordinal);

  // 의견이 달린 글자 범위를 밑줄로 표시한다. 본문을 고치지 않고 그릴 때만 덧씌운다.
  const overlays: Overlay[] = [];
  for (const c of comments) {
    if (c.done) continue;
    if (c.from === undefined || c.to === undefined || c.to <= c.from) continue;
    overlays.push({ from: c.from, to: c.to, className: "ilm-cm-anchor", id: c.id });
  }

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !meta.text) return;

    // 조합 중이면 손대지 않는다. 조합이 끝나면 뿌리가 다시 그리게 만든다.
    const root = el.closest("[data-ilm-root]") as HTMLElement | null;
    if (root?.dataset.ilmComposing === "1") return;

    const html = renderInner(block, overlays);
    // 모양도 그대로이고 글자도 그대로면 브라우저가 고친 DOM 이 이미 맞다.
    if (html === lastHtml.current && readText(el) === spansText(block.spans)) {
      return;
    }
    if (el.innerHTML !== html) {
      const sel = el.ownerDocument.getSelection();
      const inside =
        sel &&
        sel.rangeCount > 0 &&
        sel.anchorNode &&
        sel.focusNode &&
        el.contains(sel.anchorNode);
      // 커서가 이 블록에 있으면 자리를 기억했다 되돌린다. innerHTML 을 갈면
      // 안의 노드가 전부 새로 만들어져 커서가 사라진다.
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

  // ── 글자를 담지 않는 블록 ───────────────────────────────────────────────
  if (!meta.text) {
    return (
      <div
        data-ilm-shell={block.id}
        className={cn("ilm-shell", active && "ilm-shell-active")}
      >
        {showGutter ? <BlockLabel label={meta.label} active={active} /> : null}
        {block.kind === "divider" ? (
          <hr className="ilm-divider" />
        ) : block.kind === "pagebreak" ? (
          <div className="ilm-pagebreak" role="separator" aria-label="쪽 나눔">
            <span>쪽 나눔</span>
          </div>
        ) : (
          <div className="ilm-spacer" aria-hidden />
        )}
      </div>
    );
  }

  return (
    <div
      data-ilm-shell={block.id}
      className={cn("ilm-shell", active && "ilm-shell-active")}
      style={indent ? { paddingInlineStart: `${indent * 22}px` } : undefined}
    >
      {showGutter ? <BlockLabel label={meta.label} active={active} /> : null}

      <div className="ilm-row">
        {marker ? (
          // 부호는 편집칸 **밖**에 있다. 안에 넣으면 지울 수 있게 되고,
          // 지워진 「1.」이 본문 글자가 되어 번호가 어긋난다.
          <span className="ilm-marker" aria-hidden>
            {marker}
          </span>
        ) : null}

        <div className="ilm-caretbox">
          <div
            ref={ref}
            data-ilm-block={block.id}
            data-ilm-container={block.id}
            data-ilm-kind={block.kind}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-multiline="false"
            aria-label={`${meta.label}${marker ? ` ${marker}` : ""}`}
            className={cn("ilm-block", `ilm-k-${block.kind}`)}
            style={block.align ? { textAlign: block.align } : undefined}
          />
          {carets.map((c, i) => (
            <RemoteCaret key={`${c.name}-${i}`} flag={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 다시 그릴지를 직접 판단한다.
 *
 * 기본 얕은 비교로는 소용이 없다 — 부모가 매번 새 배열을 만들어 넘기므로
 * 모든 블록이 자판 한 번에 전부 다시 그려진다. 블록 300개짜리 문서에서
 * 그것은 타이핑이 밀리는 것으로 곧장 나타난다.
 */
function sameProps(a: Props, b: Props): boolean {
  if (a.block !== b.block) return false;
  if (a.ordinal !== b.ordinal) return false;
  if (a.readOnly !== b.readOnly) return false;
  if (a.active !== b.active) return false;
  if (a.showGutter !== b.showGutter) return false;
  if (a.comments.length !== b.comments.length) return false;
  for (let i = 0; i < a.comments.length; i += 1) {
    if (a.comments[i] !== b.comments[i]) return false;
  }
  if (a.carets.length !== b.carets.length) return false;
  for (let i = 0; i < a.carets.length; i += 1) {
    const x = a.carets[i];
    const y = b.carets[i];
    if (x.name !== y.name || x.tone !== y.tone || x.at !== y.at || x.to !== y.to) {
      return false;
    }
  }
  return true;
}

export const BlockView = memo(BlockViewInner, sameProps);

function BlockLabel({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn("ilm-gutter", active && "ilm-gutter-active")} aria-hidden>
      {label}
    </span>
  );
}

/**
 * 남의 커서.
 *
 * 화면 좌표는 뿌리가 Range 를 만들어 잰 뒤 CSS 변수로 넣어 준다. 여기서
 * 재면 렌더 중에 배치를 강제로 계산하게 되어(layout thrash) 글자를 칠 때마다
 * 화면 전체가 한 번씩 멎는다.
 */
function RemoteCaret({ flag }: { flag: CaretFlag }) {
  return (
    <span
      className="ilm-remote"
      data-tone={flag.tone % CURSOR_TONES}
      data-at={flag.at}
      data-to={flag.to ?? ""}
      aria-hidden
    >
      <span className="ilm-remote-name">{flag.name}</span>
    </span>
  );
}
