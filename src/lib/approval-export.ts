import "server-only";

import {
  getActivities,
  getAttachments,
  getComments,
  getWorkDocument,
} from "@/lib/data";
import { isStruckOut, splitSteps } from "@/lib/approval";
// 근거를 고르는 규칙은 따로 산다 — 이 파일은 server-only 라 시험이 못 부른다.
// 그 표는 온나라로 나가는 문서에 무엇이 「근거」로 실릴지를 혼자 정하므로
// 시험이 닿는 자리에 두어야 한다(approval-cues.ts 머리말).
import { basisLabels } from "@/lib/approval-cues";
import { formatDate, formatFullDateTime, josa } from "@/lib/format";
import type { HwpxDoc, HwpxParagraph, HwpxTable } from "@/lib/hwpx/pack";
import {
  APPROVAL_FORM_LABEL,
  APPROVAL_KIND_LABEL,
  APPROVAL_STATE_LABEL,
  type ApprovalWithSteps,
  type ApprovalStepWithApprover,
  type Profile,
} from "@/lib/types";

/**
 * 「온나라로 넘기기」 — 결재 문서 한 장을 근거와 함께 내보낸다.
 *
 * 서식 근거
 *   「행정업무의 운영 및 혁신에 관한 규정 시행규칙」 제3조제3항, 별지 제2호서식
 *   (= 내부결재문서. 발신문서인 별지 제1호서식은 온나라의 자리다)
 *
 * ── 이 화면이 무엇을 더하는가 ──────────────────────────────────────────────
 *
 * 결재 문서 자체는 사람이 쓴 것이다. 우리가 더하는 것은 그 문서를 **왜 그렇게
 * 썼는지가 어느 기록에 남아 있는지**다. 온나라에도, 브리티웍스에도,
 * 네이버웍스에도 없는 것은 결재도 HWPX도 아니고 이 꼬리표다.
 *
 *   2. 사전 검토·협의
 *      · 건축과와 협의 완료
 *        근거: 결재 협조란 박도윤 주무관 서명 (2026-08-09) · 「의견 있음」
 *
 * ── 지키는 것 셋 ───────────────────────────────────────────────────────────
 *
 *   1. **근거를 고르는 일은 규칙이 한다.** 모델이 고르면 왜 골랐는지 못 적는다
 *      (handover-draft.ts 와 같은 판단이고, 같은 이유다)
 *   2. **원문을 요약하지 않는다.** 고른 대화는 그대로 인용하고, 판단은 사람이 한다
 *   3. **없는 것을 지어내지 않는다.** 근거가 없는 칸은 비운 채로 그렇게 적는다
 *
 * ── 기안 중인 문서는 내보내지 않는다 ───────────────────────────────────────
 *
 * 문서번호가 아직 없고 본문도 얼어붙지 않았다. 그 상태의 종이가 「결재 문서」
 * 모양으로 나가면, 아무도 서명하지 않은 글이 결재를 받은 문서처럼 보인다.
 * 그건 위조다. 상신한 뒤부터 내보낼 수 있다.
 */

export type ExportLine = {
  text: string;
  /** 이 줄이 어느 기록에서 나왔는가. 규칙이 적는다. */
  source?: string;
  /** 인용문 — 화면과 종이에서 따옴표로 감싸 원문임을 드러낸다. */
  quote?: boolean;
};

export type ExportBlock = {
  key: string;
  heading: string;
  lines: ExportLine[];
  /** 채울 근거가 하나도 없었던 칸. 지어내지 않고 그렇게 적는다. */
  empty?: boolean;
};

export type ApprovalExport = {
  approval: ApprovalWithSteps;
  /** 상신 전에는 번호가 없다. 그 상태는 canExport 가 막는다. */
  docNo: string;
  blocks: ExportBlock[];
  /** 실제로 읽은 기록 수. 꼬리표가 「몇 건 중 몇 건」을 말할 수 있게. */
  evidence: {
    steps: number;
    opinions: number;
    sections: number;
    comments: number;
    /** 규칙이 근거로 걸러 낸 대화 수. 상한에 걸려 빠진 것이 있는지 여기서 안다. */
    matchedComments: number;
    quotedComments: number;
    attachments: number;
    activities: number;
  };
  /** 업무를 볼 수 없는 계정(협조자)이면 근거 자료를 싣지 못한다. */
  workVisible: boolean;
};

