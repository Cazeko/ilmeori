import type { Metadata } from "next";
import { ActionFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { PageContainer } from "@/components/ui/page-container";
import { ContactForm } from "@/components/profile/contact-form";
import { IdentityCard } from "@/components/profile/identity-card";
import { TransferInbox } from "@/components/profile/transfer-inbox";
import { TransferSection } from "@/components/profile/transfer-section";
import {
  getDepartmentTree,
  getMyPendingTransfer,
  getProfileView,
  getTransferImpact,
  listMyTransferHistory,
  listTransfersToApprove,
} from "@/lib/data";
import { canMutate } from "@/lib/env";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "내 프로필" };

/**
 * 내 프로필.
 *
 * ── 화면이 세 덩어리인 이유 ────────────────────────────────────────────────
 *
 *   1  신원      못 고치는 것. 인사 데이터다
 *   2  연락처    고칠 수 있는 것. 이 화면에서 유일하게 저장되는 칸들
 *   3  부서 이동 못 고치지만 **신청할 수는 있는** 것
 *
 * 셋을 한 카드에 섞지 않는다. 섞으면 「어디까지가 내가 정하는 것인가」가
 * 흐려지고, 그 경계가 이 화면의 내용 전부다. 소속을 스스로 못 바꾼다는 사실이
 * 이 제품의 접근제어가 서 있는 자리이기 때문이다(supabase/migrations/0023).
 *
 * 4번 「내가 결정할 이동」은 승인자에게만 나타난다. 신원 카드 **바로 다음**에
 * 둔다 — 남을 기다리게 하는 일이 내 번호를 고치는 일보다 먼저이기 때문인데,
 * 그렇다고 화면 맨 위로 올리지는 않는다. 이 화면의 h1 은 신원 카드이고
 * (card.tsx: 문서 등급이 그 화면의 h1 이다), 제목으로 화면을 훑는 사람에게
 * h2 가 h1 보다 먼저 나오는 순서는 「여기가 어디인가」를 흐린다.
 */
export default async function MyProfilePage({
  searchParams,
}: PageProps<"/me">) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const [view, pending, history, inbox, tree] = await Promise.all([
    getProfileView(viewer, viewer.id),
    getMyPendingTransfer(viewer),
    listMyTransferHistory(viewer),
    listTransfersToApprove(viewer),
    getDepartmentTree(),
  ]);

  // 로그인한 사람의 프로필이 없을 수는 없다 — session.ts 가 profile 행이 없는
  // 계정을 애초에 들여보내지 않는다. 그래도 타입은 null 을 말하므로 여기서
  // 끊는다. 화면이 절반만 그려지는 것보다 낫다.
  if (!view) throw new Error("내 프로필을 읽지 못했습니다.");

  // 남고 갈 업무 수는 신청 한 건마다 따로 묻는다. 승인함에 여러 건이 있으면
  // 그만큼 왕복이 늘지만, 한 사람이 한 번에 결정할 신청은 많아야 몇 건이다.
  const inboxWithImpact = await Promise.all(
    inbox.map(async (request) => ({
      request,
      impact: await getTransferImpact(request.id),
    })),
  );

  return (
    <PageContainer width="form" className="flex flex-col gap-6">
      <ActionFeedback msg={sp.msg} />

      <IdentityCard view={view} />

      {/* 0023 이 아직 안 돌아간 프로젝트. 화면을 500 으로 죽이는 대신 어디까지
          되는지 적는다 — 위 신원 카드는 그대로 나오고, 아래 둘만 물러난다. */}
      {view.pendingMigration ? (
        <Notice tone="warning" title="연락처와 부서 이동은 아직 준비되지 않았습니다">
          이 기능에 필요한 데이터베이스 변경(0023)이 아직 적용되지 않았습니다.
          운영자가 <code>supabase/migrations/0023_profile_transfer.sql</code> 을 한 번
          실행하면 이 자리에 연락처 수정과 부서 이동 신청이 나타납니다. 그때까지
          나머지 화면은 그대로 동작합니다.
        </Notice>
      ) : (
        <>
          <TransferInbox items={inboxWithImpact} />

          {canMutate ? <ContactForm view={view} /> : null}

          <TransferSection
            viewer={viewer}
            pending={pending}
            history={history}
            tree={tree}
            canRequest={canMutate}
          />
        </>
      )}
    </PageContainer>
  );
}
