import { FileText, Lock, PenLine } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/format";
import type { DocSectionWithEditor, Document } from "@/lib/types";

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
 */
export function DocSections({
  document: doc,
  sections,
}: {
  document: Document | null;
  sections: DocSectionWithEditor[];
}) {
  if (!doc) {
    return (
      <EmptyState
        icon={FileText}
        title="아직 문서가 없습니다"
        description="업무 계획이나 진행 상황을 문서로 만들면, 여기서 여럿이 항목을 나눠 쓸 수 있습니다."
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

      <ol className="flex flex-col gap-3">
        {sections.map((s) => {
          const locked = Boolean(s.locked_by_profile);
          return (
            <li
              key={s.id}
              className={
                locked
                  ? "rounded-md border border-status-doing/40 bg-status-doing-bg/40"
                  : "rounded-md border border-gray-10 bg-white"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-10 px-4 py-2.5">
                <h3 className="text-body-sm font-bold break-keep text-gray-90">
                  {s.heading ?? "제목 없는 항목"}
                </h3>

                {locked ? (
                  <p className="inline-flex items-center gap-1.5 rounded-xs bg-status-doing px-2 py-1 text-body-xs font-bold text-white">
                    <Lock aria-hidden className="size-3" />
                    {s.locked_by_profile?.name} 편집 중
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

              {/* 줄바꿈이 의미를 갖는 행정 문서라 whitespace를 살린다 */}
              <p className="px-4 py-3.5 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
                {s.body}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
