import type { MemberRole, Profile, WorkListItem } from "@/lib/types";
import { ROLE_LABEL, VISIBILITY_LABEL } from "@/lib/types";

/**
 * 「이 업무가 왜 나에게 보이는가」를 문장으로 만든다.
 *
 * 접근제어를 화면에서 **확인 가능한 주장**으로 만들기 위한 것이다.
 * "RLS 정책 67개를 통과했습니다"는 발표자료의 문장이고, 문장은 누구나 쓴다.
 * 눈앞의 업무 하나를 두고 "당신에게 보이는 이유는 이것이고, 다른 계정으로
 * 같은 주소를 열면 없다고 답합니다"까지 가야 확인 가능한 주장이 된다.
 *
 * 판정 순서는 supabase/migrations/0002_rls.sql 의 app.can_read_work() 와 **같다.**
 *
 *   1) 참여자인가
 *   2) 부서 공개이고 내 소속 부서인가
 *   3) 전체 공개인가
 *
 * 여기서 계산한 것은 설명이지 통제가 아니다. 실제로 막는 것은 DB이고,
 * 이 함수가 불릴 때는 이미 DB가 그 행을 내어 준 뒤다.
 * 그래서 어느 갈래에도 걸리지 않는 경우는 정상 경로에 존재하지 않는다.
 */

export type VisibilityReason = {
  /** 접힌 상태에서 한 줄로 보여 줄 짧은 말 */
  short: string;
  /** 펼쳤을 때의 설명 */
  long: string;
  /** 공개 범위가 이 업무를 누구까지 열어 두는가 */
  scope: string;
  /**
   * 계정을 바꿔 같은 주소를 열면 「없음」이 나올 수 있는가.
   * 전체 공개 업무는 어느 계정으로 열어도 보이므로 여기서 false가 된다.
   * 이 값을 보고 화면이 문구를 바꾼다 — 안 되는 것을 된다고 말하지 않기 위해서다.
   */
  deniable: boolean;
};

export function whyVisible(
  work: Pick<WorkListItem, "visibility" | "department_id" | "department"> & {
    members: WorkListItem["members"];
  },
  viewer: Profile,
  role: MemberRole | null,
): VisibilityReason {
  const memberCount = work.members.length;
  const deniable = work.visibility !== "city";

  const scope =
    work.visibility === "private"
      ? `공개 범위가 「${VISIBILITY_LABEL.private}」이라, 참여자 ${memberCount}명 밖에서는 주소를 알아도 열리지 않습니다.`
      : work.visibility === "department"
        ? `공개 범위가 「${VISIBILITY_LABEL.department}」라, ${work.department.name} 직원과 참여자 ${memberCount}명에게만 열립니다.`
        : `공개 범위가 「${VISIBILITY_LABEL.city}」라, 시 전체 직원이 볼 수 있습니다.`;

  if (role) {
    return {
      short: `참여자(${ROLE_LABEL[role]})로 추가되어 있습니다`,
      long: `이 업무의 참여자 ${memberCount}명 가운데 한 사람이고, 권한은 「${ROLE_LABEL[role]}」입니다. 참여자는 소속 부서와 관계없이 볼 수 있습니다 — 부서를 넘는 협업이 이 제품의 전제이기 때문입니다.`,
      scope,
      deniable,
    };
  }

  if (
    work.visibility === "department" &&
    viewer.department_id === work.department_id
  ) {
    return {
      short: `${work.department.name} 소속이기 때문입니다`,
      long: `참여자로 추가되어 있지는 않지만, 이 업무의 소관 부서인 ${work.department.name} 소속이라 열람할 수 있습니다. 고치지는 못합니다 — 부서 공개는 열람까지입니다.`,
      scope,
      deniable,
    };
  }

  if (work.visibility === "city") {
    return {
      short: "전 직원에게 공개된 업무입니다",
      long: "참여자도 소관 부서도 아니지만, 공개 범위가 「전체 공개」라 시 전체 직원이 열람할 수 있습니다. 부서 간 협업 상황을 누구나 볼 수 있게 열어 둔 업무입니다.",
      scope,
      deniable,
    };
  }

  // DB가 이미 내어 준 행이므로 여기까지 오지 않는다. 와 버렸다면 화면의 설명이
  // 정책과 어긋난 것이므로, 그럴듯한 문장을 지어내지 않고 그 사실을 말한다.
  return {
    short: "확인할 수 없습니다",
    long: "이 화면의 설명 규칙으로는 열람 사유를 판정하지 못했습니다. 열람 자체는 DB의 정책이 허용한 것입니다.",
    scope,
    deniable,
  };
}
