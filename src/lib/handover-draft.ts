import "server-only";

import {
  gatherForWorks,
  getDepartments,
  type HandoverView,
  type WorkRecords,
} from "@/lib/data";
import { docChunks, docTitle, parseRichDoc } from "@/lib/editor/model";
import { formatDate, formatDueLabel, josa } from "@/lib/format";
import {
  ISSUE_CUE_NAMES,
  issueLabels,
  sectionCueFor,
} from "@/lib/handover-cues";
import {
  STATUS_LABEL,
  VISIBILITY_LABEL,
  type ActivityKind,
  type ActivityWithActor,
  type AttachmentWithUploader,
  type CommentWithAuthor,
  type DocSectionWithEditor,
  type Document,
  type HandoverBlockKey,
  type Profile,
  type WorkListItem,
} from "@/lib/types";

/**
 * 「업무인계·인수서」 초안 만들기.
 *
 * 서식 근거
 *   「행정업무의 운영 및 혁신에 관한 규정」 제61조
 *   같은 규정 시행규칙 제45조, 별지 제12호서식
 *
 * 항목 구성은 별지 제12호서식 그대로다.
 *   1. 업무현황 (가. 담당 업무 / 나. 주요 업무계획 및 진행사항 /
 *                다. 현안사항 및 문제점 / 라. 주요 미결사항)
 *   2. 관련 문서 현황
 *   3. 주요 물품 및 예산 등 인계·인수가 필요한 사항
 *   4. 그 밖의 참고사항
 *
 * 이 제품이 하는 일은 "빈 서식을 대신 채워 주는 것"이 아니다.
 * 항목마다 **어느 기록에서 나왔는지**를 함께 남긴다.
 * 인계자가 확인해야 할 것은 문장이 그럴듯한가가 아니라 근거가 맞는가이기 때문이다.
 * 근거를 못 붙이는 항목(물품·예산 등)은 지어내지 않고 비워 둔 채로 표시한다.
 */

/**
 * 이 줄이 어느 기록에서 나왔는가 — **가리킬 수 있는 형태로.**
 *
 * 근거 꼬리표는 원래 「대화 26건 중 8건」처럼 **세는 말**뿐이었다. 세는 말은
 * 「어디서 나왔는지 적었다」는 주장이지 확인 수단이 아니다. 2차 심사에서
 * *"AI가 쓴 답변같이 보였는데"* 라는 말이 나왔고, 거기에 대고 아니라고 말해
 * 봐야 소용이 없다. **눌러서 원문으로 가는 것 하나가 그 자리에서 끝낸다.**
 *
 * 그래서 문단을 통짜 문자열이 아니라 줄의 목록으로 두고, 줄마다 출처를 단다.
 * 업무를 가리키는 줄에는 업무가, 대화를 인용한 줄에는 그 대화가 붙는다.
 *
 * 가리키는 자리를 **주소가 아니라 신원으로** 담는다. 주소를 만드는 일은
 * `workTalkHref()`(types.ts)가 하고, 그건 화면의 몫이다. 문서 모델이 주소를
 * 들고 있으면 라우트가 바뀌는 날 결재로 올라간 문서에 옛 주소가 남는다.
 */
export type DraftRef =
  /** 업무 화면 */
  | { kind: "work"; workId: string }
  /** 업무 화면의 그 대화 */
  | { kind: "comment"; workId: string; commentId: string }
  /** 업무 문서의 그 항목 */
  | { kind: "section"; workId: string; sectionId: string }
  /**
   * 업무의 문서 탭 — **가리킬 자리 없이.**
   *
   * 서식 문서의 블록에는 화면에 자리표가 없다(doc-preview.tsx 는 React key 만
   * 쓴다). 여기서 블록 id 로 앵커를 만들면 아무 데도 안 가는 링크가 되고,
   * 그 실패는 404 도 콘솔 오류도 남기지 않는다. 실제로 대화 쪽에서 한 번 냈다.
   * 없는 자리를 가리키느니 문서 탭에 세운다.
   */
  | { kind: "doc"; workId: string };

/** 문단을 이루는 한 줄. `ref` 가 있으면 **화면에서만** 누를 수 있다. */
export type DraftLine = { text: string; ref?: DraftRef };

/**
 * 한 문단.
 *
 * 문단 하나가 업무 하나다. 근거마다 문단을 나누면 같은 업무 제목이 서너 번
 * 되풀이되고, 종이에서는 그게 그대로 서식을 어지럽힌다. 그래서 링크는 문단이
 * 아니라 **줄**에 붙는다.
 */
export type DraftParagraph = DraftLine[];

/**
 * 문단을 글자로 눕힌다.
 *
 * 화면은 줄마다 링크를 그리고, **종이와 저장본은 이 함수 하나만 쓴다.**
 * 링크는 화면의 장치이지 문서의 내용이 아니다 — 종이에 인쇄된 「(누르세요)」나
 * 결재로 올라간 문서에 남은 앵커는 둘 다 오류다.
 *
 * 이 함수가 예전의 통짜 문자열과 한 글자라도 다르면 종이와 화면이 다른 말을
 * 하게 되므로, 시험이 그것부터 본다(tests/handover-draft.test.mjs).
 */
export function draftParagraphText(p: DraftParagraph): string {
  return p.map((l) => l.text).join("\n");
}

/**
 * 칸 하나를 한 줄로 — 사람이 적어야 하는 칸에서만 쓴다.
 *
 * 화면과 종이가 이 식을 각자 적고 있었다. 두 매체가 같은 문단에서 나온다는
 * 것이 이 구조의 전부인데, 정작 문단을 잇는 방법이 두 곳에 있으면 그 자리에서
 * 갈라진다.
 */
export function draftBlockText(paragraphs: DraftParagraph[]): string {
  return paragraphs.map(draftParagraphText).join(" ");
}

export type DraftBlock = {
  /**
   * 서식 항목을 가리키는 고정 키.
   *
   * 화면의 React key와 인계자가 보탠 글(handover_note.block_key)이 이것으로 묶인다.
   * 항목 이름을 키로 쓰면 문구를 한 번 다듬는 순간 예전 보충이 어느 칸 것인지
   * 알 수 없게 된다.
   */
  key: HandoverBlockKey;
  /** 서식상의 항목 이름 */
  heading: string;
  /** 본문 문단들 */
  paragraphs: DraftParagraph[];
  /** 이 문단들이 어느 기록에서 나왔는지 */
  sources: string[];
  /** 채울 근거가 없어 사람이 직접 적어야 하는 항목 */
  needsHuman?: boolean;
};

/**
 * 서식에 안 실린 이유. 둘뿐이고, 둘의 뜻이 아주 다르다.
 *
 * **값이 곧 화면에 찍히는 글자다.** 짧은 코드값을 두고 화면이 따로 사람 말로
 * 옮기면, 그 대응표가 이 파일에서 가장 어긋나기 쉬운 자리가 된다 —
 * 이 저장소가 이미 두 번 겪은 실패다(handover-cues.ts 머리말).
 */
export type MissedWhy =
  /** 규칙이 찾는 표현이 없었다 — 규칙 기반이 치르는 대가 */
  | "규칙 밖"
  /** 규칙에는 걸렸는데 칸마다 정한 수에 잘렸다 — 우리가 정한 상한 */
  | "상한에 잘림";

