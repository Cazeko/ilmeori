import Link from "next/link";
import { LinkPendingMark } from "@/components/ui/link-pending";
import {
  Building2,
  Lock,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Stamp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { approvalStateLine } from "@/lib/approval";
import {
  daysUntil,
  formatDueDday,
  formatDueLabel,
  formatShortDate,
} from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { AvatarStack } from "@/components/ui/avatar";
import type { ApprovalSummary } from "@/lib/data/types";
import type { WorkListItem } from "@/lib/types";

/**
 * 업무 카드.
 *
 * 한 장에서 답해야 하는 질문은 다섯이다.
 *   지금 어디까지 왔나 / 언제까지인가 / 결재는 어디까지 갔나 /
 *   누가 붙어 있나 / 혼자 하는 일인가
 *
 * ── 왼쪽 띠는 두 가지를 말한다 ─────────────────────────────────────────────
 *
 *   붉은 띠   기한이 지났다
 *   주황 띠   오늘 또는 내일 마감이다 (화성시 BI 보조색이 화면에 처음 나오는 자리)
 *
 * 지연은 왼쪽 띠와 배지 두 곳에서 알린다. 색만으로는 알 수 없어야 한다는 접근성
 * 요건이기도 하지만, 지연 업무를 놓쳐서 생기는 사고를 줄이려는 목적이 크다.
 *
 * ── 칸의 리듬 ──────────────────────────────────────────────────────────────
 *
 * 안쪽 간격을 4·8·12 로만 쓴다. 8·10·6·12 처럼 어긋나 있으면 사람은 숫자를
 * 세지 못해도 「정돈이 안 됐다」로 느낀다.
 *
 * ── `min-h-36` + `mt-auto` 가 바로 그 「어긋남」을 만들고 있었다 ─────────────
 *
 * 아래 줄(참여자·대화 수)에 `mt-auto` 가 걸려 있었고, 그 자리에 이런 근거가
 * 적혀 있었다 — 「제목이 한 줄인 카드와 두 줄인 카드가 **나란히** 놓였을 때
 * 밑줄이 어긋나 보인다」. 그런데 이 카드를 담는 그릇은 앱 전체에 하나뿐이고
 * (kanban-board.tsx 의 `<ul className="flex flex-col">`) **세로 열**이다.
 * 세로 flex 에서 stretch 는 높이가 아니라 폭에 걸리므로, 카드가 나란히 놓이는
 * 일 자체가 없다. `mt-auto` 는 나눠 줄 남는 공간이 없어 아무 일도 안 한다 —
 * **`min-h-36`(144px)이 억지로 만들어 준 잔여분을 빼면.**
 *
 * 그래서 자연 높이가 144px 에 못 미치는 카드에서만 그 잔여분이 **부서 줄과
 * 아래 가로줄 사이**로 들어갔다. 실측하면 같은 열 안에서 간격이 세 가지였다.
 *
 *   0px    자연 높이가 144 이상인 카드 (아홉 장)
 *   10px   자연 높이가 144 미만이라 늘어난 카드 (네 장)
 *   28px   결재 진행률 줄이 하나 더 있는 카드
 *
 * 위계를 만들지 않는 간격이 카드마다 다르면, 사람은 이유를 못 찾은 채
 * 「정돈이 안 됐다」만 느낀다. 늘어나는 장치를 걷고 **12px 로 못박는다** —
 * 사다리 위의 값이고, 카드가 몇 줄이든 같다.
 *
 * (억지 높이 `min-h-36` 도 함께 지운다. 그것이 없으면 `mt-auto` 는 언제나 0
 *  이므로, 둘 중 하나만 남기면 규칙이 다시 조용히 어긋난다.)
 *
 * ── 이 화면의 「문서」는 한 장이다 ──────────────────────────────────────────
 *
 * 한동안 보드의 문서 등급은 화면 위에 얹은 거대 배너였다. 배너는 개수를 세는
 * 상자이지 누를 대상이 아니다(DESIGN.md §5.1). 등급을 여기로 옮긴 것까지는
 * 맞았는데, 그때 **지연된 카드마다** 문서 표식을 붙였다.
 *
 * 그 자리에 이런 변론이 적혀 있었다 — 「문서 등급은 한 **종류**이지 반드시
 * 한 **개**가 아니다」. 틀린 말이다. 실제로 보드를 열면 문서가 둘이었고,
 * 지연이 열둘인 부서에서는 열둘이 된다. **문서가 열둘이면 문서가 없는 것과
 * 같다** — 실눈 시험이 「흐리게 봤을 때 덩어리 하나가 서는가」를 묻는 이유가
 * 정확히 그것이고, card.tsx 는 「한 화면에 문서는 하나」라고 굵게 적어 두었다.
 *
 * 지금은 **보드가 한 장을 골라 `lead` 로 넘긴다**(kanban-board.tsx 의
 * leadCardId — 가장 오래 지난 지연 업무). 홈의 히어로가 「가장 급한 한 건」을
 * 고르는 것과 같은 판단이다. 지연이 0건이면 보드에 문서는 없고, 그날 보드에
 * 1등이 없는 것이 맞다.
 *
 * ── 등급과 경보는 다른 축이다 ──────────────────────────────────────────────
 *
 *   `lead`     「어느 것부터 보라」  → 문서 표식 · 제목 21px · 안쪽 16px
 *   `overdue`  「이건 늦었다」        → 왼쪽 3px 경보선 · 붉은 배지 · 붉은 날짜
 *
 * 둘을 한 조건으로 묶고 있었던 것이 문제였다. 선택받지 못한 지연 카드도
 * 여전히 붉다 — 늦었다는 것은 카드마다 참인 사실이고, 등급이 정하는 것은
 * 사실이 아니라 **읽는 순서**다.
 *
 * 등급을 올리는 데 쓰는 것은 두 가지뿐이다 — **제목 크기(17 → 21px)와
 * 안쪽 여백 한 칸(12 → 16px).** doc 등급의 겉모양(흰 종이 + 위쪽 2px 먹선)은
 * 가져오지 않는다. 위 먹선은 「여기서 문서가 시작한다」는 뜻인데 열 안에 든
 * 카드가 그 말을 하면 열의 윗변과 다투고, 흰 종이(#ffffff)는 판(#fafafa)과
 * 대비 1.02 라 아무것도 하지 않으면서 규칙만 늘린다.
 * 대비는 색이 아니라 크기·굵기·여백에서 번다(§5.2).
 */

/** 오늘·내일 마감. 지연은 아니지만 오늘 손대야 하는 일이다. */
function isDueNow(work: WorkListItem): boolean {
  if (!work.due_date || work.derived === "done" || work.derived === "overdue") {
    return false;
  }
  const d = daysUntil(work.due_date);
  return d >= 0 && d <= 1;
}

/**
 * 정리 모드에서 이 카드가 어떤 자리인가.
 *
 *   "pick"  고를 수 있다 — 카드 전체가 체크칸이 된다
 *   "locked" 고를 수 없다 — 내가 소유자가 아닌 업무. 이유를 그 자리에 적는다
 *
 * 없으면(undefined) 평소의 카드다 — 누르면 업무로 간다.
 */
export type CardPick = "pick" | "locked";

export function WorkCard({
  work,
  approval,
  pick,
  meId,
  lead = false,
}: {
  work: WorkListItem;
  /** 결재 진행률. 없으면 배지를 그리지 않는다(부르지 않은 화면도 있다). */
  approval?: ApprovalSummary;
  pick?: CardPick;
  /** 보고 있는 사람. 참여자 줄에서 내 아바타 하나에만 색이 붙는다(avatar.tsx). */
  meId?: string;
  /**
   * 이 카드가 그 화면의 「문서」인가 — **화면 전체에서 한 장뿐이다.**
   *
   * 카드가 스스로 정하지 않고 목록에서 받는다. 「가장 급한 한 장」은 그 카드
   * 혼자서는 알 수 없는 값이고, 카드가 각자 판정하면 지연 수만큼 문서가
   * 생긴다 — 실제로 그랬다(위 머리글).
   */
  lead?: boolean;
}) {
  const overdue = work.derived === "overdue";
  const dueNow = isDueNow(work);
  const cross = work.department_count > 1;

  /* 정리 모드에서는 카드가 **링크가 아니라 체크칸**이다.
     제목 링크의 `after:absolute inset-0` 이 카드 표면을 통째로 덮고 있어서,
     그대로 두면 체크박스를 눌러도 클릭이 전부 링크로 들어간다. 그래서 이
     모드에서는 링크를 아예 그리지 않는다 — 겹쳐 두고 z-index 로 다투는 것보다
     둘 중 하나만 있는 편이 확실하다. */
  const Shell = pick === "pick" ? "label" : "article";

  return (
    <Shell
      // 보드가 고른 한 장이 이 화면의 「문서」다 — 실눈 시험이 이 표식을 찾아
      // 「흐리게 봤을 때 가장 무거운 자리가 여기인가」를 판정한다
      // (tests/squint.test.mjs, 위 머리글).
      data-rank={lead ? "doc" : "panel"}
      className={cn(
        "relative flex flex-col rounded-sm border border-rule-frame bg-surface",
        // 안쪽 여백 한 칸이 등급이다 — 문서 16px / 판 12px.
        lead ? "p-4" : "p-3",
        // 손이 닿았다는 표시는 **바탕**으로 한다. hover:border-* 는 의사클래스라
        // 특이도가 한 칸 높아 네 변을 통째로 덮는다 — 지연 카드에 마우스를 올리는
        // 순간 왼쪽 붉은 띠가 파랗게 지워졌다(urgent-hero.tsx 에 같은 주석).
        // 누르는 즉시 칠해진다. :active 는 자바스크립트를 기다리지 않는다.
        "transition-colors duration-150 hover:bg-gray-5 active:bg-primary-5",
        // 고를 수 있는 카드는 손끝으로도 그렇다고 말한다. 체크된 것은 파랗게
        // 물든다 — :has() 라서 자바스크립트 없이 돈다.
        pick === "pick" &&
          "cursor-pointer has-[input:checked]:border-primary has-[input:checked]:bg-primary-5",
        // 고를 수 없는 카드는 물러난다. 감추지는 않는다 — 보드에서 사라지면
        // 「내 업무만 있는 보드」로 읽히고, 그건 사실이 아니다.
        //
        // 물러나게 하는 데 `opacity-60` 을 쓰던 때가 있었다. 투명도는 **읽는
        // 순서만** 낮추는 것이 아니라 **읽을 수 있는지까지** 낮춘다 — 제목
        // (gray-90)이 판 위에서 60% 로 섞이면 실측 **4.29:1** 로 본문 기준
        // 4.5 에 미달한다. 고를 수 없다는 것과 읽을 수 없다는 것은 다른 말이고,
        // 이 카드는 **여전히 읽으라고** 남겨 둔 것이다(위 문단).
        //
        // 그래서 글자는 그대로 두고 **판을 바탕색으로 내린다.** 판(#fafafa)이
        // 본문 바탕(#f0f1f2)과 같아지면 카드가 격자에서 한 겹 물러나고, 테두리도
        // 바깥선(frame)에서 칸선(hair)으로 한 칸 내린다 — 이 시스템의 위계는
        // 원래 선 굵기 축이 나른다(globals.css 의 --color-rule-*).
        pick === "locked" && "border-rule-hair bg-gray-5",
        // 눌린 카드는 흐려진다. 안쪽 LinkPendingMark 가 표식을 심으면
        // 여기서 받는다 — 카드를 client 컴포넌트로 만들지 않기 위한 배치다.
        "has-[[data-link-pending]]:opacity-55 has-[[data-link-pending]]:transition-opacity",
        // 경보선의 굵기와 이름은 선 축이 정한다 — alarm 은 3px 이다
        // (globals.css 의 --color-rule-alarm). 예전에는 4px 에 status-overdue 를
        // 직접 불렀는데, 같은 색을 두 이름으로 부르면 축이 도로 흐려진다.
        overdue
          ? "border-l-3 border-l-rule-alarm"
          : dueNow
            ? "border-l-3 border-l-accent"
            : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* 고를 수 있으면 체크칸, 아니면 **같은 자리에** 자물쇠를 둔다.
            자리가 같아야 「여기 체크칸이 있을 자리인데 잠겼구나」로 읽힌다.
            이유를 카드마다 글로 적지 않는다 — 보드에 남의 업무가 열한 장이면
            같은 문장이 열한 번 반복되고, 그러면 모드가 고장 난 것처럼 보인다.
            문장은 아래 띠에서 한 번만 말한다(works/page.tsx). */}
        {pick === "pick" ? (
          <input
            type="checkbox"
            name="workIds"
            value={work.id}
            className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
            aria-label={`${work.title} 고르기`}
          />
        ) : pick === "locked" ? (
          <Lock
            aria-hidden
            className="mt-1 size-4 shrink-0 text-gray-40"
          />
        ) : null}
        <StatusBadge status={work.derived} size="sm" />
        {work.due_date ? (
          <span
            className={cn(
              "shrink-0 text-body-xs font-bold tabular-nums",
              overdue
                ? "text-status-overdue-text"
                : dueNow
                  ? "text-accent-text"
                  : "text-gray-60",
            )}
          >
            {/* 끝난 일에 "47일 지남"이라고 적으면 늦은 것처럼 읽힌다.
                완료된 업무에는 남은 날짜가 아니라 기한 날짜만 적는다.

                끝나지 않은 일은 D-day 로 적는다 — 카드 머리 줄은 배지와 날짜가
                한 줄에 서는 자리라, 「28일 지남」 여섯 글자가 들어가면 좁은
                화면에서 줄이 갈라진다. 소리에는 원래 말을 그대로 준다
                (format.ts 의 formatDueDday). */}
            {work.derived === "done" ? (
              formatShortDate(work.due_date)
            ) : (
              <>
                <span aria-hidden>{formatDueDday(work.due_date)}</span>
                <span className="sr-only">
                  {formatDueLabel(work.due_date)}
                </span>
              </>
            )}
          </span>
        ) : null}
      </div>

      {/* 카드 전체가 눌리도록 제목 링크를 확장한다.
          카드 자체를 <a>로 감싸면 안쪽 링크를 중첩시킬 수 없다.

          제목 17px · 메타 13px — 이 차이가 카드 **안에서** 무엇을 먼저 읽을지를
          정한다. 보드가 고른 한 장만 21px 로 올라간다 — 그 한 칸(1.24배)이 카드
          **사이의** 위계다. 17 옆의 19px 은 굵은 본문으로 읽히지만 21px 은
          제목으로 읽힌다(globals.css 의 사다리 주석).

          지연된 카드 전부를 21px 로 올리던 때가 있었다. 그러면 지연이 여럿인
          날 큰 제목이 여럿 서고, 흐리게 보면 어느 것도 1등이 아니다 —
          「가장 급한 것 하나」를 고르는 일이 이 크기 한 칸에 걸려 있다. */}
      <h3
        className={cn(
          "mt-2 leading-snug font-bold break-keep text-gray-90",
          lead ? "text-h3" : "text-body",
        )}
      >
        {pick ? (
          // 정리 모드에서는 제목이 링크가 아니다. 위 Shell 주석 참조.
          <span className="line-clamp-2">{work.title}</span>
        ) : (
          <Link
            href={`/works/${work.id}`}
            className="after:absolute after:inset-0"
          >
            <span className="line-clamp-2">{work.title}</span>
            {/* 카드는 글자가 많아 점 하나로는 눌린 것이 안 보인다.
                표식만 심어 두고 카드 전체를 흐리게 만든다(아래 has-[…]). */}
            <LinkPendingMark />
          </Link>
        )}
      </h3>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-gray-60">
        <span className="inline-flex items-center gap-1">
          <Building2 aria-hidden className="size-3.5" />
          {work.department.name}
        </span>
        {/* 이 둘은 두 번 물러났다. 처음에는 각각 파랑(primary-5/primary)과
            주황(accent-bg/accent-text)이었다 — 카드 한 장에 색이 둘 더 붙는
            셈이었고, 둘 다 「알아 두면 좋은 것」이지 「지금 해야 할 것」이
            아니라 무채색으로 내렸다. 그래도 옅은 회색 네모는 남아 있었는데,
            보드 한 화면에 카드가 열넉 장이면 그 네모가 서른 개다. 면까지
            걷어내고 아이콘과 글자에만 맡긴다 — 카드에서 무엇이든 튀어야 하는
            자리는 왼쪽 띠(지연·임박) 하나뿐이다. */}
        {cross ? (
          <span className="inline-flex items-center gap-1 font-bold text-gray-60">
            <Users aria-hidden className="size-3" />
            {work.department_count}개 부서
          </span>
        ) : null}
        {work.previous_year ? (
          <span className="inline-flex items-center gap-1 font-bold text-gray-60">
            <RotateCcw aria-hidden className="size-3" />
            작년 판 있음
          </span>
        ) : null}
      </p>

      {/* ── 결재 진행률 ────────────────────────────────────────────────────
          flex 의 「진행 중 3/5」. 상태 하나만 적으면 한 칸 남았는지 다섯 칸
          남았는지가 화면에 없다. 카드에서는 배지 대신 한 줄로 둔다 —
          위에 이미 상태 배지가 있고, 배지가 둘이면 어느 쪽이 업무의 상태인지
          헷갈린다. */}
      {approval ? (
        <p className="mt-2 flex items-center gap-2 text-body-xs font-bold text-gray-60">
          <Stamp aria-hidden className="size-3.5 shrink-0 text-gray-40" />
          <span>
            결재 {approvalStateLine(approval.latest.state, approval.latest)}
          </span>
          {approval.count > 1 ? (
            <span className="font-normal text-gray-60">
              · 문서 {approval.count}건
            </span>
          ) : null}
        </p>
      ) : null}

      {/* 위 줄과의 간격을 12px 로 못박는다 — 예전에는 `mt-auto` 였고, 그것이
          카드마다 0·10·28px 로 갈리던 원인이었다(위 머리글).
          h-7 은 남긴다. 아바타가 있는 카드와 없는 카드의 밑줄이 같은 자리에
          오게 하는 것은 이 높이 고정이 하는 일이고, 그건 실제로 동작한다. */}
      <div className="mt-3 flex h-7 items-center justify-between gap-2 border-t border-rule-hair pt-2">
        <AvatarStack people={work.members.map((m) => m.profile)} meId={meId} />
        <span className="flex items-center gap-3 text-body-xs text-gray-60">
          {/* 아이콘 옆 숫자만 두면 스크린리더에는 "5"라고만 읽힌다.
              role 없는 span에 aria-label을 붙이는 것은 ARIA 규칙 위반이라,
              화면에 보이지 않는 글자를 실제로 넣어 준다. */}
          {work.comment_count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare aria-hidden className="size-3.5" />
              <span className="sr-only">대화 </span>
              <span className="tabular-nums">{work.comment_count}</span>
              <span className="sr-only">개</span>
            </span>
          ) : null}
          {work.attachment_count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip aria-hidden className="size-3.5" />
              <span className="sr-only">첨부 </span>
              <span className="tabular-nums">{work.attachment_count}</span>
              <span className="sr-only">개</span>
            </span>
          ) : null}
        </span>
      </div>

      {/* 화면을 못 보는 사람에게는 자물쇠 그림이 아무것도 말해 주지 않는다.
          카드마다 한 번, 글로도 남긴다(눈에는 안 보인다). */}
      {pick === "locked" ? (
        <span className="sr-only">주담당이 아니라 고를 수 없습니다</span>
      ) : null}
    </Shell>
  );
}
