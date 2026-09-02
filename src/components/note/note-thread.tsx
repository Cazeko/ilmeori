import { EyeOff, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Field, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteNote, replyNote } from "@/lib/actions/notes";
import { cn } from "@/lib/cn";
import { canMutate } from "@/lib/env";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import {
  workTalkHref,
  type NoteThread as Thread,
  type Profile,
} from "@/lib/types";

/**
 * 쪽지 실 하나.
 *
 * 대화(comment-thread)와 같은 어휘를 쓴다 — 아바타, 이름, 시각, 말풍선.
 * 다른 것은 둘이다.
 *
 *   ① 내가 보낸 쪽지에는 **「보냄」 → 「읽음」** 이 붙는다.
 *   ② 이 실은 업무를 물고 다닌다. 위에 그 업무가 적힌다.
 *
 * ── 왜 「읽음」을 보여 주는가 ───────────────────────────────────────────────
 *
 * 이 표시는 장식이 아니라 **판단 근거**다. 「30분 전에 읽었는데 답이 없다」와
 * 「아직 안 읽었다」는 다음 행동이 다르다 — 앞은 다시 묻고 뒤는 기다린다.
 * 시각이 없으면 그 판단을 못 하므로 함께 적는다.
 *
 * 되돌지 않는다. 받은 사람이 「안 읽음」으로 되돌릴 수 있으면 보낸 사람이 보는
 * 표시가 거짓이 된다(0019 의 칸 잠금이 DB 에서 같은 것을 막는다).
 */

/** 보낸 쪽지 아래 한 줄. 무채색이다 — 색 예산을 쓰지 않는다. */
function DeliveryMark({ readAt }: { readAt: string | null }) {
  return readAt ? (
    <span className="text-body-xs tabular-nums text-gray-60">
      읽음{" "}
      <time dateTime={readAt} title={formatFullDateTime(readAt)}>
        {formatDateTime(readAt)}
      </time>
    </span>
  ) : (
    <span className="text-body-xs text-gray-60">보냄</span>
  );
}

export function NoteThreadView({
  thread,
  viewer,
  /** 이 업무를 볼 수 있는가. 받는 사람은 못 본다(설계 §3) — 그때 제목이 없다. */
  canSeeWork,
}: {
  thread: Thread;
  viewer: Profile;
  canSeeWork: boolean;
}) {
  const last = thread.notes[thread.notes.length - 1];
  // 답장은 마지막 쪽지의 상대에게 간다. 실의 두 사람은 고정돼 있고
  // (0019 의 trg_note_thread_guard), 그중 내가 아닌 쪽이다.
  const replyTo =
    last.author_id === viewer.id ? last.recipient : last.author;
  const iAmInThread = thread.notes.some(
    (n) => n.author_id === viewer.id || n.recipient_id === viewer.id,
  );

  return (
    <div>
      {/* ── 무엇에 대한 문의인가 ─────────────────────────────────────────
          업무를 볼 수 있는 사람에게는 제목과 링크를, 못 보는 사람(=물음을
          받은 바깥 사람)에게는 못 본다는 사실을 그대로 적는다. 결재선에
          이름은 있고 업무는 못 보는 경우를 approval-row 가 같은 말로 그린다. */}
      <p className="mb-4 flex flex-wrap items-center gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm text-gray-60">
        {canSeeWork ? (
          <>
            <span>업무</span>
            <Link
              href={workTalkHref(thread.work.id)}
              className="font-bold break-keep text-gray-90"
            >
              {thread.work.title}
            </Link>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 break-keep">
            <EyeOff aria-hidden className="size-4 shrink-0 text-gray-40" />
            열람 권한이 없는 업무에 대한 문의입니다. 필요한 맥락은 쪽지 본문에
            있습니다.
          </span>
        )}
      </p>

      <ol className="flex flex-col gap-4">
        {thread.notes.map((n) => {
          const mine = n.author_id === viewer.id;
          return (
            <li key={n.id} className="flex gap-3">
              <Avatar profile={n.author} className="mt-1" me={mine} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-body-sm font-bold text-gray-90">
                    {n.author.name}
                    {n.author.position ? (
                      <span className="ml-1 font-normal text-gray-60">
                        {n.author.position}
                      </span>
                    ) : null}
                  </span>
                  {mine ? (
                    <span className="text-body-xs font-bold text-accent-text">
                      나
                    </span>
                  ) : null}
                  <time
                    dateTime={n.created_at}
                    title={formatFullDateTime(n.created_at)}
                    className="text-body-xs tabular-nums text-gray-60"
                  >
                    {formatDateTime(n.created_at)}
                  </time>

                  {mine && canMutate ? (
                    <form action={deleteNote} className="-my-2 ml-auto">
                      <input type="hidden" name="noteId" value={n.id} />
                      <input
                        type="hidden"
                        name="threadId"
                        value={thread.thread_id}
                      />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        className="min-h-11 px-2"
                        aria-label={`${formatFullDateTime(n.created_at)}에 보낸 내 쪽지 삭제`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                        삭제
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>

                <p
                  className={cn(
                    "mt-1 rounded-sm rounded-tl-none border px-4 py-3 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-90",
                    "border-rule-frame bg-surface",
                  )}
                >
                  {n.body}
                </p>

                {/* 「보냄 / 읽음」은 내가 보낸 것에만 붙는다. 받은 쪽지의
                    read_at 은 내가 언제 열었는지일 뿐이라 볼 이유가 없다. */}
                {mine ? (
                  <p className="mt-1">
                    <DeliveryMark readAt={n.read_at} />
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* 답장은 실의 당사자만 쓴다. 업무를 읽을 수 있어서 이 실을 구경하는
          제3자에게는 쓰는 칸이 없다 — DB 도 같은 것을 막는다. */}
      {iAmInThread && canMutate ? (
        <form action={replyNote} className="mt-6 border-t border-rule-hair pt-5">
          <input type="hidden" name="threadId" value={thread.thread_id} />
          <input type="hidden" name="workId" value={thread.work.id} />
          <input type="hidden" name="recipientId" value={replyTo.id} />
          <Field
            id="note-reply"
            label={`${replyTo.name} ${replyTo.position ?? ""} 님에게 답장`}
            hint="이 문답은 업무에 함께 남습니다. 담당자가 바뀌어도 그대로 넘어갑니다."
          >
            {(p) => (
              <Textarea
                {...p}
                name="body"
                maxLength={1000}
                placeholder="답을 적어 주세요."
              />
            )}
          </Field>
          <div className="mt-3 flex justify-end">
            <SubmitButton>
              <Send aria-hidden className="size-4" />
              답장 보내기
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
