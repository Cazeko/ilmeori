import Link from "next/link";
import { Quote } from "lucide-react";
import { screeningTotal, type HandoverDraft } from "@/lib/handover-draft";
import { SCREENING_ANCHOR } from "@/components/handover/screening-panel";
import { HANDOVER_SHEET_ID } from "@/components/handover/print-sheet";

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
 * ── 종이에는 이 **줄**이 안 나간다. 사실은 나간다 ─────────────────────────
 *
 * 결재에 올라가는 서식에 토글 같은 화면 장치가 섞이면 안 되므로 이 줄은
 * `print:hidden` 이다. **다만 숫자까지 종이에서 사라지면 안 된다** — 결재로
 * 올라가는 것은 종이이고, 「놓친 건 셀 수 있다」가 이 제품이 파는 유일한
 * 정직성이다. 그래서 같은 사실을 서식 맨 아래 「출처」 문단이 종이용 어투로
 * 한 문장 적는다(print-sheet.tsx 의 footer). 한동안 이 주석은 그렇게 적혀
 * 있었지만 실제로는 종이에 그 문장이 **없었다.**
 *
 * ── 토글이 왜 체크박스인가 ────────────────────────────────────────────────
 *
 * `useState` 를 쓰는 클라이언트 컴포넌트로는 **만들 수 없다.**
 * `print-sheet.tsx` 는 `handover-draft.ts` 를 거쳐 `server-only` 를 물고
 * 있어서, 그 서식을 감싸는 컴포넌트에 `"use client"` 를 붙이면 빌드가 깨진다.
 * 팀이 「이 검토 화면에는 자바스크립트를 써도 된다」고 정한 뒤에도 이 자리는
 * 그대로다 — 철학이 아니라 **기술 제약**이기 때문이다.
 *
 * 체크박스 하나 + `globals.css` 규칙 몇 줄이면 끝난다. 얻는 것: 하이드레이션
 * 0 · 자바스크립트 꺼져도 동작 · 인쇄 덮어쓰기가 한 줄.
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
    <>
      {/* 이 체크박스는 **서식과 형제여야 한다.** CSS 가
          `#handover-prov:checked ~ .sheet [data-src]` 로 층을 켜기 때문이다.
          래퍼 안으로 한 겹만 들어가도 그 선택자가 조용히 아무것도 안 맞힌다.

          기본값은 꺼짐이다(팀 결정) — 정부 관계자 심사위원이 처음 봐야 하는
          것은 깨끗한 법정 서식이라는 판단이다. 그 대신 위 캡션이 꺼진 상태에서도
          늘 보이고, 단추 이름이 「비추기」가 아니라 **무엇이 일어나는지 말하는
          동사**다. 둘 다 그 결정에 딸려 온 방어다. */}
      <input
        type="checkbox"
        id={PROVENANCE_TOGGLE_ID}
        className="sr-only"
        aria-controls={HANDOVER_SHEET_ID}
      />
      {/* prov-row·prov-toggle 은 globals.css 가 :checked 상태를 그리는 데 쓴다.
          Tailwind 의 `peer-checked:` 로는 안 된다 — 그 변형은 형제만 맞히는데
          단추는 이 줄 **안**에 있고, 체크박스는 서식과 형제로 남아야 한다. */}
      {/* 아래 선을 긋지 않는다. 이 저장소에서 `border-b` 는 **머리줄**의
          관용구이고(카드 머리·탭·붙박이 머리줄·표), 이 줄에 그으면 캡션이
          별지 제12호서식의 **letterhead 처럼** 읽힌다. 이 줄은 서식의 일부가
          아니라 서식을 설명하는 화면 장치다. 사이는 여백으로 벌린다. */}
      <div className="prov-row mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 print:hidden">
        <p className="min-w-0 flex-1 text-body-sm leading-relaxed break-keep text-gray-70">
          {/* 「일머리에 남은」이 빠지면 안 된다. 16 = 7 + 9 는 **닫힌 셈**으로
              읽히는데, 실제로는 결재 전 통화나 방문으로 오간 말이 애초에 이
              셈 밖에 있다(인터뷰 Q10·Q16·Q27). 그 단서는 스크롤 한참 아래
              미포착 판에도 적혀 있지만, 첫 화면에 단서 없는 숫자를 세우고
              단서는 아래에 두는 것은 이 저장소가 P3 에서 지적한 배치다. */}
          <strong className="font-bold text-gray-90">일머리에 남은</strong>{" "}
          대화·문서 항목 <Count n={total.seen} /> 중{" "}
          {/* 「실었다」가 아니라 「본문을 실었다」다. 안 실렸다는 문서 항목도
              「2. 관련 문서 현황」에는 **제목이** 실려 있다 — 한 낱말 차이로
              심사장에서 「저기 있잖아요」가 된다. */}
          <Count n={total.used} />의 본문을 이 서식에 실었습니다.{" "}
          {total.notUsed > 0 ? (
            <>
              {/* 「아래에 **있다**」고 말하지 않는다. 판이 원문으로 내놓는 것은
                  `missed` 뿐이고 상한에 잘린 `omitted` 는 수로만 남는다.
                  판이 갈래별로 **세는** 것은 둘을 합친 이 수가 맞다. */}
              안 실린 <Count n={total.notUsed} />은 아래 <PanelLink />에서
              갈래별로 셉니다.
            </>
          ) : (
            /* 「안 실린 0건은 아래에 있습니다」로 나가던 갈래다. 판은 같은
               상태에서 「이번에는 안 실린 것이 없습니다」를 그린다. */
            <>
              안 실린 것은 없습니다. 고른 기준은 아래 <PanelLink />에 있습니다.
            </>
          )}
        </p>
        <label htmlFor={PROVENANCE_TOGGLE_ID} className="prov-toggle">
          <Quote aria-hidden className="size-4 shrink-0" />
          문장마다 출처 보기
        </label>
      </div>
    </>
  );
}

