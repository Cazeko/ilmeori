import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 입력 한 칸.
 *
 * 규칙 몇 가지를 컴포넌트 차원에서 못박는다. 화면마다 다시 지키게 두면 반드시 빠진다.
 *   · 라벨은 항상 보인다. placeholder를 라벨 대신 쓰지 않는다.
 *     (입력을 시작하면 사라져서, 무엇을 적던 칸인지 알 수 없게 된다)
 *   · 오류 문구는 그 칸 바로 아래에 붙고 role="alert"로 읽힌다.
 *   · 오류를 빨간 테두리로만 알리지 않는다. 색을 구분하지 못하면 아무 표시도 없는 셈이다.
 *   · 필수 표시는 별표 하나로 끝내지 않고 "필수"라고 적는다.
 */

const controlBase = [
  "w-full rounded-sm border bg-surface text-body text-gray-90",
  "placeholder:text-gray-60",
  "transition-colors duration-150",
  "disabled:cursor-not-allowed disabled:bg-gray-5 disabled:text-gray-50",
];

/*
 * ── 오류를 어디에 적는가 ─────────────────────────────────────────────────
 * 아래 error 프롭은 「칸 옆에 붙는 오류」를 위한 자리인데, 지금 저장소에서
 * 이것을 넘기는 곳은 한 군데도 없다. 실제 실패 경로는 서버 액션이 ?msg= 를
 * 달고 되돌려보내고 화면 맨 위 ActionFeedback 이 한 줄로 말하는 한 갈래뿐이다.
 * 그래서 「어느 칸이 문제인지」는 지금 화면이 말해 주지 못한다.
 *
 * 여기에 배선을 새로 넣는 대신, 서버까지 갔다 오지 않고 브라우저가 먼저 막을
 * 수 있는 것은 그 자리에서 막는다(work-form·approval-fields 의 pattern).
 * 이 프롭은 그 배선이 생기는 날을 위해 남겨 둔다.
 *
 * ── 테두리 대비 ──────────────────────────────────────────────────────────
 * 입력칸 테두리는 gray-30 이었다. 판(#fafafa) 위에서 대비가 1.92:1 이라
 * KWCAG 2.2 / WCAG 1.4.11「비텍스트 대비」의 3:1 에 못 미친다 — 칸의 경계가
 * 어디까지인지 눈으로 잡히지 않는다는 뜻이다.
 *
 * 처음에는 gray-40 으로 올렸는데, 재 보니 2.95:1 로 **아슬하게 모자랐다.**
 * 눈으로는 통과한 것처럼 보이지만 통과가 아니다. 이 저장소는 「초록불을 본
 * 적이 없으면 통과로 세지 않는다」를 지켜 왔으므로 gray-50 으로 간다 —
 * 판 위 4.32:1, 바탕(#f0f1f2) 위 3.99:1 로 둘 다 넘는다.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  /**
   * useId를 쓰지 않고 호출부가 정한다.
   * 훅은 서버 컴포넌트에서 쓸 수 없고, 이 앱의 입력은 대부분 서버에서 그려지기 때문이다.
   * 폼이 몇 개 안 되므로 직접 붙이는 편이 안전하다.
   */
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** id·aria 속성을 받아 실제 입력 요소를 그린다 */
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    required: boolean | undefined;
  }) => ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-body-sm font-bold text-gray-80">
        {label}
        {required ? (
          <span className="ml-1 font-normal text-danger">(필수)</span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-body-xs text-gray-60">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required: required || undefined,
      })}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1 text-body-sm font-bold text-danger"
        >
          {/* 색 말고도 알아볼 표시를 함께 둔다 */}
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  "aria-invalid": invalid,
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        controlBase,
        "min-h-11 px-3",
        invalid ? "border-danger" : "border-gray-50 hover:border-gray-60",
        className,
      )}
      aria-invalid={invalid}
      {...props}
    />
  );
}

export function Textarea({
  className,
  "aria-invalid": invalid,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        controlBase,
        "min-h-28 px-3 py-2 leading-relaxed",
        invalid ? "border-danger" : "border-gray-50 hover:border-gray-60",
        className,
      )}
      aria-invalid={invalid}
      {...props}
    />
  );
}

/**
 * 선택은 브라우저 기본 select를 쓴다.
 * 직접 만든 드롭다운은 거의 언제나 키보드·스크린리더·모바일에서 기본만 못하다.
 */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        controlBase,
        "min-h-11 cursor-pointer border-gray-50 px-3 hover:border-gray-60",
        className,
      )}
      {...props}
    />
  );
}
