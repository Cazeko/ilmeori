import "server-only";

import {
  chunkParagraphs,
  draftBlockText,
  draftParagraphText,
  sheetSourceText,
  type DraftParagraph,
  type HandoverDraft,
} from "@/lib/handover-draft";
import type { HwpxDoc, HwpxParagraph } from "@/lib/hwpx/pack";
import { formatDate, formatFullDateTime, todayKST } from "@/lib/format";
import type { Department, HandoverNoteWithAuthor, Profile } from "@/lib/types";

/**
 * 「업무인계·인수서」를 한/글 파일로.
 *
 * ── 왜 한/글인가 ──────────────────────────────────────────────────────────
 *
 * 인쇄(A4)는 「이걸 그대로 결재에 올릴 수 있느냐」에 종이로 답한다. 그런데
 * 실제 공공기관의 다음 걸음은 종이가 아니라 **온나라에 올리는 파일**이고,
 * 그 자리에서 오가는 형식은 한/글이다. 종이만 있으면 인수자는 결국 이 문서를
 * **손으로 다시 친다** — 그 순간 문장마다 붙여 둔 근거도, 놓친 것을 센 수도
 * 전부 사라진다. 이 제품이 파는 것이 정확히 그 두 가지다.
 *
 * ── 화면·종이와 어긋날 수 없게 만든 것 ────────────────────────────────────
 *
 * 서식을 짓는 자리가 둘이 되면 그 자리에서 갈라진다. 그래서 이 파일은 새로
 * 짓지 않고 **화면이 쓰는 것을 그대로 부른다.**
 *
 *   · 문단     `buildHandoverDraft()` 가 만든 `DraftParagraph` 그대로
 *   · 표/글줄  `chunkParagraphs()` — print-sheet.tsx 와 같은 함수
 *   · 출처     `sheetSourceText()` — print-sheet.tsx 와 같은 함수
 *
 * 남는 것은 「같은 문단을 HwpxParagraph 로 옮기는 일」뿐이고, 그 옮김이
 * 글자를 바꾸지 않는지를 tests/handover-hwpx.test.mjs 가 문단 단위로 대조한다.
 *
 * ── 담지 않는 것 ──────────────────────────────────────────────────────────
 *
 * **근거 꼬리표(링크)를 담지 않는다.** 화면에서 줄마다 붙는 그것은 화면의
 * 장치이지 문서의 내용이 아니다 — 온나라에 올라간 문서에 남은 앵커는 오류다.
 * `draftParagraphText()` 가 이미 그 판단을 하고 있고(handover-draft.ts),
 * 여기서도 같은 함수를 쓴다. 종이(@media print)가 출처 층을 끄는 것과 같은
 * 결정이다.
 *
 * **인계자↔인수자 대화도 담지 않는다.** 그것은 두 사람이 이 인계 건에서
 * 주고받은 문답이지 별지 제12호서식의 칸이 아니다. 법이 정한 일곱 칸에
 * 여덟 번째를 끼워 넣으면 그건 이미 그 서식이 아니다(0014의 판단과 같다).
 *
 * ── 인쇄(A4)를 남겨 두는 이유 ─────────────────────────────────────────────
 *
 * 만들어 낸 .hwpx 가 한/글에서 열리는 것은 실물로 확인했다(pack.ts 머리말).
 * 그래도 인쇄 폴백은 그대로 둔다 — 폴백은 「안 열릴까 봐」만이 아니라
 * **「그 자리에 한/글이 없을 수도 있어서」** 있는 것이고, 그건 여전하다.
 */

function who(p: Pick<Profile, "name" | "position">) {
  return [p.name, p.position].filter(Boolean).join(" ");
}

/**
 * 문단 하나를 **줄마다 한 문단**으로.
 *
 * `pack.ts` 의 `esc()` 는 문단에 들어온 `\n` 을 공백으로 눕힌다. 한 줄짜리
 * 문단에서는 그것이 옳지만(제어문자가 XML 을 깨뜨린다), 초안의 문단은 줄마다
 * 들여쓰기를 갖고 있고 그 들여쓰기가 곧 계층이다 — 사실은 두 칸, 목록은 네 칸.
 * 눕히면 스무 줄이 한 줄로 뭉개진다. 화면·종이가 `whitespace-pre-wrap` 으로
 * 지키는 것이 정확히 그것이고(print-sheet.tsx), 파일만 다르게 나갈 이유가 없다.
 *
 * 들여쓰기는 `indent` 로 옮기지 않고 **글자에 있는 공백을 그대로 둔다.**
 * `indent` 는 갈래의 기본값에 단계를 더하는 것이라, 두 칸과 네 칸이 몇 단계인지
 * 를 여기서 새로 정해야 한다. 화면이 지키는 것은 「데이터에 있는 공백」이므로
 * 파일도 같은 것을 지킨다 — 옮겨 적는 규칙이 하나 늘면 그 자리에서 갈라진다.
 *
 * 빈 줄은 `spacer` 로 낸다. 인용과 인용 사이를 벌리려고 초안이 일부러 넣어 둔
 * 줄이고(handover-draft.ts), 빈 글자 문단으로 내면 한/글에서 높이가 안 선다.
 */
