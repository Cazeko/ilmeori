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
 * 입력칸 테두리는 gray-30 이었다. 판(#fafafa) 위에서 대비가 1.98:1 이라
 * KWCAG 2.2 / WCAG 1.4.11「비텍스트 대비」의 3:1 에 못 미친다 — 칸의 경계가
 * 어디까지인지 눈으로 잡히지 않는다는 뜻이다. gray-40 은 3.0:1 로 통과한다.
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
    <div className={cn("flex flex-col gap-1.5", className)}>
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
        invalid ? "border-danger" : "border-gray-40 hover:border-gray-50",
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
        invalid ? "border-danger" : "border-gray-40 hover:border-gray-50",
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
        "min-h-11 cursor-pointer border-gray-40 px-3 hover:border-gray-50",
        className,
      )}
      {...props}
    />
  );
}
