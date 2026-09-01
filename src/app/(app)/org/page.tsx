import type { Metadata } from "next";
import { Search, Users } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { GetForm } from "@/components/ui/get-form";
import { PageContainer } from "@/components/ui/page-container";
import { OrgChart, type OrgBureau, type OrgUnit } from "@/components/org/org-chart";
import { PersonCard } from "@/components/org/person-card";
import { getDepartmentTree, getProfileView, listProfiles } from "@/lib/data";
import { searchTerm } from "@/lib/search-term";
import { requireViewer } from "@/lib/session";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "조직도" };

/**
 * 조직도.
 *
 * ── 이 화면이 답하는 것 ────────────────────────────────────────────────────
 *
 * 부서를 넘는 협업이 이 제품의 전제인데, 정작 **「그 부서에 누가 있나」를
 * 물어볼 자리가 없었다.** 참여자 줄에 뜬 이름은 이미 그 업무에 낀 사람이고,
 * 초대 검색은 이름을 알고 있을 때만 쓴다. 처음 일을 넘길 때 필요한 것은
 * 반대 방향이다 — 과를 먼저 찾고, 거기 있는 사람을 본다.
 *
 * ── 새로 여는 문이 없다 ────────────────────────────────────────────────────
 *
 * 재직자 명부는 원래 전 직원이 본다(0002 의 profile_select). 그러니까 이
 * 화면은 권한을 넓히는 것이 아니라 **이미 열려 있던 것에 자리를 준 것**이다.
 * 유일하게 사람마다 갈리는 값인 개인 휴대전화는 여기서 한 건도 조회하지
 * 않는다 — 이름을 눌러 카드를 열었을 때 그 한 사람만 `getProfileView` 로
 * 묻고, 공개 여부 판정은 DB 정책이 한다(0023).
 *
 * ── 상태는 전부 주소에 있다 ────────────────────────────────────────────────
 *
 *   ?q=…        찾는 말
 *   ?person=…   지금 떠 있는 카드
 *
 * 그래서 카드가 열린 화면을 그대로 옆자리에 보낼 수 있고, 뒤로가기가 카드를
 * 닫는다. 무엇보다 **스크립트가 없어도 전부 동작한다** — 여는 것도 닫는 것도
 * 링크이기 때문이다.
 */

/** 주소에서 온 사람 id 가 uuid 모양인가. 아니면 DB 에 넘기지 않는다(22P02 방지). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 조직도 안에서의 사람 순서 — 서열이 위인 사람부터, 같으면 이름차례. */
function byRank(a: Profile, b: Profile) {
  return a.rank - b.rank || a.name.localeCompare(b.name, "ko");
}

