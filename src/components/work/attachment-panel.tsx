import { Download, FileUp, History, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { deleteAttachment, uploadAttachment } from "@/lib/actions/attachments";
import { formatBytes, formatDateTime, formatFullDateTime } from "@/lib/format";
import type { AttachmentWithUploader } from "@/lib/types";

/**
 * 첨부.
 *
 * ── 왜 파일 목록이 아니라 문서 목록인가 ───────────────────────────────────
 *
 * 계획_최종.hwp, 계획_최종_진짜최종.hwp, 계획_최종_진짜최종_교통과반영.hwp 는
 * 세 개의 문서가 아니라 한 문서의 세 판이다. 파일을 올린 순서대로 늘어놓으면
 * 화면은 저장소를 그대로 보여 줄 뿐이고, 어느 것이 최신인지는 여전히
 * 파일 이름을 읽어서 사람이 판단해야 한다. 그 판단을 없애는 것이 이 화면의 목적이다.
 *
 * 그래서 같은 file_name 끼리 묶어 한 줄로 그리고, 최신 판을 그 줄의 얼굴로 삼는다.
 * 이전 판은 지우지 않고 접어 둔다. '어떤 판이 있었는지'와 '누가 언제 바꿨는지'가
 * 인수인계와 감사에서 실제로 찾는 것이기 때문이다.
 *
 * ── 왜 내려받기가 폼이 아니라 링크인가 ────────────────────────────────────
 *
 * CSP에 form-action 'self' 가 걸려 있어서, 폼을 제출한 뒤 Supabase Storage로
 * 리다이렉트하면 크롬이 막는다. 링크 이동에는 form-action 이 걸리지 않는다.
 * 그래서 내려받기는 <a>이고, 그 목적지가 권한을 확인하고 짧은 서명 링크를 발급한다.
 * → src/app/(app)/works/[id]/files/[fileId]/route.ts
 *
 * ── 지우는 것을 접어 두는 이유 ────────────────────────────────────────────
 *
 * 문서 삭제와 같은 방식을 쓴다. 펼치는 손짓 한 번이 확인 절차를 대신한다.
 * 스크립트가 없어도 동작하고, 실수로 눌리지도 않는다.
 * 지울 수 있는 것은 최신 판뿐이다. 이전 판을 지우는 수단은 그리지 않는다 —
 * 이전 판이 남아 있는 것이 이 기능이 존재하는 이유다.
 */

/**
 * 파일 고르기 창의 필터. MIME이 아니라 확장자로 적는다.
 * 브라우저는 .hwp 의 MIME을 모르기 때문에 application/haansofthwp 로 적으면
 * 정작 hwp 파일이 회색으로 비활성화된다. 서버는 확장자로 다시 판정하므로
 * 여기는 어디까지나 편의이고, 실제로 거르는 것은 서버와 버킷이다.
 */
const ACCEPT = ".hwp,.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv";

/** 파일 선택 버튼도 손가락으로 누르는 크기(44px)를 지킨다. */
const FILE_INPUT =
  "min-h-11 w-full cursor-pointer rounded-sm border border-gray-30 bg-surface text-body-sm text-gray-80 file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-gray-5 file:px-3 file:text-body-sm file:font-bold file:text-gray-80";

type Version = AttachmentWithUploader;

type DocumentGroup = {
  fileName: string;
  /** 최신이 앞. 판 번호는 뒤에서부터 1이다. */
  versions: Version[];
};

/**
 * 같은 이름끼리 묶는다.
 *
 * 목록이 어떤 순서로 들어오든 같은 그림이 나오도록 여기서 다시 세운다.
 * 조회 함수의 정렬에 기대면, 그 정렬이 바뀌는 날 '최신 판'이 조용히 옛 판으로 바뀐다.
 */
function groupByFileName(items: Version[]): DocumentGroup[] {
  const groups = new Map<string, Version[]>();
  for (const a of items) {
    const bucket = groups.get(a.file_name);
    if (bucket) bucket.push(a);
    else groups.set(a.file_name, [a]);
  }
  return [...groups.entries()]
    .map(([fileName, versions]) => ({
      fileName,
      versions: [...versions].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    }))
    .sort((a, b) =>
      b.versions[0].created_at.localeCompare(a.versions[0].created_at),
    );
}

export function AttachmentPanel({
  workId,
  attachments,
  canWrite,
}: {
  workId: string;
  attachments: AttachmentWithUploader[];
  /** 편집자 이상인가. 올리고 지우는 수단을 그릴지만 정한다. 막는 일은 서버와 DB가 한다. */
  canWrite: boolean;
}) {
  const groups = groupByFileName(attachments);

  return (
    <Card>
      <CardHeader
        title="첨부"
        as="h2"
        description={
          groups.length > 0
            ? `문서 ${groups.length}건 · 판 ${attachments.length}개`
            : undefined
        }
      />

      {groups.length > 0 ? (
        <ul className="divide-y divide-gray-5">
          {groups.map(({ fileName, versions }) => {
            const latest = versions[0];
            const older = versions.slice(1);

            return (
              <li key={fileName} className="px-4 py-2">
                {/* 줄 전체가 최신 판을 받는 링크다. 이름만 보고 누르는 것이 가장 흔한 동작이다. */}
                <a
                  href={`/works/${workId}/files/${latest.id}`}
                  // 보이는 글자(파일 이름)를 접근성 이름에 그대로 품는다.
                  aria-label={`${fileName} 내려받기`}
                  className="flex min-h-11 items-center gap-2 text-body-sm font-bold break-all text-gray-80 underline-offset-2 hover:text-primary hover:underline"
                >
                  <Paperclip aria-hidden className="size-3.5 shrink-0 text-gray-40" />
                  <span className="min-w-0">{fileName}</span>
                </a>

                <p className="pl-5.5 text-body-xs text-gray-60">
                  {versions.length > 1 ? (
                    <>
                      <span className="font-bold text-gray-70">
                        {versions.length}판
                      </span>
                      {" · "}
                    </>
                  ) : null}
                  {latest.uploader.name} · {formatBytes(latest.byte_size)} ·{" "}
                  <time
                    dateTime={latest.created_at}
                    title={formatFullDateTime(latest.created_at)}
                  >
                    {formatDateTime(latest.created_at)}
                  </time>
                </p>

                {/* ── 이전 판 ──────────────────────────────────────────── */}
                {older.length > 0 ? (
                  <details className="pl-5.5">
                    <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-body-xs font-bold text-gray-70">
                      <History aria-hidden className="size-3.5 text-gray-40" />
                      이전 판 {older.length}개
                    </summary>
                    <ol className="mb-2 border-l-2 border-gray-10 pl-3">
                      {older.map((v, i) => {
                        // 가장 오래된 판이 1판. 최신은 versions.length 판이다.
                        const no = older.length - i;
                        return (
                          <li key={v.id}>
                            <a
                              href={`/works/${workId}/files/${v.id}`}
                              aria-label={`${fileName} ${no}판 내려받기`}
                              className="flex min-h-11 items-center gap-1.5 text-body-xs font-bold text-primary underline-offset-2 hover:underline"
                            >
                              <Download aria-hidden className="size-3.5" />
                              {no}판 내려받기
                            </a>
                            <p className="pb-2 text-body-xs text-gray-60">
                              {v.uploader.name} · {formatBytes(v.byte_size)} ·{" "}
                              <time
                                dateTime={v.created_at}
                                title={formatFullDateTime(v.created_at)}
                              >
                                {formatDateTime(v.created_at)}
                              </time>
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                ) : null}

                {/* ── 새 판 올리기 · 삭제 ──────────────────────────────── */}
                {canWrite ? (
                  <details className="pl-5.5">
                    <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-body-xs font-bold text-gray-70">
                      <FileUp aria-hidden className="size-3.5 text-gray-40" />
                      새 판 올리기 · 삭제
                    </summary>

                    <form
                      action={uploadAttachment}
                      encType="multipart/form-data"
                      className="border-t border-gray-5 py-3"
                    >
                      <input type="hidden" name="workId" value={workId} />
                      <input type="hidden" name="replacesId" value={latest.id} />
                      <Field
                        // 한 화면에 같은 폼이 파일 수만큼 놓인다.
                        // id가 겹치면 라벨이 전부 첫 줄의 입력을 가리킨다.
                        id={`attachment-replace-${latest.id}`}
                        label="새 판 파일"
                        hint={
                          <span className="break-all">
                            「{fileName}」의 다음 판으로 쌓입니다. 이전 판은
                            지워지지 않습니다. 확장자가 같아야 하며 4MB까지
                            올릴 수 있습니다.
                          </span>
                        }
                      >
                        {(p) => (
                          <input
                            {...p}
                            type="file"
                            name="file"
                            accept={ACCEPT}
                            className={FILE_INPUT}
                          />
                        )}
                      </Field>
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="submit"
                          className="min-h-11"
                          variant="secondary"
                          aria-label={`${fileName} 새 판 올리기`}
                        >
                          <Upload aria-hidden className="size-4" />
                          새 판 올리기
                        </Button>
                      </div>
                    </form>

                    <div className="border-t border-gray-5 py-3">
                      <Notice tone="danger" title="되돌릴 수 없습니다">
                        {versions.length > 1
                          ? `최신 판(${versions.length}판) 파일만 저장소에서 사라지고 이전 판은 그대로 남습니다.`
                          : "파일이 저장소에서 사라집니다."}{" "}
                        지웠다는 사실은 업무 이력에 남습니다.
                      </Notice>
                      <form action={deleteAttachment} className="mt-3 flex justify-end">
                        <input type="hidden" name="workId" value={workId} />
                        <input
                          type="hidden"
                          name="attachmentId"
                          value={latest.id}
                        />
                        <Button
                          type="submit"
                          className="min-h-11"
                          variant="danger"
                          aria-label={`${fileName} ${versions.length > 1 ? "최신 판" : "파일"} 삭제`}
                        >
                          <Trash2 aria-hidden className="size-4" />
                          삭제
                        </Button>
                      </form>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <CardBody>
          <p className="text-body-sm break-keep text-gray-60">
            첨부된 파일이 없습니다.
            {canWrite ? " 결재 문서와 붙임 자료를 여기에 올려 두면 담당자가 바뀌어도 함께 넘어갑니다." : null}
          </p>
        </CardBody>
      )}

      {/* ── 새 문서 올리기 ─────────────────────────────────────────────── */}
      {canWrite ? (
        <form
          action={uploadAttachment}
          encType="multipart/form-data"
          className="border-t border-gray-10 px-4 py-4"
        >
          <input type="hidden" name="workId" value={workId} />
          <Field
            id="attachment-new"
            label="파일 올리기"
            hint="hwp · pdf · docx · xlsx · pptx · 이미지 · 텍스트를 4MB까지 올릴 수 있습니다."
          >
            {(p) => (
              <input
                {...p}
                type="file"
                name="file"
                accept={ACCEPT}
                className={FILE_INPUT}
              />
            )}
          </Field>
          <p className="mt-2 text-body-xs break-keep text-gray-60">
            이미 올라온 문서를 고친 것이라면 그 파일의{" "}
            <strong className="font-bold text-gray-70">새 판 올리기</strong>를
            쓰세요. 이름이 조금씩 다른 파일이 늘어나지 않습니다.
          </p>
          <div className="mt-3 flex justify-end">
            <Button type="submit">
              <Upload aria-hidden className="size-4" />
              올리기
            </Button>
          </div>
        </form>
      ) : null}

      <div className="border-t border-gray-10 bg-gray-5 px-4 py-2.5">
        <p className="text-body-xs leading-relaxed text-gray-60">
          파일은 공개 URL이 없는 비공개 저장소에 있습니다. 내려받을 때마다
          권한을 확인하고 짧은 유효기간의 링크를 발급합니다.
        </p>
      </div>
    </Card>
  );
}
