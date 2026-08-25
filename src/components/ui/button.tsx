import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * 버튼.
 *
 * · 손가락으로 누르는 크기(44px)를 기본으로 둔다. 시청 민원대에서 태블릿으로도 쓴다.
 * · 포커스 표시는 전역 :focus-visible이 담당한다. 여기서 outline-none을 쓰지 않는다.
 * · 처리 중에는 비활성화한다. 결재·인계처럼 되돌릴 수 없는 동작에서
 *   두 번 눌리는 사고가 실제로 일어나기 때문이다.
 *
 * ── 「누를 수 없는 것」은 옅은 파랑이 아니다 ────────────────────────────────
 *
 * 한동안 여기가 `disabled:opacity-50` 이었다. 두 가지가 함께 틀어진다.
 *
 * ① **색 언어가 거짓말을 한다.** 이 앱의 파랑은 갈래가 하나다 — 「누를 수 있는
 *    것 · 지금 여기」(globals.css 의 4갈래). 상신 단추가 옅은 파랑으로 남아
 *    있으면 그 파랑은 「누를 수 있다」고 말하면서 실제로는 안 눌린다. 투명도는
 *    색을 **약하게** 만들 뿐 **다른 뜻으로** 바꾸지 못한다.
 * ② **글자가 같이 흐려진다.** 흰 글자를 판 위에서 50% 로 섞으면 실측 **2.78:1**
 *    이다. WCAG 1.4.3 은 비활성 조작기를 면제하지만, 이 앱은 사용자에 장애인
 *    공무원이 포함된다고 스스로 적어 둔 공공 시스템이다(globals.css 의 focus
 *    주석). 「왜 안 눌리는지」를 읽을 수 있어야 그 다음을 할 수 있다.
 *
 * 그래서 투명도가 아니라 **색을 바꾼다.** 회색 채움 + gray-70 글자 = **7.07:1**.
 * 네 가지 variant 를 한 줄로 덮으므로 파랑·빨강·테두리·민짜가 전부 같은 모습으로
 * 멈춘다 — 「지금은 못 누른다」는 한 가지 사실이라 모습도 하나여야 한다.
 *
 * (`disabled:` 는 Tailwind 의 변형 순서에서 `hover:`·`active:` 보다 뒤에 놓여
 *  variant 의 색을 덮는다. 순서에 기대는 자리라 tests/contrast.test.mjs 가
 *  「비활성 단추」 쌍을 따로 재고 있다.)
 */

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-sm font-bold whitespace-nowrap",
    "transition-colors duration-150",
    // 글자를 그대로 두고 클래스를 손으로 다 적는다. 여기서 문자열을 조립하면
    // Tailwind 의 정적 훑기가 못 찾아 규칙 자체가 안 만들어진다.
    "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-gray-10 disabled:text-gray-70 disabled:brightness-100",
    "aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-gray-10 aria-disabled:text-gray-70 aria-disabled:brightness-100",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
        secondary:
          // gray-40 은 판 위 2.95:1 로 1.4.11(3:1)에 아슬하게 모자란다. gray-50 은 4.32:1.
          "border border-gray-50 bg-surface text-gray-80 hover:bg-gray-5 active:bg-gray-10",
        ghost: "text-gray-70 hover:bg-gray-5 active:bg-gray-10",
        danger: "bg-danger text-white hover:brightness-90 active:brightness-75",
      },
      size: {
        // 마우스에서는 36px 로 촘촘하게, 손가락에서는 44px 로.
        // 예전에는 여기 「최소 44px」라고 적어 두고 실제로는 36px 이었다.
        // pointer-coarse 는 뷰포트가 아니라 **가리키는 장치**를 본다 — 창을 좁힌
        // 데스크톱은 그대로 두고, 태블릿·휴대폰에서만 커진다.
        sm: "min-h-9 px-3 text-body-sm pointer-coarse:min-h-11",
        md: "min-h-11 px-4 text-body-sm",
        lg: "min-h-12 px-6 text-body",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

type ButtonVariants = VariantProps<typeof button>;

export function Button({
  className,
  variant,
  size,
  block,
  ...props
}: ComponentProps<"button"> & ButtonVariants) {
  return (
    <button
      type="button"
      className={cn(
        button({ variant, size, block }),
        "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 겉모습은 버튼, 동작은 **내려받기.**
 *
 * ── 왜 ButtonLink 로는 안 되는가 ──────────────────────────────────────────
 *
 * 한/글·워드 내보내기 주소는 페이지가 아니라 라우트 핸들러다 — 파일을 돌려주고
 * 화면은 그대로 있어야 한다. 그런데 `next/link` 로 걸어 두면 라우터가 그것을
 * **화면 이동**으로 보고 전환을 시작한다. 서버는 그 사이 hwpx 를 조립하고
 * 있으므로 몇 초가 걸리고, 그동안 본문이 자리표시로 덮인다. 다 만들어져
 * 내려오면 브라우저가 Content-Disposition 을 보고 저장으로 넘기므로 **이동은
 * 결국 일어나지 않는다** — 사용자가 본 것은 「한참 로딩하다가 제자리로 돌아옴」
 * 이고, 실제로 그 화면은 한 번도 갈릴 예정이 없었다.
 *
 * 평범한 `<a download>` 는 라우터를 거치지 않는다. 브라우저가 자기 내려받기
 * 갈래로 처리하므로 화면은 1픽셀도 움직이지 않는다.
 *
 * `download` 와 `data-download` 를 **둘 다** 단다. 앞엣것은 브라우저에게,
 * 뒤엣것은 shell/use-nav-pending.ts 에게 하는 말이다 — 그 훅은 클릭을 캡처
 * 단계에서 세기 때문에 `next/link` 인지 아닌지를 모른다.
 *
 * ※ 파일 이름은 서버가 정한다(Content-Disposition). `download` 에 값을 주면
 *   그 이름이 서버의 것을 덮어써서, 업무 제목으로 짓던 이름이 사라진다.
 */
export function DownloadLink({
  className,
  variant,
  size,
  block,
  ...props
}: ComponentProps<"a"> & ButtonVariants) {
  return (
    <a
      download=""
      data-download=""
      className={cn(button({ variant, size, block }), className)}
      {...props}
    />
  );
}

/** 겉모습은 버튼, 동작은 이동. 이동은 반드시 <a>여야 새 탭 열기가 동작한다. */
export function ButtonLink({
  className,
  variant,
  size,
  block,
  ...props
}: ComponentProps<typeof Link> & ButtonVariants) {
  return (
    <Link
      className={cn(button({ variant, size, block }), className)}
      {...props}
    />
  );
}
