import type { Metadata } from "next";
import Link from "next/link";
import { Check, CircleDashed, FileSignature, FileOutput } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "자동 생성과 검증" };

/**
 * 「무엇을 자동으로 만들고, 무엇을 확인했는가」.
 *
 * ── 이 화면이 왜 있는가 ────────────────────────────────────────────────────
 *
 * 두 가지 질문이 반드시 나온다. 둘 다 지금까지는 답할 자리가 없었다.
 *
 *   ① 「AI 어디 있어요?」
 *      이 제품은 어떤 모델도 부르지 않는다. 그것은 약점이 아니라 선택이고,
 *      선택에는 이유가 있다 — 그런데 그 이유가 인계·인수 화면 안쪽의 접힌
 *      상자에만 적혀 있었다. 거기까지 가 본 사람만 읽을 수 있었다.
 *
 *   ② 「이거 진짜 돌아요?」
 *      확인한 것(권한 166건·규격 57건·근거 규칙 32건·접근성 0건)과 아직
 *      확인하지 못한 것(한/글 실물)이 화면 여기저기에 흩어져 있었다. 특히
 *      「한/글에서 열리는지 아직 확인하지 못했다」는 고백이 내려받기 단추
 *      **바로 아래**에 있어서, 그 화면만 보면 이 제품이 자신 없어 보였다.
 *
 * 흩어 놓으면 변명이 되고, 한자리에 모으면 검증 기록이 된다.
 * 숫자는 전부 `npm run check` 가 실제로 돌리는 시험의 결과이며, 손으로
 * 적어 넣은 값이 아니다. 시험이 늘거나 줄면 이 화면의 숫자도 함께 고친다.
 */

/** 자동으로 조립되는 문서 — 지금 둘뿐이고, 늘리기 전에 근거를 붙일 수 있는지부터 본다. */
const GENERATED = [
  {
    icon: FileSignature,
    title: "업무인계·인수서 초안",
    form: "시행규칙 별지 제12호서식",
    where: "인계·인수",
    href: "/handover",
    material:
      "넘기는 업무의 기본 정보·참여자, 문서 항목, 업무 대화, 변경이력, 첨부 목록",
    rule: "서식의 항목 순서대로 재료를 배치한다. 「현안 및 문제점」에는 문서 본문만이 아니라 아직 답이 없는 질문·약속이 남은 대화를 함께 넣는다.",
    refuse:
      "물품·예산처럼 이 시스템에 재료가 없는 항목은 지어내지 않고 「사람이 직접 적어야 합니다」로 비워 둔다.",
  },
  {
    icon: FileOutput,
    title: "온나라 이관 문서",
    form: "시행규칙 별지 제2호서식 · .hwpx",
    where: "결재 → 온나라로 넘기기",
    href: "/approvals",
    material: "결재란·결재 의견, 연결된 업무의 문서 항목·대화·첨부·이력",
    rule: "문장마다 어느 기록에서 나왔는지를 함께 싣는다. 고른 대화는 요약하지 않고 원문 그대로 넣는다.",
    refuse:
      "인계서보다 좁게 고른다. 이 문서는 건물 밖으로 나가므로, 상관없는 대화가 「근거」라는 이름표를 달고 실리는 쪽이 빠뜨리는 것보다 비싸다.",
  },
];

