"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 되돌릴 수 없는 동작을 묻는 대화상자.
 *
 * 브라우저 기본 <dialog>를 쓴다. 직접 만들면 포커스 가두기·Esc 닫기·바깥 영역 비활성화를
 * 전부 다시 구현해야 하고, 대개 어딘가 빠진다. showModal()은 그 셋을 다 해 준다.
 *
 * 인계 실행처럼 되돌릴 수 없는 동작에는 확인을 반드시 거친다.
 * 「업무인계·인수서」는 실행 순간 권한이 실제로 옮겨 가기 때문이다.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "취소",
  tone = "primary",
  onConfirm,
  children,
}: {
  /** 대화상자를 여는 버튼의 글자 */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  /** 본문에 더 붙일 내용 (대상 목록 등) */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  // 한 화면에 대화상자가 둘 이상 놓일 수 있다. 고정 id를 쓰면 제목이 서로 뒤바뀐다.
  const titleId = useId();

  // 사용자가 Esc로 닫으면 상태도 원위치시킨다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClose = () => setPending(false);
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, []);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      ref.current?.close();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant={tone} onClick={() => ref.current?.showModal()}>
        {trigger}
      </Button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-gray-10 p-0 shadow-xl backdrop:bg-gray-100/40"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <h2 id={titleId} className="text-h3 font-bold break-keep text-gray-90">
            {title}
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => ref.current?.close()}
            className="-mr-2 -mt-2 flex size-11 cursor-pointer items-center justify-center rounded-sm text-gray-50 hover:bg-gray-5 hover:text-gray-80"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {description ? (
          <div className="px-6 pt-3 text-body-sm leading-relaxed text-gray-70">
            {description}
          </div>
        ) : null}
        {children ? <div className="px-6 pt-4">{children}</div> : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-gray-10 bg-gray-5 px-6 py-4">
          <Button
            variant="secondary"
            onClick={() => ref.current?.close()}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={confirm} disabled={pending} aria-busy={pending}>
            {pending ? "처리 중…" : confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
