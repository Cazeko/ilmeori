import type { Department, Profile } from "@/lib/types";
import type { HandoverDraft } from "@/lib/handover-draft";
import { formatDate, formatFullDateTime, todayKST } from "@/lib/format";

/**
 * 인쇄용 「업무인계·인수서」.
 *
 * 화면용 카드에 인쇄 규칙을 덧씌우지 않고 **따로 그린다.**
 * 화면은 확인하는 도구이고 종이는 결재에 올리는 문서라, 필요한 것이 서로 다르다.
 * 화면에는 근거 꼬리표가 항목마다 붙어야 하고, 종이에는 그것이 서식을 어지럽힌다.
 * 한쪽에 맞추면 반드시 다른 쪽이 어색해진다.
 *
 * 화면에서는 숨어 있고(hidden) 인쇄할 때만 나타난다(print:block).
 * 반대로 화면용 본문에는 print:hidden 이 붙어 있다.
 *
 * 서식 근거
 *   「행정업무의 운영 및 혁신에 관한 규정」 제61조
 *   같은 규정 시행규칙 제45조, 별지 제12호서식
 *
 * 실제 별지 서식과 다른 점을 숨기지 않는다. 전자서명 연계가 없으므로
 * 서명란은 손으로 적는 빈칸으로 두고, 물품·예산 항목도 빈칸으로 인쇄한다.
 */

function who(p: Pick<Profile, "name" | "position">) {
  return [p.name, p.position].filter(Boolean).join(" ");
}

export function HandoverPrintSheet({
  draft,
  from,
  to,
  fromDept,
  toDept,
  generatedAt,
  completedAt,
  method,
}: {
  draft: HandoverDraft;
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

  return (
    <article className="print-sheet hidden print:block">
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

      {draft.blocks.map((block) => (
        <section key={block.heading} className="mt-5">
          <h2 className="font-bold">{block.heading}</h2>
          {block.needsHuman ? (
            <>
              <p className="mt-1">{block.paragraphs.join(" ")}</p>
              {/* 지어내지 않는다는 원칙은 종이에서도 같다. 빈칸으로 인쇄해 손으로 적게 한다. */}
              <div className="mt-1 h-16 border border-black" />
            </>
          ) : (
            block.paragraphs.map((p, i) => (
              <p key={i} className="mt-1 whitespace-pre-line">
                {p}
              </p>
            ))
          )}
        </section>
      ))}

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
          있습니다. 사람이 확인하고 고쳐야 하는 초안이며, 그대로 제출하는 문서가
          아닙니다.
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
