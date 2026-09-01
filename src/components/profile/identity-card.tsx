import { Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList, DetailRow } from "./detail-list";
import type { ProfileView } from "@/lib/types";

/**
 * 프로필 한 장 — 내 것이든 남의 것이든 **같은 카드**가 그린다.
 *
 * ── 왜 하나로 두는가 ───────────────────────────────────────────────────────
 *
 * 내 프로필과 남의 프로필을 따로 만들면 두 화면이 서로 다른 것을 보여 주기
 * 시작한다. 그 어긋남이 가장 위험한 자리가 **휴대전화**다 — 「내가 보는 내
 * 번호」와 「남이 보는 내 번호」가 다른 화면에서 그려지면, 공개 설정을 껐는데도
 * 남의 화면에 남아 있는 상태를 아무도 알아채지 못한다.
 *
 * 한 카드로 두면 그런 갈래가 생길 수 없다. 조회층이 이미 정책과 같은 판정을
 * 마치고 `contact` 를 채우거나 비워서 준다(data/index.ts 의 getProfileView).
 * 이 파일은 **온 것을 그리기만 한다** — 여기에 `isMe` 로 값을 고르는 분기가
 * 하나도 없는 것이 그 증거다.
 *
 * ── 이 화면이 화면당 하나뿐인 「문서」다 ────────────────────────────────────
 *
 * 프로필 화면에서 1등은 「이 사람이 누구인가」이고, 그 아래 서는 연락처 폼과
 * 이동 신청은 그것에 딸린 것이다(card.tsx 의 세 등급).
 */
export function IdentityCard({ view }: { view: ProfileView }) {
  const { profile, phone_ext: phoneExt, contact, isMe } = view;

  return (
    <Card variant="doc">
      <CardHeader
        variant="doc"
        as="h1"
        title={
          <span className="flex items-center gap-3">
            <Avatar profile={profile} size="lg" me={isMe} />
            <span className="min-w-0">
              {profile.name}
              {profile.position ? (
                <span className="ml-2 text-h3 font-normal text-gray-60">
                  {profile.position}
                </span>
              ) : null}
            </span>
          </span>
        }
        /* 소속을 여기 description 으로도 적었었다. 바로 아래 목록의 첫 줄이
           「소속 부서 · 전국체전추진단」이라, 한 카드에 같은 부서명이 두 번
           나왔다. 라벨이 붙은 아래쪽이 남는다 — 이 화면에서 소속은 그냥
           딸린 설명이 아니라 **못 고치는 칸 중 하나**이고, 그 사실은 다른
           칸들과 나란히 서야 읽힌다. */
      />
      <CardBody variant="doc">
        <DetailList>
          <DetailRow label="소속 부서">
            {profile.department_name ?? (
              <span className="text-gray-60">소속 없음</span>
            )}
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

        {/* 「왜 못 고치는가」를 카드 안에서 답한다. 이 말이 없으면 사람은
            고칠 칸을 찾다가 못 찾고, 화면이 덜 만들어진 것으로 읽는다. */}
        <p className="mt-6 flex items-start gap-2 border-t border-rule-hair pt-4 text-body-xs text-gray-60">
          <Lock aria-hidden className="mt-1 size-4 shrink-0" />
          <span>
            소속·직급·이메일은 인사 데이터라 본인이 바꿀 수 없습니다. 데이터베이스가
            그렇게 막고 있습니다 — 소속을 스스로 바꿀 수 있으면 그 부서의 업무가
            함께 열리기 때문입니다.
            {isMe ? " 소속은 아래에서 이동을 신청하면 승인 뒤에 바뀝니다." : null}
          </span>
        </p>
      </CardBody>
    </Card>
  );
}
