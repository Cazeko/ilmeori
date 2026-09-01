import {
  HANDOVER_TALK_ANCHOR,
  workTalkHref,
  type AppNotification,
} from "@/lib/types";

/**
 * 알림의 규칙 — db 구현과 목업, 그리고 화면이 **같은 함수**를 쓴다.
 *
 * ── 주소를 DB 에 넣지 않는 이유 ────────────────────────────────────────────
 *
 * `notification` 에 `href` 칸을 두면 라우트를 고치는 날 조용히 썩는다. 이미
 * 배달된 알림은 그때 적힌 주소를 그대로 들고 있고, 그 주소는 이제 404 다.
 * `kind` + `target_id` 만 저장하고 주소는 **읽을 때 만든다.**
 */
export function notificationHref(n: AppNotification): string {
  switch (n.kind) {
    case "mention":
      // 부른 것은 대화다. 그 탭으로 곧장 보낸다.
      return n.work_id ? workTalkHref(n.work_id) : "/works";
    case "note":
      return n.target_id ? `/notes/${n.target_id}` : "/notes";
    case "approval_decided":
      return n.target_id ? `/approvals/${n.target_id}` : "/approvals";
    case "work_touched":
      // 묶인 알림이라 가리킬 낱개가 없다. 무엇이 움직였는지는 이력이 말한다.
      return n.work_id ? `/works/${n.work_id}?tab=history` : "/works";
    case "handover_message":
      // 인계는 업무 여럿을 한꺼번에 넘기는 일이라 가리킬 업무가 하나로 정해지지
      // 않는다(0022 는 work_id 를 비워 둔다). 문답이 있는 자리로 곧장 보낸다.
      //
      // target_id 는 handover.id 지만 주소에 싣지 않는다 — 사람은 한 번에 하나의
      // 인계에만 얽히고(startHandover 가 그렇게 막는다), 화면은 그 한 건을
      // 스스로 찾는다. 주소에 id 를 실으면 남의 id 를 넣어 보는 문이 하나 는다.
      return `/handover#${HANDOVER_TALK_ANCHOR}`;
  }
}

/**
 * 목록 상한.
 *
 * 결재함과 같은 규약이다 — 상한을 걸고 **화면이 그 사실을 적는다.**
 * 「말하지 않는 상한은 「전부 다 봤다」로 읽힌다」(approvals/page.tsx).
 */
export const BELL_LIMIT = 10;
export const NOTIFICATION_LIMIT = 100;
