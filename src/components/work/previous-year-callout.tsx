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
export async function PreviousYearCallout({
  viewer,
  previousWorkId,
}: {
  viewer: Profile;
  previousWorkId: string;
}) {
  // 작년 업무를 볼 권한이 없으면 카드 자체를 그리지 않는다.
  // "작년 판이 있다"는 사실만 흘려도 그건 정보다.
  const brief = await getPreviousYearBrief(viewer, previousWorkId);
  if (!brief) return null;

  return (
    <section
      aria-labelledby="prev-year-heading"
      className="rounded-md border border-accent/35 bg-accent-bg p-4"
    >
      <p
        id="prev-year-heading"
        className="flex items-center gap-1.5 text-body-xs font-bold text-accent-text"
      >
        <RotateCcw aria-hidden className="size-3.5" />
        작년 이맘때
      </p>

      <p className="mt-2 text-body-sm leading-snug font-bold break-keep text-gray-90">
        {brief.work.title}
      </p>
      <p className="mt-1 text-body-xs text-gray-60">
        {formatDate(brief.lastTouchedAt)}에 마지막으로 손댔습니다.
      </p>

      {brief.headings.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-accent/20 pt-3">
          {brief.headings.map((h) => (
            <li
              key={h}
              className="flex items-start gap-1.5 text-body-xs text-gray-70"
            >
              <FileText aria-hidden className="mt-0.5 size-3 shrink-0 text-gray-40" />
              <span className="break-keep">{h}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {brief.attachmentCount > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-body-xs text-gray-60">
          <Paperclip aria-hidden className="size-3 shrink-0" />첨부{" "}
          {brief.attachmentCount}건
        </p>
      ) : null}

      <Link
        href={`/works/${brief.work.id}`}
        data-variant="plain"
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-white px-3 text-body-sm font-bold text-accent-text ring-1 ring-accent/30 hover:bg-accent hover:text-white hover:ring-accent"
      >
        작년 판 열어 보기
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
