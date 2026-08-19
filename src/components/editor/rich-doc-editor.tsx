"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  BLOCK_META,
  docPlainText,
  makeBlock,
  parseRichDoc,
  sliceSpans,
  spansText,
  type Align,
  type Block,
  type BlockKind,
  type DocComment,
  type Highlight,
  type RichDoc,
  type TextColor,
} from "@/lib/editor/model";
import { newSite } from "@/lib/editor/pos";
import type { FmtPatch } from "@/lib/editor/wire";
import { cn } from "@/lib/cn";
import { fromHtml, toHtml } from "@/lib/editor/html";
import {
  blockElOf,
  containerOf,
  cpLen,
  cpToDom,
  placeCaret,
  readSelection,
  readText,
  type BlockRange,
} from "./dom";
import { Engine, type Caret } from "./engine";
import { BlockView, type CaretFlag } from "./block-view";
import { TableView } from "./table-view";
import { Toolbar, type ToolbarState } from "./toolbar";
import { CommentRail, DocOutline, StatusBar, TopBar } from "./panels";
import { useCollab, type Peer } from "./use-collab";

/**
 * 서식 편집기.
 *
 * ── 이벤트를 뿌리 하나가 받는다 ─────────────────────────────────────────────
 *
 * 자판·조합·붙여넣기·복사를 블록마다 듣지 않고 여기서 위임으로 받는다.
 * 블록이 300개인 문서에 리스너를 1,200개 다는 것을 피하려는 것도 있지만,
 * 진짜 이유는 **여러 블록에 걸친 선택**이다. 두 문단에 걸쳐 글자를 지울 때
 * 어느 블록의 리스너가 그 일을 맡아야 하는지 정할 방법이 없다.
 *
 * ── 한글 조합을 다루는 규칙 ─────────────────────────────────────────────────
 *
 * 이 편집기가 깨질 수 있는 가장 큰 자리다. 규칙은 셋뿐이다.
 *
 *   1. `compositionstart` ~ `compositionend` 사이에는 **DOM 을 건드리지 않는다.**
 *      뿌리에 data-ilm-composing 을 세워 두면 블록들이 스스로 물러난다.
 *   2. 그 사이에는 모델도 고치지 않는다. 조합이 끝난 뒤 DOM 을 읽어 한 번에 맞춘다.
 *   3. 조합 중에 온 남의 변경은 **쌓아 두었다가** 조합이 끝나면 반영한다.
 *
 * ⚠ 이 규칙은 리눅스 컨테이너에서 검증할 수 없다. 여기에는 한글 IME 가 없고,
 * Playwright 의 타이핑은 조합 과정을 거치지 않는다. **실제 Windows 한/글 IME 로
 * 확인한 적이 없다** — pack.ts 가 「실제 한/글에서 열어 본 적이 없다」고 적은
 * 것과 같은 종류의 미검증이다. 반드시 사람이 한 번 쳐 봐야 한다.
 */

export type EditorPerson = { id: string; name: string; position: string | null };

export type SaveResult = {
  ok: boolean;
  /**
   * 서버가 아는 판. **성공했으면 새 판, 실패했으면 지금 서버에 있는 판**이다.
   * 실패 쪽이 이 계약의 핵심이다 — nextRev 주석 참조.
   */
  rev?: number;
  reason?: string;
};

/**
 * 다음 저장에 실을 판 번호.
 *
 * 성공·실패를 가리지 않고 서버가 준 값을 받는다. 실패했을 때 받지 않으면
 * 판 경쟁에 한 번 진 탭이 **영영 저장하지 못한다** — 조건이 다시는 맞지 않기
 * 때문이다. 두 사람이 아니어도 방아쇠가 당겨진다. 같은 사람이 편집기를 연 채
 * 다른 탭에서 무JS 문단 폼으로 한 번만 저장해도 판이 오른다.
 *
 * 서버가 판을 모르면(문서가 사라졌거나 볼 수 없게 된 경우) 들고 있던 값을
 * 그대로 둔다. 그 상황에서 판을 흔들어 봐야 저장되지 않는다.
 *
 * 이 함수는 tests/rich-save.test.mjs 가 **이 파일의 원본을 읽어** 그대로 돌린다.
 * 시험용으로 복사해 두면 두 벌이 되고, 두 벌은 반드시 어긋난다.
 */
export function nextRev(seen: number, result: SaveResult): number {
  return typeof result.rev === "number" &&
    Number.isSafeInteger(result.rev) &&
    result.rev >= 0
    ? result.rev
    : seen;
}

const AUTOSAVE_MS = 2500;
/**
 * 저장에 실패했을 때 다시 시도하기까지.
 *
 * 실패한 뒤 **아무도 다시 시도하지 않던 때가 있었다.** 화면에는 「잠시 뒤 다시
 * 시도합니다」라고 적혀 있었는데 그런 일은 일어나지 않았다 — 다음 저장은 다음
 * 편집이 있어야 걸리기 때문이다. 그래서 함께 편집하다 **마지막으로 친 사람이
 * 판 경쟁에 지면 그 글이 영영 DB 에 안 들어갔다.** 화면에는 그대로 보이니
 * 아무도 모르고, 새로고침하는 순간 사라진다.
 *
 * 물러서며 기다린다(1.2초 → 2.4초 → …, 최대 10초). 두 사람이 서로에게 계속
 * 지는 상황에서 두 탭이 초당 몇 번씩 서로를 밀어내지 않도록.
 */
const RETRY_MS = 1200;
const RETRY_MAX_MS = 10_000;
/** 자판이 이만큼 쉬면 되돌리기 한 걸음으로 묶는다. */
const CHECKPOINT_MS = 400;

