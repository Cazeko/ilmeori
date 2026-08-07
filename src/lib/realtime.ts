/**
 * 실시간 신호의 규약.
 *
 * 이 파일과 supabase/migrations/0012_realtime.sql 은 같은 약속을 양쪽에서 적은 것이다.
 * 토픽 이름과 페이로드 모양이 어긋나면 화면은 조용히 멈춘다 — 오류도 나지 않는다.
 * 그래서 한쪽을 고치면 반드시 다른 쪽도 고쳐야 한다는 뜻으로 파일 위에 적어 둔다.
 *
 * ── 신호는 화면을 그리지 않는다 ─────────────────────────────────────────────
 *
 * 페이로드에는 무엇이 바뀌었는지의 **갈래**만 들어 있다. 제목도 본문도 이름도 없다.
 * 브라우저가 하는 일은 "서버에 다시 물어봐라"가 전부이고, 화면에 실제로 나타나는
 * 것은 언제나 서버 렌더가 RLS 를 통과해 가져온 데이터다.
 *
 * 이유는 broadcast 의 권한 판정이 채널에 들어올 때 한 번뿐이기 때문이다.
 * 행 단위 필터가 없으므로, 페이로드에 실은 것은 그 채널의 모두에게 그대로 간다.
 * 자세한 설명은 0012 마이그레이션 머리말에 있다.
 */

/** 업무 하나가 곧 채널 하나다. 토픽 이름이 권한 경계이기도 하다. */
export function workTopic(workId: string): string {
  return `work:${workId}`;
}

/** DB 트리거가 보내는 이벤트 이름. */
export const WORK_TOUCHED = "work.touched";

/** 무엇이 바뀌었는가. DB 의 tg_argv 와 같은 값이다. */
export const TOUCH_KINDS = [
  "work",
  "member",
  "document",
  "section",
  "comment",
  "attachment",
  "approval",
] as const;

export type TouchKind = (typeof TOUCH_KINDS)[number];

const TOUCH_LABEL: Record<TouchKind, string> = {
  work: "업무 정보",
  member: "참여자·권한",
  document: "문서",
  section: "문서 항목",
  comment: "대화",
  attachment: "첨부파일",
  approval: "결재",
};

/**
 * 갈래 → 화면 문구. 모르는 값은 「내용」으로 떨어진다.
 *
 * 표를 화면에서 직접 인덱싱하지 않고 이 함수만 내보내는 이유가 있다.
 * `kind in TOUCH_LABEL` 이나 `TOUCH_LABEL[kind]` 는 프로토타입 사슬까지 본다.
 * `toString` · `constructor` · `valueOf` · `hasOwnProperty` · `__proto__` 가 전부
 * 통과하고, 그때 돌아오는 것은 문구가 아니라 **함수**다. 그 함수가 josa() 로
 * 흘러 들어가면 word.trim() 에서 예외가 나고, 이 앱에는 error.tsx 가 없어
 * 업무 화면이 통째로 사라진다.
 *
 * 이 업무를 볼 수 있는 사람은 브라우저에서 이 토픽으로 아무 값이나 보낼 수 있으므로
 * (0012 의 work_topic_write), 가상의 위험이 아니라 콘솔 한 줄로 되는 일이다.
 */
export function touchLabel(kind: TouchKind | null): string {
  const label = kind ? TOUCH_LABEL[kind] : null;
  return typeof label === "string" ? label : "내용";
}

export type WorkTouch = {
  kind: TouchKind | null;
  /** 이 변경을 일으킨 사람. 내 변경이면 화면을 다시 부르지 않으려고 쓴다. */
  actor: string | null;
};

/**
 * 들어온 신호를 믿지 않고 읽는다.
 *
 * 이 표에 쓸 수 있는 사람(=업무를 볼 수 있는 사람)은 브라우저에서 직접 아무 값이나
 * 보낼 수 있다. 실제로 그렇게 해도 얻는 것은 "화면을 한 번 더 불러라"뿐이고
 * 다시 부른 화면은 여전히 RLS 를 통과한 것만 보여 주지만, 모르는 값이 화면 문구가
 * 되는 일은 없어야 한다. 모양이 어긋나면 갈래를 null 로 떨어뜨린다.
 *
 * 목록에 있는지를 `includes` 로 본다. `in` 은 프로토타입을 통과시킨다(touchLabel 주석).
 *
 * 실제로 배달되는 페이로드에는 서버가 붙이는 `id`(메시지 uuid)가 하나 더 들어 있다.
 * 우리가 넣은 값이 아니고 화면에도 쓰지 않으므로 여기서는 그냥 무시한다.
 */
export function readWorkTouch(payload: unknown): WorkTouch {
  const p = (payload ?? {}) as Record<string, unknown>;
  const raw = p.kind;
  const kind =
    typeof raw === "string" && (TOUCH_KINDS as readonly string[]).includes(raw)
      ? (raw as TouchKind)
      : null;
  const actor = typeof p.actor === "string" ? p.actor : null;
  return { kind, actor };
}
