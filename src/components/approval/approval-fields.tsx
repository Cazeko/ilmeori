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
        hint="네 가지 모두 별지 제2호서식이며, 고른 서식이 문서번호에 들어갑니다."
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
            /* required 는 공백 한 칸을 「채워진 값」으로 본다. 그러면 서버의
               title.trim().min(1) 에 걸려 되돌아오는데, 그 왕복에서 함께 적던
               내용이 통째로 사라진다. 같은 규칙을 브라우저에서 먼저 건다. */
            pattern=".*\S.*"
            title="공백만으로는 제목을 만들 수 없습니다"
            defaultValue={approval?.title ?? ""}
            maxLength={APPROVAL_TITLE_MAX}
            placeholder="예: 2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청"
            autoComplete="off"
          />
        )}
      </Field>

      <Field id="approval-body" label="본문">
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

      {/* ── 두 칸을 같은 줄에 세운다 ──────────────────────────────────────
          Field 는 라벨 → 설명 → 입력칸 순으로 쌓는다. 그런데 두 칸의 설명
          길이가 달라서 192px 안에서 한쪽은 두 줄, 한쪽은 한 줄이 되고,
          그만큼 아래의 <select> 가 서로 어긋난 높이에 섰다.
          (items-start 는 **위**를 맞추므로 이 어긋남을 못 고친다. 위가 맞을수록
           설명 줄 수 차이가 그대로 입력칸 위치 차이가 된다)

          subgrid 로 푼다. 바깥이 세 줄(라벨·설명·입력칸)을 정하고, 각 Field 가
          그 줄을 그대로 물려받는다. 그러면 설명이 몇 줄이 되든 **같은 줄에 있는
          것끼리** 높이를 맞추므로 라벨도 입력칸도 나란히 선다.
          좁은 화면(sm 미만)에서는 두 칸이 위아래로 서니 맞출 것이 없다. */}
      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[12rem_12rem] sm:grid-rows-[auto_auto_auto] sm:gap-x-4">
        <Field
          id="approval-retention"
          label="보존연한"
          className="sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-y-2"
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
          className="sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-y-2"
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
