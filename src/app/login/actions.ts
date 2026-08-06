"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoAccounts } from "@/lib/mock/org";
import { DEMO_COOKIE } from "@/lib/demo-cookie";

const allowed = new Set(demoAccounts.map((a) => a.profile.id));

/**
 * 돌아갈 곳을 정한다.
 *
 * proxy가 붙여 준 next 값을 그대로 믿고 리다이렉트하면 오픈 리다이렉트가 된다.
 * "//evil.example.com"은 브라우저가 프로토콜 상대 URL로 읽어 외부로 나간다.
 * 그래서 슬래시 하나로 시작하고 두 개는 아닌, 우리 앱 안의 경로만 통과시킨다.
 */
function safeNext(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}

export async function enterAsDemo(formData: FormData) {
  const id = formData.get("profileId");
  if (typeof id !== "string" || !allowed.has(id)) {
    redirect("/login?error=unknown-account");
  }

  const store = await cookies();
  store.set(DEMO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 근무시간 정도. 데모 세션이 무기한 남아 있을 이유가 없다.
  });

  redirect(safeNext(formData.get("next")));
}

export async function leaveDemo() {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  redirect("/login");
}
