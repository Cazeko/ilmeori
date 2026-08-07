import type { Metadata } from "next";
import { FileSignature, Inbox, RotateCcw, ShieldCheck } from "lucide-react";
import { startHandover } from "@/lib/actions/handover";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/status-badge";
import { listProfiles, listWorks, roleIn } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { formatDate, formatDueLabel } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import type { ProfileWithDepartment } from "@/lib/types";

export const metadata: Metadata = { title: "인계 시작" };

/**
 * 인계 대상 선정.
 *
 * 인계는 "누구에게"와 "무엇을"만 정하면 시작된다. 나머지 — 담당 업무, 진행사항,
 * 현안, 관련 문서 — 는 이미 시스템에 쌓여 있으므로 사람이 다시 적지 않는다.
 * 이 화면이 짧은 것이 이 제품의 주장 그 자체다.
 *
 * 고를 수 있는 것은 **내가 소유자인 업무**뿐이다. 편집자·열람자로 참여한 업무는
 * 주담당이 따로 있고, 그 사람이 넘길 것이다. 화면에서 거르는 것과 별개로
 * handover_item_insert 정책이 app.is_work_owner(work_id)를 요구하므로,
 * 폼을 고쳐 남의 업무 id를 실어 보내도 DB가 거절한다.
 *
 * 기본값을 전부 선택으로 둔다. 인사이동에서는 맡던 일을 통째로 넘기는 것이
 * 보통이고, 빼는 쪽이 예외이기 때문이다.
 */
export default async function StartHandoverPage({
  searchParams,
}: {
  // 라우트 타입(PageProps<"/handover/new">)은 next dev·build가 이 파일을 본 뒤에야
  // 만들어진다. 새로 만든 화면이 타입 검사에서 먼저 걸리지 않도록 여기서는
  // 같은 모양을 직접 적는다.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const [people, mine] = await Promise.all([
    listProfiles(),
    listWorks(viewer, { mine: true }),
  ]);

  const owned = mine.filter((w) => roleIn(w, viewer) === "owner");

  // 인수자는 대개 같은 과 사람이지만 조직 개편으로 다른 과에서 오기도 한다.
  // 그래서 전 직원을 보여 주되 소속으로 묶어, 긴 목록에서 이름을 찾을 수 있게 한다.
  const byDepartment = new Map<string, ProfileWithDepartment[]>();
  for (const p of people) {
    if (p.id === viewer.id) continue; // 자기 자신에게는 넘길 수 없다
    const key = p.department_name ?? "소속 미지정";
    const bucket = byDepartment.get(key);
    if (bucket) bucket.push(p);
    else byDepartment.set(key, [p]);
  }
  const groups = [...byDepartment.entries()].sort(([a], [b]) =>
    a.localeCompare(b, "ko"),
  );

  return (
    <PageContainer width="form">
      <PageHeader
        title="인계 시작"
        description="넘길 사람과 업무만 고르면 「업무인계·인수서」 초안이 만들어집니다. 담당 업무·진행사항·관련 문서는 이 시스템에 쌓인 기록에서 뽑아 채웁니다."
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {!canMutate ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="데모 모드에서는 인계를 시작할 수 없습니다"
            description="데이터베이스에 연결하면 이 화면에서 인수자와 업무를 골라 초안을 만들 수 있습니다. 지금은 미리 넣어 둔 인계 건으로 진행 과정을 보실 수 있습니다."
            action={
              <ButtonLink href="/handover" variant="secondary">
                진행 중인 인계 보기
              </ButtonLink>
            }
          />
        </Card>
      ) : owned.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileSignature}
            title="넘길 수 있는 업무가 없습니다"
            description="인계 대상이 되는 것은 내가 주담당인 업무뿐입니다. 편집자나 열람자로 참여한 업무는 주담당이 따로 있고, 그 사람이 넘깁니다."
            action={
              <ButtonLink href="/works" variant="secondary">
                업무 보드로 가기
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <form action={startHandover} className="flex flex-col gap-4">
          {/* ── 누구에게 ──────────────────────────────────────────────────── */}
          <Card>
            <CardHeader
              title="인수자"
              as="h2"
              description="넘겨받을 사람입니다. 재직 중인 직원만 목록에 나타납니다."
            />
            <CardBody>
              <Field
                id="handover-to"
                label="인수자"
                required
                hint="인계를 실행하면 이 사람이 주담당이 되고, 나는 열람 권한만 남습니다."
                className="max-w-md"
              >
                {(p) => (
                  <Select {...p} name="toProfileId" defaultValue="">
                    <option value="">고르지 않음</option>
                    {groups.map(([department, members]) => (
                      <optgroup key={department} label={department}>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.position ? ` ${m.position}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>

          {/* ── 무엇을 ────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader
              title={`넘길 업무 ${owned.length}건`}
              as="h2"
              description="내가 주담당인 업무입니다. 처음에는 모두 선택되어 있으니, 넘기지 않을 업무만 체크를 해제해 주세요."
            />
            <fieldset>
              <legend className="sr-only">넘길 업무 고르기</legend>
              <ul className="divide-y divide-gray-5">
                {owned.map((w) => (
                  <li key={w.id}>
                    {/* 줄 전체가 누르는 자리다. 작은 네모만 표적이면
                        태블릿에서 몇 번씩 헛손질하게 된다. */}
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-5">
                      <input
                        type="checkbox"
                        name="workIds"
                        value={w.id}
                        defaultChecked
                        className="mt-1 size-4.5 shrink-0 cursor-pointer accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-sm font-bold break-keep text-gray-90">
                          {w.title}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          <StatusBadge status={w.derived} size="sm" />
                          <span className="text-body-xs text-gray-60">
                            {w.due_date
                              ? `${formatDate(w.due_date)} (${formatDueLabel(w.due_date)})`
                              : "마감 없음"}
                          </span>
                          {w.previous_year ? (
                            <span className="inline-flex items-center gap-1 rounded-xs bg-accent-bg px-1.5 py-0.5 text-body-xs font-bold text-accent-text">
                              <RotateCcw aria-hidden className="size-3" />
                              연간 반복
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </Card>

          {/* ── 시작 ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-body-sm break-keep text-gray-60">
              <ShieldCheck
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-success"
              />
              지금은 초안을 만드는 단계입니다. 권한은 아직 옮겨 가지 않으며,
              내용을 확인한 뒤 다음 화면에서 인계를 실행합니다.
            </p>
            <Button type="submit" size="lg" className="shrink-0">
              <FileSignature aria-hidden className="size-4" />
              인계서 초안 만들기
            </Button>
          </div>
        </form>
      )}
    </PageContainer>
  );
}
