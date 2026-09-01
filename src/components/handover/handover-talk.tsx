import { MessageSquare, Send } from "lucide-react";
import { postHandoverMessage } from "@/lib/actions/handover";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { formatDateTime, formatFullDateTime } from "@/lib/format";
import {
  HANDOVER_MESSAGE_MAX,
  HANDOVER_TALK_ANCHOR,
  type HandoverMessageWithAuthor,
  type Profile,
} from "@/lib/types";

/**
 * 인계자와 인수자가 **인계서를 보면서** 주고받는 문답.
 *
 * ── 왜 이 자리인가 ────────────────────────────────────────────────────────
 *
 * 인터뷰가 말한 20~30통의 전화(Q10)에 이 제품이 준 답은 「그 업무의 대화에
 * 적으세요」였고, 그건 지금도 맞다 — 개인 쪽지로 오간 말은 두 사람에게서
 * 끝나고, **다음 인계에서 또 스무 번 전화하게 만드는 것이 정확히 그 구조**다.
 *
 * 그런데 실제로 물으려면 인계 화면을 떠나 업무를 찾고 대화 탭을 열고 **무엇을
 * 묻고 싶었는지 다시 적어야** 했다. 클릭 수가 문제가 아니다(두 번이다).
 * 질문이 생기는 자리와 묻는 자리가 다른 것이 문제다 — 도착하면 맥락을 잃는다.
 *
 * 그래서 묻는 자리를 문서 옆으로 가져온다. 다만 **쪽지로 만들지 않았다.**
 * 여기 쌓이는 글은 사람이 아니라 **인계 건에** 붙는다(0022).
 *
 *   · 두 당사자가 같은 것을 본다. 한쪽만 가진 사본이 없다
 *   · 고치지도 지우지도 못한다 — 반쪽만 남은 문답은 안 읽느니만 못하다
 *   · 다음에 이 인계서를 여는 사람이 문답을 그대로 읽는다
 *
 * ── 서식에는 안 실린다 ────────────────────────────────────────────────────
 *
 * 별지 제12호서식의 칸은 일곱이고 그건 법이 정한 것이다. 여기 오간 말을 여덟
 * 번째 칸으로 끼워 넣으면 그건 이미 그 서식이 아니다. 화면의 서식에도, 한/글
 * 파일에도, 인쇄본에도 이 글은 안 들어간다 — 그래서 이 판은 `print:hidden` 이다.
 *
 * ── 「업무의 대화」를 대체하지 않는다 ──────────────────────────────────────
 *
 * 이어지는 이야기는 여전히 그 업무의 대화에 적어야 한다. 여기는 **인계서를
 * 읽다 막힌 것**을 묻는 자리이고, 상한(200줄)에 닿았을 때 화면이 그렇게 말한다.
 */
