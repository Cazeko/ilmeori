import { ArrowDown, ArrowUp, PenLine, Plus, Save, Trash2, X } from "lucide-react";
import {
  addPlainBlock,
  deletePlainBlock,
  movePlainBlock,
  openPlainBlock,
  savePlainBlock,
} from "@/lib/actions/rich-doc-blocks";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import {
  BLOCK_META,
  MAX_INDENT,
  clampIndent,
  computeOrdinals,
  markerFor,
  spansText,
  type BlockKind,
  type RichDoc,
} from "@/lib/editor/model";

/**
 * 스크립트 없이 서식 문서를 고치는 화면.
 *
 * ── 이것이 폴백이 아닌 이유 ────────────────────────────────────────────────
 *
 * 「자바스크립트를 켜 주세요」로 끝나는 화면을 만들지 않았다. 그러면 스크립트가
 * 아직 안 붙은 몇백 밀리초, 회선이 끊긴 순간, 내부망의 옛 브라우저에서 이 제품의
 * **문서가 통째로 사라진다.** 문서는 이 제품의 중심이라 그건 기능 하나가 빠지는
 * 것이 아니라 제품이 없어지는 것이다.
 *
 * 그래서 여기서도 문단을 읽고·고치고·갈래를 바꾸고·넣고·지우고·옮길 수 있다.
 * 못 하는 것은 굵게·색·표 안 글자·동시 편집이고, 그 사실을 화면이 먼저 말한다.
 * 감추면 사용자는 「굵게가 왜 안 되지」를 스스로 알아내야 한다.
 *
 * ── 서식이 평평해지는 것을 미리 말한다 ─────────────────────────────────────
 *
 * 굵기가 섞인 문단을 여기서 저장하면 그 굵기가 사라진다. 되돌릴 수 없는 일이라
 * 저장 단추 옆이 아니라 **편집칸을 열 때** 말해야 한다.
 */

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
  "spacer",
  "divider",
  "pagebreak",
];