/**
 * 서식에 **안 실린** 기록 한 건. 화면의 「규칙이 무엇을 걸렀나」가 그대로 띄운다.
 *
 * 서식에는 들어가지 않는다 — 이건 문서의 내용이 아니라 **문서를 믿어도 되는지
 * 확인하는 장치**다. 종이와 저장본은 blocks 만 본다.
 */
export type MissedRecord = {
  workId: string;
  workTitle: string;
  /** 목록에서 이 줄을 구분하는 키. 대화 id · 항목 id · 블록 id */
  key: string;
  /** 「홍길동 주무관」(대화) 또는 항목 제목(문서) */
  label: string;
  /** 대화만 갖는다. 서식 문서의 덩어리에는 조각마다의 시각이 없다. */
  at: string | null;
  /** 줄바꿈을 눕히고 220자에서 자른 글. 잘렸으면 아래가 참이다. */
  body: string;
  truncated: boolean;
  ref: DraftRef;
  why: MissedWhy;
};

/**
 * 한 갈래의 기록을 규칙이 어떻게 갈랐는가.
 *
 * ── 셋을 더하면 반드시 본 수가 된다 ────────────────────────────────────────
 *
 *     seen === used + missed.length + omitted
 *
 * 이 항등식이 이 타입의 전부다. 예전에는 「본 것 · 걸린 것 · 안 걸린 것」을
 * 셌는데, 거기에는 **걸렸지만 상한에 잘린 것**이 어느 칸에도 없었다.
 * 세 숫자가 서로 안 맞는 것을 아무도 눈치채지 못하는 구조였다.
 * 지금은 기록 하나하나가 정확히 한 칸에 들어가고, 시험이 그걸 본다.
 */
export type Screened = {
  /** 규칙이 들여다본 수 */
  seen: number;
  /** 서식에 실은 수 */
  used: number;
  /** 안 실린 것의 원문 (업무별 상한까지) */
  missed: MissedRecord[];
  /**
   * 목록 상한에 걸려 화면에도 못 실은 수.
   *
   * 미포착은 이 파일에서 **유일하게 상한이 없던 목록**이었다. 서식 쪽은
   * QUOTES_PER_WORK·PROCESS_MAX 로 다 묶어 두고 정작 「다 보여 준다」는 판이
   * 무제한이면, 업무 스무 건짜리 인계에서 목록이 수백 줄이 되어 두 초 만에
   * 넘긴다는 이 판의 목적 자체가 깨진다. 잘랐으면 잘랐다고 적는다.
   */
  omitted: number;
};

export type HandoverDraft = {
  blocks: DraftBlock[];
  /** 초안을 만드는 데 실제로 참고한 기록 수 */
  evidence: {
    works: number;
    documents: number;
    activities: number;
    attachments: number;
    comments: number;
  };
  /**
   * 무엇을 몇 건 보고 몇 건을 실었는가 — **그리고 안 실은 것은 무엇인가.**
   *
   * 규칙 기반의 값은 정밀도이고 대가는 재현율이다. 이 제품은 그 대가를 숨기지
   * 않기로 했다. 놓친 건 셀 수 있고, 지어낸 건 셀 수 없다.
   *
   * 갈래가 둘인 이유는 초안이 읽는 것이 둘이기 때문이다. 예전에는 대화만
   * 셌고, 그래서 화면의 제목도 「대화에서 무엇을 걸렀나」로 좁혀 두어야 했다 —
   * 「1-나」가 항목 하나만 싣고 나머지 본문을 어디에도 안 내는데 그걸 세는
   * 자리가 없었다. 못 세는 것을 세었다고 말하지 않으려는 좁힘이었고,
   * 이제 세므로 넓힌다.
   */
  screening: {
    comments: Screened;
    sections: Screened;
  };
};

// ---------------------------------------------------------------------------
// 대화에서 현안을 고르기
// ---------------------------------------------------------------------------

/**
 * 근거 꼬리표에 「…이 언급된 N건」으로 적을 갈래 이름과 조사.
 *
 * 이름은 표에서 그대로 가져오고 조사는 그 이름에서 뽑는다. 예전에는 이 문장이
 * 갈래 목록을 손으로 적어 두었고, 이미 표와 어긋나 있었다(표는 「이견·유의」인데
 * 문장은 「이견」). 마지막 이름표가 바뀌면 받침도 함께 바뀐다.
 */
const CUE_MENTION = `${ISSUE_CUE_NAMES}${josa(ISSUE_CUE_NAMES, "이", "가")}`;

// 문단을 짓는 줄들. 어느 줄이 눌리는지가 여기서 한눈에 보이도록 이름을 준다.
/** 가리킬 곳이 없는 줄 */
const plain = (text: string): DraftLine => ({ text });
/** 업무를 가리키는 줄 */
const atWork = (text: string, workId: string): DraftLine => ({
  text,
  ref: { kind: "work", workId },
});
/** 인용한 대화를 가리키는 줄 */
const atComment = (
  text: string,
  workId: string,
  commentId: string,
): DraftLine => ({ text, ref: { kind: "comment", workId, commentId } });
/** 인용한 문서 항목을 가리키는 줄 */
const atPiece = (text: string, workId: string, p: DocPiece): DraftLine => ({
  text,
  ref: pieceRef(workId, p),
});
const pieceRef = (workId: string, p: DocPiece): DraftRef =>
  p.sectionId
    ? { kind: "section", workId, sectionId: p.sectionId }
    : { kind: "doc", workId };

/**
 * 업무 제목 줄. 다섯 칸이 같은 모양으로 시작한다.
 * 이 줄의 생김새(`· `)를 시험이 근거 삼아 세므로(tests/handover-draft.test.mjs)
 * 다섯 곳에 따로 적어 두면 한 곳만 고쳐도 시험이 조용히 반쪽만 본다.
 */
const workTitle = (w: { id: string; title: string }): DraftLine =>
  atWork(`· ${w.title}`, w.id);

/**
 * 「업무 처리 절차」를 이루는 이력 갈래.
 *
 * 심사위원이 말한 절차는 **그 업무를 실제로 처리하는 순서**다. 그런데 인터뷰
 * (2026-08-29, 순천시청 세무 6급 팀장 Q4)에서 실무자가 인계서에 실제로 적는
 * 것은 결재 경로였다 — *"인계자 기안(주무관 또는 팀장) → 팀장 → 과장"*.
 * 그리고 *"업무를 실제로 처리하는 순서인 민원 접수, 현장확인, 관계기관 협의,
 * 위원회 심의, 고시 등은 **필요시 파일 별첨**"* 이라고 했다.
 *
 * 그래서 두 층으로 나눈다. **결재로 지나간 자리는 기록에 있으니 자동으로 적고,
 * 바깥에서 도는 절차는 없다고 화면이 먼저 말한다.** 지어내는 것보다 비워 두고
 * 비었다고 적는 것이 이 제품의 규칙이다.
 *
 * 갈래와 그 자국의 이름을 **한 표에** 둔다. 둘로 나눠 두면 갈래를 하나 더할 때
 * 이름을 빠뜨려도 타입이 통과하고 인계서에 엉뚱한 낱말이 조용히 찍힌다 —
 * types.ts 의 ActivityKind 주석이 적어 둔 바로 그 실패다.
 */
const APPROVAL_TRACE = {
  "approval.submitted": "상신",
  "approval.signed": "서명",
  "approval.rejected": "반려",
  "approval.completed": "완결",
  "approval.withdrawn": "회수",
} as const satisfies Partial<Record<ActivityKind, string>>;

