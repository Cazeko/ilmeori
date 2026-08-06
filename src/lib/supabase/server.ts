import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/env";

/**
 * 서버 컴포넌트 · Server Action · Route Handler에서 쓰는 Supabase 클라이언트.
 *
 * 반드시 사용자 세션 기반이다. service_role로 우회하지 않는다.
 * → 서버 코드에 버그가 있어도 사용자가 볼 수 없는 데이터는 DB가 돌려주지 않는다.
 *
 * Next.js 16: cookies()는 비동기다.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다.
          // 세션 갱신은 src/proxy.ts가 담당하므로 여기서는 무시해도 안전하다.
        }
      },
    },
  });
}

/**
 * 로그인한 사용자를 반환한다. 없으면 null.
 *
 * getSession()이 아니라 getUser()를 쓴다. getSession()은 쿠키에 담긴 값을 그대로 믿지만,
 * getUser()는 Auth 서버에 검증을 요청한다. 위조된 쿠키를 신뢰하지 않기 위함이다.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}