export function RichDocEditor({
  documentId,
  workId,
  initialDoc,
  initialRev,
  viewer,
  people,
  canWrite,
  realtimeEnabled,
  onSave,
  onLeave,
  exportBase,
  demoNotice,
}: {
  documentId: string;
  workId: string;
  initialDoc: RichDoc;
  initialRev: number;
  viewer: EditorPerson;
  people: EditorPerson[];
  canWrite: boolean;
  realtimeEnabled: boolean;
  onSave:
    | ((payload: { rev: number; doc: RichDoc; final: boolean }) => Promise<SaveResult>)
    | null;
  /**
   * 편집을 마치고 화면을 떠날 때 한 번. 저장이 아니라 **업무 상세의 캐시를
   * 무르는 일**이다. 자동 저장이 이미 다 해 놓고 떠나는 경우가 가장 흔한데,
   * 그때는 저장이 일어나지 않아 아무것도 무르지 못한다.
   */
  onLeave?: (() => void) | null;
  /** 내보내기 주소의 앞부분. `${exportBase}/hwpx` 같은 식으로 붙인다. */
  exportBase: string;
  /** 데모 모드에서 「저장되지 않습니다」를 알린다. */
  demoNotice: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // 엔진은 한 번만 만든다. 서버가 화면을 다시 그려 initialDoc 이 새 객체가 되어도
  // (WorkLive 의 router.refresh 가 그렇게 만든다) 쓰던 글이 날아가면 안 된다.
  const engineRef = useRef<Engine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new Engine(initialDoc, newSite());
  }
  const engine = engineRef.current;

  const version = useSyncExternalStore(engine.subscribe, engine.getVersion, () => 0);
  const doc = engine.getDoc();
  const readOnly = !canWrite;

  // ── 화면 상태 ────────────────────────────────────────────────────────────
  const [sel, setSel] = useState<BlockRange | null>(null);
  const [zoom, setZoom] = useState(100);
  const [showGutter, setShowGutter] = useState(false);
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving" | "failed">(
    "clean",
  );
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);

  const revRef = useRef(initialRev);
  const dirtyRef = useRef(false);
  /** 이 편집기가 이 화면에서 한 번이라도 저장했는가. 떠날 때 캐시를 무를지 정한다. */
  const savedRef = useRef(false);
  const composingRef = useRef(false);
  const queuedRemote = useRef<(() => void)[]>([]);
  const pendingCaret = useRef<Caret | null>(null);
  const checkpointTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caretBefore = useRef<Caret | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 연달아 실패한 횟수. 성공하면 0 으로 돌아간다. */
  const retries = useRef(0);

  // ── 실시간 ───────────────────────────────────────────────────────────────
  //
  // ⚠ 이 둘을 반드시 useCallback 으로 굳힌다. 인라인 화살표 함수로 넘기면
  // 렌더마다 새 함수가 되고, use-collab 의 채널 효과가 그것을 의존성으로
  // 들고 있어서 **자판 한 번마다 채널을 끊었다 다시 맺는다.** 그러면 실시간이
  // 「가끔 안 되는」 것이 아니라 **타이핑하는 동안에는 아예 안 된다.**
  // (엔진이 판을 올릴 때마다 useSyncExternalStore 가 렌더를 일으키므로,
  //  글자 하나에 재접속 한 번이다)
  //
  // 둘 다 ref 만 만지므로 의존성이 비어 있어도 늘 최신 값을 본다.
  const isComposing = useCallback(() => composingRef.current, []);
  const queueWhileComposing = useCallback((fn: () => void) => {
    queuedRemote.current.push(fn);
  }, []);

  const collab = useCollab({
    documentId,
    engine,
    viewerId: viewer.id,
    viewerName: viewer.name,
    enabled: realtimeEnabled && !readOnly,
    isComposing,
    queueWhileComposing,
  });

  // ── 저장 ─────────────────────────────────────────────────────────────────
  /**
   * 실패했으니 조금 뒤 다시.
   *
   * `flushSave` 와 서로를 부르므로 ref 를 한 칸 두고 그것을 통해 부른다.
   * (그냥 서로 참조하면 useCallback 의 의존성이 순환한다)
   */
  const flushRef = useRef<((r: "auto" | "manual" | "leave") => Promise<void>) | null>(null);
  const retry = useCallback(() => {
    retries.current += 1;
    const delay = Math.min(RETRY_MS * 2 ** (retries.current - 1), RETRY_MAX_MS);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushRef.current?.("auto"), delay);
  }, []);

  const flushSave = useCallback(
    async (reason: "auto" | "manual" | "leave") => {
      if (!onSave || !dirtyRef.current) return;
      dirtyRef.current = false;
      setSaveState("saving");
      try {
        const result = await onSave({
          rev: revRef.current,
          doc: engine.toSaved(),
          final: reason !== "auto",
        });
        // 성공이든 실패든 **서버가 알려 준 판을 받는다.** 실패 갈래에서 이 값을
        // 버리면 판 경쟁에 한 번 진 탭은 영영 저장하지 못한다 — 내 판은 뒤처진
        // 채로 굳고, 조건(where blocks_rev = 내가 본 판)은 다시는 맞지 않는다.
        // 남이 저장할 때마다 실패가 아니라 **한 번 실패하면 그 뒤 전부 실패**다.
        //
        // 여기서 판만 맞춰 다시 쓰는 것이 옳은 이유는, 함께 편집하는 사람들끼리는
        // doc: 채널의 CRDT 가 이미 양쪽 글자를 합쳐 두었기 때문이다. 합쳐 놓고
        // 마지막 한 번에서 잃으면 합친 보람이 없다.
        // ⚠ 그 채널 밖에서 저장한 사람(무JS 문단 폼)의 글은 이 화면에 없으므로
        //   다음 저장에서 덮인다. 그래서 문구로 알린다 — feedback.ts 의
        //   rich.stale_retry 가 「새로고침해서 확인하라」까지 적는다. (0018 §2-2)
        revRef.current = nextRev(revRef.current, result);
        if (result.ok) {
          savedRef.current = true;
          retries.current = 0;
          setSaveState(dirtyRef.current ? "dirty" : "clean");
          setSaveNote(null);
        } else {
          dirtyRef.current = true;
          setSaveState("failed");
          setSaveNote(result.reason ?? "저장하지 못했습니다.");
          retry();
        }
      } catch {
        dirtyRef.current = true;
        setSaveState("failed");
        // 저장 실패를 조용히 넘기면, 여덟 시간 쓴 글이 새로고침 한 번에 사라진다.
        setSaveNote(
          reason === "leave"
            ? "연결이 끊겨 마지막 변경을 저장하지 못했습니다."
            : "저장하지 못했습니다. 잠시 뒤 다시 시도합니다.",
        );
        retry();
      }
    },
    [engine, onSave, retry],
  );

  // 위 retry 가 이것을 통해 flushSave 를 부른다.
  flushRef.current = flushSave;

  useEffect(() => {
    engine.onDirty = () => {
      dirtyRef.current = true;
      setSaveState((s) => (s === "saving" ? s : "dirty"));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushSave("auto"), AUTOSAVE_MS);
    };
    return () => {
      engine.onDirty = null;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      /**
       * 언마운트에서 **반드시 한 번 더 저장한다.**
       *
       * 아래 beforeunload·visibilitychange 는 창을 닫거나 탭을 감출 때만 온다.
       * 이 앱에서 편집기를 떠나는 가장 흔한 길은 그 둘 중 어느 것도 아니다 —
       * 빵부스러기의 「업무 상세」 링크와 브라우저 뒤로가기다. 같은 문서 안의
       * history 이동이라 두 이벤트는 발화하지 않는다. 그러면 타자를 친 뒤
       * 2.5초(AUTOSAVE_MS) 안에 떠난 사람은 마지막 문장을 통째로 잃는다.
       * 화면에 실패 문구도 뜨지 않는다 — 편집기가 이미 사라진 뒤이기 때문이다.
       *
       * 예약된 타이머를 취소하고 그 자리에서 대신 보낸다. fetch 는 화면 전환보다
       * 오래 살아남으므로(같은 문서 안의 이동이다) 이 저장은 끝까지 간다.
       */
      if (dirtyRef.current) {
        void flushSave("leave");
      } else if (savedRef.current) {
        // 고칠 것은 남아 있지 않은데(자동 저장이 이미 다 했다) 업무 상세의
        // 클라이언트 캐시는 아직 옛 본문을 들고 있다. 뒤로가기는 그 캐시를
        // 그대로 쓰므로, 여기서 무르지 않으면 방금 고친 문서가 옛 내용에
        // 옛 「저장됨」 시각을 달고 나타난다. 저장이 아니라 캐시만 무른다.
        onLeave?.();
      }
    };
  }, [engine, flushSave, onLeave]);

  // 화면을 떠날 때 마지막 한 번. visibilitychange 를 함께 쓰는 이유는
  // 모바일에서 beforeunload 가 아예 안 오기 때문이다.
  useEffect(() => {
    const leave = () => {
      if (dirtyRef.current) void flushSave("leave");
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushSave]);

  // ── 커서 옮기기 ──────────────────────────────────────────────────────────
  /**
   * 커서를 그 그릇의 그 자리로.
   *
   * ⚠ 예전에는 무조건 `pendingCaret` 에 넣어 두고 `useLayoutEffect` 에 맡겼다.
   * 그 효과는 **렌더가 일어나야만** 돈다. 그런데 커서만 옮기는 동작(개요
   * 누르기·표에서 Tab·문단 끝에서 위아래 화살표)은 모델을 바꾸지 않으므로
   * 렌더가 일어나지 않는다 — 그래서 **그 자리에서는 아무 일도 안 일어나고**,
   * 넣어 둔 커서가 나중에 아무 렌더에서나 튀어나와 사용자가 방금 놓은 자리를
   * 빼앗았다. 개요를 누르고 본문을 클릭한 뒤 글자를 치면 그 글자가 제목에
   * 들어갔다.
   *
   * 그래서 **이미 화면에 있는 그릇이면 그 자리에서 옮긴다.** 예약은 아직
   * 없는 그릇(방금 나눈 문단, 되살린 블록)일 때만 쓴다 — 그 경우는 이번
   * 렌더가 요소를 만들어 주므로 효과가 반드시 돈다.
   */
  const focusCaret = useCallback((c: Caret | null) => {
    if (!c) return;
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(
      `[data-ilm-block="${CSS.escape(c.container)}"]`,
    );
    if (root && el) {
      el.focus({ preventScroll: false });
      placeCaret(el, c.at, c.to);
      setSel(readSelection(root));
      return;
    }
    pendingCaret.current = c;
  }, []);

  useLayoutEffect(() => {
    const c = pendingCaret.current;
    if (!c || !rootRef.current) return;
    pendingCaret.current = null;
    const el = rootRef.current.querySelector<HTMLElement>(
      `[data-ilm-block="${CSS.escape(c.container)}"]`,
    );
    if (!el) return;
    el.focus({ preventScroll: true });
    placeCaret(el, c.at, c.to);
    setSel(readSelection(rootRef.current));
  });

  // ── 선택 영역 따라다니기 ─────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const onChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const root = rootRef.current;
        if (!root) return;
        const next = readSelection(root);
        // 사용자가 스스로 커서를 옮겼다. 남아 있는 예약은 이제 옛것이다 —
        // 그대로 두면 다음 렌더에서 튀어나와 방금 놓은 자리를 빼앗는다.
        pendingCaret.current = null;
        setSel(next);
        if (next) {
          collab.sendCaret(next);
          // 커서가 움직이면 「누르고 아직 안 친 굵게」는 버린다.
          const p = engine.getPending(next.from, next.fromAt);
          if (!p) engine.clearPending();
        }
      });
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (raf) cancelAnimationFrame(raf);
    };
    // collab 객체 전체가 아니라 sendCaret 하나에만 의존한다. 객체는 렌더마다
    // 새로 만들어지므로 통째로 걸면 리스너를 매 렌더 떼었다 다시 단다.
  }, [collab.sendCaret, engine]);

  // ── 되돌리기 검문소 ──────────────────────────────────────────────────────
  const markNow = useCallback(() => {
    if (checkpointTimer.current) {
      clearTimeout(checkpointTimer.current);
      checkpointTimer.current = null;
    }
    const root = rootRef.current;
    engine.checkpoint(caretBefore.current, root ? toCaret(readSelection(root)) : null);
    caretBefore.current = root ? toCaret(readSelection(root)) : null;
  }, [engine]);

  const markSoon = useCallback(() => {
    if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    checkpointTimer.current = setTimeout(markNow, CHECKPOINT_MS);
  }, [markNow]);

  // ── 편집 동작 ────────────────────────────────────────────────────────────
  const currentIds = useCallback((): string[] => {
    if (!sel) return [];
    const order = engine.blocks().map((b) => b.id);
    const own = (c: string) => engine.blockOf(c)?.id ?? c;
    const a = order.indexOf(own(sel.from));
    const b = order.indexOf(own(sel.to));
    if (a < 0 || b < 0) return [];
    return order.slice(Math.min(a, b), Math.max(a, b) + 1);
  }, [engine, sel]);

  const applyFmt = useCallback(
    (patch: FmtPatch) => {
      if (!sel || readOnly) return;
      markNow();
      if (sel.from === sel.to && sel.fromAt === sel.toAt) {
        // 커서만 있다 — 다음에 칠 글자에 붙인다.
        engine.setPending(sel.from, sel.fromAt, {
          ...(engine.getPending(sel.from, sel.fromAt) ?? {}),
          ...patch,
        });
        return;
      }
      engine.format(sel, patch);
      markNow();
    },
    [engine, markNow, readOnly, sel],
  );

  const toggleMark = useCallback(
    (key: "b" | "i" | "u" | "s" | "sup" | "sub") => {
      const on = engine.isActive(sel, key, true);
      const patch: FmtPatch = { [key]: !on };
      // 위·아래첨자는 서로를 끈다. 모델도 같은 규칙이지만(normalizeSpans),
      // 여기서 함께 보내야 화면이 한 번에 맞는다.
      if (key === "sup" && !on) patch.sub = false;
      if (key === "sub" && !on) patch.sup = false;
      applyFmt(patch);
    },
    [applyFmt, engine, sel],
  );

  const insertBlockHere = useCallback(
    (block: Block) => {
      if (readOnly) return;
      markNow();
      const anchor = sel ? engine.blockOf(sel.to)?.id ?? null : null;
      engine.insertBlockAfter(anchor, block);
      // 글자를 담는 블록이면 그리로 커서를 옮긴다. 표는 첫 칸으로.
      const target = block.table?.rows[0]?.cells[0]?.id ?? block.id;
      if (BLOCK_META[block.kind].text || block.table) {
        focusCaret({ container: target, at: 0 });
      }
      markNow();
    },
    [engine, focusCaret, markNow, readOnly, sel],
  );

  const undo = useCallback(() => {
    markNow();
    focusCaret(engine.undo());
  }, [engine, focusCaret, markNow]);

  const redo = useCallback(() => {
    focusCaret(engine.redo());
  }, [engine, focusCaret]);

  // ── 의견 ─────────────────────────────────────────────────────────────────
  const addComment = useCallback(() => {
    if (!sel || readOnly) return;
    const block = engine.blockOf(sel.from);
    if (!block) return;
    const made = engine.addComment({
      blockId: block.id,
      ...(sel.fromAt !== sel.toAt && sel.from === sel.to
        ? { from: sel.fromAt, to: sel.toAt }
        : {}),
      authorId: viewer.id,
      authorName: viewer.name,
      body: "",
      at: new Date().toISOString(),
    });
    setActiveComment(made.id);
    collab.sendComments(engine.getComments(), engine.removedComments());
  }, [collab, engine, readOnly, sel, viewer]);

  // ── 이벤트 위임 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    /** 지금 커서가 있는 편집칸. */
    const editable = (target: EventTarget | null): HTMLElement | null => {
      const el = blockElOf(target as Node | null);
      return el && root.contains(el) ? el : null;
    };

    const flushQueued = () => {
      const jobs = queuedRemote.current;
      queuedRemote.current = [];
      for (const fn of jobs) fn();
    };

    const syncFrom = (el: HTMLElement) => {
      engine.syncText(containerOf(el), readText(el));
    };

    // ── 조합 ───────────────────────────────────────────────────────────
    const onCompStart = () => {
      composingRef.current = true;
      root.dataset.ilmComposing = "1";
    };
    const onCompEnd = (e: CompositionEvent) => {
      composingRef.current = false;
      delete root.dataset.ilmComposing;
      const el = editable(e.target);
      // 브라우저에 따라 마지막 input 이 compositionend 뒤에 온다.
      // 한 프레임 뒤에 읽으면 어느 쪽이든 확정된 글자를 본다.
      requestAnimationFrame(() => {
        if (el) syncFrom(el);
        flushQueued();
        markSoon();
      });
    };

    // ── 입력 ───────────────────────────────────────────────────────────
    const onBeforeInput = (e: InputEvent) => {
      if (readOnly) {
        e.preventDefault();
        return;
      }
      // 조합 중에는 브라우저가 주인이다. 절대 가로채지 않는다.
      if (composingRef.current || e.inputType.startsWith("insertComposition")) return;

      const el = editable(e.target);
      if (!el) return;
      const container = containerOf(el);
      const range = readSelection(root);
      const multi = range !== null && range.from !== range.to;
      const collapsed = range !== null && range.from === range.to && range.fromAt === range.toAt;

      switch (e.inputType) {
        case "insertParagraph": {
          e.preventDefault();
          markNow();
          let at = range?.fromAt ?? 0;
          if (multi && range) {
            const c = engine.deleteRange(range);
            if (c) at = c.at;
          } else if (range && range.fromAt !== range.toAt) {
            engine.deleteText(container, range.fromAt, range.toAt);
            at = range.fromAt;
          }
          // 표 칸 안에서는 문단을 나누지 않는다 — 칸 하나가 문단 하나다.
          // 커서를 지운 자리에 놓아 준다(예전에는 아무 데도 안 놓았다).
          if (el.dataset.ilmCell) {
            focusCaret({ container, at });
            markNow();
            return;
          }
          focusCaret(engine.splitBlock(container, at));
          markNow();
          return;
        }
        case "insertLineBreak": {
          // Shift+Enter. 우리 모델에는 문단 안의 줄바꿈이 없다(내보내기가 잃는다).
          // 같은 갈래의 새 문단으로 만들되 번호는 잇지 않는다 — 이어지는 줄이다.
          e.preventDefault();
          markNow();
          const block = engine.blockOf(container);
          let at = range?.fromAt ?? 0;
          // 고른 글자를 먼저 지운다. insertParagraph 갈래에는 있는데 여기에만
          // 없어서, 글자를 골라 둔 채 Shift+Enter 를 치면 그대로 남았다.
          if (multi && range) {
            const c = engine.deleteRange(range);
            if (c) at = c.at;
          } else if (range && range.fromAt !== range.toAt) {
            engine.deleteText(container, range.fromAt, range.toAt);
            at = range.fromAt;
          }
          if (el.dataset.ilmCell) return;
          const next = engine.splitBlock(container, at);
          if (next && block && block.kind === "numbered") {
            engine.setKind([next.container], "body");
            engine.indent([next.container], block.indent ?? 0);
          }
          focusCaret(next);
          markNow();
          return;
        }
        case "deleteContentBackward":
        case "deleteWordBackward":
        case "deleteSoftLineBackward": {
          if (multi && range) {
            e.preventDefault();
            markNow();
            focusCaret(engine.deleteRange(range));
            markNow();
            return;
          }
          if (collapsed && range?.fromAt === 0 && !el.dataset.ilmCell) {
            e.preventDefault();
            markNow();
            focusCaret(engine.mergeBackward(container));
            markNow();
            return;
          }
          break; // 브라우저가 지우게 두고 input 에서 모델을 맞춘다
        }
        case "deleteContentForward":
        case "deleteWordForward": {
          if (multi && range) {
            e.preventDefault();
            markNow();
            focusCaret(engine.deleteRange(range));
            markNow();
            return;
          }
          if (collapsed && !el.dataset.ilmCell) {
            const len = cpLen(readText(el));
            if (range?.fromAt === len) {
              e.preventDefault();
              markNow();
              focusCaret(engine.mergeForward(container));
              markNow();
              return;
            }
          }
          break;
        }
        case "formatBold":
          e.preventDefault();
          toggleMark("b");
          return;
        case "formatItalic":
          e.preventDefault();
          toggleMark("i");
          return;
        case "formatUnderline":
          e.preventDefault();
          toggleMark("u");
          return;
        case "formatStrikeThrough":
          e.preventDefault();
          toggleMark("s");
          return;
        case "historyUndo":
          e.preventDefault();
          undo();
          return;
        case "historyRedo":
          e.preventDefault();
          redo();
          return;
        case "insertFromPaste":
        case "insertFromDrop":
          // paste 리스너가 맡는다. 여기서 막지 않으면 두 번 들어간다.
          e.preventDefault();
          return;
        default: {
          if (multi && range) {
            // 여러 블록에 걸친 선택 위에 글자를 치면 브라우저가 무엇을 할지
            // 정해져 있지 않다. 먼저 지우고 우리가 넣는다.
            e.preventDefault();
            markNow();
            const c = engine.deleteRange(range);
            if (c && e.data) {
              engine.insertText(c.container, c.at, e.data);
              focusCaret({ container: c.container, at: c.at + cpLen(e.data) });
            } else {
              focusCaret(c);
            }
            markNow();
            return;
          }
        }
      }
    };

    const onInput = (e: Event) => {
      if (composingRef.current) return;
      const el = editable(e.target);
      if (!el) return;
      syncFrom(el);
      applyInputRules(el, e as InputEvent);
      markSoon();
    };

    /**
     * 자판으로 갈래를 바꾸는 규칙.
     *
     * 「- 」·「1. 」·「# 」을 치면 그 자리에서 목록·제목이 된다. 도구모음까지
     * 손을 옮기지 않아도 되고, 공무원이 워드·한/글에서 이미 겪어 본 동작이다.
     */
    const applyInputRules = (el: HTMLElement, e: InputEvent) => {
      if (el.dataset.ilmCell) return;
      /**
       * 「방금 그 자리에서 부호를 완성했는가」만 본다.
       *
       * 예전에는 문단의 **첫 글자만** 보고 판정했다. 그래서 「1. 추진 배경」
       * 처럼 이미 「1. 」로 시작하는 문단은 **뒤쪽 아무 데나 고쳐도** 그때마다
       * 갈래가 바뀌고 앞 세 글자가 잘리고 커서가 맨 앞으로 튀었다. 시연 문서의
       * 큰 항목이 정확히 그 모양이라 손대는 족족 무너졌다.
       *
       * 조건 둘을 건다 — 방금 넣은 글자가 **빈칸**이고, 커서가 그 부호 바로
       * 뒤에 있어야 한다. 규칙이 도는 순간은 사람이 「- 」를 막 친 그때뿐이다.
       */
      if (e.inputType !== "insertText" || e.data !== " ") return;
      const container = containerOf(el);
      const block = engine.blockOf(container);
      if (!block || block.id !== container) return;
      const text = readText(el);

      const rules: Array<[RegExp, BlockKind, number]> = [
        [/^#\s/, "heading", 2],
        [/^##\s/, "subheading", 3],
        [/^[-*]\s/, "bullet", 2],
        [/^1[.)]\s/, "numbered", 3],
        [/^>\s/, "quote", 2],
      ];
      const caretAt = readSelection(root)?.fromAt ?? -1;
      for (const [re, kind, cut] of rules) {
        // 커서가 부호 바로 뒤에 있어야 한다. 문단 중간을 고치다 우연히
        // 같은 모양이 되는 것과 「지금 막 쳤다」를 가르는 유일한 조건이다.
        if (caretAt === cut && re.test(text) && block.kind !== kind) {
          markNow();
          engine.deleteText(container, 0, cut);
          engine.setKind([container], kind);
          focusCaret({ container, at: 0 });
          markNow();
          return;
        }
      }
      if (caretAt === cpLen(text) && /^(---|___)$/.test(text.trim()) && block.kind === "body") {
        markNow();
        engine.deleteText(container, 0, cpLen(text));
        engine.setKind([container], "divider");
        markNow();
      }
    };

    // ── 자판 ───────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if (composingRef.current || e.isComposing) return;
      const el = editable(e.target);
      const mod = e.ctrlKey || e.metaKey;
      const range = root ? readSelection(root) : null;

      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        dirtyRef.current = true;
        void flushSave("manual");
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (readOnly) return;

      if (mod && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        toggleMark("s");
        return;
      }
      if (mod && e.altKey && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const map: Record<string, BlockKind> = {
          "1": "title",
          "2": "heading",
          "3": "subheading",
          "4": "body",
        };
        engine.setKind(currentIds(), map[e.key]);
        markNow();
        return;
      }
      if (mod && e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        addComment();
        return;
      }
      // 블록 옮기기
      if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const id = el ? engine.blockOf(containerOf(el))?.id : null;
        if (!id) return;
        markNow();
        const moved = engine.moveBlock(id, e.key === "ArrowUp" ? -1 : 1);
        if (moved) focusCaret({ container: moved, at: 0 });
        markNow();
        return;
      }

      if (!el) return;
      const container = containerOf(el);

      if (e.key === "Tab") {
        e.preventDefault();
        // 표 안에서는 다음 칸으로. 문서에서는 한 단 들여쓴다.
        if (el.dataset.ilmCell) {
          const order = engine.containerOrder();
          const i = order.indexOf(container);
          const next = order[i + (e.shiftKey ? -1 : 1)];
          if (next) focusCaret({ container: next, at: 0 });
          return;
        }
        markNow();
        engine.indent(currentIds(), e.shiftKey ? -1 : 1);
        markNow();
        return;
      }

      if (e.key === "Escape") {
        setActiveComment(null);
        /**
         * 편집칸에서 빠져나가는 길.
         *
         * 이 편집기는 Tab 을 들여쓰기로 쓴다(한/글·워드와 같다). 그러면
         * 키보드만 쓰는 사람이 문단에 한 번 들어간 뒤 나올 방법이 없어지는데,
         * 그건 KWCAG 2.2 / WCAG 2.1.2「키보드 함정 없음」 위반이다. 공공기관
         * 웹 접근성은 법적 의무 영역이고 사용자에 장애인 공무원이 포함된다.
         *
         * 그래서 Esc 가 도구모음 첫 단추로 초점을 옮긴다. 거기서부터는
         * Tab·Shift+Tab 이 평범하게 화면 밖으로 나간다. 「빠져나가는 방법을
         * 알린다」는 조건도 함께 지켜야 하므로 상태줄에 그 한 줄을 적어 두었다.
         */
        const bar = rootRef.current
          ?.closest(".ilm-wrap")
          ?.querySelector<HTMLElement>('.ilm-toolbar [data-ilm-tstop="1"]');
        if (bar) {
          e.preventDefault();
          bar.focus();
        } else {
          (e.target as HTMLElement | null)?.blur();
        }
        return;
      }

      // 위아래 화살표로 문단 사이를 넘는다.
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && range) {
        const len = cpLen(readText(el));
        const atEdge =
          e.key === "ArrowUp" ? range.fromAt === 0 : range.toAt === len;
        if (!atEdge) return;
        // 한 줄짜리 문단에서만 곧바로 넘긴다. 여러 줄로 접힌 문단에서는
        // 브라우저가 줄 사이를 움직이게 두어야 한다.
        const rects = el.getClientRects();
        if (rects.length > 1) return;
        const order = engine.containerOrder();
        const i = order.indexOf(container);
        const next = order[i + (e.key === "ArrowUp" ? -1 : 1)];
        if (!next) return;
        e.preventDefault();
        const at = e.key === "ArrowUp" ? cpLen(engine.textOf(next)) : 0;
        focusCaret({ container: next, at });
        return;
      }

      // Ctrl+A — 한 번은 이 문단, 두 번째는 문서 전체.
      if (mod && e.key.toLowerCase() === "a") {
        const len = cpLen(readText(el));
        const whole = range && range.from === range.to && range.fromAt === 0 && range.toAt === len;
        if (!whole) return; // 브라우저가 이 문단을 고르게 둔다
        e.preventDefault();
        selectWholeDocument(root);
        return;
      }
    };

    // ── 붙여넣기 ───────────────────────────────────────────────────────
    const onPaste = (e: ClipboardEvent) => {
      if (readOnly) return;
      e.preventDefault();
      const el = editable(e.target);
      if (!el) return;
      const range = readSelection(root);
      if (!range) return;

      markNow();
      let at = range.fromAt;
      let container = range.from;
      if (range.from !== range.to || range.fromAt !== range.toAt) {
        const c = engine.deleteRange(range);
        if (c) {
          container = c.container;
          at = c.at;
        }
      }

      const html = e.clipboardData?.getData("text/html") ?? "";
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const blocks = html ? blocksFromHtml(html) : null;

      if (blocks && blocks.length > 1 && !el.dataset.ilmCell) {
        pasteBlocks(engine, container, at, blocks, focusCaret);
      } else if (blocks && blocks.length === 1) {
        const flat = spansText(blocks[0].spans);
        engine.insertText(container, at, flat);
        focusCaret({ container, at: at + cpLen(flat) });
      } else {
        // 여러 줄짜리 평문도 문단으로 나눈다. 한 문단에 밀어 넣으면
        // 한/글에서 복사한 문서가 한 덩어리가 된다.
        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        if (lines.length > 1 && !el.dataset.ilmCell) {
          pasteBlocks(
            engine,
            container,
            at,
            lines.map((l) => makeBlock("body", l)),
            focusCaret,
          );
        } else {
          const one = lines.join(" ");
          engine.insertText(container, at, one);
          focusCaret({ container, at: at + cpLen(one) });
        }
      }
      markNow();
    };

    // ── 복사·잘라내기 ──────────────────────────────────────────────────
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      const range = readSelection(root);
      if (!range || !e.clipboardData) return;
      // 고른 글자가 없으면 아무것도 하지 않는다. 예전에는 커서만 있어도
      // 그 문단을 통째로 클립보드에 넣어서, 밖에서 복사해 온 내용이
      // Ctrl+C 한 번에 날아갔다.
      if (range.from === range.to && range.fromAt === range.toAt) return;
      const picked = collectRange(engine, range);
      if (!picked.blocks.length) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", picked.text);
      e.clipboardData.setData("text/html", picked.html);
      if (cut && !readOnly) {
        markNow();
        focusCaret(engine.deleteRange(range));
        markNow();
      }
    };

    root.addEventListener("beforeinput", onBeforeInput as EventListener);
    root.addEventListener("input", onInput);
    root.addEventListener("compositionstart", onCompStart);
    root.addEventListener("compositionend", onCompEnd as EventListener);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("paste", onPaste as EventListener);
    const copyH = (e: Event) => onCopy(e as ClipboardEvent, false);
    const cutH = (e: Event) => onCopy(e as ClipboardEvent, true);
    root.addEventListener("copy", copyH);
    root.addEventListener("cut", cutH);

    return () => {
      root.removeEventListener("beforeinput", onBeforeInput as EventListener);
      root.removeEventListener("input", onInput);
      root.removeEventListener("compositionstart", onCompStart);
      root.removeEventListener("compositionend", onCompEnd as EventListener);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("paste", onPaste as EventListener);
      root.removeEventListener("copy", copyH);
      root.removeEventListener("cut", cutH);
    };
  }, [
    addComment,
    currentIds,
    engine,
    flushSave,
    focusCaret,
    markNow,
    markSoon,
    readOnly,
    redo,
    toggleMark,
    undo,
  ]);

  // ── 남의 커서 자리 재기 ──────────────────────────────────────────────────
  // 글자 번호를 화면 좌표로 옮기는 일은 배치를 강제로 계산하게 만든다.
  // 렌더 중에 하면 자판 한 번마다 화면 전체가 멎으므로, 그린 **뒤에** 한다.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const node of root.querySelectorAll<HTMLElement>(".ilm-remote")) {
      const box = node.parentElement?.querySelector<HTMLElement>("[data-ilm-block]");
      if (!box) continue;
      const at = Number(node.dataset.at ?? 0);
      const rect = caretRect(box, at);
      if (!rect) {
        node.style.display = "none";
        continue;
      }
      node.style.display = "";
      node.style.setProperty("--x", `${rect.x}px`);
      node.style.setProperty("--y", `${rect.y}px`);
      node.style.setProperty("--h", `${rect.h}px`);
    }
  }, [version, collab.peers, zoom]);

  // ── 도구모음 상태 ────────────────────────────────────────────────────────
  const activeContainer = sel?.from ?? null;
  const activeBlock = activeContainer ? engine.blockOf(activeContainer) : null;

  const toolbarState: ToolbarState = useMemo(
    () => ({
      kind: activeBlock?.kind ?? null,
      align: (activeBlock?.align ?? "left") as Align,
      b: engine.isActive(sel, "b", true),
      i: engine.isActive(sel, "i", true),
      u: engine.isActive(sel, "u", true),
      s: engine.isActive(sel, "s", true),
      sup: engine.isActive(sel, "sup", true),
      sub: engine.isActive(sel, "sub", true),
      color: currentValue(engine, sel, "c", "default") as TextColor,
      highlight: currentValue(engine, sel, "h", "none") as Highlight,
      canUndo: engine.canUndo(),
      canRedo: engine.canRedo(),
      hasSelection: sel !== null && !(sel.from === sel.to && sel.fromAt === sel.toAt),
    }),
    // version 이 바뀌면 다시 센다. engine 은 그대로인 객체라 의존성으로는 부족하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, sel, version, activeBlock],
  );

  const ordinals = engine.ordinals();
  const commentsByBlock = useMemo(() => {
    const map = new Map<string, DocComment[]>();
    for (const c of doc.comments ?? []) {
      const list = map.get(c.blockId);
      if (list) list.push(c);
      else map.set(c.blockId, [c]);
    }
    return map;
  }, [doc.comments]);

  const caretsByContainer = useMemo(() => {
    const map = new Map<string, CaretFlag[]>();
    collab.peers.forEach((p) => {
      if (!p.container) return;
      const list = map.get(p.container) ?? [];
      list.push({ name: p.name, tone: p.tone, at: p.at, to: p.to });
      map.set(p.container, list);
    });
    return map;
  }, [collab.peers]);

  const empty: never[] = useMemo(() => [], []);

  return (
    <div className="ilm-wrap">
      <TopBar
        title={docTitleOf(doc)}
        workId={workId}
        exportBase={exportBase}
        peers={collab.peers}
        link={collab.link}
        viewerName={viewer.name}
        readOnly={readOnly}
        demoNotice={demoNotice}
        onCopyAll={() => copyWholeDocument(engine)}
      />

      {canWrite ? (
        <Toolbar
          state={toolbarState}
          disabled={readOnly}
          actions={{
            setKind: (k) => {
              markNow();
              engine.setKind(currentIds(), k);
              markNow();
            },
            setAlign: (a) => {
              markNow();
              engine.setAlign(currentIds(), a);
              markNow();
            },
            toggle: toggleMark,
            setColor: (c) => applyFmt({ c }),
            setHighlight: (h) => applyFmt({ h }),
            indent: (d) => {
              markNow();
              engine.indent(currentIds(), d);
              markNow();
            },
            clearFormat: () =>
              applyFmt({
                b: false,
                i: false,
                u: false,
                s: false,
                sup: false,
                sub: false,
                c: "default",
                h: "none",
              }),
            insertTable: () => insertBlockHere(engine.makeTableBlock(3, 3)),
            insertDivider: () => insertBlockHere(makeBlock("divider")),
            insertPageBreak: () => insertBlockHere(makeBlock("pagebreak")),
            addComment,
            undo,
            redo,
            print: () => window.print(),
          }}
        />
      ) : null}

      <div className="ilm-body">
        <DocOutline
          doc={doc}
          activeId={activeBlock?.id ?? null}
          onGo={(id) => focusCaret({ container: id, at: 0 })}
        />

        <div className="ilm-scroll">
          <div
            ref={pageRef}
            className="ilm-page"
            style={{ zoom: `${zoom}%` }}
          >
            <div
              ref={rootRef}
              data-ilm-root=""
              className={cn("ilm-sheet", readOnly && "ilm-sheet-ro")}
            >
              {doc.blocks.map((b, i) =>
                b.kind === "table" ? (
                  <TableView
                    key={b.id}
                    block={b}
                    engine={engine}
                    readOnly={readOnly}
                    // 「이 표의 칸인가」를 물어야 한다. 예전에는 「이 표 블록
                    // 자체가 아닌가」만 물었는데 표 블록 id 는 애초에 그릇
                    // 이름이 될 수 없어 늘 참이었다 — 커서가 아무 문단에 있어도
                    // 문서의 **모든 표**가 「지금 여기」로 칠해졌다.
                    activeCell={
                      activeContainer && engine.cellAddress(activeContainer)?.blockId === b.id
                        ? activeContainer
                        : null
                    }
                    showGutter={showGutter}
                  />
                ) : (
                  <BlockView
                    key={b.id}
                    block={b}
                    ordinal={ordinals[i]}
                    comments={commentsByBlock.get(b.id) ?? empty}
                    carets={caretsByContainer.get(b.id) ?? empty}
                    readOnly={readOnly}
                    active={activeBlock?.id === b.id}
                    showGutter={showGutter}
                  />
                ),
              )}
            </div>
          </div>
        </div>

        <CommentRail
          comments={doc.comments ?? []}
          blocks={doc.blocks}
          activeId={activeComment}
          viewer={viewer}
          readOnly={readOnly}
          onFocusBlock={(id) => focusCaret({ container: id, at: 0 })}
          onSelect={setActiveComment}
          onWrite={(id, body) => {
            const list = engine.getComments();
            const found = list.find((c) => c.id === id);
            if (found && !found.body) {
              engine.removeComment(id);
              engine.addComment({ ...found, body });
            } else if (found) {
              engine.replyComment(id, {
                authorId: viewer.id,
                authorName: viewer.name,
                body,
                at: new Date().toISOString(),
              });
            }
            collab.sendComments(engine.getComments(), engine.removedComments());
          }}
          onResolve={(id, done) => {
            engine.resolveComment(id, done);
            collab.sendComments(engine.getComments(), engine.removedComments());
          }}
          onDelete={(id) => {
            engine.removeComment(id);
            setActiveComment(null);
            collab.sendComments(engine.getComments(), engine.removedComments());
          }}
        />
      </div>

      <StatusBar
        doc={doc}
        zoom={zoom}
        onZoom={setZoom}
        showGutter={showGutter}
        onToggleGutter={() => setShowGutter((v) => !v)}
        saveState={saveState}
        saveNote={saveNote}
        peers={collab.peers}
        onSaveNow={() => {
          dirtyRef.current = true;
          void flushSave("manual");
        }}
        readOnly={readOnly}
        saving={onSave !== null}
      />
    </div>
  );
}

