"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * 겉모습이 버튼이 아닌 제출 버튼(카드·행 전체가 눌리는 것)에 눌린 표시를 준다.
 *
 * Button 을 쓰지 않는 자리라 SubmitButton 으로는 모양이 안 맞는다. 여기서는
 * 클래스를 그대로 받고 pending 일 때 흐리게 + 다시 못 누르게만 얹는다.
 *
 * 로그인 화면의 계정 카드가 이걸 쓴다. 로그인은 이 앱에서 사람이 처음 누르는
 * 것이고, 지금까지는 눌러도 아무 일도 일어나지 않는 것처럼 보였다.
 */
export function PendingCardButton({
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"button">) {
  const { pending } = useFormStatus();

  return (
    <button
      // {...props} 를 먼저 펼친다. 뒤에 두면 호출자가 넘긴 disabled·type 이
      // 이중 제출 가드를 덮어쓴다 — 가드가 있는 줄 알고 없는 상태가 된다.
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={cn(
        className,
        pending && "cursor-progress opacity-60",
        "disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
