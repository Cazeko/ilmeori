import { redirect } from "next/navigation";
import { markNotificationRead } from "@/lib/data";
import { notificationHref } from "@/lib/notification";
import { requireViewer } from "@/lib/session";

/**
 * 알림 하나를 열면 — 읽음으로 찍고 진짜 목적지로 보낸다.
 *
 * ── 왜 액션이 아니라 주소인가 ──────────────────────────────────────────────
 *
 * 「누르면 읽음」을 폼 단추로 만들면 스크립트가 없어도 돌긴 하지만 **링크가
 * 아니게 된다** — 가운데 클릭도, 새 탭으로 열기도, 주소 복사도 사라진다.
 * 알림은 「저기로 가라」는 물건이므로 링크여야 한다.
 *
 * 그래서 한 홉을 둔다. `/notifications/42` 로 가서 읽음을 찍고 302 로 진짜
 * 자리로 보낸다. 스크립트 없이 정확히 돌고, 브라우저의 링크 기능이 전부 산다.
 *
 * ── 남의 알림을 눌러 보면 ──────────────────────────────────────────────────
 *
 * RLS 가 `recipient_id = auth.uid()` 로 잠가 두었으므로 읽음도 안 찍히고
 * 조회도 0행이다. 그때는 목록으로 돌려보낸다 — 「없다」와 「내 것이 아니다」는
 * 사용자에게 같은 것이다(getWork 가 null 을 주는 것과 같은 규칙).
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/notifications/[id]">,
) {
  await requireViewer();
  const { id } = await params;

  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) redirect("/notifications");

  const found = await markNotificationRead(n);
  redirect(found ? notificationHref(found) : "/notifications");
}
