import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSignature,
  Inbox,
  PenLine,
  RotateCcw,
  Cog,
} from "lucide-react";
import {
  cancelHandover,
  confirmHandover,
  executeHandover,
  resetDemo,
} from "@/lib/actions/handover";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { CARD_SURFACE, Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { Avatar } from "@/components/ui/avatar";
import { ProgressSteps } from "@/components/handover/progress-steps";
import { PrintButton } from "@/components/handover/print-button";
import { HandoverPrintSheet } from "@/components/handover/print-sheet";
import { SheetCaption } from "@/components/handover/sheet-caption";
import { SourceDrawer } from "@/components/handover/source-drawer";
import { BlockNotes } from "@/components/handover/block-notes";
import {
  SCREENING_ANCHOR,
  ScreeningPanel,
} from "@/components/handover/screening-panel";
import { StatusBadge } from "@/components/status-badge";
// 생성 시각을 화면에서 따로 찍던 자리가 사라졌다 — 서식 맨 아래 「출처」 문단이
// 같은 값을 이미 적고 있고, 그 서식은 이제 인쇄 뒤가 아니라 화면에 서 있다.
import { formatDate, formatDueLabel, josa } from "@/lib/format";
import {
  getDepartment,
  getHandoverFor,
  getHandoverNotes,
  listWorks,
  roleIn,
} from "@/lib/data";
import { byUrgency } from "@/lib/data/types";
import {
  buildHandoverDraft,
  draftBlockText,
  screeningTotal,
} from "@/lib/handover-draft";
import { requireViewer } from "@/lib/session";
import { canMutate, isSupabaseConfigured } from "@/lib/env";
import { handoverBlockAnchor, type HandoverNoteWithAuthor } from "@/lib/types";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "인계·인수" };

/**
 * 인계·인수.
 *
 * 이 화면이 제품의 결론이다.
 *
 * 협업 기록이 쌓여 있으면 인계서는 새로 쓰는 문서가 아니라 **정리해서 뽑는 문서**가 된다.
 * 그래서 초안의 모든 항목에 "어느 기록에서 나왔는지"를 붙였다.
 * 인계자가 확인할 것은 문장의 매끄러움이 아니라 근거의 정확성이다.
 *
 * 마지막 단계에서 실제로 권한이 옮겨 간다. 되돌릴 수 없으므로 확인을 한 번 더 받는다.
 */