// ===========================================================================
// 돕는 것들
// ===========================================================================

function toCaret(range: BlockRange | null): Caret | null {
  return range ? { container: range.from, at: range.fromAt, to: range.toAt } : null;
}

function docTitleOf(doc: RichDoc): string {
  const t = doc.blocks.find((b) => b.kind === "title");
  const text = t ? spansText(t.spans).trim() : "";
  return text || "제목 없는 문서";
}

function currentValue(
  engine: Engine,
  sel: BlockRange | null,
  key: "c" | "h",
  fallback: string,
): string {
  if (!sel) return fallback;
  const options = key === "c"
    ? ["default", "primary", "accent", "danger", "gray"]
    : ["none", "yellow", "green", "blue", "pink"];
  for (const v of options) {
    if (v !== fallback && engine.isActive(sel, key, v)) return v;
  }
  return fallback;
}

/** 커서가 놓일 자리의 화면 좌표. 편집칸을 기준으로 잰다. */
function caretRect(
  el: HTMLElement,
  at: number,
): { x: number; y: number; h: number } | null {
  try {
    const doc = el.ownerDocument;
    const range = doc.createRange();
    const p = cpToDom(el, at);
    range.setStart(p.node, p.offset);
    range.collapse(true);
    const r = range.getBoundingClientRect();
    const base = el.getBoundingClientRect();
    if (r.height === 0 && r.width === 0 && r.x === 0) {
      return { x: 0, y: 0, h: base.height || 20 };
    }
    return { x: r.x - base.x, y: r.y - base.y, h: r.height || base.height || 20 };
  } catch {
    return null;
  }
}

