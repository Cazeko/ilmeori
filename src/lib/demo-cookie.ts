/**
 * 데모 세션 쿠키 이름.
 *
 * proxy와 서버 컴포넌트 양쪽이 쓴다. proxy에서는 next/headers를 쓸 수 없으므로
 * 세션 모듈을 통째로 import하지 않도록 이름만 따로 떼어 둔다.
 */
export const DEMO_COOKIE = "ilmeori.demo";
