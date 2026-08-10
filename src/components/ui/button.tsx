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
 */

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-sm font-bold whitespace-nowrap",
    "transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
        secondary:
          "border border-gray-40 bg-surface text-gray-80 hover:bg-gray-5 active:bg-gray-10",
        ghost: "text-gray-70 hover:bg-gray-5 active:bg-gray-10",
        danger: "bg-danger text-white hover:brightness-90 active:brightness-75",
      },
      size: {
        // 최소 44px — 모바일 터치 목표 크기
        sm: "min-h-9 px-3 text-body-sm",
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
      data-variant="button"
      className={cn(button({ variant, size, block }), className)}
      {...props}
    />
  );
}