export default async function HandoverPage({
  searchParams,
}: PageProps<"/handover">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const view = await getHandoverFor(viewer);

  if (!view) return <HandoverStandby viewer={viewer} msg={sp.msg} />;

  const { handover, from, to, items } = view;
  const draft = await buildHandoverDraft(view);
  const isSender = from.id === viewer.id;
  const done = handover.status === "completed";

  // 대상 수와 실제로 옮겨 간 수는 다를 수 있다. execute_handover는 인계서를 만든 뒤
  // 소유 권한이 바뀐 업무를 건너뛰기 때문이다. 결론을 말할 때는 옮겨 간 쪽을 쓴다.
  const transferredCount = items.filter((i) => i.transferred).length;

  const [fromDept, toDept, notes] = await Promise.all([
    from.department_id ? getDepartment(from.department_id) : null,
    to.department_id ? getDepartment(to.department_id) : null,
    getHandoverNotes(handover.id),
  ]);

  // 인계자가 보탠 글을 항목별로 나눠 둔다. 초안(규칙)과 보충(사람)은 여기서도
  // 섞지 않는다 — buildHandoverDraft는 이 글들을 보지 않고, 그래서 근거 꼬리표는
  // 언제나 규칙이 뽑은 문단만 가리킨다.
  const notesByBlock = new Map<string, HandoverNoteWithAuthor[]>();
  for (const n of notes) {
    const list = notesByBlock.get(n.block_key);
    if (list) list.push(n);
    else notesByBlock.set(n.block_key, [n]);
  }

  // 보충을 적을 수 있는 사람 — 인계자 본인, 실행 전, DB가 붙어 있을 때.
  // 실행 후를 막는 것은 0011의 완료된 인계 잠금과 같은 규칙이고, 실제로 막는 것은
  // 정책(handover_note_insert)이다. 여기서는 눌리지 않을 칸을 그리지 않을 뿐이다.
  const canWriteNotes = isSender && !done && canMutate;

  // 인수자가 실제로 넘겨받은 뒤. 이때만 곁칸이 「대상 목록」에서 「지금 급한
  // 것」으로 바뀐다. 실행 전에는 아직 넘어간 것이 없어서(transferred: false)
  // 목록이 비고, 「오늘 먼저 볼 것 0건」은 사실이 아니라 사고처럼 읽힌다.
  const handedOver = items.filter((i) => i.transferred);
  const receiverDone = !isSender && done && handedOver.length > 0;
  const sideItems = receiverDone
    ? [...handedOver].sort((a, b) => byUrgency(a.work, b.work))
    : items;

  // 인계자가 이 화면에서 실제로 해야 하는 일 두 가지. 곁칸이 그 수를 세고
  // 자리를 가리킨다 — 「직접 적으셔야 합니다」라고만 적어 두고 그 칸이 어디
  // 있는지 안 알려 주면, 화면이 시키는 일을 화면이 못 하게 막는 셈이 된다.
  const toFill = draft.blocks.filter(
    (b) => b.needsHuman && (notesByBlock.get(b.key)?.length ?? 0) === 0,
  );
  const screened = screeningTotal(draft.screening);

  return (
    <PageContainer className="print:p-0">
      <div className="print:hidden">
        {/* 이름표는 물러난다. 이 화면의 「문서」는 아래에 실제로 서 있는
            별지 제12호서식 그 자체이지, 「업무인계·인수」라는 글자가 아니다. */}
        <PageHeader
          size="sm"
          title="업무인계·인수"
          /* h1 이 아니다 — 이 화면의 h1 은 아래 서 있는 별지 제12호서식의
             제목(「업무인계·인수서」)이다. 그 서식은 인쇄 전용이 아니라 화면에
             그대로 보이므로 h1 이 둘이 되고, 제목으로 훑는 사람은 어느 것이
             화면 이름인지 알 수 없게 된다.
             이 파일이 이미 적어 둔 말과 같다 — 「이 화면의 「문서」는 아래에
             실제로 서 있는 별지 제12호서식 그 자체이지, 「업무인계·인수」라는
             글자가 아니다.」 */
          as="p"
          /* 법령 조문을 제목 밑에 통째로 인용해 두었었다. 근거를 밝히는 것은
             맞지만 제목 바로 아래는 「이 화면이 무엇인가」를 말하는 자리이지
             출처를 대는 자리가 아니다. 서식 이름만 남기고 조문은 종이(인쇄본)에
             이미 적혀 있으므로 화면에서는 뺀다. */
          description="시행규칙 별지 제12호서식을 그대로 따릅니다."
          action={
            // 인쇄 버튼은 여기 두지 않는다. 무엇이 어떻게 인쇄되는지 적어 둔
            // 안내 옆(초안 바로 위)에 하나만 둔다. 같은 버튼이 화면에 둘 있으면
            // 둘이 다른 일을 한다고 읽힌다.
            //
            // 아래는 목업으로 돌 때만 보인다. 실제 DB에서는 인계가 진짜로
            // 실행되고 그 사실이 이력에 남으므로 되돌리는 버튼이 있으면 안 된다.
            isSupabaseConfigured ? null : (
              <form action={resetDemo}>
                <SubmitButton variant="ghost" size="sm">
                  <RotateCcw aria-hidden className="size-4" />
                  시연 처음으로
                </SubmitButton>
              </form>
            )
          }
        />

        <ActionFeedback msg={sp.msg} className="mb-4" />

        {/* ── 단계 ─────────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <ProgressSteps current={handover.status} />
        </div>

        {done ? (
          <Notice tone="success" title="인계가 끝났습니다" className="mb-6">
            {/* 대상 수가 아니라 **실제로 옮겨 간 수**를 말한다. 인계서를 만든 뒤
              소유 권한이 바뀐 업무는 execute_handover가 건너뛰므로 둘이 다를 수 있고,
              그때 대상 수를 말하면 옆칸의 「인계 완료」 배지와 앞뒤가 안 맞는다. */}
            업무 {transferredCount}건의 주담당이 {to.name} {to.position}
            {josa(to.position ?? to.name, "으로", "로")} 바뀌었습니다.{" "}
            {from.name} {from.position}
            {josa(from.position ?? from.name, "은", "는")} 열람 권한을
            유지합니다. 업무 보드에서 실제로 바뀐 것을 확인해 보세요.{" "}
            <Link href="/works">업무 보드로 가기</Link>
          </Notice>
        ) : null}

      </div>

      {/* ── 이 화면의 「문서」 — 별지 제12호서식 그 자체 ──────────────────────
          한동안 이 서식에는 `hidden print:block` 이 붙어 있었다. 이 제품에서
          가장 강한 물건이 **Ctrl+P 를 눌러야만 보였다**는 뜻이고, 화면에서
          사람이 보던 것은 아래의 회색 말풍선 초안이었다.

          문서 등급으로 화면에 세운다 — 흰 종이, 각진 모서리, 위쪽 2px 먹선.
          안의 표는 `.sheet` 가 먹색 괘선으로 그린다. 인쇄하면 같은 클래스가
          pt 로 다시 그려지므로 화면과 종이가 어긋날 수 없다.

          이 판만 print:hidden 밖에 있다 — 인쇄하면 이 한 벌만 나온다.
          바깥 테두리와 여백은 종이에서 지운다(종이가 곧 테두리다).

          한동안 여기 「항목마다 붙는 근거 꼬리표는 여기 없다」고 적혀 있었다.
          지금은 있다 — 문장마다 어디서 왔는지가 서식 안에 붙고, 위 캡션의
          토글이 그것을 비춘다. 다만 **종이에는 여전히 없다**(globals.css 의
          @media print). 결재에 올라가는 장에서 꼬리표는 서식을 어지럽힌다. */}
      <div
        data-rank="doc"
        className={cn(
          CARD_SURFACE.doc,
          "mb-6 p-6 sm:p-10",
          "print:border-0 print:bg-white print:p-0",
        )}
      >
        {/* 서식의 캡션 — 이 문서가 무엇으로 만들어졌는지 한 줄.
            래퍼 **안**이어야 한다(sheet-caption.tsx 의 「자리」 주석). */}
        <SheetCaption screening={draft.screening} />
        {/* 인용 꼬리표를 누르면 원문이 옆에 열린다 — **문서를 떠나지 않는다.**
            서버 컴포넌트인 서식을 자식으로 받는다(RSC 에서 정상적인 모양이고,
            서식은 여전히 서버에서 그려진다). 조각으로 감싸므로 DOM 모양은 한
            겹도 안 는다 — `#handover-prov:checked ~ .sheet` 가 형제를 찾는다.
            자바스크립트가 없으면 아무 일도 안 하고 꼬리표는 예전처럼 업무
            화면으로 간다. */}
        <SourceDrawer>
          <HandoverPrintSheet
            draft={draft}
            notesByBlock={notesByBlock}
            from={from}
            to={to}
            fromDept={fromDept}
            toDept={toDept}
            generatedAt={handover.generated_at}
            completedAt={handover.completed_at}
            method={handover.ai_model ?? "rule-based/v1"}
          />
        </SourceDrawer>
      </div>

      <div className="print:hidden">
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          {/* ── 항목별 근거 ────────────────────────────────────────────────── */}
          <div className="min-w-0">
            {/* 이 문구는 실제로 도는 방식과 정확히 같아야 한다.
              buildHandoverDraft()는 쌓인 기록을 서식 순서대로 조립하는 규칙 기반
              코드이고 어떤 모델도 부르지 않는다. "AI가 썼습니다"라고 적어 두면
              심사에서 모델 이름을 묻는 한 마디에 무너진다. 자동으로 뽑았다는 것은
              그 자체로 충분히 설득력 있는 사실이고, 근거를 붙일 수 있다는 점에서
              오히려 더 강한 주장이다. */}
            {/* ── 왜 대화까지 보는가 ────────────────────────────────────────
              한동안 이 자리가 **주황 채움 판**이었고 제목이 「이 초안은 사람이
              쓰지 않았습니다」였다. 화면에서 가장 강한 색이 증명이 아니라
              **주장 문장**에 쓰이고 있었다는 뜻이다. 그리고 이 화면은 파랑·
              주황·빨강 세 갈래로 이미 색 예산을 넘겨 있었다(DESIGN.md §2 —
              무채색 + 최대 둘). 주장에 쓰던 예산을 회수한다.

              그 판이 하던 말의 절반은 **서식 맨 아래 「출처」 문단이 이미
              하고 있었다** — 쌓인 기록의 수, 생성 방식과 생성 시각, 「그대로
              제출하는 문서가 아니다」. 서식이 인쇄 뒤에 숨어 있던 시절에는
              그것이 되풀이가 아니었지만, 지금은 같은 화면에서 같은 말을 두 번
              하는 것이다. 되풀이는 지우고 **여기서만 할 수 있는 말**만 남긴다.

              등급은 여백이다 — 채움도 네 변도 없이 왼쪽 선 하나
              (미포착 판·대기 화면이 이미 쓰는 모양, DESIGN.md §17.3). */}
            <section className="mb-4 flex gap-2 border-l border-l-rule-hair py-2 pl-3">
              <Cog aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
              <div className="flex flex-col gap-2 text-body-sm leading-relaxed break-keep text-gray-70">
                <p>
                  <strong className="font-bold text-gray-90">
                    「현안사항」은 문서만이 아니라 대화에서도 가져옵니다.
                  </strong>{" "}
                  아직 답이 없는 질문이나 서로 어긋난 일정은 문서에 정리되기
                  전이라 대화에만 남아 있고, 인계 때 가장 먼저 사라지는 것이
                  그것이기 때문입니다. 근거를 붙일 수 없는 항목은 채우지 않고
                  비워 둡니다.
                </p>
                {/* 「칸을 뒀습니다」는 그 칸이 실제로 보이는 사람에게만 하는 말이다.
                    인수자가 볼 때·실행이 끝난 뒤·데모 모드에서는 BlockNotes가
                    입력칸을 그리지 않으므로, 없는 칸을 있다고 적으면 안 된다. */}
                {canWriteNotes ? (
                  <p>
                    규칙이 뽑은 문단은 고쳐 쓰지 못하게 두었습니다. 덮어쓰면 그
                    문장이 근거를 잃고, 옆에 붙은 근거 표시가 거짓이 되기
                    때문입니다. 보탠 글은 누가 언제 적었는지와 함께 「인계자
                    보충」으로 따로 표시하며, 인쇄본에도 그렇게 나옵니다.
                  </p>
                ) : (
                  <p>
                    인계자가 보탠 글이 있으면 규칙이 뽑은 문단과 섞지 않고
                    「인계자 보충」으로 따로 표시합니다. 누가 언제 적었는지가
                    함께 남고, 인쇄본에도 그렇게 나옵니다.
                  </p>
                )}
              </div>
            </section>

            {/* ── 인쇄 ────────────────────────────────────────────────────────
              "형식이 hwp냐"보다 "이걸 그대로 결재에 올릴 수 있느냐"가 먼저다.
              브라우저 인쇄로 A4 한 벌이 나오면 그 질문에 종이로 답할 수 있다.
              (버튼은 스크립트가 있을 때만 나타난다. 안내 문장은 늘 남는다) */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule-frame bg-surface px-4 py-3">
              <p className="min-w-0 flex-1 text-body-sm break-keep text-gray-60">
                {/* 「Ctrl+P」를 빼면 안 된다. 스크립트가 없는 브라우저에서는
                    옆의 인쇄 버튼이 아예 안 그려지고, 이 문장이 인쇄하는 법을
                    알려 주는 유일한 자리가 된다(tests/browser.test.mjs [2]). */}
                <kbd className="font-sans font-bold">Ctrl+P</kbd>로{" "}
                <strong className="font-bold text-gray-80">
                  별지 제12호서식 모양의 A4
                </strong>
                가 나옵니다. 근거 꼬리표는 종이 맨 아래에 한 번만 모아 적습니다.
              </p>
              <PrintButton />
            </div>

            {/* 위 서식이 「문서」가 된 뒤로 이 판이 하는 일이 분명해졌다 —
                서식을 다시 보여 주는 것이 아니라 **항목마다 근거가 맞는지
                확인하고 빈 칸을 채우는 작업대**다. 제목을 그렇게 고친다.
                (등급도 문서가 아니라 판이다 — 화면의 문서는 위 하나뿐이다) */}
            <Card>
              <CardHeader
                title="항목별 근거와 보충"
                description="위 서식의 각 항목이 어느 기록에서 나왔는지 확인하고, 근거가 없어 비워 둔 칸을 직접 적습니다."
                action={
                  <FileSignature aria-hidden className="size-5 text-gray-30" />
                }
              />
              <CardBody className="flex flex-col gap-6">
                {/* 서식 항목을 읽기 전에, 그 칸을 채운 규칙이 무엇을 놓쳤는지
                    먼저 밝힌다. 세는 범위는 **대화와 문서 항목 둘**이다 —
                    한동안 대화뿐이었고 이 주석도 그렇게 적혀 있었지만, 문서
                    항목을 같은 규칙으로 세게 되면서 판 제목도 「규칙이 무엇을
                    걸렀나」로 넓어졌다(screening-panel.tsx 의 경위 주석).
                    서식 위 캡션이 세는 수와 같은 수다.
                    이 판은 서식이 아니므로 종이에는 나가지 않는다. */}
                <ScreeningPanel screening={draft.screening} />

                {draft.blocks.map((block) => {
                  const blockNotes = notesByBlock.get(block.key) ?? [];
                  // 원래 비어 있던 칸에 사람이 적어 넣었으면, 화면도 그 사실을
                  // 말해야 한다. 다 적은 뒤에도 「사람이 직접 적어야 합니다」라는
                  // 노란 경고가 그대로 남아 있으면 아직 할 일이 남은 것으로 읽힌다.
                  const filledByHand =
                    block.needsHuman && blockNotes.length > 0;

                  return (
                  <section
                    key={block.key}
                    // 보충을 적고 나면 이 자리로 돌아온다(handoverBlockAnchor).
                    // 붙박이 머리줄에 가리지 않게 여백을 둔다.
                    id={handoverBlockAnchor(block.key)}
                    className="scroll-mt-20"
                  >
                    <h3 className="text-body font-bold text-gray-90">
                      {block.heading}
                    </h3>

                    {block.needsHuman ? (
                      <p
                        className={cn(
                          "mt-2 flex items-start gap-2 rounded-sm border px-4 py-3 text-body-sm break-keep text-gray-70",
                          // 「사람이 채워야 하는 칸」은 주황 경고였다. 두 가지가
                          // 틀어져 있었다. ① 이 화면은 이미 색 갈래 셋을 쓰고
                          // 있었다(DESIGN.md §2 는 최대 둘). ② 비어 있는 칸은
                          // 사고가 아니라 **설계**다 — 규칙이 채울 수 없는 칸을
                          // 지어내지 않고 비워 둔 것이고, 그건 경고가 아니라
                          // 서식이 원래 사람 손을 기다리는 자리라는 뜻이다.
                          //
                          // 그래서 먹색 파선이다. 종이의 손으로 적는 빈칸
                          // (print-sheet.tsx 의 border border-black)과 같은
                          // 어휘이고, 색 갈래를 한 개도 안 쓴다.
                          filledByHand
                            ? "border-rule-frame bg-gray-5"
                            : "border-dashed border-rule-head",
                        )}
                      >
                        <PenLine
                          aria-hidden
                          className={cn(
                            "mt-1 size-4 shrink-0",
                            filledByHand ? "text-gray-40" : "text-gray-90",
                          )}
                        />
                        <span>
                          <strong className="font-bold text-gray-90">
                            {filledByHand
                              ? "인계자가 직접 적었습니다. "
                              : "사람이 직접 적어야 합니다. "}
                          </strong>
                          {/* 이 문단에는 지시가 들어 있지 않다(handover-draft.ts).
                              앞의 굵은 한 줄만 상태에 따라 갈린다. */}
                          {draftBlockText(block.paragraphs)}
                        </span>
                      </p>
                    ) : null}

                    {/* ── 여기 본문이 한 벌 더 있었다 ──────────────────────────
                        같은 인계서가 한 화면에 **두 번** 그려지고 있었다 —
                        위의 별지 제12호서식 약 4,500px, 여기 다시 약 4,500px,
                        합쳐 8,965px. 2분 30초짜리 시연에서 첫 사본을 스크롤로
                        지나야 두 번째 사본의 누를 수 있는 근거에 닿았다.

                        그때는 그럴 이유가 있었다 — 서식에는 링크가 없었으므로
                        **근거를 누를 수 있는 자리가 여기뿐**이었다. 이제 서식
                        자신이 문장마다 출처를 달고 있으므로(print-sheet.tsx 의
                        <DraftLines>), 이 판이 본문을 다시 그릴 이유가 없다.

                        지우는 것은 **본문 한 가지뿐**이다. 위의 needsHuman 설명
                        박스는 서식의 파선 빈칸이 못 하는 말을 하고, 아래
                        BlockNotes 는 사람이 타이핑하는 유일한 자리다. 둘 다 남는다.
                        이 판은 서식의 사본이 아니라 **확인하고 채우는 작업대**다.

                        ⚠ 순서가 중요했다. 서식에 출처 층을 붙이기 **전에** 이걸
                        지웠으면, 그 사이 배포본에는 근거를 누를 자리가 아예
                        없었을 것이다. */}

                    {/* 근거 꼬리표는 **규칙이 뽑은 문단만** 가리킨다. 그래서
                        사람이 보탠 글보다 앞에 둔다. 아래로 내리면 인계자가
                        손으로 적은 문장까지 "이 기록에서 나왔다"고 말하는 꼴이
                        된다. */}
                    {block.sources.length > 0 ? (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-body-xs text-gray-60">
                        <Cog
                          aria-hidden
                          className="size-3 text-accent-text"
                        />
                        근거:
                        {block.sources.map((s) => (
                          <span
                            key={s}
                            className="font-bold text-accent-text"
                          >
                            {s}
                          </span>
                        ))}
                      </p>
                    ) : null}

                    <BlockNotes
                      handoverId={handover.id}
                      blockKey={block.key}
                      heading={block.heading}
                      notes={blockNotes}
                      canWrite={canWriteNotes}
                      needsHuman={block.needsHuman}
                    />
                  </section>
                  );
                })}

                {/* 서식의 마지막 — 서명란 */}
                <section className="border-t border-rule-hair pt-5">
                  <h3 className="text-body font-bold text-gray-90">확인</h3>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "인계자", person: from, dept: fromDept },
                      { label: "인수자", person: to, dept: toDept },
                    ].map(({ label, person, dept }) => (
                      <li
                        key={label}
                        className="flex items-center gap-3 rounded-sm border border-rule-frame px-4 py-3"
                      >
                        <Avatar profile={person} size="lg" />
                        <div className="min-w-0">
                          <p className="text-body-xs font-bold text-gray-60">
                            {label}
                          </p>
                          <p className="text-body-sm font-bold text-gray-90">
                            {person.name} {person.position}
                            <span className="ml-1 block text-body-xs font-normal text-gray-60">
                              {dept?.name}
                            </span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-body-xs break-keep text-gray-60">
                    실제 서식에는 입회자 서명란이 함께 있습니다. 시제품에서는
                    전자서명 연계를 구현하지 않았습니다.
                  </p>
                </section>
              </CardBody>
            </Card>
          </div>

          {/* ── 옆: 대상과 진행 ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* ── 이 판은 보는 사람에 따라 다른 것을 묻는다 ──────────────────
                넘기는 사람에게 필요한 것은 **무엇이 넘어가는가**이고,
                넘겨받은 사람에게 필요한 것은 **무엇부터 봐야 하는가**다.

                제품 전체가 떠나는 사람 쪽으로 지어져 있었다. 그런데 인터뷰가
                말한 고통은 받는 쪽에 있다 — 전임자에게 20~30번 전화하는 사람은
                인계자가 아니라 **인수자**다(Q10). 인수자에게는 같은 화면의
                읽기 전용판만 있었고, 「내가 넘겨받은 4건, 이 2건이 급하다」는
                화면이 없었다.

                새 개념은 만들지 않는다. 정렬은 앱 전체가 쓰는 `byUrgency`
                그대로이고(인수자만 다른 규칙을 쓰면 화면마다 「급함」의 뜻이
                갈린다), 카드 모양도 이 목록이 이미 쓰던 것 그대로다. */}
            <Card>
              <CardHeader
                // 제목에 수를 붙이지 않는다. 「오늘 먼저 볼 것 4건」은 **넷을
                // 골랐다**고 읽히는데, 이 목록은 고른 것이 아니라 넘겨받은 것
                // **전부**를 급한 순으로 놓은 것이다. 고르지 않았으면 골랐다고
                // 말하지 않는다 — 수는 아래 설명이 사실대로 말한다.
                title={
                  receiverDone ? "오늘 먼저 볼 것" : `인계 대상 업무 ${items.length}건`
                }
                as="h2"
                description={
                  receiverDone
                    ? `넘겨받은 ${sideItems.length}건을 기한이 지난 것부터, 그다음은 마감이 가까운 순으로 놓았습니다.`
                    : undefined
                }
              />
              <ul className="divide-y divide-rule-hair">
                {sideItems.map(({ work, transferred }) => (
                  <li key={work.id} className="px-4 py-3">
                    <Link
                      href={`/works/${work.id}`}
                      className="block transition-colors duration-150 hover:text-primary"
                    >
                      <span className="line-clamp-2 text-body-sm font-bold break-keep text-gray-90">
                        {work.title}
                      </span>
                    </Link>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={work.derived} size="sm" />
                      {/* 「인계 완료」의 글자색은 success(#228738)가 아니라
                          status-done-text(#1c722f)다. 채움이 있을 때는 옅은 초록
                          위에 얹혀 있었지만, 면을 걷어낸 지금은 판(#fafafa) 위에
                          그대로 선다. 판 위에서 success 는 4.38:1 로 미달이고
                          done-text 는 5.75:1 이다. globals.css 가 「-text 는
                          배지·칩의 글자용」이라고 적어 둔 것이 이 자리다.
                          인수자 화면에서는 이 배지를 안 단다 — 그 목록은
                          넘어온 것만 모아 놓은 것이라 전부 완료이고, 줄마다
                          같은 배지가 붙으면 아무것도 안 가리킨다. */}
                      {transferred && !receiverDone ? (
                        <span className="inline-flex items-center gap-1 text-body-xs font-bold text-status-done-text">
                          <CheckCircle2 aria-hidden className="size-3" />
                          인계 완료
                        </span>
                      ) : null}
                      {receiverDone ? (
                        <span className="text-body-xs text-gray-60">
                          {work.due_date
                            ? `${formatDate(work.due_date)} (${formatDueLabel(work.due_date)})`
                            : "마감 없음"}
                        </span>
                      ) : null}
                      {work.previous_year ? (
                        <span className="inline-flex items-center gap-1 text-body-xs font-bold text-accent-text">
                          <RotateCcw aria-hidden className="size-3" />
                          연간 반복
                        </span>
                      ) : null}
                    </span>
                    {/* 인수자 화면에서는 주담당을 안 적는다 — 넘어온 뒤라
                        줄마다 자기 이름이 되고, 그건 아무것도 안 알려 준다.
                        (열람기록의 「사람」 칸을 같은 이유로 지웠다) */}
                    {receiverDone ? null : (
                      <span className="mt-1 block text-body-xs text-gray-60">
                        주담당 {work.owner.name} {work.owner.position}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            {/* ── 다음 할 일 ────────────────────────────────────────────────── */}
            <Card>
              <CardHeader title="다음 단계" as="h2" />
              <CardBody>
                {/* 끝난 인계는 **양쪽에 같은 말**을 한다. 이 갈래가 없던 동안
                    인수자에게는 실행이 끝난 뒤에도 「이 인계는 박준호 주무관이
                    확인하고 실행합니다」가 그대로 남아 있었다 — 바로 위에서
                    「인계가 끝났습니다」라고 말하는 화면이 옆칸에서는 아직 안
                    끝났다고 말하고 있었다. */}
                {done ? (
                  <p className="flex items-start gap-2 text-body-sm break-keep text-gray-60">
                    <CheckCircle2
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-success"
                    />
                    <span>
                      인계가 완료되었습니다. 각 업무의 이력 탭에서 권한이 옮겨 간
                      기록을 확인할 수 있습니다.
                      {/* 인수자에게만 덧붙인다. 인터뷰가 말한 20~30통의 전화는
                          「물어볼 곳이 없어서」가 아니라 「물어볼 자격이 남아
                          있는지 몰라서」 생기기도 한다. 남아 있다고 화면이 먼저
                          말한다 — 실제로 정책이 그렇게 두었다. */}
                      {!isSender ? (
                        <>
                          {" "}
                          {from.name} {from.position}
                          {josa(from.position ?? from.name, "은", "는")} 열람
                          권한을 유지하고 있어, 확인이 필요한 것은 물어볼 수
                          있습니다.
                        </>
                      ) : null}
                    </span>
                  </p>
                ) : !isSender ? (
                  <p className="text-body-sm break-keep text-gray-60">
                    이 인계는 {from.name} {from.position}
                    {josa(from.position ?? from.name, "이", "가")} 확인하고
                    실행합니다. 넘겨받는 사람은 진행 상황과 초안을 볼 수
                    있습니다.
                  </p>
                ) : handover.status === "generated" ? (
                  <>
                    {/* ── 지금 볼 것 두 구획 ────────────────────────────────
                        예전에는 여기가 산문 세 갈래였고, 셋 다 「물품·예산
                        항목」 하나만 손으로 적어 두고 있었다. 사람이 채워야 하는
                        칸이 둘이 되는 날 조용히 반쪽만 말하게 되는 모양이라,
                        **초안에서 세어** 자리까지 가리킨다.

                        구획이 둘인 이유는 고칠 자리가 다르기 때문이다 —
                        위는 **내가 적을 것**이고 아래는 **규칙이 못 걸른 것**이다.
                        아이콘도 그 자리들이 이미 쓰는 것을 그대로 쓴다
                        (PenLine = 직접 적는 칸 · Cog = 규칙). 탭은 안 쓴다 —
                        이 저장소에서 탭은 업무 상세 최상위 구획 한 곳뿐이고,
                        미포착 판이 이미 「탭 없이 줄로 쌓기」를 쓴다. */}
                    <p className="mb-3 text-body-sm break-keep text-gray-60">
                      초안의 각 항목이 실제와 맞는지 확인해 주세요.
                    </p>
                    <ul className="mb-4 flex flex-col gap-3">
                      <li className="flex gap-2">
                        <PenLine
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-gray-40"
                        />
                        <div className="min-w-0">
                          <p className="text-body-sm text-gray-70">
                            직접 적을 칸{" "}
                            <b className="font-bold tabular-nums text-gray-90">
                              {toFill.length}건
                            </b>
                          </p>
                          {toFill.length > 0 ? (
                            <ul className="mt-1 flex flex-col gap-1">
                              {toFill.map((b) => (
                                <li key={b.key}>
                                  {/* 전역에서 밑줄을 걷어낸 뒤(globals.css 의 `a`)
                                      클래스 없는 링크는 주변 글자와 완전히 같아
                                      보인다 — WCAG 1.4.1. 이 앱의 인라인 링크
                                      규약은 「굵은 글자 + primary」다. */}
                                  <Link
                                    href={`#${handoverBlockAnchor(b.key)}`}
                                    className="text-body-sm font-bold break-keep text-primary"
                                  >
                                    {b.heading}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-body-xs break-keep text-gray-60">
                              비어 있던 칸을 모두 적으셨습니다.
                            </p>
                          )}
                        </div>
                      </li>
                      {screened.notUsed > 0 ? (
                        <li className="flex gap-2">
                          <Cog
                            aria-hidden
                            className="mt-1 size-4 shrink-0 text-gray-40"
                          />
                          <div className="min-w-0">
                            <p className="text-body-sm text-gray-70">
                              규칙이 안 실은 것{" "}
                              <b className="font-bold tabular-nums text-gray-90">
                                {screened.notUsed}건
                              </b>
                            </p>
                            <p className="mt-1">
                              <Link
                                href={`#${SCREENING_ANCHOR}`}
                                className="text-body-sm font-bold text-primary"
                              >
                                규칙이 무엇을 걸렀나
                              </Link>
                            </p>
                          </div>
                        </li>
                      ) : null}
                    </ul>
                    {/* 데모 모드다. 적을 칸이 없는 곳으로 보내 놓고 아무 말도
                        안 하면 안 된다. */}
                    {!canWriteNotes && toFill.length > 0 ? (
                      <p className="mb-4 text-body-sm break-keep text-gray-60">
                        <strong className="font-bold text-gray-80">
                          데모 모드에서는 읽기만 됩니다.
                        </strong>{" "}
                        데이터베이스에 연결하면 이 화면에서 그 칸에 직접 적을 수
                        있습니다.
                      </p>
                    ) : null}
                    <form action={confirmHandover}>
                      <SubmitButton block pendingLabel="확인하는 중…">
                        내용을 확인했습니다
                        <ArrowRight aria-hidden className="size-4" />
                      </SubmitButton>
                    </form>
                  </>
                ) : handover.status === "confirmed" ? (
                  <>
                    <p className="mb-4 text-body-sm break-keep text-gray-60">
                      실행하면 업무 {items.length}건의 주담당이 {to.name}{" "}
                      {to.position}
                      {josa(
                        to.position ?? to.name,
                        "으로",
                        "로",
                      )} 바뀝니다.{" "}
                      <strong className="font-bold text-danger">
                        되돌릴 수 없습니다.
                      </strong>{" "}
                      인계서에 보탠 내용도 그때부터 더하거나 지울 수 없습니다.
                    </p>
                    {/* 확인 절차를 <details> 로 둔다.
                      예전에는 <dialog>+showModal() 로 물었는데, 그 컴포넌트는
                      "use client" 이고 여는 일이 onClick 에 걸려 있어 **스크립트가
                      없으면 이 단추가 아무 일도 하지 않았다.** 이 제품에서 가장
                      되돌릴 수 없는 동작이 무JS 에서 실행 불가였다는 뜻이다.
                      바로 아래 「인계를 잘못 시작했다면」이 이미 같은 이유로
                      <details> 를 쓰고 있었다 — 규약이 한 화면 안에서 갈려 있었다.
                      펼치는 손짓 한 번이 확인 절차를 대신한다. */}
                    <details className="rounded-sm border border-danger/30 bg-danger-bg">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-body-sm font-bold text-danger">
                        인계 실행
                      </summary>
                      <div className="border-t border-danger/30 px-4 py-4">
                        <p className="mb-3 text-body-sm leading-relaxed break-keep text-gray-70">
                          아래 업무의 주담당이 {to.name} {to.position}
                          {josa(to.position ?? to.name, "으로", "로")} 바뀌고,{" "}
                          {from.name} {from.position}
                          {josa(from.position ?? from.name, "은", "는")} 열람
                          권한만 남습니다. 실행한 기록은 각 업무의 이력에 남으며
                          지울 수 없습니다.
                        </p>
                        <ul className="mb-3 space-y-2 rounded-sm border border-rule-frame bg-surface px-4 py-3">
                          {items.map(({ work }) => (
                            <li
                              key={work.id}
                              className="text-body-sm break-keep text-gray-80"
                            >
                              · {work.title}
                            </li>
                          ))}
                        </ul>
                        <form action={executeHandover}>
                          {/* 이 앱에서 가장 무거운 단추다 — 주담당이 실제로
                              바뀌고 열람 권한이 옮겨 간다. 되돌릴 수 없는
                              동작에는 무슨 일이 벌어지는 중인지 글로 준다
                              (ui/submit-button.tsx). */}
                          <SubmitButton variant="danger" pendingLabel="실행하는 중…">
                            실행합니다
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  </>
                ) : null}
              </CardBody>
            </Card>

            {/* ── 취소 ──────────────────────────────────────────────────────
              실행 전에만 열어 둔다. 인수자를 잘못 골랐을 때 되돌릴 길이 없으면
              한 번에 한 건이라는 규칙 때문에 새 인계를 영영 시작할 수 없다.
              펼치는 손짓 한 번이 확인 절차를 대신한다 — <dialog>로 묻는 방식은
              "use client"라 스크립트가 없으면 버튼이 아무 일도 하지 않는다. */}
            {isSender && !done && canMutate ? (
              <details className="rounded-sm border border-rule-frame bg-surface">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-body-sm font-bold text-gray-60 transition-colors duration-150 hover:text-gray-80">
                  <RotateCcw aria-hidden className="size-4 shrink-0 text-gray-40" />
                  인계를 잘못 시작했다면
                </summary>
                <div className="border-t border-rule-hair px-4 py-4">
                  <p className="mb-3 text-body-sm leading-relaxed break-keep text-gray-70">
                    아직 실행되지 않은 인계이므로 넘어간 업무는 없습니다.
                    취소하면 초안과 대상 목록이 사라지고 새로 시작할 수
                    있습니다. 실행한 뒤에는 취소할 수 없습니다.
                    {/* 초안은 언제든 다시 조립되지만 손으로 적은 보충은 다시
                        만들 수 없다. 이 시스템에서 사람이 직접 타이핑한 유일한
                        내용이 확인 절차 없는 버튼 하나로 사라지는 자리다. */}
                    {notes.length > 0 ? (
                      <>
                        {" "}
                        <strong className="font-bold text-danger">
                          직접 적으신 보충 {notes.length}건도 함께 사라집니다.
                        </strong>{" "}
                        이것만은 다시 만들어 드릴 수 없으니, 필요하면 인쇄하거나
                        옮겨 적어 두신 뒤에 취소해 주세요.
                      </>
                    ) : null}
                  </p>
                  <form action={cancelHandover}>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="취소하는 중…">
                      <RotateCcw aria-hidden className="size-4" />이 인계 취소
                    </SubmitButton>
                  </form>
                </div>
              </details>
            ) : null}

            {done && canMutate ? (
              <Card>
                <CardBody>
                  <p className="mb-3 text-body-sm break-keep text-gray-60">
                    다른 업무를 더 넘겨야 한다면 새 인계를 시작할 수 있습니다.
                  </p>
                  <ButtonLink href="/handover/new" variant="secondary" block>
                    새 인계 시작
                    <ArrowRight aria-hidden className="size-4" />
                  </ButtonLink>
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

/**
 * 진행 중인 인계가 없을 때의 화면.
 *
 * ── 왜 빈 화면이면 안 되는가 ──────────────────────────────────────────────
 *
 * 이 화면은 제품의 결론이다. 그런데 진행 중인 인계 건은 한 사람이 몇 년에 한 번
 * 갖는 것이고, 데모 계정 넷 중 둘(김서연·최민재)은 인계 당사자가 아니다.
 * 그 둘로 들어와 왼쪽 메뉴에서 「인계·인수」를 누르면 — 즉 심사위원이 처음 받는
 * 계정으로 가장 궁금한 메뉴를 누르면 — **아이콘 하나와 단추 하나가 있는 빈 판**이
 * 나왔다. 제품의 결론이 백지였다.
 *
 * ── 그래서 무엇을 그리는가 ────────────────────────────────────────────────
 *
 * 없는 인계를 지어내지 않는다. 대신 **지금 넘긴다면 무엇이 실리는지**를 실제로
 * 세어 보여 준다. 이 숫자는 꾸민 것이 아니라 그 계정이 주담당인 업무에서 그대로
 * 나온 것이고, 그래서 계정마다 다르다.
 *
 * 「평소 협업의 부산물이 곧 인수인계서가 된다」가 이 제품의 설계 원리다.
 * 그 원리는 인계가 시작되기 **전에도** 참이어야 하고, 이 화면이 그것을 말한다.
 *
 * 세는 것은 listWorks 가 이미 돌려주는 값뿐이다(대화·첨부 수). 이력을 함께
 * 세려면 업무마다 질의를 더 돌려야 하는데, 아직 시작하지도 않은 인계의
 * 미리보기가 그만큼의 비용을 쓸 이유가 없다.
 *
 * ⚠ **여기에 숫자를 더 세우지 않는다.** 문서 수는 이제 `listWorks` 가 돌려주므로
 * 한 칸 더할 수 있었고, 실제로 더해 봤다가 걷어냈다 — 실눈 시험의 자리 검사가
 * 그 순간 빨간불이 됐다(1등 칸이 문서 사각형보다 위로 올라갔다). 이 판은
 * 여백 등급이고 아래 「넘길 수 있는 업무」가 문서다. 문서 수가 값하는 자리는
 * 여기가 아니라 **업무마다 붙는 「인계 시작」 화면**이다(handover/new).
 */
async function HandoverStandby({
  viewer,
  msg,
}: {
  viewer: Profile;
  msg: string | string[] | undefined;
}) {
  const mine = await listWorks(viewer, { mine: true });
  const owned = mine.filter((w) => roleIn(w, viewer) === "owner");

  const comments = owned.reduce((n, w) => n + w.comment_count, 0);
  const attachments = owned.reduce((n, w) => n + w.attachment_count, 0);
  const repeating = owned.filter((w) => w.previous_year).length;
  const departments = new Set(owned.map((w) => w.department_id)).size;
  const overdue = owned.filter((w) => w.derived === "overdue").length;

  return (
    <PageContainer>
      {/* 이름표는 물러난다. 「인계·인수」는 왼쪽 메뉴에서 이미 켜져 있고, 같은
          라우트의 진행 중 화면이 이미 size="sm" 이다 — 한 화면이 상태에 따라
          제목 크기가 달라지고 있었다.

          그리고 이 화면이 하러 온 일은 **인계를 시작하는 것**이다. 그 단추가
          오른쪽 곁칸 설명 카드 맨 아래에 있었다 — 화면의 목적이 곁칸 각주에
          들어가 있었던 셈이라, 머리 줄의 동작 자리로 올린다. */}
      <PageHeader
        size="sm"
        title="인계·인수"
        description="시행규칙 별지 제12호서식을 그대로 따릅니다."
        action={
          canMutate && owned.length > 0 ? (
            <ButtonLink href="/handover/new">
              <FileSignature aria-hidden className="size-4" />
              인계 시작하기
            </ButtonLink>
          ) : null
        }
      />
      <ActionFeedback msg={msg} className="mb-4" />

      {owned.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="진행 중인 인계·인수가 없습니다"
            description="넘길 수 있는 것은 내가 주담당인 업무뿐입니다. 지금은 주담당인 업무가 없습니다."
            action={
              <ButtonLink href="/works" variant="secondary">
                업무 보드로 가기
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            {/* ── 이 문단과 아래 숫자는 「여백」이다 ─────────────────────────
                한동안 여기가 **주황 채움 판**이었고, 그 아래가 **통계 타일 넉
                줄**이었다. 화면을 열면 그 둘이 가장 무거웠고, 정작 넘길 업무
                목록은 그 아래로 밀렸다.

                DESIGN.md §5.1 이 못박은 것이 정확히 이것이다 — **「화면의
                「문서」는 사용자가 누를 대상이어야 한다. 요약 배너·통계 타일은
                아무리 커도 여백 등급이다.」** 업무 보드와 결재함이 같은 함정에서
                이미 빠져나왔고, 이 화면만 남아 있었다.

                말을 지우는 것이 아니라 무게를 맞춘다. 채움과 테두리를 걷고
                왼쪽 선 하나만 남긴다. */}
            <p className="mb-5 flex items-start gap-2 border-l border-l-rule-hair py-2 pl-3 text-body-sm leading-relaxed break-keep text-gray-60">
              <Cog aria-hidden className="mt-1 size-4 shrink-0 text-gray-40" />
              <span>
                아래 숫자는 예시가 아니라 {viewer.name} {viewer.position} 님이
                주담당인 업무에서{" "}
                <strong className="font-bold text-gray-70">지금 세어 본 것</strong>
                입니다. 인계를 시작하면 이 기록이 별지 제12호서식의 순서대로
                조립되고, 항목마다 어느 기록에서 나왔는지가 함께 붙습니다.{" "}
                <strong className="font-bold text-gray-70">
                  인계서를 위해 따로 적어 둔 것은 한 줄도 없습니다.
                </strong>
              </span>
            </p>

            <Card variant="quiet" className="mb-6">
              <CardHeader variant="quiet" title="지금 넘긴다면" as="h2" />
              <CardBody variant="quiet">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                  {/* 꼬리말은 그 숫자가 서식 어디로 가는지만 적는다.
                      「대화」에 「원문 그대로 실린다」고 적었다가 고쳤다 —
                      대화가 전부 실리는 것이 아니라 현안 규칙에 걸린 것만
                      인용된다. 세는 수와 실리는 수가 다른데 같은 것처럼
                      적으면, 옆에 붙은 근거 꼬리표와 같은 종류의 거짓이 된다. */}
                  {[
                    ["업무", owned.length, "주담당인 것만"],
                    ["대화", comments, "현안에 걸린 것이 원문 그대로 인용된다"],
                    ["첨부", attachments, "서식 2장에 목록으로"],
                    ["연간 반복", repeating, "작년 판이 붙어 있다"],
                  ].map(([label, value, hint]) => (
                    <div key={label as string}>
                      <dt className="text-body-xs font-bold text-gray-60">
                        {label}
                      </dt>
                      {/* 파랑이었다. 이 제품에서 파랑은 「누를 수 있는 것」
                          하나만 가리키는데(globals.css 의 4갈래), 이 숫자들은
                          눌리지 않는다. 색 언어가 거짓말을 하고 있었다 —
                          정보는 먹색이다. */}
                      <dd className="mt-1 text-h2 leading-none font-bold tabular-nums text-gray-90">
                        {value}
                        <span className="ml-1 text-body-sm font-normal text-gray-60">
                          건
                        </span>
                      </dd>
                      <p className="mt-2 text-body-xs break-keep text-gray-60">
                        {hint}
                      </p>
                    </div>
                  ))}
                </dl>
              </CardBody>
              {/* 「빠뜨리면 비싼 것」을 따로 말한다. 인계에서 가장 먼저 사라지는
                  것이 지연 사유와 해마다 반복되는 일의 작년 맥락이기 때문이다.
                  채움(bg-gray-5)을 걷고 선 하나로 끊는다 — 이 판 전체가 여백
                  등급으로 내려왔으므로 안쪽에 다시 면을 깔면 도로 판이 된다. */}
              {overdue > 0 || repeating > 0 ? (
                <div className="mt-5 border-t border-rule-hair pt-4">
                  <ul className="flex flex-col gap-2">
                    {overdue > 0 ? (
                      <li className="flex gap-2 text-body-sm break-keep text-gray-70">
                        <PenLine
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-danger"
                        />
                        <span>
                          기한이 지난 업무 {overdue}건. 왜 멈췄는지가 문서와
                          대화에 남아 있으면 그대로 실립니다. 담당자가 바뀔 때
                          가장 먼저 사라지는 것이 이 「왜」입니다.
                        </span>
                      </li>
                    ) : null}
                    {repeating > 0 ? (
                      <li className="flex gap-2 text-body-sm break-keep text-gray-70">
                        <RotateCcw
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-accent-text"
                        />
                        <span>
                          해마다 반복되는 업무 {repeating}건. 작년 판이 함께
                          걸려 있어 인수자가 작년 시행착오부터 읽을 수 있습니다.
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </Card>

            {/* ── 이 화면의 「문서」 ─────────────────────────────────────────
                위의 요약과 숫자가 여백으로 내려온 자리에 이것이 선다.
                **인계에서 사람이 실제로 다루는 물건은 이 목록**이고, 여기서
                「인계 시작하기」로 간다. 흰 종이 + 위쪽 2px 먹선 —
                결재함·쪽지함·알림·열람기록이 이미 같은 모양이다. */}
            <h2 className="mb-3 text-h3 font-bold text-gray-90">
              넘길 수 있는 업무
              <span className="ml-2 text-body-sm font-normal tabular-nums text-gray-60">
                {owned.length}건
              </span>
            </h2>
            <p className="mb-3 text-body-sm break-keep text-gray-60">
              {departments}개 부서 소관. 편집자·열람자로 참여만 한 업무는 주담당이
              따로 있어 여기 없습니다.
            </p>
            <div
              data-rank="doc"
              className={cn(
                CARD_SURFACE.doc,
                "divide-y divide-rule-hair overflow-hidden",
              )}
            >
              <ul className="divide-y divide-rule-hair">
                {owned.map((w) => (
                  <li key={w.id} className="px-5 py-4">
                    {/* 18px 짜리 글줄 하나가 과녁이었다. 보이는 크기는 그대로
                        두고 눌리는 높이만 벌린다(2.5.5 의 44px). */}
                    <Link
                      href={`/works/${w.id}`}
                      className="inline-flex items-center text-body-sm font-bold break-keep text-gray-90 pointer-coarse:min-h-11 transition-colors duration-150 hover:text-primary"
                    >
                      {w.title}
                    </Link>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={w.derived} size="sm" />
                      <span className="text-body-xs text-gray-60">
                        {w.due_date
                          ? `${formatDate(w.due_date)} (${formatDueLabel(w.due_date)})`
                          : "마감 없음"}
                      </span>
                      {w.previous_year ? (
                        <span className="inline-flex items-center gap-1 text-body-xs font-bold text-accent-text">
                          <RotateCcw aria-hidden className="size-3" />
                          연간 반복
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── 옆칸 ──────────────────────────────────────────────────────────
              설명과 안내다. 왼쪽 문서와 같은 테두리를 두르고 있으면 둘이
              동급으로 읽힌다 — 여백 등급으로 물린다(card.tsx 의 quiet). */}
          <div className="flex flex-col gap-6">
            <Card variant="quiet">
              <CardHeader variant="quiet" title="인계를 시작하면" as="h2" />
              <CardBody variant="quiet">
                <ol className="flex flex-col gap-4">
                  {[
                    [
                      "대상 선정",
                      "넘길 업무와 인수자만 고릅니다. 사람이 적는 것은 여기까지입니다.",
                    ],
                    [
                      "초안 생성",
                      "쌓인 기록에서 별지 제12호서식 순서대로 뽑습니다. 항목마다 근거가 붙습니다.",
                    ],
                    [
                      "인계자 확인",
                      "근거가 맞는지 봅니다. 물품·예산처럼 근거가 없는 칸은 비워 두고 직접 적습니다.",
                    ],
                    [
                      "인계 완료",
                      "주담당이 실제로 바뀌고, 넘긴 사람에게는 열람 권한이 남습니다.",
                    ],
                  ].map(([term, desc], i) => (
                    <li key={term} className="flex gap-3">
                      <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-10 text-body-xs font-bold tabular-nums text-gray-70">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-body-sm font-bold text-gray-90">
                          {term}
                        </p>
                        <p className="mt-1 text-body-xs leading-relaxed break-keep text-gray-60">
                          {desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardBody>
              {/* 「인계 시작하기」가 여기 있었다 — 곁칸 설명 카드의 맨 아래.
                  이 화면이 하러 온 일이 각주 자리에 있었던 셈이라 머리 줄의
                  동작 자리로 올렸다. 같은 단추를 두 번 두지 않는다. */}
            </Card>

            {/* 데모에서 실제로 굴러가는 인계 건이 어디 있는지 알려 준다.
                이 계정은 인계 당사자가 아니므로, 여기서 「시작하기」를 눌러 새로
                만드는 것 말고 **이미 진행 중인 것을 보는 길**도 있어야 한다.
                (정책이 당사자에게만 보여 주므로 계정을 바꿔야 열린다) */}
            <Card variant="quiet">
              <CardHeader variant="quiet" title="진행 중인 인계를 보려면" as="h2" />
              <CardBody variant="quiet">
                <p className="text-body-sm leading-relaxed break-keep text-gray-60">
                  인계·인수 문서는 <strong className="font-bold text-gray-80">
                    넘기는 사람과 받는 사람에게만
                  </strong>{" "}
                  보입니다. 화면이 아니라 정책(handover_select)이 그렇게
                  정해 두었습니다.
                </p>
                <p className="mt-3 text-body-sm leading-relaxed break-keep text-gray-60">
                  시연용으로 준비된 인계 건은 자원순환과{" "}
                  <strong className="font-bold text-gray-80">박준호 → 이하람</strong>{" "}
                  입니다. 오른쪽 위 「계정 전환」에서 두 사람 중 하나로 들어가면
                  초안·근거 표시·실행까지 볼 수 있습니다.
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
