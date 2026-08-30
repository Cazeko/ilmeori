import { AtSign, MessageSquare, Send, Trash2 } from "lucide-react";
import { deleteComment, postComment } from "@/lib/actions/comments";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { MentionBox } from "@/components/work/mention-box";
import { EmptyState } from "@/components/ui/empty-state";
import { canMutate } from "@/lib/env";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import {
  commentAnchor,
  type CommentWithAuthor,
  type Profile,
} from "@/lib/types";

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
/**
 * 지우기는 내 글에만 붙는다. 남의 글을 지우는 길은 화면에도 서버에도 없다.
 * 지워도 글자만 사라지고 지웠다는 사실은 이력에 남는다는 점을,
 * 누르기 전에 알 수 있도록 입력칸 밑에 미리 적어 둔다.
 *
 * 데모 모드에서는 삭제 버튼을 아예 그리지 않는다. 데모의 글은 쿠키에 담긴
 * 최근 세 개뿐이고 새 글을 남기면 오래된 것부터 저절로 밀려난다.
 * 지우는 길을 따로 내는 것보다 감추는 편이 단순하고, 감추면 서버 쪽도
 * openWork 하나로 끝나 데모 전용 분기를 만들지 않아도 된다.
 */
export function CommentThread({
  workId,
  comments,
  viewer,
  members,
}: {
  workId: string;
  comments: CommentWithAuthor[];
  viewer: Profile;
  /** 부를 수 있는 사람 = 이 업무의 참여자(나는 뺀다). 0020 의 정책과 같은 범위. */
  members: Profile[];
}) {
  return (
    <div>
      {comments.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {comments.map((c) => {
            const mine = c.author_id === viewer.id;
            return (
              // 인계서의 근거 꼬리표가 여기로 온다
              // (handover-draft.ts 의 draftRefHref). 도착 지점이 화면 맨 위에
              // 붙어 버리면 위쪽 맥락이 잘리므로 스크롤 여백을 함께 준다.
              // `target:` 은 주소의 #에 걸린 요소에만 붙어서, 온 사람만 어느
              // 줄인지 알고 그냥 읽는 사람에게는 아무 표시도 남지 않는다.
              <li
                key={c.id}
                id={commentAnchor(c.id)}
                className="flex scroll-mt-24 gap-3 target:bg-primary-5"
              >
                <Avatar profile={c.author} className="mt-1" />
                <div className="min-w-0 flex-1">
                  {/* 삭제는 <form>이라 문단(<p>) 안에 넣을 수 없다.
                      글자끼리의 기준선 정렬은 안쪽 span이 그대로 맡는다. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-body-sm font-bold text-gray-90">
                      {c.author.name}
                      {c.author.position ? (
                        <span className="ml-1 font-normal text-gray-60">
                          {c.author.position}
                        </span>
                      ) : null}
                    </span>
                    {mine ? (
                      <span className="text-body-xs font-bold text-accent-text">
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

                    {mine && canMutate ? (
                      <form action={deleteComment} className="-my-2 ml-auto">
                        <input type="hidden" name="workId" value={workId} />
                        <input type="hidden" name="commentId" value={c.id} />
                        <SubmitButton
                          variant="ghost"
                          size="sm"
                          className="min-h-11 px-2"
                          // 화면에는 '삭제'가 여러 개 놓인다. 어느 글을 지우는
                          // 버튼인지 소리로만 듣고도 구분할 수 있어야 한다.
                          aria-label={`${formatFullDateTime(c.created_at)}에 남긴 내 대화 삭제`}
                        >
                          <Trash2 aria-hidden className="size-4" />
                          삭제
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                  <p className="mt-1 rounded-sm rounded-tl-none border border-rule-frame bg-surface px-4 py-3 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80">
                    {c.body}
                  </p>
                  {/* 누가 불렸는지는 본문의 글자가 아니라 **저장된 사실**이다.
                      본문에 @이름 이라고 타이핑만 하고 고르지 않았으면 여기가
                      비어 있고, 그게 「아무도 안 불렸다」는 뜻이다 —
                      조용히 실패하지 않게 하는 자리다(mention-box.tsx). */}
                  {c.mentions.length > 0 ? (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-body-xs text-gray-60">
                      <AtSign aria-hidden className="size-3 shrink-0 text-gray-40" />
                      <span className="sr-only">부른 사람</span>
                      {c.mentions.map((m) => (
                        <span
                          key={m.id}
                          className={
                            m.id === viewer.id
                              ? "font-bold text-accent-text"
                              : "font-bold text-gray-70"
                          }
                        >
                          {m.name}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState icon={MessageSquare} title="아직 대화가 없습니다" />
      )}

      <form action={postComment} className="mt-6 border-t border-rule-hair pt-5">
          <input type="hidden" name="workId" value={workId} />
          {/* 입력칸 밑에 두 문장짜리 안내가 있었다. 「업무와 함께 보관되며
              담당자가 바뀌어도 넘어간다」는 이 제품의 전제이지 이 칸의 사용법이
              아니고, 「지운 사실은 이력에 남는다」는 지우기를 누를 때 알면 되는
              것이다. 글을 남기려는 사람에게 지금 필요한 말은 하나도 없었다. */}
          <MentionBox
            id="comment-body"
            label="대화 남기기"
            maxLength={240}
            placeholder="결정한 내용이나 확인이 필요한 사항을 적어 주세요."
            people={members}
            hint={canMutate ? undefined : "시연용. 이 브라우저에만 최근 3개까지 남습니다."}
          />
        <div className="mt-3 flex justify-end">
          <SubmitButton>
            <Send aria-hidden className="size-4" />
            남기기
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
