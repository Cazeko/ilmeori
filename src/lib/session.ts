import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { profiles } from "@/lib/mock/org";
import { DEMO_COOKIE } from "@/lib/demo-cookie";
import type { Profile } from "@/lib/types";

/**
 * 지금 화면을 보고 있는 사람.
 *
 * 데모 모드에서는 쿠키에 담긴 데모 계정 id로 사람을 정한다.
 * 쿠키 값은 절대 믿지 않고 **목업에 실재하는 데모 계정인지 대조**한 뒤에만 쓴다.
 * 임의의 UUID를 넣어 남의 계정을 흉내 내는 경로를 여기서 끊는다.
 *
 * Supabase가 연결되면 이 함수는 supabase.auth.getUser()로 대체된다.
 * 화면 코드는 이 함수만 부르므로, 바뀌는 곳은 여기 한 군데다.
 */

export { DEMO_COOKIE };

const demoById = new Map(profiles.map((p) => [p.id, p]));

export async function getViewer(): Promise<Profile | null> {
  if (isSupabaseConfigured) {
    // 조용히 null을 돌려주면 앱 전체가 영문도 모른 채 로그인 화면만 반복한다.
    // 아직 연결 코드를 쓰지 않았다는 사실이 즉시 드러나게 크게 실패시킨다.
    throw new Error(
      "Supabase 환경변수가 설정되어 있지만 실제 인증 연동이 아직 구현되지 않았습니다. " +
        ".env.local의 NEXT_PUBLIC_SUPABASE_* 값을 비우면 데모 모드로 동작합니다.",
    );
  }
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
