import { cn } from "@/lib/cn";

/**
 * 기다리는 동안의 표시 — 「HWASEONG」이 둘러 도는 지구본.
 *
 * ── 왜 이 자리에만 두는가 ──────────────────────────────────────────────────
 *
 * 이 저장소는 움직임을 셋으로 묶어 두었고, 각각이 **무슨 질문에 답하는지**를
 * 함께 적는다(globals.css). 그 규칙을 그대로 따른다. 이것이 답하는 질문은
 * **「아직 만드는 중인가?」** 하나다.
 *
 * 그 물음이 실제로 생기는 자리는 둘뿐이다 — 인계서 초안과 결재 문서. 둘 다
 * 서버가 쌓인 기록을 훑어 서식을 조립하므로 몇 초가 걸리고, 그동안 화면이
 * 아무 말도 안 하면 사람은 **눌리지 않았다고 읽고 한 번 더 누른다.** 그 두
 * 번째 클릭이 이 제품에서 가장 비싼 실수다(ui/submit-button.tsx).
 *
 * 목록을 여는 것처럼 수백 밀리초짜리 이동에는 쓰지 않는다. 거기서는 이미
 * 자리표시(shell/nav-placeholder.tsx)가 답한다.
 *
 * ── 왜 하필 도는 글자인가 ──────────────────────────────────────────────────
 *
 * 돌아가는 원호 하나를 그리면 어느 제품에나 있는 그 표시가 된다. 이 화면은
 * 화성특례시 공무원이 하루 여덟 시간 띄워 두는 창이고, 기다리는 몇 초는 이
 * 제품이 자기가 누구인지 말할 수 있는 몇 안 되는 순간이다. 그래서 도는 것을
 * **시의 이름**으로 만든다.
 *
 * 색은 새로 만들지 않는다. 시 BI 의 파랑 두 단과 주황이고 셋 다 이미 토큰에
 * 있다(DESIGN.md §10 — 색을 늘리지 않는다).
 *
 *   primary     #004696  HS Blue
 *   primary-30  #6690c0  같은 파랑의 밝은 단
 *   accent      #dc6e2d  HS Orange
 *
 * 글자는 장식이므로 `aria-hidden` 이다. 읽어야 할 말은 부르는 쪽이 글로 준다
 * (ui/form-waiting.tsx 의 role="status").
 *
 * ── 느리게 돈다 ────────────────────────────────────────────────────────────
 *
 * 10초에 한 바퀴다. 기다림을 재촉하는 표시가 아니라 「돌고 있다」는 사실만
 * 말하는 표시라, 빠르면 조급해 보인다. 지구본이 도는 속도가 그렇다.
 *
 * `motion-safe:` 가 반드시 붙어야 한다. 무한 반복은 전역 reduced-motion 규칙
 * (길이 0.01ms)으로 멎는 것이 아니라 뭉개진다 — globals.css 가 같은 이유로
 * 도는 표시 셋에 전부 이것을 붙여 두었다. 움직임을 끈 사람에게는 글자가 그냥
 * 둥글게 놓인 그림으로 남는다.
 */

/**
 * 원을 **꽉** 채운다. 반만 차면 도는 것이 아니라 흔들리는 것으로 보인다.
 *
 * 반지름 46 의 둘레는 289px 이고, 11px 글자에 자간 1.5 면 한 글자가 약 8.7px
 * 이라 33자가 들어간다. 「HWASEONG · 」(11자) 세 번이 정확히 그 길이다.
 *
 * 한글을 함께 두르지 않는다. 글자 폭이 로마자의 두 배라 한 바퀴가 안 맞고,
 * 무엇보다 **아래쪽 절반에서 거꾸로 선다** — 로마자는 뒤집혀도 무늬로 읽히지만
 * 한글이 뒤집히면 읽으려다 실패한다. 시 이름은 아래 글이 이미 말한다.
 */
const RING = "HWASEONG · ".repeat(3);

/** 세 색을 돌려 쓴다 — 파랑 · 밝은 파랑 · 주황. */
const TONE = ["fill-primary", "fill-primary-30", "fill-accent"] as const;

export function WaitingGlobe({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden
      className={cn("size-28 shrink-0", className)}
    >
      <defs>
        {/* 글자가 얹힐 원. 시계 방향으로 그려야 글자가 바로 선다. */}
        <path
          id="ilm-globe-ring"
          fill="none"
          d="M 60,60 m -46,0 a 46,46 0 1,1 92,0 a 46,46 0 1,1 -92,0"
        />
      </defs>

      {/* 지구본의 윤곽. 가는 선 하나 — 이 시스템의 위계는 선이 나른다. */}
      <circle
        cx="60"
        cy="60"
        r="33"
        fill="none"
        strokeWidth="1"
        className="stroke-rule-hair"
      />
      {/* 자오선 둘. 원 안에 타원 두 개를 겹치면 구가 도는 것처럼 읽힌다. */}
      <ellipse
        cx="60"
        cy="60"
        rx="13"
        ry="33"
        fill="none"
        strokeWidth="1"
        className="stroke-rule-hair"
      />
      <line
        x1="27"
        y1="60"
        x2="93"
        y2="60"
        strokeWidth="1"
        className="stroke-rule-hair"
      />

      <g
        style={{ transformOrigin: "60px 60px" }}
        className="motion-safe:animate-globe"
      >
        <text
          fontSize="11"
          fontWeight="700"
          letterSpacing="1.5"
          className="font-sans"
        >
          <textPath href="#ilm-globe-ring" startOffset="0">
            {[...RING].map((ch, i) => (
              <tspan key={`${ch}-${i}`} className={TONE[i % TONE.length]}>
                {ch}
              </tspan>
            ))}
          </textPath>
        </text>
      </g>
    </svg>
  );
}