/** 내보낼 수 있는 상태인가. 이유까지 함께 준다 — 화면이 그대로 적는다. */
export function exportBlockReason(
  approval: Pick<ApprovalWithSteps, "state">,
): string | null {
  return approval.state === "drafting"
    ? "아직 상신되지 않은 문서입니다. 문서번호가 없고 본문도 얼어붙지 않았으므로 결재 문서로 내보내지 않습니다."
    : null;
}

function who(p: Pick<Profile, "name" | "position">): string {
  return [p.name, p.position].filter(Boolean).join(" ");
}

/** 서명 당시의 직위를 쓴다. profile 을 조인해 그리면 인사이동이 옛 문서를 고친다. */
function whoAtSigning(step: ApprovalStepWithApprover): string {
  return `${step.approver.name} ${step.position}`;
}

/**
 * 서명되지 않은 칸을 뭐라고 적을 것인가.
 *
 * 「아직 처리하지 않음」한 가지로 뭉뚱그리면 **끝난 문서가 거짓말을 한다.**
 * 전결로 완결된 문서에서 그 뒤 칸은 아무도 서명하지 않는데, 그 칸에
 * 「아직」이라고 적으면 같은 종이가 위에서는 「결재상태: 완결」이라고 해 놓고
 * 아래에서는 누군가를 기다리는 것처럼 읽힌다.
 *
 * 화면의 결재란(approval-grid.tsx)은 이미 이 셋을 갈라 놓았다. 그 구분이
 * 온나라로 나가는 종이·파일에서만 사라지면, 화면·종이·파일이 같은 말을 한다는
 * 이 화면의 주장 자체가 깨진다. **같은 말로 적는다.**
 */
function unsignedText(
  step: ApprovalStepWithApprover,
  approval: Pick<ApprovalWithSteps, "state">,
  steps: readonly ApprovalStepWithApprover[],
): string {
  if (isStruckOut(step, steps)) return "전결로 끝나 결재하지 않았습니다";
  switch (approval.state) {
    case "rejected":
      return "미결 — 문서가 반려로 끝났습니다";
    case "withdrawn":
      return "미결 — 기안자가 회수했습니다";
    case "completed":
      // 전결이 아닌데 완결된 문서에 빈칸이 남는 경우다. 「아직」이라고 적으면
      // 거짓이므로 사실만 적는다 — 왜 비었는지는 결재란 전체를 봐야 안다.
      return "미결 — 문서가 완결로 끝났습니다";
    default:
      return "아직 처리하지 않았습니다";
  }
}

/** 줄바꿈을 눕혀 한 문단으로. 서식 안의 인용은 원문의 줄 모양까지 옮기지 않는다. */
const QUOTE_MAX = 200;
function quote(body: string): string {
  const flat = body.replace(/\s*\n+\s*/g, " ").trim();
  // 코드포인트로 센다. `length`·`slice` 는 UTF-16 코드 단위라 보조평면 글자를
  // 반으로 쪼개고, 그 반쪽은 파일로 나가면서 U+FFFD(�)가 된다.
  // **「인용은 원문 그대로」라고 적어 놓고 인용 끝에 마름모를 붙이는 셈**이라,
  // 이 파일이 스스로 어기는 자리가 된다. (코드리뷰에서 잡혔다)
  const chars = [...flat];
  return chars.length > QUOTE_MAX
    ? `${chars.slice(0, QUOTE_MAX).join("")}…`
    : flat;
}

/** 한 결재 문서에 실을 대화 수 상한. 서식이 목록으로 변하면 아무도 안 읽는다. */
const QUOTES_MAX = 5;

