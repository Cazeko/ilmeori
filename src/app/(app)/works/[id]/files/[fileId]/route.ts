import { NextResponse, type NextRequest } from "next/server";
import { withFeedback } from "@/lib/actions/feedback";
import { getAttachment, logAccess } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { requireViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * 첨부파일 내려받기.
 *
 * ── 왜 폼이 아니라 링크인가 ───────────────────────────────────────────────
 *
 * CSP에 form-action 'self' 가 걸려 있다(src/proxy.ts). 폼을 제출한 뒤 바깥 출처로
 * 리다이렉트하면 크롬은 그 이동까지 form-action 으로 판정해 막는다. 파일 본문은
 * Supabase Storage에서 나오므로 마지막 이동은 반드시 바깥 출처로 간다.
 * 링크 이동에는 form-action 이 걸리지 않는다. 그래서 내려받기는 <a>이고, 여기가 그 목적지다.
 *
 * ── 왜 guard.ts 를 쓰지 않는가 ────────────────────────────────────────────
 *
 * guard.openWork 는 실패하면 화면으로 되돌려 보내는 것을 전제로 만든 문이다.
 * 서버 액션에는 맞지만 여기서는 맞지 않는다. 이 핸들러는 성공해도 리다이렉트로 끝나므로,
 * 실패를 또 다른 리다이렉트로 알리면 "받아졌는지 못 받았는지"가 주소로만 구분된다.
 * 그래서 여기서는 requireViewer + getAttachment + createClient 를 직접 쓴다.
 *
 * 권한 판정은 getAttachment 하나로 끝난다. attachment_select 정책이 can_read_work 이므로
 * 볼 수 없는 업무의 첨부는 RLS가 애초에 돌려주지 않는다. 없는 것과 못 보는 것을
 * 여기서 구분하지 않고 둘 다 404로 답하는 이유도 같다 — 구분하는 순간
 * "그 파일은 있다"는 사실이 새어 나간다.
 */

const BUCKET = "work-files";

/**
 * 서명 링크의 유효기간. 60초는 사람이 파일 하나를 받기에는 충분하고,
 * 그 링크가 메신저로 전달되어 다른 사람 손에 들어가기에는 부족한 길이다.
 * 서명 링크에는 세션이 실리지 않아서, 한번 새면 그 자체로 파일 열쇠가 된다.
 */
const SIGNED_URL_SECONDS = 60;

function notFound() {
  return new NextResponse("첨부파일을 찾을 수 없습니다.", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  await requireViewer();

  // Next 16에서 라우트 핸들러의 params 는 Promise 다.
  const { id, fileId } = await params;

  const attachment = await getAttachment(fileId);
  // 주소의 업무 id와 첨부의 업무 id가 어긋나면 거절한다. 권한은 어차피 RLS가 보지만,
  // 주소가 가리키는 것과 내려가는 것이 다르면 열람기록이 엉뚱한 업무에 남는다.
  if (!attachment || attachment.work_id !== id) return notFound();

  // 데모 모드에는 저장소도 파일도 없다. 목록에 보이는 첨부는 목업 메타데이터뿐이다.
  // 404로 끊으면 사용자는 막다른 화면을 보게 되므로 업무 화면으로 되돌려 보내며 알린다.
  if (!isSupabaseConfigured) {
    return NextResponse.redirect(
      new URL(withFeedback(`/works/${id}`, "file.unavailable"), request.url),
      { status: 302 },
    );
  }

  // 받아 간 사실을 먼저 남긴다. 링크 발급이 실패하더라도 "받으려 했다"는 기록은 남아야 한다.
  // 이 표에는 사용자에게 INSERT 권한이 없고, 서버의 지정된 함수만 기록할 수 있다.
  await logAccess(attachment.work_id, "attachment.downloaded");

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, SIGNED_URL_SECONDS, {
      // 저장소의 키는 uuid다. 원래 이름은 여기서 되돌려 준다.
      download: attachment.file_name,
    });
  if (error || !data) return notFound();

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: {
      // 서명 링크가 실린 응답은 어디에도 남으면 안 된다.
      // 프록시나 브라우저가 이 302를 캐시하면 만료된 링크로 계속 되돌려 보내고,
      // 더 나쁘게는 다른 사람의 요청에 남의 링크가 실린다.
      "Cache-Control": "no-store",
    },
  });
}