type ApprovalTraceKind = keyof typeof APPROVAL_TRACE;

const isApprovalTrace = (k: ActivityKind): k is ApprovalTraceKind =>
  k in APPROVAL_TRACE;

/**
 * 이력 한 줄이 결재 자국인가 — **줄 자체를 좁힌다.**
 * 갈래만 좁히는 술어로 걸러 내면 걸러진 뒤에도 `a.kind` 는 여전히 전체
 * ActivityKind 라, 표에서 이름을 꺼낼 때 타입이 막는다.
 */
const hasApprovalTrace = (
  a: ActivityWithActor,
): a is ActivityWithActor & { kind: ApprovalTraceKind } =>
  isApprovalTrace(a.kind);

/**
 * 「업무 처리 절차」에 실을 결재 자국 수 상한.
 *
 * 인터뷰 Q43·Q44 — *"인계인수서 서식이 복잡하거나 작성하는 양이 많아지게 되면
 * 활용도가 낮아짐"*, 적정 분량 *"3장 내외"*. 칸을 늘리는 것보다 각 칸이 부는
 * 쪽이 더 빨리 3장을 넘긴다.
 */
const PROCESS_MAX = 6;

/** 인용문 길이 상한. 잘라내는 것도 왜곡이라 넉넉히 둔다. */
const QUOTE_MAX = 220;

/** 한 업무에서 인계서로 옮길 대화 수 상한. 서식이 목록으로 변하면 아무도 안 읽는다. */
const QUOTES_PER_WORK = 3;

/**
 * 한 업무에서 「미포착」에 보여 줄 대화 수 상한.
 *
 * 서식에 싣는 것(3건)보다 넉넉하게 둔다 — 이 판의 일은 고르는 것이 아니라
 * 내놓는 것이다. 그래도 상한은 둔다. 넘친 수는 화면이 따로 밝힌다.
 */
const MISSED_PER_WORK = 5;

/**
 * 볼 수 있는 대상 업무가 하나도 없을 때 쓰는 문장.
 * "없습니다"라고 단정하지 않는다 — 인계 자체는 있는데 보는 사람에게만 안 보이는
 * 경우가 있고(다른 과 인수자 + 부서 공개 업무), 그때 "없다"고 적으면 거짓이 된다.
 */
const EMPTY_WORKS =
  "표시할 인계 대상 업무가 없습니다. 대상이 없거나, 지금 계정에 보이지 않는 업무입니다.";

function who(p: Pick<Profile, "name" | "position">): string {
  return [p.name, p.position].filter(Boolean).join(" ");
}

/**
 * 줄바꿈을 눕혀 한 문단으로. 서식 안의 인용은 원문의 줄 모양까지 옮기지 않는다.
 *
 * **잘랐는지도 함께 돌려준다.** 「원문 그대로 싣는다」고 말해 놓고 220자에서
 * 말없이 자르면 그 말이 거짓이 된다. 자른 것 자체는 어쩔 수 없지만(서식이
 * 목록으로 변한다), 잘랐다는 사실은 화면이 말할 수 있다.
 */
function quote(body: string): { text: string; truncated: boolean } {
  const flat = body.replace(/\s*\n+\s*/g, " ").trim();
  return flat.length > QUOTE_MAX
    ? { text: `${flat.slice(0, QUOTE_MAX)}…`, truncated: true }
    : { text: flat, truncated: false };
}

/**
 * 「가. 담당 업무」에 붙는 업무 처리 절차.
 *
 * 결재 이력을 오간 순서대로 옮긴다. 요약문을 그대로 싣지 않는 이유는 그 안에
 * 결재 제목이 통째로 들어 있어(「…원가산정 용역 결과 협조 요청」) 업무마다 같은
 * 제목이 서너 줄씩 되풀이되기 때문이다. 대신 **정해진 자리에서만** 읽는다.
 */
function processLines(
  w: WorkListItem,
  activities: ActivityWithActor[],
  deptName: (id: string | null | undefined) => string | null,
): DraftLine[] {
  const steps = activities
    .filter(hasApprovalTrace)
    // 절차는 오간 순서가 곧 뜻이다. 그런데 **시각만 보면 갈린다** —
    // sign_approval() 은 서명과 완결을 같은 트랜잭션에서 찍고(0017),
    // created_at 은 트랜잭션 시각이라 두 줄이 같은 값을 갖는다. 그러면
    // 완결이 서명 앞에 서고, Postgres 쪽은 순서가 아예 정해지지도 않는다.
    // id 는 단조 증가하므로 그것으로 가른다.
    .sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id - y.id);
  if (steps.length === 0) return [];

  // 넘치면 **최근 것을 남긴다.** 오래된 쪽을 남기면 완결·반려처럼 결과를 말하는
  // 자국이 잘려 나가고, 인계서가 「올리기는 했는데 어떻게 됐는지는 모름」이 된다.
  // 대화를 고를 때와 같은 방향이다(pickIssueComments).
  const shown = steps.slice(-PROCESS_MAX);
  const lines: DraftLine[] = [plain("  [업무 처리 절차]")];
  if (steps.length > shown.length) {
    lines.push(
      atWork(
        `    앞의 ${steps.length - shown.length}건은 업무 화면의 결재 탭에 있습니다`,
        w.id,
      ),
    );
  }

  for (const a of shown) {
    const actor = a.actor ? who(a.actor) : "알 수 없음";
    // 소관 부서가 아닌 사람이 찍힌 자리가 곧 협조다. 부서 이름을 붙여야
    // 인계받는 사람이 「이 건은 밖과 물려 있다」를 한 줄에서 안다.
    // 소속을 모르면 모른다고 적는다 — 아무 표시도 안 하면 같은 과로 읽힌다.
    const dept = a.actor ? deptName(a.actor.department_id) : null;
    const mark = !a.actor
      ? ""
      : dept === null
        ? "(소속 미상)"
        : dept === w.department.name
          ? ""
          : `(${dept})`;

    // ⚠ 요약문에서 낱말만 찾으면 안 된다. 반려 요약문에는 **반려 사유가 그대로
    // 박혀 있고**(0017 의 format), 사유는 대개 결재 이야기다 —
    // "협조란 서명을 먼저 받아 오세요" 한 줄이 「협조 반려」로 찍힌다.
    // 그래서 서명한 자국에서만, 그것도 **제목 뒤 고정 자리**에서 읽는다.
    //   「제목」 협조란에 서명했습니다 (의견 있음)
    const box =
      a.kind === "approval.signed"
        ? a.summary.match(/」\s*(\S+?)란에 서명했습니다/)?.[1]
        : undefined;
    const opinion =
      a.kind === "approval.signed" && /서명했습니다 \(의견 있음\)/.test(a.summary)
        ? " · 의견 있음"
        : "";
    const trace = APPROVAL_TRACE[a.kind];
    const what = box ? `${box}란 ${trace}` : trace;

    lines.push(
      plain(`    ${formatDate(a.created_at)} ${actor}${mark} ${what}${opinion}`),
    );
  }

  return lines;
}

/**
 * 협조·연락이 오간 부서를 모은다.
 *
 * 세 소스의 합집합이고, **소관 부서와 다른 부서만** 남긴다. 같은 과 사람은
 * 인계받는 사람이 이미 옆자리에서 만난다.
 *   ① 결재 이력의 행위자 — 협조 결재가 여기 찍힌다
 *   ② 대화를 쓴 사람
 *   ③ 업무에 참여한 사람
 *
 * 건수 많은 순으로 세우고, 같으면 이름순으로 둔다. 같은 자료에서 두 번 뽑으면
 * 같은 차례로 나와야 한다 — 인계서를 두 번 뽑아 sha256 이 같아야 하기 때문이다.
 */
