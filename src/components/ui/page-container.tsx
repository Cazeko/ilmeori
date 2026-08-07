import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * 화면 하나의 바깥 여백과 최대 폭.
 *
 * ── 왜 폭을 묶는가 ─────────────────────────────────────────────────────────
 *
 * 27인치 모니터에서 본문이 화면 끝까지 늘어나면 한 줄이 너무 길어진다. 줄 끝에서
 * 다음 줄 앞으로 눈이 되돌아올 때 어느 줄이었는지를 놓치고, 읽는 사람은 그것을
 * 「글이 안 읽힌다」로만 느낀다. 시청 자리의 모니터는 대개 크고, 이 제품은
 * 하루 종일 띄워 두는 화면이다.
 *
 * 1440px 은 사이드바(260px)를 빼고도 칸반 네 열이 넉넉히 들어가는 폭이다.
 * 그보다 넓어지면 열이 넓어지는 것이 아니라 여백이 카드 안으로 들어간다.
 *
 * ── 폭이 세 가지인 이유 ────────────────────────────────────────────────────
 *
 *   wide  목록·보드·상세. 여러 덩어리를 늘어놓는 화면
 *   doc   결재 문서처럼 **읽는** 화면. 한 줄이 길면 안 되므로 더 좁다
 *   form  폼. 입력칸이 화면 폭만큼 길어지면 어디를 채우는지 눈이 헤맨다
 *
 * 좌우 여백은 세 폭이 같다. 화면을 옮겨 다닐 때 본문의 시작 위치가 흔들리면
 * 그 자체가 불안하게 읽힌다.
 */

const WIDTH = {
  wide: "max-w-[1440px]",
  doc: "max-w-4xl",
  form: "max-w-3xl",
} as const;

export function PageContainer({
  width = "wide",
  className,
  ...props
}: ComponentProps<"div"> & { width?: keyof typeof WIDTH }) {
  return (
    <div
      className={cn(
        "mx-auto px-5 py-6 sm:px-7 lg:px-8",
        WIDTH[width],
        className,
      )}
      {...props}
    />
  );
}
