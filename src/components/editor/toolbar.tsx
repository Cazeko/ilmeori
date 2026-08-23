"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  Printer,
  Redo2,
  RemoveFormatting,
  Scissors,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
  Underline,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import {
  BLOCK_KINDS,
  BLOCK_META,
  HIGHLIGHTS,
  TEXT_COLORS,
  type Align,
  type BlockKind,
  type Highlight,
  type TextColor,
} from "@/lib/editor/model";

/**
 * 서식 도구모음.
 *
 * ── 무엇을 넣지 않았는가 ────────────────────────────────────────────────────
 *
 * 글꼴 종류와 글자 크기 칸이 없다. 한/글의 도구모음에는 있고, 없으면 허전해
 * 보인다. 그래도 넣지 않았다 — 공문서는 어느 자리에서 열어도 같은 모양이어야
 * 하고, 문단마다 크기를 손으로 정하기 시작하면 한 문서가 스무 가지 모양이 된다.
 * 크기는 블록 갈래(제목·큰 항목·본문)가 정한다. 그래서 왼쪽 첫 칸이 **갈래**다.
 *
 * 그림 넣기도 없다. 넣으면 저장·용량·내보내기(HWPX 의 그림 규격)가 전부
 * 따라 붙는데, 지금 이 편집기가 답해야 하는 물음은 「이대로 결재에 올릴 수
 * 있는가」이지 「예쁘게 꾸밀 수 있는가」가 아니다.
 *
 * ── 눌린 상태를 반드시 그린다 ───────────────────────────────────────────────
 *
 * aria-pressed 를 붙이고 색도 함께 바꾼다. 굵게가 켜져 있는지를 색으로만
 * 알리면 색을 구분하지 못하는 사람에게는 아무 표시도 없는 것과 같다.
 */

/** 도구모음에 올리는 갈래. 13가지를 다 늘어놓으면 고르는 데 시간이 든다. */
const KIND_CHOICES: BlockKind[] = [
  "title",
  "heading",
  "subheading",
  "body",
  "bullet",
  "numbered",
  "quote",
  "source",
  "note",
];

const COLOR_LABEL: Record<TextColor, string> = {
  default: "기본",
  primary: "파랑",
  accent: "주황",
  danger: "빨강",
  gray: "회색",
};

const HIGHLIGHT_LABEL: Record<Highlight, string> = {
  none: "없음",
  yellow: "노랑",
  green: "초록",
  blue: "파랑",
  pink: "분홍",
};

const ALIGN_ITEMS: Array<{ v: Align; icon: typeof AlignLeft; label: string }> = [
  { v: "left", icon: AlignLeft, label: "왼쪽 맞춤" },
  { v: "center", icon: AlignCenter, label: "가운데 맞춤" },
  { v: "right", icon: AlignRight, label: "오른쪽 맞춤" },
  { v: "justify", icon: AlignJustify, label: "양쪽 맞춤" },
];

export type ToolbarState = {
  kind: BlockKind | null;
  align: Align;
  b: boolean;
  i: boolean;
  u: boolean;
  s: boolean;
  sup: boolean;
  sub: boolean;
  color: TextColor;
  highlight: Highlight;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
};

export type ToolbarActions = {
  setKind: (k: BlockKind) => void;
  setAlign: (a: Align) => void;
  toggle: (key: "b" | "i" | "u" | "s" | "sup" | "sub") => void;
  setColor: (c: TextColor) => void;
  setHighlight: (h: Highlight) => void;
  indent: (delta: number) => void;
  clearFormat: () => void;
  insertTable: () => void;
  insertDivider: () => void;
  insertPageBreak: () => void;
  addComment: () => void;
  undo: () => void;
  redo: () => void;
  print: () => void;
};

