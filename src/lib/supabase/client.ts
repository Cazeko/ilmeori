"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/env";

/**
 * 브라우저용 Supabase 클라이언트.
 *
 * 실시간 협업(Realtime 구독·접속자 표시)에만 사용한다.
 * 데이터 변경은 Server Action을 거치게 해 서버에서 한 번 더 검증한다.
 *
 * anon key가 번들에 노출되는 것은 설계상 정상이다. 접근제어는 RLS가 수행한다.
 * 세션 토큰은 httpOnly 쿠키에 있으며 localStorage에 두지 않는다(XSS 시 탈취 방지).
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
