import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "찾을 수 없습니다" };

/**
 * 어디에도 없는 주소.
 *
 * 이 화면은 앱의 뼈대(AppShell) 밖에서 그려진다. 루트 not-found는 로그인 여부와
 * 무관하게 나올 수 있고, 로그인하지 않은 사람에게 사이드바와 메뉴를 보여 줄
 * 이유가 없기 때문이다.
 *
 * **업무 하나가 안 보이는 경우는 여기로 오지 않는다.** 그쪽은 페이지가 직접
 * 그린다 — src/components/work/work-not-found.tsx 이고, 왜 notFound()를 쓰지
 * 않는지(그리고 그래서 응답이 404가 아니라 200인 것)는 그 파일 주석에 있다.
 * 여기 오는 것은 어느 라우트에도 걸리지 않은 주소뿐이다.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-gray-5 px-5 py-10"
    >
      <div className="w-full max-w-md rounded-sm border border-rule-frame bg-surface p-7">
        <p className="text-body-sm font-bold text-gray-60">404</p>
        <h1 className="mt-1 text-h2 font-bold break-keep text-gray-90">
          이 주소에는 아무것도 없습니다
        </h1>
        <p className="mt-3 text-body-sm leading-relaxed break-keep text-gray-60">
          주소가 잘못되었거나 사라진 화면입니다.
        </p>
        {/* 「업무 보드에서 찾으라」고 적어 두고 업무 보드로 가는 길은 주지
            않았었다. 여기까지 온 사람이 실제로 하려던 일은 대개 그쪽이다. */}
        <p className="mt-5 flex flex-wrap gap-4">
          <Link
            href="/works"
            className="inline-flex min-h-11 items-center text-body-sm font-bold text-primary"
          >
            업무 보드에서 찾기
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-body-sm font-bold text-gray-70"
          >
            홈으로 돌아가기
          </Link>
        </p>
      </div>
    </main>
  );
}
