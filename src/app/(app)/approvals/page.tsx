import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, FilePlus2, Inbox } from "lucide-react";
import { ApprovalRow } from "@/components/approval/approval-row";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  APPROVAL_BOXES,
  APPROVAL_BOX_HINT,
  APPROVAL_BOX_LABEL,
  boxesOf,
  byRecent,
  isApprovalBox,
  type ApprovalBox,
} from "@/lib/approval";
import { cn } from "@/lib/cn";
import { listApprovals } from "@/lib/data";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { APPROVAL_FORMS, APPROVAL_FORM_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "결재함" };

/** 서식 그리드 — 자문의 「바빠 죽겠으니 빠바바밥」에 대한 답이 이 네 칸이다. */
const FORM_HINT: Record<(typeof APPROVAL_FORMS)[number], string> = {
  report: "끝난 일을 알린다",
  plan: "할 일을 정한다",
  review: "따져 보고 판단한다",
  cooperation: "다른 과에 요청한다",
};

/**
 * 결재함.
 *
 * 네이버웍스 결재 IA 를 그대로 따랐다. 공무원이 이미 아는 모양이라 학습 비용이 0이다.
 * 왼쪽 칸은 링크이고 지금 보는 칸이 주소에 남는다 — 업무 보드의 필터와 같은 규약이라,
 * 「대기 3건 좀 봐 주세요」를 주소 하나로 보낼 수 있고 자바스크립트 없이 돈다.
 *
 * 숫자 배지는 **대기에만** 붙인다. 다섯 칸에 전부 숫자를 달면 어느 것이 지금
 * 해야 할 일인지가 다시 사라진다.
 */
export default async function ApprovalsPage({
  searchParams,
}: PageProps<"/approvals">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const box: ApprovalBox = isApprovalBox(sp.box) ? sp.box : "todo";

  // 최근 것부터 이만큼만 본다. 결재함은 부서의 문서가 전부 보이는 화면이라
  // 상한이 없으면 해가 지날수록 느려진다. 대신 **잘랐다는 사실을 화면이 말한다** —
  // 말하지 않는 상한은 「전부 다 봤다」로 읽힌다.
  const LIMIT = 100;
  const all = await listApprovals(viewer, LIMIT);
  const truncated = all.length >= LIMIT;
  const tagged = all.map((a) => ({
    approval: a,
    boxes: boxesOf(a, a.steps, viewer.id),
  }));

  const todoCount = tagged.filter((t) => t.boxes.includes("todo")).length;
  const list = tagged
    .filter((t) => t.boxes.includes(box))
    .map((t) => t.approval)
    .sort(byRecent);

  return (
    <PageContainer>
      <PageHeader
        title="결재함"
        description="내부결재문서(시행규칙 별지 제2호서식)를 올리고 처리하는 곳입니다. 대외로 나가는 발신문서는 여기서 만들지 않습니다 — 그건 온나라의 자리입니다."
        action={
          canMutate ? (
            <ButtonLink href="/approvals/new">
              <FilePlus2 aria-hidden className="size-4" />
              결재 올리기
            </ButtonLink>
          ) : null
        }
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {!canMutate ? (
        <Notice tone="info" title="지금은 읽기 전용입니다" className="mb-4">
          데이터베이스에 연결되지 않은 상태에서는 결재를 올리거나 서명할 수
          없습니다. 결재함·결재란·진행률은 시연용 문서로 그대로 볼 수 있습니다.
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* ── 왼쪽: 칸 ─────────────────────────────────────────────────── */}
        <nav aria-label="결재함 분류">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {APPROVAL_BOXES.map((b) => {
              const on = b === box;
              return (
                <li key={b} className="shrink-0">
                  <Link
                    href={b === "todo" ? "/approvals" : `/approvals?box=${b}`}
                    data-variant="plain"
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-sm px-3 text-body-sm font-bold transition-colors duration-150",
                      on
                        ? "bg-primary-5 text-primary"
                        : "text-gray-70 hover:bg-gray-5 hover:text-gray-90",
                    )}
                  >
                    {APPROVAL_BOX_LABEL[b]}
                    {b === "todo" && todoCount > 0 ? (
                      <span
                        className={cn(
                          "rounded-xs px-1.5 py-0.5 text-body-xs font-bold tabular-nums",
                          on ? "bg-primary text-white" : "bg-primary-5 text-primary",
                        )}
                      >
                        {todoCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── 오른쪽: 목록 ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="mb-3">
            <h2 className="text-h4 font-bold text-gray-90">
              {APPROVAL_BOX_LABEL[box]}
              <span className="ml-2 text-body-sm font-normal tabular-nums text-gray-60">
                {list.length}건
              </span>
            </h2>
            <p className="mt-1 text-body-sm break-keep text-gray-60">
              {APPROVAL_BOX_HINT[box]}
            </p>
          </div>

          {list.length > 0 ? (
            <>
              <ul className="divide-y divide-gray-10 overflow-hidden rounded-md border border-gray-10">
                {list.map((a) => (
                  <ApprovalRow key={a.id} approval={a} viewerId={viewer.id} />
                ))}
              </ul>
              {truncated ? (
                <p className="mt-2 text-body-xs text-gray-60">
                  최근 {LIMIT}건까지만 봅니다. 더 오래된 문서는 업무 상세의 결재
                  탭에서 그 업무의 것만 볼 수 있습니다.
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border border-gray-10 bg-surface">
              <EmptyState
                icon={box === "todo" ? Inbox : FileCheck2}
                title={
                  box === "todo"
                    ? "지금 처리할 결재가 없습니다"
                    : "여기에 해당하는 문서가 없습니다"
                }
                description={APPROVAL_BOX_HINT[box]}
              />
            </div>
          )}

          {/* ── 서식 ──────────────────────────────────────────────────── */}
          {canMutate ? (
            <section aria-labelledby="approval-forms" className="mt-6">
              <h2
                id="approval-forms"
                className="mb-1 text-body-sm font-bold text-gray-80"
              >
                서식으로 시작하기
              </h2>
              <p className="mb-3 text-body-xs text-gray-60">
                네 가지 모두 별지 제2호서식(내부결재문서)입니다. 고른 서식이
                문서번호에 그대로 들어갑니다 — HS-<b>협조</b>-20260808-0001.
              </p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {APPROVAL_FORMS.map((f) => (
                  <li key={f}>
                    <Link
                      href={`/approvals/new?form=${f}`}
                      data-variant="plain"
                      className="flex h-full flex-col justify-between gap-1 rounded-md border border-gray-10 bg-surface px-3.5 py-3 hover:border-primary-20 hover:bg-primary-5"
                    >
                      <span className="text-body-sm font-bold text-gray-90">
                        {APPROVAL_FORM_LABEL[f]}
                      </span>
                      <span className="text-body-xs text-gray-60">
                        {FORM_HINT[f]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