function textLines(text: string): HwpxParagraph[] {
  return text.split(/\r\n?|\n/).map((line) =>
    line.trim() === ""
      ? ({ kind: "spacer" } as const)
      : ({ kind: "body", text: line } as const),
  );
}

/**
 * 「업무 / 내용」 두 칸짜리 표.
 *
 * 화면의 `WorkTable` 과 같은 자름이다 — 왼쪽은 문단의 첫 줄, 오른쪽은 나머지
 * 전부. 두 칸을 줄바꿈으로 이으면 `draftParagraphText()` 와 정확히 같다.
 * 칸 안의 줄바꿈은 `pack.ts` 가 줄바꿈으로 낸다(cellLines).
 */
function workTable(rows: DraftParagraph[]): HwpxParagraph {
  return {
    kind: "table",
    table: {
      widths: [2, 5],
      rows: [
        {
          cells: [
            { text: "업무", bold: true, align: "center" },
            { text: "내용", bold: true, align: "center" },
          ],
        },
        ...rows.map((p) => ({
          cells: [
            { text: draftParagraphText(p.slice(0, 1)), align: "left" as const },
            { text: draftParagraphText(p.slice(1)), align: "left" as const },
          ],
        })),
      ],
    },
  };
}

export type HandoverExportInput = {
  draft: HandoverDraft;
  notesByBlock: ReadonlyMap<string, HandoverNoteWithAuthor[]>;
  from: Profile;
  to: Profile;
  fromDept: Department | null;
  toDept: Department | null;
  generatedAt: string | null;
  /** 인계가 실제로 실행된 시각. 없으면 아직 실행 전이다. */
  completedAt: string | null;
  method: string;
  /**
   * 이 파일을 조립한 시각.
   *
   * 부르는 쪽이 준다. 안에서 `new Date()` 를 부르면 문서에 찍히는 시각과
   * `buildHwpx` 가 ZIP 항목에 적는 시각이 **한 응답 안에서 서로 달라진다.**
   *
   * ⚠ 이 값이 요청마다 새로 나므로 「두 번 내려받으면 바이트가 같다」는
   *   성립하지 않는다. 그게 맞다 — 내용은 내려받는 순간의 기록으로 다시
   *   조립한 것이고, 옛 시각을 찍으면 그 문단이 거짓이 된다.
   */
  createdAt: Date;
};

