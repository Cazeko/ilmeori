import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { LinkPending } from "@/components/ui/link-pending";
import { cn } from "@/lib/cn";
import type { Department, Profile } from "@/lib/types";

/**
 * 조직도 — 실·국 아래 과, 과 아래 사람.
 *
 * ── 왜 표처럼 생겼는가 ─────────────────────────────────────────────────────
 *
 * 이 화면이 실제로 답하는 질문은 두 가지다. 「이 일은 어느 과가 하나」와
 * 「그 과에 누가 있나」. 둘 다 **훑어서** 답하는 질문이라, 눈이 세로로 내려갈
 * 때 같은 것이 같은 자리에 있어야 한다. 조직 계통을 상자와 선으로 그린 그림은
 * 벽에 붙이는 물건이고, 하루에 몇 번씩 사람을 찾는 도구가 아니다.
 *
 * 그래서 열을 **한 곳에서** 정의한다(아래 `COLUMNS`). 머리글 줄과 93개 부서
 * 줄이 같은 문자열을 쓰므로, 열 너비를 고치면 둘이 함께 움직인다 — 두 벌로
 * 적어 두면 한쪽만 고치는 날이 반드시 오고, 그날 머리글과 값이 어긋난다.
 *
 * `<table>` 을 쓰지 않은 이유는 좁은 화면 때문이다. 표를 320px 에 넣으려면
 * `tr`·`td` 를 `display:block` 으로 눕혀야 하는데, 그러면 브라우저가 그 요소에서
 * 표 의미를 걷어 간다 — 화면을 보지 않는 사람에게만 구조가 사라진다.
 * 좁은 화면에서는 한 열로 쌓고, `md` 부터 세 열로 편다.
 */

/**
 * 열 — 이 화면의 오와 열.
 *
 *   부서 10.5rem       가장 긴 이름(「도시계획상임기획단」)이 두 줄로 접히는 폭.
 *                      전부 한 줄에 넣으려면 14rem 이 드는데, 그러면 768px 에서
 *                      「하는 일」이 세 줄이 된다. 긴 쪽이 접히는 편이 낫다
 *   하는 일 1fr        남는 폭의 절반
 *   재직자 13rem~1fr   나머지 절반. 아래를 재고 정했다
 *
 * 처음에는 재직자를 `minmax(14rem,20rem)` 으로 두어 **오른쪽 끝에 붙였다.**
 * 1440px 에서 「하는 일」이 끝나는 자리와 이름이 시작하는 자리 사이가 230px
 * 넘게 비었고, 눈이 한 줄을 읽는 데 화면을 가로질러야 했다. 두 열이 남는 폭을
 * 똑같이 나누면 그 틈이 절반으로 줄고, 열은 여전히 한 세로선에 선다.
 * 화면 자체도 `width="doc"` 로 묶었다 — 훑어 읽는 명부라 줄이 길면 안 된다.
 */
const COLUMNS =
  "grid gap-x-4 md:grid-cols-[10.5rem_minmax(0,1fr)_minmax(13rem,1fr)]";

/** 한 줄 — 과 하나(또는 과가 없는 실·국 하나). */
export type OrgUnit = {
  dept: Department;
  /** 실·국 자체에 바로 딸린 사람들인가. 아래 과들과 구별해 적는다. */
  direct: boolean;
  people: Profile[];
};

export type OrgBureau = {
  bureau: Department;
  units: OrgUnit[];
  /** 이 실·국 전체 재직자 수. 줄마다 세지 않고 한 번 세어 넘긴다. */
  headcount: number;
};