/** 확인한 것과 확인하지 못한 것. `verified: false` 는 숨기지 않는다. */
const CHECKS = [
  {
    what: "권한",
    how: "실제 Postgres 에 사용자를 흉내 내어 접속하고, 볼 수 없어야 할 행을 실제로 요청해 본다",
    result: "166건 통과",
    cmd: "npm run db:test",
    verified: true,
  },
  {
    what: "한/글 파일 규격",
    how: "ZIP 구조(STORED·DEFLATE)와 OWPML 문서가 규격대로 짜였는지, 글자가 제자리에 들어갔는지",
    result: "57건 통과",
    cmd: "npm run test:hwpx",
    verified: true,
  },
  {
    what: "근거 선택 규칙",
    how: "어떤 대화가 「근거」로 실리고 어떤 대화가 실리지 않는지 — 규칙이 흔들리지 않는가",
    result: "32건 통과",
    cmd: "npm run test:cues",
    verified: true,
  },
  {
    what: "화면 동작",
    how: "실제 브라우저를 띄워 열한 갈래의 흐름을 끝까지 눌러 본다. 열여섯 번 중 열네 번은 자바스크립트를 끈 채로 돌린다 — 스크립트가 없어도 앱이 도는 것이 이 제품의 전제라, 그 전제도 함께 시험한다",
    result: "182건 통과",
    cmd: "npm run test:browser",
    verified: true,
  },
  {
    // README 에는 「axe-core 로 10개 화면, 위반 0건」이라고 적혀 있지만,
    // **그 검사를 돌리는 코드가 이 저장소에 없다.** 개발 중에 한 번 돌리고
    // 남겨 두지 않은 것으로 보인다. 다시 돌릴 수 없는 검사는 이 표에서
    // 「통과」로 셀 수 없다 — 이 제품은 「초록불을 본 적이 없으면 통과했다고
    // 세지 않는다」를 지켜 왔고, 여기서 예외를 두면 표 전체가 못 믿을 것이 된다.
    what: "접근성 자동 검사",
    how: "개발 중 axe-core(WCAG 2.1 AA)로 확인하며 고친 것들이 있지만, 그 검사가 저장소에 남아 있지 않아 지금 다시 돌릴 수 없다. 색만으로 알리지 않기·키보드 이동·대비는 화면을 만들 때 규칙으로 지켰다",
    result: "재현 불가",
    cmd: null,
    verified: false,
  },
  {
    what: "한/글에서 실제로 열리는가",
    how: "이 저장소는 리눅스 컨테이너라 한/글이 없다. 규격 시험이 지키는 것은 「규격대로 짜였는가」까지이고, 한글과컴퓨터의 실제 프로그램이 그 파일을 여는지는 다른 문제다",
    result: "아직 확인 전",
    cmd: null,
    verified: false,
  },
  {
    what: "실제 공문서로 시험",
    how: "시제품에는 실제 공문서를 단 한 건도 넣지 않았다. 화면의 모든 자료는 가상이다",
    result: "하지 않음",
    cmd: null,
    verified: false,
  },
];

