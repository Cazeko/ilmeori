/**
 * `next/link` 대역 — **글자만 보는 시험**을 위해서다.
 *
 * 진짜 Link 는 클라이언트 컴포넌트이고 라우터 문맥을 붙들고 있다. 요청 밖에서
 * 도는 시험이 그걸 부르면 렌더가 아니라 환경 설치에서 죽는다.
 *
 * 이 대역이 정직한 이유: 이 시험이 묻는 것은 **서식에 찍히는 글자**이지 링크가
 * 어디로 가느냐가 아니다. 주소가 맞는지는 tests/handover-draft.test.mjs 의
 * [5]·[6] 이 데이터 층에서 이미 대조한다. 두 시험이 각자 자기 축만 본다.
 *
 * `<a>` 로 그리는 것도 뜻이 있다 — 태그를 벗겨 낸 글자가 진짜 Link 를 썼을 때와
 * 같아야 이 대역을 쓰는 것이 대조를 무르게 만들지 않는다.
 */
import { createElement } from "react";

export default function Link({ href, children, ...rest }) {
  return createElement("a", { href, ...rest }, children);
}
