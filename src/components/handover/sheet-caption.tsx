import Link from "next/link";
import { screeningTotal, type HandoverDraft } from "@/lib/handover-draft";
import { SCREENING_ANCHOR } from "@/components/handover/screening-panel";

/**
 * 서식 위의 한 줄 — **이 문서가 무엇으로 만들어졌는지.**
 *
 * ── 46px 숫자가 아니다 ─────────────────────────────────────────────────────
 *
 * 계획의 첫 판은 여기에 46px 짜리 「47문장 중 41문장」을 세우려 했다.
 * `DESIGN.md` §5.1 이 못박은 물건이 정확히 그것이다 — *"화면의 「문서」는
 * 사용자가 누를 대상이어야 한다. 요약 배너·통계 타일·경고 상자는 아무리 커도
 * 「문서」가 아니라 여백 등급이다."* 결재함과 업무 보드에서 **이미 두 번
 * 걷어낸** 물건이라, 세 번째로 세우면 다음 감사에서 또 걷어낸다.
 *
 * 그래서 15px 한 줄이다. 이 화면의 「문서」는 바로 아래 서 있는 별지
 * 제12호서식이고, 이 줄은 그 문서의 **캡션**이다. 숫자를 크게 말할 자리는
 * 화면이 아니라 발표자의 입이다.
 *
 * ── 자리: `data-rank="doc"` 래퍼 **안** ────────────────────────────────────
 *
 * 실눈 시험은 ①무게와 ②자리를 함께 본다 — 가장 무거운 덩어리가 화면이
 * 「문서」라고 선언한 사각형보다 위에 있으면 안 된다(`tests/squint.test.mjs`).
 * 이 줄을 서식 밖 위쪽에 두면 그 사각형 위에 크롬을 한 칸 얹는 셈이 된다.
 * 캡션이므로 자리도 문서 안이 맞다.
 *
 * ── 꺼짐 기본값을 안전하게 만드는 장치다 ──────────────────────────────────
 *
 * 출처 층은 기본이 꺼짐이다(팀 결정). 그러면 배포 주소를 혼자 열어 본 사람은
 * 토글을 못 찾을 수 있고, 그 사람에게 이 제품은 그냥 문서 생성기다.
 * **이 줄은 토글과 무관하게 늘 보인다** — 층이 꺼져 있어도 「이 문서는
 * 기록에서 나왔다」는 사실이 첫 화면에 남는다.
 *
 * ── 종이에는 안 나간다 ─────────────────────────────────────────────────────
 *
 * 결재에 올라가는 서식에 화면 장치가 섞이면 안 된다. 같은 사실은 서식 맨
 * 아래 「출처」 문단이 종이용 어투로 이미 적고 있다(print-sheet.tsx).
 */
export function SheetCaption({
  screening,
}: {
  screening: HandoverDraft["screening"];
}) {
  const total = screeningTotal(screening);

  // 볼 것이 아예 없으면 셀 것도 없다. 「0건 중 0건」이 첫인상이 되면 규칙이
  // 실패한 것처럼 읽힌다. 아래 미포착 판이 같은 자리에서 같은 판단을 한다
  // (screening-panel.tsx) — 한쪽만 사라지면 화면이 앞뒤가 안 맞는다.
  if (total.seen === 0) return null;

  return (
    <div className="mb-5 border-b border-rule-hair pb-3 print:hidden">
      <p className="text-body-sm leading-relaxed break-keep text-gray-70">
        규칙이 대화·문서 항목 <Count n={total.seen} />을 들여다보고{" "}
        <Count n={total.used} />을 이 서식에 실었습니다. 안 실린{" "}
        <Count n={total.notUsed} />은{" "}
        <Link
          href={`#${SCREENING_ANCHOR}`}
          className="font-bold text-primary"
        >
          아래 「규칙이 무엇을 걸렀나」
        </Link>
        에 있습니다.
      </p>
    </div>
  );
}

/**
 * 숫자 하나.
 *
 * 크기를 올리지 않고 **굵기와 먹색**으로만 세운다 — 이 앱에서 파랑은 「누를 수
 * 있는 것」 하나만 가리키는데(globals.css 의 4갈래) 이 숫자들은 눌리지 않는다.
 * 자릿수가 흔들리지 않게 tabular-nums.
 */
function Count({ n }: { n: number }) {
  return (
    <b className="font-bold tabular-nums text-gray-90">
      {n}건
    </b>
  );
}
