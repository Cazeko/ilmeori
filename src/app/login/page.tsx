import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { enterAsDemo } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { BrandMark } from "@/components/brand-mark";
import { CityMark } from "@/components/city-mark";
import { Notice } from "@/components/ui/notice";
import { demoAccounts } from "@/lib/mock/org";
import { safeNext } from "@/lib/safe-next";
import { getViewer } from "@/lib/session";
import { PendingCardButton } from "@/components/ui/pending-card-button";

export const metadata: Metadata = { title: "들어가기" };

/** 업무 하나를 가리키는 주소인가. 안내 문구를 고르는 데만 쓴다. */
function isWorkPath(next: string): boolean {
  return /^\/works\/[0-9a-fA-F-]{36}(\/|\?|$)/.test(next);
}

/**
 * 처음 열리는 화면.
 *
 * 심사위원은 주소를 받아 클릭 한 번으로 도착한다. 여기서 가입을 요구하면
 * 대부분 거기서 닫는다. 그래서 계정 만들기를 두지 않고, 역할이 다른 데모 계정
 * 네 개를 눌러서 바로 들어가게 했다.
 *
 * 계정마다 보이는 업무가 실제로 다르다. 권한 규칙이 화면에서 확인 가능한
 * 주장이어야 하기 때문이다. (같은 규칙을 DB의 RLS가 강제한다)
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const viewer = await getViewer();
  if (viewer) redirect("/");

  const params = await searchParams;
  // 여기서 한 번 거른다. 어차피 enterAsDemo가 다시 거르지만, 두 곳이 서로 다른
  // 값을 보고 있으면 "돌아갑니다"라고 적어 놓고 홈으로 가는 화면이 된다.
  const next = safeNext(params.next);
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main id="main" tabIndex={-1} className="min-h-dvh bg-gray-5">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1fr_1.1fr] lg:gap-12 lg:py-20">
        {/* ── 제품 소개 ─────────────────────────────────────────────────── */}
        <div className="lg:pt-6">
          {/* 표식이 두 개 선다 — 제품과 조직.
              예전에는 파란 네모 안에 「일」 한 글자였는데, 그건 어떤 제품이든
              그 자리에 자기 첫 글자를 넣을 수 있는 표식이라 이 제품에 대해
              한 가지도 말하지 않는다. 머리 줄이 쓰는 것과 같은 BrandMark 로
              바꾼다 — 로그인에서 본 표식과 들어가서 보는 표식이 다르면
              사용자는 그 둘을 같은 제품으로 묶지 못한다. */}
          <div className="flex items-center gap-3">
            <BrandMark className="size-10" />
            <span className="text-h3 font-bold text-gray-90">일머리</span>
            <span aria-hidden className="h-8 w-px bg-gray-20" />
            <CityMark size="lg" />
          </div>

          <h1 className="mt-7 text-h1 leading-tight font-bold break-keep text-gray-90">
            파일은 넘겨받는데,
            <br />
            일머리는 못 넘겨받습니다.
          </h1>

          {/* ── 한 줄 소개 ──────────────────────────────────────────────────
              위 h1 은 **문제**를 말하지 기능을 말하지 않는다. 좋은 문장이지만
              처음 보는 사람은 「그래서 뭘 하는 건데」에 답을 못 얻는다.
              1차예선 심사평이 정확히 그 지점을 짚었다 — 「핵심 기능을 한 줄로
              소개할 수 있어야 한다」.

              그래서 문제 다음 자리에 **하는 일 한 문장**을 둔다. 이 문장은
              로그인·홈·README·발표 대본 네 곳에서 **토씨까지 같아야 한다.**
              자리마다 다르게 적으면 그건 한 줄 소개가 아니라 네 개의 설명이다. */}
          <p className="mt-5 max-w-lg text-body-lg leading-relaxed font-bold break-keep text-gray-90">
            평소 결재와 대화가 쌓이면, 근거가 붙은 한/글 결재문서와 법정 인계서가
            저절로 나옵니다.
          </p>
          <p className="mt-3 max-w-md text-body-sm leading-relaxed break-keep text-gray-60">
            부서 간 협업을 업무 단위로 쌓고, 인사이동이 와도 그 기록이 끊기지 않게
            하는 내부 업무공유 플랫폼입니다.
          </p>

          {/* 어느 공모전의 무슨 과제인지. 본문 문단 안에 섞여 있으면 읽고
              지나가는데, 심사위원에게는 이게 첫 번째 확인 사항이다. */}
          <p className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-gray-20 bg-surface px-3 py-2 text-body-xs text-gray-70">
            <span className="font-bold text-gray-90">
              2026 화성시 AI·DATA 공모전
            </span>
            <span aria-hidden className="text-gray-30">
              ·
            </span>
            <span>지정과제 N7 — 부서 간 협업 업무공유</span>
          </p>

          {/* dl로 두면 dt·dd가 감싸는 div 두 겹 아래로 내려가 정의 목록으로 읽히지 않는다.
              설명 목록이라기보다 기능 나열이므로 ul이 맞다. */}
          <ul className="mt-8 space-y-3.5 border-t border-gray-10 pt-6">
            {[
              [
                "협업이 쌓입니다",
                "누가 무엇을 언제 고쳤는지 사람이 적지 않아도 남습니다.",
              ],
              [
                "작년 이맘때를 불러옵니다",
                "해마다 반복되는 업무는 작년 판을 옆에 놓고 시작합니다.",
              ],
              [
                "인계서가 저절로 만들어집니다",
                "쌓인 기록에서 법정 서식 「업무인계·인수서」 초안을 뽑습니다.",
              ],
            ].map(([term, desc]) => (
              <li key={term} className="flex gap-3">
                <ArrowRight
                  aria-hidden
                  className="mt-1 size-4 shrink-0 text-accent-text"
                />
                <div>
                  <p className="text-body-sm font-bold text-gray-90">{term}</p>
                  <p className="mt-0.5 text-body-sm break-keep text-gray-60">
                    {desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* ── 왜 이 문제인가 ──────────────────────────────────────────────
              왼쪽 아래가 화면 절반 가까이 비어 있었다. 그림이나 큰 문구로 채우면
              히어로 섹션이 되고, 이 제품은 그것을 쓰지 않기로 했다.
              대신 밀도로 채운다 — 근거가 있는 숫자 세 개.

              전부 행정안전부 연구용역(한국행정연구원, 2011)의 조사값이며
              우리가 추정한 수치가 아니다. 출처를 함께 적는 이유가 그것이다. */}
          <section
            aria-labelledby="why-heading"
            className="mt-8 border-t border-gray-10 pt-6"
          >
            <h2
              id="why-heading"
              className="text-body-sm font-bold break-keep text-gray-90"
            >
              인계가 부실하면 무슨 일이 생기는가
            </h2>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["1.14개월", "업무 파악이 늦어지는 기간"],
                ["30.2%", "그만큼의 효율성 개선 여지"],
                ["35.0%", "현행 인계가 비효율적이라는 응답"],
              ].map(([figure, label]) => (
                <div key={label}>
                  <dt className="text-h3 leading-none font-bold tabular-nums text-primary">
                    {figure}
                  </dt>
                  <dd className="mt-1.5 text-body-xs leading-snug break-keep text-gray-60">
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-body-xs leading-relaxed break-keep text-gray-50">
              행정안전부 연구용역 「행정업무 효율성 진단 및 관리방안 구축 — 업무
              인계인수를 중심으로」(한국행정연구원, 2011). 같은 조사에서 대면
              인계인수는 통상 30분 안에 끝나는 것으로 나타났습니다.
            </p>
          </section>
        </div>

        {/* ── 계정 선택 ─────────────────────────────────────────────────── */}
        <div>
          <div className="rounded-lg border border-gray-10 bg-surface p-6 sm:p-7">
            <h2 className="text-h3 font-bold text-gray-90">
              데모 계정으로 들어가기
            </h2>
            <p className="mt-2 text-body-sm break-keep text-gray-60">
              가입 절차 없이 바로 보실 수 있습니다. 계정마다 소속과 역할이 달라
              <strong className="font-bold text-gray-80"> 보이는 업무가 서로 다릅니다.</strong>
            </p>

            {/* 「이 주소를 다른 계정으로 열어 보기」로 온 경우.
                주소를 화면에 그대로 되읊지 않는다. next 값은 사용자가 만든
                문자열이고, 로그인 화면에 원하는 문장을 띄우는 통로가 된다.
                (safeNext가 우리 앱 안의 경로만 통과시키지만, 경로 이름 자체로도
                 "비밀번호를 다시 입력하세요" 같은 문장은 얼마든지 만들어진다) */}
            {next !== "/" ? (
              <Notice tone="info" className="mt-4">
                계정을 고르면 <strong className="font-bold">방금 보던 주소</strong>로
                돌아갑니다.
                {/* next 는 두 곳에서 온다. 업무 상세의 「다른 계정으로 열어 보기」와,
                    로그인하지 않은 사람을 proxy가 되돌려보낼 때(경로를 가리지 않는다).
                    앞의 경우에만 「없습니다」 이야기가 성립한다 — /audit 같은 화면은
                    어느 계정으로 들어가도 그냥 열린다. */}
                {isWorkPath(next) ? (
                  <>
                    {" "}
                    그 업무를 볼 수 없는 계정을 고르면 「없습니다」라고 답합니다 —
                    권한이 없다고 말하지 않습니다.
                  </>
                ) : null}
              </Notice>
            ) : null}

            {error ? (
              <Notice tone="danger" className="mt-4">
                {error === "sign-in-failed"
                  ? "로그인에 실패했습니다. 잠시 뒤 다시 시도해 주세요."
                  : "알 수 없는 계정입니다. 아래에서 다시 골라 주세요."}
              </Notice>
            ) : null}

            <ul className="mt-5 space-y-2.5">
              {demoAccounts.map(({ profile, department, role }) => (
                <li key={profile.id}>
                  <form action={enterAsDemo}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input type="hidden" name="next" value={next} />
                    <PendingCardButton className="group flex w-full cursor-pointer items-start gap-3.5 rounded-md border border-gray-20 bg-surface p-4 text-left transition-colors duration-150 hover:border-primary hover:bg-primary-5">
                      <Avatar profile={profile} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-bold text-gray-90">
                          {profile.name} {profile.position}
                          <span className="ml-2 text-body-sm font-normal text-gray-60">
                            {department.name}
                          </span>
                        </span>
                        <span className="mt-1 block text-body-sm break-keep text-gray-60">
                          {role}
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="mt-1 size-5 shrink-0 text-gray-30 transition-colors duration-150 group-hover:text-primary"
                      />
                    </PendingCardButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>

          <Notice
            tone="warning"
            title="이 화면의 데이터는 전부 지어낸 것입니다"
            className="mt-4"
          >
            부서 이름만 화성특례시 공개 조직도(2026. 2. 개편)를 따랐습니다. 인물,
            업무, 문서, 첨부파일은 모두 시연을 위해 만든 가상 자료이며 실제
            공문서는 한 건도 들어 있지 않습니다.
          </Notice>

          <p className="mt-4 flex items-start gap-2 px-1 text-body-xs leading-relaxed text-gray-60">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              실 서비스에서는 행정전자서명(GPKI) 연계와 부서 단위 접근제어를 전제로
              설계했습니다. 시제품에서는 계정 선택으로 대신합니다.
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
