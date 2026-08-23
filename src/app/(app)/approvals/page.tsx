import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, FilePlus2, Hourglass, Inbox } from "lucide-react";
import { CARD_SURFACE } from "@/components/ui/card";
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
import { LinkPending } from "@/components/ui/link-pending";
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
      {/* 이름표는 물러난다 — 「결재함」은 왼쪽 메뉴에서 이미 켜져 있다.
          이 화면의 1등은 아래 「지금 내 차례」다. */}
      <PageHeader
        size="sm"
        title="결재함"
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

      {/* ── 이 화면의 「문서」 ──────────────────────────────────────────────
          결재함에서 답해야 하는 물음은 하나다 — **지금 내가 서명할 것이
          몇 건인가.** 한동안 그 답은 왼쪽 칸 목록의 「대기」 옆에 붙은 13px
          짜리 숫자였고, 34px 이름표 「결재함」이 화면의 1등이었다.

          문서 등급으로 올린다. 왼쪽 3px 은 주황(rule-alarm 이 아니다) —
          이건 늦은 것이 아니라 **나를 기다리는 것**이고, 이 제품에서 그
          뜻을 가진 색은 주황 하나다.
          0건이면 이 판은 없다. 서명할 것이 없는 날은 조용한 것이 맞다. */}
      {todoCount > 0 ? (
        <Link
          href="/approvals"
          data-variant="plain"
          className={cn(
            CARD_SURFACE.doc,
            "mb-5 flex items-center gap-5 border-l-3 border-l-accent p-6",
            // 테두리가 아니라 바탕으로 알린다 — hover:border-* 는 의사클래스라
            // 네 변을 통째로 덮어 왼쪽 경보선까지 지운다(urgent-hero.tsx 주석).
            "transition-colors duration-150 hover:bg-gray-5 active:bg-primary-5",
          )}
        >
          <Hourglass aria-hidden className="size-8 shrink-0 text-accent-text" />
          <span className="min-w-0 flex-1">
            <span className="block text-h3 font-bold text-gray-90">
              지금 내 차례
            </span>
            <span className="mt-1 block text-body-sm text-gray-60">
              내가 서명하거나 반려해야 하는 문서입니다
            </span>
          </span>
          <span className="shrink-0 text-figure font-bold tabular-nums text-accent-text">
            {todoCount}
            <span className="ml-1 text-h3 font-normal text-gray-60">건</span>
          </span>
        </Link>
      ) : null}

      {!canMutate ? (
        <Notice tone="info" title="지금은 읽기 전용입니다" className="mb-4">
          데이터베이스에 연결되지 않은 상태에서는 결재를 올리거나 서명할 수
          없습니다. 결재함·결재란·진행률은 시연용 문서로 그대로 볼 수 있습니다.
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* ── 왼쪽: 칸 ─────────────────────────────────────────────────── */}
        <nav aria-label="결재함 분류">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
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
                      // 누르는 즉시 칠해진다(브라우저가 한다 — 자바스크립트 대기 없음)
                      "active:bg-primary-10 active:text-primary",
                      on
                        ? "bg-primary-5 text-primary"
                        : "text-gray-70 hover:bg-gray-5 hover:text-gray-90",
                    )}
                  >
                    {APPROVAL_BOX_LABEL[b]}
                    {/* 분류를 바꾸는 것도 물음표 뒤만 바뀌는 같은 화면 이동이라
                        본문 자리를 갈지 않는다. 눌렸다는 표시가 여기 있어야
                        한다(업무 보드 조건 칩과 같은 이유). */}
                    <LinkPending />
                    {/* 파랑이었다. 주황으로 옮긴다 — 이 제품에서 주황은 「내가
                        움직여야 하는 것」 하나만 가리킨다(결재 줄의 「지금 내
                        차례」, 홈의 인계 알림, 카드의 임박 띠). 왼쪽 칸은 여섯
                        개가 다 파랑 계열이라, 그 안에서 파란 배지는 안 튄다.
                        흰 글자는 accent(3.33:1) 위가 아니라 accent-text
                        (5.48:1) 위에 얹는다. */}
                    {b === "todo" && todoCount > 0 ? (
                      <span
                        className={cn(
                          "rounded-xs px-chip-x py-chip-y text-body-xs font-bold tabular-nums",
                          on
                            ? "bg-accent-text text-white"
                            : "bg-accent-bg text-accent-text",
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
            {/* text-h4 는 17px 로 **본문과 같은 크기**였다. 판 제목이 본문과
                같으면 목록이 제목 아래 딸린 것으로 안 읽힌다(card.tsx 참조). */}
            <h2 className="text-h3 font-bold text-gray-90">
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
              <ul className="divide-y divide-rule-hair overflow-hidden rounded-sm border border-rule-frame">
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
            <div className="rounded-sm border border-rule-frame bg-surface">
              {/* description 을 뺐다 — 바로 위 h2 밑에 같은 문장(APPROVAL_BOX_HINT)이
                  이미 있어서, 문서가 0건인 화면에서 글 세 줄 중 둘이 같은 말이었다.
                  그 자리에는 대신 다음에 할 수 있는 일을 둔다. */}
              <EmptyState
                icon={box === "todo" ? Inbox : FileCheck2}
                title={
                  box === "todo"
                    ? "지금 처리할 결재가 없습니다"
                    : "여기에 해당하는 문서가 없습니다"
                }
                action={
                  canMutate ? (
                    <ButtonLink href="/approvals/new" variant="secondary">
                      <FilePlus2 aria-hidden className="size-4" />
                      결재 올리기
                    </ButtonLink>
                  ) : undefined
                }
              />
            </div>
          )}

          {/* ── 서식 ──────────────────────────────────────────────────── */}
          {canMutate ? (
            <section aria-labelledby="approval-forms" className="mt-6">
              {/* 조용 등급 — 결재함에서 먼저 읽혀야 하는 것은 목록이지
                  「새로 만들기」가 아니다. */}
              <h2
                id="approval-forms"
                className="mb-1 text-body-sm font-bold text-gray-60"
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
                      className="flex h-full flex-col justify-between gap-1 rounded-sm border border-rule-frame bg-surface px-4 py-3 hover:border-primary-20 hover:bg-primary-5"
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
