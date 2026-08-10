import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionFeedback } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { WorkForm } from "@/components/work/work-form";
import { createWork } from "@/lib/actions/works";

import { canMutate } from "@/lib/env";
import { getViewerDepartmentName, requireViewer } from "@/lib/session";
import {
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  type WorkVisibility,
} from "@/lib/types";

export const metadata: Metadata = { title: "새 업무" };

/** 좁은 범위부터 넓은 범위 순. 고르는 사람이 "어디까지 여는가"로 읽게 한다. */
const VISIBILITIES: WorkVisibility[] = ["private", "department", "city"];

/**
 * 새 업무 만들기.
 *
 * 부서를 고르는 칸이 없다. DB의 work_insert 정책이 본인 소속 부서만 허용하기
 * 때문인데, 그것을 제약으로 숨기지 않고 화면에 그대로 적는다.
 * "이 업무의 소관이 어디인지는 만든 사람이 정하는 것이 아니라 조직도가 정한다"는
 * 것이 이 제품이 하려는 말이고, 그 말은 여기서 처음 보인다.
 */
export default async function NewWorkPage({
  searchParams,
}: PageProps<"/works/new">) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const departmentName = await getViewerDepartmentName();

  return (
    <PageContainer width="form">
      <nav aria-label="현재 위치" className="mb-4">
        <ol className="flex items-center gap-1 text-body-xs text-gray-60">
          <li>
            <Link href="/works" className="font-bold hover:text-primary">
              업무 보드
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="text-gray-70">새 업무</li>
        </ol>
      </nav>

      <PageHeader
        title="새 업무 만들기"
        /* 「만드는 순간 …」 세 문장을 지웠다. 만들기 전에 알아야 하는 말이
           아니라 만든 뒤에 저절로 보이는 일들이다. */
      />

      <ActionFeedback msg={sp.msg} className="mb-4" />

      {!canMutate ? (
        <Notice tone="info" title="지금은 읽기 전용입니다">
          화면과 동선은 그대로 볼 수 있습니다.
        </Notice>
      ) : !departmentName ? (
        <Notice tone="danger" title="소속 부서가 없어 업무를 만들 수 없습니다">
          계정에 소속 부서가 없으면 어느 부서의 일인지 정할 수 없습니다. 인사
          담당자에게 소속 등록을 요청해 주세요.
        </Notice>
      ) : (
        <Card>
          <CardHeader
            title="업무 정보"
            description="제목만 필수입니다."
          />
          <CardBody>
            <WorkForm
              viewer={viewer}
              action={createWork}
              departmentName={departmentName}
              departmentNote={`업무는 만든 사람의 소속 부서에 속합니다. ${departmentName} 외의 부서로는 만들 수 없으며, 다른 부서 사람과 함께 일하려면 만든 뒤 참여자로 추가합니다.`}
              submitLabel="업무 만들기"
              cancelHref="/works"
            >
              {/* 공개 범위는 만들 때만 이 화면에 있다. 만든 뒤에는 참여자와 함께
                  판단해야 하는 값이라 참여자·권한 화면으로 옮겨 간다. */}
              <Field
                id="work-visibility"
                label="공개 범위"
                required
                hint="참여자가 아닌 직원이 어디까지 볼 수 있는지를 정합니다."
              >
                {(p) => (
                  <Select {...p} name="visibility" defaultValue="department">
                    {VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {VISIBILITY_LABEL[v]} — {VISIBILITY_HINT[v]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </WorkForm>
          </CardBody>
        </Card>
      )}
    </PageContainer>
  );
}
