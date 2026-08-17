import { cn } from "@/lib/cn";

/**
 * 화성특례시 표식.
 *
 * ── 왜 글자만인가 ──────────────────────────────────────────────────────────
 *
 * 시의 공식 상징(휘장·캐릭터)은 우리가 가진 자산이 아니고, 비슷하게 그려 넣으면
 * 그건 공식 표식을 흉내 낸 것이 된다. **없는 권위를 그려 붙이는 것**이라
 * 결재란에 도장 그림을 넣지 않기로 한 것과 같은 이유로 하지 않는다.
 *
 * 그래서 글자만 쓴다. 글자는 사실을 적는 것이고, 이 제품이 어느 조직을 위해
 * 만들어졌는지는 사실이다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 *
 * 이 화면을 여는 사람은 화성특례시 공무원이거나 공모전 심사위원이다. 둘 다
 * 「이게 우리 시 것인가」를 먼저 본다. 제품 이름만 있으면 그 질문에 답하는
 * 자리가 화면 어디에도 없다.
 *
 * ── 다만 공식 서비스가 아니다 ──────────────────────────────────────────────
 *
 * 운영 중인 시 서비스로 오해되면 안 된다. 그래서 `note` 를 붙일 수 있게 두었고,
 * 로그인 화면처럼 자리가 있는 곳에서는 「AI·DATA 공모전 출품작」을 함께 적는다.
 * 좁은 머리 줄에서는 note 없이 이름만 서고, 그 화면에는 「시연용 가상 데이터」
 * 쪽지가 상시로 떠 있어 같은 일을 한다.
 */
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
  const lg = size === "lg";
  return (
    <span className={cn("flex flex-col justify-center leading-none", className)}>
      <span
        className={cn(
          "font-bold text-gray-80",
          lg ? "text-body" : "text-body-xs",
        )}
      >
        화성특례시
      </span>
      {/* 로마자는 자간을 벌린다. 붙여 두면 한글 줄보다 시각적으로 무거워져
          두 줄의 위계가 뒤집힌다. */}
      <span
        className={cn(
          "mt-0.5 tracking-[0.14em] text-gray-50",
          lg ? "text-body-xs" : "text-[0.5625rem]",
        )}
      >
        HWASEONG SPECIAL CITY
      </span>
      {note ? (
        <span className="mt-1.5 text-body-xs break-keep text-gray-60">
          {note}
        </span>
      ) : null}
    </span>
  );
}
