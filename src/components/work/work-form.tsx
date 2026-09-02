import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { listWorks } from "@/lib/data";
import type { Profile } from "@/lib/types";

/**
 * 업무를 적는 폼. 만들 때와 고칠 때가 같은 폼을 쓴다.
 *
 * 화면 둘이 각자 폼을 갖고 있으면 반드시 어긋난다. 한쪽에만 글자수 제한이 붙고,
 * 한쪽에만 라벨이 바뀌고, 어느 순간 두 화면이 서로 다른 말을 한다.
 * 그래서 다른 것은 값(defaultValues)과 보낼 곳(action)뿐이고 나머지는 여기 한 벌만 둔다.
 *
 * 만들 때만 있는 칸(공개 범위)은 mode로 가르지 않고 children으로 받는다.
 * 폼이 자기가 어느 화면에 놓였는지 아는 것보다, 화면이 자기에게 필요한 칸을
 * 끼워 넣는 편이 낫다. 갈래가 하나 늘 때마다 폼 안이 아니라 바깥이 늘어난다.
 *
 * 후보 목록을 이 컴포넌트가 직접 가져온다. 두 화면이 같은 질의를 각자 복사해 두면
 * 한쪽만 고쳐지는 날이 온다. (PreviousYearCallout도 같은 방식이다)
 */

export type PreviousYearOption = {
  id: string;
  title: string;
  fiscalYear: number;
  archived: boolean;
};

export type WorkFormValues = {
  /** 수정일 때만 있다. 있으면 workId를 함께 실어 보낸다. */
  id?: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  previousYearWorkId?: string | null;
};

/**
 * 「작년 이맘때」 후보.
 *
 * 보관된 업무까지 가져오는 이유가 있다. 작년 판은 대개 이미 보관되어 있어서,
 * 보관된 것을 빼면 정작 가장 필요한 업무가 목록에 없다.
 * 볼 수 있는 범위는 listWorks가 RLS 그대로 걸러 준다.
 */
async function loadCandidates(
  viewer: Profile,
  excludeId: string | undefined,
): Promise<PreviousYearOption[]> {
  const [open, archived] = await Promise.all([
    listWorks(viewer),
    listWorks(viewer, { archived: true }),
  ]);

  return [
    ...open.map((w) => ({ w, archived: false })),
    ...archived.map((w) => ({ w, archived: true })),
  ]
    .filter(({ w }) => w.id !== excludeId)
    .map(({ w, archived: isArchived }) => ({
      id: w.id,
      title: w.title,
      fiscalYear: w.fiscal_year,
      archived: isArchived,
    }));
}

/** 연도별로 묶는다. 찾는 사람은 "작년 것"을 찾지 제목을 훑지 않는다. */
function groupByYear(options: PreviousYearOption[]) {
  const byYear = new Map<number, PreviousYearOption[]>();
  for (const o of options) {
    const bucket = byYear.get(o.fiscalYear);
    if (bucket) bucket.push(o);
    else byYear.set(o.fiscalYear, [o]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({
      year,
      items: items.sort((a, b) => a.title.localeCompare(b.title, "ko")),
    }));
}

export async function WorkForm({
  viewer,
  action,
  defaultValues,
  departmentName,
  departmentNote,
  submitLabel,
  cancelHref,
  children,
}: {
  viewer: Profile;
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: WorkFormValues;
  /** 이 업무의 소관 부서. 고를 수 없고 보여 주기만 한다. */
  departmentName: string;
  /** 왜 고를 수 없는지 한 줄. 만들 때와 고칠 때 이유가 다르다. */
  departmentNote: ReactNode;
  submitLabel: string;
  cancelHref: string;
  /** 이 화면에만 있는 칸이 들어가는 자리. 설명과 마감일 사이에 놓인다. */
  children?: ReactNode;
}) {
  const groups = groupByYear(await loadCandidates(viewer, defaultValues?.id));

  return (
    <form action={action} className="flex flex-col gap-5">
      {defaultValues?.id ? (
        <input type="hidden" name="workId" value={defaultValues.id} />
      ) : null}

      {/* 소관 부서 — 입력 칸이 아니라 사실 고지다. 고를 수 없는 칸을 보여 주지 않는다. */}
      <div className="rounded-sm border border-rule-frame bg-gray-5 px-4 py-3">
        <p className="flex items-center gap-2 text-body-sm font-bold text-gray-90">
          <Building2 aria-hidden className="size-4 text-gray-40" />
          소관 부서: {departmentName}
        </p>
        <p className="mt-1 text-body-xs leading-relaxed break-keep text-gray-60">
          {departmentNote}
        </p>
      </div>

      {/* maxLength는 src/lib/actions/works.ts의 상한과 같은 수여야 한다.
          여기서 막지 못하면 서버가 되돌려 보내고, 그때 사용자가 적던 글이 사라진다.
          ("use server" 파일은 상수를 내보낼 수 없어 수를 함께 두지 못한다) */}
      <Field id="work-title" label="업무 제목" required>
        {(p) => (
          <Input
            {...p}
            name="title"
            /* required 는 공백 한 칸을 「채워진 값」으로 본다. 그러면 서버의
               title.trim().min(1) 에 걸려 되돌아오는데, 그 왕복에서 함께 적던
               내용이 통째로 사라진다. 같은 규칙을 브라우저에서 먼저 건다. */
            pattern=".*\S.*"
            title="공백만으로는 제목을 만들 수 없습니다"
            type="text"
            maxLength={200}
            defaultValue={defaultValues?.title ?? ""}
            placeholder="예) 2026년 자원순환 시설 개선사업"
            autoComplete="off"
          />
        )}
      </Field>

      <Field
        id="work-description"
        label="업무 설명"
        hint="한두 문단이면 됩니다. 자세한 것은 문서 탭에 씁니다."
      >
        {(p) => (
          <Textarea
            {...p}
            name="description"
            rows={5}
            maxLength={4000}
            defaultValue={defaultValues?.description ?? ""}
          />
        )}
      </Field>

      <Field
        id="work-due-date"
        label="마감일"
        hint="지나면 목록에서 「지연」으로 올라옵니다."
      >
        {(p) => (
          <Input
            {...p}
            name="dueDate"
            type="date"
            defaultValue={defaultValues?.dueDate ?? ""}
          />
        )}
      </Field>

      {children}

      <Field
        id="work-previous-year"
        label="작년 이맘때"
        hint="연결해 두면 작년 문서와 진행 내역을 이 화면에서 바로 엽니다."
      >
        {(p) => (
          <Select
            {...p}
            name="previousYearWorkId"
            defaultValue={defaultValues?.previousYearWorkId ?? ""}
          >
            <option value="">연결하지 않음</option>
            {groups.map((g) => (
              <optgroup key={g.year} label={`${g.year}년도`}>
                {g.items.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.archived ? `${o.title} (보관됨)` : o.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>

      <div className="flex flex-wrap gap-2 border-t border-rule-hair pt-5">
        <SubmitButton size="lg">{submitLabel}</SubmitButton>
        <ButtonLink href={cancelHref} variant="secondary" size="lg">
          취소
        </ButtonLink>
      </div>
    </form>
  );
}
