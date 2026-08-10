import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Filter, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { KanbanBoard } from "@/components/work/kanban-board";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { getApprovalSummaries, getDepartmentTree, listWorks } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "업무 보드" };

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

  const tree = await getDepartmentTree();
  const knownDept = tree.some(
    (b) => b.id === deptParam || b.children.some((c) => c.id === deptParam),
  );
  const departmentId = knownDept ? deptParam : undefined;

  const works = await listWorks(viewer, {
    q,
    departmentId,
    mine,
    overdueOnly,
    archived,
  });

  // 「지연 n건」 알림에 쓸 수. 예전에는 같은 표를 조건만 바꿔 한 번 더 불렀는데,
  // 그 질의가 임베드 6종을 달고 나가는 제일 무거운 것이었다.
  // 지금 걸린 조건이 그 집합과 같을 때는 방금 받은 결과에서 세면 된다.
  const countedHere = !mine && !overdueOnly && !archived;
  const overdueCount = countedHere
    ? works.filter((w) => w.derived === "overdue").length
    : (await listWorks(viewer, { q, departmentId })).filter(
        (w) => w.derived === "overdue",
      ).length;

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
      <PageHeader
        title="업무 보드"
        description="내가 볼 수 있는 업무만 나타납니다. 참여자로 등록되었거나, 공개 범위가 내 소속을 포함하는 업무입니다."
        action={
          <>
            {/* 「기한이 지난 업무」는 화면에서 가장 급한 사실이다. 조건 칩 줄
                오른쪽 끝에 홀로 떠 있으면 그 급함이 여백에 묻힌다. 화면 머리의
                동작 자리로 올려 「새 업무」 왼쪽에 둔다. */}
            {overdueCount > 0 && !overdueOnly && !archived ? (
              <ButtonLink
                href={linkWith({ overdue: "1", mine: null })}
                variant="secondary"
                className="border-status-overdue/40 bg-status-overdue-bg text-status-overdue-text hover:bg-status-overdue-bg"
              >
                <AlertTriangle aria-hidden className="size-4" />
                기한이 지난 업무 {overdueCount}건
              </ButtonLink>
            ) : null}
            {canMutate ? (
              <ButtonLink href="/works/new">
                <Plus aria-hidden className="size-4" />새 업무
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {archived ? (
        <Notice tone="info" title="보관함을 보고 있습니다" className="mb-4">
          보관은 삭제가 아닙니다. 문서·대화·이력·첨부는 그대로 있고, 소유자가 보관을
          해제하면 원래 목록으로 돌아옵니다.
        </Notice>
      ) : null}

      {/* ── 조건 ─────────────────────────────────────────────────────────── */}
      <form
        method="get"
        action="/works"
        className="mb-4 rounded-md border border-gray-10 bg-surface p-4"
      >
        {/* 칸으로 그리지 않은 조건은 제출할 때 사라진다.
            보관함에서 검색하면 보관함 밖으로 튕겨 나가고, 그건 고장으로 보인다. */}
        {overdueOnly ? <input type="hidden" name="overdue" value="1" /> : null}
        {archived ? <input type="hidden" name="archived" value="1" /> : null}

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

          {/* 체크박스는 라벨과 같은 영역을 눌러도 켜지도록 감싼다.
              h-11 은 옆의 입력칸·버튼과 같은 높이다. min-h 로 두면 내용에 따라
              높이가 달라져 밑선이 어긋난다. */}
          <label className="flex h-11 cursor-pointer items-center gap-2 px-1 text-body-sm font-bold text-gray-70">
            <input
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={mine}
              className="size-4.5 cursor-pointer accent-primary"
            />
            내 업무만
          </label>

          <Button type="submit" className="sm:ml-auto sm:w-auto">
            <Filter aria-hidden className="size-4" />
            적용
          </Button>
        </div>
      </form>

      {/* ── 빠른 조건 ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            data-variant="plain"
            aria-current={c.on ? "true" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-sm border px-3 text-body-sm font-bold transition-colors duration-150",
              c.on
                ? "border-primary bg-primary-5 text-primary"
                : "border-gray-20 bg-surface text-gray-60 hover:bg-gray-5",
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {/* 결과 수가 바뀐 것을 스크린리더에도 알린다 */}
      <p aria-live="polite" className="sr-only">
        업무 {works.length}건이 표시되고 있습니다.
      </p>

      <KanbanBoard works={works} approvals={approvals} />
    </PageContainer>
  );
}