function selectWholeDocument(root: HTMLElement): void {
  const blocks = root.querySelectorAll<HTMLElement>("[data-ilm-block]");
  if (blocks.length === 0) return;
  const sel = root.ownerDocument.getSelection();
  if (!sel) return;
  const range = root.ownerDocument.createRange();
  range.setStart(blocks[0], 0);
  const last = blocks[blocks.length - 1];
  range.setEnd(last, last.childNodes.length);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * 붙여넣은 HTML 을 블록으로.
 *
 * 브라우저의 DOMParser 는 스크립트를 **실행하지 않는다.** 그리고 우리는 이
 * HTML 을 화면에 다시 넣지 않고 모델로 옮길 뿐이라, 아는 태그만 건지는 것으로
 * 충분하다. 그래도 파서가 무엇을 받는지는 html.ts 가 정한다.
 */
function blocksFromHtml(html: string): Block[] | null {
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const doc = fromHtml(parsed.body);
    const clean = parseRichDoc(doc);
    return clean ? clean.blocks : null;
  } catch {
    return null;
  }
}

/**
 * 붙여넣은 블록들을 넣는다.
 *
 * `engine.batch` 로 묶는 것이 핵심이다. 묶지 않으면 줄마다 문서 전체
 * 스냅숏이 다시 만들어져 200줄짜리 붙여넣기가 탭을 십수 초 멈춘다
 * (engine.ts 의 batch 주석). 묶는 동안 캐시가 옛 판이므로 **되찾아 읽지
 * 않도록** 닻이 될 블록 id 를 미리 손에 들고 시작한다.
 */
