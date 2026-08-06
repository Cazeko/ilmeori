import { z } from "zod";

/**
 * 환경변수 검증.
 *
 * 잘못된 환경변수는 배포 직후 런타임에서 조용히 터진다. 심사 당일에 그 일이 일어나면
 * 복구할 시간이 없으므로, 시작 시점에 즉시 실패시킨다.
 *
 * 명명 규칙: NEXT_PUBLIC_ 접두사가 붙은 값만 브라우저 번들에 포함된다.
 * 그 외 값은 어떤 경우에도 클라이언트 컴포넌트에서 import하지 않는다.
 *
 * ── 데모 모드 ──────────────────────────────────────────────────────────────
 * Supabase 설정이 없으면 앱은 목업 데이터로 동작한다. 두 가지 이유에서다.
 *
 *   1) 화면을 만드는 동안 DB 연결을 기다릴 이유가 없다.
 *   2) 심사위원이 여는 주소에는 실제 공문서가 단 한 건도 없어야 한다.
 *      "가상 데이터만 넣었습니다"라고 말하는 것보다,
 *      애초에 실제 데이터가 들어갈 경로가 없는 편이 확실하다.
 *
 * 값이 **있으면** 형식은 그대로 엄격히 검사한다. 반쯤 설정된 상태가 제일 위험하다.
 */

const optionalUrl = z
  .string()
  .url("NEXT_PUBLIC_SUPABASE_URL이 올바른 URL이 아닙니다.")
  .optional();

// anon key는 공개되어도 안전하다. 실제 접근제어는 DB의 RLS가 수행한다.
const optionalKey = z
  .string()
  .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY가 너무 짧습니다.")
  .optional();

const raw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
};

const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalKey,
  })
  .refine(
    (v) =>
      Boolean(v.NEXT_PUBLIC_SUPABASE_URL) ===
      Boolean(v.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      message:
        "Supabase URL과 anon key는 둘 다 있거나 둘 다 없어야 합니다. 한쪽만 설정된 상태로는 실행하지 않습니다.",
    },
  )
  .parse(raw);

export const publicEnv = parsed;

/** Supabase에 연결되어 있는가. false면 목업 데이터로 동작한다. */
export const isSupabaseConfigured =
  Boolean(parsed.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * 고치는 기능을 열 것인가 — 데모 모드는 **읽기 전용**이다.
 *
 * 데모 모드의 변경분은 브라우저 쿠키에 담긴다. 쿠키 한 개의 상한은 4KB이고,
 * 한글은 한 글자가 3바이트다. 업무 한 건, 문서 한 판, 참여자 목록을 담기 시작하면
 * 몇 번 만에 넘치고, 브라우저는 넘친 쿠키를 **조용히 통째로 버린다.**
 * 방금 만든 업무가 새로고침하면 사라지는 화면은 없는 것만 못하다.
 *
 * 그래서 쓰기는 DB가 있을 때만 연다. 데모 모드는 "DB가 끊겨도 화면은 보여 준다"는
 * 대비책으로 남기고, 그때 고치는 버튼은 아예 그리지 않는다.
 * 눌리지 않는 버튼을 보여 주느니 없는 편이 낫다.
 *
 * 기존 데모 기능(상태 변경·대화 남기기·인계 진행)은 그대로 둔다. 이미 쿠키에
 * 들어가는 크기로 맞춰져 있고, 시연 동선이 거기에 걸려 있다.
 */
export const canMutate = isSupabaseConfigured;

/**
 * Supabase 클라이언트를 만들 때 쓰는 값. 설정되지 않았으면 호출 자체가 잘못이다.
 * 조용히 빈 문자열을 넘기면 연결 실패가 인증 실패처럼 보여 원인을 찾기 어려워진다.
 */
export function requireSupabaseEnv() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase가 설정되지 않았습니다. 데모 모드에서는 Supabase 클라이언트를 만들지 않습니다.",
    );
  }
  return {
    url: parsed.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

/**
 * service_role 키에 대하여
 *
 * 이 프로젝트는 service_role 키를 애플리케이션 코드에서 사용하지 않는다.
 * service_role은 RLS를 전면 우회하므로, 한 번이라도 쓰기 시작하면
 * "권한은 DB가 강제한다"는 설계 전제가 무너진다.
 *
 * Server Action에서도 사용자 세션 기반 클라이언트만 사용한다.
 * 시드 데이터 주입 등 관리 작업은 애플리케이션이 아니라 SQL 마이그레이션으로 처리한다.
 */
