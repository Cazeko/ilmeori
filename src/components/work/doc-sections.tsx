import { FileText, Lock, PenLine, Plus, Save, Trash2, X } from "lucide-react";
import {
  addSection,
  createDocument,
  deleteDocument,
  deleteSection,
  lockSection,
  renameDocument,
  saveSection,
  unlockSection,
} from "@/lib/actions/documents";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  SECTION_LOCK_MINUTES,
  sectionLockActive,
  type DocSectionWithEditor,
  type Document,
  type Profile,
} from "@/lib/types";

/**
 * 문서 — 항목(섹션) 단위로 나눠 쓴다.
 *
 * 한 문서를 여럿이 동시에 고치면 마지막에 저장한 사람이 앞사람 것을 덮어쓴다.
 * 그래서 파일을 주고받는 방식에서는 결국 한 명만 만지게 되고,
 * 나머지는 그 사람에게 카톡으로 내용을 보낸다.
 *
 * 여기서는 항목마다 잠금을 건다. 누가 어느 항목을 잡고 있는지 화면에 보이고,
 * 그 잠금은 화면이 아니라 DB 정책(doc_section_update)이 강제한다.
 * 브라우저 개발자도구로 요청을 위조해도 남의 항목은 저장되지 않는다.
 *
 * ── 편집 화면을 주소로 여는 이유 ───────────────────────────────────────────
 *
 * 「편집」은 링크가 아니라 제출 버튼이다. 누르면 서버가 먼저 잠금을 잡아 보고,
 * 성공했을 때만 ?edit=<항목> 으로 돌려보낸다. 화면이 먼저 열리고 저장할 때
 * 잠금을 시도하면, 다 쓰고 나서 "남이 편집 중입니다"를 듣게 된다.
 * 그 순서로는 잠금이 있으나 마나다.
 *
 * 열린 편집칸이 주소에 있으므로 새로고침해도 유지되고, 자바스크립트가 없어도 된다.
 *
 * ── 잠금 판정을 locked_by로만 하지 않는 이유 ────────────────────────────────
 *
 * locked_by만 보면 브라우저를 닫고 퇴근한 사람의 잠금이 영원히 "편집 중"으로 남는다.
 * sectionLockActive()는 DB의 app.section_lock_active()와 같은 규칙(5분)으로 판정한다.
 * 만료된 잠금은 잠기지 않은 것으로 그려야 화면과 DB의 대답이 같아진다.
 */