function pasteBlocks(
  engine: Engine,
  container: string,
  at: number,
  blocks: Block[],
  focusCaret: (c: Caret | null) => void,
): void {
  const [first, ...rest] = blocks;
  const firstText = spansText(first.spans);
  const startAnchor = engine.blockOf(container)?.id ?? container;

  let lastId = container;
  let lastAt = at + cpLen(firstText);

  engine.batch(() => {
    if (firstText) engine.insertText(container, at, firstText);
    let anchor = startAnchor;
    for (const b of rest) {
      engine.insertBlockAfter(anchor, b);
      anchor = b.id;
      lastId = b.id;
      lastAt = cpLen(spansText(b.spans));
    }
  });
  focusCaret({ container: lastId, at: lastAt });
}

/** 선택한 곳을 클립보드용 두 가지 모양으로. */
function collectRange(
  engine: Engine,
  range: BlockRange,
): { text: string; html: string; blocks: Block[] } {
  const order = engine.blocks();
  const own = (c: string) => engine.blockOf(c)?.id ?? c;
  const a = order.findIndex((b) => b.id === own(range.from));
  const b = order.findIndex((x) => x.id === own(range.to));
  if (a < 0 || b < 0) return { text: "", html: "", blocks: [] };

  const picked: Block[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) {
    picked.push(structuredClone(order[i]));
  }
  // 한 블록 안의 선택이면 그 범위만 자른다.
  if (picked.length === 1 && range.from === range.to) {
    picked[0] = { ...picked[0], spans: sliceSpans(picked[0].spans, range.fromAt, range.toAt) };
  }
  const doc: RichDoc = { v: 1, blocks: picked };
  return { text: docPlainText(doc), html: toHtml(doc, { forClipboard: true }), blocks: picked };
}

/** 문서 전체를 한/글·워드에 붙일 수 있는 모양으로 클립보드에 담는다. */
async function copyWholeDocument(engine: Engine): Promise<boolean> {
  const doc = engine.toSaved();
  const html = toHtml(doc, { forClipboard: true });
  const text = docPlainText(doc);
  try {
    // 두 가지를 함께 담는다. 한/글·워드는 text/html 을 읽어 표와 굵기를 살리고,
    // 메모장·메신저는 text/plain 을 읽는다.
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

export type { Peer };
