import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateContact } from "@/lib/actions/profile";
import type { ProfileView } from "@/lib/types";

/**
 * 연락처 고치기 — 프로필에서 본인이 바꿀 수 있는 전부.
 *
 * ── 폼은 하나, 저장되는 곳은 둘 ────────────────────────────────────────────
 *
 * 내선은 profile 의 칸이고 휴대는 profile_contact 의 행이다. 나눈 이유는
 * 「본인이 공개한 경우에만」이라는 규칙을 정책으로 쓰려면 행이어야 하기
 * 때문인데(0023), 그건 우리 사정이지 쓰는 사람의 사정이 아니다.
 * 사람에게는 「내 연락처」 한 덩어리이므로 저장 단추도 하나다.
 *
 * ── 스크립트 없이 동작한다 ─────────────────────────────────────────────────
 *
 * 평범한 `<form action={서버액션}>` 이다. 체크상자도 `<input type=checkbox>`
 * 그대로라 브라우저가 알아서 처리하고, 제출은 303 + Location 으로 끝난다.
 * 결과는 주소의 ?msg= 가 나르고 화면 위 ActionFeedback 이 읽는다.
 */
export function ContactForm({ view }: { view: ProfileView }) {
  const { phone_ext: phoneExt, contact } = view;

  return (
    <Card>
      <CardHeader
        title="연락처"
        description="여기 두 칸만 본인이 고칠 수 있습니다."
      />
      <CardBody>
        <form action={updateContact} className="flex flex-col gap-6">
          <Field
            id="phone-ext"
            label="내선번호"
            hint="행정전화번호부와 같습니다 — 재직자 전원에게 보입니다."
          >
            {(field) => (
              <Input
                {...field}
                name="phoneExt"
                type="tel"
                inputMode="tel"
                defaultValue={phoneExt ?? ""}
                placeholder="031-000-2001"
                maxLength={20}
                /* 브라우저가 서버까지 가기 전에 먼저 막는다. DB 의 check 제약과
                   같은 정규식이고(0023 · actions/profile.ts), 셋이 어긋나면
                   가장 느슨한 것이 실제 규칙이 된다. */
                pattern="[0-9][0-9\-]{2,19}"
                autoComplete="tel-extension"
              />
            )}
          </Field>

          <Field
            id="mobile"
            label="휴대전화"
            hint="기본은 비공개입니다. 아래를 켜야 남에게 보입니다. 칸을 비우고 저장하면 등록한 적 없는 상태로 돌아갑니다."
          >
            {(field) => (
              <Input
                {...field}
                name="mobile"
                type="tel"
                inputMode="tel"
                defaultValue={contact?.mobile ?? ""}
                placeholder="010-0000-0000"
                maxLength={13}
                pattern="01[016789]\-[0-9]{3,4}\-[0-9]{4}"
                autoComplete="tel"
              />
            )}
          </Field>

          {/* 체크상자는 라벨로 감싼다. 그래야 글자를 눌러도 켜지고, 손가락이
              닿는 넓이가 11px 상자가 아니라 줄 전체가 된다. */}
          <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-rule-hair bg-gray-5 px-4 py-3">
            <input
              type="checkbox"
              name="mobilePublic"
              defaultChecked={contact?.is_public ?? false}
              className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-body-sm font-bold text-gray-90">
                휴대전화를 전 직원에게 공개합니다
              </span>
              <span className="mt-1 block text-body-xs text-gray-60">
                끄면 남의 화면에서는 번호가 사라질 뿐 아니라, 번호를 등록했다는
                사실 자체가 보이지 않습니다.
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <SubmitButton pendingLabel="저장하는 중…">저장</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
