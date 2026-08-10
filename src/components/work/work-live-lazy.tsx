"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { WorkLive as WorkLiveType } from "./work-live";

/**
 * WorkLive를 나중에 불러온다.
 *
 * 왜: supabase-js와 realtime-js가 통째로 딸려 와 이 조각 하나가 542KB(gzip 134KB)다.
 * 그래서 업무 상세 화면만 초기 JS가 다른 화면의 2배였다(1,053KB 대 509KB).
 *
 * 왜 안전한가: WorkLive는 하이드레이션 전에 null을 돌려준다(work-live.tsx:252).
 * 서버가 그리는 것이 애초에 없으므로 `ssr: false`로 바꿔도 **화면이 달라지지 않는다.**
 * 늦게 오는 것은 「지금 보고 있는 사람」 표시줄뿐이고, 그건 원래도 스크립트가
 * 돌기 시작한 뒤에 나타났다.
 *
 * 서버 컴포넌트에서는 `ssr: false`를 쓸 수 없어서 이 얇은 client 껍데기를 둔다.
 * 타입만 가져오는 import는 번들에 남지 않는다.
 */
const WorkLive = dynamic(
  () => import("./work-live").then((m) => m.WorkLive),
  { ssr: false },
);

export function WorkLiveLazy(props: ComponentProps<typeof WorkLiveType>) {
  return <WorkLive {...props} />;
}
