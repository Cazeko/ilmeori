import { Eye, Repeat } from "lucide-react";
import { leaveDemo } from "@/app/login/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { isSupabaseConfigured } from "@/lib/env";
import { whyVisible } from "@/lib/visibility";
import type { MemberRole, Profile, WorkListItem } from "@/lib/types";

/**
 * 「이 업무가 보이는 이유」.
 *
 * 접근제어는 이 제품이 가장 많이 공들인 곳인데, 화면에서는 아무것도 보이지 않는다.
 * 잘 막혀 있다는 것은 아무 일도 일어나지 않는다는 뜻이라서 그렇다.
 * 그래서 눈앞의 업무 하나를 두고 규칙을 말로 적고, **그 자리에서 시험할 수단**을 붙였다.
 *
 * 「이 주소를 다른 계정으로 열어 보기」는 세션을 끊고 계정 선택 화면으로 보낸 뒤
 * 같은 주소로 되돌려 놓는다. 볼 수 없는 계정을 고르면 404가 나온다.
 * 그 404가 이 제품의 주장이다.
 *
 * details로 접어 두는 이유: 매일 쓰는 사람에게는 필요 없는 설명이고,
 * 처음 열어 본 사람에게는 가장 궁금한 것이다. 접힌 한 줄이 둘을 모두 만족시킨다.
 * (스크립트 없이 열린다. 이 화면 전체가 그렇다)
 */
export function VisibilityReason({
  work,
  viewer,
  role,
}: {
  work: WorkListItem;
  viewer: Profile;
  role: MemberRole | null;
}) {
  const reason = whyVisible(work, viewer, role);

  return (
    <details className="mt-5 rounded-sm border border-rule-frame bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-body-sm text-gray-70 hover:text-gray-90">
        <Eye aria-hidden className="size-4 shrink-0 text-gray-40" />
        <span className="break-keep">
          <span className="font-bold">이 업무가 보이는 이유</span> —{" "}
          {reason.short}
        </span>
      </summary>

      <div className="border-t border-rule-hair px-4 py-4">
        <p className="text-body-sm leading-relaxed break-keep text-gray-70">
          {reason.long}
        </p>
        <p className="mt-2 text-body-sm leading-relaxed break-keep text-gray-70">
          {reason.scope}
        </p>
        {/* 목업 모드에서는 Supabase에 연결조차 되어 있지 않다. 그때도 「DB가 막는다」고
            적으면 화면이 거짓말을 한다 — 같은 규칙을 mock.ts가 흉내 내고 있을 뿐이다. */}
        <p className="mt-2 text-body-sm leading-relaxed break-keep text-gray-60">
          {isSupabaseConfigured ? (
            <>
              이 판단을 화면이 하지 않습니다. 목록에 없는 업무는 화면이 감춘 것이
              아니라{" "}
              <strong className="font-bold text-gray-80">
                DB가 내어 주지 않은 것
              </strong>
              입니다. 서버를 우회해 직접 질의해도 결과는 같습니다.
            </>
          ) : (
            <>
              지금은 DB 없이 도는 <strong className="font-bold text-gray-80">시연
              모드</strong>라, 서버가 같은 규칙을 흉내 내고 있습니다. 데이터베이스에
              연결하면 이 판단을 화면도 서버도 아닌 DB의 행 수준 보안(RLS)이 하고,
              서버를 우회해 직접 질의해도 결과가 같아집니다.
            </>
          )}
        </p>

        {/* 직접 확인해 보게 한다. 말로만 하는 접근제어는 확인할 수 없다. */}
        <form action={leaveDemo} className="mt-4">
          <input type="hidden" name="next" value={`/works/${work.id}`} />
          <SubmitButton variant="secondary" size="sm">
            <Repeat aria-hidden className="size-4" />이 주소를 다른 계정으로 열어
            보기
          </SubmitButton>
        </form>
        <p className="mt-2 text-body-xs leading-relaxed break-keep text-gray-60">
          {reason.deniable ? (
            <>
              지금 계정에서 나가 계정 선택 화면으로 갑니다. 계정을 고르면 이
              주소로 다시 옵니다.{" "}
              <strong className="font-bold text-gray-80">
                볼 수 없는 계정으로 오면 「없습니다」라고 답합니다.
              </strong>{" "}
              권한이 없다고 말하지 않습니다 — 그렇게 답하는 순간 「그런 업무가
              있다」는 사실이 새어 나가기 때문입니다.
            </>
          ) : (
            <>
              지금 계정에서 나가 계정 선택 화면으로 갑니다. 계정을 고르면 이
              주소로 다시 옵니다. 이 업무는 전체 공개라{" "}
              <strong className="font-bold text-gray-80">
                어느 계정으로 와도 보입니다.
              </strong>{" "}
              가려지는 것을 보시려면 공개 범위가 좁은 업무에서 눌러 보십시오.
            </>
          )}
        </p>
      </div>
    </details>
  );
}
