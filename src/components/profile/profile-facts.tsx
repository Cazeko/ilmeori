import { DetailList, DetailRow } from "./detail-list";
import type { ProfileView } from "@/lib/types";

/**
 * 「이 사람이 누구인가」 — 값을 늘어놓는 다섯 줄.
 *
 * ── 왜 카드에서 떼어냈는가 ─────────────────────────────────────────────────
 *
 * 이 다섯 줄을 그리는 자리가 셋이 되었다 — 내 프로필, 남의 프로필,
 * 조직도에서 이름을 눌렀을 때 뜨는 카드. identity-card.tsx 가 애초에 「내 것과
 * 남의 것을 한 카드가 그린다」고 못박아 둔 이유가 그대로 여기에도 걸린다.
 *
 * 갈라 두면 **가장 먼저 어긋나는 자리가 휴대전화**다. 공개 설정을 껐는데도
 * 어느 한 화면에만 번호가 남아 있는 상태를, 두 벌로 적힌 코드에서는 아무도
 * 알아채지 못한다. 판정은 이미 조회층이 끝냈고(data/index.ts 의 getProfileView),
 * 이 파일은 **온 것을 그리기만 한다** — `isMe` 로 값을 고르는 분기가 하나도
 * 없는 것이 그 증거다. `isMe` 는 곁말(hint)에만 쓴다.
 */
export function ProfileFacts({ view }: { view: ProfileView }) {
  const { profile, phone_ext: phoneExt, contact, isMe } = view;

  return (
    <DetailList>
      <DetailRow label="소속 부서">
        {profile.department_name ?? <span className="text-gray-60">소속 없음</span>}
      </DetailRow>
      <DetailRow label="직급">{profile.position}</DetailRow>
      <DetailRow label="이메일">
        {/* 주소는 줄바꿈이 안 되는 긴 글자다. 320px 화면에서 칸을 밀어내지
            않도록 어디서든 끊기게 둔다. */}
        <span className="break-all">{profile.email}</span>
      </DetailRow>
      <DetailRow
        label="내선번호"
        hint={
          // 「빈칸」과 「아직 물어볼 수 없다」는 다른 사실이다. 지어내지 않는다.
          view.pendingMigration ? "아직 조회할 수 없습니다." : undefined
        }
      >
        {phoneExt}
      </DetailRow>
      <DetailRow
        label="휴대전화"
        hint={
          view.pendingMigration
            ? "아직 조회할 수 없습니다."
            : isMe
              ? contact
                ? contact.is_public
                  ? "전 직원이 볼 수 있습니다."
                  : "나만 볼 수 있습니다. 남의 화면에는 등록 여부조차 보이지 않습니다."
                : "등록하지 않았습니다."
              : undefined
        }
      >
        {contact ? (
          contact.mobile
        ) : isMe || view.pendingMigration ? undefined : (
          // 남의 화면에서는 「없음」과 「비공개」를 구분해 말하지 않는다.
          // 정책이 비공개 행을 주지 않으므로 화면은 애초에 둘을 구분할
          // 수단이 없고, 지어내서 말하면 그건 거짓말이다(0023).
          <span className="text-gray-60">공개하지 않았습니다</span>
        )}
      </DetailRow>
    </DetailList>
  );
}
