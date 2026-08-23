"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileDown,
  ListTree,
  MessageSquare,
  Printer,
  Save,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  docOutline,
  docStats,
  spansText,
  type Block,
  type DocComment,
  type RichDoc,
} from "@/lib/editor/model";
import { CURSOR_TONES, type Peer } from "./use-collab";

/**
 * 편집기 둘레의 판들 — 개요·머리띠·의견·상태줄.
 *
 * 본문(rich-doc-editor.tsx)에서 떼어 낸 이유는 하나다. 본문은 이벤트 위임과
 * 조합 처리로 이미 길고, 그 파일을 열 때마다 「개요 사이드바를 어떻게 그렸나」를
 * 지나쳐 가야 한다면 정작 조심해야 할 곳이 눈에 안 들어온다.
 */

// ===========================================================================
// 머리띠
// ===========================================================================

export function TopBar({
  title,
  workId,
  exportBase,
  peers,
  link,
  viewerName,
  readOnly,
  demoNotice,
  onCopyAll,
}: {
  title: string;
  workId: string;
  exportBase: string;
  peers: Peer[];
  link: "off" | "connecting" | "live" | "lost";
  viewerName: string;
  readOnly: boolean;
  demoNotice: boolean;
  onCopyAll: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState<null | boolean>(null);

  useEffect(() => {
    if (copied === null) return;
    const t = setTimeout(() => setCopied(null), 2600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="ilm-top">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-h3 font-bold text-gray-90">{title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-gray-60">
          {readOnly ? (
            <span className="font-bold text-gray-70">읽기 전용</span>
          ) : (
            <span>{viewerName}님으로 편집 중</span>
          )}
          {demoNotice ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-bold text-status-review-text">
                데모 — 고친 내용이 저장되지 않습니다
              </span>
            </>
          ) : null}
        </p>
      </div>

      {/* 같이 보고 있는 사람. 접속자 표시는 각자의 브라우저가 알리는 자기 신고값이라
          어떤 기록에도 쓰지 않는다(work-live.tsx 의 people 주석과 같은 판단). */}
      {link !== "off" ? (
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-body-xs font-bold",
              link === "live" ? "text-status-done-text" : "text-gray-60",
            )}
          >
            {link === "lost" ? (
              <WifiOff aria-hidden className="size-3.5" />
            ) : (
              <Wifi aria-hidden className="size-3.5" />
            )}
            {/* 「함께」는 정말 함께일 때만 적는다. 예전에는 link 가 live 이기만
                하면 혼자 있어도 「함께 편집 중」이라고 적었다 — 화면이 없는
                사람을 있다고 말하는 것이고, 그 표시를 믿고 「누가 보고 있으니
                조심해서 고치자」고 판단하게 만든다. 업무 화면의 실시간 표시가
                「지금은 나만 보고 있습니다」라고 적는 것과 같은 규칙이다. */}
            {link === "lost"
              ? "연결 끊김"
              : link === "connecting"
                ? "연결 중"
                : peers.length > 0
                  ? `함께 편집 중 ${peers.length + 1}명`
                  : "실시간 연결됨"}
          </span>
          {peers.length > 0 ? (
            <span className="inline-flex items-center" aria-hidden>
              {peers.slice(0, 4).map((p) => (
                <span
                  key={p.from}
                  className="ilm-peer -ml-2 first:ml-0"
                  data-tone={p.tone % CURSOR_TONES}
                  title={p.name}
                >
                  {p.name.slice(-2)}
                </span>
              ))}
            </span>
          ) : null}
          {/* 라이브 리전이어야 한다. 그냥 sr-only 로 두면 남이 들어오고 나가도
              화면을 못 보는 사람에게는 아무 말도 하지 않는다 — 같이 쓰는
              문서에서 「지금 누가 있는가」는 늦게 알아도 되는 정보가 아니다. */}
          <span role="status" aria-live="polite" className="sr-only">
            {peers.length > 0
              ? `${peers.map((p) => p.name).join(", ")}님이 함께 편집하고 있습니다.`
              : "지금은 나만 편집하고 있습니다."}
          </span>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a href={`${exportBase}/hwpx`} className="ilm-xbtn" data-variant="button">
          <FileDown aria-hidden className="size-4" />
          한/글 (.hwpx)
        </a>
        <a href={`${exportBase}/docx`} className="ilm-xbtn" data-variant="button">
          <FileDown aria-hidden className="size-4" />
          워드 (.docx)
        </a>
        <button type="button" className="ilm-xbtn" onClick={() => window.print()}>
          <Printer aria-hidden className="size-4" />
          PDF·인쇄
        </button>
        <button
          type="button"
          className="ilm-xbtn"
          onClick={async () => setCopied(await onCopyAll())}
        >
          {copied === true ? (
            <ClipboardCheck aria-hidden className="size-4 text-status-done" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copied === true ? "복사했습니다" : copied === false ? "복사 실패" : "통째로 복사"}
        </button>
        <a href={`/works/${workId}?tab=doc`} className="ilm-xbtn" data-variant="button">
          업무로 돌아가기
        </a>
      </div>

      {/* 복사 결과는 눈으로도 보이지만 읽어 주기도 해야 한다. */}
      <p role="status" aria-live="polite" className="sr-only">
        {copied === true
          ? "문서를 클립보드에 복사했습니다. 한/글이나 워드에 붙여 넣으면 표와 서식이 그대로 들어갑니다."
          : copied === false
            ? "복사하지 못했습니다. 브라우저가 클립보드 접근을 막았을 수 있습니다."
            : ""}
      </p>
    </div>
  );
}

// ===========================================================================
// 개요
// ===========================================================================

export function DocOutline({
  doc,
  activeId,
  onGo,
}: {
  doc: RichDoc;
  activeId: string | null;
  onGo: (id: string) => void;
}) {
  const items = docOutline(doc);

  return (
    <nav className="ilm-outline" aria-label="문서 개요">
      <p className="ilm-panel-head">
        <ListTree aria-hidden className="size-4 text-gray-40" />
        개요
      </p>
      {items.length === 0 ? (
        // 「제목이 없습니다」로 끝내지 않는다. 무엇을 하면 개요가 생기는지 적는다.
        <p className="px-3 py-2 text-body-xs leading-relaxed break-keep text-gray-60">
          문단 갈래를 <b className="font-bold">큰 항목</b>으로 바꾸면 여기에 차례가
          생깁니다.
        </p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onGo(it.id)}
                className={cn(
                  "ilm-outline-item",
                  it.kind === "subheading" && "pl-6",
                  it.kind === "title" && "font-bold",
                  activeId === it.id && "ilm-outline-on",
                )}
              >
                {/* block 이 없으면 truncate 가 듣지 않는다. 인라인 요소에는
                    overflow 가 적용되지 않아 긴 제목이 종이 위로 넘어간다. */}
                <span className="block truncate">{it.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

// ===========================================================================
// 의견
// ===========================================================================

export function CommentRail({
  comments,
  blocks,
  activeId,
  viewer,
  readOnly,
  onFocusBlock,
  onSelect,
  onWrite,
  onResolve,
  onDelete,
}: {
  comments: DocComment[];
  blocks: Block[];
  activeId: string | null;
  viewer: { id: string; name: string };
  readOnly: boolean;
  onFocusBlock: (blockId: string) => void;
  onSelect: (id: string | null) => void;
  onWrite: (id: string, body: string) => void;
  onResolve: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const open = comments.filter((c) => !c.done);
  const done = comments.filter((c) => c.done);
  const shown = showDone ? [...open, ...done] : open;

  return (
    <aside className="ilm-rail" aria-label="문단 의견">
      <p className="ilm-panel-head">
        <MessageSquare aria-hidden className="size-4 text-gray-40" />
        의견 {open.length}
        {done.length > 0 ? (
          <button
            type="button"
            className="ml-auto text-body-xs font-normal text-gray-60 underline"
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? "해결된 것 감추기" : `해결된 것 ${done.length}개 보기`}
          </button>
        ) : null}
      </p>

      {shown.length === 0 ? (
        <p className="px-3 py-2 text-body-xs leading-relaxed break-keep text-gray-60">
          문단을 고르고 <b className="font-bold">의견 달기</b>를 누르면 그 문단 옆에
          한 줄을 남길 수 있습니다. 본문은 그대로 두고 「왜 이렇게 정했는지」만
          남기는 자리입니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 px-2 pb-3">
          {shown.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              excerpt={excerptOf(blocks, c)}
              active={activeId === c.id}
              viewer={viewer}
              readOnly={readOnly}
              onOpen={() => {
                onSelect(c.id);
                onFocusBlock(c.blockId);
              }}
              onWrite={(body) => onWrite(c.id, body)}
              onResolve={(v) => onResolve(c.id, v)}
              onDelete={() => onDelete(c.id)}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

function excerptOf(blocks: Block[], c: DocComment): string {
  const b = blocks.find((x) => x.id === c.blockId);
  if (!b) return "";
  const text = spansText(b.spans);
  if (c.from !== undefined && c.to !== undefined) {
    return [...text].slice(c.from, c.to).join("").slice(0, 60);
  }
  return text.slice(0, 60);
}

function CommentCard({
  comment,
  excerpt,
  active,
  viewer,
  readOnly,
  onOpen,
  onWrite,
  onResolve,
  onDelete,
}: {
  comment: DocComment;
  excerpt: string;
  active: boolean;
  viewer: { id: string; name: string };
  readOnly: boolean;
  onOpen: () => void;
  onWrite: (body: string) => void;
  onResolve: (done: boolean) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fresh = !comment.body;

  useEffect(() => {
    if (fresh && active) boxRef.current?.focus();
  }, [active, fresh]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    onWrite(body);
    setDraft("");
  };

  return (
    <li
      className={cn("ilm-cmcard", active && "ilm-cmcard-on", comment.done && "opacity-60")}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label="이 의견이 달린 문단으로 이동"
      >
        {excerpt ? (
          <p className="mb-2 truncate border-l-2 border-accent pl-2 text-body-xs text-gray-60">
            {excerpt}
          </p>
        ) : null}
      </button>

      {comment.body ? (
        <>
          <p className="text-body-xs font-bold text-gray-80">
            {comment.authorName}
            {comment.at ? (
              <time dateTime={comment.at} className="ml-2 font-normal text-gray-60">
                {formatDateTime(comment.at)}
              </time>
            ) : null}
          </p>
          <p className="mt-1 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
            {comment.body}
          </p>
        </>
      ) : null}

      {comment.replies?.map((r) => (
        <div key={r.id} className="mt-2 border-t border-rule-hair pt-2">
          <p className="text-body-xs font-bold text-gray-80">
            {r.authorName}
            {r.at ? (
              <time dateTime={r.at} className="ml-2 font-normal text-gray-60">
                {formatDateTime(r.at)}
              </time>
            ) : null}
          </p>
          <p className="mt-1 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
            {r.body}
          </p>
        </div>
      ))}

      {!readOnly ? (
        <div className="mt-2">
          <label className="sr-only" htmlFor={`cm-${comment.id}`}>
            {fresh ? "의견" : "답글"}
          </label>
          <textarea
            id={`cm-${comment.id}`}
            ref={boxRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 줄바꿈이 필요한 글이라 Enter 로 보내지 않는다. Ctrl+Enter 가 보낸다.
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder={fresh ? "왜 이렇게 정했는지 적어 주세요" : "답글"}
            className="w-full resize-none rounded-sm border border-gray-50 bg-surface px-2 py-2 text-body-sm text-gray-90 placeholder:text-gray-60"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              className="ilm-cmbtn ilm-cmbtn-go"
            >
              {fresh ? "남기기" : "답글"}
            </button>
            {!fresh ? (
              <button
                type="button"
                onClick={() => onResolve(!comment.done)}
                className="ilm-cmbtn"
              >
                <Check aria-hidden className="size-3.5" />
                {comment.done ? "다시 열기" : "해결"}
              </button>
            ) : null}
            {comment.authorId === viewer.id || fresh ? (
              <button type="button" onClick={onDelete} className="ilm-cmbtn">
                <Trash2 aria-hidden className="size-3.5" />
                삭제
              </button>
            ) : null}
            <span className="ml-auto text-body-xs text-gray-50">Ctrl+Enter</span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ===========================================================================
// 상태줄
// ===========================================================================

/** A4 한 쪽에서 글이 놓이는 높이(96dpi 기준). 297mm − 위아래 여백 35mm. */
export const PAGE_CONTENT_PX = Math.round(((297 - 35) / 25.4) * 96);

export function StatusBar({
  doc,
  zoom,
  onZoom,
  showGutter,
  onToggleGutter,
  saveState,
  saveNote,
  peers,
  onSaveNow,
  readOnly,
  saving,
  pages,
}: {
  doc: RichDoc;
  zoom: number;
  onZoom: (z: number) => void;
  showGutter: boolean;
  onToggleGutter: () => void;
  saveState: "clean" | "dirty" | "saving" | "failed";
  saveNote: string | null;
  peers: Peer[];
  onSaveNow: () => void;
  readOnly: boolean;
  /**
   * 저장할 곳이 있는가.
   *
   * 데모 모드에서는 없다. 그때 「모든 변경사항이 저장됨」이라고 적으면
   * 화면이 거짓말을 하는 것이고, 이 저장소에서 그건 기능이 빠진 것보다 나쁘다.
   */
  saving: boolean;
  pages?: number;
}) {
  // 자판 한 번마다 문서 전체를 정규식으로 훑지 않는다. 문서가 그대로면 그대로다.
  const stats = useMemo(() => docStats(doc), [doc]);

  const saveLabel = !saving
    ? "저장되지 않습니다 (데모)"
    : saveState === "saving"
      ? "저장 중…"
      : saveState === "failed"
        ? (saveNote ?? "저장하지 못했습니다")
        : saveState === "dirty"
          ? "저장하지 않은 변경이 있습니다"
          : "모든 변경사항이 저장됨";

  return (
    <div className="ilm-status">
      <span className="tabular-nums">
        {pages && pages > 1 ? `${pages}쪽 · ` : null}
        글자 {stats.chars.toLocaleString("ko-KR")} · 낱말{" "}
        {stats.words.toLocaleString("ko-KR")} · 문단 {stats.blocks}
      </span>

      <span className="ilm-tooldiv" aria-hidden />

      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={showGutter}
          onChange={onToggleGutter}
          className="size-3.5 accent-primary"
        />
        {/* 문단마다 무엇인지(제목·글머리표·표)를 왼쪽에 적어 준다.
            서식 문서에 익숙하지 않은 사람이 「지금 무엇을 쓰고 있나」를 알 수 있다. */}
        갈래 이름 보기
      </label>

      <span className="ilm-tooldiv" aria-hidden />

      {/* Tab 은 들여쓰기에 쓰이므로 편집칸에서 빠져나가는 길을 따로 알려야 한다.
          WCAG 2.1.2 는 「함정이 없을 것」과 함께 「나가는 방법을 알릴 것」을
          요구한다. 적어 두지 않으면 지킨 것이 아니다. */}
      <span className="text-gray-60">
        <kbd className="ilm-kbd">Esc</kbd> 편집칸 밖으로
      </span>

      <span className="ilm-tooldiv" aria-hidden />

      <label className="inline-flex items-center gap-2">
        <span className="sr-only">화면 배율</span>
        <select
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
          className="rounded-xs border border-gray-30 bg-surface px-1 py-1 text-body-xs"
        >
          {[75, 90, 100, 125, 150].map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
        </select>
      </label>

      <span className="ml-auto inline-flex items-center gap-2">
        {peers.length > 0 ? (
          <span className="text-gray-60">
            {peers
              .slice(0, 2)
              .map((p) => p.name)
              .join(" · ")}
            {peers.length > 2 ? ` 외 ${peers.length - 2}명` : ""} 편집 중
          </span>
        ) : null}

        <span
          className={cn(
            "inline-flex items-center gap-1",
            !saving
              ? "font-bold text-status-review-text"
              : saveState === "failed"
                ? "font-bold text-status-overdue-text"
                : saveState === "clean"
                  ? "text-status-done-text"
                  : "text-gray-60",
          )}
        >
          {saving && saveState === "clean" ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <Save aria-hidden className="size-3.5" />
          )}
          {readOnly ? "읽기 전용" : saveLabel}
        </span>

        {saving && !readOnly && saveState !== "clean" && saveState !== "saving" ? (
          <button type="button" onClick={onSaveNow} className="ilm-cmbtn ilm-cmbtn-go">
            지금 저장
          </button>
        ) : null}
      </span>

      {/* 저장 상태가 바뀌면 읽어 준다. 화면을 보지 않는 사람에게 「저장됐다」는
          가장 중요한 한 줄이다. */}
      <p role="status" aria-live="polite" className="sr-only">
        {readOnly ? "" : saveLabel}
      </p>
    </div>
  );
}

export { ChevronRight };
