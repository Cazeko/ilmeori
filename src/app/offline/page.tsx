import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "연결이 끊겼습니다" };

/**
 * 연결이 끊겼을 때 보여 주는 한 장.
 *
 * 서비스워커가 미리 담아 두는 유일한 화면이라 **내용이 하나도 없어야 한다.**
 * 업무도, 이름도, 부서도 적지 않는다. 여기 적히는 것은 디스크에 남고,
 * 로그아웃해도 지워지지 않으며, 다음 사람의 브라우저가 그대로 꺼내 쓴다.
 *
 * 로그인 없이 열리는 경로다(src/proxy.ts 의 PUBLIC_PATHS). 인증을 걸면
 * 미리 담을 때 로그인 화면이 담기고, 그러면 연결이 끊긴 사람에게
 * 「비밀번호를 입력하세요」가 뜬다 — 지금 할 수 없는 일을 시키는 화면이다.
 */
export default function OfflinePage() {
  return (
    // id="main" — 레이아웃의 「본문 바로가기」가 가리키는 자리다. 없으면 이
    // 화면에서만 그 링크가 아무 데도 가지 않는 죽은 앵커가 된다.
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center"
    >
      <WifiOff aria-hidden className="size-10 text-gray-40" />
      <h1 className="mt-5 text-h2 font-bold break-keep text-gray-90">
        연결이 끊겼습니다
      </h1>
      <p className="mt-3 text-body leading-relaxed break-keep text-gray-70">
        일머리는 업무 기록을 이 기기에 저장하지 않습니다. 그래서 연결이 없는
        동안에는 아무것도 보여 드릴 수 없습니다.
      </p>

      {/* 「새로고침해 주세요」라고 적어 두고 새로고침할 것을 주지 않았었다.
          이 링크는 스크립트 없이도 다시 시도한다 — 연결이 돌아왔으면 홈이 뜨고,
          아직이면 서비스워커가 이 화면을 다시 보여 준다. */}
      {/* next/link 를 쓰지 않는다. Link 는 클라이언트 전환이라 연결이 끊긴
          상태에서 눌러도 네트워크를 다시 물지 않고 제자리에 머문다. 이 단추의
          목적이 바로 「다시 물어 보기」이므로 문서 이동이라야 한다. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        data-variant="button"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-6 text-body-sm font-bold text-white transition-colors duration-150 hover:bg-primary-hover active:bg-primary-active"
      >
        다시 시도
      </a>

      <details className="mt-6 text-body-sm text-gray-60">
        <summary className="cursor-pointer">왜 저장해 두지 않나요</summary>
        <p className="mt-2 leading-relaxed break-keep">
          공문서를 브라우저 저장소에 남기면 로그아웃한 뒤에도 그 파일이 남고,
          같은 컴퓨터를 쓰는 다음 사람이 그것을 꺼내 볼 수 있습니다. 볼 수 있게
          만드는 것보다 남기지 않는 편이 맞다고 보았습니다.
        </p>
      </details>
    </main>
  );
}
