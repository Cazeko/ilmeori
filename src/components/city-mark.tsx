import { cn } from "@/lib/cn";

/**
 * 화성특례시 표식.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 *
 * 이 화면을 여는 사람은 화성특례시 공무원이거나 공모전 심사위원이다. 둘 다
 * 「이게 우리 시 것인가」를 먼저 본다. 제품 이름만 있으면 그 질문에 답하는
 * 자리가 화면 어디에도 없다.
 *
 * ── 그림 파일을 그대로 쓴다 ────────────────────────────────────────────────
 *
 * 시가 배포하는 가로형 표식이다. 「특별한 시민, 빛나는 도시」와 로마자 줄까지
 * 한 벌로 들어 있고, 잘라 쓰지 않는다 — 공식 표식은 비율과 여백까지가
 * 규정이라 마음에 드는 부분만 오려 쓰면 그건 「비슷하게 만든 것」이 된다.
 *
 * 바탕은 투명하다. 처음 받은 파일은 바탕이 불투명한 흰색이라 회색 화면에서
 * 흰 네모로 떠 보였고, 흰 판을 깔아 가렸었다. 지금 파일은 누끼가 따져 있어
 * 어느 바탕에 놓아도 그대로 얹힌다 — 그 판을 걷어냈다.
 *
 * 원본(1956×804, 619KB)은 화면에 쓰기엔 지나치게 크다. 480×197 로 줄여
 * 넣었다(69KB). 가장 크게 쓰는 자리(로그인, 높이 52px)에서도 3배 넘는 밀도다.
 *
 * ── 크기 ──────────────────────────────────────────────────────────────────
 *
 *   sm     머리 줄 — 제품 표식 옆
 *   lg     로그인 화면
 *
 *   (옆줄 아래에 폭 맞춰 늘리던 block 이 있었다. 머리 줄과 겹치는 표식이라
 *   걷어냈다 — app-shell.tsx 의 옆줄 주석 참고.)
 *
 * width/height 를 늘 함께 적는다. 그림이 늦게 와도 줄이 밀리지 않아야 한다.
 */

/** 파일 크기(480×197). 여기서 가로세로비가 나온다. */
const RATIO = 480 / 197;

export function CityMark({
  className,
  note,
  size = "sm",
}: {
  className?: string;
  /** 아래 줄에 덧붙일 한 마디 — 「AI·DATA 공모전 출품작」 등 */
  note?: string;
  size?: "sm" | "lg";
}) {
  const height = size === "lg" ? 52 : 34;
  const width = Math.round(height * RATIO);

  return (
    <span className={cn("flex flex-col justify-center", className)}>
      {/*
        next/image 를 쓰지 않는다. 크기가 고정이고 판이 바뀌지 않는 그림이라
        최적화 서버를 한 번 더 태울 이유가 없고, 태우면 내부망 온프레미스로
        옮길 때 그 경로가 검토 대상이 된다.

        alt 에 「로고」라고 적지 않는다. 스크린리더는 이미 「그림」이라고
        읽어 주므로, 거기에 「로고 그림」이 되면 같은 말이 두 번 나온다.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- 위 주석 참고 */}
      <img
        src="/brand/hwaseong.png"
        alt="화성특례시"
        width={width}
        height={height}
        style={{ width, height }}
        className="block max-w-full object-contain"
      />
      {note ? (
        <span className="mt-3 text-body-xs break-keep text-gray-60">
          {note}
        </span>
      ) : null}
    </span>
  );
}
