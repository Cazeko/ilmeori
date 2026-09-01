"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 떠 있는 인물 카드에 **스크립트가 있을 때만** 얹히는 세 가지.
 *
 *   1. 열리면 포커스를 창 안(닫기 단추)으로 옮긴다
 *   2. Esc 로 닫는다
 *   3. 닫히면 포커스를 눌렀던 이름표로 되돌린다
 *
 * 그리는 것이 없다. 스크립트가 꺼져 있으면 이 파일은 아무 일도 하지 않고,
 * 카드는 링크 두 개(덮개·✕)로 열리고 닫힌다 — **실패가 곧 예전 동작이다.**
 *
 * ── 왜 포커스 가두기(focus trap)를 안 하는가 ───────────────────────────────
 *
 * 가두려면 창 밖 전부를 못 쓰게 만들어야 하는데, 그 상태를 스크립트 없이는
 * 만들 수 없다. 그러면 **켰을 때와 껐을 때의 화면이 다른 물건이 된다.**
 * `aria-modal` 을 붙이지 않은 것도 같은 이유다 — 가두지 않으면서 가뒀다고
 * 말하면, 보조기술 사용자만 갇힌 줄 알고 창 밖을 못 찾는다.
 * source-drawer.tsx 가 같은 판단을 이미 해 두었다.
 */
export function PersonCardKeys({
  closeHref,
  triggerId,
  closeId,
}: {
  closeHref: string;
  triggerId: string;
  closeId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      router.push(closeHref);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  useEffect(() => {
    document.getElementById(closeId)?.focus();

    return () => {
      // 눌렀던 이름표로 되돌린다. **아직 화면에 있을 때만** — 조직도를 떠나
      // 다른 화면으로 갔다면 그 이름표는 없고, 없으면 아무 데도 손대지 않는다.
      // (여기서 무턱대고 포커스를 옮기면 새 화면의 첫 칸을 빼앗는다)
      document.getElementById(triggerId)?.focus();
    };
  }, [closeId, triggerId]);

  return null;
}
