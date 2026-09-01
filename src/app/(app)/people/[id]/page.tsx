import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { IdentityCard } from "@/components/profile/identity-card";
import { getProfileView } from "@/lib/data";
import { requireViewer } from "@/lib/session";

/**
 * 남의 프로필.
 *
 * ── 왜 이 화면이 있어도 되는가 ─────────────────────────────────────────────
 *
 * 재직자 정보는 원래 전 직원이 본다 — profile_select 정책이 처음부터 그렇게
 * 열려 있었고(0002), 참여자 초대 검색이 그 위에서 돈다. 그러니까 이 화면은
 * 새로 여는 문이 아니라 **이미 열려 있던 것에 주소를 준 것**이다.
 *
 * 새로 여는 것은 하나뿐이고, 그것도 본인이 켜야 열린다 — 휴대전화다.
 * 비공개면 정책이 행을 주지 않으므로 이 화면은 볼 수단 자체가 없다(0023).
 *
 * ── 없는 사람과 못 보는 사람 ───────────────────────────────────────────────
 *
 * 퇴직·휴직자는 정책이 애초에 돌려주지 않는다. 그래서 「퇴직했습니다」라고
 * 말하지 않고 없는 것으로 다룬다 — 누가 그만뒀는지는 인사 정보이고,
 * 주소창에 uuid 를 넣어 보는 것으로 알아낼 일이 아니다.
 */

export async function generateMetadata({
  params,
}: PageProps<"/people/[id]">): Promise<Metadata> {
  const viewer = await requireViewer();
  const { id } = await params;
  const view = await getProfileView(viewer, id);
  return { title: view ? view.profile.name : "직원" };
}

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const view = await getProfileView(viewer, id);

  return (
    <PageContainer width="form">
      <nav aria-label="현재 위치" className="mb-4">
        <ol className="flex items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link
              href="/works"
              className="inline-flex items-center font-bold transition-colors duration-150 hover:text-primary pointer-coarse:min-h-11"
            >
              업무 보드
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="text-gray-70">{view ? view.profile.name : "직원"}</li>
        </ol>
      </nav>

      {/* notFound() 를 쓰지 않는다. 스크립트를 끈 브라우저에서 빈 화면이 되기
          때문이다 — 본문이 self.__next_f.push(...) 안에만 실려 온다. 이 앱은
          스크립트 없이 도는 것이 전제이므로 페이지가 직접 그린다. 그래서
          응답은 404 가 아니라 200 이다(src/app/not-found.tsx 와 같은 맞바꿈). */}
      {!view ? (
        <div data-rank="doc" className="border border-rule-frame border-t-2 border-t-rule-head bg-gray-0 p-6">
          <h1 className="text-h2 font-bold tracking-tight text-gray-90 sm:text-h1">
            그런 직원이 없습니다
          </h1>
          <p className="mt-4 text-body break-keep text-gray-70">
            주소가 잘못되었거나, 지금은 재직 중이 아닌 계정입니다.
          </p>
          <ButtonLink href="/works" variant="secondary" className="mt-6">
            업무 보드로
          </ButtonLink>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <IdentityCard view={view} />
          {view.isMe ? (
            <p className="text-body-sm text-gray-60">
              내 프로필입니다.{" "}
              <Link href="/me" className="font-bold text-primary hover:underline">
                연락처와 부서 이동은 「내 프로필」에서 고칩니다
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