export async function buildApprovalExport(
  approval: ApprovalWithSteps,
): Promise<ApprovalExport> {
  const workVisible = approval.work !== null;

  // 업무를 볼 수 없는 계정(결재선에만 이름이 있는 협조자)에서는 근거 자료를
  // 읽을 수 없다. RLS 가 어차피 0건을 주지만, 묻지 않는 편이 정직하다 —
  // 「없다」와 「내가 못 본다」는 다른 말이고 아래에서 그렇게 적는다.
  const [{ document, sections }, comments, attachments, activities] =
    workVisible
      ? await Promise.all([
          getWorkDocument(approval.work!.id),
          getComments(approval.work!.id),
          getAttachments(approval.work!.id),
          getActivities(approval.work!.id),
        ])
      : [
          { document: null, sections: [] as Awaited<
            ReturnType<typeof getWorkDocument>
          >["sections"] },
          [] as Awaited<ReturnType<typeof getComments>>,
          [] as Awaited<ReturnType<typeof getAttachments>>,
          [] as Awaited<ReturnType<typeof getActivities>>,
        ];

  const { main, concur, post } = splitSteps(approval.steps);
  const opinions = approval.steps.filter((s) => s.opinion?.trim());

  const blocks: ExportBlock[] = [];

  // --- 1. 본문 -------------------------------------------------------------
  //
  // 기안자가 쓴 글이다. 규칙이 손대지 않는다. 인계서에서 「규칙이 뽑은 문단은
  // 사람이 못 고친다」고 한 것의 반대편이고, 이유는 같다 — 누가 쓴 문장인지가
  // 문서에 남아야 한다.
  const bodyLines: ExportLine[] = (approval.body || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .map((text) => ({ text }));
  if (bodyLines.length > 0) {
    const drafter = who(approval.drafter);
    // 「박준호 주무관가」가 되지 않게 받침을 본다. 결재 문서에 실리는 문장이라
    // 조사 하나가 틀려도 읽는 사람이 한 번 멈춘다.
    bodyLines[0].source = `기안자 ${drafter}${josa(drafter, "이", "가")} 직접 작성 · 상신 시점에 얼어붙음`;
  }
  blocks.push({
    key: "body",
    heading: "1. 본문",
    lines:
      bodyLines.length > 0
        ? bodyLines
        : [{ text: "본문이 비어 있습니다." }],
    empty: bodyLines.length === 0,
  });

  // --- 2. 사전 검토·협의 ---------------------------------------------------
  //
  // 협조란은 「이 문서를 다른 과가 실제로 봤다」는 증빙이다. 자문에서 나온
  // *"그때 님이 결재해주셨는데 이제 와서 왜 딴소리"* 가 가리키는 그 자리다.
  const reviewLines: ExportLine[] = [];
  for (const step of concur) {
    if (step.signed_at) {
      reviewLines.push({
        text: `${whoAtSigning(step)} 협조 완료${step.opinion?.trim() ? " (의견 있음)" : ""}`,
        source: `결재 협조란 서명 · ${formatDate(step.signed_at)}`,
      });
      if (step.opinion?.trim()) {
        reviewLines.push({
          text: quote(step.opinion),
          quote: true,
          source: "시행규칙 제4조의 「의견 있음」",
        });
      }
    } else if (step.rejected_at) {
      reviewLines.push({
        text: `${whoAtSigning(step)} 협조 반려`,
        source: `결재 협조란 반려 · ${formatDate(step.rejected_at)}`,
      });
    } else {
      // 끝난 문서의 협조란을 「대기」라고 적지 않는다. 아무도 기다리고 있지 않다.
      const why = unsignedText(step, approval, approval.steps);
      reviewLines.push({
        text: `${whoAtSigning(step)} 협조 ${
          approval.state === "in_progress" ? "대기" : "미처리"
        }`,
        source: `결재 협조란 · ${why}`,
      });
    }
  }

  // 문서에 적힌 검토 항목. 이미 정리가 끝난 것이라 결재 본문의 뼈대가 된다.
  const reviewSection = sections.find(
    (s) =>
      s.heading?.includes("검토") ||
      s.heading?.includes("배경") ||
      s.heading?.includes("추진"),
  );
  if (reviewSection?.body?.trim()) {
    for (const line of reviewSection.body.split("\n")) {
      if (!line.trim()) continue;
      reviewLines.push({ text: line.trim() });
    }
    reviewLines[reviewLines.length - 1].source = `업무 문서 「${
      document?.title ?? "제목 없음"
    }」의 「${reviewSection.heading ?? "본문"}」 항목`;
  }

  if (reviewLines.length === 0 && !workVisible) {
    reviewLines.push({
      text: "이 계정에서는 관련 업무를 볼 수 없어 근거 자료를 싣지 않았습니다.",
    });
  }
  blocks.push({
    key: "review",
    heading: "2. 사전 검토 및 협의",
    lines:
      reviewLines.length > 0
        ? reviewLines
        : [{ text: "협조 부서가 지정되지 않았고, 업무 문서에도 검토 항목이 없습니다." }],
    empty: reviewLines.length === 0,
  });

  // --- 3. 관련 기록 --------------------------------------------------------
  //
  // 여기가 「그 판단이 어디에서 나왔는가」에 답하는 칸이다. 대화는 문서가 되지
  // 못하고 사라지는 기록이라, 결재 문서에 실리는 순간 처음으로 증빙이 된다.
  const basisLines: ExportLine[] = [];
  let matchedComments = 0;
  const picked: Array<{ line: ExportLine }> = [];
  for (const c of comments) {
    const labels = basisLabels(c.body);
    if (labels.length === 0) continue;
    matchedComments += 1;
    picked.push({
      line: {
        text: quote(c.body),
        quote: true,
        source: `업무 대화 · ${who(c.author)}, ${formatDate(c.created_at)} · ${labels.join(" · ")}`,
      },
    });
  }
  // 최근 것부터 남기되, 남긴 것끼리는 오간 순서를 지킨다. 대화는 순서가 곧 맥락이다.
  const quoted = picked.slice(-QUOTES_MAX);
  basisLines.push(...quoted.map((p) => p.line));

  // 상한에 걸려 빠진 것이 있으면 그 사실을 문서에 적는다. 잘라 놓고 말하지
  // 않으면 「다 실었다」로 읽히고, 그게 이 꼬리표를 붙인 이유와 정반대다
  // (인계서 근거 꼬리표에서 배운 것과 같다).
  //
  // ⚠ 「더 있습니다」에 들어갈 것은 **빠진 수**이지 걸린 총수가 아니다.
  // 총수를 넣으면 「8건 더 + 최근 5건만」이 되어 읽는 사람에게는 13건이 되고,
  // 같은 줄의 꼬리표는 「언급된 8건」이라고 적어 한 항목 안에서 8이 두 뜻이 된다.
  // 잘렸다고 말하려고 넣은 문장이 잘린 양을 부풀리는 셈이라, 이 꼬리표를 붙인
  // 이유와 정확히 반대가 된다. (코드리뷰에서 잡혔다)
  const omitted = matchedComments - quoted.length;
  if (omitted > 0) {
    basisLines.push({
      text: `근거가 될 만한 대화가 ${omitted}건 더 있습니다. 위에는 최근 ${quoted.length}건만 실었습니다.`,
      source: `업무 대화 ${comments.length}건 중 협의·확인·법령·수치·기한·약속이 언급된 ${matchedComments}건`,
    });
  }

  if (attachments.length > 0) {
    for (const f of attachments) {
      basisLines.push({
        text: `붙임 ${f.file_name}`,
        source: `업무 첨부 · ${f.uploader.name} 등록, ${formatDate(f.created_at)}`,
      });
    }
  }

  blocks.push({
    key: "basis",
    heading: "3. 관련 기록",
    lines:
      basisLines.length > 0
        ? basisLines
        : [
            {
              text: workVisible
                ? "이 결재와 연결된 대화·첨부가 없습니다."
                : "이 계정에서는 관련 업무를 볼 수 없어 근거 자료를 싣지 않았습니다.",
            },
          ],
    empty: basisLines.length === 0,
  });

  // --- 4. 결재 의견 --------------------------------------------------------
  const opinionLines: ExportLine[] = opinions.map((s) => ({
    text: quote(s.opinion as string),
    quote: true,
    source: `${APPROVAL_KIND_LABEL[s.kind]}란 ${whoAtSigning(s)} · ${
      s.rejected_at
        ? `반려 ${formatDate(s.rejected_at)}`
        : s.signed_at
          ? `서명 ${formatDate(s.signed_at)}`
          : "미처리"
    }`,
  }));
  // 의견이 0건이어도 칸은 남긴다. 칸째로 빼면 종이에서 「3」 다음이 「5」가 되어
  // 「4번을 누가 지웠다」 또는 「한 장이 빠졌다」로 읽힌다. 결재에 올라가는
  // 서식에서 항목 번호는 그 문서를 가리키는 이름이다 — 문서마다 다른 번호를
  // 달아 주는 후처리(있는 것만 세어 다시 매기기)도 같은 이유로 쓰지 않는다.
  // 아무도 의견을 적지 않았다는 것 자체가 이 문서의 사실이므로 그대로 적는다.
  // (2·3번 칸이 비었을 때와 같은 처리다)
  blocks.push({
    key: "opinions",
    heading: "4. 결재 의견",
    lines:
      opinionLines.length > 0
        ? opinionLines
        : [{ text: "적힌 의견이 없습니다." }],
  });

  // --- 5. 결재 경과 --------------------------------------------------------
  //
  // 표가 아니라 줄로도 한 번 적는다. 결재란 표는 문서 맨 위에 따로 그리는데,
  // 표만 있으면 「누가 언제」가 칸에 눌려 읽히지 않는다.
  const traceLines: ExportLine[] = [...main, ...concur, ...post].map((s) => ({
    text: `${APPROVAL_KIND_LABEL[s.kind]} — ${whoAtSigning(s)}`,
    source: s.signed_at
      ? `서명 ${formatFullDateTime(s.signed_at)}`
      : s.rejected_at
        ? `반려 ${formatFullDateTime(s.rejected_at)}`
        : unsignedText(s, approval, approval.steps),
  }));
  blocks.push({ key: "trace", heading: "5. 결재 경과", lines: traceLines });

  return {
    approval,
    docNo: approval.doc_no ?? "번호 없음",
    blocks,
    evidence: {
      steps: approval.steps.length,
      opinions: opinions.length,
      sections: sections.length,
      comments: comments.length,
      matchedComments,
      quotedComments: quoted.length,
      attachments: attachments.length,
      activities: activities.length,
    },
    workVisible,
  };
}

// ---------------------------------------------------------------------------
// 한/글 파일로
// ---------------------------------------------------------------------------

/**
 * 결재란의 「일자」 칸에 적을 짧은 말.
 *
 * 화면의 결재란(approval-grid.tsx 의 STATE_TEXT)과 **같은 낱말**을 쓴다.
 * 빈칸으로 두면 「아직 안 한 사람」으로 읽히는데, 끝난 문서에서 그건 거짓이다.
 * 표 안이라 문장이 아니라 낱말이어야 한다 — 길면 칸이 옆으로 늘어난다.
 */
export function gridDateText(
  step: ApprovalStepWithApprover,
  approval: Pick<ApprovalWithSteps, "state">,
  steps: readonly ApprovalStepWithApprover[],
): string {
  if (step.rejected_at) return `반려 ${formatDate(step.rejected_at)}`;
  if (step.signed_at) return formatDate(step.signed_at);
  // 전결 뒤 칸. 화면은 사선을 긋고 글자로도 적는다 — 종이·파일에는 사선이
  // 없으므로 낱말만 남긴다.
  if (isStruckOut(step, steps)) return "전결";
  if (approval.state === "in_progress") return "대기";
  return "미결";
}

/** 결재란 표. 세로 병합 없이 그린다 — pack.ts 가 가로 병합만 쓰는 이유와 같다. */
function gridTable(
  steps: readonly ApprovalStepWithApprover[],
  approval: Pick<ApprovalWithSteps, "state">,
  allSteps: readonly ApprovalStepWithApprover[],
): HwpxTable | null {
  if (steps.length === 0) return null;
  const widths = [1, ...steps.map(() => 2)];
  const row = (
    label: string,
    cell: (s: ApprovalStepWithApprover) => string,
    bold = false,
  ) => ({
    cells: [
      { text: label, bold: true },
      ...steps.map((s) => ({ text: cell(s), bold })),
    ],
  });
  return {
    widths,
    rows: [
      row("구분", (s) => APPROVAL_KIND_LABEL[s.kind], true),
      row("직위", (s) => s.position),
      row("성명", (s) => s.approver.name),
      row("일자", (s) => gridDateText(s, approval, allSteps)),
    ],
  };
}

/**
 * 내보낼 HWPX 문서 한 벌을 조립한다.
 *
 * 화면(export/page.tsx)과 **같은 모델**에서 만든다. 화면에서 본 것과 파일에
 * 담긴 것이 다르면, 근거를 붙이려고 만든 장치가 그 자리에서 거짓이 된다.
 */
export function toHwpxDoc(
  ex: ApprovalExport,
  opts: { generatedAt: Date; by: Profile },
): HwpxDoc {
  const a = ex.approval;
  const { main, concur, post } = splitSteps(a.steps);
  const paragraphs: HwpxParagraph[] = [];

  paragraphs.push({ kind: "note", text: "행정업무의 운영 및 혁신에 관한 규정 시행규칙 별지 제2호서식 (내부결재문서)" });
  paragraphs.push({ kind: "spacer" });

  // 문서 정보
  paragraphs.push({
    kind: "table",
    table: {
      widths: [1, 2, 1, 2],
      rows: [
        {
          cells: [
            { text: "문서번호", bold: true },
            { text: ex.docNo, align: "left" },
            { text: "문서종류", bold: true },
            { text: APPROVAL_FORM_LABEL[a.form], align: "left" },
          ],
        },
        {
          cells: [
            { text: "기안일", bold: true },
            { text: formatDate(a.created_at), align: "left" },
            { text: "보존연한", bold: true },
            { text: a.retention ? `${a.retention}년` : "미지정", align: "left" },
          ],
        },
        {
          cells: [
            { text: "공개구분", bold: true },
            {
              text: a.security === "confidential" ? "대외비" : "일반",
              align: "left",
            },
            { text: "결재상태", bold: true },
            { text: APPROVAL_STATE_LABEL[a.state], align: "left" },
          ],
        },
      ],
    },
  });
  paragraphs.push({ kind: "spacer" });

  // 결재란
  const grid = gridTable(main, a, a.steps);
  if (grid) {
    paragraphs.push({ kind: "heading", text: "결재" });
    paragraphs.push({ kind: "table", table: grid });
  }
  const concurGrid = gridTable(concur, a, a.steps);
  if (concurGrid) {
    paragraphs.push({ kind: "heading", text: "협조" });
    paragraphs.push({ kind: "table", table: concurGrid });
  }
  const postGrid = gridTable(post, a, a.steps);
  if (postGrid) {
    paragraphs.push({ kind: "heading", text: "사후보고" });
    paragraphs.push({ kind: "table", table: postGrid });
  }
  paragraphs.push({
    kind: "note",
    text: "직위는 서명 당시의 것이 그대로 남습니다. 인사이동이 있어도 옛 문서의 결재란은 바뀌지 않습니다.",
  });
  paragraphs.push({ kind: "spacer" });

  // 제목
  paragraphs.push({ kind: "heading", text: `제목  ${a.title}` });
  paragraphs.push({ kind: "spacer" });

  for (const block of ex.blocks) {
    paragraphs.push({ kind: "heading", text: block.heading });
    for (const line of block.lines) {
      paragraphs.push({
        kind: "body",
        text: line.quote ? `“${line.text}”` : line.text,
      });
      if (line.source) {
        paragraphs.push({ kind: "source", text: `근거: ${line.source}` });
      }
    }
    paragraphs.push({ kind: "spacer" });
  }

  // 출처 — 종이 한 장만 손에 든 사람도 이 문서가 어떻게 만들어졌는지 알아야 한다.
  paragraphs.push({ kind: "heading", text: "이 파일에 대하여" });
  paragraphs.push({
    kind: "note",
    text:
      `근거 꼬리표는 「일머리」에 쌓인 기록 — 결재란 ${ex.evidence.steps}칸 · 의견 ${ex.evidence.opinions}건 · ` +
      `업무 문서 항목 ${ex.evidence.sections}개 · 대화 ${ex.evidence.comments}건 중 ${ex.evidence.quotedComments}건 · ` +
      `첨부 ${ex.evidence.attachments}건 · 이력 ${ex.evidence.activities}건 — 에서 규칙이 뽑아 붙인 것입니다. ` +
      `문장을 지어낸 곳은 없으며, 인용은 원문 그대로입니다.`,
  });
  paragraphs.push({
    kind: "note",
    text:
      `내려받은 사람 ${who(opts.by)}${josa(opts.by.name, "은", "는")} 이 문서를 볼 수 있는 계정입니다. ` +
      `조립 시각 ${formatFullDateTime(opts.generatedAt.toISOString())}.`,
  });
  paragraphs.push({
    kind: "note",
    text: "이 파일은 온나라 등 법정 결재시스템에 올리기 위한 초안입니다. 최종 결재권자의 서명은 「일머리」에서 받지 않습니다.",
  });

  return {
    title: a.title,
    paragraphs,
    // 문서가 만들어진 시각이 아니라 **기안 시각**을 쓴다. 같은 문서를 두 번
    // 내려받으면 바이트까지 같아야 「그때 그 파일인가」를 해시로 답할 수 있다.
    createdAt: new Date(a.created_at),
  };
}