export function PlainEditor({
  workId,
  documentId,
  doc,
  canWrite,
  editingId,
}: {
  workId: string;
  documentId: string;
  doc: RichDoc;
  canWrite: boolean;
  /** 주소의 ?b= 값. 이 문단만 편집칸으로 그린다. */
  editingId: string | null;
}) {
  const ordinals = computeOrdinals(doc.blocks);
  const commentsByBlock = new Map<string, number>();
  for (const c of doc.comments ?? []) {
    if (!c.done) commentsByBlock.set(c.blockId, (commentsByBlock.get(c.blockId) ?? 0) + 1);
  }

  return (
    <div>
      <Notice tone="info" title="간단 편집 화면입니다" className="mb-4">
        브라우저에서 자바스크립트가 아직 돌지 않아 문단 단위로 고치는 화면을 띄웠습니다.
        읽기·고치기·문단 넣기·지우기·순서 바꾸기는 모두 됩니다.{" "}
        <b className="font-bold">
          굵게·색·표 안의 글자·여럿이 동시에 쓰기는 이 화면에서 되지 않습니다.
        </b>{" "}
        스크립트가 켜지면 서식 편집기가 저절로 나타납니다.
      </Notice>

      <ol className="flex flex-col gap-2">
        {doc.blocks.map((b, i) => {
          const meta = BLOCK_META[b.kind];
          const editing = canWrite && editingId === b.id;
          const text = spansText(b.spans);
          const marker = markerFor(b.kind, b.indent ?? 0, ordinals[i]);
          const cancelId = `cancel-b-${b.id}`;
          const notes = commentsByBlock.get(b.id) ?? 0;
          // 서식이 붙어 있는 문단인가. 저장하면 그것이 사라진다.
          const rich = b.spans.some((s) => s.m?.length || s.c || s.h);

          return (
            <li
              key={b.id}
              className={cn(
                "rounded-sm border bg-surface",
                editing ? "border-primary-30" : "border-rule-frame",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-hair px-3 py-2">
                <span className="inline-flex items-center gap-2 text-body-xs font-bold text-gray-60">
                  {meta.label}
                  {b.indent ? (
                    <span className="font-normal">{clampIndent(b.indent)}단 들여씀</span>
                  ) : null}
                  {notes > 0 ? (
                    <span className="text-accent-text">
                      의견 {notes}
                    </span>
                  ) : null}
                </span>

                {canWrite && !editing ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <form action={openPlainBlock}>
                      <input type="hidden" name="workId" value={workId} />
                      <input type="hidden" name="blockId" value={b.id} />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        aria-label={`${meta.label} 고치기`}
                      >
                        <PenLine aria-hidden className="size-3.5" />
                        고치기
                      </SubmitButton>
                    </form>
                    <form action={movePlainBlock}>
                      <input type="hidden" name="workId" value={workId} />
                      <input type="hidden" name="documentId" value={documentId} />
                      <input type="hidden" name="blockId" value={b.id} />
                      <input type="hidden" name="dir" value="up" />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        disabled={i === 0}
                        aria-label={`${meta.label} 위로 옮기기`}
                      >
                        <ArrowUp aria-hidden className="size-3.5" />
                      </SubmitButton>
                    </form>
                    <form action={movePlainBlock}>
                      <input type="hidden" name="workId" value={workId} />
                      <input type="hidden" name="documentId" value={documentId} />
                      <input type="hidden" name="blockId" value={b.id} />
                      <input type="hidden" name="dir" value="down" />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        disabled={i === doc.blocks.length - 1}
                        aria-label={`${meta.label} 아래로 옮기기`}
                      >
                        <ArrowDown aria-hidden className="size-3.5" />
                      </SubmitButton>
                    </form>
                  </span>
                ) : null}
              </div>

              {editing ? (
                <div className="px-3 py-3">
                  {rich ? (
                    <Notice tone="warning" title="이 문단에는 글자 서식이 있습니다" className="mb-3">
                      여기서 저장하면 굵게·기울임·색이 사라지고 보통 글자만 남습니다.
                      서식을 지키려면 스크립트가 켜진 브라우저에서 고쳐 주세요.
                    </Notice>
                  ) : null}

                  {/* 취소는 다른 액션이라 폼을 겹쳐 놓을 수 없다. 보이지 않는 폼을
                      옆에 두고 아래 단추가 form 속성으로 가리킨다 — 브라우저가
                      원래 하는 일이라 스크립트가 없어도 그대로 동작한다. */}
                  <form id={cancelId} action={openPlainBlock}>
                    <input type="hidden" name="workId" value={workId} />
                    <input type="hidden" name="blockId" value="" />
                  </form>

                  <form action={savePlainBlock} className="flex flex-col gap-3">
                    <input type="hidden" name="workId" value={workId} />
                    <input type="hidden" name="documentId" value={documentId} />
                    <input type="hidden" name="blockId" value={b.id} />

                    <div className="flex flex-wrap gap-3">
                      {/* 표는 갈래를 바꿀 수 없다. 목록에 「표」가 없으므로
                          <select> 를 그리면 브라우저가 첫 항목(문서 제목)을
                          고른 채로 두고, 그대로 저장하면 표가 통째로 사라진다.
                          고를 수 없는 것은 아예 그리지 않고 그대로 실어 보낸다. */}
                      {b.kind === "table" ? (
                        <p className="flex flex-col gap-1">
                          <span className="text-body-sm font-bold text-gray-90">
                            문단 갈래
                          </span>
                          <input type="hidden" name="kind" value="table" />
                          <span className="inline-flex min-h-11 items-center text-body-sm text-gray-60">
                            표. 이 화면에서는 갈래를 바꿀 수 없습니다
                          </span>
                        </p>
                      ) : (
                        <p className="flex flex-col gap-1">
                          <label
                            htmlFor={`kind-${b.id}`}
                            className="text-body-sm font-bold text-gray-90"
                          >
                            문단 갈래
                          </label>
                          <select
                            id={`kind-${b.id}`}
                            name="kind"
                            defaultValue={b.kind}
                            className="min-h-11 rounded-sm border border-gray-50 bg-surface px-2 text-body-sm"
                          >
                            {KIND_CHOICES.map((k) => (
                              <option key={k} value={k}>
                                {BLOCK_META[k].label}
                              </option>
                            ))}
                          </select>
                        </p>
                      )}

                      <p className="flex flex-col gap-1">
                        <label
                          htmlFor={`indent-${b.id}`}
                          className="text-body-sm font-bold text-gray-90"
                        >
                          들여쓰기
                        </label>
                        <select
                          id={`indent-${b.id}`}
                          name="indent"
                          defaultValue={String(clampIndent(b.indent))}
                          className="min-h-11 rounded-sm border border-gray-50 bg-surface px-2 text-body-sm"
                        >
                          {Array.from({ length: MAX_INDENT + 1 }, (_, n) => (
                            <option key={n} value={n}>
                              {n === 0 ? "안 들여씀" : `${n}단`}
                            </option>
                          ))}
                        </select>
                      </p>
                    </div>

                    {meta.text ? (
                      <Field
                        id={`body-${b.id}`}
                        label="내용"
                        hint="번호와 글머리표는 저장할 때 저절로 붙습니다. 「1.」「-」를 직접 적지 않아도 됩니다."
                      >
                        {(p) => (
                          <Textarea {...p} name="body" rows={4} defaultValue={text} />
                        )}
                      </Field>
                    ) : (
                      <p className="text-body-sm text-gray-60">
                        이 갈래에는 글자가 없습니다. 갈래만 바꿔 저장하시면 됩니다.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <SubmitButton size="sm">
                        <Save aria-hidden className="size-4" />
                        저장
                      </SubmitButton>
                      <SubmitButton form={cancelId} variant="secondary" size="sm">
                        <X aria-hidden className="size-4" />
                        취소
                      </SubmitButton>
                    </div>
                  </form>

                  {doc.blocks.length > 1 ? (
                    <details className="mt-3 border-t border-rule-hair pt-2">
                      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-body-sm font-bold text-gray-60">
                        <Trash2 aria-hidden className="size-4 text-gray-40" />이 문단 지우기
                      </summary>
                      <form action={deletePlainBlock} className="mt-1">
                        <input type="hidden" name="workId" value={workId} />
                        <input type="hidden" name="documentId" value={documentId} />
                        <input type="hidden" name="blockId" value={b.id} />
                        <p className="mb-2 text-body-sm break-keep text-gray-60">
                          이 문단이 문서에서 사라집니다. 되돌릴 수 없습니다.
                        </p>
                        <SubmitButton pendingLabel="지우는 중…" variant="danger" size="sm">
                          <Trash2 aria-hidden className="size-4" />
                          문단을 지웁니다
                        </SubmitButton>
                      </form>
                    </details>
                  ) : null}
                </div>
              ) : (
                <BlockPreview
                  kind={b.kind}
                  marker={marker}
                  text={text}
                  table={b.table}
                  indent={clampIndent(b.indent)}
                />
              )}
            </li>
          );
        })}
      </ol>

      {canWrite ? (
        <form
          action={addPlainBlock}
          className="mt-4 flex flex-wrap items-end gap-2 rounded-sm border border-rule-frame bg-surface px-3 py-3"
        >
          <input type="hidden" name="workId" value={workId} />
          <input type="hidden" name="documentId" value={documentId} />
          <input
            type="hidden"
            name="afterId"
            value={doc.blocks[doc.blocks.length - 1]?.id ?? ""}
          />
          <p className="flex flex-col gap-1">
            <label htmlFor="new-block-kind" className="text-body-sm font-bold text-gray-90">
              맨 아래에 문단 넣기
            </label>
            <select
              id="new-block-kind"
              name="kind"
              defaultValue="body"
              className="min-h-11 rounded-sm border border-gray-50 bg-surface px-2 text-body-sm"
            >
              {KIND_CHOICES.map((k) => (
                <option key={k} value={k}>
                  {BLOCK_META[k].label}
                </option>
              ))}
            </select>
          </p>
          <SubmitButton size="sm">
            <Plus aria-hidden className="size-4" />
            넣기
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function BlockPreview({
  kind,
  marker,
  text,
  table,
  indent,
}: {
  kind: BlockKind;
  marker: string;
  text: string;
  table: RichDoc["blocks"][number]["table"];
  indent: number;
}) {
  if (kind === "table" && table) {
    return (
      <div className="px-3 py-3">
        <table className="w-full border-collapse text-body-sm">
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.cells.map((cell) => {
                  const Cell = table.header && r === 0 ? "th" : "td";
                  return (
                    <Cell
                      key={cell.id}
                      colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                      className={cn(
                        "border border-gray-50 px-2 py-1 text-left align-top",
                        table.header && r === 0 && "bg-gray-5 font-bold",
                      )}
                    >
                      {spansText(cell.spans)}
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {/* 표 안의 글자는 이 화면에서 못 고친다. 감추지 않고 그 자리에 적는다. */}
        <p className="mt-2 text-body-xs text-gray-60">
          표 안의 글자는 서식 편집기에서 고칠 수 있습니다.
        </p>
      </div>
    );
  }

  if (kind === "divider") {
    return <hr className="mx-3 my-3 border-gray-30" />;
  }
  if (kind === "pagebreak") {
    return (
      <p className="px-3 py-2 text-body-xs text-gray-60">여기서 쪽이 나뉩니다</p>
    );
  }
  if (kind === "spacer") {
    return <p className="px-3 py-2 text-body-xs text-gray-60">(빈 줄)</p>;
  }

  return (
    <p
      className={cn(
        "px-3 py-2 leading-relaxed break-keep whitespace-pre-line",
        kind === "title" && "text-center text-h3 font-bold text-gray-90",
        kind === "heading" && "text-body font-bold text-gray-90",
        kind === "subheading" && "text-body-sm font-bold text-gray-90",
        (kind === "source" || kind === "note") && "text-body-xs text-gray-60",
        kind === "quote" && "border-l-2 border-gray-30 text-gray-60",
        !["title", "heading", "subheading", "source", "note", "quote"].includes(kind) &&
          "text-body-sm text-gray-90",
      )}
      style={indent ? { paddingInlineStart: `${12 + indent * 16}px` } : undefined}
    >
      {marker ? <span className="mr-2 text-gray-60">{marker}</span> : null}
      {text || <span className="text-gray-60">(빈 문단)</span>}
    </p>
  );
}
