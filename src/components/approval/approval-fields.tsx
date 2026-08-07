import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  APPROVAL_BODY_MAX,
  APPROVAL_FORMS,
  APPROVAL_FORM_LABEL,
  APPROVAL_TITLE_MAX,
  RETENTION_YEARS,
  type Approval,
} from "@/lib/types";

/**
 * 결재 문서의 칸들 — 기안 화면과 초안 고치기 화면이 함께 쓴다.
 *
 * 두 화면이 서로 다른 칸을 그리면 「기안할 때는 있었는데 고칠 때는 없는 칸」이
 * 생기고, 그 칸은 영영 못 고친다.
 *
 * 보안 등급에 「비밀」이 없다. 비밀문서는 보안업무규정에 따른 별도 관리 체계를
 * 따르고, 그것을 흉내 내는 것이 이 제품이 할 수 있는 가장 위험한 거짓말이다.
 */
export function ApprovalFields({
  approval,
  defaultForm,
}: {
  /** 고치는 경우. 없으면 새로 만드는 것이다. */
  approval?: Pick<
    Approval,
    "form" | "title" | "body" | "retention" | "security"
  >;
  defaultForm?: Approval["form"];
}) {
  const form = approval?.form ?? defaultForm ?? "report";

  return (
    <>
      <Field
        id="approval-form"
        label="서식"
        required
        hint="네 가지 모두 별지 제2호서식(내부결재문서)입니다. 고른 서식이 문서번호에 들어갑니다."
      >
        {(p) => (
          <Select {...p} name="form" defaultValue={form}>
            {APPROVAL_FORMS.map((f) => (
              <option key={f} value={f}>
                {APPROVAL_FORM_LABEL[f]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id="approval-title" label="제목" required>
        {(p) => (
          <Input
            {...p}
            name="title"
            defaultValue={approval?.title ?? ""}
            maxLength={APPROVAL_TITLE_MAX}
            placeholder="예: 2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청"
            autoComplete="off"
          />
        )}
      </Field>

      <Field
        id="approval-body"
        label="본문"
        hint="번호를 매겨 적는 공문 관례를 그대로 쓰셔도 됩니다. 줄바꿈은 그대로 보입니다."
      >
        {(p) => (
          <Textarea
            {...p}
            name="body"
            rows={10}
            defaultValue={approval?.body ?? ""}
            maxLength={APPROVAL_BODY_MAX}
            placeholder={"1. 관련: \n2. \n3. "}
          />
        )}
      </Field>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Field
          id="approval-retention"
          label="보존연한"
          className="sm:w-48"
          hint="「공공기록물 관리에 관한 법률 시행령」 제26조"
        >
          {(p) => (
            <Select
              {...p}
              name="retention"
              defaultValue={String(approval?.retention ?? "")}
            >
              <option value="">정하지 않음</option>
              {RETENTION_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          id="approval-security"
          label="공개 구분"
          className="sm:w-48"
          hint="「비밀」은 이 시스템에 담지 않습니다."
        >
          {(p) => (
            <Select
              {...p}
              name="security"
              defaultValue={approval?.security ?? "normal"}
            >
              <option value="normal">일반</option>
              <option value="confidential">대외비</option>
            </Select>
          )}
        </Field>
      </div>
    </>
  );
}
