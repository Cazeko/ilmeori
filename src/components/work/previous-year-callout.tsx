import Link from "next/link";
import { ArrowRight, FileText, Paperclip, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/format";
import { getPreviousYearBrief } from "@/lib/data";
import type { Profile } from "@/lib/types";

/**
 * 「작년 이맘때」.
 *
 * 행정 업무의 상당수는 해마다 같은 시기에 같은 일을 다시 한다.
 * 그런데 담당자는 2년마다 바뀌므로, 두 번째 사람은 늘 처음부터 다시 한다.
 *
 * 작년 판을 옆에 놓아 주는 것만으로 대부분이 해결된다.
 * 이 카드는 "작년에 무엇을 남겼는지"까지 보여 준다. 링크만 있으면 아무도 누르지 않는다.
 *
 * 이 제품에서 강조색(HS Orange)을 쓰는 자리는 여기와 인계·인수뿐이다.
 * 아무 데나 쓰면 강조가 아니게 된다.
 */
/** 조회 결과. 두 구현(db·mock)이 같은 모양을 돌려주므로 여기서 한 번만 받아 적는다. */
export type PreviousYearBrief = NonNullable<
  Awaited<ReturnType<typeof getPreviousYearBrief>>
>;

/**
 * 조회까지 하는 쪽. 업무 상세처럼 「이 업무의 작년 판」 하나만 필요한 화면이 쓴다.
 *
 * 홈은 이것을 쓰지 않는다. 홈은 왕복을 Promise.all 로 한꺼번에 던지는 화면이라,
 * 여기서 다시 await 하면 그 뒤에 왕복이 한 겹 더 붙는다. 홈은 브리프를 직접
 * 받아 아래 PreviousYearCard 만 그린다.
 */
export async function PreviousYearCallout({
  viewer,
  previousWorkId,
  currentWork,
}: {
  viewer: Profile;
  previousWorkId: string;
  currentWork?: { id: string; title: string };
}) {
  // 작년 업무를 볼 권한이 없으면 카드 자체를 그리지 않는다.
  // "작년 판이 있다"는 사실만 흘려도 그건 정보다.
  const brief = await getPreviousYearBrief(viewer, previousWorkId);
  if (!brief) return null;

  return <PreviousYearCard brief={brief} currentWork={currentWork} />;
}

export function PreviousYearCard({
  brief,
  /**
   * 올해 업무. 업무 상세에서는 이 카드가 이미 그 업무 안에 있으므로 필요 없지만,
   * 홈에서는 어느 업무의 작년 판인지 말해 주지 않으면 카드가 허공에 뜬다.
   */
  currentWork,
}: {
  brief: PreviousYearBrief;
  currentWork?: { id: string; title: string };
}) {
  return (
    /* 판 전체가 주황이었다(accent-bg + accent 테두리). 홈에서 세로로 긴
       주황 덩어리가 되어, 「지금 손대야 하는 일」보다 이 회고 판이 먼저
       눈에 들어왔다. 작년 판은 **참고**이지 지금 할 일이 아니다.
       주황은 왼쪽 3px 선 한 줄로만 남긴다 — 이 판이 무엇인지 가리키는
       데는 그것으로 족하고, 면을 칠하면 무게가 생긴다. */
    <section
      aria-labelledby="prev-year-heading"
      className="rounded-sm border border-rule-frame border-l-3 border-l-accent bg-surface p-4"
    >
      <p
        id="prev-year-heading"
        className="flex items-center gap-2 text-body-xs font-bold text-accent-text"
      >
        <RotateCcw aria-hidden className="size-3.5" />
        작년 이맘때
      </p>

      {currentWork ? (
        <p className="mt-2 text-body-xs break-keep text-gray-70">
          <Link
            href={`/works/${currentWork.id}`}
            className="inline-flex items-center font-bold text-gray-90 transition-colors duration-150 hover:text-primary pointer-coarse:min-h-6"
          >
            「{currentWork.title}」
          </Link>
          는 해마다 반복되는 업무입니다. 작년 판을 옆에 놓고 시작하세요.
        </p>
      ) : null}

      <p className="mt-2 text-body-sm leading-snug font-bold break-keep text-gray-90">
        {brief.work.title}
      </p>
      <p className="mt-1 text-body-xs text-gray-60">
        {formatDate(brief.lastTouchedAt)}에 마지막으로 손댔습니다.
      </p>

      {brief.headings.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-rule-hair pt-3">
          {brief.headings.map((h) => (
            <li
              key={h}
              className="flex items-start gap-2 text-body-xs text-gray-70"
            >
              <FileText aria-hidden className="mt-1 size-3 shrink-0 text-gray-40" />
              <span className="break-keep">{h}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {brief.attachmentCount > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-body-xs text-gray-60">
          <Paperclip aria-hidden className="size-3 shrink-0" />첨부{" "}
          {brief.attachmentCount}건
        </p>
      ) : null}

      <Link
        href={`/works/${brief.work.id}`}
        className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-sm bg-surface px-3 text-body-sm font-bold text-gray-70 ring-1 ring-gray-20 transition-colors duration-150 hover:bg-gray-5 hover:text-gray-90 hover:ring-gray-30 pointer-coarse:min-h-11"
      >
        작년 판 열어 보기
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
