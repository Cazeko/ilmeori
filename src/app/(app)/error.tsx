"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CARD_SURFACE } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { cn } from "@/lib/cn";

/**
 * 로그인한 영역의 그물.
 *
 * global-error.tsx 와 다른 자리를 맡는다.
 *
 *   global-error  뿌리 레이아웃까지 죽었을 때. 옆줄도 머리 줄도 없다.
 *                 스타일을 스스로 들고 있어야 해서 인라인 style 로 그린다.
 *   여기(error)   화면 하나가 죽었을 때. **옆줄과 머리 줄은 살아 있다.**
 *                 그래서 사람은 메뉴로 다른 화면에 갈 수 있고, 이 판은
 *                 본문 자리에만 선다. 앱의 토큰을 그대로 쓴다.
 *
 * 한동안 이 파일이 없었다. 화면 하나가 죽으면 곧바로 global-error 로 떨어져
 * **옆줄까지 사라진 영어 없는 흰 화면**이 나왔고, 사람이 할 수 있는 일은
 * 뒤로가기뿐이었다. 죽은 것은 화면 하나인데 앱 전체가 죽은 것처럼 보였다.
 *
 * ── 스크립트가 없으면 ──────────────────────────────────────────────────────
 *
 * 이 경계는 client 컴포넌트라 스크립트가 있어야 돈다. 스크립트가 없는
 * 브라우저에서 서버 렌더가 실패하면 Next 가 500 을 내고 그때는 global-error
 * 쪽이 답한다 — 두 그물이 겹치지 않고 이어진다.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 콘솔에는 남긴다. 개발 중에 이 판만 보고 원인을 못 찾으면 곤란하다.
    // 화면에는 적지 않는다 — 아래 주석 참조.
    console.error(error);
  }, [error]);

  return (
    <PageContainer width="doc">
      <div
        data-rank="doc"
        className={cn(CARD_SURFACE.doc, "border-l-3 border-l-rule-alarm p-6")}
      >
        <AlertTriangle
          aria-hidden
          className="size-8 text-status-overdue-text"
        />
        <h1 className="mt-4 text-h2 font-bold break-keep text-gray-90">
          이 화면을 그리지 못했습니다
        </h1>
        <p className="mt-3 text-body leading-relaxed break-keep text-gray-70">
          저장하신 내용은 그대로 있습니다. 왼쪽 메뉴로 다른 화면에는 갈 수
          있습니다.
        </p>

        {/* 오류 내용은 적지 않는다. 여기 찍히는 문장에는 업무 제목이나 사람
            이름이 섞여 나올 수 있고, 이 화면은 누구에게든 보일 수 있다.
            digest 는 서버 로그와 맞춰 보기 위한 값이라 사람 정보가 없다. */}
        {error.digest ? (
          <p className="mt-3 text-body-xs tabular-nums text-gray-60">
            오류 번호 {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-sm bg-primary px-6 text-body-sm font-bold text-white transition-colors duration-150 hover:bg-primary-hover"
          >
            다시 시도
          </button>
          <ButtonLink href="/" variant="secondary">
            홈으로
          </ButtonLink>
        </div>
      </div>
    </PageContainer>
  );
}
