import { z } from "zod";

/**
 * 환경변수 검증.
 *
 * 잘못된 환경변수는 배포 직후 런타임에서 조용히 터진다. 심사 당일에 그 일이 일어나면
 * 복구할 시간이 없으므로, 시작 시점에 즉시 실패시킨다.
 *
 * 명명 규칙: NEXT_PUBLIC_ 접두사가 붙은 값만 브라우저 번들에 포함된다.
 * 그 외 값은 어떤 경우에도 클라이언트 컴포넌트에서 import하지 않는다.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL이 올바른 URL이 아닙니다."),
  // anon key는 공개되어도 안전하다. 실제 접근제어는 DB의 RLS가 수행한다.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY가 비어 있습니다."),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

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
