import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";

/**
 * 사람 표시.
 *
 * 이름 글자를 쓴다. 한국 이름은 성을 빼고 이름 두 글자를 보이는 편이
 * "김"만 다섯 개 늘어서는 것보다 훨씬 잘 구분된다.
 *
 * 색은 이름에서 결정적으로 뽑는다. 같은 사람이 화면마다 다른 색이면
 * 아바타를 색으로 기억하는 사람에게는 없는 것만 못하다.
 */

/**
 * 옅은 배경 + 같은 색 글자 조합은 예뻐 보이지만 대비가 4.1:1 근처에서 걸린다.
 * 24px 원 안의 작은 글자라 더 불리하다. 그래서 진한 바탕에 흰 글자로 간다.
 * 아래 여섯 색은 모두 흰색 대비 4.9:1 이상이다(측정값 괄호 안).
 */
const PALETTE = [
  "bg-primary text-white", //   #004696 (9.07)
  "bg-[#0a63a8] text-white", // (6.24)
  "bg-[#1c7030] text-white", // (6.16)
  "bg-[#b3541f] text-white", // (4.99)
  "bg-[#6b3fa0] text-white", // (7.38)
  "bg-gray-60 text-white", //   #58616a (6.30)
] as const;

/**
 * 작은 원에 한글 두 글자는 들어가지 않는다. 억지로 넣으면 글자가 잘려서
 * 오히려 누군지 알 수 없게 된다. 그래서 크기에 따라 글자 수를 달리한다.
 *
 * 성을 떼고 이름을 쓴다. "김"만 다섯 개 늘어서면 아무 구분이 되지 않는다.
 * 한 글자만 들어갈 때는 이름의 앞 글자를 쓴다 — 큰 아바타의 "서연"과
 * 작은 아바타의 "서"가 같은 자리에서 시작해야 같은 사람으로 읽힌다.
 */
function initials(name: string, compact: boolean) {
  const given = name.length >= 3 ? name.slice(1) : name;
  return compact ? given.slice(0, 1) : given;
}

function hueOf(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const SIZE = {
  sm: "size-6 text-[12px]",
  md: "size-8 text-body-xs",
  lg: "size-11 text-body-sm",
} as const;

export function Avatar({
  profile,
  size = "md",
  className,
}: {
  profile: Pick<Profile, "name">;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none",
        SIZE[size],
        hueOf(profile.name),
        className,
      )}
      // 이름은 옆에 글자로도 적히는 경우가 많다. 그때 두 번 읽히지 않도록
      // 아바타 자체는 장식으로 두고, 필요한 곳에서만 aria-label을 덧붙인다.
      aria-hidden
    >
      {initials(profile.name, size === "sm")}
    </span>
  );
}

/** 아바타 + 이름 + 소속. 목록에서 사람을 한 줄로 보일 때 쓴다. */
export function PersonChip({
  profile,
  sub,
  size = "md",
  className,
}: {
  profile: Pick<Profile, "name" | "position">;
  sub?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Avatar profile={profile} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-bold text-gray-90">
          {profile.name}
          {profile.position ? (
            <span className="font-normal text-gray-60"> {profile.position}</span>
          ) : null}
        </span>
        {sub ? (
          <span className="block truncate text-body-xs text-gray-60">{sub}</span>
        ) : null}
      </span>
    </span>
  );
}

/** 참여자 여럿을 겹쳐 보인다. 넘치면 +N. */
export function AvatarStack({
  people,
  max = 4,
}: {
  people: Array<Pick<Profile, "name">>;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span
      className="inline-flex items-center"
      // 겹쳐진 아바타는 시각 정보다. 스크린리더에는 사람 수와 이름을 글로 준다.
      aria-label={`참여자 ${people.length}명: ${people.map((p) => p.name).join(", ")}`}
      role="img"
    >
      {shown.map((p) => (
        <Avatar
          key={p.name}
          profile={p}
          size="sm"
          className="-ml-1.5 ring-2 ring-surface first:ml-0"
        />
      ))}
      {rest > 0 ? (
        <span className="-ml-1.5 inline-flex size-6 items-center justify-center rounded-full bg-gray-10 text-[11px] font-bold text-gray-60 ring-2 ring-surface">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
