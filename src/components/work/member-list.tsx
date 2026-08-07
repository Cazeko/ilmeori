import {
  Crown,
  Eye,
  Globe,
  Lock,
  PenLine,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import {
  addMember,
  changeLead,
  changeMemberRole,
  changeVisibility,
  removeMember,
} from "@/lib/actions/members";
import {
  ROLE_LABEL,
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  type MemberRole,
  type MemberWithProfile,
  type Profile,
  type ProfileWithDepartment,
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
 *
 * ── 소유자에게만 조작 수단을 그리는 이유 ───────────────────────────────────
 *
 * 감추는 것이 막는 것은 아니다. 막는 일은 서버 액션과 DB 정책이 한다.
 * 여기서 감추는 이유는 눌리지 않는 버튼을 보여 주지 않기 위해서다.
 * 반대로, 소유자가 아니어도 이 화면은 그대로 다 읽힌다. 누가 볼 수 있는지는
 * 권한과 무관하게 참여자 모두가 알아야 하는 사실이다.
 *
 * ── 폼이 여럿인 이유 ───────────────────────────────────────────────────────
 *
 * 참여자 한 줄마다 폼이 둘(권한 변경·제외)이다. 폼은 중첩할 수 없고,
 * 자바스크립트 없이 동작해야 하므로 한 줄에서 두 가지 일을 하려면 폼도 둘이어야 한다.
 * 같은 글자의 버튼이 줄 수만큼 반복되므로 aria-label에 대상 이름을 넣는다.
 * 화면을 보지 않는 사람에게 "변경"이 열 개 늘어선 것은 아무 정보가 아니다.
 */

const ROLES: MemberRole[] = ["owner", "editor", "viewer"];
const VISIBILITIES: WorkVisibility[] = ["private", "department", "city"];

const NO_DEPARTMENT = "소속 없음";

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

/** 부서 공개는 어느 부서인지까지 말해야 뜻이 통한다. */
function visibilityOption(v: WorkVisibility, departmentName: string) {
  return v === "department"
    ? `${VISIBILITY_LABEL[v]} (${departmentName})`
    : VISIBILITY_LABEL[v];
}

function personOption(p: ProfileWithDepartment) {
  return p.position ? `${p.name} ${p.position}` : p.name;
}

/**
 * 부를 수 있는 사람을 부서별로 묶는다.
 * 전 직원이 한 줄로 늘어선 목록에서는 찾으려는 사람을 찾지 못한다.
 * 소속이 비어 있는 계정은 맨 뒤로 보낸다 — 대개 데이터가 덜 채워진 계정이다.
 */
function groupByDepartment(people: ProfileWithDepartment[]) {
  const groups = new Map<string, ProfileWithDepartment[]>();
  for (const p of people) {
    const key = p.department_name ?? NO_DEPARTMENT;
    const bucket = groups.get(key);
    if (bucket) bucket.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === NO_DEPARTMENT ? 1 : b === NO_DEPARTMENT ? -1 : a.localeCompare(b, "ko"),
  );
}

export function MemberList({
  workId,
  members,
  visibility,
  departmentName,
  viewer,
  leadId,
  canManage,
  candidates,
}: {
  workId: string;
  members: MemberWithProfile[];
  visibility: WorkVisibility;
  departmentName: string;
  viewer: Profile;
  /**
   * 주담당(work.owner_id). 소유 권한과는 다른 것이다 — 권한은 여럿이 갖고
   * 주담당은 한 사람이다. 이 사람은 빼거나 낮출 수 없고 넘길 수만 있다.
   */
  leadId: string;
  /** 소유자인가. 조작 수단을 그릴지만 정한다. 실제로 막는 것은 서버와 DB다. */
  canManage: boolean;
  /** 부를 수 있는 전 직원. 이미 참여 중인 사람은 여기서 걸러 낸다. */
  candidates: ProfileWithDepartment[];
}) {
  const VisIcon = VIS_ICON[visibility];

  const joined = new Set(members.map((m) => m.profile_id));
  const groups = canManage
    ? groupByDepartment(candidates.filter((p) => !joined.has(p.id)))
    : [];
  const addableCount = groups.reduce((n, [, people]) => n + people.length, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* ── 공개 범위 ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="visibility-heading">
        <h2 id="visibility-heading" className="mb-2.5 text-h4 font-bold text-gray-90">
          공개 범위
        </h2>
        <div className="flex items-start gap-3 rounded-md border border-gray-10 bg-surface px-4 py-3.5">
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

        {canManage ? (
          <form
            action={changeVisibility}
            className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-gray-10 bg-surface px-4 py-3.5"
          >
            <input type="hidden" name="workId" value={workId} />
            <Field
              id="work-visibility"
              label="공개 범위 바꾸기"
              className="min-w-56 flex-1"
              // 고르기 전에 세 범위가 각각 무슨 뜻인지 다 보여야 한다.
              // 스크립트가 없으므로 고른 뒤에 설명이 바뀌는 방식은 쓸 수 없다.
              hint={VISIBILITIES.map(
                (v) => `${VISIBILITY_LABEL[v]}: ${VISIBILITY_HINT[v]}`,
              ).join(" ")}
            >
              {(field) => (
                <Select {...field} name="visibility" defaultValue={visibility}>
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {visibilityOption(v, departmentName)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" variant="secondary">
              바꾸기
            </Button>
          </form>
        ) : null}
      </section>

      {/* ── 참여자 ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-2.5 text-h4 font-bold text-gray-90">
          참여자 {members.length}명
        </h2>
        <ul className="divide-y divide-gray-5 rounded-md border border-gray-10 bg-surface">
          {members.map((m) => {
            const style = ROLE_STYLE[m.role];
            const RoleIcon = style.icon;
            const isMe = m.profile_id === viewer.id;
            return (
              <li key={m.profile_id} className="px-4 py-3">
                <div className="flex items-center gap-3">
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
                      {m.profile_id === leadId ? (
                        <span className="ml-2 rounded-xs bg-gray-90 px-1.5 py-0.5 text-[11px] font-bold text-white">
                          주담당
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-body-xs text-gray-60">
                      {m.profile.department_name ?? NO_DEPARTMENT}
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
                </div>

                {canManage ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-5 pt-3">
                    <form
                      action={changeMemberRole}
                      className="flex flex-1 flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="workId" value={workId} />
                      <input
                        type="hidden"
                        name="profileId"
                        value={m.profile_id}
                      />
                      <Field
                        // 한 화면에 같은 폼이 참여자 수만큼 놓인다. id가 겹치면
                        // 라벨이 전부 첫 줄의 입력을 가리킨다.
                        id={`member-role-${m.profile_id}`}
                        label="권한"
                        className="min-w-32 flex-1"
                      >
                        {(field) => (
                          <Select
                            {...field}
                            name="role"
                            defaultValue={m.role}
                            aria-label={`${m.profile.name} 권한`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Button
                        type="submit"
                        variant="secondary"
                        aria-label={`${m.profile.name} 권한 변경`}
                      >
                        변경
                      </Button>
                    </form>

                    {/* 주담당은 빼거나 낮출 수 없다. 넘길 수만 있다.
                        work.owner_id 가 참여자 목록과 어긋나면 업무 머리에
                        이 업무를 볼 수도 없는 사람이 「주담당」으로 찍힌다. */}
                    {m.profile_id === leadId ? null : m.role === "owner" ? (
                      <form action={changeLead}>
                        <input type="hidden" name="workId" value={workId} />
                        <input
                          type="hidden"
                          name="profileId"
                          value={m.profile_id}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          aria-label={`${m.profile.name}에게 주담당 넘기기`}
                        >
                          <Crown aria-hidden className="size-4" />
                          주담당 넘기기
                        </Button>
                      </form>
                    ) : null}

                    {m.profile_id === leadId ? null : (
                      <form action={removeMember}>
                        <input type="hidden" name="workId" value={workId} />
                        <input
                          type="hidden"
                          name="profileId"
                          value={m.profile_id}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          aria-label={`${m.profile.name} 참여 제외`}
                        >
                          <UserMinus aria-hidden className="size-4" />
                          제외
                        </Button>
                      </form>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canManage ? (
          <p className="mt-2 text-body-xs leading-relaxed break-keep text-gray-60">
            마지막 소유자는 제외하거나 강등할 수 없습니다. 주인 없는 업무는 아무도
            참여자를 되돌릴 수 없기 때문입니다. 물러나려면 다른 사람을 먼저 소유로
            지정해 주세요.
            <br />
            주담당은 이 업무의 책임자 한 사람입니다. 소유 권한과 달리 여럿일 수
            없으므로 제외·강등 대신 넘기기만 할 수 있고, 소유 권한을 가진 참여자만
            받을 수 있습니다.
          </p>
        ) : null}
      </section>

      {/* ── 참여자 추가 ──────────────────────────────────────────────────── */}
      {canManage ? (
        <section aria-labelledby="add-member-heading">
          <h2
            id="add-member-heading"
            className="mb-2.5 text-h4 font-bold text-gray-90"
          >
            참여자 추가
          </h2>
          {addableCount > 0 ? (
            <form
              action={addMember}
              className="flex flex-wrap items-end gap-2 rounded-md border border-gray-10 bg-surface px-4 py-3.5"
            >
              <input type="hidden" name="workId" value={workId} />
              <Field
                id="add-member-profile"
                label="직원"
                required
                className="min-w-56 flex-1"
                hint="다른 과 직원도 부를 수 있습니다. 부서를 넘는 협업은 이 목록으로 이뤄집니다."
              >
                {(field) => (
                  <Select {...field} name="profileId" defaultValue="">
                    <option value="">직원을 고르세요</option>
                    {groups.map(([department, people]) => (
                      <optgroup key={department} label={department}>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {personOption(p)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="add-member-role" label="권한" className="w-32">
                {(field) => (
                  // 기본값은 열람이다. 권한은 나중에 올리는 편이 내리는 편보다 쉽다.
                  <Select {...field} name="role" defaultValue="viewer">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button type="submit">
                <UserPlus aria-hidden className="size-4" />
                추가
              </Button>
            </form>
          ) : (
            <p className="rounded-md border border-gray-10 bg-surface px-4 py-6 text-center text-body-sm break-keep text-gray-60">
              더 부를 사람이 없습니다. 조회할 수 있는 직원이 모두 참여하고 있습니다.
            </p>
          )}
        </section>
      ) : null}

      {/* ── 권한이 무슨 뜻인지 ────────────────────────────────────────────── */}
      <section aria-labelledby="role-guide-heading">
        <h2
          id="role-guide-heading"
          className="mb-2.5 text-h4 font-bold text-gray-90"
        >
          권한이 뜻하는 것
        </h2>
        <dl className="divide-y divide-gray-5 rounded-md border border-gray-10 bg-surface">
          {ROLES.map((role) => {
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
