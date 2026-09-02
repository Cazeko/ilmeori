import Link from "next/link";
import { Building2, MessageSquare, Paperclip, Stamp, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { approvalStateLine } from "@/lib/approval";
import { daysUntil, formatDueDday, formatDueLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { AvatarStack } from "@/components/ui/avatar";
import { CARD_SURFACE } from "@/components/ui/card";
import { LinkPendingMark } from "@/components/ui/link-pending";
import type { ApprovalSummary } from "@/lib/data/types";
import type { WorkListItem } from "@/lib/types";

/**
 * 히어로 — 홈에서 **딱 한 장**만 크게 그리는 업무.
 *
 * ── 왜 한 장인가 ────────────────────────────────────────────────────────────
 *
 * 예전 홈은 급한 일을 3열 격자에 균등하게 늘어놓았다. 두 가지가 어긋났다.
 *
 *   ① 급한 일이 한 건이면 **오른쪽 3분의 2가 통째로 비었다.** 화면에서 가장
 *      중요한 자리가 가장 휑한 자리가 된다.
 *   ② 급한 일이 세 건이면 셋이 동급이 된다. 그런데 아침에 자리에 앉아서
 *      알고 싶은 것은 「급한 일 목록」이 아니라 **「지금 뭐부터 하지」** 하나다.
 *
 * 그래서 가장 급한 한 건만 크게 그리고, 나머지는 아래 한 줄짜리 목록으로
 * 내린다(홈의 「그 다음」). 한 건이든 다섯 건이든 배치가 무너지지 않는다.
 *
 * ── 크기를 어디에 쓰는가 ────────────────────────────────────────────────────
 *
 * 이 판에서 가장 큰 글자는 **「26일 지남」(46px, --text-figure)** 이다.
 * 제목이 아니다. 예전에는 그 자리가 13px 였고, 화면에서 가장 큰 글자는
 * 「○○○ 님, 안녕하세요」가 가져가고 있었다 — 매일 똑같아서 정보량이 0이다.
 *
 * 기한은 이 화면에서 유일하게 **다음 행동을 정하는 숫자**다. 26일 지났으면
 * 지금 열고, 5일 남았으면 오늘은 안 열어도 된다. 그 판단을 곁눈질 한 번에
 * 하도록 크기를 몰아 준다. `--text-figure` 는 화면당 하나만 쓰는 등급이고,
 * 홈에서 그 하나가 여기다.
 *
 * 색은 셋뿐이다(globals.css 의 4색 체계).
 *   지났다      빨강   status-overdue-text   5.74:1
 *   오늘·내일   주황   accent-text           5.25:1
 *   그 밖       회색   gray-60               6.04:1
 * 46px 은 큰 글자라 요구 대비가 3:1 인데 셋 다 4.5:1 을 넘긴다.
 * (tests/contrast.test.mjs 가 잰다)
 *
 * ── 모서리 두 개 ────────────────────────────────────────────────────────────
 *
 * 겉모양은 card.tsx 의 **문서(doc) 등급**이다 — 흰 종이, 각진 모서리, 위쪽
 * 2px 먹선. 여기에 왼쪽 선이 하나 더 붙는데 그 둘은 다른 말을 한다.
 *
 *   위 2px 먹선(rule-head)   「여기서부터 문서다」
 *   왼 3px 붉은선(rule-alarm) 「이건 늦었다」
 *
 * 종이가 원래 그렇게 한다. 굵기와 자리가 다르면 뜻도 다르다.
 */

function toneOf(work: WorkListItem) {
  if (work.derived === "overdue") {
    return { text: "text-status-overdue-text", edge: "border-l-rule-alarm" };
  }
  const d = work.due_date ? daysUntil(work.due_date) : null;
  if (d !== null && d >= 0 && d <= 1) {
    return { text: "text-accent-text", edge: "border-l-accent" };
  }
  return { text: "text-gray-60", edge: "border-l-rule-frame" };
}

export function UrgentHero({
  work,
  approval,
  meId,
}: {
  work: WorkListItem;
  approval?: ApprovalSummary;
  /** 보고 있는 사람. 참여자 줄에서 내 아바타 하나에만 색이 붙는다(avatar.tsx). */
  meId?: string;
}) {
  const tone = toneOf(work);
  const cross = work.department_count > 1;

  return (
    <article
      // 실눈 시험이 이 표식을 찾는다 — 흐리게 봤을 때 가장 무거운 자리가
      // 문서 위인지 본다(tests/squint.test.mjs, card.tsx 의 CARD_SURFACE 주석).
      data-rank="doc"
      className={cn(
        // 이 화면의 「문서」다. 겉모양은 card.tsx 의 doc 등급을 그대로 가져다
        // 쓴다(<article> 이라 Card 컴포넌트를 못 쓴다).
        CARD_SURFACE.doc,
        "relative border-l-3 p-6",
        // 손이 닿았다는 표시는 **바탕**으로 한다. 예전에는 hover:border-primary-30
        // 이었는데, 그건 의사클래스라 특이도가 한 칸 높아 **네 변을 통째로**
        // 덮는다 — 지연된 판에 마우스를 올리는 순간 왼쪽 붉은 경보선도 위쪽
        // 먹선도 파랗게 지워졌다. 이 재설계 전체가 그 두 선 위에 서 있는데,
        // 사람이 가리키는 바로 그 순간에 신호가 사라지는 셈이었다.
        "transition-colors duration-150 hover:bg-gray-5 active:bg-primary-5",
        // 눌린 판은 흐려진다 — 안쪽 LinkPendingMark 가 심는 표식을 여기서 받는다.
        "has-[[data-link-pending]]:opacity-55 has-[[data-link-pending]]:transition-opacity",
        tone.edge,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <StatusBadge status={work.derived} />
        {work.due_date ? (
          <span
            className={cn(
              "shrink-0 text-figure font-bold tabular-nums",
              tone.text,
            )}
          >
            {/* 이 화면에서 가장 큰 글자다. 「28일 지남」 여섯 글자가 46px 로
                서면 폭이 300px 을 넘어 좁은 화면에서 배지를 아래로 밀었다.
                D+28 은 같은 사실을 네 글자로 말한다. 소리는 그대로 둔다. */}
            <span aria-hidden>{formatDueDday(work.due_date)}</span>
            <span className="sr-only">{formatDueLabel(work.due_date)}</span>
          </span>
        ) : null}
      </div>

      {/* 27px. 판 전체가 눌리도록 링크를 확장한다(after:absolute inset-0).
          이 판에서 제목은 2등이다 — 1등은 위의 기한 숫자다. */}
      <h3 className="mt-4 text-h2 leading-snug font-bold break-keep text-gray-90">
        <Link
          href={`/works/${work.id}`}
          className="after:absolute after:inset-0"
        >
          <span className="line-clamp-2">{work.title}</span>
          <LinkPendingMark />
        </Link>
      </h3>

      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm text-gray-60">
        <span className="inline-flex items-center gap-2">
          <Building2 aria-hidden className="size-4" />
          {work.department.name}
        </span>
        {cross ? (
          <span className="inline-flex items-center gap-2 font-bold text-gray-60">
            <Users aria-hidden className="size-4" />
            {work.department_count}개 부서
          </span>
        ) : null}
        {approval ? (
          <span className="inline-flex items-center gap-2 font-bold text-gray-60">
            <Stamp aria-hidden className="size-4" />
            결재 {approvalStateLine(approval.latest.state, approval.latest)}
          </span>
        ) : null}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-rule-hair pt-4">
        <AvatarStack
          people={work.members.map((m) => m.profile)}
          max={6}
          meId={meId}
        />
        <span className="flex items-center gap-4 text-body-sm text-gray-60">
          {work.comment_count > 0 ? (
            <span className="inline-flex items-center gap-2">
              <MessageSquare aria-hidden className="size-4" />
              <span className="sr-only">대화 </span>
              <span className="tabular-nums">{work.comment_count}</span>
              <span className="sr-only">개</span>
            </span>
          ) : null}
          {work.attachment_count > 0 ? (
            <span className="inline-flex items-center gap-2">
              <Paperclip aria-hidden className="size-4" />
              <span className="sr-only">첨부 </span>
              <span className="tabular-nums">{work.attachment_count}</span>
              <span className="sr-only">개</span>
            </span>
          ) : null}
        </span>
      </div>
    </article>
  );
}

/**
 * 「그 다음」 — 히어로에 오르지 못한 급한 일 한 줄.
 *
 * 정보 밀도를 히어로와 **반대로** 준다. 히어로는 정보 다섯을 넓은 면적에
 * 저밀도로 놓고, 여기는 정보 셋을 한 줄에 고밀도로 눌러 담는다. 밀도 차이
 * 자체가 위계다 — 둘 다 중간 밀도이면 눈이 어디서 쉬어야 할지 모른다.
 */
export function UrgentRow({ work }: { work: WorkListItem }) {
  const tone = toneOf(work);
  return (
    <Link
      href={`/works/${work.id}`}
      className="flex items-center gap-3 rounded-sm px-2 py-3 transition-colors duration-150 hover:bg-gray-10 active:bg-primary-5"
    >
      {/* ── 세 조각을 붙여 놓는다 ─────────────────────────────────────────
          한동안 제목에 `flex-1` 이, 날짜에 `w-20 text-right` 가 걸려 있었다.
          그러면 제목이 남는 폭을 **전부** 먹고 상태·날짜를 화면 오른쪽 끝까지
          민다 — 1440px 홈에서 제목이 끝나는 자리와 배지 사이가 **800px 가까이**
          비었다. 열이 둘로 갈라지는 셈이라, 한 줄인데 두 번 봐야 한다.

          오른쪽 맞춤은 「숫자 열을 세로로 훑는다」는 전제 위에서만 값을 한다.
          여기는 줄이 둘에서 셋뿐이라 세로로 훑을 것이 없다. 대신 **가로로 한
          번에 읽히는 것**이 중요하다 — 제목·상태·기한이 한 덩어리로 붙는다.

          제목의 `min-w-0` 은 남긴다. flex 자식의 최소 폭은 기본이 min-content
          라, 이것을 0 으로 눌러야 안쪽 line-clamp 가 제 일을 하고 긴 제목이
          좁은 화면에서 배지를 밀어내지 않는다. */}
      <span className="line-clamp-1 min-w-0 text-body-sm font-bold text-gray-90">
        {work.title}
      </span>
      <StatusBadge status={work.derived} size="sm" />
      {work.due_date ? (
        <span
          className={cn(
            "shrink-0 text-body-xs font-bold tabular-nums",
            tone.text,
          )}
        >
          {/* 눈에는 D+28, 소리에는 「28일 지남」. D-day 는 낭독기에서 뜻을
              잃는다(format.ts 의 formatDueDday). */}
          <span aria-hidden>{formatDueDday(work.due_date)}</span>
          <span className="sr-only">{formatDueLabel(work.due_date)}</span>
        </span>
      ) : null}
    </Link>
  );
}