/**
 * 체크박스의 id.
 *
 * `globals.css` 가 이 문자열을 **선택자로 그대로 적어 두고 있다**
 * (`#handover-prov:checked ~ .sheet …`). 여기를 고치면 그 파일도 같이 고쳐야
 * 하고, 안 고치면 화면은 멀쩡한데 토글만 아무 일도 안 한다.
 */
const PROVENANCE_TOGGLE_ID = "handover-prov";

/**
 * 숫자 하나.
 *
 * 크기를 올리지 않고 **굵기와 먹색**으로만 세운다 — 이 앱에서 파랑은 「누를 수
 * 있는 것」 하나만 가리키는데(globals.css 의 4갈래) 이 숫자들은 눌리지 않는다.
 * 자릿수가 흔들리지 않게 tabular-nums.
 */
function Count({ n }: { n: number }) {
  return <b className="font-bold tabular-nums text-gray-90">{n}건</b>;
}

/**
 * 미포착 판으로 가는 링크.
 *
 * **파랑을 안 쓴다.** 별지 제12호서식 면은 이 앱에서 유일하게 색이 한 갈래도
 * 안 든 자리이고(print-sheet.tsx 에 색 유틸리티가 0건이다), 그 면의 맨 위에
 * 파란 글자를 놓으면 문서에서 처음 눈에 드는 색이 **문서 밖으로 나가라는
 * 링크**가 된다. 서식 안의 링크 규약을 그대로 쓴다 — 굵은 먹색, hover 에서만
 * 파랑(draft-lines.tsx 와 같은 모양).
 *
 * 판 이름은 고유명이라 줄바꿈에 잘리면 안 된다. `break-keep` 은 어절 안쪽만
 * 막으므로, 여는 「 와 닫는 」 가 서로 다른 줄에 놓여 파란 덩어리가 링크 둘로
 * 읽히던 자리다(같은 이유로 미포착 판도 whitespace-nowrap 을 쓴다).
 */
function PanelLink() {
  return (
    <Link
      href={`#${SCREENING_ANCHOR}`}
      className="font-bold whitespace-nowrap text-gray-90 transition-colors duration-150 hover:text-primary"
    >
      「규칙이 무엇을 걸렀나」
    </Link>
  );
}
