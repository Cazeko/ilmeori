import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 판 — 세 등급.
 *
 * ── 이 제품은 자기가 뽑아내는 문서처럼 생긴다 ──────────────────────────────
 *
 * 일머리가 마지막에 내놓는 것은 화면이 아니라 **종이**다. 별지 제12호서식,
 * HWPX, 기안문. 그런데 한동안 앱의 껍데기는 그 종이와 아무 상관 없는 둥근
 * 카드였다 — 한 제품 안에 언어가 둘이었고, 종이 쪽이 진짜다.
 *
 *   종이  흰 바탕 · 검은 괘선 · 각진 모서리   editor.css · print-sheet · approval-grid
 *   카드  #fafafa · 6px 둥글기 · 1px 옅은 선   나머지 전부 (34곳 / 16파일)
 *
 * 34곳이 `rounded-md border border-gray-10 bg-surface` 하나였다. 크기만
 * 다르고 **종속(subordination)이 없는** 상자들이다. 「AI 가 만든 티가 난다」는
 * 말은 요란해서가 아니라 **고르게 무난해서** 나온다 — 모든 요소가 저마다
 * 정당한데 어떤 요소도 다른 요소에 종속되어 있지 않다.
 *
 * ── 세 등급 ────────────────────────────────────────────────────────────────
 *
 *   문서 doc    흰 종이 · 각진 모서리 · 위쪽 2px 먹선(rule-head)
 *               제목 34px · 안쪽 24px            **화면당 최대 하나**
 *   판  panel   surface · 1px rule-frame · 4px 둥글기
 *               제목 21px · 안쪽 16px            여러 개
 *   여백 quiet  상자 없음
 *               제목 15px gray-60 · 안쪽 0       여러 개
 *
 * **규칙: 한 화면에 「문서」는 하나다.** 이 한 줄이 실눈 시험(test:squint)이
 * 재는 것과 같은 말이다. 화면을 흐리게 만들었을 때 덩어리 하나가 서면 통과다.
 *
 * quiet 이 셋 중 제일 중요하다. 곁에 두는 참고 정보가 문서와 똑같은 테두리를
 * 두르고 있으면 둘이 동급으로 읽힌다. 테두리를 지우면 바탕으로 물러나고,
 * 그제야 문서가 혼자 선다.
 *
 * ── 그림자는 없다 ──────────────────────────────────────────────────────────
 *
 * 예전 hero 등급에는 그림자가 한 단 있었다. 지웠다. 종이는 뜨지 않는다.
 * 위계는 **크기 + 여백 + 선 굵기**로 낸다 — 서식이 평평하지 않은 이유는
 * 깊이가 아니라 선 굵기이고, 이 앱에 없던 축이 그것이었다(globals.css 의
 * --color-rule-* 참조). `--shadow-*` 토큰은 만들지 않는다. 만들면 쓰인다.
 */

export type CardVariant = "doc" | "panel" | "quiet";

/**
 * 판의 겉모양. `<div>` 가 아닌 태그로 문서를 그리는 곳(work/urgent-hero.tsx 의
 * `<article>`)이 이 표를 가져다 쓴다 — 두 군데에 적어 두면 한쪽만 고치는 날이
 * 반드시 오고, 그러면 「화면에 문서는 하나」라는 전제가 조용히 깨진다.
 *
 * ⚠ 이 표를 손으로 가져다 쓰는 자리에는 **`data-rank="doc"` 를 함께 적는다.**
 * 실눈 시험이 그 표식으로 「흐리게 봤을 때 가장 무거운 자리가 문서 위인가」를
 * 판정한다(tests/squint.test.mjs). 표식이 없으면 그 화면은 문서를 선언하지
 * 않은 것이 되고, 시험은 조용히 아무것도 재지 않는다 — 그래서
 * tests/design-lint.test.mjs 가 둘이 붙어 있는지 감시한다.
 */
export const CARD_SURFACE: Record<CardVariant, string> = {
  // 종이는 순백이다. bg-white 가 아니라 gray-0 을 쓰는 이유는 globals.css 에 —
  // Tailwind 의 bg-white 와 text-white 가 같은 토큰을 보기 때문이다.
  doc: "border border-rule-frame border-t-2 border-t-rule-head bg-gray-0",
  panel: "rounded-sm border border-rule-frame bg-surface",
  quiet: "",
};

/** 등급이 안쪽 여백을 정한다. 한동안 123개 상자가 31가지 조합을 쓰고 있었다. */
const PAD: Record<CardVariant, string> = {
  doc: "p-6", //   24
  panel: "p-4", // 16
  quiet: "", //     0
};

export function Card({
  variant = "panel",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: CardVariant }) {
  return (
    <div data-rank={variant} className={cn(CARD_SURFACE[variant], className)} {...props} />
  );
}

const HEADER: Record<CardVariant, string> = {
  // 문서에는 아래 구분선을 긋지 않는다 — 위쪽 먹선이 이미 「여기서 문서가
  // 시작한다」고 말했다. 선을 위아래로 두 번 그으면 제목이 띠처럼 갇힌다.
  doc: "px-6 pt-6 pb-4",
  panel: "border-b border-rule-hair px-4 py-4",
  quiet: "pb-2",
};

const TITLE: Record<CardVariant, string> = {
  // 좁은 화면에서는 27px 로 둔다. 320px 폭에서 34px 제목은 두 줄이 되고, 그러면
  // 본문이 접힌 만큼 아래로 밀린다 — page-header.tsx 가 같은 이유로 같은 계단을
  // 쓰고, approvals/[id] 가 그 계단을 빠뜨려 한 번 물렸다(DESIGN.md T7).
  // 이 가지는 아직 부르는 곳이 없다. 그래서 지금 적어 둔다 — 처음 쓰는 사람이
  // 같은 버그를 다시 만들지 않도록.
  doc: "text-h2 font-bold tracking-tight break-keep text-gray-90 sm:text-h1",
  panel: "text-h3 font-bold text-gray-90",
  quiet: "text-body-sm font-bold text-gray-60", // 물러난다
};

const BODY: Record<CardVariant, string> = {
  doc: "px-6 pb-6",
  panel: "px-4 py-4",
  quiet: "",
};

export function CardHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  variant = "panel",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** 문서 등급은 대개 그 화면의 h1 이다 — 화면마다 h1 은 정확히 하나다. */
  as?: "h1" | "h2" | "h3";
  variant?: CardVariant;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        HEADER[variant],
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className={TITLE[variant]}>{title}</Heading>
        {description ? (
          <p className="mt-2 text-body-sm text-gray-60">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  variant = "panel",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: CardVariant }) {
  return <div className={cn(BODY[variant], className)} {...props} />;
}

/**
 * 머리 없이 통째로 쓰는 판. `<Card>` 안에 `<CardBody>` 만 넣던 자리를 한 겹
 * 줄인다 — 판 안에 판이 들어가는 모양이 34개 상자를 만든 원인 중 하나였다.
 */
export function CardPad({
  variant = "panel",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: CardVariant }) {
  return (
    <div
      data-rank={variant}
      className={cn(CARD_SURFACE[variant], PAD[variant], className)}
      {...props}
    />
  );
}
