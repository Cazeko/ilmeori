import type { AppNotification } from "@/lib/types";

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
      return n.work_id ? `/works/${n.work_id}?tab=talk` : "/works";
    case "note":
      return n.target_id ? `/notes/${n.target_id}` : "/notes";
    case "approval_decided":
      return n.target_id ? `/approvals/${n.target_id}` : "/approvals";
    case "work_touched":
      // 묶인 알림이라 가리킬 낱개가 없다. 무엇이 움직였는지는 이력이 말한다.
      return n.work_id ? `/works/${n.work_id}?tab=history` : "/works";
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
