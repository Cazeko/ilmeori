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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <WifiOff aria-hidden className="size-10 text-gray-30" />
      <h1 className="mt-5 text-h2 font-bold break-keep text-gray-90">
        연결이 끊겼습니다
      </h1>
      <p className="mt-3 text-body leading-relaxed break-keep text-gray-70">
        일머리는 업무 기록을 이 기기에 저장하지 않습니다. 그래서 연결이 없는
        동안에는 아무것도 보여 드릴 수 없습니다.
      </p>
      <p className="mt-3 text-body-sm leading-relaxed break-keep text-gray-60">
        공문서를 브라우저 저장소에 남기면 로그아웃한 뒤에도 그 파일이 남고, 같은
        컴퓨터를 쓰는 다음 사람이 그것을 꺼내 볼 수 있습니다. 볼 수 있게 만드는
        것보다 남기지 않는 편이 맞다고 보았습니다.
      </p>
      <p className="mt-6 text-body-sm text-gray-60">
        연결이 돌아오면 새로고침해 주세요.
      </p>
    </main>
  );
}