export function HandoverTalk({
  handoverId,
  viewer,
  other,
  messages,
  canWrite,
  /** 데모 모드에서는 최근 몇 줄만 이 브라우저에 남는다. 그 수를 화면이 적는다. */
  demoKeeps,
}: {
  handoverId: string;
  viewer: Profile;
  /** 반대편 사람. 빈 화면에서 「누구에게 묻는가」를 말하는 데 쓴다. */
  other: Profile;
  messages: HandoverMessageWithAuthor[];
  canWrite: boolean;
  demoKeeps: number | null;
}) {
  const inputId = "handover-talk-body";

  return (
    <section
      // 알림을 누르면 이 자리로 온다(lib/notification.ts). 붙박이 머리줄에
      // 가리지 않게 여백을 둔다 — 서식 항목 앵커가 이미 쓰는 값이다.
      id={HANDOVER_TALK_ANCHOR}
      aria-label="인계·인수 문답"
      className="scroll-mt-20 rounded-sm border border-rule-frame bg-surface print:hidden"
    >
      <div className="border-b border-rule-hair px-4 py-3">
        <h2 className="flex items-center gap-2 text-body-sm font-bold text-gray-90">
          <MessageSquare aria-hidden className="size-4 text-gray-40" />
          인계·인수 문답
          {messages.length > 0 ? (
            <span className="text-body-xs font-normal tabular-nums text-gray-60">
              {messages.length}줄
            </span>
          ) : null}
        </h2>
        {/* 「이 글이 어디에 남는가」를 머리에 적는다. 결재로 올라가는 서식과
            섞이지 않는다는 것은 쓰기 전에 알아야 하는 사실이다. */}
        <p className="mt-1 text-body-xs leading-relaxed break-keep text-gray-60">
          이 인계 건에 남습니다. 별지 제12호서식에는 실리지 않고, 적은 뒤에는
          고치거나 지울 수 없습니다.
        </p>
      </div>

      {/* ── 오간 말 ─────────────────────────────────────────────────────────
          메신저처럼 **내 말은 오른쪽, 상대 말은 왼쪽**이다. 이 판에는 사람이
          둘뿐이라, 이름을 읽지 않고 자리만으로 누가 한 말인지 알 수 있다.
          그래도 이름을 지우지는 않는다 — 인계서에 딸린 기록이고, 화면을
          캡처해 붙이는 자리에서 자리 정렬은 뜻을 잃는다.

          높이를 묶고 안에서 굴린다. 200줄까지 쌓일 수 있는 판이라, 안 묶으면
          이 카드 하나가 화면을 다 먹는다. */}
      {messages.length === 0 ? (
        <p className="px-4 py-6 text-body-sm leading-relaxed break-keep text-gray-60">
          아직 오간 글이 없습니다.{" "}
          {canWrite ? (
            <>
              인계서를 읽다 막히는 것이 있으면 {other.name} {other.position}
              에게 여기서 바로 물어볼 수 있습니다. 문서를 떠나지 않아도 됩니다.
            </>
          ) : (
            <>{other.name} {other.position}과 주고받은 글이 여기 쌓입니다.</>
          )}
        </p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-4 overflow-y-auto px-4 py-4">
          {messages.map((m) => {
            const mine = m.author_id === viewer.id;
            return (
              <li
                key={m.id}
                className={cn("flex gap-2", mine ? "flex-row-reverse" : "")}
              >
                <Avatar profile={m.author} size="sm" />
                <div className={cn("min-w-0 flex-1", mine ? "text-right" : "")}>
                  <p
                    className={cn(
                      "flex items-baseline gap-2 text-body-xs",
                      mine ? "justify-end" : "",
                    )}
                  >
                    <span className="font-bold text-gray-80">
                      {m.author.name} {m.author.position}
                    </span>
                    <time
                      dateTime={m.created_at}
                      title={formatFullDateTime(m.created_at)}
                      className="tabular-nums text-gray-60"
                    >
                      {formatDateTime(m.created_at)}
                    </time>
                  </p>
                  {/* 말풍선. 내 말에는 옅은 파랑을 깔되 **글자는 먹색**이다 —
                      이 앱에서 파랑은 「누를 수 있는 것」을 가리키는 색이고
                      (globals.css 의 네 갈래), 지나간 말은 눌리지 않는다.
                      상대 말은 흰 면에 선 하나. 색을 한 갈래도 안 더한다. */}
                  <p
                    className={cn(
                      "mt-1 inline-block rounded-sm px-3 py-2 text-left text-body-sm leading-relaxed break-keep whitespace-pre-line",
                      mine
                        ? "bg-primary-5 text-gray-90"
                        : "border border-rule-hair bg-gray-0 text-gray-80",
                    )}
                  >
                    {m.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── 적는 칸 ─────────────────────────────────────────────────────────
          평범한 <form> + 서버 액션이다. 스크립트가 없어도 눌린다.
          이 화면의 다른 폼과 같은 규약이다(block-notes.tsx). */}
      {canWrite ? (
        <form
          action={postHandoverMessage}
          className="flex flex-col gap-2 border-t border-rule-hair px-4 py-4"
        >
          <input type="hidden" name="handoverId" value={handoverId} />
          <label htmlFor={inputId} className="sr-only">
            {other.name} {other.position}에게 물어볼 것
          </label>
          <Textarea
            id={inputId}
            name="body"
            required
            maxLength={HANDOVER_MESSAGE_MAX}
            rows={3}
            className="min-h-20"
            placeholder={`${other.name} ${other.position}에게 물어볼 것을 적어 주세요.`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* 데모 모드의 상한을 **적는다.** 말하지 않는 상한은 「전부 남는다」로
                읽히고, 새로고침했더니 사라진 화면은 없는 것만 못하다. */}
            <p className="min-w-0 flex-1 text-body-xs leading-relaxed break-keep text-gray-60">
              {demoKeeps === null
                ? "적은 뒤에는 고치거나 지울 수 없습니다."
                : `데모 모드입니다 — 최근 ${demoKeeps}줄만 이 브라우저에 남습니다.`}
            </p>
            <SubmitButton size="sm" pendingLabel="남기는 중…">
              <Send aria-hidden className="size-4" />
              남기기
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}