export function Toolbar({
  state,
  actions,
  disabled,
}: {
  state: ToolbarState;
  actions: ToolbarActions;
  disabled: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  /**
   * 도구모음은 **탭 정지 하나**다.
   *
   * `role="toolbar"` 만 붙여 놓고 단추 스물다섯 개를 전부 탭 정지로 두면,
   * 키보드만 쓰는 사람이 본문 첫 문단에 닿기까지 Tab 을 서른 번 눌러야 한다.
   * WAI-ARIA 가 toolbar 에 기대하는 것은 「하나만 탭 정지, 안에서는 화살표」
   * (roving tabindex)이고, 그렇게 해야 선언한 role 이 거짓말이 아니게 된다.
   *
   * 자식마다 상태를 내려보내는 대신 DOM 을 직접 훑는다. 이 판의 자식은 전부
   * 우리가 그린 것이고, 그때그때 몇 개가 살아 있는지(disabled)를 아는 가장
   * 정확한 곳이 DOM 이기 때문이다.
   */
  const stops = useCallback(
    () =>
      Array.from(
        barRef.current?.querySelectorAll<HTMLElement>("[data-ilm-tab]") ?? [],
      ).filter((el) => !el.hasAttribute("disabled")),
    [],
  );

  useEffect(() => {
    const all = barRef.current?.querySelectorAll<HTMLElement>("[data-ilm-tab]");
    if (!all) return;
    let first = true;
    for (const el of all) {
      const usable = !el.hasAttribute("disabled");
      el.tabIndex = usable && first ? 0 : -1;
      if (usable && first) {
        el.dataset.ilmTstop = "1";
        first = false;
      } else {
        delete el.dataset.ilmTstop;
      }
    }
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const list = stops();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? list.length - 1
          : e.key === "ArrowRight"
            ? (at + 1) % list.length
            : (at - 1 + list.length) % list.length;
    for (const el of list) el.tabIndex = -1;
    list[to].tabIndex = 0;
    list[to].focus();
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="서식"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="ilm-toolbar"
    >
      <Group>
        <IconBtn
          icon={Undo2}
          label="되돌리기"
          hint="Ctrl+Z"
          onClick={actions.undo}
          disabled={disabled || !state.canUndo}
        />
        <IconBtn
          icon={Redo2}
          label="다시 하기"
          hint="Ctrl+Shift+Z"
          onClick={actions.redo}
          disabled={disabled || !state.canRedo}
        />
        <IconBtn icon={Printer} label="인쇄" hint="Ctrl+P" onClick={actions.print} />
      </Group>

      <Divider />

      <Group>
        {/* 갈래는 <select> 다. 손수 만든 드롭다운은 키보드·보조기술 지원을
            처음부터 다시 만들어야 하고, 이 칸은 그럴 만큼 특별하지 않다. */}
        <label className="sr-only" htmlFor="ilm-kind">
          문단 갈래
        </label>
        <select
          id="ilm-kind"
          data-ilm-tab=""
          className="ilm-select"
          value={state.kind ?? "body"}
          disabled={disabled || state.kind === null}
          onChange={(e) => actions.setKind(e.target.value as BlockKind)}
        >
          {KIND_CHOICES.map((k) => (
            <option key={k} value={k}>
              {BLOCK_META[k].label}
            </option>
          ))}
          {/* 커서가 표·가로줄에 있을 때를 위해. 고를 수는 없다. */}
          {state.kind && !KIND_CHOICES.includes(state.kind) ? (
            <option value={state.kind}>{BLOCK_META[state.kind].label}</option>
          ) : null}
        </select>
      </Group>

      <Divider />

      <Group>
        <IconBtn icon={Bold} label="굵게" hint="Ctrl+B" pressed={state.b} onClick={() => actions.toggle("b")} disabled={disabled} />
        <IconBtn icon={Italic} label="기울임" hint="Ctrl+I" pressed={state.i} onClick={() => actions.toggle("i")} disabled={disabled} />
        <IconBtn icon={Underline} label="밑줄" hint="Ctrl+U" pressed={state.u} onClick={() => actions.toggle("u")} disabled={disabled} />
        <IconBtn icon={Strikethrough} label="취소선" hint="Ctrl+Shift+X" pressed={state.s} onClick={() => actions.toggle("s")} disabled={disabled} />
        <IconBtn icon={Superscript} label="위첨자" pressed={state.sup} onClick={() => actions.toggle("sup")} disabled={disabled} />
        <IconBtn icon={Subscript} label="아래첨자" pressed={state.sub} onClick={() => actions.toggle("sub")} disabled={disabled} />
      </Group>

      <Divider />

      <Group>
        <Picker
          icon={Baseline}
          label="글자색"
          value={COLOR_LABEL[state.color]}
          disabled={disabled}
          swatch={`ilm-c-${state.color}`}
        >
          {TEXT_COLORS.map((c) => (
            <SwatchBtn
              key={c}
              label={COLOR_LABEL[c]}
              className={`ilm-sw ilm-c-${c}`}
              selected={state.color === c}
              onClick={() => actions.setColor(c)}
            />
          ))}
        </Picker>
        <Picker
          icon={Highlighter}
          label="형광펜"
          value={HIGHLIGHT_LABEL[state.highlight]}
          disabled={disabled}
          swatch={`ilm-h-${state.highlight}`}
        >
          {HIGHLIGHTS.map((h) => (
            <SwatchBtn
              key={h}
              label={HIGHLIGHT_LABEL[h]}
              className={`ilm-sw ilm-h-${h}`}
              selected={state.highlight === h}
              onClick={() => actions.setHighlight(h)}
            />
          ))}
        </Picker>
        <IconBtn
          icon={RemoveFormatting}
          label="서식 지우기"
          onClick={actions.clearFormat}
          disabled={disabled || !state.hasSelection}
        />
      </Group>

      <Divider />

      <Group>
        {ALIGN_ITEMS.map((a) => (
          <IconBtn
            key={a.v}
            icon={a.icon}
            label={a.label}
            pressed={state.align === a.v}
            onClick={() => actions.setAlign(a.v)}
            disabled={disabled}
          />
        ))}
      </Group>

      <Divider />

      <Group>
        <IconBtn icon={List} label="글머리표" pressed={state.kind === "bullet"} onClick={() => actions.setKind(state.kind === "bullet" ? "body" : "bullet")} disabled={disabled} />
        <IconBtn icon={ListOrdered} label="번호 매기기" pressed={state.kind === "numbered"} onClick={() => actions.setKind(state.kind === "numbered" ? "body" : "numbered")} disabled={disabled} />
        <IconBtn icon={IndentDecrease} label="한 단 내어쓰기" hint="Shift+Tab" onClick={() => actions.indent(-1)} disabled={disabled} />
        <IconBtn icon={IndentIncrease} label="한 단 들여쓰기" hint="Tab" onClick={() => actions.indent(1)} disabled={disabled} />
      </Group>

      <Divider />

      <Group>
        <IconBtn icon={TableIcon} label="표 넣기" onClick={actions.insertTable} disabled={disabled} />
        <IconBtn icon={Minus} label="가로줄 넣기" onClick={actions.insertDivider} disabled={disabled} />
        <IconBtn icon={Scissors} label="쪽 나눔 넣기" onClick={actions.insertPageBreak} disabled={disabled} />
        <IconBtn
          icon={MessageSquarePlus}
          label="의견 달기"
          hint="Ctrl+Alt+M"
          onClick={actions.addComment}
          disabled={disabled}
        />
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

function Divider() {
  return <span className="ilm-tooldiv" aria-hidden />;
}

function IconBtn({
  icon: Icon,
  label,
  hint,
  pressed,
  onClick,
  disabled,
}: {
  icon: typeof Bold;
  label: string;
  hint?: string;
  pressed?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-ilm-tab=""
      // 커서를 뺏기면 무엇에 서식을 걸어야 할지 알 수 없게 된다.
      // 눌리기 **전에** 포커스가 옮겨 가는 것을 여기서 막는다.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={hint ? `${label} (${hint})` : label}
      title={hint ? `${label} · ${hint}` : label}
      className={cn("ilm-tbtn", pressed && "ilm-tbtn-on")}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

function Picker({
  icon: Icon,
  label,
  value,
  swatch,
  disabled,
  children,
}: {
  icon: typeof Bold;
  label: string;
  value: string;
  swatch: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  /**
   * 고르고 나면 닫는다. Esc 로도, 바깥을 눌러도 닫는다.
   *
   * `<details>` 는 스스로 닫히지 않는다. 그래서 색을 한 번 고르면 열린 판이
   * 종이 위에 그대로 남아 본문을 가렸다 — 다른 도구를 눌러도, Esc 를 눌러도
   * 안 닫혔다. 열고 닫는 일 자체는 브라우저에 맡기고(스크립트 없이도 열린다),
   * 닫아야 할 순간만 여기서 알려 준다.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = () => el.removeAttribute("open");
    const onDocDown = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        e.stopPropagation();
        close();
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", onDocDown);
    el.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      el.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details
      ref={ref}
      className="ilm-picker"
      onClick={(e) => {
        // 안쪽 항목을 고르면 닫는다. summary 를 누른 것은 브라우저가 처리한다.
        const t = e.target as HTMLElement;
        if (t.closest(".ilm-pickerbox")) ref.current?.removeAttribute("open");
      }}
    >
      <summary
        data-ilm-tab=""
        aria-label={`${label}, 지금 ${value}`}
        title={`${label} · 지금 ${value}`}
        className={cn("ilm-tbtn", disabled && "pointer-events-none opacity-50")}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="relative flex flex-col items-center">
          <Icon aria-hidden className="size-4" />
          <span className={cn("ilm-swbar", swatch)} aria-hidden />
        </span>
      </summary>
      <div className="ilm-pickerbox" role="group" aria-label={label}>
        {children}
      </div>
    </details>
  );
}

function SwatchBtn({
  label,
  className,
  selected,
  onClick,
}: {
  label: string;
  className: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className={cn(className, selected && "ilm-sw-on")}
    >
      {/* 색만으로 고르게 두지 않는다. 이름이 함께 있어야 한다. */}
      <span className="ilm-swname">{label}</span>
    </button>
  );
}