export function handoverToHwpxDoc(input: HandoverExportInput): HwpxDoc {
  const {
    draft,
    notesByBlock,
    from,
    to,
    fromDept,
    toDept,
    generatedAt,
    completedAt,
    method,
    createdAt,
  } = input;

  const paragraphs: HwpxParagraph[] = [];

  // ⚠ 제목 문단을 여기서 밀어 넣지 않는다. `sectionXml` 이 `doc.title` 을
  // **언제나** 첫 문단으로 찍기 때문이다(pack.ts) — 한 줄 더하면 16pt 굵은
  // 제목이 두 번 찍힌 파일이 나가고, 화면·종이에는 하나뿐인 제목이 한/글에서만
  // 둘이 된다. 결재함 내보내기도 같은 이유로 제목을 안 민다(approval-export.ts).
  //
  // 서식의 근거는 제목 바로 밑에 한 줄. 결재함 내보내기가 별지 제2호서식에
  // 대해 같은 자리에 같은 모양으로 적는다.
  paragraphs.push({
    kind: "note",
    text: "행정업무의 운영 및 혁신에 관한 규정 시행규칙 별지 제12호서식",
  });
  paragraphs.push({ kind: "spacer" });

  // ── 사람 ─────────────────────────────────────────────────────────────────
  // 칸 이름을 적는다. 파일만 받아 든 사람에게 「자원순환과 · 주무관 · 박준호」는
  // 줄 세 개일 뿐이고, 결재 문서는 무엇이 무엇인지 적혀 있어야 한다.
  paragraphs.push({
    kind: "table",
    table: {
      widths: [1, 2, 1, 1],
      rows: [
        {
          cells: [
            { text: "구분", bold: true, align: "center" },
            { text: "소속", bold: true, align: "center" },
            { text: "직급", bold: true, align: "center" },
            { text: "성명", bold: true, align: "center" },
          ],
        },
        ...[
          { label: "인계자", person: from, dept: fromDept },
          { label: "인수자", person: to, dept: toDept },
        ].map(({ label, person, dept }) => ({
          cells: [
            { text: label, bold: true, align: "center" as const },
            { text: dept?.name ?? "소속 없음", align: "left" as const },
            { text: person.position ?? "", align: "center" as const },
            { text: person.name, align: "center" as const },
          ],
        })),
        {
          cells: [
            { text: "인계일", bold: true, align: "center" },
            // 이미 실행된 인계라면 그 날짜를 적는다. 오늘 날짜를 찍으면 두 달 뒤에
            // 뽑은 파일이 두 달 뒤에 인계한 것처럼 보인다 — 감사 기록으로 못 쓴다.
            {
              text: completedAt
                ? formatDate(completedAt)
                : `${todayKST().replace(/-/g, ". ")}. (예정)`,
              align: "left",
              colSpan: 3,
            },
          ],
        },
      ],
    },
  });
  paragraphs.push({ kind: "spacer" });

  // ── 서식의 일곱 칸 ────────────────────────────────────────────────────────
  for (const block of draft.blocks) {
    const notes = notesByBlock.get(block.key) ?? [];
    paragraphs.push({ kind: "heading", text: block.heading });

    if (block.needsHuman) {
      paragraphs.push(...textLines(draftBlockText(block.paragraphs)));
      // 지어내지 않는다는 원칙은 파일에서도 같다. 아직 비어 있으면 「직접 적어야
      // 한다」는 말을 남긴다. 종이에는 손으로 적을 빈 네모를 함께 그리지만
      // 한/글 파일에서는 그 자리에 커서를 놓고 그냥 치면 되므로 네모는 안 그린다.
      if (notes.length === 0) {
        paragraphs.push({
          kind: "note",
          text: "인계자가 직접 적어야 하는 칸입니다.",
        });
      }
    } else {
      for (const chunk of chunkParagraphs(block.paragraphs)) {
        if (chunk.kind === "table") {
          paragraphs.push(workTable(chunk.rows));
        } else {
          paragraphs.push(...textLines(draftParagraphText(chunk.paragraph)));
        }
      }
    }

    // 사람이 보탠 글은 규칙이 뽑은 문단과 **섞지 않는다.** 결재에 올라간 뒤
    // "이 문장은 누가 썼느냐"는 물음에 파일만 보고 답할 수 있어야 한다.
    // 화면은 왼쪽 선으로, 종이는 선과 이름 줄로 나눈다. 한/글에는 선을 그을
    // 수단이 마땅치 않으므로 **이름과 날짜를 그 자리에 적어** 나눈다.
    for (const n of notes) {
      paragraphs.push({
        kind: "source",
        text: `인계자 보충: ${who(n.author)}, ${formatDate(n.created_at)}`,
      });
      // 사람이 친 글이라 줄바꿈이 있다. 화면과 종이가 `whitespace-pre-line` 로
      // 그것을 지키므로 파일도 지킨다.
      for (const line of n.body.split(/\r\n?|\n/)) {
        paragraphs.push(
          line.trim() === ""
            ? { kind: "spacer" }
            : { kind: "quote", text: line },
        );
      }
    }

    paragraphs.push({ kind: "spacer" });
  }

  // ── 서명란 ────────────────────────────────────────────────────────────────
  // 별지 제12호서식에는 인계자·인수자·입회자 서명란이 있다.
  // 전자서명 연계를 구현하지 않았으므로 빈칸으로 두고 손으로 받는다.
  paragraphs.push({ kind: "body", text: "위와 같이 업무를 인계·인수합니다." });
  paragraphs.push({
    kind: "table",
    table: {
      widths: [1, 3, 2],
      rows: [
        ["인계자", who(from)],
        ["인수자", who(to)],
        ["입회자", ""],
      ].map(([label, name]) => ({
        cells: [
          { text: label, bold: true, align: "center" as const },
          { text: name, align: "left" as const },
          { text: "(서명 또는 인)", align: "center" as const },
        ],
      })),
    },
  });
  paragraphs.push({ kind: "spacer" });

  // ── 출처 ──────────────────────────────────────────────────────────────────
  paragraphs.push({ kind: "divider" });
  paragraphs.push({
    kind: "source",
    text: sheetSourceText({
      evidence: draft.evidence,
      screening: draft.screening,
      hasNotes: draft.blocks.some(
        (b) => (notesByBlock.get(b.key)?.length ?? 0) > 0,
      ),
    }),
  });
  // 두 시각은 다르다. generated_at 은 인계를 시작한 때이고, 이 파일의 내용은
  // **내려받는 순간의 기록으로 다시 조립한 것**이다. 한 줄로 뭉뚱그리면
  // "이 문서는 그때 만들어졌다"는 거짓이 된다.
  paragraphs.push({
    kind: "source",
    text:
      `생성 방식 ${method}` +
      (generatedAt ? ` · 인계 시작 ${formatFullDateTime(generatedAt)}` : "") +
      ` · 이 파일은 ${formatFullDateTime(createdAt.toISOString())} 기준으로 조립했습니다`,
  });

  return {
    // 이것이 **종이 맨 위에 찍히는 제목**이다(sectionXml 이 첫 문단으로 낸다).
    // 그래서 별지 제12호서식의 제목 그대로여야 한다 — 「(박준호 → 이하람)」을
    // 붙이면 법정 서식의 제목이 아닌 것이 결재로 올라간다. 누가 누구에게
    // 넘기는지는 바로 아래 사람 표와 **파일 이름**이 말한다(route.ts).
    title: "업무인계·인수서",
    paragraphs,
    createdAt,
  };
}