export function OrgChart({
  bureaus,
  unplaced,
  viewerId,
  viewerDepartmentId,
  openPersonId,
  filtered = false,
  hrefFor,
}: {
  bureaus: OrgBureau[];
  /**
   * 어느 줄에도 못 들어간 사람들.
   *
   * 조직도는 사람을 부서에 얹어 그리는데, 소속이 비어 있거나 조직도에 없는
   * 부서를 가리키면 얹을 자리가 없다. **그때 조용히 빠뜨리면 안 된다** —
   * 명부에서 빠진 사람은 아무도 못 찾고, 빠졌다는 사실조차 아무 데도 안 남는다.
   * 조직도가 2단(실·국 → 과)만 펴는 것도 이유의 하나다(getDepartmentTree).
   * 평소에는 0명이라 이 자리는 그려지지 않는다.
   */
  unplaced: Profile[];
  viewerId: string;
  viewerDepartmentId: string | null;
  /** 지금 창이 열려 있는 사람. 그 이름표를 눌린 채로 둔다. */
  openPersonId: string | null;
  /**
   * 찾는 말이 걸려 있는가.
   *
   * 실·국 제목의 수는 **화면에 실제로 있는 줄**만 센다. 걸러진 화면에서
   * 「재직자 0명」이라고 적으면 그 실·국에 아무도 없다는 뜻이 되어 버리므로,
   * 그때는 「찾은 사람」이라고 말을 바꾼다. 같은 숫자라도 무엇을 센 것인지가
   * 다르면 다르게 적어야 한다.
   */
  filtered?: boolean;
  /** 이름표가 갈 주소. 찾기 조건을 실어 보내는 일은 화면이 한다. */
  hrefFor: (personId: string) => string;
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* 머리글 줄. 카드 안쪽 여백(24px)을 넘어 좌우 끝까지 칠해야 스크롤한
          글자가 옆구리로 새어 보이지 않는다 — 바깥에서 `-mx-6 px-6` 로 넓히고,
          안쪽 격자는 본문과 같은 폭을 유지한다. z-10 은 「고정 헤더 안쪽
          요소 = 표 머리글」 자리다(globals.css 의 다섯 층). */}
      <div className="sticky top-header z-10 -mx-6 hidden border-b border-rule-frame bg-gray-0 px-6 md:block">
        <div className={cn(COLUMNS, "py-2")}>
          <span className="text-body-xs font-bold text-gray-60">부서</span>
          <span className="text-body-xs font-bold text-gray-60">하는 일</span>
          <span className="text-body-xs font-bold text-gray-60">재직자</span>
        </div>
      </div>

      {bureaus.map(({ bureau, units, headcount }) => (
        <section key={bureau.id} aria-labelledby={`bureau-${bureau.id}`}>
          <h2
            id={`bureau-${bureau.id}`}
            className="flex items-baseline justify-between gap-3 border-b border-rule-frame pb-2 text-h3 font-bold text-gray-90"
          >
            <span className="min-w-0 break-keep">{bureau.name}</span>
            {/* 수는 제목 안에 둔다. 화면을 보지 않는 사람은 제목만 훑어
                내려가는데, 그때 「몇 명인가」가 제목 밖에 있으면 안 들린다. */}
            <span className="shrink-0 text-body-xs font-normal text-gray-60">
              {filtered ? "찾은 사람" : "재직자"} {headcount}명
            </span>
          </h2>

          {/* 줄이 격자(display:grid)라 브라우저가 목록 의미를 걷어 가는 자리다.
              화면을 보지 않는 사람에게 「몇 개 중 몇 번째」가 사라지므로
              역할을 손으로 되돌려 준다. */}
          <ul role="list">
            {units.map((unit) => (
              <UnitRow
                key={unit.dept.id + (unit.direct ? ":direct" : "")}
                unit={unit}
                mine={unit.dept.id === viewerDepartmentId}
                viewerId={viewerId}
                openPersonId={openPersonId}
                hrefFor={hrefFor}
              />
            ))}
          </ul>
        </section>
      ))}

      {unplaced.length > 0 ? (
        <section aria-labelledby="bureau-unplaced">
          <h2
            id="bureau-unplaced"
            className="flex items-baseline justify-between gap-3 border-b border-rule-frame pb-2 text-h3 font-bold text-gray-90"
          >
            <span className="min-w-0 break-keep">소속이 확인되지 않는 사람</span>
            <span className="shrink-0 text-body-xs font-normal text-gray-60">
              {unplaced.length}명
            </span>
          </h2>
          <ul role="list">
            <UnitRow
              unit={{
                dept: {
                  id: "unplaced",
                  name: "소속 없음",
                  parent_id: null,
                  description:
                    "인사 데이터의 소속이 비어 있거나 조직도에 없는 부서를 가리킵니다.",
                  sort_order: 0,
                },
                direct: false,
                people: unplaced,
              }}
              mine={false}
              viewerId={viewerId}
              openPersonId={openPersonId}
              hrefFor={hrefFor}
            />
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function UnitRow({
  unit,
  mine,
  viewerId,
  openPersonId,
  hrefFor,
}: {
  unit: OrgUnit;
  mine: boolean;
  viewerId: string;
  openPersonId: string | null;
  hrefFor: (personId: string) => string;
}) {
  return (
    <li
      role="listitem"
      className={cn(
        COLUMNS,
        // 줄 사이는 가는 선으로만 가른다. 한 줄 걸러 바탕을 칠하는 방법도
        // 있지만, 이 디자인에서 면은 뜻이 있는 것에만 쓴다(DESIGN.md §16.1).
        "border-b border-rule-hair py-3 last:border-b-0",
      )}
    >
      {/* 세 칸 모두 `md:py-1` 이다. 이름표(px-2 py-1)와 같은 상자를 쓰게 해서
          첫 글자의 밑선이 세 열에서 같은 자리에 오게 한다. 하나만 빼면 그
          열만 4px 올라앉고, 93줄이 쌓이면 그게 「줄이 안 맞는다」로 읽힌다. */}
      <p className="min-w-0 text-body-sm font-bold break-keep text-gray-90 md:py-1">
        {unit.dept.name}
        {unit.direct ? (
          <span className="ml-2 rounded-xs bg-gray-10 px-chip-x py-chip-y align-middle text-body-xs font-bold text-gray-70">
            직속
          </span>
        ) : null}
        {mine ? (
          <span className="ml-2 rounded-xs bg-primary-5 px-chip-x py-chip-y align-middle text-body-xs font-bold text-primary">
            우리 과
          </span>
        ) : null}
      </p>

      {/* 하는 일이 없는 부서가 있다(과를 거느린 실·국). 그래도 칸은 그린다 —
          `hidden` 으로 지우면 격자에서 자리까지 사라져 **다음 칸이 이 열로
          당겨 올라온다.** 비었을 때 위 여백만 걷어 빈 줄이 안 생기게 한다. */}
      <p className="mt-1 min-w-0 text-body-sm break-keep text-gray-60 empty:mt-0 md:mt-0 md:py-1">
        {unit.dept.description ?? ""}
      </p>

      {/* 이름표는 좌우로 8px 안쪽 여백을 갖는다. 그대로 두면 이름의 첫 글자가
          열 시작선에서 8px 밀려, 위 두 열과 세로선이 어긋난다. 담는 상자를
          그만큼 왼쪽으로 당겨 글자를 선에 맞춘다 — 줄바꿈된 둘째 줄도 같다. */}
      <div className="mt-2 -ml-2 flex min-w-0 flex-wrap gap-1 md:mt-0">
        {unit.people.length === 0 ? (
          // 줄을 지우지 않는다. 없다는 것도 답이기 때문이다(detail-list.tsx).
          <span className="px-2 py-1 text-body-sm text-gray-60">—</span>
        ) : (
          unit.people.map((person) => (
            <PersonTag
              key={person.id}
              person={person}
              me={person.id === viewerId}
              open={person.id === openPersonId}
              href={hrefFor(person.id)}
            />
          ))
        )}
      </div>
    </li>
  );
}

/**
 * 사람 하나 — 누르면 떠 있는 카드가 열린다.
 *
 * 이름 글자만이 아니라 **이름표 전체**가 링크다. 안에 다른 누를 것이 없으므로
 * 표적을 좁힐 이유가 없고, 손가락으로 쓰는 화면에서는 44px 로 자란다.
 *
 * `id` 는 두 가지로 쓰인다 — 카드를 열 때 주소 끝에 붙는 자리표(#p-…)라
 * 스크립트가 없어도 눌렀던 줄로 되돌아오고, 카드를 닫을 때 포커스가 돌아올
 * 자리이기도 하다(person-card-keys.tsx).
 */
function PersonTag({
  person,
  me,
  open,
  href,
}: {
  person: Profile;
  me: boolean;
  open: boolean;
  href: string;
}) {
  return (
    <Link
      id={`p-${person.id}`}
      href={href}
      aria-current={open ? "true" : undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-sm px-2 py-1 text-gray-90 transition-colors duration-150",
        "hover:bg-gray-5 hover:text-primary active:bg-gray-10 pointer-coarse:min-h-11",
        // 주소 끝의 `#p-…` 로 되돌아올 때 이 줄이 **머리 줄 뒤에 숨지 않게**
        // 한다. 위에는 붙박이 머리 줄(56px)과 붙박이 열 이름 줄이 겹쳐 있어서,
        // 그냥 두면 눌렀던 사람이 화면 밖 위쪽에 선다. 높이는 토큰에서 읽는다 —
        // 숫자로 적어 두면 머리 줄 높이를 고치는 날 조용히 어긋난다.
        "scroll-mt-[calc(var(--spacing-header)+2rem)]",
        // 지금 열려 있는 사람. 덮개 너머로도 어느 줄을 눌렀는지 보여야 한다.
        open && "bg-gray-10",
      )}
    >
      <Avatar profile={person} size="sm" me={me} />
      <span className="truncate text-body-sm font-bold">
        {person.name}
        {person.position ? (
          <span className="font-normal text-gray-60"> {person.position}</span>
        ) : null}
      </span>
      {/* 눌렀다는 표시. 카드는 서버가 그려 오므로 한 왕복이 걸리는데,
          그동안 아무 일도 없으면 사람은 한 번 더 누른다(link-pending.tsx). */}
      <LinkPending className="text-gray-60" />
    </Link>
  );
}
