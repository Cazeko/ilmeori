import type { Metadata } from "next";
import { FileQuestion, Repeat } from "lucide-react";
import { leaveDemo } from "@/app/login/actions";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardBody } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { HandoverScreen } from "@/components/handover/handover-screen";
import { getHandover } from "@/lib/data";
import { requireViewer } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "지난 인계·인수" };

/**
 * 지난 인계서 한 건.
 *
 * ── 왜 이 라우트가 생겼나 ──────────────────────────────────────────────────
 *
 * `/handover` 는 `getHandoverFor` 로 **최신 한 건**을 그린다. 그래서 새 인계를
 * 시작하는 순간 끝난 인계서가 화면에서 사라졌다 — 행은 남아 있는데 볼 길이
 * 없었고, 한/글 내려받기도 같이 죽었다(그 라우트도 같은 함수를 쓴다).
 *
 * 인계서는 결재에 올라가는 공문서다. 「지난번 것은 못 봅니다」는 이 제품이
 * 할 수 있는 말이 아니다.
 *
 * ── 왜 읽기 전용인가 ───────────────────────────────────────────────────────
 *
 * 변경 액션은 전부 `getHandoverFor(viewer)` 로 **대상을 다시 찾는다**
 * (actions/handover.ts). 주소의 id 를 보지 않는다. 그래서 이 화면에 쓰는 칸을
 * 그려 두면 거기 적은 글이 **지금 진행 중인 다른 인계에 붙는다** — 화면이
 * 보여 주는 곳과 저장되는 곳이 다르고, 문답은 고치지도 지우지도 못한다(0022).
 * 액션 서명을 id 받는 쪽으로 바꾸는 것이 정공법이지만 정책·트리거까지 함께
 * 봐야 하는 일이라, 여기서는 `archived` 로 쓰는 칸을 안 그린다.
 *
 * ── 못 보는 인계와 없는 인계 ───────────────────────────────────────────────
 *
 * 구분하지 않는다. 구분하는 순간 「그 인계는 있다」가 샌다 — 누가 누구에게
 * 무엇을 넘겼는지는 그 자체로 인사 정보다. 판단은 화면이 아니라 정책
 * (`handover_select`)이 하고, 서버는 0행을 받을 뿐이라 둘을 구분할 방법이
 * 애초에 없다. uuid 모양이 아닌 주소도 여기로 온다(db.ts 의 UUID 검사).
 *
 * `notFound()` 를 쓰지 않는 이유는 work-not-found.tsx 에 적었다 — 이 앱에서
 * 그것은 스크립트를 끈 브라우저에서 **빈 화면**이 된다.
 */
export default async function PastHandoverPage({
  params,
  searchParams,
}: PageProps<"/handover/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;

  const view = await getHandover(viewer, id);
  if (!view) return <HandoverNotFound path={`/handover/${id}`} />;

  return (
    <HandoverScreen view={view} viewer={viewer} msg={sp.msg} archived />
  );
}

function HandoverNotFound({ path }: { path: string }) {
  return (
    <PageContainer>
      <PageHeader title="인계서를 찾을 수 없습니다" />

      <Card className="max-w-2xl">
        <CardBody className="py-8">
          <FileQuestion aria-hidden className="size-9 text-gray-30" />

          <p className="mt-4 text-body leading-relaxed break-keep text-gray-90">
            이 주소의 인계서가 <strong className="font-bold">없거나</strong>,
            지금 계정에{" "}
            <strong className="font-bold">보이지 않습니다.</strong> 이 화면은
            둘 중 어느 쪽인지 알려 주지 않습니다.
          </p>

          <details className="mt-4">
            <summary className="cursor-pointer text-body-sm font-bold text-gray-60">
              왜 어느 쪽인지 알려 주지 않나요
            </summary>
            <div className="mt-2 flex flex-col gap-3 text-body-sm leading-relaxed break-keep text-gray-60">
              <p>
                「권한이 없습니다」라고 답하면 그 인계가 존재한다는 사실을 알려
                주는 셈이 됩니다.{" "}
                <strong className="font-bold text-gray-90">
                  누가 누구에게 업무를 넘겼는지는 그 자체로 인사 정보입니다
                </strong>{" "}
                — 발령이 나기 전에 새어 나가면 안 되는 것이기도 합니다.
              </p>
              <p>
                {isSupabaseConfigured ? (
                  <>
                    이 판단은 화면이 하지 않습니다. 인계·인수 문서는 넘기는
                    사람과 받는 사람에게만 보이도록 정책(handover_select)이
                    정해 두었고, 데이터베이스가 행을 내어 주지 않아 서버조차
                    둘을 구분할 방법이 없습니다.
                  </>
                ) : (
                  <>
                    지금은 DB 없이 도는 시연 모드라, 서버가 같은 규칙을 흉내
                    내고 있습니다. 데이터베이스에 연결하면 이 판단을 행 수준
                    보안(RLS)이 하고, 서버조차 없는 것과 못 보는 것을 구분할 수
                    없게 됩니다.
                  </>
                )}
              </p>
            </div>
          </details>

          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href="/handover?start=1" variant="primary" size="sm">
              인계 첫 화면으로
            </ButtonLink>
            {/* 막히는 것과 열리는 것을 한 번씩 보면 설명이 끝난다.
                볼 수 있는 계정으로 들어가면 같은 주소가 그대로 열린다. */}
            <form action={leaveDemo}>
              <input type="hidden" name="next" value={path} />
              <SubmitButton variant="secondary" size="sm">
                <Repeat aria-hidden className="size-4" />
                다른 계정으로 이 주소 다시 열기
              </SubmitButton>
            </form>
          </div>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
