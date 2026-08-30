import "server-only";

import { gatherForWorks, type HandoverView, type WorkRecords } from "@/lib/data";
import { formatDate, formatDueLabel, josa } from "@/lib/format";
import { ISSUE_CUE_NAMES, issueLabels } from "@/lib/handover-cues";
import {
  STATUS_LABEL,
  VISIBILITY_LABEL,
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
  paragraphs: string[];
  /** 이 문단들이 어느 기록에서 나왔는지 */
  sources: string[];
  /** 채울 근거가 없어 사람이 직접 적어야 하는 항목 */
  needsHuman?: boolean;
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

/** 인용문 길이 상한. 잘라내는 것도 왜곡이라 넉넉히 둔다. */
const QUOTE_MAX = 220;

/** 한 업무에서 인계서로 옮길 대화 수 상한. 서식이 목록으로 변하면 아무도 안 읽는다. */
const QUOTES_PER_WORK = 3;

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

/** 줄바꿈을 눕혀 한 문단으로. 서식 안의 인용은 원문의 줄 모양까지 옮기지 않는다. */
function quote(body: string): string {
  const flat = body.replace(/\s*\n+\s*/g, " ").trim();
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX)}…` : flat;
}

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
} {
  const matched: IssueQuote[] = [];
  for (const c of comments) {
    const labels = issueLabels(c.body);
    if (labels.length > 0) matched.push({ comment: c, labels });
  }
  // 최근 것부터 남기되, 남긴 것끼리는 오간 순서를 지킨다. 대화는 순서가 곧 맥락이다.
  return { matched: matched.length, picked: matched.slice(-QUOTES_PER_WORK) };
}

// ---------------------------------------------------------------------------

/** 업무 한 건에 딸린 기록을 한 번만 읽어 둔다. */
type Gathered = {
  work: WorkListItem;
  document: Document | null;
  sections: DocSectionWithEditor[];
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
  const records = await gatherForWorks(works.map((w) => w.id));
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
      sections: r.sections,
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
  const duties = works.map((w) => {
    const parts = [
      `· ${w.title}`,
      `  소관 ${w.department.name} · 공개범위 ${VISIBILITY_LABEL[w.visibility]} · 현재 ${STATUS_LABEL[w.derived]}`,
    ];
    if (w.due_date) {
      parts.push(`  기한 ${formatDate(w.due_date)} (${formatDueLabel(w.due_date)})`);
    }
    if (w.members.length > 1) {
      const others = w.members
        .filter((m) => m.profile_id !== view.from.id)
        .map((m) => who(m.profile))
        .join(", ");
      if (others) parts.push(`  함께 보는 사람: ${others}`);
    }
    return parts.join("\n");
  });

  // --- 나. 주요 업무계획 및 진행사항 ---------------------------------------
  const progress = gathered.map(({ work: w, document, sections, activities }) => {
    const lines = [`· ${w.title}`];
    if (w.description) lines.push(`  ${w.description}`);

    // 진행 상황이 적힌 항목을 우선 가져온다. 없으면 마지막으로 고친 항목을 쓴다.
    const progressSection =
      sections.find((s) => s.heading?.includes("진행")) ??
      [...sections].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (progressSection?.body) {
      lines.push(
        `  [${document?.title} — ${progressSection.heading ?? "본문"}]`,
        ...progressSection.body.split("\n").map((l) => `  ${l}`),
      );
    }

    const lastStatus = activities.find((a) => a.kind === "work.status_changed");
    if (lastStatus) {
      lines.push(
        `  최근 상태 변경: ${formatDate(lastStatus.created_at)} ${lastStatus.summary}`,
      );
    }
    return lines.join("\n");
  });

  // --- 다. 현안사항 및 문제점 ----------------------------------------------
  //
  // 근거가 셋이고 성격이 다르다. 어디서 나왔는지를 문단마다 밝힌다.
  //   ① 문서의 「현안 및 유의사항」 항목 — 이미 정리된 것
  //   ② 대화 — 아직 정리되지 않은 것. 그래서 인계에서 가장 잘 사라진다
  //   ③ 기한이 지난 업무 — 시스템이 계산으로 아는 것
  const issues: string[] = [];
  let matchedComments = 0;
  let quotedComments = 0;

  for (const { work: w, document, sections, comments } of gathered) {
    // 업무 한 건이 한 문단이다. 근거마다 문단을 나누면 같은 업무 제목이
    // 서너 번 되풀이되고, 종이에서는 그게 그대로 서식을 어지럽힌다.
    const lines: string[] = [];

    const issueSection = sections.find(
      (s) => s.heading?.includes("현안") || s.heading?.includes("유의"),
    );
    if (issueSection?.body) {
      lines.push(
        `  [${document?.title} — ${issueSection.heading}]`,
        ...issueSection.body.split("\n").map((l) => `  ${l}`),
      );
    }

    const picks = pickIssueComments(comments);
    matchedComments += picks.matched;
    for (const { comment: c, labels } of picks.picked) {
      quotedComments += 1;
      lines.push(
        `  [대화 — ${who(c.author)}, ${formatDate(c.created_at)} · ${labels.join(" · ")}]`,
        `  “${quote(c.body)}”`,
      );
    }

    if (w.derived === "overdue" && w.due_date) {
      lines.push(
        `  기한이 지났습니다. ${formatDate(w.due_date)} 마감, ${formatDueLabel(w.due_date)}.`,
      );
    }

    if (lines.length > 0) issues.push([`· ${w.title}`, ...lines].join("\n"));
  }
  if (issues.length === 0) {
    // 볼 업무가 아예 없는 것과, 업무는 봤는데 현안이 없는 것은 다른 말이다.
    issues.push(
      gathered.length === 0 ? EMPTY_WORKS : "확인된 현안사항이 없습니다.",
    );
  }

  // --- 라. 주요 미결사항 ---------------------------------------------------
  const pending = works
    .filter((w) => w.derived !== "done")
    .map((w) => {
      const due = w.due_date
        ? `${formatDate(w.due_date)}까지 (${formatDueLabel(w.due_date)})`
        : "기한 미정";
      return `· ${w.title} — ${STATUS_LABEL[w.derived]}, ${due}`;
    });

  // --- 2. 관련 문서 현황 ---------------------------------------------------
  const docs: string[] = [];
  for (const { work: w, document, sections, attachments } of gathered) {
    if (!document && attachments.length === 0) continue;

    const lines = [`· ${w.title}`];
    if (document) {
      lines.push(
        `  문서 「${document.title}」 (항목 ${sections.length}개)`,
        ...sections.map((s) => `    - ${s.heading ?? "제목 없는 항목"}`),
      );
    }
    if (attachments.length > 0) {
      lines.push(
        `  첨부 ${attachments.length}건`,
        ...attachments.map((f) => `    - ${f.file_name} (${f.uploader.name} 등록)`),
      );
    }
    docs.push(lines.join("\n"));
  }

  // --- 4. 그 밖의 참고사항 -------------------------------------------------
  const notes: string[] = [];
  const repeating = works.filter((w) => w.previous_year);
  if (repeating.length > 0) {
    notes.push(
      "해마다 반복되는 업무입니다. 작년 판이 시스템에 남아 있으니 함께 보십시오.\n" +
        repeating
          .map((w) => `· ${w.title}\n    작년: ${w.previous_year?.title}`)
          .join("\n"),
    );
  }
  const crossDept = works.filter((w) => w.department_count > 1);
  if (crossDept.length > 0) {
    notes.push(
      "다른 부서와 함께 보는 업무입니다. 담당자가 바뀐 사실을 알려야 합니다.\n" +
        crossDept.map((w) => `· ${w.title} (${w.department_count}개 부서)`).join("\n"),
    );
  }
  notes.push(
    `인계자 ${who(view.from)}${josa(
      view.from.position ?? view.from.name,
      "은",
      "는",
    )} 인계 후에도 열람 권한을 유지합니다. 확인이 필요한 사항은 문의할 수 있습니다.`,
  );

  const blocks: DraftBlock[] = [
    {
      key: "1-duties",
      heading: "1-가. 담당 업무",
      // 인수자가 다른 과 사람이면 대상 업무가 그 사람 눈에는 0건일 수 있다
      // (부서 공개 업무는 RLS가 다른 과에 내주지 않는다). 그때 제목만 있고 본문이
      // 없는 결재 문서가 나오면 만들다 만 것처럼 보인다. 다른 칸에는 전부 있는
      // 폴백을 여기에도 둔다. "없다"가 아니라 "못 본다"일 수 있음을 함께 적는다.
      paragraphs: duties.length > 0 ? duties : [EMPTY_WORKS],
      sources: [`업무 ${works.length}건의 기본 정보와 참여자 목록`],
    },
    {
      key: "1-progress",
      heading: "1-나. 주요 업무계획 및 진행사항",
      paragraphs: progress.length > 0 ? progress : [EMPTY_WORKS],
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
      paragraphs: pending.length > 0 ? pending : ["미결 업무가 없습니다."],
      sources: ["완료되지 않은 업무의 상태와 기한"],
    },
    {
      key: "2-docs",
      heading: "2. 관련 문서 현황",
      paragraphs: docs.length > 0 ? docs : ["등록된 문서와 첨부가 없습니다."],
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
        "이 시스템에는 물품·예산 정보가 없습니다. 재무회계시스템과 물품관리대장에 있는 내용이라, 규칙은 이 칸을 채우지 않습니다.",
      ],
      sources: [],
      needsHuman: true,
    },
    {
      key: "4-notes",
      heading: "4. 그 밖의 참고사항",
      paragraphs: notes,
      sources: ["연간 반복 업무 연결 정보", "참여 부서 수"],
    },
  ];

  return {
    blocks,
    evidence: {
      works: works.length,
      documents: documentCount,
      activities: activityCount,
      attachments: attachmentCount,
      comments: commentCount,
    },
  };
}
