import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { enterAsDemo } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import { demoAccounts } from "@/lib/mock/org";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "들어가기" };

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
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main id="main" tabIndex={-1} className="min-h-dvh bg-gray-5">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1fr_1.1fr] lg:gap-12 lg:py-20">
        {/* ── 제품 소개 ─────────────────────────────────────────────────── */}
        <div className="lg:pt-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-body font-bold text-white">
              일
            </span>
            <span className="text-h3 font-bold text-gray-90">일머리</span>
          </div>

          <h1 className="mt-6 text-h1 leading-tight font-bold break-keep text-gray-90">
            파일은 넘겨받는데,
            <br />
            일머리는 못 넘겨받습니다.
          </h1>

          <p className="mt-5 max-w-md text-body leading-relaxed break-keep text-gray-60">
            부서 간 협업을 업무 단위로 쌓고, 인사이동이 와도 그 기록이 끊기지 않게
            하는 내부 업무공유 플랫폼입니다. 2026 화성시 AI·DATA 공모전 지정과제
            N7 출품작입니다.
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
        </div>

        {/* ── 계정 선택 ─────────────────────────────────────────────────── */}
        <div>
          <div className="rounded-lg border border-gray-10 bg-white p-6 sm:p-7">
            <h2 className="text-h3 font-bold text-gray-90">
              데모 계정으로 들어가기
            </h2>
            <p className="mt-2 text-body-sm break-keep text-gray-60">
              가입 절차 없이 바로 보실 수 있습니다. 계정마다 소속과 역할이 달라
              <strong className="font-bold text-gray-80"> 보이는 업무가 서로 다릅니다.</strong>
            </p>

            {error ? (
              <Notice tone="danger" className="mt-4">
                알 수 없는 계정입니다. 아래에서 다시 골라 주세요.
              </Notice>
            ) : null}

            <ul className="mt-5 space-y-2.5">
              {demoAccounts.map(({ profile, department, role }) => (
                <li key={profile.id}>
                  <form action={enterAsDemo}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input type="hidden" name="next" value={next} />
                    <button
                      type="submit"
                      className="group flex w-full cursor-pointer items-start gap-3.5 rounded-md border border-gray-20 bg-white p-4 text-left transition-colors duration-150 hover:border-primary hover:bg-primary-5"
                    >
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
                    </button>
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
