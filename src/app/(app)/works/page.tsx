import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Filter,
  Lock,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { KanbanBoard } from "@/components/work/kanban-board";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { GetForm } from "@/components/ui/get-form";
import { Notice } from "@/components/ui/notice";
import { LinkPending } from "@/components/ui/link-pending";
import { SubmitButton } from "@/components/ui/submit-button";
import { archiveWorks, restoreWorks } from "@/lib/actions/works";
import {
  getApprovalSummaries,
  getDepartmentTree,
  listWorks,
  countOverdueWorks,
  roleIn,
} from "@/lib/data";
import { WORKS_LIMIT } from "@/lib/data/types";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "업무 보드" };

/** 주소에서 온 부서 id 가 uuid 모양인가. 아니면 DB 에 넘기지 않는다(22P02 방지). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 업무 보드.
 *
 * 필터 상태는 전부 주소에 있다. 화면 안 상태로만 두면
 * "지연된 업무만 걸러 놓은 이 화면"을 옆자리에 보낼 수가 없다.
 * 새로고침해도 유지되고, 브라우저 뒤로 가기도 그대로 동작한다.
 */
export default async function WorksPage({ searchParams }: PageProps<"/works">) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : "";
  const deptParam = typeof sp.dept === "string" ? sp.dept : "";
  const mine = sp.mine === "1";
  const overdueOnly = sp.overdue === "1";
  const archived = sp.archived === "1";
  /* 정리 모드. 데모(읽기 전용)에서는 켜지 않는다 — 고를 수는 있는데 옮길 수
     없는 화면이 되고, 그건 눌리지 않는 단추를 보여 주는 것과 같다. */
  const selecting = sp.select === "1" && canMutate;

  // 부서 목록과 업무 목록은 서로를 기다릴 이유가 없다. 예전에는 트리를 받아
  // 「아는 부서인가」를 판정한 **뒤에** 업무를 물었는데, 그 검사는 값이 조직도에
  // 있는지 보는 것뿐이라 뒤로 미룰 수 있다. 그래서 우선 그대로 걸어 두 질의를
  // 한꺼번에 던지고, 모르는 부서였던 것으로 밝혀지면 그때만 다시 묻는다.
  // (사람은 <select> 에서 고르므로 다시 묻는 경우는 주소를 손으로 고쳤을 때뿐이다)
  //
  // 다만 모양이 uuid 인지는 **여기서 먼저** 본다. 아무 문자열이나 그대로 넘기면
  // Postgres 가 22P02 로 질의를 거절해 화면이 500 이 된다(/works?dept=notauuid).
  // 예전에는 트리 대조가 그 역할까지 겸했다 — 순서를 바꾸면서 빠진 검사다.
  const guessDept = UUID.test(deptParam) ? deptParam : undefined;

  const [tree, worksForGuess] = await Promise.all([
    getDepartmentTree(),
    listWorks(viewer, {
      q,
      departmentId: guessDept,
      mine,
      overdueOnly,
      archived,
    }),
  ]);

  const knownDept = tree.some(
    (b) => b.id === deptParam || b.children.some((c) => c.id === deptParam),
  );
  const departmentId = knownDept ? deptParam : undefined;

  const works =
    guessDept && !knownDept
      ? await listWorks(viewer, { q, mine, overdueOnly, archived })
      : worksForGuess;

  // 「지연 n건」 알림에 쓸 수.
  //
  // 예전에는 두 갈래였다 — 조건이 같으면 방금 받은 목록에서 세고, 다르면 같은
  // 표를 조건만 바꿔 **한 번 더 불러** 셌다. 뒤쪽은 임베드 6종을 달고 나가는
  // 제일 무거운 질의였고 세는 데만 쓰고 버렸다.
  //
  // 목록에 상한이 생기면서 앞쪽도 못 쓰게 됐다. 100건까지만 받아 놓고 세면
  // 101번째 지연 업무가 수에서 빠지고, 그러면 화면이 「지연 2건」이라 적어 놓고
  // 실제로는 셋인 상태가 된다. 개수는 행을 받지 않고 DB 가 센 것을 받는다.
  const overdueCount = await countOverdueWorks(viewer, { q, departmentId });

  // 상한에 닿았는가. 결재함이 쓰는 판정과 같다 — 받은 수가 상한이면 더 있을 수
  // 있다고 본다. 「말하지 않는 상한은 「전부 다 봤다」로 읽힌다」.
  const truncated = works.length >= WORKS_LIMIT;

  // 결재 진행률은 업무마다 묻지 않는다. 화면에 뜬 업무 전부를 한 번에 가져온다.
  const approvals = await getApprovalSummaries(
    viewer,
    works.map((w) => w.id),
  );

  /** 지금 걸린 조건을 유지한 채 하나만 바꾼 주소를 만든다 */
  const linkWith = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (departmentId) params.set("dept", departmentId);
    if (mine) params.set("mine", "1");
    if (overdueOnly) params.set("overdue", "1");
    if (archived) params.set("archived", "1");
    if (selecting) params.set("select", "1");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/works?${s}` : "/works";
  };

  // 보관함은 다른 조건과 섞이면 "지연된 보관 업무"처럼 뜻이 흐려진다.
  // 고를 때 나머지를 비우고, 나머지를 고르면 보관함에서 나온다.
  const chips = [
    {
      label: "전체",
      href: linkWith({ mine: null, overdue: null, archived: null }),
      on: !mine && !overdueOnly && !archived,
    },
    {
      label: "내 업무",
      href: linkWith({ mine: "1", overdue: null, archived: null }),
      on: mine && !overdueOnly && !archived,
    },
    {
      label: "지연만",
      href: linkWith({ overdue: "1", mine: null, archived: null }),
      on: overdueOnly && !archived,
    },
    {
      label: "보관함",
      href: linkWith({ archived: "1", mine: null, overdue: null }),
      on: archived,
    },
  ];

  return (
    <PageContainer>
      {/* 이름표는 물러난다. 「업무 보드」는 왼쪽 메뉴에서 이미 켜져 있고, 매번
          같은 글자다 — 정보량이 0인 문장이 34px 로 화면의 1등이면 그 화면에는
          1등이 없는 것과 같다. 이 화면의 1등은 아래 「기한이 지난 업무」다. */}
      <PageHeader
        size="sm"
        title={
          selecting ? (archived ? "보관함 정리" : "업무 보드 정리") : "업무 보드"
        }
        action={
          canMutate && !selecting ? (
            <>
              {/* 「정리」는 보관함에서 특히 필요하다 — 되돌릴 길이 여기 말고
                  없다. 평소 보드에서는 새 업무 왼쪽에 조용히 둔다. */}
              <ButtonLink
                href={linkWith({ select: "1" })}
                variant="secondary"
              >
                <Archive aria-hidden className="size-4" />
                정리
              </ButtonLink>
              <ButtonLink href="/works/new">
                <Plus aria-hidden className="size-4" />새 업무
              </ButtonLink>
            </>
          ) : null
        }
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {/* ── 지연 알림은 「여백」이다 ─────────────────────────────────────────
          한동안 이 자리에 문서 등급의 거대 배너가 있었다 — 흰 종이 125px 에
          46px 짜리 붉은 숫자. 실눈 시험은 통과했다. 덩어리가 하나 생겼으니까.
          그런데 그 덩어리가 **눌러야 할 일이 아니라 개수를 세는 상자**였다.

          세 가지가 어긋나 있었다.
            ① 화면에서 가장 큰 글자가 **합계**였다. 홈 화면 주석이 금지한 바로
               그것이다 — "알고 싶은 건 합계가 아니라 다음 할 일이다."
            ② 같은 사실이 화면에 세 번 있었다(배너 · 「지연만」 칩 ·
               대기 열의 「지연 2」 배지).
            ③ 이 파일의 주석은 "이 화면의 1등은 지연된 업무다"라고 적어 놓고,
               정작 1등으로 세운 것은 **업무가 아니라 배너**였다.

          규칙으로 못박는다(DESIGN.md §5.1): **화면의 「문서」는 사용자가 누를
          대상이어야 한다.** 요약 배너·통계 타일은 아무리 커도 여백 등급이다.

          그래서 이 줄은 44px 한 줄로 물러나고, 문서 등급은 아래 **지연된
          카드 그 자체**로 간다(work-card.tsx). 왼쪽 3px 경보선만 남겨 이 줄과
          그 카드가 같은 말을 하고 있음을 잇는다. */}
      {overdueCount > 0 && !overdueOnly && !archived && !selecting ? (
        <Link
          href={linkWith({ overdue: "1", mine: null })}
          className={cn(
            "mb-4 flex min-h-11 items-center gap-2 border-l-3 border-l-rule-alarm px-3",
            "text-body font-bold text-status-overdue-text",
            // 테두리가 아니라 바탕으로 알린다 — hover:border-* 는 의사클래스라
            // 네 변을 통째로 덮어 왼쪽 경보선까지 지운다(urgent-hero.tsx 주석).
            "transition-colors duration-150 hover:bg-status-overdue-bg active:bg-status-overdue-bg",
          )}
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          <span>
            기한이 지난 업무 <span className="tabular-nums">{overdueCount}</span>건
          </span>
          <span className="text-body-sm font-normal text-gray-60">지연만 보기</span>
          {/* 물음표 뒤만 바뀌는 같은 화면 이동이라 본문 자리를 갈지 않는다 —
              눌렸다는 표시가 이 자리에 있어야 한다(아래 조건 칩과 같은 이유). */}
          <LinkPending />
        </Link>
      ) : null}

      {archived ? (
        <Notice tone="info" title="보관함을 보고 있습니다" className="mb-4">
          보관은 삭제가 아닙니다. 소유자가 해제하면 원래 목록으로 돌아옵니다.
        </Notice>
      ) : null}

      {/* ── 조건 ───────────────────────────────────────────────────────────
          예전에는 이 폼이 늘 펼쳐진 채 첫 화면을 먹었다. 390px 에서는 화면의
          42%가 필터였고 업무 카드는 한 장만 보였다. 자주 쓰는 조건은 아래 칩
          네 개로 충분하므로, 검색어·부서는 접어 두고 걸려 있을 때만 편다.

          「내 업무만」 체크박스는 없앴다. 아래 「내 업무」 칩과 같은 일을 하는데
          주인이 둘이라, 지연만 + 내 업무만을 함께 걸면 칩 줄이 그 사실을 숨겼다.
          이제 mine 의 주인은 칩 하나뿐이고, 폼은 그 값을 그대로 들고 간다. */}
      <details
        open={Boolean(q) || Boolean(departmentId)}
        className="mb-4 rounded-sm border border-rule-frame bg-surface"
      >
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-body-sm font-bold text-gray-70">
          <Filter aria-hidden className="size-4 text-gray-40" />
          검색어·부서로 좁히기
          {q || departmentId ? (
            <span className="text-body-xs text-primary">
              걸림
            </span>
          ) : null}
        </summary>
        {/* GetForm — 스크립트가 있으면 화면을 갈지 않고 옮긴다.
            평범한 GET 폼은 전체 페이지 로드라, 조건을 한 번 걸고 나면 그 뒤의
            앞으로·뒤로가 전부 bfcache 없이 서버까지 갔다 왔다. get-form.tsx 참고. */}
        <GetForm action="/works" className="border-t border-rule-hair p-4">
          {/* 칸으로 그리지 않은 조건은 제출할 때 사라진다.
              보관함에서 검색하면 보관함 밖으로 튕겨 나가고, 그건 고장으로 보인다. */}
          {overdueOnly ? (
            <input type="hidden" name="overdue" value="1" />
          ) : null}
          {archived ? <input type="hidden" name="archived" value="1" /> : null}
          {mine ? <input type="hidden" name="mine" value="1" /> : null}

          {/* items-end 로 맞춘다. 라벨이 붙은 칸(검색·부서)은 라벨 높이만큼 위가
            길고, 라벨이 없는 것(체크박스·버튼)은 그렇지 않다. 가운데로 맞추면
            체크박스만 몇 px 내려앉아 한 줄이 삐뚤어 보인다.
            검색칸은 flex-1 로 두지 않는다 — 넓은 화면에서 혼자 다 먹으면
            시선이 그쪽으로 쏠려, 정작 먼저 읽혀야 할 보드가 뒤로 밀린다. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              id="works-q"
              label="검색"
              className="min-w-0 flex-1 sm:max-w-xs"
            >
              {(p) => (
                <Input
                  {...p}
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="업무 제목이나 설명에 들어간 말"
                  autoComplete="off"
                />
              )}
            </Field>

            <Field id="works-dept" label="부서" className="min-w-0 sm:w-56">
              {(p) => (
                <Select {...p} name="dept" defaultValue={departmentId ?? ""}>
                  <option value="">전체 부서</option>
                  {tree.map((bureau) =>
                    bureau.children.length === 0 ? (
                      <option key={bureau.id} value={bureau.id}>
                        {bureau.name}
                      </option>
                    ) : (
                      <optgroup key={bureau.id} label={bureau.name}>
                        {bureau.children.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ),
                  )}
                </Select>
              )}
            </Field>

            <Button type="submit" className="sm:ml-auto sm:w-auto">
              <Filter aria-hidden className="size-4" />
              적용
            </Button>
          </div>
        </GetForm>
      </details>

      {/* ── 빠른 조건 ───────────────────────────────────────────────────────
          이름 없는 링크 네 개가 떠 있었다. 스크린리더로 들으면 「전체 / 내 업무
          / 지연만 / 보관함」이 무엇의 목록인지 알 수 없다. nav 로 묶어 이름을
          준다. 높이도 38px → 44px 로 올린다
          (2.5.5 AAA. AA 기준선인 2.5.8 은 24px 이고 그건 최소이지 목표가 아니다). */}
      <nav aria-label="업무 걸러 보기" className="mb-4">
        <ul className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <li key={c.label}>
              <Link
                href={c.href}
                aria-current={c.on ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-body-sm font-bold transition-colors duration-150",
                  // 누르는 즉시 칠해진다(브라우저가 한다 — 자바스크립트 대기 없음)
                  "active:bg-primary-10 active:text-primary",
                  c.on
                    ? "border-primary bg-primary-5 text-primary"
                    : "border-gray-50 bg-surface text-gray-60 hover:bg-gray-5",
                )}
              >
                {c.label}
                {/* 조건 칩은 물음표 뒤만 바뀌는 같은 화면 이동이라 본문 자리를
                    갈지 않는다(use-nav-pending 의 sameScreen). 눌렸다는 표시가
                    이 자리에 있어야 한다 — 없으면 새 목록이 올 때까지
                    383~448ms 동안 화면이 완전히 정지한다. */}
                <LinkPending />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* 결과 수가 바뀐 것을 스크린리더에도 알린다 */}
      <p aria-live="polite" className="sr-only">
        업무 {works.length}건이 표시되고 있습니다.
      </p>

      {/* ── 정리 모드 ──────────────────────────────────────────────────────
          보관은 원래 `/works/[id]/edit` 안에만 있었다. 업무 상세로 들어가서
          「업무 고치기」를 누르고 맨 아래까지 내려가야 하는 자리라, 보관함에
          쌓인 업무를 되돌리려면 **한 건마다 세 번씩** 눌러야 했다.

          모드를 주소에 둔다(?select=1). 이 화면의 규약이 원래 그렇고
          (파일 머리글의 「필터 상태는 전부 주소에 있다」), 그래야 스크립트
          없이도 켜지고 뒤로가기로 꺼진다.

          평소 보드에는 체크박스가 없다. 하루 여덟 시간 띄워 두는 화면에서
          늘 켜져 있는 선택칸은 그 자체로 소음이다. */}
      {selecting ? (
        <form action={archived ? restoreWorks : archiveWorks}>
          {/* 어디로 돌아갈지 폼이 들고 간다. 액션은 safeNext 로 한 번 더 거른다
              — 서버 액션은 화면을 거치지 않고 POST 로 직접 부를 수 있다. */}
          <input type="hidden" name="back" value={linkWith({ select: null })} />

          <KanbanBoard
            works={works}
            approvals={approvals}
            meId={viewer.id}
            pickOf={(w) =>
              roleIn(w, viewer) === "owner" ? "pick" : "locked"
            }
          />

          {/* 화면 아래에 붙여 둔다. 칸반은 세로로 길어서, 위에 두면 아래쪽
              카드를 고르는 동안 단추가 화면 밖으로 나간다. */}
          <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule-frame bg-surface px-4 py-3">
            <p className="min-w-0 flex-1 text-body-sm break-keep text-gray-70">
              {archived
                ? "고른 업무를 보드로 되돌립니다."
                : "고른 업무를 보관합니다. 삭제가 아니라 목록에서 내리는 것이고, 문서·대화·이력은 그대로 남습니다."}
              {/* 자물쇠가 붙은 카드가 왜 잠겼는지는 **여기서 한 번만** 말한다.
                  카드마다 적으면 남의 업무가 열한 장일 때 같은 문장이 열한 번
                  반복된다(work-card.tsx 의 같은 주석). */}
              <span className="mt-1 flex items-center gap-1 text-body-xs text-gray-60">
                <Lock aria-hidden className="size-3 shrink-0" />
                자물쇠가 붙은 업무는 내가 주담당이 아니라 고를 수 없습니다.
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <ButtonLink
                href={linkWith({ select: null })}
                variant="ghost"
                size="sm"
              >
                그만두기
              </ButtonLink>
              <SubmitButton size="sm">
                {archived ? (
                  <>
                    <ArchiveRestore aria-hidden className="size-4" />
                    보드로 되돌리기
                  </>
                ) : (
                  <>
                    <Archive aria-hidden className="size-4" />
                    보관하기
                  </>
                )}
              </SubmitButton>
            </div>
          </div>
        </form>
      ) : (
        <KanbanBoard works={works} approvals={approvals} meId={viewer.id} />
      )}

      {/* 잘랐으면 말한다. 결재함이 세워 둔 규약이고(§ listApprovals), 보드가
          그 규약 밖에 있던 것이 이번에 고친 것 중 하나다.
          「지연 N건」은 이 상한과 무관하게 DB 가 전부 센 수라, 여기 적힌 수와
          위 알림의 수가 어긋나 보일 수 있다 — 그래서 그 사실도 함께 적는다. */}
      {truncated ? (
        <p className="mt-3 text-body-xs break-keep text-gray-60">
          기한이 가까운 {WORKS_LIMIT}건까지만 봅니다. 더 있으면 검색어나 부서로
          좁혀 주세요. 위의 「기한이 지난 업무」 수는 이 상한과 상관없이 전부
          센 값입니다.
        </p>
      ) : null}
    </PageContainer>
  );
}
