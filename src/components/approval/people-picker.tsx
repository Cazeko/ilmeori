import { Field, Select } from "@/components/ui/field";
import type { ProfileWithDepartment } from "@/lib/types";

/**
 * 사람 고르기 — 부서로 묶은 <select>.
 *
 * 참여자 추가(member-list.tsx)와 같은 문법이다. 직접 만든 자동완성 상자를 쓰지
 * 않는 이유도 같다 — 자바스크립트 없이 돌아야 하고, 브라우저 기본 select 가
 * 키보드·스크린리더·모바일에서 거의 언제나 더 낫다.
 *
 * 여럿 고르기(multiple)는 협조자 자리에 쓴다. 스크립트 없이 여럿을 고르는
 * 표준 수단이 이것뿐이다.
 */

const NO_DEPARTMENT = "소속 없음";

function groupByDepartment(people: readonly ProfileWithDepartment[]) {
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

export function PeoplePicker({
  id,
  name,
  label,
  hint,
  people,
  className,
  multiple = false,
  required = false,
  size,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  people: readonly ProfileWithDepartment[];
  className?: string;
  multiple?: boolean;
  required?: boolean;
  /** 여럿 고르기일 때 한 번에 보이는 줄 수 */
  size?: number;
}) {
  const groups = groupByDepartment(people);

  return (
    <Field id={id} label={label} hint={hint} required={required} className={className}>
      {(p) => (
        <Select
          {...p}
          name={name}
          multiple={multiple}
          size={size}
          // 여럿 고르기에는 빈 항목을 두지 않는다. 아무것도 안 고르면 그것이 곧 없음이다.
          defaultValue={multiple ? [] : ""}
          // min-h-32 를 주지 않는다. size(줄 수)가 정한 높이와 어긋나
          // 마지막 줄이 테두리에 반쯤 걸려 잘려 보였다. 높이는 줄 수가 정한다.
          className={multiple ? "h-auto py-1" : undefined}
        >
          {multiple ? null : <option value="">직원을 고르세요</option>}
          {groups.map(([department, members]) => (
            <optgroup key={department} label={department}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.position ?? ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      )}
    </Field>
  );
}
