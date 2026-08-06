"use client";

import { useSyncExternalStore } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 구독할 외부 상태가 없다. 해지 함수만 돌려주고 아무것도 하지 않는다. */
const noSubscribe = () => () => {};

/**
 * 인쇄 버튼.
 *
 * 이 제품의 화면은 자바스크립트 없이 전부 돈다. 인쇄만 예외다 —
 * window.print()를 부르는 것 말고는 방법이 없다.
 *
 * 그래서 스크립트가 살아 있을 때만 버튼을 그린다. 없으면 버튼이 아예
 * 나타나지 않고 옆의 「Ctrl+P」 안내만 남는다. 눌러도 아무 일도 일어나지 않는
 * 버튼을 보여 주는 것보다 낫다 — 그 순간 사용자는 제품이 고장 났다고 판단한다.
 *
 * "그려진 뒤인가"를 useEffect+setState로 알아내지 않는다. 그 방식은 렌더를 한 번
 * 더 돌리고, React 규칙 검사에도 걸린다. useSyncExternalStore는 서버용 값과
 * 브라우저용 값을 따로 주게 되어 있어, 하이드레이션 불일치 없이 같은 일을 한다.
 */
export function PrintButton() {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true, // 브라우저 — 스크립트가 돌고 있다
    () => false, // 서버에서 그릴 때 — 버튼을 내보내지 않는다
  );
  if (!hydrated) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => window.print()}
    >
      <Printer aria-hidden className="size-4" />
      인쇄
    </Button>
  );
}
