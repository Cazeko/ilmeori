"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { demoAccounts } from "@/lib/mock/org";
import { DEMO_COOKIE } from "@/lib/demo-cookie";
import { safeNext } from "@/lib/safe-next";

const allowed = new Map(demoAccounts.map((a) => [a.profile.id, a.profile.email]));

/**
 * 데모 계정으로 들어간다.
 *
 * Supabase가 연결되어 있으면 **실제 로그인**을 한다. 세션이 진짜로 발급되고,
 * 이후 모든 질의에 RLS가 적용된다. 화면에서 보이는 것이 곧 DB가 허용한 것이다.
 * 비밀번호는 서버 환경변수에만 있고 브라우저로 내려가지 않는다.
 *
 * 어느 계정으로 들어갈지는 클라이언트가 보낸 id를 그대로 쓰지 않고
 * **로그인 화면에 노출한 목록과 대조**한 뒤 서버가 아는 이메일로 바꾼다.
 * 그래야 임의의 계정으로 로그인을 시도하는 경로가 생기지 않는다.
 */
export async function enterAsDemo(formData: FormData) {
  const id = formData.get("profileId");
  const email = typeof id === "string" ? allowed.get(id) : undefined;
  if (!email) redirect("/login?error=unknown-account");

  const next = safeNext(formData.get("next"));

  if (isSupabaseConfigured) {
    const password = process.env.DEMO_ACCOUNT_PASSWORD;
    if (!password) {
      // 조용히 실패하면 "왜 로그인이 안 되지"로 한참을 헤맨다.
      throw new Error(
        "DEMO_ACCOUNT_PASSWORD 환경변수가 없습니다. 시드에 넣은 비밀번호와 같은 값을 설정하세요.",
      );
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect("/login?error=sign-in-failed");
    redirect(next);
  }

  // ── 데모 모드 ──────────────────────────────────────────────────────────
  const store = await cookies();
  store.set(DEMO_COOKIE, id as string, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 근무시간 정도. 데모 세션이 무기한 남아 있을 이유가 없다.
  });
  redirect(next);
}

/**
 * 계정에서 나온다. 데모에서는 "다른 계정으로 바꿔 보기"가 이 동작이다.
 *
 * /login으로 가는 링크로는 안 된다. proxy가 로그인한 사람을 /login에서
 * 곧바로 홈으로 되돌려보내기 때문에, 눌러도 제자리로 돌아온다.
 * 계정을 바꾸려면 먼저 세션을 실제로 끊어야 한다.
 *
 * 데모 진행 상태(ilmeori.state)는 지우지 않는다.
 * 박준호로 인계를 실행하고 이하람으로 바꿔서 결과를 확인하는 것이
 * 이 제품의 핵심 시연 동선이라, 계정을 바꿀 때마다 초기화되면 그 동선이 끊긴다.
 *
 * next 를 함께 보내면 새 계정으로 들어간 뒤 **그 주소로 되돌아간다.**
 * 업무 상세의 「이 주소를 다른 계정으로 열어 보기」가 이것을 쓴다.
 * 같은 주소가 계정에 따라 열리기도 하고 404가 되기도 하는 것을 보여 주는 것이
 * 접근제어를 설명하는 가장 짧은 방법이다. 값은 여기서도 safeNext로 거른다 —
 * 로그인 화면이 다시 검사하지만, 열린 문을 두 곳에 두지 않는다.
 */
export async function leaveDemo(formData?: FormData) {
  const next = safeNext(formData?.get("next") ?? null);

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } else {
    const store = await cookies();
    store.delete(DEMO_COOKIE);
  }
  redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}
