/**
 * 표시 형식 — 날짜·숫자
 *
 * 원칙 1. 형식 문자열을 직접 조립하지 않고 Intl에 맡긴다.
 *         "2026-08-06"을 사람이 자르면 시간대·로캘에서 반드시 어긋난다.
 * 원칙 2. 이력·열람기록은 **항상 절대 시각**으로 적는다.
 *         "3시간 전"은 읽기엔 편하지만 감사 기록으로는 쓸 수 없고,
 *         서버와 브라우저의 시계가 달라 하이드레이션도 어긋난다.
 * 원칙 3. 시간대는 Asia/Seoul로 고정한다. 서버가 UTC로 도는 환경에서도
 *         화면에 찍히는 시각이 공무원이 보는 시각과 같아야 한다.
 */

const TZ = "Asia/Seoul";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  year: "numeric",
  month: "long",
  day: "numeric",
});

const shortDateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  month: "long",
  day: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * dateStyle/timeStyle 조합을 쓰지 않는다.
 * Node의 ICU 버전에 따라 ko-KR 오전/오후가 "AM/PM"으로 나오는 경우가 있어
 * 화면에 영어가 섞인다. 24시간제로 고정하면 그 문제가 아예 생기지 않고,
 * 행정 기록에서도 24시간제가 표준이다.
 */
const fullDateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 2026년 8월 6일 */
export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

/** 8월 6일 */
export function formatShortDate(iso: string) {
  return shortDateFmt.format(new Date(iso));
}

/** 8월 6일 14:32 — 이력·열람기록의 기본 표기 */
export function formatDateTime(iso: string) {
  return dateTimeFmt.format(new Date(iso));
}

/** 2026년 8월 6일 14:32 — title 속성이나 상세 보기용 */
export function formatFullDateTime(iso: string) {
  return fullDateTimeFmt.format(new Date(iso));
}

/**
 * 파일 크기.
 * 3MB짜리 파일을 "2,822KB"라고 적으면 큰지 작은지 판단하는 데 한 번 더 계산이 든다.
 */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const numberFmt = new Intl.NumberFormat("ko-KR");

/** 1,234 — 자릿수 구분 없는 큰 숫자는 읽는 데 시간이 걸린다 */
export function formatNumber(n: number) {
  return numberFmt.format(n);
}

/**
 * 오늘을 Asia/Seoul 기준 YYYY-MM-DD로 얻는다.
 * 서버가 UTC로 돌면 한국 시각 오전 9시 이전에 하루가 밀린다.
 */
export function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** 날짜만 있는 두 문자열(YYYY-MM-DD)의 일수 차. 미래가 양수. */
export function daysUntil(dateOnly: string, from: string = todayKST()): number {
  const a = Date.UTC(
    Number(dateOnly.slice(0, 4)),
    Number(dateOnly.slice(5, 7)) - 1,
    Number(dateOnly.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  return Math.round((a - b) / 86_400_000);
}

/**
 * 마감까지 남은 기간을 사람 말로.
 * 지난 기한은 "며칠 전"이 아니라 "3일 지남"이라고 쓴다.
 * 지연은 과거의 사실이 아니라 지금 처리해야 할 상태이기 때문이다.
 */
export function formatDueLabel(dueDate: string, from?: string): string {
  const d = daysUntil(dueDate, from);
  if (d === 0) return "오늘 마감";
  if (d === 1) return "내일 마감";
  if (d === -1) return "1일 지남";
  if (d < 0) return `${-d}일 지남`;
  return `${d}일 남음`;
}
