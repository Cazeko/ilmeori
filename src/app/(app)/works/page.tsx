import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Filter } from "lucide-react";
import { cn } from "@/lib/cn";
import { KanbanBoard } from "@/components/work/kanban-board";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { getDepartmentTree, listWorks } from "@/lib/data";
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

  const tree = await getDepartmentTree();
  const knownDept = tree.some(
    (b) => b.id === deptParam || b.children.some((c) => c.id === deptParam),
  );
  const departmentId = knownDept ? deptParam : undefined;

  const works = await listWorks(viewer, { q, departmentId, mine, overdueOnly });
  const allVisible = await listWorks(viewer, { q, departmentId });
  const overdueCount = allVisible.filter((w) => w.derived === "overdue").length;

  /** 지금 걸린 조건을 유지한 채 하나만 바꾼 주소를 만든다 */
  const linkWith = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (departmentId) params.set("dept", departmentId);
    if (mine) params.set("mine", "1");
    if (overdueOnly) params.set("overdue", "1");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/works?${s}` : "/works";
  };

  const chips = [
    { label: "전체", href: linkWith({ mine: null, overdue: null }), on: !mine && !overdueOnly },
    { label: "내 업무", href: linkWith({ mine: "1", overdue: null }), on: mine && !overdueOnly },
    { label: "지연만", href: linkWith({ overdue: "1", mine: null }), on: overdueOnly },
  ];

  return (
    <div className="px-5 py-6 sm:px-7 lg:px-8">
      <PageHeader
        title="업무 보드"
        description="내가 볼 수 있는 업무만 나타납니다. 참여자로 등록되었거나, 공개 범위가 내 소속을 포함하는 업무입니다."
      />

      {/* ── 조건 ─────────────────────────────────────────────────────────── */}
      <form
        method="get"
        action="/works"
        className="mb-4 rounded-md border border-gray-10 bg-white p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            id="works-q"
            label="검색"
            className="min-w-0 flex-1"
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

          <Field id="works-dept" label="부서" className="sm:w-64">
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

          {/* 체크박스는 라벨과 같은 영역을 눌러도 켜지도록 감싼다 */}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-body-sm font-bold text-gray-70">
            <input
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={mine}
              className="size-4.5 cursor-pointer accent-primary"
            />
            내 업무만
          </label>

          <Button type="submit" className="sm:w-auto">
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
                : "border-gray-20 bg-white text-gray-60 hover:bg-gray-5",
            )}
          >
            {c.label}
          </Link>
        ))}

        {overdueCount > 0 && !overdueOnly ? (
          <Link
            href={linkWith({ overdue: "1", mine: null })}
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-status-overdue-bg px-3 text-body-sm font-bold text-status-overdue-text"
            data-variant="plain"
          >
            <AlertTriangle aria-hidden className="size-4" />
            기한이 지난 업무 {overdueCount}건
          </Link>
        ) : null}
      </div>

      {/* 결과 수가 바뀐 것을 스크린리더에도 알린다 */}
      <p aria-live="polite" className="sr-only">
        업무 {works.length}건이 표시되고 있습니다.
      </p>

      <KanbanBoard works={works} />
    </div>
  );
}
