import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { profiles } from "@/lib/mock/org";
import { DEMO_COOKIE } from "@/lib/demo-cookie";
import type { Profile } from "@/lib/types";

/**
 * 지금 화면을 보고 있는 사람.
 *
 * 화면 코드는 이 함수만 부른다. 인증 방식이 바뀌어도 고칠 곳은 여기 하나다.
 */

export { DEMO_COOKIE };

const demoById = new Map(profiles.map((p) => [p.id, p]));

export async function getViewer(): Promise<Profile | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();

    // getSession()이 아니라 getUser()를 쓴다.
    // getSession()은 쿠키에 담긴 값을 그대로 믿지만, getUser()는 Auth 서버에 검증을 맡긴다.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // 로그인했다는 것과 이 시스템의 직원이라는 것은 다르다.
    // profile 행이 없으면 들어올 자격이 없는 계정이다.
    const { data } = await supabase
      .from("profile")
      .select(
        "id, name, department_id, position, email, avatar_url, is_active, is_demo",
      )
      .eq("id", user.id)
      .maybeSingle();

    // 퇴직·휴직 처리된 계정은 세션이 남아 있어도 들여보내지 않는다.
    if (!data || !data.is_active) return null;
    return data as Profile;
  }

  // ── 데모 모드 ──────────────────────────────────────────────────────────
  // 쿠키 값은 절대 믿지 않고 목업에 실재하는 계정인지 대조한 뒤에만 쓴다.
  // 임의의 UUID를 넣어 남의 계정을 흉내 내는 경로를 여기서 끊는다.
  const store = await cookies();
  const id = store.get(DEMO_COOKIE)?.value;
  if (!id) return null;
  return demoById.get(id) ?? null;
}

/**
 * 로그인한 사람을 반드시 돌려준다. 없으면 로그인 화면으로 보낸다.
 *
 * 예외를 던지지 않고 리다이렉트하는 이유는, 이 상황이 "버그"가 아니라
 * "세션이 끊긴 평범한 경우"이기 때문이다. 쿠키 만료, proxy 우회, 링크 직접 입력이
 * 모두 여기로 온다. 오류 화면 대신 로그인 화면을 보여주는 편이 맞다.
 */
export async function requireViewer(): Promise<Profile> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}