function collectContacts(
  gathered: Gathered[],
  deptName: (id: string | null | undefined) => string | null,
): Array<{ dept: string; detail: string }> {
  type Row = {
    approvals: number;
    comments: number;
    /** 사람을 센다. 건수를 세면 한 사람이 세 업무에 있을 때 「3명」이 된다. */
    members: Set<string>;
    /** 마지막으로 **무슨 일이 오간** 날. 참여자 등록은 여기 안 들어간다. */
    last: string;
  };
  const tally = new Map<string, Row>();

  const rowFor = (
    departmentId: string | null | undefined,
    home: string,
  ): Row | null => {
    const name = deptName(departmentId);
    if (!name || name === home) return null;
    const row = tally.get(name) ?? {
      approvals: 0,
      comments: 0,
      members: new Set<string>(),
      last: "",
    };
    tally.set(name, row);
    return row;
  };

  for (const { work: w, activities, comments } of gathered) {
    const home = w.department.name;
    for (const a of activities) {
      if (!isApprovalTrace(a.kind)) continue;
      const row = rowFor(a.actor?.department_id, home);
      if (!row) continue;
      row.approvals += 1;
      if (a.created_at > row.last) row.last = a.created_at;
    }
    for (const c of comments) {
      const row = rowFor(c.author.department_id, home);
      if (!row) continue;
      row.comments += 1;
      if (c.created_at > row.last) row.last = c.created_at;
    }
    for (const m of w.members) {
      // ⚠ 참여자에는 **날짜를 붙이지 않는다.** 예전에는 `w.updated_at` 을 썼는데
      // 그건 「업무 행이 마지막으로 고쳐진 때」라 그 부서와 아무 상관이 없다.
      // 누가 오탈자 하나를 고친 날이 「최근 연락한 날」로 찍히면, 지어내지 않는다는
      // 이 문서의 규칙을 이 줄 하나가 깬다.
      rowFor(m.profile.department_id, home)?.members.add(m.profile_id);
    }
  }

  return [...tally]
    .map(([dept, r]) => {
      const bits = [
        r.approvals > 0 ? `결재 ${r.approvals}건` : "",
        r.comments > 0 ? `대화 ${r.comments}건` : "",
        r.members.size > 0 ? `참여자 ${r.members.size}명` : "",
      ].filter(Boolean);
      // 오간 일이 없고 참여자로만 묶인 부서에는 날짜가 없다. 그게 사실이다.
      const when = r.last ? ` (최근 ${formatDate(r.last)})` : "";
      return {
        dept,
        detail: `${bits.join(" · ")}${when}`,
        weight: r.approvals + r.comments + r.members.size,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.dept.localeCompare(b.dept, "ko"))
    .map(({ dept, detail }) => ({ dept, detail }));
}

// ---------------------------------------------------------------------------
// 문서를 읽는 단위
// ---------------------------------------------------------------------------

/**
 * 문서에서 읽어 낸 덩어리 하나 — **항목 문서든 서식 문서든 같은 모양으로.**
 *
 * 아래 `readDoc` 이 두 갈래를 여기로 모은다. 초안 만드는 쪽은 어느 갈래였는지
 * 몰라도 되고, 알면 안 된다 — 「서식 문서면 이렇게」가 칸마다 흩어지는 순간
 * 새 편집기를 쓴 문서만 조용히 다르게 취급받는 자리가 생긴다.
 */
type DocPiece = {
  /** 목록에서 구분하는 키. 항목 id 또는 블록 id */
  key: string;
  heading: string | null;
  body: string;
  /**
   * 항목 문서일 때만 있다. 이것이 있으면 화면에서 그 항목으로 바로 갈 수 있다
   * (`sectionAnchor`). 서식 문서의 덩어리에는 자리표가 없다.
   */
  sectionId?: string;
  /** 문서에서의 차례. 최근순이 같을 때 이걸로 가른다 */
  order: number;
  /** 마지막으로 고친 때 */
  updated_at: string;
};

/**
 * 한 업무의 문서를 읽은 결과 — 무엇을 어느 칸이 가져갔고 무엇이 남았는가.
 */
export type DocRead = {
  /** 화면에 보이는 그 제목. 서식 문서는 본문의 제목 블록이 이긴다 */
  title: string | null;
  pieces: DocPiece[];
  /** 「1-나」가 가져간 것 */
  progress: DocPiece | null;
  /** 「1-다」가 가져간 것 */
  issue: DocPiece | null;
  /** 본문이 있는데 어느 칸도 안 가져간 것 */
  missed: Array<{ piece: DocPiece; why: MissedWhy }>;
};

/**
 * 문서를 서식이 읽을 수 있는 조각들로 편다.
 *
 * ── 서식 문서를 못 읽고 있었다 ─────────────────────────────────────────────
 *
 * 초안은 `doc_section` 만 읽었다. 그런데 서식 문서로 옮기면 그 행들은 **옮긴
 * 시점에서 얼어붙고**(rich-doc.ts 머리말), `createRichDocument` 로 처음부터
 * 서식 문서를 만들면 행이 **아예 없다.** 그래서 우리가 앞세우는 동시편집으로
 * 쓴 문서일수록 인계서에서 사라졌고, 「2. 관련 문서 현황」에는 스무 문단짜리
 * 문서가 「항목 0개」로 찍혔다. 자기 기능이 자기 대표 기능을 지우고 있었다.
 *
 * `blocks` 가 있으면 그쪽이 사실이다 — 화면이 이미 그렇게 그린다
 * (works/[id]/page.tsx 의 `richDoc ? … : <DocSections>`). 모양이 아니면
 * `parseRichDoc` 이 null 을 주고, 그때는 얼어붙은 항목이라도 읽는 편이 낫다.
 *
 * ⚠ **시험 때문에 내보낸다.** 목업의 인계 대상 세 건에는 서식 문서가 하나도
 * 없어서(감량 시범사업 계획은 다른 사람 것이다) `buildHandoverDraft` 를 아무리
 * 돌려도 이 갈래를 한 번도 지나가지 않는다. 시드가 결함을 드러낼 수 없던 그때와
 * 같은 자리다 — 시연은 통과하고 실데이터에서 무너진다. 그래서 시험이 여기로
 * 직접 들어온다(tests/handover-draft.test.mjs [7]).
 */
export function readDoc(
  document: Document | null,
  sections: DocSectionWithEditor[],
): DocRead {
  if (!document) return { title: null, pieces: [], progress: null, issue: null, missed: [] };

  const rich = document.blocks ? parseRichDoc(document.blocks) : null;
  const pieces: DocPiece[] = rich
    ? docChunks(rich).map((c, i) => ({
        key: c.id,
        heading: c.heading,
        body: c.body,
        order: i,
        // 덩어리마다의 시각이 없다. 문서 한 벌이 통째로 한 판이라 그렇다.
        updated_at: document.blocks_updated_at ?? document.updated_at,
      }))
    : sections.map((s, i) => ({
        key: s.id,
        heading: s.heading,
        body: s.body,
        sectionId: s.id,
        order: i,
        updated_at: s.updated_at,
      }));

  return { ...pickPieces(pieces), title: (rich ? docTitle(rich) : "") || document.title, pieces };
}

/**
 * 어느 조각을 어느 칸이 가져가는가.
 *
 * ── 「1-다」가 먼저 고른다 ──────────────────────────────────────────────────
 *
 * 예전에는 두 칸이 각자 골랐고, 그래서 **같은 항목이 두 칸에 두 번 실릴 수
 * 있었다.** 「현안 및 유의사항」 하나뿐인 문서에서 「1-나」는 제목에 「진행」이
 * 없으니 폴백(가장 최근에 고친 것)으로 그 항목을 집었고, 「1-다」도 같은 것을
 * 집었다. 인계서 한 장에 같은 글이 두 번 실리면 읽는 사람은 둘 중 하나가
 * 잘못 실렸다고 읽는다.
 *
 * 「1-다」에 우선권을 준다. 제목에서 「현안」을 찾는 것은 규칙이고, 「1-나」의
 * 폴백은 **아무 규칙도 못 맞췄을 때의 차선**이기 때문이다.
 *
 * 본문이 빈 항목은 세지 않는다. 이 함수가 가르는 것은 「이 글이 인계서에
 * 실렸는가」이고, 글이 없는 항목에는 잃을 것이 없다. (제목은 「2. 관련 문서
 * 현황」에 그대로 나온다)
 */
function pickPieces(pieces: DocPiece[]): Omit<DocRead, "title" | "pieces"> {
  const withBody = pieces.filter((p) => p.body.trim());

  const issue = withBody.find((p) => sectionCueFor(p.heading) === "1-다") ?? null;
  const rest = withBody.filter((p) => p !== issue);

  // 가장 최근에 고친 것. 시각이 같으면(서식 문서는 덩어리마다의 시각이 없어
  // 전부 같다) 문서에 적힌 차례를 따른다 — 같은 자료에서 두 번 뽑아 같은
  // 인계서가 나와야 한다.
  const recent = (list: DocPiece[]): DocPiece | undefined =>
    [...list].sort(
      (a, b) => b.updated_at.localeCompare(a.updated_at) || a.order - b.order,
    )[0];

  // ⚠ 폴백은 **아무 규칙도 안 걸린 것 중에서만** 고른다. 「현안 및 유의사항」이
  // 둘인 문서에서 폴백이 남은 하나를 집으면, 제목에 현안이라고 적힌 글이
  // 「주요 업무계획 및 진행사항」 칸에 실린다. 규칙이 이미 자리를 정해 준
  // 항목을 폴백이 다른 칸으로 끌어가는 것은 규칙이 있으나 마나로 만든다.
  const pool = rest.filter((p) => !sectionCueFor(p.heading));

  const progress =
    rest.find((p) => sectionCueFor(p.heading) === "1-나") ??
    // **제목이 있는 것을 먼저 본다.** 서식 문서는 제목 아래 부서명·기준일 같은
    // 머리말이 오는 일이 흔하고(docChunks 가 그걸 제목 없는 덩어리로 묶는다),
    // 차례로만 고르면 「자원순환과 · 2026. 8. 5. 기준」 한 줄이 「주요 업무계획
    // 및 진행사항」 칸에 실린다. 실제로 목업에서 그랬다. 사람이 이름을 붙인
    // 덩어리가 내용일 가능성이 훨씬 높다.
    recent(pool.filter((p) => p.heading)) ??
    // 제목 붙은 것이 하나도 없을 때만 머리말이라도 싣는다. 빈 칸보다 낫다.
    recent(pool) ??
    null;

  const taken = new Set([issue?.key, progress?.key]);
  return {
    progress,
    issue,
    missed: withBody
      .filter((p) => !taken.has(p.key))
      .map((piece) => ({
        piece,
        // 규칙에 걸리는 제목인데도 안 실렸다면 규칙이 놓친 것이 아니라
        // **칸이 하나만 싣기 때문**이다. 두 사실을 한 이름으로 부르면
        // 규칙을 고쳐야 할 자리와 상한을 고쳐야 할 자리가 뒤섞인다.
        why: sectionCueFor(piece.heading) ? ("상한에 잘림" as const) : ("규칙 밖" as const),
      })),
  };
}

// ---------------------------------------------------------------------------

type IssueQuote = { comment: CommentWithAuthor; labels: string[] };

/**
 * 「1-다. 현안사항 및 문제점」에 실을 대화를 고른다.
 *
 * 이 칸은 서식에서 가장 쓰기 어렵다. 문서에 적힌 현안은 이미 정리가 끝난
 * 것이고, 정작 넘겨받는 사람이 모르면 곤란한 것 — 아직 답이 없는 질문, 서로
 * 어긋난 일정, 확정을 기다리는 결정 — 은 문서가 아니라 **대화에 남는다.**
 * 인계 때마다 그게 통째로 사라지는 것이 이 제품이 지목한 문제이므로,
 * 인계서가 대화를 읽지 않으면 앞뒤가 맞지 않는다.
 *
 * 방식은 뜻을 판정하지 않고 **표현을 찾는 것**이다(규칙표는 `handover-cues.ts`).
 * 규칙이 왜 이 대화를 골랐는지 화면에 그대로 적을 수 있어야 하기 때문이다.
 * 대신 놓치는 것이 반드시 있다. 그래서 고른 대화를 요약하지 않고
 * **원문 그대로 인용**해 인계자가 직접 판단하게 한다.
 * (요약을 모델에 맡기는 것은 그다음 단계다. 근거를 고르는 일은 규칙이 맞다)
 *
 * 걸린 것과 실은 것을 나눠 돌려준다. 근거 꼬리표는 "몇 건 중 몇 건"을 말하는
 * 장치인데, 실은 수만 세면 상한에 걸려 빠진 대화가 애초에 없었던 것처럼 읽힌다.
 * 그러면 나머지를 안 읽어도 된다는 오해를 막으려고 만든 문구가 오히려 그 오해를
 * 만든다.
 */
function pickIssueComments(comments: CommentWithAuthor[]): {
  matched: number;
  picked: IssueQuote[];
  /**
   * **서식에 안 실린 대화.** 세는 것으로 끝내지 않고 원문을 그대로 돌려준다.
   *
   * 규칙 기반이라 놓치는 것이 반드시 있다. 그걸 숫자로만 말하면
   * *"그럼 안 걸린 건 어떻게 됩니까"* 라는 물음에 답할 것이 없고, 화면은
   * 서식이 다 채워진 것처럼 보인다. 원문을 그대로 내주면 그 물음이
   * **물음으로 성립하지 않는다** — 못 걸렀다고 화면이 먼저 말하고, 고를 것은
   * 사람 앞에 놓인다.
   *
   * 안 실린 이유가 둘이고 뜻이 다르다. **규칙 밖**은 규칙을 고쳐야 하는
   * 일이고, **상한**은 우리가 정한 수를 고쳐야 하는 일이다. 예전에는 앞의
   * 것만 돌려주었고, 뒤의 것은 어느 목록에도 없이 사라졌다.
   */
  missed: Array<{ comment: CommentWithAuthor; why: MissedWhy }>;
} {
  const matched: IssueQuote[] = [];
  const missed: Array<{ comment: CommentWithAuthor; why: MissedWhy }> = [];
  for (const c of comments) {
    const labels = issueLabels(c.body);
    if (labels.length > 0) matched.push({ comment: c, labels });
    else missed.push({ comment: c, why: "규칙 밖" });
  }
  // 최근 것부터 남기되, 남긴 것끼리는 오간 순서를 지킨다. 대화는 순서가 곧 맥락이다.
  const picked = matched.slice(-QUOTES_PER_WORK);
  for (const { comment } of matched.slice(0, matched.length - picked.length)) {
    missed.push({ comment, why: "상한에 잘림" });
  }
  // 원문 목록은 최근 것부터 자르므로(MISSED_PER_WORK) 시간순으로 세워 둔다.
  // 두 갈래를 이어 붙인 자리라 여기서 다시 세우지 않으면 순서가 뒤섞인다.
  missed.sort(
    (a, b) =>
      a.comment.created_at.localeCompare(b.comment.created_at) ||
      a.comment.id.localeCompare(b.comment.id),
  );
  return { matched: matched.length, picked, missed };
}

// ---------------------------------------------------------------------------

/** 업무 한 건에 딸린 기록을 한 번만 읽어 둔다. */
type Gathered = {
  work: WorkListItem;
  document: Document | null;
  /**
   * 문서를 **한 번만** 읽어 둔 결과.
   *
   * 「1-나」·「1-다」·「2」가 각자 읽으면 서식 문서의 blocks(최대 1.5MB jsonb)를
   * 업무마다 세 번 파싱하게 된다. 그보다 나쁜 것은 세 곳이 각자 고르다가
   * 서로 다른 조각을 집는 일이다 — 실제로 그래서 같은 항목이 두 칸에 실렸다.
   */
  doc: DocRead;
  activities: ActivityWithActor[];
  attachments: AttachmentWithUploader[];
  comments: CommentWithAuthor[];
};

export async function buildHandoverDraft(
  view: HandoverView,
): Promise<HandoverDraft> {
  const works = view.items.map((i) => i.work);

  // 서식 항목마다 같은 업무를 다시 읽으면 업무 한 건당 왕복이 열 번을 넘는다.
  // 한 번 모아 두고 아래 블록들은 그것만 본다.
  //
  // 업무마다 네 번씩 묻지 않고 표마다 한 번씩 묻는다 — 인계 대상이 몇 건이든
  // 왕복 수가 늘지 않는다(예전에는 건수 × 5였다).
  // 부서는 표 하나가 통째로 오고 건수와 무관하다. 「협조·연락 부서」와
  // 「업무 처리 절차」가 사람의 소속을 이름으로 불러야 해서 한 번 받아 둔다.
  const [records, departments] = await Promise.all([
    gatherForWorks(works.map((w) => w.id)),
    getDepartments(),
  ]);
  const deptById = new Map(departments.map((d) => [d.id, d.name]));
  const deptName = (id: string | null | undefined) =>
    id ? (deptById.get(id) ?? null) : null;
  // 계약상 요청한 id 는 전부 키로 돌아온다. 그래도 없으면 그 업무만 빈 칸으로
  // 두고 나머지를 살린다 — 인계서 한 장이 통째로 안 나오는 것보다 낫다.
  const empty: WorkRecords = {
    document: null,
    sections: [],
    activities: [],
    attachments: [],
    comments: [],
  };
  const gathered: Gathered[] = works.map((work) => {
    const r = records.get(work.id) ?? empty;
    return {
      work,
      document: r.document,
      doc: readDoc(r.document, r.sections),
      activities: r.activities,
      attachments: r.attachments,
      comments: r.comments,
    };
  });

  const documentCount = gathered.filter((g) => g.document).length;
  const activityCount = gathered.reduce((n, g) => n + g.activities.length, 0);
  const attachmentCount = gathered.reduce((n, g) => n + g.attachments.length, 0);
  const commentCount = gathered.reduce((n, g) => n + g.comments.length, 0);

  // --- 가. 담당 업무 -------------------------------------------------------
  //
  // 「업무 처리 절차」가 여기 붙는다. 서식에 칸을 더 만들지 않는다 —
  // 행안부 『2025 행정업무운영 편람』 249쪽의 별지 제12호서식 「가. 담당 업무」
  // 작성 지침이 이미 그렇게 적고 있다.
  //   "직무기술서를 작성하는 형식으로 직무의 성격, 내용, 수행방법 등을 정리하고
  //    **도식화된 업무프로세스를 포함한다.**"
  // 2차 심사에서 「인수인계서에는 업무 프로세스가 있어야 한다」는 지적이 나왔는데,
  // 그건 우리가 칸을 발명할 일이 아니라 이미 있는 칸을 안 채우고 있던 것이다.
  const duties: DraftParagraph[] = gathered.map(({ work: w, activities }) => {
    const parts = [
      workTitle(w),
      plain(
        `  소관 ${w.department.name} · 공개범위 ${VISIBILITY_LABEL[w.visibility]} · 현재 ${STATUS_LABEL[w.derived]}`,
      ),
    ];
    if (w.due_date) {
      parts.push(
        plain(`  기한 ${formatDate(w.due_date)} (${formatDueLabel(w.due_date)})`),
      );
    }
    if (w.members.length > 1) {
      const others = w.members
        .filter((m) => m.profile_id !== view.from.id)
        .map((m) => who(m.profile))
        .join(", ");
      if (others) parts.push(plain(`  함께 보는 사람: ${others}`));
    }
    parts.push(...processLines(w, activities, deptName));
    return parts;
  });
  // 자동으로 채운 것이 어디까지인지 문서가 스스로 말한다. 이 문장이 없으면
  // 「절차를 다 적었다」로 읽히고, 그게 이 칸에서 가장 비싼 오해다.
  // **칸에 한 번만 적는다** — 업무마다 되풀이하면 세 건짜리 인계서에서만도
  // 같은 문장이 세 번 나오고, 그게 3장을 넘기는 가장 흔한 경로다(인터뷰 Q44).
  // 판정을 **렌더된 글자에서 하지 않는다.** 업무 제목은 사람이 지은 것이라
  // 「[업무 처리 절차] 표준화 TF」 같은 제목 하나면 절차가 하나도 없는 칸에
  // 안내문이 붙는다. processLines 가 이미 아는 사실을 그대로 쓴다.
  const hasProcess = gathered.some((g) =>
    g.activities.some((a) => isApprovalTrace(a.kind)),
  );
  if (hasProcess) {
    duties.push([
      plain(
        "[업무 처리 절차]는 결재로 지나간 자리입니다. 민원 접수·현장확인·관계기관 협의·위원회 심의처럼 시스템 밖에서 도는 절차와, 아직 오지 않은 결재는 여기 없습니다. 인계자가 적거나 파일로 붙여 주십시오.",
      ),
    ]);
  }

  // --- 나. 주요 업무계획 및 진행사항 ---------------------------------------
  const progress: DraftParagraph[] = gathered.map(
    ({ work: w, doc, activities }) => {
      const lines = [workTitle(w)];
      if (w.description) lines.push(plain(`  ${w.description}`));

      // 진행 상황이 적힌 항목을 우선 가져온다. 없으면 마지막으로 고친 항목을 쓴다.
      // 어느 것을 고를지는 readDoc 이 이미 정했다 — 「1-다」와 같은 것을 집지
      // 않으려면 두 칸을 한자리에서 갈라야 한다(pickPieces).
      if (doc.progress) {
        lines.push(
          // 문서 항목도 누를 수 있어야 한다. 대화 근거는 눌러서 원문으로 가는데
          // 문서 근거는 못 가면, 확인할 수 있는 근거와 못 하는 근거가 한 장에
          // 섞인다. 읽는 사람은 그 차이를 규칙이 아니라 실수로 읽는다.
          atPiece(
            `  [${doc.title} — ${doc.progress.heading ?? "본문"}]`,
            w.id,
            doc.progress,
          ),
          ...doc.progress.body.split("\n").map((l) => plain(`  ${l}`)),
        );
      }

      const lastStatus = activities.find((a) => a.kind === "work.status_changed");
      if (lastStatus) {
        lines.push(
          plain(
            `  최근 상태 변경: ${formatDate(lastStatus.created_at)} ${lastStatus.summary}`,
          ),
        );
      }
      return lines;
    },
  );

  // --- 다. 현안사항 및 문제점 ----------------------------------------------
  //
  // 근거가 셋이고 성격이 다르다. 어디서 나왔는지를 문단마다 밝힌다.
  //   ① 문서의 「현안 및 유의사항」 항목 — 이미 정리된 것
  //   ② 대화 — 아직 정리되지 않은 것. 그래서 인계에서 가장 잘 사라진다
  //   ③ 기한이 지난 업무 — 시스템이 계산으로 아는 것
  const issues: DraftParagraph[] = [];
  let matchedComments = 0;
  let quotedComments = 0;
  let usedSections = 0;
  const missedComments: MissedRecord[] = [];
  const missedSections: MissedRecord[] = [];
  let omittedComments = 0;
  let omittedSections = 0;

  for (const g of gathered) {
    const { work: w, doc, comments } = g;
    // 업무 한 건이 한 문단이다(DraftParagraph 주석 참조).
    const lines: DraftLine[] = [];

    if (doc.issue) {
      lines.push(
        atPiece(`  [${doc.title} — ${doc.issue.heading}]`, w.id, doc.issue),
        ...doc.issue.body.split("\n").map((l) => plain(`  ${l}`)),
      );
    }

    // 서식이 안 가져간 문서 항목 — 대화와 같은 자리에서, 같은 규칙으로 센다.
    usedSections += (doc.progress ? 1 : 0) + (doc.issue ? 1 : 0);
    const shownPieces = doc.missed.slice(0, MISSED_PER_WORK);
    omittedSections += doc.missed.length - shownPieces.length;
    for (const { piece, why } of shownPieces) {
      const q = quote(piece.body);
      missedSections.push({
        workId: w.id,
        workTitle: w.title,
        key: piece.key,
        label: piece.heading ?? "제목 없는 항목",
        // 조각마다의 시각이 없다(DocPiece). 없는 것을 지어내지 않는다.
        at: null,
        body: q.text,
        truncated: q.truncated,
        ref: pieceRef(w.id, piece),
        why,
      });
    }

    const picks = pickIssueComments(comments);
    matchedComments += picks.matched;
    // 못 거른 것은 서식에 넣지 않고 따로 모은다. 서식은 법이 정한 칸이고,
    // 미포착은 그 칸을 믿어도 되는지 보는 장치라 사는 자리가 다르다.
    // 최근 것부터 남긴다. 오래된 대화가 남으면 「지금 무엇을 놓쳤나」를 보러 온
    // 사람에게 가장 먼 것부터 보이게 된다.
    const shownMissed = picks.missed.slice(-MISSED_PER_WORK);
    omittedComments += picks.missed.length - shownMissed.length;
    for (const { comment: c, why } of shownMissed) {
      const q = quote(c.body);
      missedComments.push({
        workId: w.id,
        workTitle: w.title,
        key: c.id,
        label: who(c.author),
        at: c.created_at,
        body: q.text,
        truncated: q.truncated,
        ref: { kind: "comment", workId: w.id, commentId: c.id },
        why,
      });
    }
    for (const { comment: c, labels } of picks.picked) {
      quotedComments += 1;
      lines.push(
        // 누를 수 있는 것은 꼬리표 줄이다. 인용문 자체를 링크로 만들면 굵은
        // 글자가 문장을 덮어, 「원문 그대로」가 원문처럼 안 보인다.
        atComment(
          `  [대화 — ${who(c.author)}, ${formatDate(c.created_at)} · ${labels.join(" · ")}]`,
          w.id,
          c.id,
        ),
        plain(`  “${quote(c.body).text}”`),
      );
    }

    if (w.derived === "overdue" && w.due_date) {
      lines.push(
        plain(
          `  기한이 지났습니다. ${formatDate(w.due_date)} 마감, ${formatDueLabel(w.due_date)}.`,
        ),
      );
    }

    if (lines.length > 0) issues.push([workTitle(w), ...lines]);
  }
  if (issues.length === 0) {
    // 볼 업무가 아예 없는 것과, 업무는 봤는데 현안이 없는 것은 다른 말이다.
    issues.push([
      plain(gathered.length === 0 ? EMPTY_WORKS : "확인된 현안사항이 없습니다."),
    ]);
  }

  // --- 라. 주요 미결사항 ---------------------------------------------------
  const pending: DraftParagraph[] = works
    .filter((w) => w.derived !== "done")
    .map((w) => {
      const due = w.due_date
        ? `${formatDate(w.due_date)}까지 (${formatDueLabel(w.due_date)})`
        : "기한 미정";
      return [
        atWork(`· ${w.title} — ${STATUS_LABEL[w.derived]}, ${due}`, w.id),
      ];
    });

  // --- 2. 관련 문서 현황 ---------------------------------------------------
  const docs: DraftParagraph[] = [];
  for (const { work: w, document, doc, attachments } of gathered) {
    if (!document && attachments.length === 0) continue;

    const lines = [workTitle(w)];
    if (document) {
      // 항목 수는 **읽을 수 있는 덩어리 수**다. 서식 문서에서는 제목이 이끄는
      // 묶음이 그것이다(docChunks). 예전에는 doc_section 행만 세어서, 처음부터
      // 서식 문서로 만든 스무 문단짜리 문서가 「항목 0개」로 찍혔다.
      lines.push(
        plain(`  문서 「${doc.title}」 (항목 ${doc.pieces.length}개)`),
        ...doc.pieces.map((p) =>
          plain(`    - ${p.heading ?? "제목 없는 항목"}`),
        ),
      );
    }
    if (attachments.length > 0) {
      lines.push(
        plain(`  첨부 ${attachments.length}건`),
        ...attachments.map((f) =>
          plain(`    - ${f.file_name} (${f.uploader.name} 등록)`),
        ),
      );
    }
    docs.push(lines);
  }

  // --- 4. 그 밖의 참고사항 -------------------------------------------------
  const notes: DraftParagraph[] = [];
  const repeating = works.filter((w) => w.previous_year);
  if (repeating.length > 0) {
    notes.push([
      plain(
        "해마다 반복되는 업무입니다. 작년 판이 시스템에 남아 있으니 함께 보십시오.",
      ),
      ...repeating.flatMap((w) => [
        workTitle(w),
        plain(`    작년: ${w.previous_year?.title}`),
      ]),
    ]);
  }
  const crossDept = works.filter((w) => w.department_count > 1);
  if (crossDept.length > 0) {
    notes.push([
      plain("다른 부서와 함께 보는 업무입니다. 담당자가 바뀐 사실을 알려야 합니다."),
      ...crossDept.map((w) =>
        atWork(`· ${w.title} (${w.department_count}개 부서)`, w.id),
      ),
    ]);
  }

  // ── 협조·연락이 오간 부서 ───────────────────────────────────────────────
  //
  // 2차 심사 지적 — *"그 프로세스를 진행할 때 어떤 부서와 연락을 해야 되고
  // 이런 것까지 구체적으로 인수인계서에 담아서"*.
  //
  // 새 칸을 만들지 않고 여기 넣는다. 행안부 『2025 행정업무운영 편람』 249쪽이
  // 별지 제12호서식 「사. 그 밖의 참고사항」에 *"업무지원을 받을 수 있는 인계자의
  // 연락처 등"* 을 적으라고 이미 지목한다. 칸을 늘리면 3장을 넘긴다(인터뷰 Q44).
  //
  // ⚠ 인터뷰 Q5 에서 실무자는 연락처가 아쉽지 않았다고 답했다(명함·메모로 다
  // 받았다). 그래서 **자동으로 채운 것이 어디까지인지**를 크게 적는다 —
  // 계정이 있는 사람만 여기 나온다.
  const contacts = collectContacts(gathered, deptName);
  if (contacts.length > 0) {
    notes.push([
      plain("협조·연락이 오간 부서입니다. 결재 협조와 대화에서 모은 것입니다."),
      ...contacts.map((c) => plain(`· ${c.dept} — ${c.detail}`)),
      plain(
        "여기에는 이 시스템에 계정이 있는 사람만 나옵니다. 경기도·국토부·시행사·설계사·마을 대표처럼 시청 밖 관계자는 인계자가 적어 주십시오.",
      ),
    ]);
  }
  notes.push([
    plain(
      `인계자 ${who(view.from)}${josa(
        view.from.position ?? view.from.name,
        "은",
        "는",
      )} 인계 후에도 열람 권한을 유지합니다. 확인이 필요한 사항은 문의할 수 있습니다.`,
    ),
  ]);

  const blocks: DraftBlock[] = [
    {
      key: "1-duties",
      heading: "1-가. 담당 업무",
      // 인수자가 다른 과 사람이면 대상 업무가 그 사람 눈에는 0건일 수 있다
      // (부서 공개 업무는 RLS가 다른 과에 내주지 않는다). 그때 제목만 있고 본문이
      // 없는 결재 문서가 나오면 만들다 만 것처럼 보인다. 다른 칸에는 전부 있는
      // 폴백을 여기에도 둔다. "없다"가 아니라 "못 본다"일 수 있음을 함께 적는다.
      paragraphs: duties.length > 0 ? duties : [[plain(EMPTY_WORKS)]],
      sources: [
        `업무 ${works.length}건의 기본 정보와 참여자 목록`,
        // 「업무 처리 절차」의 출처. 결재선 표가 아니라 **이력**에서 나온다 —
        // 실제로 지나간 자리만 적는다는 뜻이고, 아직 안 온 결재는 여기 없다.
        //
        // 절차가 한 줄도 없으면 이 꼬리표도 적지 않는다. 쓰지 않은 기록을
        // 근거로 대는 것은 이 꼬리표를 붙인 이유와 정반대다.
        // 갈래 이름은 표에서 가져온다 — 손으로 적어 두었더니 「회수」가 빠져 있었다.
        ...(hasProcess
          ? [`업무 이력 중 결재 ${Object.values(APPROVAL_TRACE).join("·")} 기록`]
          : []),
      ],
    },
    {
      key: "1-progress",
      heading: "1-나. 주요 업무계획 및 진행사항",
      paragraphs: progress.length > 0 ? progress : [[plain(EMPTY_WORKS)]],
      sources: [
        `업무 문서 ${documentCount}건의 진행 항목`,
        `업무 이력 ${activityCount}건 중 상태 변경 기록`,
      ],
    },
    {
      key: "1-issues",
      heading: "1-다. 현안사항 및 문제점",
      paragraphs: issues,
      sources: [
        "업무 문서의 「현안 및 유의사항」 항목",
        // 몇 건 중 몇 건인지를 함께 적는다. "대화에서 뽑았습니다"만 적으면
        // 나머지를 읽지 않아도 된다는 뜻으로 읽힌다.
        //
        // 상한에 걸려 빠진 것이 있으면 그 사실도 덧붙인다. 잘라 놓고 말하지
        // 않으면 "다 실었다"로 읽히고, 그게 이 꼬리표를 붙인 이유와 정반대다.
        // 잘리지 않았을 때는 `matchedComments === quotedComments` 이므로
        // 앞부분은 두 경우가 같은 문장이다 — 덧붙이는 말만 갈린다.
        `대화 ${commentCount}건 중 ${CUE_MENTION} 언급된 ${matchedComments}건` +
          (matchedComments > quotedComments
            ? ` (업무별 최근 ${QUOTES_PER_WORK}건씩 ${quotedComments}건만 실었습니다)`
            : ""),
        "기한이 지난 업무 목록",
      ],
    },
    {
      key: "1-pending",
      heading: "1-라. 주요 미결사항",
      paragraphs: pending.length > 0 ? pending : [[plain("미결 업무가 없습니다.")]],
      sources: ["완료되지 않은 업무의 상태와 기한"],
    },
    {
      key: "2-docs",
      heading: "2. 관련 문서 현황",
      paragraphs: docs.length > 0 ? docs : [[plain("등록된 문서와 첨부가 없습니다.")]],
      sources: [`문서 ${documentCount}건 · 첨부 ${attachmentCount}건`],
    },
    {
      key: "3-assets",
      heading: "3. 주요 물품 및 예산 등 인계·인수가 필요한 사항",
      // 이 문단은 **사실만** 적는다. "직접 적어야 합니다" 같은 지시는 넣지 않는다.
      // 인계자가 실제로 적어 넣은 뒤에도 이 문단은 그대로 남으므로, 지시가 섞여
      // 있으면 다 적은 칸에서 "적었습니다 … 적어야 합니다"가 한 상자 안에 나온다.
      // 지시는 아직 비어 있을 때만 화면과 종이가 각자 덧붙인다.
      paragraphs: [
        [
          plain(
            "이 시스템에는 물품·예산 정보가 없습니다. 재무회계시스템과 물품관리대장에 있는 내용이라, 규칙은 이 칸을 채우지 않습니다.",
          ),
        ],
      ],
      sources: [],
      needsHuman: true,
    },
    {
      key: "4-notes",
      heading: "4. 그 밖의 참고사항",
      paragraphs: notes,
      sources: [
        "연간 반복 업무 연결 정보",
        "참여 부서 수",
        "결재 협조·대화·참여자의 소속 부서(소관 부서와 다른 곳만)",
      ],
    },
  ];

  // 본문이 있는 항목만 센다 — 이 판이 말하는 것은 「이 글이 인계서에 안 실렸다」
  // 이고, 글이 없는 항목에는 잃을 것이 없다(pickPieces 와 같은 기준이라야
  // seen === used + missed + omitted 가 성립한다).
  const sectionCount = gathered.reduce(
    (n, g) => n + g.doc.pieces.filter((p) => p.body.trim()).length,
    0,
  );

  return {
    blocks,
    screening: {
      comments: {
        seen: commentCount,
        used: quotedComments,
        missed: missedComments,
        omitted: omittedComments,
      },
      sections: {
        seen: sectionCount,
        used: usedSections,
        missed: missedSections,
        omitted: omittedSections,
      },
    },
    evidence: {
      works: works.length,
      documents: documentCount,
      activities: activityCount,
      attachments: attachmentCount,
      comments: commentCount,
    },
  };
}
