"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/env";

/**
 * 브라우저용 Supabase 클라이언트.
 *
 * 실시간 공유(구독·접속자 표시)에만 쓴다. 여기서 데이터를 고치지 않는다 —
 * 변경은 전부 Server Action을 거쳐 서버에서 한 번 더 확인한다.
 *
 * anon key가 번들에 노출되는 것은 설계상 정상이다. 접근제어는 RLS가 수행한다.
 *
 * ── 세션 쿠키에 대하여 ──────────────────────────────────────────────────────
 *
 * 세션 토큰은 localStorage가 아니라 쿠키에 있다. 다만 이 쿠키는 **httpOnly가
 * 아니다**(@supabase/ssr의 DEFAULT_COOKIE_OPTIONS가 httpOnly:false다).
 * 그래야 하는 이유가 있다 — 브라우저가 실시간 채널에 붙을 때 자기 토큰을 읽어야
 * 하기 때문이다. httpOnly로 바꾸면 오류가 나는 것이 아니라 anon 키로 조용히
 * 물러나 익명으로 붙고, private 채널이 거부한다.
 *
 * 그래서 XSS가 나면 이 토큰은 읽힌다. 그 대비는 쿠키 속성이 아니라 CSP다
 * (src/proxy.ts의 nonce + strict-dynamic). 여기 적어 두는 이유는, 예전 주석이
 * "httpOnly라 XSS에 안전하다"고 적고 있었고 그건 사실이 아니었기 때문이다.
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