export default async function OrgPage({ searchParams }: PageProps<"/org">) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : "";
  const term = searchTerm(q);
  const personId =
    typeof sp.person === "string" && UUID.test(sp.person) ? sp.person : null;

  const [tree, people, view] = await Promise.all([
    getDepartmentTree(),
    listProfiles(),
    // 카드를 연 사람 한 명만 묻는다. 여는 조건이 주소에 있으므로 열지 않은
    // 화면에서는 이 질의 자체가 나가지 않는다.
    personId ? getProfileView(viewer, personId) : Promise.resolve(null),
  ]);

  const byDepartment = new Map<string, Profile[]>();
  for (const person of people) {
    if (!person.department_id) continue;
    const found = byDepartment.get(person.department_id);
    if (found) found.push(person);
    else byDepartment.set(person.department_id, [person]);
  }
  for (const list of byDepartment.values()) list.sort(byRank);

  const bureaus: OrgBureau[] = [];
  let divisionCount = 0;
  /** 조직도 어느 줄엔가 실제로 얹힌 사람. 아래에서 「빠진 사람」을 가리는 데 쓴다. */
  const placed = new Set<string>();

  for (const bureau of tree) {
    const units: OrgUnit[] = [];

    // 실·국에 바로 딸린 사람들. 과가 없는 실·국(감사관 등)은 그 자체가 실무
    // 부서이고, 과가 있는데도 직속이 있는 경우가 실제로 있다(공보실).
    const direct = byDepartment.get(bureau.id) ?? [];
    if (bureau.children.length === 0 || direct.length > 0) {
      units.push({
        dept: bureau,
        direct: bureau.children.length > 0,
        people: direct,
      });
    }
    for (const child of bureau.children) {
      divisionCount += 1;
      units.push({
        dept: child,
        direct: false,
        people: byDepartment.get(child.id) ?? [],
      });
    }
    for (const unit of units) for (const p of unit.people) placed.add(p.id);

    // 찾는 말은 **줄 단위**로 건다. 걸린 줄의 사람은 아무도 감추지 않는다 —
    // 「자원순환과」를 찾은 사람이 알고 싶은 것은 그 과 전원이지, 이름에
    // 「자원」이 든 사람이 아니다.
    const kept = term
      ? units.filter((unit) => matches(unit, bureau.name, term))
      : units;
    if (kept.length === 0) continue;

    bureaus.push({
      bureau,
      units: kept,
      headcount: kept.reduce((n, unit) => n + unit.people.length, 0),
    });
  }

  // 조직도에 얹을 자리가 없던 사람. 소속이 비었거나, 2단으로 펴는 조직도에
  // 없는 부서를 가리키는 경우다. 조용히 빠뜨리지 않고 마지막에 따로 세운다.
  const unplacedAll = people.filter((p) => !placed.has(p.id));
  const unplaced = term
    ? unplacedAll.filter((p) =>
        `${p.name} ${p.position}`.toLowerCase().includes(term.toLowerCase()),
      )
    : unplacedAll;

  const shownPeople =
    bureaus.reduce((n, b) => n + b.headcount, 0) + unplaced.length;

  /** 이름표가 갈 주소. 찾는 말을 잃지 않고, 눌렀던 줄로 되돌아온다. */
  const hrefFor = (id: string) => `${href({ q, person: id })}#p-${id}`;
  /** 카드를 닫으면 갈 주소. 사람만 뺀다. */
  const closeHref = personId
    ? `${href({ q })}#p-${personId}`
    : href({ q });

  return (
    // 「읽는 화면」 폭이다. 목록·보드보다 좁다 — 93줄을 세로로 훑는 화면이라
    // 한 줄이 1,100px 넘게 늘어나면 줄 끝에서 눈이 다음 줄을 못 찾는다
    // (page-container.tsx 의 세 폭).
    <PageContainer width="doc">
      {/* 카드를 본문보다 **먼저** 그린다. 화면에서는 떠 있으므로 자리가 달라지지
          않지만, 탭 순서는 DOM 순서다 — 뒤에 두면 카드를 연 사람이 93줄을
          지나야 닫기 단추에 닿는다. */}
      {personId ? (
        <PersonCard
          view={view}
          closeHref={closeHref}
          triggerId={`p-${personId}`}
        />
      ) : null}

      <Card variant="doc">
        <CardHeader
          variant="doc"
          as="h1"
          title="조직도"
          description={`화성특례시 본청 실·국 ${tree.length}개 · 과 ${divisionCount}개. 이름을 누르면 연락처가 뜹니다.`}
        />
        <CardBody variant="doc">
          {/* 찾기. GET 폼이라 스크립트가 없어도 동작하고, 조건이 주소에 남는다.
              사람이 열려 있는 채로 찾으면 카드는 닫는다 — 결과가 갈렸는데 앞의
              카드가 떠 있으면 무엇을 찾은 것인지 가려진다. */}
          <GetForm
            action="/org"
            role="search"
            // 머리 줄의 업무 검색도 search 자리라, 한 화면에 같은 자리가 둘이다.
            // 이름을 안 주면 화면을 자리로 훑는 사람에게 「검색, 검색」 둘로만 들린다.
            aria-label="부서·사람 찾기"
            className="mb-6 flex flex-col gap-3 border-b border-rule-hair pb-6 sm:flex-row sm:items-end"
          >
            <Field
              id="org-q"
              label="부서·사람 찾기"
              hint="과 이름, 하는 일, 사람 이름 어느 쪽으로도 찾습니다."
              className="min-w-0 flex-1 sm:max-w-sm"
            >
              {(p) => (
                <Input
                  {...p}
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="예: 자원순환, 체전, 김서연"
                  autoComplete="off"
                />
              )}
            </Field>
            {/* 채운 파랑이 아니다. 이 화면에서 사람이 주로 하는 일은 찾는 것이
                아니라 **훑는 것**이고, 390px 에서 가로로 꽉 찬 파란 단추는
                화면에서 제목 다음으로 무거워진다 — 조직도보다 검색칸이 먼저
                읽히면 순서가 뒤집힌 것이다. */}
            <Button type="submit" variant="secondary" className="sm:w-auto">
              <Search aria-hidden className="size-4" />
              찾기
            </Button>
          </GetForm>

          {term ? (
            <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-gray-60">
              {/* 조사를 붙이지 않는다. 「‘자원’으로」와 「‘체전’으로」는 앞말의
                  받침에 따라 갈리는데, 여기 들어오는 말은 사용자가 친 것이라
                  무엇이 올지 알 수 없다. 붙였다가 틀리느니 안 붙인다. */}
              <span>
                찾는 말 <span className="font-bold text-gray-90">‘{term}’</span>{" "}
                — 부서 {bureaus.reduce((n, b) => n + b.units.length, 0)}곳 · 사람{" "}
                {shownPeople}명
              </span>
              <ButtonLink href="/org" variant="ghost" size="sm">
                조건 지우기
              </ButtonLink>
            </p>
          ) : null}

          {bureaus.length === 0 && unplaced.length === 0 ? (
            // 찾다가 못 찾은 것과 조직도 자체가 비어 있는 것은 다른 사실이다.
            // 조건이 없는데 아무것도 없으면 그건 사용자가 고칠 수 있는 일이 아니다.
            <EmptyState
              icon={Users}
              title={term ? "그런 부서도 사람도 없습니다" : "조직도가 비어 있습니다"}
              description={
                term
                  ? "과 이름·하는 일·사람 이름으로 찾습니다. 글자를 줄여서 다시 찾아 보세요."
                  : "부서 정보를 아직 읽지 못했습니다. 잠시 뒤 다시 열어 보세요."
              }
              action={
                term ? (
                  <ButtonLink href="/org" variant="secondary">
                    전체 조직도 보기
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <OrgChart
              bureaus={bureaus}
              unplaced={unplaced}
              viewerId={viewer.id}
              viewerDepartmentId={viewer.department_id}
              openPersonId={personId}
              filtered={term !== null}
              hrefFor={hrefFor}
            />
          )}
        </CardBody>
      </Card>
    </PageContainer>
  );
}

/** 조건을 주소로. 빈 값은 싣지 않는다 — 주소는 공유되는 것이라 짧을수록 낫다. */
function href({ q, person }: { q?: string; person?: string }) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (person) params.set("person", person);
  const qs = params.toString();
  return qs ? `/org?${qs}` : "/org";
}

/** 이 줄이 찾는 말에 걸리는가. 부서명·하는 일·그 줄의 사람 전부를 본다. */
function matches(unit: OrgUnit, bureauName: string, term: string) {
  const needle = term.toLowerCase();
  const hay = [
    bureauName,
    unit.dept.name,
    unit.dept.description ?? "",
    ...unit.people.flatMap((p) => [p.name, p.position]),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}
