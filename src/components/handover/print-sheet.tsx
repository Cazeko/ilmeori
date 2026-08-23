import type {
  Department,
  HandoverNoteWithAuthor,
  Profile,
} from "@/lib/types";
import type { HandoverDraft } from "@/lib/handover-draft";
import { formatDate, formatFullDateTime, todayKST } from "@/lib/format";

/**
 * 「업무인계·인수서」 — 별지 제12호서식 그 자체.
 *
 * ── 한동안 이 문서는 화면에 없었다 ─────────────────────────────────────────
 *
 * `hidden print:block` 이 붙어 있어서 **Ctrl+P 를 눌러야만 보였다.** 화면에는
 * 같은 내용을 회색 말풍선 문단으로 따로 그렸고, 심사위원이 보는 것은 그쪽
 * 이었다. 이 제품에서 가장 강한 물건이 화면에 없었다는 뜻이다.
 *
 * 지금은 화면에도 선다(handover/page.tsx 의 「문서」). `.sheet` 클래스가
 * 화면에서는 px·먹색 괘선으로, 종이에서는 pt 로 그려진다 — **한 클래스를 두
 * 매체가 나눠 쓰므로 둘이 어긋날 수 없다**(globals.css 의 .sheet 참조).
 *
 * 화면과 종이가 다르게 가져가는 것은 하나뿐이다. 항목마다 붙는 **근거 꼬리표**는
 * 화면의 확인 구역(아래 「항목별 근거」)에만 있고 이 서식에는 없다 —
 * 결재에 올라가는 종이에서 꼬리표는 서식을 어지럽힌다.
 *
 * 서식 근거
 *   「행정업무의 운영 및 혁신에 관한 규정」 제61조
 *   같은 규정 시행규칙 제45조, 별지 제12호서식
 *
 * 실제 별지 서식과 다른 점을 숨기지 않는다. 전자서명 연계가 없으므로
 * 서명란은 손으로 적는 빈칸으로 두고, 물품·예산 항목도 빈칸으로 둔다.
 */

function who(p: Pick<Profile, "name" | "position">) {
  return [p.name, p.position].filter(Boolean).join(" ");
}