export default function MethodPage() {
  return (
    <PageContainer>
      <PageHeader
        title="자동 생성과 검증"
        description="무엇을 자동으로 만드는지, 그것을 무엇이 만드는지, 그리고 어디까지 확인했는지."
      />

      {/* ── ① 모델을 부르지 않는다 ─────────────────────────────────────────
          가장 먼저 나오는 질문에 가장 먼저 답한다. 접지 않는다. */}
      <Notice
        tone="ai"
        title="이 제품은 어떤 모델도 부르지 않습니다"
        className="mb-5"
      >
        인계서 초안도, 온나라로 넘기는 문서도 <strong className="font-bold">규칙이 조립합니다.</strong>{" "}
        같은 기록을 넣으면 언제나 같은 문서가 나옵니다.
        <br />
        모델이 고르면 <strong className="font-bold text-gray-90">왜 골랐는지를 문서에 적을 수 없고,</strong>{" "}
        그러면 항목마다 붙인 「근거」 꼬리표가 아무것도 보증하지 못합니다. 이
        제품이 내세우는 것은 문장의 매끄러움이 아니라 근거의 확인 가능성이라,
        그 둘 중에서는 후자를 골랐습니다.
        <br />
        생성 방식은 만들어질 때마다 <code className="rounded-xs bg-gray-10 px-1 py-0.5 font-mono text-body-xs">rule-based/v1</code>{" "}
        로 기록에 남습니다. 나중에 모델을 붙이더라도 그 사실이 문서마다 남아,
        어느 문서가 무엇으로 만들어졌는지 뒤에서 구분할 수 있습니다.
      </Notice>

      {/* ── ② 무엇을 만드는가 ─────────────────────────────────────────────── */}
      <h2 className="mt-7 mb-3 text-h3 font-bold text-gray-90">
        자동으로 조립되는 문서
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {GENERATED.map(({ icon: Icon, ...g }) => (
          <Card key={g.title}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4 shrink-0 text-primary" />
                  {g.title}
                </span>
              }
              as="h3"
              description={g.form}
            />
            <CardBody>
              <dl className="flex flex-col gap-3.5">
                {[
                  ["재료", g.material],
                  ["규칙이 하는 일", g.rule],
                  ["하지 않는 일", g.refuse],
                ].map(([term, desc]) => (
                  <div key={term}>
                    <dt className="text-body-xs font-bold text-gray-60">
                      {term}
                    </dt>
                    <dd className="mt-0.5 text-body-sm leading-relaxed break-keep text-gray-80">
                      {desc}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
            <div className="border-t border-gray-10 px-5 py-3">
              <Link href={g.href} className="text-body-sm font-bold">
                {g.where} 화면에서 보기
              </Link>
            </div>
          </Card>
        ))}
      </div>

      {/* ── ③ 검증 현황 ──────────────────────────────────────────────────── */}
      <h2 className="mt-8 mb-3 text-h3 font-bold text-gray-90">검증 현황</h2>
      <Card>
        <CardHeader
          title="확인한 것과 확인하지 못한 것"
          as="h3"
          description="아래 숫자는 npm run check 가 실제로 돌리는 시험의 결과입니다."
        />
        <ul className="divide-y divide-gray-5">
          {CHECKS.map((c) => (
            <li key={c.what} className="flex gap-3 px-5 py-4">
              {/* 색만으로 갈리지 않게 아이콘 모양도 다르다(체크 / 빈 원). */}
              {c.verified ? (
                <Check
                  aria-hidden
                  className="mt-0.5 size-4.5 shrink-0 text-success"
                />
              ) : (
                <CircleDashed
                  aria-hidden
                  className="mt-0.5 size-4.5 shrink-0 text-warning"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-body-sm font-bold text-gray-90">
                    {c.what}
                  </span>
                  {/* success·warning 은 배경 위에서 4.5:1 을 넘는 글자색이다
                      (#228738 / #9e6a00). 옅은 같은 계열 배경과 짝지어 쓴다. */}
                  <span
                    className={
                      c.verified
                        ? "rounded-xs bg-success-bg px-1.5 py-0.5 text-body-xs font-bold text-success"
                        : "rounded-xs bg-warning-bg px-1.5 py-0.5 text-body-xs font-bold text-warning"
                    }
                  >
                    {c.result}
                  </span>
                  {c.cmd ? (
                    <code className="rounded-xs bg-gray-5 px-1.5 py-0.5 font-mono text-body-xs text-gray-60">
                      {c.cmd}
                    </code>
                  ) : null}
                </p>
                <p className="mt-1 text-body-sm leading-relaxed break-keep text-gray-60">
                  {c.how}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-10 bg-gray-5 px-5 py-3.5">
          <p className="text-body-sm leading-relaxed break-keep text-gray-70">
            <strong className="font-bold text-gray-90">
              한/글에서 열리지 않아도 같은 내용의 종이가 나옵니다.
            </strong>{" "}
            내보내기 화면에 인쇄(A4) 폴백을 붙여 둔 채로 두었고, 그 화면이 이
            사실을 글자로 적습니다. 확인하지 못한 것을 확인한 것처럼 적어 두는
            쪽이, 못 한 채로 적어 두는 쪽보다 훨씬 비쌉니다.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
