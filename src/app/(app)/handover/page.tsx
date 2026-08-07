import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSignature,
  Inbox,
  PenLine,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  cancelHandover,
  confirmHandover,
  executeHandover,
  resetDemo,
} from "@/lib/actions/handover";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { Avatar } from "@/components/ui/avatar";
import { ProgressSteps } from "@/components/handover/progress-steps";
import { PrintButton } from "@/components/handover/print-button";
import { HandoverPrintSheet } from "@/components/handover/print-sheet";
import { BlockNotes } from "@/components/handover/block-notes";
import { StatusBadge } from "@/components/status-badge";
import { formatFullDateTime, josa } from "@/lib/format";
import { getDepartment, getHandoverFor, getHandoverNotes } from "@/lib/data";
import { buildHandoverDraft } from "@/lib/handover-draft";
import { requireViewer } from "@/lib/session";
import { canMutate, isSupabaseConfigured } from "@/lib/env";
import { handoverBlockAnchor, type HandoverNoteWithAuthor } from "@/lib/types";

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

  if (!view) {
    return (
      <div className="px-5 py-6 sm:px-7 lg:px-8">
        <PageHeader title="인계·인수" />
        <ActionFeedback msg={sp.msg} className="mb-4" />
        <Card>
          <EmptyState
            icon={Inbox}
            title="진행 중인 인계·인수가 없습니다"
            description="인사이동으로 업무를 넘기게 되면 여기에서 「업무인계·인수서」 초안을 만들 수 있습니다. 넘길 업무와 인수자만 고르면, 나머지는 쌓인 기록에서 뽑아 채웁니다."
            action={
              canMutate ? (
                <ButtonLink href="/handover/new">
                  인계 시작하기
                  <ArrowRight aria-hidden className="size-4" />
                </ButtonLink>
              ) : undefined
            }
          />
        </Card>
      </div>
    );
  }

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

  return (
    <div className="px-5 py-6 sm:px-7 lg:px-8 print:p-0">
      {/* 종이에 나가는 문서. 화면에서는 숨어 있다. 아래 화면용 본문에는
          print:hidden 이 붙어 있어, 인쇄하면 이 한 벌만 나온다. */}
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

      <div className="print:hidden">
        <PageHeader
          title="업무인계·인수"
          description="「행정업무의 운영 및 혁신에 관한 규정」 제61조 및 같은 규정 시행규칙 별지 제12호서식 「업무인계·인수서」의 항목 구성을 그대로 따릅니다."
          action={
            // 인쇄 버튼은 여기 두지 않는다. 무엇이 어떻게 인쇄되는지 적어 둔
            // 안내 옆(초안 바로 위)에 하나만 둔다. 같은 버튼이 화면에 둘 있으면
            // 둘이 다른 일을 한다고 읽힌다.
            //
            // 아래는 목업으로 돌 때만 보인다. 실제 DB에서는 인계가 진짜로
            // 실행되고 그 사실이 이력에 남으므로 되돌리는 버튼이 있으면 안 된다.
            isSupabaseConfigured ? null : (
              <form action={resetDemo}>
                <Button type="submit" variant="ghost" size="sm">
                  <RotateCcw aria-hidden className="size-4" />
                  시연 처음으로
                </Button>
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

        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          {/* ── 초안 ────────────────────────────────────────────────────────── */}
          <div className="min-w-0">
            {/* 이 문구는 실제로 도는 방식과 정확히 같아야 한다.
              buildHandoverDraft()는 쌓인 기록을 서식 순서대로 조립하는 규칙 기반
              코드이고 어떤 모델도 부르지 않는다. "AI가 썼습니다"라고 적어 두면
              심사에서 모델 이름을 묻는 한 마디에 무너진다. 자동으로 뽑았다는 것은
              그 자체로 충분히 설득력 있는 사실이고, 근거를 붙일 수 있다는 점에서
              오히려 더 강한 주장이다. */}
            <Notice
              tone="ai"
              title="이 초안은 사람이 쓰지 않았습니다"
              className="mb-4"
            >
              아래 항목은 이 시스템에 쌓인 기록(업무 {draft.evidence.works}건 ·
              문서 {draft.evidence.documents}건 · 대화 {draft.evidence.comments}
              건 · 이력 {draft.evidence.activities}건 · 첨부{" "}
              {draft.evidence.attachments}건)에서 서식 순서대로 뽑아 정리한
              것입니다.{" "}
              <strong className="font-bold text-gray-90">
                「현안사항」은 문서만이 아니라 대화에서도 가져옵니다.
              </strong>{" "}
              아직 답이 없는 질문이나 서로 어긋난 일정은 문서에 정리되기 전이라
              대화에만 남아 있고, 인계 때 가장 먼저 사라지는 것이 그것이기
              때문입니다. 없는 내용을 지어내지 않으며, 근거를 붙일 수 없는
              항목은 채우지 않고 비워 둔 채로 표시합니다. 그대로 제출하는 문서가
              아니라{" "}
              <strong className="font-bold text-gray-90">
                인계자가 확인하고 보태야 하는 초안
              </strong>
              입니다. 항목마다 어느 기록에서 나왔는지 아래에 적었습니다.{" "}
              {/* 「칸을 뒀습니다」는 그 칸이 실제로 보이는 사람에게만 하는 말이다.
                  인수자가 볼 때·실행이 끝난 뒤·데모 모드에서는 BlockNotes가
                  입력칸을 그리지 않으므로, 없는 칸을 있다고 적으면 안 된다. */}
              {canWriteNotes ? (
                <>
                  <strong className="font-bold text-gray-90">
                    항목마다 「보충 적기」 칸을 뒀습니다.
                  </strong>{" "}
                  규칙이 뽑은 문단은 고쳐 쓰지 못하게 두었습니다 — 덮어쓰면 그
                  문장이 근거를 잃고, 옆에 붙은 근거 표시가 거짓이 되기
                  때문입니다. 보탠 글은 누가 언제 적었는지와 함께 「인계자
                  보충」으로 따로 표시하며, 인쇄본에도 그렇게 나옵니다.
                </>
              ) : (
                <>
                  인계자가 보탠 글이 있으면 규칙이 뽑은 문단과 섞지 않고
                  「인계자 보충」으로 따로 표시합니다. 누가 언제 적었는지가 함께
                  남고, 인쇄본에도 그렇게 나옵니다.
                </>
              )}
              {handover.generated_at ? (
                <>
                  <br />
                  생성 {formatFullDateTime(handover.generated_at)} · 생성 방식{" "}
                  {handover.ai_model ?? "rule-based/v1"}
                </>
              ) : null}
            </Notice>

            {/* ── 인쇄 ────────────────────────────────────────────────────────
              "형식이 hwp냐"보다 "이걸 그대로 결재에 올릴 수 있느냐"가 먼저다.
              브라우저 인쇄로 A4 한 벌이 나오면 그 질문에 종이로 답할 수 있다.
              (버튼은 스크립트가 있을 때만 나타난다. 안내 문장은 늘 남는다) */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-10 bg-white px-4 py-3">
              <p className="min-w-0 flex-1 text-body-sm break-keep text-gray-60">
                브라우저 인쇄(<kbd className="font-sans font-bold">Ctrl</kbd>+
                <kbd className="font-sans font-bold">P</kbd>, macOS는{" "}
                <kbd className="font-sans font-bold">⌘</kbd>+
                <kbd className="font-sans font-bold">P</kbd>)로{" "}
                <strong className="font-bold text-gray-80">
                  별지 제12호서식 모양의 A4
                </strong>
                가 나옵니다. 화면의 근거 꼬리표는 종이에 싣지 않고, 어느
                기록에서 뽑았는지를 맨 아래에 한 번 적습니다.
              </p>
              <PrintButton />
            </div>

            <Card>
              <CardHeader
                title="업무인계·인수서 (초안)"
                description={`인계자 ${from.name} ${from.position} → 인수자 ${to.name} ${to.position}`}
                action={
                  <FileSignature aria-hidden className="size-5 text-gray-30" />
                }
              />
              <CardBody className="flex flex-col gap-6">
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
                          "mt-2 flex items-start gap-2 rounded-md border px-3.5 py-2.5 text-body-sm break-keep text-gray-70",
                          filledByHand
                            ? "border-gray-10 bg-gray-5"
                            : "border-warning/30 bg-warning-bg",
                        )}
                      >
                        <PenLine
                          aria-hidden
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            filledByHand ? "text-gray-60" : "text-warning",
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
                          {block.paragraphs.join(" ")}
                        </span>
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2.5">
                        {block.paragraphs.map((p, i) => (
                          <p
                            key={i}
                            className="rounded-md bg-gray-5 px-3.5 py-2.5 text-body-sm leading-relaxed break-keep whitespace-pre-line text-gray-80"
                          >
                            {p}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* 근거 꼬리표는 **위 문단만** 가리킨다. 그래서 사람이 보탠
                        글보다 앞에 둔다. 아래로 내리면 인계자가 손으로 적은
                        문장까지 "이 기록에서 나왔다"고 말하는 꼴이 된다. */}
                    {block.sources.length > 0 ? (
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-body-xs text-gray-60">
                        <Sparkles
                          aria-hidden
                          className="size-3 text-accent-text"
                        />
                        근거:
                        {block.sources.map((s) => (
                          <span
                            key={s}
                            className="rounded-xs bg-accent-bg px-1.5 py-0.5 font-bold text-accent-text"
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
                <section className="border-t border-gray-10 pt-5">
                  <h3 className="text-body font-bold text-gray-90">확인</h3>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "인계자", person: from, dept: fromDept },
                      { label: "인수자", person: to, dept: toDept },
                    ].map(({ label, person, dept }) => (
                      <li
                        key={label}
                        className="flex items-center gap-3 rounded-md border border-gray-10 px-4 py-3"
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
            <Card>
              <CardHeader title={`인계 대상 업무 ${items.length}건`} as="h2" />
              <ul className="divide-y divide-gray-5">
                {items.map(({ work, transferred }) => (
                  <li key={work.id} className="px-4 py-3">
                    <Link
                      href={`/works/${work.id}`}
                      data-variant="plain"
                      className="block hover:text-primary"
                    >
                      <span className="line-clamp-2 text-body-sm font-bold break-keep text-gray-90">
                        {work.title}
                      </span>
                    </Link>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={work.derived} size="sm" />
                      {transferred ? (
                        <span className="inline-flex items-center gap-1 rounded-xs bg-success-bg px-1.5 py-0.5 text-body-xs font-bold text-success">
                          <CheckCircle2 aria-hidden className="size-3" />
                          인계 완료
                        </span>
                      ) : null}
                      {work.previous_year ? (
                        <span className="inline-flex items-center gap-1 rounded-xs bg-accent-bg px-1.5 py-0.5 text-body-xs font-bold text-accent-text">
                          <RotateCcw aria-hidden className="size-3" />
                          연간 반복
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-body-xs text-gray-60">
                      주담당 {work.owner.name} {work.owner.position}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* ── 다음 할 일 ────────────────────────────────────────────────── */}
            <Card>
              <CardHeader title="다음 단계" as="h2" />
              <CardBody>
                {!isSender ? (
                  <p className="text-body-sm break-keep text-gray-60">
                    이 인계는 {from.name} {from.position}
                    {josa(from.position ?? from.name, "이", "가")} 확인하고
                    실행합니다. 넘겨받는 사람은 진행 상황과 초안을 볼 수
                    있습니다.
                  </p>
                ) : handover.status === "generated" ? (
                  <>
                    {/* 「직접 적으셔야 합니다」라고만 적어 두고 적을 칸을 주지
                        않으면, 화면이 시키는 일을 화면이 못 하게 막는 셈이 된다.
                        그 칸이 어디 있는지까지 말한다. 이미 적었으면 남은 일로
                        세지 않는다. */}
                    {(notesByBlock.get("3-assets")?.length ?? 0) > 0 ? (
                      <p className="mb-4 text-body-sm break-keep text-gray-60">
                        초안의 각 항목이 실제와 맞는지 확인해 주세요. 물품·예산
                        항목에는{" "}
                        <strong className="font-bold text-gray-80">
                          직접 적으신 내용이 들어가 있습니다.
                        </strong>
                      </p>
                    ) : canWriteNotes ? (
                      <p className="mb-4 text-body-sm break-keep text-gray-60">
                        초안의 각 항목이 실제와 맞는지 확인해 주세요. 특히{" "}
                        <strong className="font-bold text-gray-80">
                          물품·예산 항목은 비어 있어
                        </strong>{" "}
                        직접 적으셔야 합니다.{" "}
                        <Link href={`#${handoverBlockAnchor("3-assets")}`}>
                          그 항목으로 가기
                        </Link>
                      </p>
                    ) : (
                      // 데모 모드다. 적을 칸이 없는 곳으로 보내면 안 된다.
                      <p className="mb-4 text-body-sm break-keep text-gray-60">
                        초안의 각 항목이 실제와 맞는지 확인해 주세요. 물품·예산
                        항목은 비어 있습니다 —{" "}
                        <strong className="font-bold text-gray-80">
                          데모 모드에서는 읽기만 됩니다.
                        </strong>{" "}
                        데이터베이스에 연결하면 이 화면에서 그 칸에 직접 적을 수
                        있습니다.
                      </p>
                    )}
                    <form action={confirmHandover}>
                      <Button type="submit" block>
                        내용을 확인했습니다
                        <ArrowRight aria-hidden className="size-4" />
                      </Button>
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
                    <ConfirmDialog
                      trigger="인계 실행"
                      tone="danger"
                      title="인계를 실행할까요?"
                      confirmLabel="실행합니다"
                      description={
                        <>
                          아래 업무의 주담당이 {to.name} {to.position}
                          {josa(
                            to.position ?? to.name,
                            "으로",
                            "로",
                          )} 바뀌고, {from.name} {from.position}
                          {josa(from.position ?? from.name, "은", "는")} 열람
                          권한만 남습니다. 실행한 기록은 각 업무의 이력에 남으며
                          지울 수 없습니다.
                        </>
                      }
                      onConfirm={executeHandover}
                    >
                      <ul className="space-y-1.5 rounded-md border border-gray-10 bg-gray-5 px-4 py-3">
                        {items.map(({ work }) => (
                          <li
                            key={work.id}
                            className="text-body-sm break-keep text-gray-80"
                          >
                            · {work.title}
                          </li>
                        ))}
                      </ul>
                    </ConfirmDialog>
                  </>
                ) : (
                  <p
                    className={cn(
                      "flex items-start gap-2 text-body-sm break-keep text-gray-60",
                    )}
                  >
                    <CheckCircle2
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                    인계가 완료되었습니다. 각 업무의 이력 탭에서 권한이 옮겨 간
                    기록을 확인할 수 있습니다.
                  </p>
                )}
              </CardBody>
            </Card>

            {/* ── 취소 ──────────────────────────────────────────────────────
              실행 전에만 열어 둔다. 인수자를 잘못 골랐을 때 되돌릴 길이 없으면
              한 번에 한 건이라는 규칙 때문에 새 인계를 영영 시작할 수 없다.
              펼치는 손짓 한 번이 확인 절차를 대신한다 — ConfirmDialog는
              "use client"라 스크립트가 없으면 버튼이 아무 일도 하지 않는다. */}
            {isSender && !done && canMutate ? (
              <details className="rounded-md border border-gray-10 bg-white">
                <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-body-sm font-bold text-gray-60 hover:text-gray-80">
                  인계를 잘못 시작했다면
                </summary>
                <div className="border-t border-gray-10 px-4 py-3.5">
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
                    <Button type="submit" variant="secondary" size="sm">
                      <RotateCcw aria-hidden className="size-4" />이 인계 취소
                    </Button>
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
    </div>
  );
}
