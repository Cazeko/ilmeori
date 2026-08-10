# 글꼴 — Pretendard GOV (자체 호스팅)

이 디렉터리의 woff2 240개와 `pretendard-gov.css` 는 **재배포물**이다.

- 출처: [Pretendard](https://github.com/orioncactus/pretendard) v1.3.9
- 라이선스: SIL Open Font License 1.1 — 전문은 [`OFL.txt`](./OFL.txt)
- 저작권: Copyright (c) 2021, Kil Hyung-jin, with Reserved Font Name Pretendard

OFL 은 글꼴을 복제·재배포할 때 저작권 고지와 라이선스 전문을 함께 둘 것을
요구한다. 그래서 `OFL.txt` 가 이 자리에 있다. 지우면 안 된다.

## 왜 CDN 을 떠났나

1. 내부망 온프레미스 배포에서는 외부 CDN 에 닿지 않는다.
   「망분리 환경에서 외부 호출 0건」이라는 주장이 이제 사실이다.
2. `globals.css` 안의 `@import` 가 직렬 체인이었다 — 앱 CSS 를 다 받아
   파싱한 뒤에야 CDN 을 찾아 나섰다. 실측 FCP +188ms, load +257ms.

## 무엇이 들어 있나

원본 dynamic-subset 은 굵기 9종 × 조각 120개 = `@font-face` 1,080개, 888KB 다.
이 앱이 쓰는 굵기는 **400·700 둘뿐**이라(`globals.css` 의 「굵기 2가지」 약속)
그 둘만 남겼다 — 240개, 155KB.

`unicode-range` 로 쪼개져 있으므로 브라우저는 화면에 실제로 쓰인 글자의 조각만
받는다. 파일이 240개라고 240개가 전부 나가는 것이 아니다.

## 다시 만들려면

```
npm run fonts
```

인터넷이 필요하다(jsdelivr 에서 원본을 받는다). 굵기를 늘리려면
`scripts/build-font-css.mjs` 의 `WEIGHTS` 를 고친다.
