import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  FileSignature,
  Inbox,
  Cog,
  PenLine,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { canMutate } from "@/lib/env";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { CARD_SURFACE, Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/status-badge";
import { HandoverScreen } from "@/components/handover/handover-screen";
import { formatDate, formatDueLabel } from "@/lib/format";
import { getHandoverFor, listHandovers, listWorks, roleIn } from "@/lib/data";
import type { HandoverView } from "@/lib/data";
import { requireViewer } from "@/lib/session";
import { isHandoverBlockKey, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "인계·인수" };

/**
 * 인계·인수.
 *
 * 이 화면이 제품의 결론이다.
 *
 * 협업 기록이 쌓여 있으면 인계서는 새로 쓰는 문서가 아니라 **정리해서 뽑는 문서**가 된다.
 * 그래서 초안의 모든 항목에 "어느 기록에서 나왔는지"를 붙였다.
 * 인계자가 확인할 것은 문장의 매끄러움이 아니라 근거의 정확성이다.
 *
 * 마지막 단계에서 실제로 권한이 옮겨 간다. 되돌릴 수 없으므로 확인을 한 번 더 받는다.
 *
 * ── 화면 본문은 여기 없다 ──────────────────────────────────────────────────
 *
 * `handover-screen.tsx` 가 그린다. `/handover/[id]` 가 **같은 화면**을 써야
 * 하기 때문이다 — 지난 인계서만 다르게 그리면 그 순간 「지난 인계서는 좀
 * 다릅니다」가 되고, 인계서는 그런 문서가 아니다.
 *
 * ── `?start=1` 이 있는 이유 ────────────────────────────────────────────────
 *
 * 이 주소는 언제나 **최신 인계**를 그린다(getHandoverFor). 그래서 인계가
 * 하나라도 있으면 「지금 넘긴다면 무엇이 실리나」를 말하는 첫 화면에 **닿을
 * 방법이 없었다.** 라우트를 새로 파지 않고 물음표 하나로 그 문을 연다.
 */
export default async function HandoverPage({
  searchParams,
}: PageProps<"/handover">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const view = await getHandoverFor(viewer);

  // 첫 화면을 일부러 부른 것인가. 값은 보지 않는다 — 있으면 그것이 뜻이다.
  //
  // 진행 중인 건이 있어도 열어 준다. 그것이 이 물음표의 목적이다. 다만 **돌아갈
  // 길을 같이 준다** — 안 그러면 여기가 막다른 길이 된다. 이 화면의 「인계
  // 시작하기」는 한 번에 한 건이라는 규칙에 막혀 오류로 끝나므로(startHandover),
  // 진행 중인 건이 있을 때는 그 단추 대신 「진행 중인 인계 보기」를 그린다.
  const wantsStart = sp.start !== undefined;

  if (wantsStart || !view) {
    return (
      <HandoverStandby viewer={viewer} msg={sp.msg} current={view ?? null} />
    );
  }

  // 「보충으로 넣기」가 보낸 자리. 둘 다 아는 값일 때만 넘긴다 — 칸 이름은
  // 아는 목록으로 거르고, 기록 키는 화면이 자기 초안 안에서 다시 찾는다.
  const fill =
    typeof sp.fill === "string" && isHandoverBlockKey(sp.block)
      ? { key: sp.fill, block: sp.block }
      : null;

  return (
    <HandoverScreen view={view} viewer={viewer} msg={sp.msg} fill={fill} />
  );
}

/**
 * 진행 중인 인계가 없을 때의 화면.
 *
 * ── 왜 빈 화면이면 안 되는가 ──────────────────────────────────────────────
 *
 * 이 화면은 제품의 결론이다. 그런데 진행 중인 인계 건은 한 사람이 몇 년에 한 번
 * 갖는 것이고, 데모 계정 넷 중 둘(김서연·최민재)은 인계 당사자가 아니다.
 * 그 둘로 들어와 왼쪽 메뉴에서 「인계·인수」를 누르면 — 즉 심사위원이 처음 받는
 * 계정으로 가장 궁금한 메뉴를 누르면 — **아이콘 하나와 단추 하나가 있는 빈 판**이
 * 나왔다. 제품의 결론이 백지였다.
 *
 * ── 그래서 무엇을 그리는가 ────────────────────────────────────────────────
 *
 * 없는 인계를 지어내지 않는다. 대신 **지금 넘긴다면 무엇이 실리는지**를 실제로
 * 세어 보여 준다. 이 숫자는 꾸민 것이 아니라 그 계정이 주담당인 업무에서 그대로
 * 나온 것이고, 그래서 계정마다 다르다.
 *
 * 「평소 협업의 부산물이 곧 인수인계서가 된다」가 이 제품의 설계 원리다.
 * 그 원리는 인계가 시작되기 **전에도** 참이어야 하고, 이 화면이 그것을 말한다.
 *
 * 세는 것은 listWorks 가 이미 돌려주는 값뿐이다(대화·첨부 수). 이력을 함께
 * 세려면 업무마다 질의를 더 돌려야 하는데, 아직 시작하지도 않은 인계의
 * 미리보기가 그만큼의 비용을 쓸 이유가 없다.
 *
 * ⚠ **여기에 숫자를 더 세우지 않는다.** 문서 수는 이제 `listWorks` 가 돌려주므로
 * 한 칸 더할 수 있었고, 실제로 더해 봤다가 걷어냈다 — 실눈 시험의 자리 검사가
 * 그 순간 빨간불이 됐다(1등 칸이 문서 사각형보다 위로 올라갔다). 이 판은
 * 여백 등급이고 아래 「넘길 수 있는 업무」가 문서다. 문서 수가 값하는 자리는
 * 여기가 아니라 **업무마다 붙는 「인계 시작」 화면**이다(handover/new).
 */
async function HandoverStandby({
  viewer,
  msg,
  /**
   * 지금 진행 중인 인계. `?start=1` 로 일부러 이 화면을 열었을 때만 있다.
   * 있으면 이 화면은 막다른 길이 아니라 **갈림길**이 되어야 한다.
   */
  current,
}: {
  viewer: Profile;
  msg: string | string[] | undefined;
  current: HandoverView | null;
}) {
  const mine = await listWorks(viewer, { mine: true });
  const owned = mine.filter((w) => roleIn(w, viewer) === "owner");

  const comments = owned.reduce((n, w) => n + w.comment_count, 0);
  const attachments = owned.reduce((n, w) => n + w.attachment_count, 0);
  const repeating = owned.filter((w) => w.previous_year).length;
  const departments = new Set(owned.map((w) => w.department_id)).size;
  const overdue = owned.filter((w) => w.derived === "overdue").length;

  return (
    <PageContainer>
      {/* 이름표는 물러난다. 「인계·인수」는 왼쪽 메뉴에서 이미 켜져 있고, 같은
          라우트의 진행 중 화면이 이미 size="sm" 이다 — 한 화면이 상태에 따라
          제목 크기가 달라지고 있었다.

          그리고 이 화면이 하러 온 일은 **인계를 시작하는 것**이다. 그 단추가
          오른쪽 곁칸 설명 카드 맨 아래에 있었다 — 화면의 목적이 곁칸 각주에
          들어가 있었던 셈이라, 머리 줄의 동작 자리로 올린다. */}
      <PageHeader
        size="sm"
        title="인계·인수"
        description="시행규칙 별지 제12호서식을 그대로 따릅니다."
        action={
          /* 진행 중인 건이 있으면 「시작하기」를 안 그린다 — 한 번에 한 건이라
             startHandover 가 거절하고, 화면이 시킨 일이 오류로 끝난다.
             그 자리에 돌아가는 길을 둔다. */
          current ? (
            <ButtonLink href="/handover">
              <FileSignature aria-hidden className="size-4" />
              진행 중인 인계 보기
            </ButtonLink>
          ) : canMutate && owned.length > 0 ? (
            <ButtonLink href="/handover/new">
              <FileSignature aria-hidden className="size-4" />
              인계 시작하기
            </ButtonLink>
          ) : null
        }
      />
      <ActionFeedback msg={msg} className="mb-4" />

      {owned.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="진행 중인 인계·인수가 없습니다"
            description="넘길 수 있는 것은 내가 주담당인 업무뿐입니다. 지금은 주담당인 업무가 없습니다."
            action={
              <ButtonLink href="/works" variant="secondary">
                업무 보드로 가기
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            {/* ── 이 문단과 아래 숫자는 「여백」이다 ─────────────────────────
                한동안 여기가 **주황 채움 판**이었고, 그 아래가 **통계 타일 넉
                줄**이었다. 화면을 열면 그 둘이 가장 무거웠고, 정작 넘길 업무
                목록은 그 아래로 밀렸다.

                DESIGN.md §5.1 이 못박은 것이 정확히 이것이다 — **「화면의
                「문서」는 사용자가 누를 대상이어야 한다. 요약 배너·통계 타일은
                아무리 커도 여백 등급이다.」** 업무 보드와 결재함이 같은 함정에서
                이미 빠져나왔고, 이 화면만 남아 있었다.

                말을 지우는 것이 아니라 무게를 맞춘다. 채움과 테두리를 걷고
                왼쪽 선 하나만 남긴다. */}
            <p className="mb-5 flex items-start gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm leading-relaxed break-keep text-gray-60">
              <Cog aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
              <span>
                아래 숫자는 예시가 아니라 {viewer.name} {viewer.position} 님이
                주담당인 업무에서{" "}
                <strong className="font-bold text-gray-70">지금 세어 본 것</strong>
                입니다. 인계를 시작하면 이 기록이 별지 제12호서식의 순서대로
                조립되고, 항목마다 어느 기록에서 나왔는지가 함께 붙습니다.{" "}
                <strong className="font-bold text-gray-70">
                  인계서를 위해 따로 적어 둔 것은 한 줄도 없습니다.
                </strong>
              </span>
            </p>

            <Card variant="quiet" className="mb-6">
              <CardHeader variant="quiet" title="지금 넘긴다면" as="h2" />
              <CardBody variant="quiet">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                  {/* 꼬리말은 그 숫자가 서식 어디로 가는지만 적는다.
                      「대화」에 「원문 그대로 실린다」고 적었다가 고쳤다 —
                      대화가 전부 실리는 것이 아니라 현안 규칙에 걸린 것만
                      인용된다. 세는 수와 실리는 수가 다른데 같은 것처럼
                      적으면, 옆에 붙은 근거 꼬리표와 같은 종류의 거짓이 된다. */}
                  {[
                    ["업무", owned.length, "주담당인 것만"],
                    ["대화", comments, "현안에 걸린 것이 원문 그대로 인용된다"],
                    ["첨부", attachments, "서식 2장에 목록으로"],
                    ["연간 반복", repeating, "작년 판이 붙어 있다"],
                  ].map(([label, value, hint]) => (
                    <div key={label as string}>
                      <dt className="text-body-xs font-bold text-gray-60">
                        {label}
                      </dt>
                      {/* 파랑이었다. 이 제품에서 파랑은 「누를 수 있는 것」
                          하나만 가리키는데(globals.css 의 4갈래), 이 숫자들은
                          눌리지 않는다. 색 언어가 거짓말을 하고 있었다 —
                          정보는 먹색이다. */}
                      <dd className="mt-1 text-h2 leading-none font-bold tabular-nums text-gray-90">
                        {value}
                        <span className="ml-1 text-body-sm font-normal text-gray-60">
                          건
                        </span>
                      </dd>
                      <p className="mt-2 text-body-xs break-keep text-gray-60">
                        {hint}
                      </p>
                    </div>
                  ))}
                </dl>
              </CardBody>
              {/* 「빠뜨리면 비싼 것」을 따로 말한다. 인계에서 가장 먼저 사라지는
                  것이 지연 사유와 해마다 반복되는 일의 작년 맥락이기 때문이다.
                  채움(bg-gray-5)을 걷고 선 하나로 끊는다 — 이 판 전체가 여백
                  등급으로 내려왔으므로 안쪽에 다시 면을 깔면 도로 판이 된다. */}
              {overdue > 0 || repeating > 0 ? (
                <div className="mt-5 border-t border-rule-hair pt-4">
                  <ul className="flex flex-col gap-2">
                    {overdue > 0 ? (
                      <li className="flex gap-2 text-body-sm break-keep text-gray-70">
                        <PenLine
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-danger"
                        />
                        <span>
                          기한이 지난 업무 {overdue}건. 왜 멈췄는지가 문서와
                          대화에 남아 있으면 그대로 실립니다. 담당자가 바뀔 때
                          가장 먼저 사라지는 것이 이 「왜」입니다.
                        </span>
                      </li>
                    ) : null}
                    {repeating > 0 ? (
                      <li className="flex gap-2 text-body-sm break-keep text-gray-70">
                        <RotateCcw
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-accent-text"
                        />
                        <span>
                          해마다 반복되는 업무 {repeating}건. 작년 판이 함께
                          걸려 있어 인수자가 작년 시행착오부터 읽을 수 있습니다.
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </Card>

            {/* ── 이 화면의 「문서」 ─────────────────────────────────────────
                위의 요약과 숫자가 여백으로 내려온 자리에 이것이 선다.
                **인계에서 사람이 실제로 다루는 물건은 이 목록**이고, 여기서
                「인계 시작하기」로 간다. 흰 종이 + 위쪽 2px 먹선 —
                결재함·쪽지함·알림·열람기록이 이미 같은 모양이다. */}
            <h2 className="mb-3 text-h3 font-bold text-gray-90">
              넘길 수 있는 업무
              <span className="ml-2 text-body-sm font-normal tabular-nums text-gray-60">
                {owned.length}건
              </span>
            </h2>
            <p className="mb-3 text-body-sm break-keep text-gray-60">
              {departments}개 부서 소관. 편집자·열람자로 참여만 한 업무는 주담당이
              따로 있어 여기 없습니다.
            </p>
            <div
              data-rank="doc"
              className={cn(
                CARD_SURFACE.doc,
                "divide-y divide-rule-hair overflow-hidden",
              )}
            >
              <ul className="divide-y divide-rule-hair">
                {owned.map((w) => (
                  <li key={w.id} className="px-5 py-4">
                    {/* 18px 짜리 글줄 하나가 과녁이었다. 보이는 크기는 그대로
                        두고 눌리는 높이만 벌린다(2.5.5 의 44px). */}
                    <Link
                      href={`/works/${w.id}`}
                      className="inline-flex items-center text-body-sm font-bold break-keep text-gray-90 pointer-coarse:min-h-11 transition-colors duration-150 hover:text-primary"
                    >
                      {w.title}
                    </Link>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={w.derived} size="sm" />
                      <span className="text-body-xs text-gray-60">
                        {w.due_date
                          ? `${formatDate(w.due_date)} (${formatDueLabel(w.due_date)})`
                          : "마감 없음"}
                      </span>
                      {w.previous_year ? (
                        <span className="inline-flex items-center gap-1 text-body-xs font-bold text-accent-text">
                          <RotateCcw aria-hidden className="size-3" />
                          연간 반복
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── 옆칸 ──────────────────────────────────────────────────────────
              설명과 안내다. 왼쪽 문서와 같은 테두리를 두르고 있으면 둘이
              동급으로 읽힌다 — 여백 등급으로 물린다(card.tsx 의 quiet). */}
          <div className="flex flex-col gap-6">
            <Card variant="quiet">
              <CardHeader variant="quiet" title="인계를 시작하면" as="h2" />
              <CardBody variant="quiet">
                <ol className="flex flex-col gap-4">
                  {[
                    [
                      "대상 선정",
                      "넘길 업무와 인수자만 고릅니다. 사람이 적는 것은 여기까지입니다.",
                    ],
                    [
                      "초안 생성",
                      "쌓인 기록에서 별지 제12호서식 순서대로 뽑습니다. 항목마다 근거가 붙습니다.",
                    ],
                    [
                      "인계자 확인",
                      "근거가 맞는지 봅니다. 물품·예산처럼 근거가 없는 칸은 비워 두고 직접 적습니다.",
                    ],
                    [
                      "인계 완료",
                      "주담당이 실제로 바뀌고, 넘긴 사람에게는 열람 권한이 남습니다.",
                    ],
                  ].map(([term, desc], i) => (
                    <li key={term} className="flex gap-3">
                      <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-10 text-body-xs font-bold tabular-nums text-gray-70">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-body-sm font-bold text-gray-90">
                          {term}
                        </p>
                        <p className="mt-1 text-body-xs leading-relaxed break-keep text-gray-60">
                          {desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardBody>
              {/* 「인계 시작하기」가 여기 있었다 — 곁칸 설명 카드의 맨 아래.
                  이 화면이 하러 온 일이 각주 자리에 있었던 셈이라 머리 줄의
                  동작 자리로 올렸다. 같은 단추를 두 번 두지 않는다. */}
            </Card>

            {/* 데모에서 실제로 굴러가는 인계 건이 어디 있는지 알려 준다.
                이 계정은 인계 당사자가 아니므로, 여기서 「시작하기」를 눌러 새로
                만드는 것 말고 **이미 진행 중인 것을 보는 길**도 있어야 한다.
                (정책이 당사자에게만 보여 주므로 계정을 바꿔야 열린다) */}
            <Card variant="quiet">
              <CardHeader variant="quiet" title="진행 중인 인계를 보려면" as="h2" />
              <CardBody variant="quiet">
                <p className="text-body-sm leading-relaxed break-keep text-gray-60">
                  인계·인수 문서는 <strong className="font-bold text-gray-80">
                    넘기는 사람과 받는 사람에게만
                  </strong>{" "}
                  보입니다. 화면이 아니라 정책(handover_select)이 그렇게
                  정해 두었습니다.
                </p>
                <p className="mt-3 text-body-sm leading-relaxed break-keep text-gray-60">
                  시연용으로 준비된 인계 건은 자원순환과{" "}
                  <strong className="font-bold text-gray-80">박준호 → 이하람</strong>{" "}
                  입니다. 오른쪽 위 「계정 전환」에서 두 사람 중 하나로 들어가면
                  초안·근거 표시·실행까지 볼 수 있습니다.
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* ── 끝난 인계 ──────────────────────────────────────────────────────
          두 갈래 **바깥**이다. 넘길 업무가 없는 사람에게 더 필요하기
          때문이다 — 전부 넘기고 나면 `owned` 가 비고, 그러면 위쪽은
          「주담당인 업무가 없습니다」 한 줄이 된다. 방금 끝낸 인계서가
          그 화면에서 사라지는 것이 정확히 이 목록이 없어서 생긴 일이었다. */}
      <PastHandovers viewer={viewer} />
    </PageContainer>
  );
}

/**
 * 끝난 인계 목록.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 *
 * `getHandoverFor` 는 최신 한 건만 돌려준다. 그래서 **새 인계를 시작하는
 * 순간 끝난 인계서가 화면에서 사라졌다** — 행은 남아 있는데 볼 길이 없었고,
 * 한/글 내려받기도 같이 죽었다(그 라우트도 같은 함수를 쓴다).
 *
 * 인계서는 결재에 올라가는 공문서다. 「지난번 것은 못 봅니다」는 이 제품이
 * 할 수 있는 말이 아니다.
 *
 * ── 왜 이 판이 「여백」인가 ────────────────────────────────────────────────
 *
 * 목록이 말하는 것은 「언제 · 누구에게 · 몇 건」뿐이다. 업무 제목을 여기
 * 적기 시작하면 이 판이 문서 등급이 되고, 그러면 위의 「넘길 수 있는 업무」와
 * 무게를 다툰다 — 이 화면이 하러 온 일은 인계를 **시작하는** 것이다.
 * (DESIGN.md §5.1 · 같은 이유로 통계 타일을 이미 한 번 걷어냈다)
 *
 * 진행 중인 건은 안 싣는다. 그것은 `/handover` 가 그리는 화면이고, 목록에
 * 같이 두면 같은 문서로 가는 길이 둘이 된다.
 */
async function PastHandovers({ viewer }: { viewer: Profile }) {
  const done = (await listHandovers(viewer)).filter(
    (h) => h.status === "completed",
  );
  if (done.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-body-sm font-bold text-gray-90">끝난 인계</h2>
      {/* 줄로 쌓는다 — 카드로 쪼개면 지난 문서가 위의 업무 목록보다 무거워진다.
          `screening-panel.tsx` 가 이미 쓰는 모양(탭 없이 줄로 쌓기)이다. */}
      <ul className="border-t border-rule-hair">
        {done.map((h) => (
          <li key={h.id} className="border-b border-rule-hair">
            <Link
              href={`/handover/${h.id}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 py-3 hover:bg-gray-5"
            >
              <span className="text-body-sm font-bold text-gray-90">
                {h.from.name} {h.from.position} → {h.to.name} {h.to.position}
              </span>
              {/* 대상 수가 아니라 **실제로 옮겨 간 수**다. 인계서를 만든 뒤
                  소유 권한이 바뀐 업무는 execute_handover 가 건너뛰므로 둘이
                  다를 수 있다(화면 안쪽이 이미 이 수를 말한다). */}
              <span className="text-body-sm text-gray-60">
                업무 {h.transferredCount}건
              </span>
              <span className="ml-auto text-body-xs text-gray-60">
                {formatDate(h.completed_at ?? h.created_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-body-xs leading-relaxed break-keep text-gray-60">
        끝난 인계서는 고칠 수 없습니다. 열어서 읽고 한/글 파일로 내려받을 수
        있습니다.
      </p>
    </section>
  );
}
