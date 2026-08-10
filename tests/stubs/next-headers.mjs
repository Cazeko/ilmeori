/**
 * `next/headers` 대역.
 *
 * 데이터 층의 목업 구현은 데모 상태(쿠키)를 읽는다(src/lib/demo-state.ts).
 * 시험은 Next 요청 안에서 도는 것이 아니므로 쿠키 저장소가 없다.
 * 여기서는 **빈 저장소**를 준다 — 데모 중 변경분이 하나도 없는 상태,
 * 즉 시드 그대로의 목업 데이터가 된다.
 *
 * 배치와 낱개가 둘 다 이 대역을 지나가므로 비교의 공정성은 그대로다.
 */
export async function cookies() {
  return {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => {},
    delete: () => {},
  };
}

export async function headers() {
  return new Headers();
}

export async function draftMode() {
  return { isEnabled: false, enable: () => {}, disable: () => {} };
}
