import Link from "next/link";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ProfileFacts } from "@/components/profile/profile-facts";
import { PersonCardKeys } from "./person-card-keys";
import type { ProfileView } from "@/lib/types";

/**
 * 조직도에서 이름을 누르면 떠 있는 작은 창.
 *
 * ── 주소가 여는 창이다. 그래서 스크립트가 없어도 열린다 ────────────────────
 *
 * 이 창은 `?person=<id>` **한 칸으로만** 열리고 닫힌다. 이름은 링크이고,
 * 덮개와 닫기 단추도 링크다. 열고 닫는 일에 자바스크립트가 한 줄도 끼지
 * 않는다는 뜻이다 — 이 제품의 화면은 전부 그래야 한다(tests/browser.test.mjs).
 *
 * 대신 서버 왕복이 한 번 든다. 그 값으로 얻는 것이 둘 있다.
 *
 *   1. **안 띄운 사람의 번호는 HTML 에 실리지 않는다.** 스무 명분 카드를 미리
 *      그려 두고 CSS 로 감추는 방법이 더 빠르지만, 그러면 조직도 한 장에
 *      전 직원의 연락처가 통째로 실려 나간다. 감춘 것은 감춘 것이지 안 준 것이
 *      아니다.
 *   2. **판정하는 자리가 하나로 남는다.** 창이 받는 값은 프로필 화면과 똑같은
 *      `getProfileView` 의 결과다. 비공개 휴대전화를 거르는 규칙이 조직도용으로
 *      한 벌 더 생기지 않는다(0023 의 profile_contact 정책과 같은 판정).
 *
 * ── 뜨는 것을 그림자로 말하지 않는다 ───────────────────────────────────────
 *
 * 이 디자인에 그림자는 없다(DESIGN.md §7 — 종이는 뜨지 않는다). 떠 있다는
 * 사실은 **뒤를 덮어서** 말한다. 좁은 화면의 서랍이 쓰는 것과 같은 덮개다
 * (app-shell.tsx 의 `bg-gray-100/40`, z-30).
 *
 * 그 덮개 자체가 **닫는 링크**다. 바깥을 눌러 닫는 동작을 스크립트 없이 얻는
 * 유일한 방법이고, 키보드로는 닿지 않아야 하므로(닫는 수단은 아래 ✕ 단추가
 * 이미 있다) `tabIndex={-1}` 로 순서에서 뺀다.
 */

/** 닫기 단추의 id. 아래 PersonCardKeys 가 이 이름으로 찾아 포커스를 옮긴다. */
const CLOSE_ID = "person-card-close";

export function PersonCard({
  view,
  closeHref,
  triggerId,
}: {
  /** 못 찾았으면 null — 없는 사람과 못 보는 사람을 화면은 구분하지 않는다. */
  view: ProfileView | null;
  /** 닫으면 갈 주소. 찾기 조건과 눌렀던 자리를 그대로 들고 돌아간다. */
  closeHref: string;
  /** 이 창을 연 이름표의 id. 닫을 때 포커스를 되돌릴 자리다. */
  triggerId: string;
}) {
  const titleId = "person-card-title";

  return (
    <>
      {/* 덮개. 링크라서 누르면 닫힌다 — 스크립트가 없어도 그렇다. */}
      <Link
        href={closeHref}
        aria-hidden
        tabIndex={-1}
        className="fixed inset-0 z-30 block bg-gray-100/40 animate-scrim-in print:hidden"
      />

      {/* 자리를 잡는 층. `pointer-events-none` 이라 창 바깥을 누르면 손짓이
          아래 덮개로 그대로 내려간다 — 투명한 단추를 따로 깔지 않는다.
          좁은 화면에서는 아래에 붙는 시트, 넓은 화면에서는 가운데 창이다.
          어느 쪽이든 화면 가장자리에서 16px 이상 띄운다. 가장자리에 딱 붙은
          상자는 떠 있는 것이 아니라 잘린 것으로 읽힌다. */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6 print:hidden">
        <section
          role="dialog"
          aria-labelledby={titleId}
          // 넓은 화면의 창은 rise-in 으로 자리를 잡는다(덮개와 같은 프레임에).
          // 좁은 화면의 시트에는 붙이지 않는다 — rise-in 은 위에서 내려오는
          // 움직임인데 시트는 아래에서 온다. 출처와 다른 방향으로 나타나느니
          // 덮개만 스며 나오는 편이 낫다. 움직임을 줄인 환경에서는 globals.css
          // 가 둘 다 크로스페이드로 바꾼다.
          className="pointer-events-auto flex max-h-full w-full flex-col overflow-y-auto rounded-sm border border-rule-frame bg-surface sm:max-w-md sm:animate-rise-in"
        >
          {/* 스크립트가 있을 때만 얹히는 층 — Esc 로 닫고, 포커스를 옮기고,
              닫을 때 눌렀던 이름표로 되돌린다. 없으면 아래 ✕ 가 전부 한다. */}
          <PersonCardKeys
            closeHref={closeHref}
            triggerId={triggerId}
            closeId={CLOSE_ID}
          />

          <div className="flex items-start justify-between gap-3 border-b border-rule-hair p-4">
            <div className="flex min-w-0 items-center gap-3">
              {view ? (
                <Avatar profile={view.profile} size="lg" me={view.isMe} />
              ) : null}
              {/* 소속은 여기 적지 않는다. 바로 아래 목록의 첫 줄이 「소속 부서」라,
                  적으면 한 창에 같은 부서명이 두 번 나온다(identity-card 가 같은
                  이유로 description 을 뺐다). */}
              <h2
                id={titleId}
                className="min-w-0 text-h3 font-bold break-keep text-gray-90"
              >
                {view ? view.profile.name : "그런 직원이 없습니다"}
                {view?.profile.position ? (
                  <span className="ml-2 text-body-sm font-normal text-gray-60">
                    {view.profile.position}
                  </span>
                ) : null}
              </h2>
            </div>

            {/* 아이콘만 있는 단추라 이름은 sr-only 로 준다. 44px 표적. */}
            <Link
              id={CLOSE_ID}
              href={closeHref}
              className="-m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-gray-60 transition-colors duration-150 hover:bg-gray-5 hover:text-gray-90 active:bg-gray-10"
            >
              <X aria-hidden className="size-5" />
              <span className="sr-only">닫기</span>
            </Link>
          </div>

          <div className="p-4">
            {view ? (
              <ProfileFacts view={view} />
            ) : (
              <p className="text-body break-keep text-gray-60">
                주소가 잘못되었거나, 지금은 재직 중이 아닌 계정입니다.
              </p>
            )}
          </div>

          {view ? (
            <div className="border-t border-rule-hair p-4">
              {/* 이 창은 읽는 자리다. 고치는 일은 「내 프로필」에서만 한다 —
                  연락처 폼과 이동 신청을 여기 넣으면, 조직도를 훑다가 실수로
                  누른 폼이 화면 밖으로 사라진 뒤에 제출된다. */}
              <Link
                href={view.isMe ? "/me" : `/people/${view.profile.id}`}
                className="text-body-sm font-bold text-primary transition-colors duration-150 hover:underline"
              >
                {view.isMe
                  ? "내 프로필에서 연락처 고치기"
                  : `${view.profile.name} 프로필 화면으로`}
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
