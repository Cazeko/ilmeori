/**
 * 로그인 뒤 돌아갈 곳을 정한다.
 *
 * 넘어온 next 값을 그대로 믿고 리다이렉트하면 오픈 리다이렉트가 된다.
 * "//evil.example.com"은 브라우저가 프로토콜 상대 URL로 읽어 외부로 나가고,
 * "/\evil.example.com"도 일부 브라우저가 같은 식으로 읽는다.
 * 그래서 슬래시 하나로 시작하고 두 개는 아닌, 우리 앱 안의 경로만 통과시킨다.
 *
 * 판정 규칙은 한 곳에만 둔다. 로그인 화면(안내 문구를 띄울지 결정)과
 * 로그인 동작(실제로 이동할 곳을 결정)이 서로 다른 기준을 쓰면,
 * 화면이 "돌아갑니다"라고 말해 놓고 다른 데로 가는 상황이 생긴다.
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";

  // 검사하는 문자열과 브라우저가 읽는 문자열이 **같아야 한다.**
  //
  // URL 파서는 값을 해석하기 전에 탭·개행·복귀를 통째로 지운다(WHATWG URL 1단계).
  // 그래서 지우기 전 문자열로 판정하면 "/%09/evil.example.com" 이 통과한다 —
  // 슬래시 하나로 시작하고 두 개는 아니니까. 그런데 Location 헤더에 그대로 실려
  // 나가면 브라우저가 탭을 지워 "//evil.example.com" 으로 읽고, 그건 프로토콜
  // 상대 URL이라 밖으로 나간다. 검사만 통과시키고 이동은 다른 곳으로 하는 셈이다.
  //
  // 지운 뒤의 문자열로 판정하고, 판정한 그 문자열을 돌려준다.
  const value = raw.replace(/[\t\n\r]/g, "");

  // 남은 제어문자는 Location 헤더에 실을 수 없다(Node가 ERR_INVALID_CHAR로 던진다).
  // 오류 화면을 띄우느니 홈으로 보낸다.
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}
