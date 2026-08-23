import Link from "next/link";
import { MessageSquareQuote, Send } from "lucide-react";
import { PeoplePicker } from "@/components/approval/people-picker";
import { Avatar } from "@/components/ui/avatar";
import { Field, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendNote } from "@/lib/actions/notes";
import { canMutate } from "@/lib/env";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import type {
  NoteThread,
  Profile,
  ProfileWithDepartment,
} from "@/lib/types";

/**
 * 「바깥에 물어본 것」 — 업무 상세의 **대화 탭 안**에 산다.
 *
 * 새 탭을 만들지 않았다. 이미 다섯 개고, 대개 비어 있을 여섯 번째 탭은
 * 소음이다. 그리고 여기 있는 편이 논지에 맞는다 — 안에서 한 대화와 밖에
 * 물어본 것이 **한 화면에 나란히** 있고, 인계서는 둘 다 읽는다.
 *
 * ── 고를 수 있는 사람에서 참여자를 뺀다 ────────────────────────────────────
 *
 * 참여자는 목록에 없다. 그 사람들에게는 **댓글로** 말하면 되고, 댓글은 업무를
 * 볼 수 있는 모두가 읽는다. 쪽지는 그 반대편을 위한 것이다 — 공개 범위 밖이라
 * 댓글이 닿지 않는 사람. 목록에서 참여자를 빼면 그 뜻이 설명 없이 드러난다.
 */
export function WorkNotes({
  workId,
  threads,
  viewer,
  candidates,
}: {
  workId: string;
  threads: NoteThread[];
  viewer: Profile;
  /** 이 업무의 참여자와 나를 뺀 전 직원. 위 머리글 참조. */
  candidates: ProfileWithDepartment[];
}) {
  return (
    <section
      aria-labelledby="work-notes-heading"
      className="mt-8 border-t border-rule-hair pt-6"
    >
      <h3
        id="work-notes-heading"
        className="text-h3 font-bold break-keep text-gray-90"
      >
        바깥에 물어본 것
      </h3>
      <p className="mt-2 text-body-sm break-keep text-gray-60">
        이 업무의 참여자가 아닌 사람에게 쪽지로 물은 것입니다. 오간 문답은 업무에
        함께 남아 인계서까지 갑니다.
      </p>

      {threads.length > 0 ? (
        <ul className="mt-4 divide-y divide-rule-hair rounded-sm border border-rule-frame bg-surface">
          {threads.map((t) => {
            const last = t.notes[t.notes.length - 1];
            const mine = t.notes.some(
              (n) => n.author_id === viewer.id || n.recipient_id === viewer.id,
            );
            return (
              <li key={t.thread_id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Avatar profile={t.counterpart} size="sm" className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-body-sm font-bold text-gray-90">
                        {t.counterpart.name}
                        {t.counterpart.position ? (
                          <span className="ml-1 font-normal text-gray-60">
                            {t.counterpart.position}
                          </span>
                        ) : null}
                      </span>
                      <time
                        dateTime={t.last_at}
                        title={formatFullDateTime(t.last_at)}
                        className="text-body-xs tabular-nums text-gray-60"
                      >
                        {formatDateTime(t.last_at)}
                      </time>
                      <span className="text-body-xs tabular-nums text-gray-60">
                        {t.notes.length}통
                      </span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-body-sm break-keep text-gray-70">
                      {last.body}
                    </p>
                    {/* 실을 펴 보는 길은 당사자에게만 있다. 제3자는 여기서
                        읽는 것으로 끝난다 — 답장할 자격이 없으므로 열어 봐야
                        할 일이 없다. */}
                    {mine ? (
                      <Link
                        href={`/notes/${t.thread_id}`}
                        className="mt-1 inline-block text-body-xs font-bold text-primary"
                      >
                        쪽지 열기
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-sm border border-dashed border-rule-hair px-4 py-6 text-center text-body-sm text-gray-60">
          아직 바깥에 물어본 것이 없습니다.
        </p>
      )}

      {canMutate && candidates.length > 0 ? (
        <form action={sendNote} className="mt-5 border-t border-rule-hair pt-5">
          <input type="hidden" name="workId" value={workId} />
          <PeoplePicker
            id="note-recipient"
            name="recipientId"
            label="누구에게 물어볼까요"
            hint="이 업무의 참여자는 목록에 없습니다 — 그분들께는 위의 대화로 말하면 됩니다."
            people={candidates}
            required
          />
          <Field
            id="note-body"
            label="물어볼 내용"
            className="mt-4"
            /* 이 한 줄이 설계 §3 을 화면에서 지킨다. 받는 사람은 업무를 볼 수
               없으므로, 맥락을 안 적으면 답을 받을 수 없다. 보내기 전에 알려
               주지 않으면 사용자는 그 사실을 답이 안 올 때에야 알게 된다. */
            hint="받는 사람은 이 업무를 열어 볼 수 없습니다. 업무 제목도 보이지 않으니 필요한 맥락을 본문에 적어 주세요."
          >
            {(p) => (
              <Textarea
                {...p}
                name="body"
                maxLength={1000}
                placeholder="예) 개회식 당일 셔틀 증차 협의를 언제까지 넣어야 하는지 알려 주시면 감사하겠습니다."
              />
            )}
          </Field>
          <div className="mt-3 flex justify-end">
            <SubmitButton>
              <Send aria-hidden className="size-4" />
              쪽지 보내기
            </SubmitButton>
          </div>
        </form>
      ) : (
        <p className="mt-5 flex items-start gap-2 border-t border-rule-hair pt-5 text-body-sm break-keep text-gray-60">
          <MessageSquareQuote
            aria-hidden
            className="mt-1 size-4 shrink-0 text-gray-40"
          />
          <span>
            {canMutate
              ? "이 업무는 전 직원이 참여하고 있어 밖에 물어볼 사람이 없습니다."
              : "시연 화면에서는 쪽지를 보낼 수 없습니다. 쪽지 한 통이 1,000자까지라 브라우저 쿠키에 담기지 않기 때문입니다."}
          </span>
        </p>
      )}
    </section>
  );
}
