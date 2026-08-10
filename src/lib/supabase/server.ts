import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/env";

/**
 * 서버 컴포넌트 · Server Action · Route Handler에서 쓰는 Supabase 클라이언트.
 *
 * 반드시 사용자 세션 기반이다. service_role로 우회하지 않는다.
 * → 서버 코드에 버그가 있어도 사용자가 볼 수 없는 데이터는 DB가 돌려주지 않는다.
 *
 * 렌더 한 번에 하나만 만든다(React `cache()`). 데이터 함수마다 새로 만들면
 * 화면 하나에 클라이언트가 열댓 개씩 생기는데, 그때마다 GoTrue·PostgREST·
 * Storage·Realtime 클라이언트가 통째로 딸려 온다. 그중 Realtime은 서버에서
 * 쓸 일이 없다. 게다가 인스턴스가 갈리면 토큰 갱신의 단일 비행(single-flight)
 * 보호도 갈려서, 만료 직전에는 열댓 개가 **각자** 갱신을 요청하게 된다.
 *
 * 「요청당」이 아니라 「렌더 한 번당」이다. React의 cache()는 렌더 패스에
 * 묶여 있어서, 서버 액션 본문처럼 렌더 밖에서 부르는 곳에는 캐시가 없다
 * (react-server의 dispatcher가 없으면 그냥 원래 함수를 부른다).
 * 서버 액션 요청 한 건은 「액션 실행 + 이어지는 재렌더」로 나뉘므로
 * 클라이언트가 두 번 만들어진다. 그래도 예전(호출마다 하나)보다는 훨씬 적다.
 *
 * Next.js 16: cookies()는 비동기다.
 */
export const createClient = cache(async () => {
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
});
