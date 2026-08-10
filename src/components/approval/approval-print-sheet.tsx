import { splitSteps } from "@/lib/approval";
import { formatDate, formatFullDateTime } from "@/lib/format";
import { gridDateText, type ApprovalExport } from "@/lib/approval-export";
import {
  APPROVAL_FORM_LABEL,
  APPROVAL_KIND_LABEL,
  APPROVAL_STATE_LABEL,
  type ApprovalStepWithApprover,
} from "@/lib/types";

/**
 * 인쇄용 「내부결재문서」 — 별지 제2호서식.
 *
 * ── 왜 종이가 여전히 있는가 ────────────────────────────────────────────────
 *
 * HWPX 를 만들 수 있게 됐지만 **실제 한/글에서 열어 본 적이 없다.** 계획서
 * §5.3이 정한 폴백이 그대로 살아 있어야 하는 상태이고, 그래서 이 화면은
 * 파일과 종이를 **둘 다** 내놓는다. 심사에서 파일이 안 열리면 그 자리에서
 * Ctrl+P 로 답할 수 있어야 한다.
 *
 * 종이와 파일과 화면이 **같은 모델(ApprovalExport)에서 나온다.** 근거를 붙이려고
 * 만든 장치가 셋 중 하나에서만 다른 말을 하면, 그 순간 꼬리표가 거짓이 된다.
 *
 * 인계서 인쇄본(print-sheet.tsx)과 다른 점 하나 — **근거 꼬리표를 종이에도
 * 싣는다.** 인계서의 종이는 결재에 올리는 서식이라 꼬리표가 서식을 어지럽히지만,
 * 이 종이는 「근거를 보여 주려고」 뽑는 것이라 꼬리표가 곧 본문이다.
 */

/**
 * 「일자」 칸을 비워 두지 않는다.
 *
 * 빈칸은 「아직 안 한 사람」으로 읽힌다. 전결로 끝난 문서에서 그건 거짓이고,
 * 그 종이는 위에서 「결재상태: 완결」이라고 적어 놓고 아래에서 누군가를
 * 기다리는 것처럼 보인다. 화면(approval-grid.tsx)·파일(toHwpxDoc)과 **같은
 * 함수**로 같은 낱말을 적는다 — 셋이 다른 말을 하면 이 화면의 주장이 깨진다.
 */
function gridRows(
  steps: readonly ApprovalStepWithApprover[],
  approval: ApprovalExport["approval"],
) {
  return [
    ["구분", steps.map((s) => APPROVAL_KIND_LABEL[s.kind])],
    ["직위", steps.map((s) => s.position)],
    ["성명", steps.map((s) => s.approver.name)],
    ["일자", steps.map((s) => gridDateText(s, approval, approval.steps))],
  ] as const;
}

function Grid({
  caption,
  steps,
  approval,
}: {
  caption: string;
  steps: readonly ApprovalStepWithApprover[];
  approval: ApprovalExport["approval"];
}) {
  if (steps.length === 0) return null;
  return (
    <table className="avoid-break mt-2">
      <caption className="text-left font-bold">{caption}</caption>
      <tbody>
        {gridRows(steps, approval).map(([label, cells]) => (
          <tr key={label}>
            <th scope="row" className="w-20 text-center">
              {label}
            </th>
            {cells.map((c, i) => (
              <td key={i} className="text-center">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ApprovalPrintSheet({ ex }: { ex: ApprovalExport }) {
  const a = ex.approval;
  const { main, concur, post } = splitSteps(a.steps);

  return (
    <article className="print-sheet hidden print:block">
      <h1 className="text-center font-bold tracking-[0.3em]">내부결재문서</h1>
      <p className="mt-1 text-center">
        행정업무의 운영 및 혁신에 관한 규정 시행규칙 별지 제2호서식
      </p>

      <table className="avoid-break mt-5">
        <caption className="sr-only">문서 정보</caption>
        <tbody>
          <tr>
            <th scope="row" className="w-24 text-center">
              문서번호
            </th>
            <td>{ex.docNo}</td>
            <th scope="row" className="w-24 text-center">
              문서종류
            </th>
            <td>{APPROVAL_FORM_LABEL[a.form]}</td>
          </tr>
          <tr>
            <th scope="row" className="text-center">
              기안일
            </th>
            <td>{formatDate(a.created_at)}</td>
            <th scope="row" className="text-center">
              보존연한
            </th>
            <td>{a.retention ? `${a.retention}년` : "미지정"}</td>
          </tr>
          <tr>
            <th scope="row" className="text-center">
              공개구분
            </th>
            <td>{a.security === "confidential" ? "대외비" : "일반"}</td>
            <th scope="row" className="text-center">
              결재상태
            </th>
            <td>{APPROVAL_STATE_LABEL[a.state]}</td>
          </tr>
        </tbody>
      </table>

      <Grid caption="결재" steps={main} approval={a} />
      <Grid caption="협조" steps={concur} approval={a} />
      <Grid caption="사후보고" steps={post} approval={a} />
      <p className="mt-1">
        직위는 서명 당시의 것이 그대로 남습니다. 인사이동이 있어도 옛 문서의
        결재란은 바뀌지 않습니다.
      </p>

      <section className="mt-5">
        {/* 두 칸 띄우기는 HTML 에서 한 칸으로 붙는다. 서식의 칸 이름과 값
            사이는 눈에 보이게 벌어져야 하므로 여백으로 만든다. */}
        <h2 className="font-bold">
          제목<span className="inline-block w-6" />
          {a.title}
        </h2>
      </section>

      {ex.blocks.map((block) => (
        <section key={block.key} className="mt-4">
          <h2 className="font-bold">{block.heading}</h2>
          {block.lines.map((line, i) => (
            <div key={i}>
              <p className="mt-1 whitespace-pre-line">
                {line.quote ? `“${line.text}”` : line.text}
              </p>
              {/* 꼬리표를 종이에도 싣는다. 이 종이는 결재에 올리는 서식이 아니라
                  **근거를 보여 주려고** 뽑는 것이라, 꼬리표가 곧 본문이다. */}
              {line.source ? (
                <p className="source">근거: {line.source}</p>
              ) : null}
            </div>
          ))}
        </section>
      ))}

      <footer className="avoid-break mt-6 border-t border-black pt-2">
        <p>
          근거 꼬리표는 「일머리」에 쌓인 기록 — 결재란 {ex.evidence.steps}칸 ·
          의견 {ex.evidence.opinions}건 · 업무 문서 항목 {ex.evidence.sections}개
          · 대화 {ex.evidence.comments}건 중 {ex.evidence.quotedComments}건 ·
          첨부 {ex.evidence.attachments}건 — 에서 규칙이 뽑아 붙인 것입니다.
          문장을 지어낸 곳은 없으며, 인용은 원문 그대로입니다.
        </p>
        <p className="mt-1">
          이 인쇄본은{" "}
          {formatFullDateTime(new Date().toISOString())} 기준으로 조립했습니다.
          온나라 등 법정 결재시스템에 올리기 위한 초안이며, 최종 결재권자의
          서명은 「일머리」에서 받지 않습니다.
        </p>
      </footer>
    </article>
  );
}
