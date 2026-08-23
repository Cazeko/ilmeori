import { FileQuestion, Repeat } from "lucide-react";
import { leaveDemo } from "@/app/login/actions";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardBody } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * 업무 하나를 열 수 없을 때.
 *
 * ─ 왜 not-found.tsx 가 아닌가 ──────────────────────────────────────────────
 * Next의 notFound()는 이 앱에서 **자바스크립트 없이는 빈 화면**이 된다.
 * 상위 레이아웃이 먼저 흘러 나간 뒤에 notFound가 던져지므로, Next는 본문을
 * HTML로 그리지 못하고 RSC 페이로드에만 실어 보낸다. 브라우저가 그것을 꺼내
 * 붙이려면 스크립트가 필요하다. 실제로 확인했다 — 응답은 404인데 <body>가 비어
 * 있고, 본문 문자열은 __next_f 스크립트 안에만 있다.
 *
 * 이 제품은 스크립트를 끈 브라우저에서 전부 도는 것을 전제로 만들었다.
 * 그래서 화면을 페이지가 직접 그린다. 대신 응답 코드가 200이 된다.
 * 둘 중에는 이쪽이 낫다고 봤다 — 없는 업무를 물었을 때 사람이 읽을 답을 주는
 * 것이, 사람에게는 빈 화면이고 기계에게만 정확한 404를 주는 것보다 낫다.
 * 게다가 이 주소는 사람이 눈으로 여는 화면이지 기계가 부르는 API가 아니다.
 *
 * ─ 왜 「권한 없음」이라고 하지 않는가 ─────────────────────────────────────
 * 없는 업무와 못 보는 업무를 **구분해 답하지 않는다.** 구분하는 순간
 * "그런 업무가 있다"는 사실이 새어 나간다. 업무 제목 하나로 알 수 있는 것이
 * 있고(어느 부서에 무슨 감사가 걸려 있는지 같은 것), 공문서를 다루는
 * 시스템에서는 존재 여부 자체가 지켜야 할 정보다.
 *
 * 이 판단을 화면이 하는 것도 아니다. RLS가 행을 내어 주지 않아 조회 결과가
 * 0행이고, 서버는 둘을 구분할 방법 자체가 없다.
 * (supabase/migrations/0002_rls.sql — app.can_read_work)
 */
export function WorkNotFound({
  path,
  mode = "unknown",
}: {
  /** 방금 막힌 그 주소. 「다른 계정으로 다시 열기」가 여기로 돌아온다. */
  path: string;
  /**
   * unknown      없거나 보이지 않는다 (둘을 구분하지 않는다)
   * not-editable 볼 수는 있지만 고칠 권한이 없다.
   *              이 경우엔 존재를 이미 알고 있으므로 감출 것이 없다.
   */
  mode?: "unknown" | "not-editable";
}) {
  const editable = mode === "not-editable";

  return (
    <PageContainer>
      <PageHeader
        title={editable ? "고칠 수 없는 업무입니다" : "업무를 찾을 수 없습니다"}
      />

      <Card className="max-w-2xl">
        <CardBody className="py-8">
          <FileQuestion aria-hidden className="size-9 text-gray-30" />

          {editable ? (
            <>
              <p className="mt-4 text-body leading-relaxed break-keep text-gray-80">
                이 업무를 <strong className="font-bold">볼 수는 있지만</strong>{" "}
                고칠 권한이 없습니다. 참여자 권한이 「열람」이거나, 참여자가
                아니고 공개 범위로만 보고 있는 경우입니다.
              </p>
              <p className="mt-4 text-body-sm leading-relaxed break-keep text-gray-60">
                고쳐야 한다면 소유자에게 편집 권한을 요청하십시오. 누구인지는
                참여자·권한 탭에 있습니다.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-body leading-relaxed break-keep text-gray-80">
                이 주소의 업무가 <strong className="font-bold">없거나</strong>,
                지금 계정에{" "}
                <strong className="font-bold">보이지 않습니다.</strong> 이
                화면은 둘 중 어느 쪽인지 알려 주지 않습니다.
              </p>

              {/* 왜 둘을 구분해 주지 않는지는 이 화면에서 가장 자랑스러운
                  설계지만, 길을 잃은 사람 앞을 두 문단으로 막을 일은 아니다.
                  접어 두고, 궁금한 사람만 편다. */}
              <details className="mt-4">
                <summary className="cursor-pointer text-body-sm font-bold text-gray-70">
                  왜 어느 쪽인지 알려 주지 않나요
                </summary>
                <div className="mt-2 flex flex-col gap-3 text-body-sm leading-relaxed break-keep text-gray-60">
                  <p>
                    「권한이 없습니다」라고 답하면 그 업무가 존재한다는 사실을
                    알려 주는 셈이 됩니다. 업무 제목 하나로 알 수 있는 것이 있고(어느
                    부서에 무슨 감사가 걸려 있는지 같은 것), 공문서를
                    다루는 시스템에서는 존재 여부 자체가 지켜야 할 정보입니다.
                  </p>
                  {/* 목업 모드에서는 Supabase가 아예 없다. 그때도 RLS를 근거로 대면
                      화면이 거짓말을 한다. 같은 규칙을 mock.ts가 흉내 낼 뿐이다. */}
                  <p>
                    {isSupabaseConfigured ? (
                      <>
                        이 판단은 화면이 하지 않습니다. 데이터베이스의 행 수준
                        보안(RLS)이 애초에 행을 내어 주지 않아, 서버조차 둘을
                        구분할 방법이 없습니다. 서버를 우회해 직접 질의해도
                        결과는 같습니다.
                      </>
                    ) : (
                      <>
                        지금은 DB 없이 도는 시연 모드라, 서버가 같은 규칙을 흉내
                        내고 있습니다. 데이터베이스에 연결하면 이 판단을 행 수준
                        보안(RLS)이 하고, 서버조차 없는 것과 못 보는 것을 구분할
                        수 없게 됩니다.
                      </>
                    )}
                  </p>
                </div>
              </details>
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {/* 볼 수는 있는 업무라면 그리로 돌아갈 길을 먼저 준다. 여기까지 온
                사람은 그 업무를 열려던 것이지 보드로 가려던 것이 아니다. */}
            {editable ? (
              // path 는 방금 막힌 주소(…/edit)다. 그대로 걸면 여기로 되돌아온다.
              <ButtonLink
                href={path.replace(/\/edit$/, "")}
                variant="primary"
                size="sm"
              >
                이 업무 보기
              </ButtonLink>
            ) : null}
            <ButtonLink
              href="/works"
              variant={editable ? "secondary" : "primary"}
              size="sm"
            >
              업무 보드로
            </ButtonLink>
            {/* 방금 막힌 그 주소를 다른 계정으로 다시 열어 보게 한다.
                볼 수 있는 계정으로 들어가면 같은 주소가 그대로 열린다.
                막히는 것과 열리는 것을 한 번씩 보면 설명이 끝난다. */}
            <form action={leaveDemo}>
              <input type="hidden" name="next" value={path} />
              <SubmitButton variant="secondary" size="sm">
                <Repeat aria-hidden className="size-4" />
                다른 계정으로 이 주소 다시 열기
              </SubmitButton>
            </form>
          </div>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
