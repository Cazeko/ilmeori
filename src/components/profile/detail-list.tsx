import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 「무엇: 값」이 여러 줄 이어지는 자리.
 *
 * ── 왜 컴포넌트로 빼는가 ───────────────────────────────────────────────────
 *
 * 프로필은 같은 모양의 목록을 세 화면(내 프로필 · 남의 프로필 · 이동 신청)에서
 * 그린다. 화면마다 `flex justify-between` 을 손으로 적으면 **라벨의 끝이
 * 화면마다 다른 자리에 선다** — 하나는 「소속 부서」, 다른 하나는 「직급」이
 * 기준이 되어 값이 들쭉날쭉해진다. 한 화면 안에서만 맞으면 되는 것이 아니라
 * 화면을 옮겨 다닐 때도 같은 자리에 있어야 한다.
 *
 * 그래서 격자로 못박는다. 라벨 열은 **고정폭**이고 값 열이 남는 폭을 갖는다.
 * 좁은 화면에서는 한 열로 접는다 — 320px 에서 6.5rem 을 라벨에 떼어 주면
 * 「전국체전추진단」이 세 줄이 된다.
 *
 * `<dl>` 을 쓰는 이유는 이것이 실제로 정의 목록이기 때문이다. 화면을 보지 않는
 * 사람에게 「소속 부서」와 「전국체전추진단」이 한 쌍이라는 사실은 태그로만 전해진다.
 */

export function DetailList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        // 좁은 화면은 한 열이라 dt·dd 가 번갈아 세로로 선다. 이때 **격자 간격을
        // 주면 안 된다** — 라벨과 값 사이가 값과 다음 라벨 사이와 똑같이 벌어져
        // 어느 값이 어느 라벨의 것인지 눈으로 묶이지 않는다(390px 에서 실제로
        // 그렇게 보였다). 줄 사이는 아래 dt 의 위 여백이 낸다.
        //
        // 넓은 화면은 두 열이라 그 문제가 없다. 라벨 열을 6.5rem 으로 못박아
        // 화면을 옮겨 다녀도 값이 늘 같은 세로선에서 시작하게 한다.
        "grid gap-y-0 sm:grid-cols-[6.5rem_1fr] sm:gap-x-4 sm:gap-y-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}

/**
 * 한 줄.
 *
 * 값이 비어 있으면 `—` 를 찍는다. 줄 자체를 지우지 않는 이유는, 없다는 것도
 * 답이기 때문이다 — 「내선번호」 줄이 통째로 사라지면 보는 사람은 이 사람에게
 * 내선이 없는 것인지 이 화면이 내선을 안 보여 주는 것인지 알 수 없다.
 */
export function DetailRow({
  label,
  children,
  hint,
}: {
  label: string;
  children?: ReactNode;
  /** 값 아래 한 줄. 「왜 이 값이 이런가」를 적는 자리다. */
  hint?: ReactNode;
}) {
  // 조각(Fragment)으로 낸다. `<div className="contents">` 로 감싸도 배치는
  // 같지만, 그러면 dt 가 언제나 그 div 의 **첫 자식**이라 `first:` 가 모든
  // 줄에 걸린다 — 「첫 줄만 위 여백을 빼는」 규칙을 쓸 수 없다.
  return (
    <>
      <dt className="mt-4 text-body-sm text-gray-60 first:mt-0 sm:mt-0 sm:py-1">
        {label}
      </dt>
      <dd className="min-w-0 sm:py-1">
        <span className="block text-body break-keep text-gray-90">
          {children ?? <span className="text-gray-60">—</span>}
        </span>
        {hint ? (
          <span className="mt-1 block text-body-xs text-gray-60">{hint}</span>
        ) : null}
      </dd>
    </>
  );
}
