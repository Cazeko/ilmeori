"use client";

import dynamic from "next/dynamic";
import { useCallback, useSyncExternalStore } from "react";
import { endRichDocEdit, saveRichDoc } from "@/lib/actions/rich-doc";
import { readFeedback } from "@/lib/actions/feedback";
import type { RichDoc } from "@/lib/editor/model";
import { PlainEditor } from "./plain-editor";
import type { EditorPerson, SaveResult } from "./rich-doc-editor";

/**
 * 서식 문서를 그리는 자리 — 둘 중 하나를 고른다.
 *
 * ── 왜 서버에서 간단 편집 화면을 먼저 그리는가 ──────────────────────────────
 *
 * 서버가 그리는 HTML 에는 **언제나 문단을 고칠 수 있는 폼**이 들어 있다.
 * 스크립트가 켜지면 그 위에 서식 편집기가 들어선다. 순서를 반대로 하면
 * (편집기를 먼저 그리고 안 되면 폼으로) 스크립트가 없는 화면에는 아무것도
 * 남지 않는다 — 문서가 이 제품의 중심이므로 그건 제품이 없어지는 것이다.
 *
 * `useSyncExternalStore` 로 하이드레이션을 가리는 것은 work-live.tsx 와 같은
 * 수법이다. 서버에서는 false, 브라우저에서는 true 를 돌려준다.
 *
 * ── 편집기를 늦게 불러오는 이유 ─────────────────────────────────────────────
 *
 * 편집기는 supabase-realtime 을 딸고 온다. 업무 화면을 여는 사람 모두가
 * 문서를 고치는 것은 아니므로, 첫 짐에 싣지 않는다(work-live-lazy.tsx 와
 * 같은 판단). 늦게 오는 동안 화면에는 간단 편집 화면이 그대로 있어서
 * **아무것도 없는 순간이 생기지 않는다.**
 */

const RichDocEditor = dynamic(
  () => import("./rich-doc-editor").then((m) => m.RichDocEditor),
  { ssr: false },
);

/** 구독할 외부 상태가 없다. 해지 함수만 돌려주고 아무것도 하지 않는다. */
const noSubscribe = () => () => {};

export function RichDocSurface({
  workId,
  documentId,
  doc,
  rev,
  viewer,
  people,
  canWrite,
  realtimeEnabled,
  demoNotice,
  editingBlockId,
}: {
  workId: string;
  documentId: string;
  doc: RichDoc;
  rev: number;
  viewer: EditorPerson;
  people: EditorPerson[];
  canWrite: boolean;
  realtimeEnabled: boolean;
  /**
   * 데모 모드인가. true 면 고치는 것은 되고 저장만 되지 않는다.
   * 왜 그렇게 갈랐는지는 works/[id]/doc/page.tsx 의 canWrite 주석에 있다.
   */
  demoNotice: boolean;
  editingBlockId: string | null;
}) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  /**
   * 저장.
   *
   * 서버 액션을 폼이 아니라 직접 부른다. 자동 저장이라 화면을 옮길 수 없기
   * 때문이다 — 액션이 redirect 로 끝나면 글을 쓰던 사람이 몇 초마다 화면 밖으로
   * 끌려 나간다. saveRichDoc 이 redirect 대신 결과 코드를 돌려주는 이유가 이것이고,
   * 그 코드를 사람이 읽는 문구로 바꾸는 일은 feedback.ts 한 곳에서만 한다.
   */
  const onSave = useCallback(
    async ({
      rev: seen,
      doc: next,
      final,
    }: {
      rev: number;
      doc: RichDoc;
      final: boolean;
    }): Promise<SaveResult> => {
      const fd = new FormData();
      fd.set("workId", workId);
      fd.set("documentId", documentId);
      fd.set("rev", String(seen));
      fd.set("blocks", JSON.stringify(next));
      // 마지막 저장에서만 서버가 캐시를 무른다. 자동 저장마다 무르면 편집 중인
      // 화면이 몇 초마다 서버 렌더로 갈아 끼워진다(rich-doc.ts 머리말).
      if (final) fd.set("final", "1");
      const result = await saveRichDoc(fd);
      return {
        ok: result.ok,
        rev: result.rev ?? undefined,
        reason: result.ok ? undefined : (readFeedback(result.code)?.text ?? undefined),
      };
    },
    [documentId, workId],
  );

  /**
   * 편집기를 떠난다 — 저장할 것이 남아 있지 않을 때의 마무리.
   *
   * 자동 저장이 이미 다 하고 떠나는 것이 가장 흔한 길이라, 그때는 마지막 저장이
   * 일어나지 않아 업무 상세의 캐시가 옛 본문에 머문다. 결과를 기다리지 않는다 —
   * 화면은 이미 떠나는 중이고, 실패해도 사용자가 할 일이 없다(새로고침하면 최신본이다).
   */
  const onLeave = useCallback(() => {
    const fd = new FormData();
    fd.set("workId", workId);
    void endRichDocEdit(fd).catch(() => {});
  }, [workId]);

  if (!hydrated) {
    return (
      <PlainEditor
        workId={workId}
        documentId={documentId}
        doc={doc}
        canWrite={canWrite}
        editingId={editingBlockId}
      />
    );
  }

  return (
    <RichDocEditor
      documentId={documentId}
      workId={workId}
      initialDoc={doc}
      initialRev={rev}
      viewer={viewer}
      people={people}
      canWrite={canWrite}
      realtimeEnabled={realtimeEnabled}
      // 데모에서는 고칠 수 있게 두되 저장은 하지 않는다. null 이면 편집기가
      // 저장을 아예 시도하지 않으므로 「저장 실패」 문구도 뜨지 않는다.
      onSave={canWrite && !demoNotice ? onSave : null}
      onLeave={canWrite && !demoNotice ? onLeave : null}
      exportBase={`/works/${workId}/doc/export`}
      demoNotice={demoNotice}
    />
  );
}