export function DocSections({
  workId,
  document: doc,
  sections,
  viewer,
  canWrite,
  canDelete,
  editingId,
}: {
  workId: string;
  document: Document | null;
  sections: DocSectionWithEditor[];
  viewer: Profile;
  /** 편집자 이상 */
  canWrite: boolean;
  /** 소유자 — 문서 삭제만 소유자의 몫이다(document_delete 정책) */
  canDelete: boolean;
  /** 주소의 ?edit= 값. 이 항목만 입력칸으로 그린다 */
  editingId: string | null;
}) {
  if (!doc) {
    return (
      // 열람 권한만 있는 사람에게 「문서로 만들면 여럿이 나눠 쓸 수 있습니다」를
      // 보여 주면, 할 수 없는 일을 설명하고 끝나는 화면이 된다. 만들 수 있는
      // 사람에게는 그 말이 필요 없다 — 바로 아래 칸이 이미 그 일을 한다.
      <EmptyState
        icon={FileText}
        title="아직 문서가 없습니다"
        description={
          canWrite
            ? undefined
            : "편집 권한이 있는 참여자가 문서를 만들면 여기에 나타납니다."
        }
        action={
          canWrite ? (
            <form action={createDocument} className="w-full max-w-sm text-left">
              <input type="hidden" name="workId" value={workId} />
              <Field
                id="new-document-title"
                label="문서 제목"
                required
                hint="예: 2026년 자원순환의 날 행사 추진계획"
              >
                {(p) => <Input {...p} name="title" maxLength={120} />}
              </Field>
              <SubmitButton block className="mt-3">
                <Plus aria-hidden className="size-4" />
                문서 만들기
              </SubmitButton>
            </form>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-h3 font-bold break-keep text-gray-90">{doc.title}</h2>
        <p className="shrink-0 pt-1 text-body-xs text-gray-60">
          항목 {sections.length}개
        </p>
      </div>

      {canWrite ? (
        <div className="mb-5 flex flex-col gap-2">
          <details className="rounded-md border border-gray-10 bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-body-sm font-bold text-gray-70">
              <PenLine aria-hidden className="size-4 text-gray-40" />
              문서 이름 바꾸기
            </summary>
            <form
              action={renameDocument}
              className="border-t border-gray-10 px-4 py-4"
            >
              <input type="hidden" name="workId" value={workId} />
              <input type="hidden" name="documentId" value={doc.id} />
              <Field id="rename-document-title" label="문서 제목" required>
                {(p) => (
                  <Input
                    {...p}
                    name="title"
                    maxLength={120}
                    defaultValue={doc.title}
                  />
                )}
              </Field>
              <div className="mt-3 flex justify-end">
                <SubmitButton>
                  <Save aria-hidden className="size-4" />
                  이름 저장
                </SubmitButton>
              </div>
            </form>
          </details>

          {/* 되돌릴 수 없는 동작은 접어 둔다. 펼치는 손짓 한 번이 확인 절차를 대신한다. */}
          {canDelete ? (
            <details className="rounded-md border border-gray-10 bg-surface">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-body-sm font-bold text-gray-70">
                <Trash2 aria-hidden className="size-4 text-gray-40" />
                문서 삭제
              </summary>
              <div className="border-t border-gray-10 px-4 py-4">
                <Notice tone="danger" title="되돌릴 수 없습니다">
                  문서를 지우면 항목 {sections.length}개와 지금까지 저장한 이전
                  판이 함께 사라집니다. 삭제했다는 사실은 업무 이력에 남습니다.
                </Notice>
                <form action={deleteDocument} className="mt-3 flex justify-end">
                  <input type="hidden" name="workId" value={workId} />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <SubmitButton variant="danger">
                    <Trash2 aria-hidden className="size-4" />
                    문서를 삭제합니다
                  </SubmitButton>
                </form>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {sections.map((s) => {
            // 만료된 잠금은 잠기지 않은 것으로 본다. DB도 똑같이 본다.
            const locked = sectionLockActive(s);
            const mine = locked && s.locked_by === viewer.id;
            const heldByOther = locked && !mine;
            const editing = canWrite && !heldByOther && editingId === s.id;
            const cancelFormId = `cancel-${s.id}`;

            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-md border bg-surface",
                  heldByOther
                    ? "border-status-doing/40 bg-status-doing-bg/40"
                    : editing
                      ? "border-primary-30"
                      : "border-gray-10",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-10 px-4 py-2.5">
                  <h3 className="text-body-sm font-bold break-keep text-gray-90">
                    {s.heading ?? "제목 없는 항목"}
                  </h3>

                  {heldByOther ? (
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-xs bg-status-doing px-2 py-1 text-body-xs font-bold text-white">
                        <Lock aria-hidden className="size-3" />
                        {s.locked_by_profile?.name ?? "다른 사람"}님 편집 중
                      </span>
                      {s.locked_at ? (
                        <time
                          dateTime={s.locked_at}
                          className="text-body-xs text-gray-60"
                        >
                          {formatDateTime(s.locked_at)}부터
                        </time>
                      ) : null}
                    </p>
                  ) : mine ? (
                    <p className="inline-flex items-center gap-1.5 rounded-xs bg-primary-5 px-2 py-1 text-body-xs font-bold text-primary">
                      <Lock aria-hidden className="size-3" />
                      <span>내가 편집 중</span>
                    </p>
                  ) : (
                    <p className="inline-flex items-center gap-1.5 text-body-xs text-gray-60">
                      {s.updated_by_profile ? (
                        <>
                          <Avatar profile={s.updated_by_profile} size="sm" />
                          {s.updated_by_profile.name}
                        </>
                      ) : null}
                      <PenLine aria-hidden className="size-3" />
                      <time dateTime={s.updated_at}>
                        {formatDateTime(s.updated_at)}
                      </time>
                    </p>
                  )}
                </div>

                {editing ? (
                  <div className="px-4 py-4">
                    {/* 저장과 취소는 서로 다른 액션인데 폼은 겹쳐 놓을 수 없다.
                        그래서 취소용 폼을 눈에 보이지 않게 옆에 두고, 아래 취소 버튼이
                        form 속성으로 이 폼을 가리킨다. 브라우저가 원래 하는 일이라
                        자바스크립트가 없어도 그대로 동작한다. */}
                    <form id={cancelFormId} action={unlockSection}>
                      <input type="hidden" name="workId" value={workId} />
                      <input type="hidden" name="sectionId" value={s.id} />
                    </form>

                    <form action={saveSection} className="flex flex-col gap-4">
                      <input type="hidden" name="workId" value={workId} />
                      <input type="hidden" name="sectionId" value={s.id} />

                      <Field id={`section-${s.id}-heading`} label="항목 제목">
                        {(p) => (
                          <Input
                            {...p}
                            name="heading"
                            maxLength={120}
                            defaultValue={s.heading ?? ""}
                          />
                        )}
                      </Field>

                      <Field
                        id={`section-${s.id}-body`}
                        label="내용"
                        hint={`저장하면 이전 판이 이력에 남습니다. ${SECTION_LOCK_MINUTES}분 동안 저장하지 않으면 잠금이 풀려 다른 사람이 이어서 쓸 수 있습니다.`}
                      >
                        {(p) => (
                          <Textarea
                            {...p}
                            name="body"
                            rows={10}
                            defaultValue={s.body}
                          />
                        )}
                      </Field>

                      <div className="flex flex-wrap gap-2">
                        <SubmitButton>
                          <Save aria-hidden className="size-4" />
                          저장
                        </SubmitButton>
                        {/* 취소도 서버를 거친다. 잠금을 풀어 주지 않으면 5분간 남는다. */}
                        <SubmitButton
                          form={cancelFormId}
                          variant="secondary"
                        >
                          <X aria-hidden className="size-4" />
                          취소
                        </SubmitButton>
                      </div>
                    </form>

                    <details className="mt-4 border-t border-gray-10 pt-3">
                      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-body-sm font-bold text-gray-70">
                        <Trash2 aria-hidden className="size-4 text-gray-40" />
                        <span>이 항목 삭제</span>
                      </summary>
                      <form action={deleteSection} className="mt-1">
                        <input type="hidden" name="workId" value={workId} />
                        <input type="hidden" name="sectionId" value={s.id} />
                        <p className="mb-3 text-body-sm leading-relaxed break-keep text-gray-70">
                          이 항목이 문서에서 사라집니다. 되돌릴 수 없습니다.
                        </p>
                        <SubmitButton variant="danger">
                          <Trash2 aria-hidden className="size-4" />
                          항목을 삭제합니다
                        </SubmitButton>
                      </form>
                    </details>
                  </div>
                ) : (
                  <>
                    {/* 줄바꿈이 의미를 갖는 행정 문서라 whitespace를 살린다 */}
                    {s.body ? (
                      <p className="px-4 py-3.5 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
                        {s.body}
                      </p>
                    ) : (
                      <p className="px-4 py-3.5 text-body-sm text-gray-60">
                        아직 내용이 비어 있습니다.
                      </p>
                    )}

                    {canWrite && !heldByOther ? (
                      <div className="flex flex-wrap gap-2 border-t border-gray-10 px-4 py-2.5">
                        <form action={lockSection}>
                          <input type="hidden" name="workId" value={workId} />
                          <input type="hidden" name="sectionId" value={s.id} />
                          <SubmitButton
                            variant="secondary"
                            // 항목 수만큼 같은 글자의 버튼이 늘어선다.
                            // 화면을 보지 않으면 어느 항목을 여는 버튼인지 알 수 없다.
                            aria-label={`${s.heading ?? "제목 없는 항목"} ${
                              mine ? "이어서 편집" : "편집"
                            }`}
                          >
                            <PenLine aria-hidden className="size-4" />
                            {mine ? "이어서 편집" : "편집"}
                          </SubmitButton>
                        </form>

                        {/* 잡아만 두고 떠난 잠금을 스스로 풀 길을 남긴다 */}
                        {mine ? (
                          <form action={unlockSection}>
                            <input type="hidden" name="workId" value={workId} />
                            <input type="hidden" name="sectionId" value={s.id} />
                            <SubmitButton
                              variant="ghost"
                              aria-label={`${s.heading ?? "제목 없는 항목"} 잠금 해제`}
                            >
                              <X aria-hidden className="size-4" />
                              잠금 해제
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-md border border-gray-10 bg-surface px-4 py-6 text-center text-body-sm text-gray-60">
          아직 항목이 없습니다.
          {canWrite ? " 아래에서 첫 항목을 추가해 주세요." : null}
        </p>
      )}

      {canWrite ? (
        <form
          action={addSection}
          className="mt-5 rounded-md border border-gray-10 bg-surface px-4 py-4"
        >
          <input type="hidden" name="workId" value={workId} />
          <input type="hidden" name="documentId" value={doc.id} />
          <h3 className="mb-3 text-body-sm font-bold text-gray-80">항목 추가</h3>
          <div className="flex flex-col gap-4">
            <Field
              id="new-section-heading"
              label="항목 제목"
              required
              hint="예: 추진 배경 / 소요 예산 / 협조 요청 사항"
            >
              {(p) => <Input {...p} name="heading" maxLength={120} />}
            </Field>
            <Field id="new-section-body" label="내용">
              {(p) => <Textarea {...p} name="body" rows={5} />}
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <SubmitButton>
              <Plus aria-hidden className="size-4" />
              항목 추가
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
