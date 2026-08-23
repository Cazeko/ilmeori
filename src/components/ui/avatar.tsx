import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";

/**
 * 사람 표시.
 *
 * 이름 글자를 쓴다. 한국 이름은 성을 빼고 이름 두 글자를 보이는 편이
 * "김"만 다섯 개 늘어서는 것보다 훨씬 잘 구분된다.
 *
 * ── 색을 뺐다 ──────────────────────────────────────────────────────────────
 *
 * 예전에는 이름에서 여섯 색(남색·파랑·초록·주황·보라·회색) 중 하나를
 * 결정적으로 뽑아 썼다. "같은 사람이 화면마다 다른 색이면 색으로 기억하는
 * 사람에게 없는 것만 못하다"가 그 이유였고, 그 자체는 지금도 맞다.
 *
 * 문제는 **화면 전체에서 채도가 가장 높은 자리가 아바타**가 된 것이었다.
 * 업무 보드 한 장에 색이 12개 있었는데 그중 다섯이 아바타였고, 아바타는
 * 그 화면에서 가장 덜 중요한 정보다. 지연된 업무의 붉은 띠보다 보라색
 * 아바타가 먼저 눈에 들어왔다 — 시선이 안 가는 게 아니라 **틀린 곳으로**
 * 가고 있었다.
 *
 * 그래서 무채색 하나로 통일한다. 사람을 가르는 일은 색이 아니라 **이름
 * 글자**가 한다(아래 initials). 색으로 기억하던 사람은 잃는 것이 있지만,
 * 그 대신 화면에 색이 뜨면 그건 언제나 「지금 문제인 것」 하나가 된다.
 *
 * ── 그런데 하나에는 색을 준다 — 「나」 ───────────────────────────────────────
 *
 * 전부 회색으로 만든 뒤 외부 평가 두 건이 **똑같이** 「과하게 무채색이라 구분이
 * 안 된다」고 지적했다. 각각 파스텔 톤과 2~3색 제한을 처방했는데, 둘 다
 * 「사람마다 색」이라는 전제를 깔고 있고 **그 전제가 틀렸다.**
 *
 *   · 24px 원을 겹쳐 놓은 자리에서 색으로 사람을 구별하는 것은 원래 안 된다.
 *   · 인원이 20명이 되면 색이 반복되어 **거짓 정보**가 된다.
 *   · 색맹 사용자에게는 처음부터 없는 정보다. 공공 시스템에서 색만으로
 *     나르는 정보는 두면 안 된다.
 *
 * 이 자리에서 아바타가 실제로 답하는 질문은 「누구누구인가」가 아니라
 * **「이거 내 일인가」** 다. 그러면 색은 하나면 된다.
 *
 * HS Orange 계열을 쓴다 — 이 제품에서 주황은 「내가 움직여야 하는 것」 하나만
 * 가리킨다(결재함의 「지금 내 차례」, 홈의 인계 알림, 카드의 임박 띠).
 * 채운 주황(accent) 위의 흰 글자는 3.33:1 로 미달이라, 옅은 바탕에 짙은 글자로
 * 얹는다. 인원이 늘어도 안 깨지고, 색맹이어도 **자리**로 읽히며(내 아바타는
 * 목록에서 늘 같은 자리에 있다), 색 예산을 한 갈래도 새로 쓰지 않는다.
 */

/** 대비 7.07:1 (gray-70 on gray-10). tests/contrast.test.mjs 가 지킨다. */
const NEUTRAL = "bg-gray-10 text-gray-70";

/** 「나」. 대비 4.95:1 (accent-text on accent-bg). 같은 시험이 지킨다. */
const MINE = "bg-accent-bg text-accent-text";

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

const SIZE = {
  sm: "size-6 text-body-xs",
  md: "size-8 text-body-xs",
  lg: "size-11 text-body-sm",
} as const;

export function Avatar({
  profile,
  size = "md",
  me = false,
  className,
}: {
  profile: Pick<Profile, "name">;
  size?: keyof typeof SIZE;
  /** 이 사람이 보고 있는 본인인가. 화면에서 색이 붙는 아바타는 이것 하나뿐이다. */
  me?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none",
        SIZE[size],
        me ? MINE : NEUTRAL,
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
  me = false,
  className,
}: {
  profile: Pick<Profile, "name" | "position">;
  sub?: string;
  size?: keyof typeof SIZE;
  me?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Avatar profile={profile} size={size} me={me} />
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

/**
 * 참여자 여럿을 겹쳐 보인다. 넘치면 +N.
 *
 * 내가 낀 목록이면 내 아바타를 **맨 앞으로 당긴다.** 겹쳐 놓은 줄에서 앞자리가
 * 위에 얹히고, 상한(max)에 걸려 잘리는 것은 뒤쪽이다 — 참여자가 여섯인데 넷만
 * 보이는 카드에서 정작 내가 「+2」 안에 숨는 일이 없어야 한다.
 * 「이거 내 일인가」가 이 줄이 답하는 질문이므로, 그 답이 잘리면 안 된다.
 */
export function AvatarStack({
  people,
  max = 4,
  meId,
}: {
  people: Array<Pick<Profile, "id" | "name">>;
  max?: number;
  /** 보고 있는 사람의 id. 없으면 전부 무채색이다. */
  meId?: string;
}) {
  const ordered = meId
    ? [...people].sort((a, b) => Number(b.id === meId) - Number(a.id === meId))
    : people;
  const shown = ordered.slice(0, max);
  const rest = ordered.length - shown.length;
  return (
    <span
      className="inline-flex items-center"
      // 겹쳐진 아바타는 시각 정보다. 스크린리더에는 사람 수와 이름을 글로 준다.
      aria-label={`참여자 ${ordered.length}명: ${ordered.map((p) => p.name).join(", ")}`}
      role="img"
    >
      {/* 겹침은 4px 이다. 한동안 6px(-ml-1.5)이었고, 여백 반단계를 걷어내면서
          8px(-ml-2)으로 **올렸다** — 방향이 반대였다. 24px 원에 13px 글자를
          넣으면 글자가 x 5~19 를 쓰는데, 뒤 원이 ring 2px 을 달고 8px 을
          덮으면 x 14 부터 가려진다. 실제로 「서 지 민 태」가 「ㅅ ㅈ ㅁ 태」로
          읽혔다(8배 확대로 확인). 이 디자인은 「사람을 가르는 일은 색이 아니라
          이름 글자가 한다」 위에 서 있으므로, 그 글자가 3분의 1 가려지면
          아바타에서 색을 뺀 근거 자체가 무너진다. 4px 로 내리면 온전해지고,
          넷을 늘어놓아도 84px 이라 카드 한 줄에 그대로 들어간다. */}
      {shown.map((p) => (
        <Avatar
          key={p.id}
          profile={p}
          size="sm"
          me={p.id === meId}
          className="-ml-1 ring-2 ring-surface first:ml-0"
        />
      ))}
      {rest > 0 ? (
        <span className="-ml-1 inline-flex size-6 items-center justify-center rounded-full bg-gray-10 text-body-xs font-bold text-gray-60 ring-2 ring-surface">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
