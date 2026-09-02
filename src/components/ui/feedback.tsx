import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { readFeedback } from "@/lib/actions/feedback";

/**
 * 방금 한 일이 어떻게 됐는지 알려 주는 줄.
 *
 * 서버 액션은 끝나면 ?msg=<코드>를 붙여 원래 화면으로 돌려보낸다.
 * 여기서 그 코드를 문구로 바꿔 그린다. 스크립트가 없어도 읽히고,
 * 새로고침해도 남고, 그대로 링크로 보낼 수도 있다.
 *
 * 성공 알림에 role="status"를 두는 이유는, 화면을 보지 않는 사용자에게는
 * "저장됐다"가 아무 데도 나타나지 않기 때문이다. 실패는 Notice가 role="alert"로
 * 먼저 읽어 준다.
 */
export function ActionFeedback({
  msg,
  className,
}: {
  msg: unknown;
  className?: string;
}) {
  const feedback = readFeedback(msg);
  if (!feedback) return null;

  const quiet = feedback.tone === "success" || feedback.tone === "info";

  // 실패도 여기서 읽어 준다. 예전에는 Notice 가 role="alert" 를 붙여 준다고
  // 보고 성공에만 role 을 두었는데, Notice 는 tone 이 danger 일 때만 그렇게
  // 하므로 warning 으로 돌아온 결과는 아무 데서도 읽히지 않았다.
  return (
    <div
      role={quiet ? "status" : "alert"}
      aria-live={quiet ? "polite" : "assertive"}
      // rise-in 이 답하는 질문은 「방금 뭔가 도착했나?」다. 이 상자는 방금
      // 누른 행동의 결과라 정확히 그 질문에 답한다(globals.css 의 움직임 셋).
      // motion-safe: 를 달지 않는다 — 움직임을 줄인 환경에서는 globals.css 가
      // 한 번 도는 도착 표시를 전부 크로스페이드로 바꾼다.
      className={cn("animate-rise-in", className)}
    >
      <Notice tone={feedback.tone}>{feedback.text}</Notice>
    </div>
  );
}
