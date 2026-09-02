import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  FileCheck2,
  FilePlus2,
  Hourglass,
  Inbox,
  Info,
} from "lucide-react";
import { CARD_SURFACE } from "@/components/ui/card";
import { ApprovalRow } from "@/components/approval/approval-row";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
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
import {
  APPROVAL_FORMS,
  APPROVAL_FORM_LABEL,
} from "@/lib/types";

export const metadata: Metadata = { title: "결재함" };

/** 문서종류 네 칸 — 자문의 「바빠 죽겠으니 빠바바밥」에 대한 답이 이 자리다. */
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

      {/* ── 「지금 내 차례」는 알림이 아니라 목록이다 ─────────────────────────
          한동안 이 자리에 문서 등급의 거대 배너가 있었다 — 46px 짜리 주황
          숫자를 단 흰 종이. 업무 보드가 같은 시기에 같은 모양이었고, 둘 다
          같은 함정이었다(DESIGN.md §5.1): **화면의 「문서」는 사용자가 누를
          대상이어야 하는데, 개수를 세는 상자를 세워 놓은 것**이다.

          여기는 한 가지가 더 나빴다. 그 배너의 링크가 `/approvals` 였다 —
          **지금 보고 있는 바로 그 화면**이다(box 의 기본값이 todo 다).
          화면에서 가장 크고 가장 눈에 띄는 것이 눌러도 아무 일이 없었다.

          그리고 같은 사실이 세 곳에 있었다 — 이 배너 · 왼쪽 칸의 「대기 N」
          배지 · 오른쪽 목록 머리의 「대기함 N건」.

          그래서 배너를 걷어낸다. 문서 등급은 아래 **결재 목록 그 자체**로
          가고(진짜로 누를 것이 거기 있다), 이 줄은 다른 칸을 보고 있을 때만
          「돌아갈 길」로 한 줄 남는다. 왼쪽 3px 은 주황이다 — 이건 늦은 것이
          아니라 **나를 기다리는 것**이고, 이 제품에서 그 뜻을 가진 색은
          주황 하나다. */}
      {todoCount > 0 && box !== "todo" ? (
        <Link
          href="/approvals"
          className={cn(
            "mb-4 flex min-h-11 items-center gap-2 border-l-3 border-l-accent px-3",
            "text-body font-bold text-accent-text",
            // 테두리가 아니라 바탕으로 알린다 — hover:border-* 는 의사클래스라
            // 네 변을 통째로 덮어 왼쪽 경보선까지 지운다(urgent-hero.tsx 주석).
            "transition-colors duration-150 hover:bg-accent-bg active:bg-accent-bg",
          )}
        >
          <Hourglass aria-hidden className="size-4 shrink-0" />
          <span>
            지금 내 차례 <span className="tabular-nums">{todoCount}</span>건
          </span>
          <span className="text-body-sm font-normal text-gray-60">
            대기함으로
          </span>
          <LinkPending />
        </Link>
      ) : null}

      {/* ── 읽기 전용 안내는 「여백」이다 ────────────────────────────────────
          한동안 이 자리가 채운 파란 판이었다. 실눈 시험으로 재 보니 **이
          화면에서 가장 무거운 덩어리가 그 안내문**이었고, 정작 서명해야 할
          문서 목록보다 위에 있었다(§9.1 의 자리 검사가 잡아냈다).

          안내를 지우는 것이 아니라 무게를 맞춘다. 이것은 사건이 아니라 늘
          참인 상태이고, 「시연용 가상 데이터」는 머리 줄이 이미 늘 말하고
          있다(app-shell). 여기서 보태는 것은 「그래서 이 화면에서 무엇을 못
          하는가」 한 줄뿐이다.

          새 업무·결재 올리기 같은 **폼 화면에서는 판을 그대로 둔다** — 거기서는
          사용자가 곧 시작할 동작을 막는 말이라 먼저 읽혀야 한다. 여기서는
          막을 동작 자체가 화면에 없다(단추를 아예 그리지 않는다). */}
      {!canMutate ? (
        <p className="mb-4 flex items-start gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm break-keep text-gray-60">
          <Info aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
          <span>
            지금은 <strong className="font-bold text-gray-90">읽기 전용</strong>
            입니다. 결재를 올리거나 서명할 수 없고, 결재함·결재란·진행률은
            시연용 문서로 그대로 봅니다.
          </span>
        </p>
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
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-sm px-3 text-body-sm font-bold transition-colors duration-150",
                      // 누르는 즉시 칠해진다(브라우저가 한다 — 자바스크립트 대기 없음)
                      "active:bg-primary-10 active:text-primary",
                      on
                        ? "bg-primary-5 text-primary"
                        : "text-gray-60 hover:bg-gray-5 hover:text-gray-90",
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
              {/* ── 이 화면의 「문서」 ────────────────────────────────────
                  대기함일 때만 문서 등급이다 — 흰 종이, 각진 모서리, 위쪽
                  2px 먹선. 「여기서부터 내가 서명할 것이다」를 종이가 말하는
                  방식으로 말한다. 다른 칸(상신함·참조함…)은 지나간 것을 보는
                  자리라 판 등급으로 물러난다.

                  0건이면 문서가 없다. 서명할 것이 없는 날 화면에 1등이 없는
                  것은 옳다 — 억지로 세울 이유가 없다. */}
              <ul
                data-rank={box === "todo" ? "doc" : "panel"}
                className={cn(
                  "divide-y divide-rule-hair overflow-hidden",
                  box === "todo"
                    ? CARD_SURFACE.doc
                    : "rounded-sm border border-rule-frame",
                )}
              >
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

          {/* ── 문서종류 ────────────────────────────────────────────────
              한동안 이 자리가 「**서식**으로 시작하기」였고, 네 칸이 저마다
              다른 출발점처럼 생겼다. 눌러 보면 넷 다 같은 빈 칸이 나온다 —
              본문 틀도, 입력 칸도, 내보낸 문서의 짜임도 전부 같다. 실제로
              달라지는 것은 **문서번호의 가운데 마디** 하나뿐이다.

              그건 고장이 아니다. 시행규칙 제3조3항의 별지 제2호서식은
              **하나**이고, 보고서·계획서·검토서·업무협조는 그 서식으로 만드는
              문서의 성격 분류이지 별개 서식이 아니다. 틀린 것은 화면의 말이었다.

              그래서 이름을 종이가 쓰는 말로 맞춘다 — 내보낸 문서의 표에 이미
              「문서종류」라고 찍히고 있다(approval-export.ts). 그리고 각 칸에
              실제로 달라지는 것(문서번호)을 보여 준다. 눌러 보기 전에 무엇이
              같고 무엇이 다른지 알 수 있어야 한다.

              ※ 성격마다 본문 뼈대를 다르게 주는 것(검토서 = 검토 배경/검토
                의견/조치 계획 …)은 실제 공문 관행에 맞고 이 제품의 논지와도
                맞지만, 서식별 문구를 새로 쓰는 일이라 따로 잡아야 한다. */}
          {canMutate ? (
            <section aria-labelledby="approval-forms" className="mt-6">
              {/* 조용 등급 — 결재함에서 먼저 읽혀야 하는 것은 목록이지
                  「새로 만들기」가 아니다. */}
              <h2
                id="approval-forms"
                className="mb-1 text-body-sm font-bold text-gray-60"
              >
                문서종류 고르기
              </h2>
              {/* ── 격자가 아니라 목록이다 ────────────────────────────────
                  한동안 같은 크기의 칸 넷을 가로로 늘어놓았다(2×2 → 1×4).
                  이 저장소가 발표자료에서 스스로 금지한 「카드 배열」이 화면에
                  남아 있던 마지막 자리였다 — 같은 크기의 상자가 넷이면 눈은
                  내용보다 먼저 격자를 읽고, 격자는 「고를 것」이 아니라
                  「구경할 것」처럼 보인다.

                  넷은 이름·설명이 한 줄씩이라 목록이 맞다. 상자를 걷고 가는
                  선으로만 가른다. 이름은 폭을 맞춰 세워 두어 설명이 한 세로선에
                  선다 — 그래야 넷을 내려 읽으며 비교할 수 있다. */}
              <ul className="mt-2 border-y border-rule-hair">
                {APPROVAL_FORMS.map((f, i) => (
                  <li
                    key={f}
                    className={i > 0 ? "border-t border-rule-hair" : undefined}
                  >
                    <Link
                      href={`/approvals/new?form=${f}`}
                      className="-mx-2 flex items-center gap-3 px-2 py-3 transition-colors duration-150 hover:bg-gray-10 active:bg-primary-5"
                    >
                      <span className="w-16 shrink-0 text-body-sm font-bold text-gray-90">
                        {APPROVAL_FORM_LABEL[f]}
                      </span>
                      {/* 「HS-보고-…」 하는 문서번호 미리보기가 이 자리에 있었다.
                          붙지도 않은 번호를 말줄임으로 보여 주는 것이라, 읽는
                          사람에게는 고장 난 값처럼 보였다. 문서번호는 상신하는
                          순간 붙고 그때 실제 값이 화면에 나온다 — 그 전에 자리만
                          잡아 둘 이유가 없다. */}
                      <span className="min-w-0 flex-1 truncate text-body-xs text-gray-60">
                        {FORM_HINT[f]}
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="size-4 shrink-0 text-gray-40"
                      />
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