export function HandoverPrintSheet({
  draft,
  notesByBlock,
  from,
  to,
  fromDept,
  toDept,
  generatedAt,
  completedAt,
  method,
}: {
  draft: HandoverDraft;
  /**
   * 인계자가 항목에 보탠 글. 종이에서도 규칙이 뽑은 문단과 **섞지 않는다.**
   * 결재에 올라간 뒤 "이 문장은 누가 썼느냐"는 물음에 종이만 보고 답할 수
   * 있어야 하기 때문이다. 화면에서는 색으로 나누지만 종이에는 색이 없으므로
   * 왼쪽 선과 이름·날짜 한 줄로 나눈다.
   */
  notesByBlock: ReadonlyMap<string, HandoverNoteWithAuthor[]>;
  from: Profile;
  to: Profile;
  fromDept: Department | null;
  toDept: Department | null;
  generatedAt: string | null;
  /** 인계가 실제로 실행된 시각. 없으면 아직 실행 전이다. */
  completedAt: string | null;
  method: string;
}) {
  const people = [
    { label: "인계자", person: from, dept: fromDept },
    { label: "인수자", person: to, dept: toDept },
  ];

  const hasNotes = draft.blocks.some(
    (b) => (notesByBlock.get(b.key)?.length ?? 0) > 0,
  );

  return (
    <article className="sheet">
      <h1 className="text-center font-bold tracking-[0.3em]">업무인계·인수서</h1>

      <table className="avoid-break mt-6">
        <caption className="sr-only">인계자와 인수자</caption>
        {/* 칸 이름을 적는다. 종이만 손에 든 사람에게 「자원순환과 · 주무관 · 박준호」는
            줄 세 개일 뿐이고, 결재 문서는 무엇이 무엇인지 적혀 있어야 한다. */}
        <thead>
          <tr>
            <th scope="col" className="w-20 text-center font-bold">
              구분
            </th>
            <th scope="col" className="w-1/3 text-center font-bold">
              소속
            </th>
            <th scope="col" className="w-24 text-center font-bold">
              직급
            </th>
            <th scope="col" className="text-center font-bold">
              성명
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map(({ label, person, dept }) => (
            <tr key={label}>
              <th scope="row" className="text-center">
                {label}
              </th>
              <td>{dept?.name ?? "소속 없음"}</td>
              <td className="text-center">{person.position ?? ""}</td>
              <td className="text-center">{person.name}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="text-center">
              인계일
            </th>
            {/* 이미 실행된 인계라면 그 날짜를 적는다. 오늘 날짜를 찍으면 두 달 뒤에
                뽑은 종이가 두 달 뒤에 인계한 것처럼 보인다 — 감사 기록으로 못 쓴다.
                아직 실행 전이면 오늘 서명한다는 뜻이므로 오늘로 둔다. */}
            <td colSpan={3}>
              {completedAt
                ? formatDate(completedAt)
                : `${todayKST().replace(/-/g, ". ")}. (예정)`}
            </td>
          </tr>
        </tbody>
      </table>

      {draft.blocks.map((block) => {
        const notes = notesByBlock.get(block.key) ?? [];
        return (
          <section key={block.key} className="mt-5">
            <h2 className="font-bold">{block.heading}</h2>
            {block.needsHuman ? (
              <>
                <p className="mt-1">{block.paragraphs.join(" ")}</p>
                {/* 지어내지 않는다는 원칙은 종이에서도 같다.
                    아직 비어 있으면 「직접 적어야 한다」는 말과 손으로 적을
                    자리를 함께 남긴다. 인계자가 화면에서 적어 넣었으면 그것이
                    곧 이 칸의 본문이므로 둘 다 인쇄하지 않는다 —
                    적어 넣은 글 위에 "적어야 합니다"가 남으면 종이가 화면과
                    다른 말을 하게 된다. */}
                {notes.length === 0 ? (
                  <>
                    <p className="mt-1">인계자가 직접 적어야 하는 칸입니다.</p>
                    <div className="mt-1 h-16 border border-black" />
                  </>
                ) : null}
              </>
            ) : (
              block.paragraphs.map((p, i) => (
                <p key={i} className="mt-1 whitespace-pre-line">
                  {p}
                </p>
              ))
            )}

            {notes.map((n) => (
              <div key={n.id} className="note">
                <p className="note-label">
                  인계자 보충 — {who(n.author)}, {formatDate(n.created_at)}
                </p>
                <p className="whitespace-pre-line">{n.body}</p>
              </div>
            ))}
          </section>
        );
      })}

      {/* ── 서명란 ─────────────────────────────────────────────────────────
          별지 제12호서식에는 인계자·인수자·입회자 서명란이 있다.
          전자서명 연계를 구현하지 않았으므로 빈칸으로 두고 손으로 받는다. */}
      <section className="avoid-break mt-8">
        <p>
          위와 같이 업무를 인계·인수합니다.
        </p>
        <table className="mt-3">
          <caption className="sr-only">서명</caption>
          <tbody>
            {[
              ["인계자", who(from)],
              ["인수자", who(to)],
              ["입회자", ""],
            ].map(([label, name]) => (
              <tr key={label}>
                <th scope="row" className="w-20 text-center">
                  {label}
                </th>
                <td className="w-1/2">{name}</td>
                <td className="text-center">(서명 또는 인)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── 출처 ──────────────────────────────────────────────────────────
          종이 한 장만 손에 든 사람도 이 문서가 어떻게 만들어졌는지 알아야 한다.
          화면에서는 항목마다 근거를 붙이지만, 종이에서는 서식을 어지럽히므로
          맨 아래에 한 번 모아 적는다. */}
      <footer className="avoid-break mt-6 border-t border-black pt-2">
        <p>
          이 초안은 「일머리」에 쌓인 기록 — 업무 {draft.evidence.works}건 · 문서{" "}
          {draft.evidence.documents}건 · 대화 {draft.evidence.comments}건 · 이력{" "}
          {draft.evidence.activities}건 · 첨부 {draft.evidence.attachments}건 —
          에서 서식 순서대로 뽑아 정리한 것입니다. 항목별 근거는 화면에서 확인할 수
          있습니다. 사람이 확인하고 보태야 하는 초안이며, 그대로 제출하는 문서가
          아닙니다.
          {/* 보탠 글이 있을 때만 적는다. 없는데 적어 두면 종이만 든 사람이
              어딘가에 사람이 쓴 문장이 있다고 여기고 찾게 된다. */}
          {hasNotes
            ? " 왼쪽에 선이 그어진 「인계자 보충」은 규칙이 뽑은 것이 아니라 인계자가 직접 적어 넣은 것이며, 적은 사람과 날짜를 함께 적었습니다."
            : ""}
        </p>
        {/* 두 시각은 다르다. generated_at 은 인계를 시작한 때이고, 이 종이의 내용은
            **인쇄하는 순간의 기록으로 다시 조립한 것**이다. 그 사이에 대화 한 줄이
            더 붙으면 인쇄본에는 그 대화가 들어가는데 시각은 옛것이 찍힌다.
            한 줄로 뭉뚱그리면 "이 문서는 그때 만들어졌다"는 거짓이 된다. */}
        <p className="mt-1">
          생성 방식 {method}
          {generatedAt ? ` · 인계 시작 ${formatFullDateTime(generatedAt)}` : ""}
          {` · 이 인쇄본은 ${formatFullDateTime(new Date().toISOString())} 기준으로 조립했습니다`}
        </p>
      </footer>
    </article>
  );
}
