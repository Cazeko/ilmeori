import "server-only";

import { getActivities, getAttachments, getWorkDocument, type HandoverView } from "@/lib/data";
import { formatDate, formatDueLabel, josa } from "@/lib/format";
import { STATUS_LABEL, VISIBILITY_LABEL } from "@/lib/types";

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
  evidence: { works: number; documents: number; activities: number; attachments: number };
};

export async function buildHandoverDraft(
  view: HandoverView,
): Promise<HandoverDraft> {
  const works = view.items.map((i) => i.work);

  let documentCount = 0;
  let activityCount = 0;
  let attachmentCount = 0;

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
        .map((m) => `${m.profile.name} ${m.profile.position}`)
        .join(", ");
      if (others) parts.push(`  함께 보는 사람: ${others}`);
    }
    return parts.join("\n");
  });

  // --- 나. 주요 업무계획 및 진행사항 ---------------------------------------
  const progress: string[] = [];
  for (const w of works) {
    const [{ document, sections }, acts] = await Promise.all([
      getWorkDocument(w.id),
      getActivities(w.id),
    ]);
    activityCount += acts.length;
    if (document) documentCount += 1;

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

    const lastStatus = acts.find((a) => a.kind === "work.status_changed");
    if (lastStatus) {
      lines.push(
        `  최근 상태 변경: ${formatDate(lastStatus.created_at)} ${lastStatus.summary}`,
      );
    }
    progress.push(lines.join("\n"));
  }

  // --- 다. 현안사항 및 문제점 ----------------------------------------------
  const issues: string[] = [];
  for (const w of works) {
    const { document, sections } = await getWorkDocument(w.id);
    const issueSection = sections.find(
      (s) => s.heading?.includes("현안") || s.heading?.includes("유의"),
    );
    if (issueSection?.body) {
      issues.push(
        `· ${w.title}\n  [${document?.title} — ${issueSection.heading}]\n` +
          issueSection.body
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n"),
      );
    }
    if (w.derived === "overdue" && w.due_date) {
      issues.push(
        `· ${w.title}\n  기한이 지났습니다. ${formatDate(w.due_date)} 마감, ${formatDueLabel(w.due_date)}.`,
      );
    }
  }
  if (issues.length === 0) {
    issues.push("확인된 현안사항이 없습니다.");
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
  for (const w of works) {
    const [{ document, sections }, files] = await Promise.all([
      getWorkDocument(w.id),
      getAttachments(w.id),
    ]);
    attachmentCount += files.length;
    if (!document && files.length === 0) continue;

    const lines = [`· ${w.title}`];
    if (document) {
      lines.push(
        `  문서 「${document.title}」 (항목 ${sections.length}개)`,
        ...sections.map((s) => `    - ${s.heading ?? "제목 없는 항목"}`),
      );
    }
    if (files.length > 0) {
      lines.push(
        `  첨부 ${files.length}건`,
        ...files.map((f) => `    - ${f.file_name} (${f.uploader.name} 등록)`),
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
    `인계자 ${view.from.name} ${view.from.position}${josa(
      view.from.position ?? view.from.name,
      "은",
      "는",
    )} 인계 후에도 열람 권한을 유지합니다. 확인이 필요한 사항은 문의할 수 있습니다.`,
  );

  const blocks: DraftBlock[] = [
    {
      heading: "1-가. 담당 업무",
      paragraphs: duties,
      sources: [`업무 ${works.length}건의 기본 정보와 참여자 목록`],
    },
    {
      heading: "1-나. 주요 업무계획 및 진행사항",
      paragraphs: progress,
      sources: [
        `업무 문서 ${documentCount}건의 진행 항목`,
        `업무 이력 ${activityCount}건 중 상태 변경 기록`,
      ],
    },
    {
      heading: "1-다. 현안사항 및 문제점",
      paragraphs: issues,
      sources: ["업무 문서의 「현안 및 유의사항」 항목", "기한이 지난 업무 목록"],
    },
    {
      heading: "1-라. 주요 미결사항",
      paragraphs: pending.length > 0 ? pending : ["미결 업무가 없습니다."],
      sources: ["완료되지 않은 업무의 상태와 기한"],
    },
    {
      heading: "2. 관련 문서 현황",
      paragraphs: docs.length > 0 ? docs : ["등록된 문서와 첨부가 없습니다."],
      sources: [`문서 ${documentCount}건 · 첨부 ${attachmentCount}건`],
    },
    {
      heading: "3. 주요 물품 및 예산 등 인계·인수가 필요한 사항",
      paragraphs: [
        "이 시스템에는 물품·예산 정보가 없습니다. 재무회계시스템과 물품관리대장을 확인해 인계자가 직접 적어야 합니다.",
      ],
      sources: [],
      needsHuman: true,
    },
    {
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
    },
  };
}
