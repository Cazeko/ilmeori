"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markAllNotificationsRead } from "@/lib/data";
import { requireViewer } from "@/lib/session";

/**
 * 「전부 읽음」.
 *
 * 알림에는 만드는 액션이 없다. 만드는 길은 DB 의 `app.notify` 하나뿐이고
 * 앱에는 insert 권한 자체가 없다(0021) — 사람이 남에게 알림을 꽂아 넣을 수
 * 있으면 그 목록은 더 이상 사실이 아니다.
 *
 * 하나씩 읽음으로 만드는 것은 액션이 아니라 **주소**다
 * (`/notifications/[id]` 가 찍고 302 로 보낸다). 그래야 스크립트 없이도 돌고,
 * 가운데 클릭·새 탭도 그대로 산다.
 */
export async function markAllRead() {
  const viewer = await requireViewer();
  await markAllNotificationsRead(viewer);
  // 배지가 머리 줄에 있으므로 레이아웃까지 다시 그려야 숫자가 준다.
  revalidatePath("/", "layout");
  redirect("/notifications");
}
