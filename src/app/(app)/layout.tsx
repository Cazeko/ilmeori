import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getViewer, getViewerDepartmentName } from "@/lib/session";

/**
 * 로그인한 사람만 들어오는 영역.
 *
 * proxy에서 한 번 걸러지지만 여기서 다시 확인한다.
 * proxy는 우회될 수 있고, 우회되었을 때 빈 화면이 아니라 로그인으로 보내는 게 맞다.
 * (실제 데이터 접근제어는 이 둘이 아니라 DB의 RLS가 한다)
 *
 * 이 아래 화면은 전부 "지금 로그인한 사람"에 따라 내용이 달라진다.
 * 미리 만들어 둘 수 있는 화면이 하나도 없으므로 정적 생성을 끈다.
 * (끄지 않으면 빌드 때 쿠키 없는 상태로 그려 보려다 실패한다)
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: LayoutProps<"/">) {
  // 부서 이름은 신원 조회에 임베드로 얹혀 온다 — 질의가 따로 나가지 않는다.
  const [viewer, departmentName] = await Promise.all([
    getViewer(),
    getViewerDepartmentName(),
  ]);
  if (!viewer) redirect("/login");

  return (
    <AppShell viewer={viewer} departmentName={departmentName ?? "소속 없음"}>
      {children}
    </AppShell>
  );
}
