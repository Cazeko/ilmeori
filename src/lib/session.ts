import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { departments, profiles } from "@/lib/mock/org";
import { DEMO_COOKIE } from "@/lib/demo-cookie";
import type { Profile } from "@/lib/types";

/**
 * 지금 화면을 보고 있는 사람.
 *
 * 화면 코드는 이 함수만 부른다. 인증 방식이 바뀌어도 고칠 곳은 여기 하나다.
 */

export { DEMO_COOKIE };

const demoById = new Map(profiles.map((p) => [p.id, p]));
const demoDeptById = new Map(departments.map((d) => [d.id, d]));

interface ViewerLoad {
  viewer: Profile | null;
  /** 소속 부서 이름. 화면이 쓰는 건 이름 하나뿐이라 질의를 따로 내지 않는다. */
  departmentName: string | null;
}

/**
 * 신원 해석 — 렌더 한 번에 **딱 한 번만** 돈다.
 *
 * React `cache()`가 없던 시절에는 레이아웃·generateMetadata·페이지 본문이
 * 각자 이 일을 다시 했다. 업무 상세 한 장을 그리는 데 신원 확인만 왕복 7회가
 * 나갔다(getUser 4회 + profile 조회 3회). 지금은 profile 조회 한 번이다 —
 * 서명 검증은 네트워크를 타지 않고, 부서 이름은 그 조회에 얹혀 온다.
 *
 * 범위는 「요청」이 아니라 「렌더 패스」다. React의 cache()가 그렇게 동작한다.
 *   · GET 렌더  — 레이아웃·generateMetadata·페이지가 한 패스라 1회
 *   · 서버 액션 — 액션 본문은 렌더 밖이라 캐시가 없고, 이어지는 재렌더가
 *                 또 한 패스다. 그래서 한 요청에 2회까지 돈다
 * 어느 쪽이든 요청이 끝나면 사라지므로 다른 사용자에게 새지 않는다.
 */
const loadViewer = cache(async (): Promise<ViewerLoad> => {
  if (isSupabaseConfigured) {
    const supabase = await createClient();

    // getUser()가 아니라 getClaims()를 쓴다.
    //
    // 이 프로젝트의 액세스 토큰은 ES256으로 서명되고 JWKS가 공개되어 있다.
    // 그래서 서명 검증을 **이 프로세스 안에서** 끝낼 수 있다 — Auth 서버로
    // 나가는 왕복이 사라진다(실측 23.7ms → 6.3ms, 유휴 직후라면 145ms → 7ms).
    // JWKS는 auth-js가 프로세스 전역에 10분간 캐시한다.
    //
    // getClaims()는 만료(exp)도 검사하고, 서명이 어긋나면 거절한다.
    // 검증할 수 없는 알고리즘(HS256)이면 스스로 getUser()로 되돌아간다.
    //
    // 대신 포기하는 것이 하나 있다 — 서버에서 폐기한 세션을 즉시 알아채지 못한다.
    // 로그아웃·정지된 계정이 토큰 만료까지는 이 검사를 통과한다. 그래서
    // 아래 profile 조회로 is_active를 매번 확인하고, 실제 데이터 접근은
    // RLS가 막는다. 「검사를 한 층 줄인 것」이 아니라 「검사를 옮긴 것」이다.
    // 읽을 수 없는 쿠키는 「로그인하지 않음」이다. getClaims()는 AuthError가
    // 아닌 예외(예: `Invalid alg claim`)를 그대로 던지는데, 쿠키는 사용자가
    // 보내는 값이라 안 잡으면 조작된 쿠키 하나로 화면이 통째로 500이 된다.
    let userId: string | undefined;
    try {
      const { data } = await supabase.auth.getClaims();
      userId = data?.claims?.sub;
    } catch {
      userId = undefined;
    }
    if (!userId) return { viewer: null, departmentName: null };

    // 로그인했다는 것과 이 시스템의 직원이라는 것은 다르다.
    // profile 행이 없으면 들어올 자격이 없는 계정이다.
    const { data } = await supabase
      .from("profile")
      // rank 를 빠뜨리면 안 된다. 타입은 `data as Profile` 로 넘어가지만 실제 값은
      // undefined 가 되고, 결재선 자동 생성이 「나보다 위인 사람」을 한 명도 찾지
      // 못한다(rank 비교가 전부 false 가 된다). 화면은 오류 없이 빈 결재선을 준다.
      //
      // department 는 임베드로 함께 받는다. 레이아웃이 부서 이름 하나를 얻자고
      // 질의를 한 번 더 내던 것을 없앤다.
      .select(
        "id, name, department_id, position, rank, email, avatar_url, is_active, is_demo, department:department_id(name)",
      )
      .eq("id", userId)
      .maybeSingle();

    // 퇴직·휴직 처리된 계정은 세션이 남아 있어도 들여보내지 않는다.
    if (!data || !data.is_active) return { viewer: null, departmentName: null };

    // 1:1 임베드는 객체로 온다(WORK_SELECT의 members.profile.department와 같은 모양).
    // supabase-js는 생성 타입 없이는 배열로 추론하므로 unknown을 거쳐 좁힌다.
    const { department, ...profile } = data as unknown as Profile & {
      department: { name: string } | null;
    };
    return { viewer: profile, departmentName: department?.name ?? null };
  }

  // ── 데모 모드 ──────────────────────────────────────────────────────────
  // 쿠키 값은 절대 믿지 않고 목업에 실재하는 계정인지 대조한 뒤에만 쓴다.
  // 임의의 UUID를 넣어 남의 계정을 흉내 내는 경로를 여기서 끊는다.
  const store = await cookies();
  const id = store.get(DEMO_COOKIE)?.value;
  if (!id) return { viewer: null, departmentName: null };

  const viewer = demoById.get(id) ?? null;
  if (!viewer) return { viewer: null, departmentName: null };

  return {
    viewer,
    departmentName: viewer.department_id
      ? (demoDeptById.get(viewer.department_id)?.name ?? null)
      : null,
  };
});

export async function getViewer(): Promise<Profile | null> {
  return (await loadViewer()).viewer;
}

/**
 * 지금 보고 있는 사람의 소속 부서 이름.
 *
 * 신원 조회에 얹혀 오므로 왕복이 0이다. 부서 정보 전체가 필요한 화면은
 * 이걸 쓰지 말고 `getDepartment()`를 부를 것.
 */
export async function getViewerDepartmentName(): Promise<string | null> {
  return (await loadViewer()).departmentName;
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
