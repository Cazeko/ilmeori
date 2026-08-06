import { MessageSquare, Send } from "lucide-react";
import { postComment } from "@/app/(app)/works/[id]/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import type { CommentWithAuthor, Profile } from "@/lib/types";

/**
 * 대화.
 *
 * 메신저와 다른 점은 하나다. 이 대화는 업무에 붙어 있다.
 * 담당자가 바뀌어도 대화가 함께 넘어가고, 1년 뒤에 "그때 왜 그렇게 정했더라"를
 * 그 업무 화면에서 바로 읽을 수 있다.
 *
 * 대화가 메신저에 있으면 그 사람이 부서를 옮기는 순간 같이 사라진다.
 */
/**
 * 대화는 **볼 수 있는 사람이면 남길 수 있다.**
 * DB 정책(comment_insert)도 can_read_work만 요구한다.
 * 화면에서만 편집자 이상으로 좁혀 두면 "화면에서는 막았는데 서버는 허용"이라는
 * 어긋남이 생기고, 그런 어긋남은 보통 반대 방향의 사고로 이어진다.
 *
 * 열람자가 의견을 남길 수 있는 편이 협업 도구로도 맞다.
 * 다른 부서 담당자가 "이 부분 우리 일정과 겹칩니다"라고 적을 수 있어야 한다.
 * 문서와 상태를 고치는 것은 여전히 편집자 이상만 가능하다.
 */
export function CommentThread({
  workId,
  comments,
  viewer,
}: {
  workId: string;
  comments: CommentWithAuthor[];
  viewer: Profile;
}) {
  return (
    <div>
      {comments.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {comments.map((c) => {
            const mine = c.author_id === viewer.id;
            return (
              <li key={c.id} className="flex gap-3">
                <Avatar profile={c.author} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-body-sm font-bold text-gray-90">
                      {c.author.name}
                      {c.author.position ? (
                        <span className="ml-1 font-normal text-gray-60">
                          {c.author.position}
                        </span>
                      ) : null}
                    </span>
                    {mine ? (
                      <span className="rounded-xs bg-primary-5 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                        나
                      </span>
                    ) : null}
                    <time
                      dateTime={c.created_at}
                      title={formatFullDateTime(c.created_at)}
                      className="text-body-xs tabular-nums text-gray-60"
                    >
                      {formatDateTime(c.created_at)}
                    </time>
                  </p>
                  <p className="mt-1 rounded-md rounded-tl-none border border-gray-10 bg-white px-3.5 py-2.5 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="아직 대화가 없습니다"
          description="이 업무에 대해 오간 이야기를 여기에 남기면, 담당자가 바뀌어도 함께 넘어갑니다."
        />
      )}

      <form action={postComment} className="mt-6 border-t border-gray-10 pt-5">
          <input type="hidden" name="workId" value={workId} />
          <Field
            id="comment-body"
            label="대화 남기기"
            hint="시연용입니다. 남긴 글은 이 브라우저에만 저장되며 최근 3개까지 유지됩니다."
          >
            {(p) => (
              <Textarea
                {...p}
                name="body"
                maxLength={240}
                placeholder="결정한 내용이나 확인이 필요한 사항을 적어 주세요."
              />
            )}
          </Field>
        <div className="mt-3 flex justify-end">
          <Button type="submit">
            <Send aria-hidden className="size-4" />
            남기기
          </Button>
        </div>
      </form>
    </div>
  );
}
