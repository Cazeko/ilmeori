import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Cog,
  Download,
  PenLine,
  RotateCcw,
} from "lucide-react";
import { confirmHandover, executeHandover } from "@/lib/actions/handover";
import { ButtonLink, DownloadLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { HandoverToc } from "@/components/handover/handover-toc";
import {
  HANDOVER_STEPS,
  ProgressSteps,
} from "@/components/handover/progress-steps";
import { josa } from "@/lib/format";
import {
  HANDOVER_SCREENING_ANCHOR,
  HANDOVER_STATUS_LABEL,
  handoverBlockAnchor,
} from "@/lib/types";
import type { DraftBlock } from "@/lib/handover-draft";
import type {
  HandoverBlockKey,
  HandoverStatus,
  Profile,
  WorkListItem,
} from "@/lib/types";

/**
 * 오른쪽 여백에 붙박이로 서는 기둥 — **지금 어느 단계이고 무엇을 누르는가.**
 *
 * ── 왜 붙박이인가 ──────────────────────────────────────────────────────────
 *
 * 이 화면은 서식 한 벌(약 4,500px)과 작업대가 이어 붙은 긴 화면이다. 단계표는
 * 맨 위에 한 번 있었고, 실행 단추는 반대쪽 끝 「다음 단계」 카드 안에 있었다.
 * 그래서 근거를 확인하러 아래로 내려간 사람은 **지금 몇 단계인지도, 다음에
 * 무엇을 누르는지도 볼 수 없었다.** 확인이 끝나면 다시 위로 올라가야 했다.
 *
 * 둘을 한 기둥에 담아 오른쪽 여백에 붙박는다. 스크롤 어디에서든 「지금 단계」와
 * 「그 단계에서 누를 것」이 같은 자리에 함께 있다.
 *
 * ── 왜 fixed 가 아니라 sticky 인가 ─────────────────────────────────────────
 *
 * `position: fixed` 로 화면 오른쪽에 띄우면 격자 밖으로 나가서, 창이 좁아질 때
 * 본문 위에 겹친다. `sticky` 는 자기 칸 안에서만 움직이므로 **겹칠 수가 없다.**
 * 좁은 화면(xl 미만)에서는 붙박이가 풀리고 평범한 판으로 위에 선다 — 그 폭에서
 * 오른쪽 여백이라는 것이 아예 없기 때문이다.
 *
 * ── 「다음 단계」 카드는 없어졌다 ──────────────────────────────────────────
 *
 * 이 기둥이 그 카드가 하던 말을 그대로 한다. 같은 말을 하는 판이 둘이면 사람은
 * 둘이 다른 일을 한다고 읽는다 — 이 저장소가 인쇄 단추에서 이미 한 번 겪었다.
 *
 * 종이에는 안 나간다. 서식이 아니라 화면 장치다.
 */
export function HandoverRail({
  status,
  isSender,
  done,
  from,
  to,
  items,
  transferredCount,
  toFill,
  notUsed,
  canWriteNotes,
  canStartNew,
  exportHref,
  archived,
  toc,
}: {
  status: HandoverStatus;
  isSender: boolean;
  done: boolean;
  from: Profile;
  to: Profile;
  items: Array<{ work: WorkListItem }>;
  /** 실제로 주담당이 바뀐 수. 대상 수와 다를 수 있다(execute_handover). */
  transferredCount: number;
  /** 근거가 없어 비워 둔 칸 중 아직 안 적은 것 */
  toFill: DraftBlock[];
  /** 규칙이 안 실은 대화·문서 항목 수 */
  notUsed: number;
  canWriteNotes: boolean;
  /** 새 인계를 시작할 수 있는가(데모 모드에서는 못 한다) */
  canStartNew: boolean;
  /**
   * 한/글 내려받기 주소.
   *
   * 지난 인계서에서는 그 건의 주소여야 한다 — `/handover/export/hwpx` 는
   * getHandoverFor 를 쓰므로 최신 것을 주고, 그러면 화면과 파일이 다른
   * 문서가 된다.
   */
  exportHref: string;
  /** 지난 인계서를 보고 있는가. 참이면 이 기둥은 아무것도 바꾸지 않는다. */
  archived: boolean;
  /**
   * 서식 항목 차례 — 붙박이 기둥에서 원하는 항목으로 바로 간다.
   *
   * 서식이 4,500px 쯤 되고 보충 칸이 그 안에 있으니, 어느 칸에 무엇이 있는지를
   * 스크롤하지 않고 알 길이 여기뿐이다. 수는 보충뿐이다 — 근거 수를 함께 적으면
   * 두 숫자가 한 줄에 서서 어느 것이 내 일인지 읽는 데 한 박자가 더 든다.
   *
   * **비어 있으면 안 그린다.** 끝난 인계·지난 인계서는 서식이 접혀 있어
   * (sheet-fold) 항목 id 가 화면에 없고, 그때 링크는 주소만 바꾸고 아무 데도
   * 안 간다. 화면이 그 경우 빈 배열을 넘긴다.
   */
  toc: Array<{
    key: HandoverBlockKey;
    heading: string;
    notes: number;
    /** 근거가 없어 비워 둔 칸인데 아직 아무도 안 적었다 */
    empty: boolean;
  }>;
}) {
  return (
    <section
      aria-label="인계 진행"
      className="rounded-sm border border-rule-frame bg-surface print:hidden"
    >
      <h2 className="border-b border-rule-hair px-4 py-3 text-body-sm font-bold text-gray-90">
        인계 진행
      </h2>
      <div className="px-4 py-4">
        <ProgressSteps current={status} />
      </div>

      {/* 항목 차례. 링크는 서식 안의 그 항목(handoverBlockAnchor)으로 간다.
          좁은 화면에서는 이 기둥이 **서식 아래**에 서므로 여기서는 접는다 —
          이미 지나온 문서의 목차는 길잡이가 아니라 되풀이다. 그 폭에서 목차가
          맡던 일은 서식 위의 요약 줄(HandoverRailBrief)이 한다. */}
      {toc.length > 0 ? (
      <nav
        aria-label="서식 항목"
        className="hidden border-t border-rule-hair px-4 py-3 xl:block"
      >
        <p className="text-body-xs font-bold text-gray-60">항목으로 가기</p>
        <HandoverToc items={tocItems(toc, notUsed)} />
      </nav>
      ) : null}

      {/* 단계와 단추 사이는 선으로 끊는다. 위는 「어디까지 왔나」이고
          아래는 「지금 무엇을 하나」라 하는 일이 다르다. */}
      <div className="border-t border-rule-hair px-4 py-4">
        <Action
          status={status}
          isSender={isSender}
          done={done}
          from={from}
          to={to}
          items={items}
          transferredCount={transferredCount}
          toFill={toFill}
          notUsed={notUsed}
          canWriteNotes={canWriteNotes}
          canStartNew={canStartNew}
          exportHref={exportHref}
          archived={archived}
        />
      </div>
    </section>
  );
}

function Action({
  status,
  isSender,
  done,
  from,
  to,
  items,
  transferredCount,
  toFill,
  notUsed,
  canWriteNotes,
  canStartNew,
  exportHref,
  archived,
}: Omit<Parameters<typeof HandoverRail>[0], "toc">) {
  // ── 끝난 인계는 **양쪽에 같은 말**을 한다 ─────────────────────────────────
  //
  // 이 갈래가 없던 동안 인수자에게는 실행이 끝난 뒤에도 「이 인계는 박준호
  // 주무관이 확인하고 실행합니다」가 그대로 남아 있었다 — 화면이 한쪽에서는
  // 끝났다고 하고 옆칸에서는 아직 안 끝났다고 말하고 있었다.
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        {/* ⚠ 「업무 N건의 주담당이 …로 바뀌었습니다」를 여기 적었다가 지웠다.
            화면 맨 위의 완료 알림이 **글자 그대로 같은 문장**을 이미 적고 있고,
            이 기둥은 붙박이라 그 알림 옆에 나란히 서 있다. 같은 말이 한 화면에
            두 번 있으면 둘 중 하나는 다른 말인 줄 알고 읽게 된다.
            여기서는 **그래서 지금 무엇을 할 수 있는가**만 말한다. */}
        <div>
          <p className="flex items-start gap-2 text-body-sm break-keep text-gray-60">
            <CheckCircle2
              aria-hidden
              className="mt-1 size-4 shrink-0 text-success"
            />
            <span>
              {isSender
                ? "각 업무의 이력 탭에 권한이 옮겨 간 기록이 남았습니다."
                : `넘겨받은 ${transferredCount}건은 아래 「오늘 먼저 볼 것」에 급한 순으로 놓았습니다.`}
            </span>
          </p>
        </div>
        {/* 끝난 뒤 이 화면에서 할 수 있는 일 셋 — 문서를 챙기는 것,
            인계 첫 화면으로 돌아가는 것, 다음 인계를 여는 것.
            왼쪽의 내보내기 판은 이때 안 뜬다(handover-screen.tsx). */}
        <div className="flex flex-col gap-2">
          <DownloadLink href={exportHref} variant="secondary" size="sm" block>
            <Download aria-hidden className="size-4" />
            한/글 파일(.hwpx)
          </DownloadLink>
          {/* ── 첫 화면으로 ────────────────────────────────────────────────
              `/handover` 는 **언제나 최신 인계**를 그린다(getHandoverFor).
              그래서 인계가 하나라도 있으면 「지금 넘긴다면 무엇이 실리나」를
              말하는 첫 화면에 **닿을 방법이 없었다.** 물음표 하나가 그 문을
              연다 — 새 라우트를 만들지 않고, 뒤로가기와도 안 부딪힌다.

              지난 인계서에서는 이 단추가 더 중요하다. 거기서 「새 인계 시작」만
              있으면, 읽으러 들어온 사람에게 화면이 내미는 유일한 길이 **새
              문서를 만드는 것**이 된다. */}
          <ButtonLink href="/handover?start=1" variant="secondary" size="sm" block>
            인계 첫 화면으로
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
          {/* 지난 인계서에서는 「새 인계 시작」을 안 그린다. 그 단추는 최신
              인계 화면의 것이고, 여기서 누르면 **읽고 있던 문서와 무관한
              일**이 벌어진다. 첫 화면에 지난 인계 목록과 함께 서 있다. */}
          {canStartNew && !archived ? (
            <>
              <ButtonLink href="/handover/new" variant="secondary" size="sm" block>
                새 인계 시작
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <p className="text-body-xs leading-relaxed break-keep text-gray-60">
                다른 업무를 더 넘겨야 한다면 여기서 새로 시작할 수 있습니다.
              </p>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // 넘겨받는 쪽에는 누를 것이 없다. 없는 단추를 흐리게 그려 두지 않고,
  // 누가 무엇을 하는 차례인지 한 줄로 적는다.
  if (!isSender) {
    return (
      <p className="text-body-sm leading-relaxed break-keep text-gray-60">
        이 인계는 {from.name} {from.position}
        {josa(from.position ?? from.name, "이", "가")} 확인하고 실행합니다.
        넘겨받는 사람은 진행 상황과 초안을 볼 수 있습니다.
      </p>
    );
  }

  if (status === "generated") {
    return (
      <>
        {/* ── 지금 볼 것 두 구획 ────────────────────────────────────────────
            예전에는 여기가 산문 세 갈래였고, 셋 다 「물품·예산 항목」 하나만
            손으로 적어 두고 있었다. 사람이 채워야 하는 칸이 둘이 되는 날
            조용히 반쪽만 말하게 되는 모양이라, **초안에서 세어** 자리까지
            가리킨다.

            구획이 둘인 이유는 고칠 자리가 다르기 때문이다 — 위는 **내가 적을
            것**이고 아래는 **규칙이 못 걸른 것**이다. 아이콘도 그 자리들이
            이미 쓰는 것을 그대로 쓴다(PenLine = 직접 적는 칸 · Cog = 규칙). */}
        <p className="mb-3 text-body-sm break-keep text-gray-60">
          초안의 각 항목이 실제와 맞는지 확인해 주세요.
        </p>
        <ul className="mb-4 flex flex-col gap-3">
          <li className="flex gap-2">
            <PenLine aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
            <div className="min-w-0">
              <p className="text-body-sm text-gray-60">
                직접 적을 칸{" "}
                <b className="font-bold tabular-nums text-gray-90">
                  {toFill.length}건
                </b>
              </p>
              {toFill.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {toFill.map((b) => (
                    <li key={b.key}>
                      {/* 전역에서 밑줄을 걷어낸 뒤(globals.css 의 `a`) 클래스
                          없는 링크는 주변 글자와 완전히 같아 보인다 — WCAG
                          1.4.1. 이 앱의 인라인 링크 규약은 「굵은 글자 +
                          primary」다. */}
                      <Link
                        href={`#${handoverBlockAnchor(b.key)}`}
                        className="text-body-sm font-bold break-keep text-primary"
                      >
                        {b.heading}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-body-xs break-keep text-gray-60">
                  비어 있던 칸을 모두 적으셨습니다.
                </p>
              )}
            </div>
          </li>
          {notUsed > 0 ? (
            <li className="flex gap-2">
              <Cog aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
              <div className="min-w-0">
                <p className="text-body-sm text-gray-60">
                  규칙이 안 실은 것{" "}
                  <b className="font-bold tabular-nums text-gray-90">
                    {notUsed}건
                  </b>
                </p>
                <p className="mt-1">
                  <Link
                    href={`#${HANDOVER_SCREENING_ANCHOR}`}
                    className="text-body-sm font-bold text-primary"
                  >
                    규칙이 무엇을 걸렀나
                  </Link>
                </p>
              </div>
            </li>
          ) : null}
        </ul>
        {/* 데모 모드다. 적을 칸이 없는 곳으로 보내 놓고 아무 말도 안 하면 안 된다. */}
        {!canWriteNotes && toFill.length > 0 ? (
          <p className="mb-4 text-body-sm break-keep text-gray-60">
            <strong className="font-bold text-gray-90">
              데모 모드에서는 읽기만 됩니다.
            </strong>{" "}
            데이터베이스에 연결하면 이 화면에서 그 칸에 직접 적을 수 있습니다.
          </p>
        ) : null}
        <form action={confirmHandover}>
          <SubmitButton block pendingLabel="확인하는 중…">
            내용을 확인했습니다
            <ArrowRight aria-hidden className="size-4" />
          </SubmitButton>
        </form>
      </>
    );
  }

  if (status === "confirmed") {
    return (
      <>
        <p className="mb-4 text-body-sm leading-relaxed break-keep text-gray-60">
          실행하면 업무 {items.length}건의 주담당이 {to.name} {to.position}
          {josa(to.position ?? to.name, "으로", "로")} 바뀝니다.{" "}
          <strong className="font-bold text-danger">되돌릴 수 없습니다.</strong>{" "}
          인계서에 보탠 내용도 그때부터 더하거나 지울 수 없습니다.
        </p>
        {/* 확인 절차를 <details> 로 둔다.
            예전에는 <dialog>+showModal() 로 물었는데, 그 컴포넌트는 "use client"
            이고 여는 일이 onClick 에 걸려 있어 **스크립트가 없으면 이 단추가
            아무 일도 하지 않았다.** 이 제품에서 가장 되돌릴 수 없는 동작이
            무JS 에서 실행 불가였다는 뜻이다. 화면의 「인계를 잘못 시작했다면」이
            이미 같은 이유로 <details> 를 쓰고 있었다 — 규약이 한 화면 안에서
            갈려 있었다. 펼치는 손짓 한 번이 확인 절차를 대신한다. */}
        <details className="rounded-sm border border-danger/30 bg-danger-bg">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-body-sm font-bold text-danger">
            인계 실행
          </summary>
          <div className="border-t border-danger/30 px-4 py-4">
            <p className="mb-3 text-body-sm leading-relaxed break-keep text-gray-60">
              아래 업무의 주담당이 {to.name} {to.position}
              {josa(to.position ?? to.name, "으로", "로")} 바뀌고, {from.name}{" "}
              {from.position}
              {josa(from.position ?? from.name, "은", "는")} 열람 권한만
              남습니다. 실행한 기록은 각 업무의 이력에 남으며 지울 수 없습니다.
            </p>
            <ul className="mb-3 flex flex-col gap-2 rounded-sm border border-rule-frame bg-surface px-4 py-3">
              {items.map(({ work }) => (
                <li
                  key={work.id}
                  className="text-body-sm break-keep text-gray-90"
                >
                  · {work.title}
                </li>
              ))}
            </ul>
            <form action={executeHandover}>
              {/* 이 앱에서 가장 무거운 단추다 — 주담당이 실제로 바뀌고 열람
                  권한이 옮겨 간다. 되돌릴 수 없는 동작에는 무슨 일이 벌어지는
                  중인지 글로 준다(ui/submit-button.tsx). */}
              <SubmitButton variant="danger" block pendingLabel="실행하는 중…">
                실행합니다
              </SubmitButton>
            </form>
          </div>
        </details>
      </>
    );
  }

  // draft — 대상만 골라 둔 상태. 화면이 여기까지 오는 길은 아직 없지만,
  // 상태값이 넷이므로 넷째 갈래를 비워 두지 않는다.
  return (
    <p className="flex items-start gap-2 text-body-sm break-keep text-gray-60">
      <RotateCcw aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
      <span>넘길 업무를 고르는 중입니다.</span>
    </p>
  );
}

/** 서식 항목 차례 — 기둥과 요약 줄이 **같은 목록**을 본다. */
function tocItems(
  toc: Parameters<typeof HandoverRail>[0]["toc"],
  notUsed: number,
) {
  return [
    ...toc.map((t) => ({
      anchor: handoverBlockAnchor(t.key),
      heading: t.heading,
      tail: t.empty ? "빈칸" : t.notes > 0 ? `보충 ${t.notes}` : undefined,
    })),
    ...(notUsed > 0
      ? [
          {
            anchor: HANDOVER_SCREENING_ANCHOR,
            heading: "규칙이 안 실은 것",
            tail: `${notUsed}건`,
            divider: true,
          },
        ]
      : []),
  ];
}

/**
 * 좁은 화면에서 **서식 위에** 서는 요약 한 줄.
 *
 * ── 왜 생겼나 ──────────────────────────────────────────────────────────────
 *
 * xl 미만에서는 격자가 풀려 기둥이 서식 **위로** 통째로 올라왔다. 재 보니
 * 390px 에서 서식 윗변이 **1911px** — 뷰포트 844px 의 2.3배였다(DESIGN.md
 * §18.1). 그 1911px 안에 「내용을 확인했습니다」가 들어 있었다. **되돌릴 수
 * 없는 확인이 확인 대상보다 두 화면 먼저 있었다는 뜻이다.**
 *
 * 그래서 기둥을 서식 아래로 내렸다. 코드 차례를 바꾼 것이라 눈의 차례와 탭
 * 차례가 여전히 같다(`order` 를 쓰지 않은 이유는 handover-screen.tsx 에).
 * 대신 그 폭에서 사람이 문서에 들어가기 **전에** 알아야 하는 것 둘만 여기
 * 남긴다 — **지금 몇 단계인가**, 그리고 **어느 항목이 있는가.**
 *
 * 단계표를 그대로 올리지 않는다. 세로 넉 줄이 약 270px 이고, 그러면 이 요약이
 * 다시 크롬이 된다. 한 줄이면 「2/4 초안 생성」으로 충분하다 — 넉 단계 전부와
 * 각 단계의 설명은 서식 아래 기둥이 그대로 갖고 있다.
 */
export function HandoverRailBrief({
  status,
  toc,
  notUsed,
  hasAction,
}: {
  status: HandoverStatus;
  toc: Parameters<typeof HandoverRail>[0]["toc"];
  notUsed: number;
  /** 서식 아래에 누를 것이 있는가. 있으면 그것이 어디 있는지 말해 준다. */
  hasAction: boolean;
}) {
  const index = HANDOVER_STEPS.indexOf(status);

  return (
    <section
      aria-label="인계 진행 요약"
      className="rounded-sm border border-rule-frame bg-surface print:hidden xl:hidden"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3">
        <span className="text-body-sm font-bold tabular-nums text-accent-text">
          {index + 1}/{HANDOVER_STEPS.length}
        </span>
        <span className="text-body-sm font-bold text-gray-90">
          {HANDOVER_STATUS_LABEL[status]}
        </span>
        {hasAction ? (
          <span className="text-body-xs break-keep text-gray-60">
            누를 것은 서식 아래에 있습니다
          </span>
        ) : null}
      </p>

      {/* 접어 둔다. 펼침은 브라우저가 하므로 스크립트가 없어도 열린다.
          기본이 닫힘인 이유는 이 판이 있는 자리 때문이다 — 문서에 닿기까지의
          높이를 줄이려고 만든 것이 스스로 그 높이를 도로 먹으면 안 된다. */}
      {toc.length > 0 ? (
        <details className="border-t border-rule-hair">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-body-sm font-bold text-gray-60 [&::-webkit-details-marker]:hidden">
            항목으로 가기
            <span className="ml-auto text-body-xs font-normal tabular-nums">
              {toc.length}개 항목
            </span>
          </summary>
          <nav
            aria-label="서식 항목"
            className="border-t border-rule-hair px-4 py-3"
          >
            <HandoverToc items={tocItems(toc, notUsed)} />
          </nav>
        </details>
      ) : null}
    </section>
  );
}
