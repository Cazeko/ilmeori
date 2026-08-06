import { Eye, Globe, Lock, PenLine, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import {
  ROLE_LABEL,
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  type MemberRole,
  type MemberWithProfile,
  type Profile,
  type WorkVisibility,
} from "@/lib/types";

/**
 * 참여자와 권한.
 *
 * 이 화면이 하는 말은 "누가 이 업무를 볼 수 있는가"다.
 * 인수인계 감사에서 실제로 확인하는 것이 이것이고,
 * 정보 유출 사고에서 제일 먼저 묻는 것도 이것이다.
 *
 * 여기 표시된 권한은 설명이 아니라 실제로 DB가 강제하는 값이다.
 * 열람자로 표시된 사람은 화면을 우회해도 저장이 되지 않는다.
 */

const ROLE_STYLE: Record<MemberRole, { chip: string; icon: typeof Eye; desc: string }> =
  {
    owner: {
      chip: "bg-primary-5 text-primary",
      icon: ShieldCheck,
      desc: "업무를 만들고 참여자와 권한을 정합니다. 인계 대상이 되는 자리입니다.",
    },
    editor: {
      chip: "bg-status-doing-bg text-status-doing-text",
      icon: PenLine,
      desc: "문서와 상태를 고칠 수 있습니다.",
    },
    viewer: {
      chip: "bg-gray-5 text-gray-60",
      icon: Eye,
      desc: "문서와 상태는 고칠 수 없습니다. 고치려는 시도는 DB에서 막힙니다. 대화는 남길 수 있습니다.",
    },
  };

const VIS_ICON: Record<WorkVisibility, typeof Lock> = {
  private: Lock,
  department: Users,
  city: Globe,
};

export function MemberList({
  members,
  visibility,
  departmentName,
  viewer,
}: {
  members: MemberWithProfile[];
  visibility: WorkVisibility;
  departmentName: string;
  viewer: Profile;
}) {
  const VisIcon = VIS_ICON[visibility];

  return (
    <div className="flex flex-col gap-6">
      {/* ── 공개 범위 ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="visibility-heading">
        <h2 id="visibility-heading" className="mb-2.5 text-h4 font-bold text-gray-90">
          공개 범위
        </h2>
        <div className="flex items-start gap-3 rounded-md border border-gray-10 bg-white px-4 py-3.5">
          <VisIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-gray-40" />
          <div>
            <p className="text-body-sm font-bold text-gray-90">
              {VISIBILITY_LABEL[visibility]}
              {visibility === "department" ? (
                <span className="ml-1 font-normal text-gray-60">
                  ({departmentName})
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-body-sm break-keep text-gray-60">
              {VISIBILITY_HINT[visibility]}
            </p>
          </div>
        </div>
      </section>

      {/* ── 참여자 ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-2.5 text-h4 font-bold text-gray-90">
          참여자 {members.length}명
        </h2>
        <ul className="divide-y divide-gray-5 rounded-md border border-gray-10 bg-white">
          {members.map((m) => {
            const style = ROLE_STYLE[m.role];
            const RoleIcon = style.icon;
            const isMe = m.profile_id === viewer.id;
            return (
              <li key={m.profile_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar profile={m.profile} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-bold text-gray-90">
                    {m.profile.name}
                    <span className="ml-1 font-normal text-gray-60">
                      {m.profile.position}
                    </span>
                    {isMe ? (
                      <span className="ml-2 rounded-xs bg-primary-5 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                        나
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-body-xs text-gray-60">
                    {m.profile.department_name ?? "소속 없음"}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-xs px-2 py-1 text-body-xs font-bold",
                    style.chip,
                  )}
                >
                  <RoleIcon aria-hidden className="size-3.5" />
                  {ROLE_LABEL[m.role]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── 권한이 무슨 뜻인지 ────────────────────────────────────────────── */}
      <section aria-labelledby="role-guide-heading">
        <h2
          id="role-guide-heading"
          className="mb-2.5 text-h4 font-bold text-gray-90"
        >
          권한이 뜻하는 것
        </h2>
        <dl className="divide-y divide-gray-5 rounded-md border border-gray-10 bg-white">
          {(Object.keys(ROLE_STYLE) as MemberRole[]).map((role) => {
            const style = ROLE_STYLE[role];
            const RoleIcon = style.icon;
            return (
              <div key={role} className="flex gap-3 px-4 py-3">
                <dt className="shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xs px-2 py-1 text-body-xs font-bold",
                      style.chip,
                    )}
                  >
                    <RoleIcon aria-hidden className="size-3.5" />
                    {ROLE_LABEL[role]}
                  </span>
                </dt>
                <dd className="text-body-sm break-keep text-gray-60">
                  {style.desc}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
