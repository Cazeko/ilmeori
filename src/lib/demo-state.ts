import "server-only";

import { cookies } from "next/headers";
import type { HandoverStatus, WorkStatus } from "@/lib/types";

/**
 * 데모에서 사용자가 바꾼 것들.
 *
 * 시제품 단계에서 "눌러도 아무 일이 안 일어나는 버튼"은 없는 것만 못하다.
 * 그래서 DB 연결 전까지는 변경 내용을 **각자의 브라우저 쿠키**에 담는다.
 *
 * 이 방식을 고른 이유:
 *   · 심사위원마다 각자의 상태를 갖는다. 한 명이 인계를 실행해도
 *     다음 사람은 실행 전 화면부터 다시 볼 수 있다.
 *   · 서버에 아무것도 쌓이지 않는다. 시제품 주소에 남는 데이터가 0이다.
 *   · 서버리스로 배포해도 동작한다. 프로세스 메모리에 두면 요청마다 초기화된다.
 *
 * 쿠키는 4KB가 한계이므로 담는 것을 엄격히 제한한다.
 * Supabase가 연결되면 이 파일은 통째로 사라진다.
 */

export const STATE_COOKIE = "ilmeori.state";

export type DemoComment = {
  id: string;
  work_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type DemoState = {
  /** 업무 id → 바뀐 상태 */
  workStatus: Record<string, WorkStatus>;
  /** 인계 진행 단계 */
  handoverStatus?: HandoverStatus;
  /**
   * 인계를 **실제로 실행한 시각**.
   *
   * 없으면 서식의 「인계일」 칸이 `오늘 (예정)` 으로 찍힌다. 그런데 이 값이
   * 필요한 순간은 인계가 **이미 끝난 뒤**라, 같은 화면이 위에서는 「인계가
   * 끝났습니다」라고 하고 서식에서는 「(예정)」이라고 말하게 된다.
   * 결재에 올라가는 장에 「예정」이 찍히면 그건 다른 문서다.
   *
   * 지어내지 않고 **실행할 때 적어 둔다.** ISO 문자열 하나라 쿠키에서
   * 20바이트 남짓이다(상한 3,600바이트).
   */
  completedAt?: string;
  /**
   * 확인 서명 두 칸(0026).
   *
   * 상태 하나로는 「인계자만 확인」을 표현할 수 없다. 데모에서 심사위원이
   * 박준호로 확인을 누르고 이하람으로 갈아타는 것이 이 절차의 요점이므로,
   * 그 중간 상태가 쿠키에 남아야 한다. ISO 문자열 둘이라 40바이트 남짓이다.
   */
  confirmedAt?: string;
  acceptedAt?: string;
  /** 입회자가 승인하며 적은 근거(온나라 문서번호·결재일) */
  witnessNote?: string;
  /** 인계 실행으로 주인이 바뀐 업무 id */
  transferred: string[];
  /** 데모 중 남긴 대화. 쿠키 크기 때문에 최근 것만 남긴다. */
  comments: DemoComment[];
  /**
   * 데모 중 인계 문답에 남긴 글.
   *
   * 인계서에 보태는 「보충」은 데모에서 아예 안 받는다(data/index.ts) — 한 줄이
   * 1000자까지라 쿠키에 한 번만 적어도 넘친다. 문답은 짧은 말이고, 무엇보다
   * **시연에서 실제로 눌러 보는 물건**이라 여기서만은 받는다.
   */
  handoverMessages: DemoHandoverMessage[];
};

/**
 * 데모 문답 한 줄.
 *
 * `handover_id` 를 안 담는다. 데모에는 인계 건이 하나뿐이고(mock/works.ts),
 * 쿠키는 3,600바이트가 상한이라 uuid 36자를 줄마다 싣는 것이 아깝다.
 * 대신 읽는 쪽에서 그 한 건인지 확인한다(mock.getHandoverMessages).
 */
export type DemoHandoverMessage = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export const EMPTY_STATE: DemoState = {
  workStatus: {},
  transferred: [],
  comments: [],
  handoverMessages: [],
};

const MAX_COMMENTS = 3;
const MAX_BODY = 240;
/** 데모에서 남는 문답 수. 화면이 이 수를 그대로 적는다(handover-talk.tsx). */
export const MAX_DEMO_MESSAGES = 6;
const MAX_MESSAGE_BODY = 200;

const STATUSES: WorkStatus[] = ["todo", "doing", "review", "done"];
const HANDOVER_STATUSES: HandoverStatus[] = [
  "draft",
  "generated",
  "confirmed",
  "completed",
];

/**
 * 쿠키 값은 사용자가 마음대로 바꿀 수 있다. 모양이 맞는지 한 칸씩 확인하고,
 * 조금이라도 어긋나면 통째로 버린다. 반쯤 읽어서 쓰는 것이 제일 위험하다.
 */
function parse(raw: string | undefined): DemoState {
  if (!raw) return EMPTY_STATE;
  try {
    const json: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (typeof json !== "object" || json === null) return EMPTY_STATE;
    const o = json as Record<string, unknown>;

    const workStatus: Record<string, WorkStatus> = {};
    if (typeof o.workStatus === "object" && o.workStatus !== null) {
      for (const [k, v] of Object.entries(o.workStatus)) {
        if (STATUSES.includes(v as WorkStatus)) workStatus[k] = v as WorkStatus;
      }
    }

    const handoverStatus = HANDOVER_STATUSES.includes(
      o.handoverStatus as HandoverStatus,
    )
      ? (o.handoverStatus as HandoverStatus)
      : undefined;

    const transferred = Array.isArray(o.transferred)
      ? o.transferred.filter((x): x is string => typeof x === "string")
      : [];

    const comments = Array.isArray(o.comments)
      ? o.comments
          .filter(
            (c): c is DemoComment =>
              typeof c === "object" &&
              c !== null &&
              typeof (c as DemoComment).id === "string" &&
              typeof (c as DemoComment).work_id === "string" &&
              typeof (c as DemoComment).author_id === "string" &&
              typeof (c as DemoComment).body === "string" &&
              typeof (c as DemoComment).created_at === "string",
          )
          .slice(-MAX_COMMENTS)
      : [];

    // 쿠키는 사용자가 고칠 수 있다. 날짜로 쓸 값이므로 **실제로 날짜인지**
    // 확인한다 — 아무 문자열이나 통과시키면 서식의 「인계일」에 그대로 찍힌다.
    const stamp = (v: unknown) =>
      typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined;
    const completedAt = stamp(o.completedAt);
    const confirmedAt = stamp(o.confirmedAt);
    const acceptedAt = stamp(o.acceptedAt);
    // 서식과 화면에 그대로 찍히는 글자다. 길이를 여기서 자른다 — 쿠키는 사용자가
    // 고칠 수 있고, 상한 없는 문자열 하나가 쿠키 전체를 넘기면 데모가 통째로 죽는다.
    const witnessNote =
      typeof o.witnessNote === "string" && o.witnessNote.trim()
        ? o.witnessNote.trim().slice(0, 120)
        : undefined;

    const handoverMessages = Array.isArray(o.handoverMessages)
      ? o.handoverMessages
          .filter(
            (m): m is DemoHandoverMessage =>
              typeof m === "object" &&
              m !== null &&
              typeof (m as DemoHandoverMessage).id === "string" &&
              typeof (m as DemoHandoverMessage).author_id === "string" &&
              typeof (m as DemoHandoverMessage).body === "string" &&
              typeof (m as DemoHandoverMessage).created_at === "string",
          )
          .slice(-MAX_DEMO_MESSAGES)
      : [];

    return {
      workStatus,
      handoverStatus,
      completedAt,
      confirmedAt,
      acceptedAt,
      witnessNote,
      transferred,
      comments,
      handoverMessages,
    };
  } catch {
    return EMPTY_STATE;
  }
}

export async function getDemoState(): Promise<DemoState> {
  const store = await cookies();
  return parse(store.get(STATE_COOKIE)?.value);
}

/**
 * 쿠키 한 개의 상한은 4KB다. 넘으면 브라우저가 **조용히 통째로 버린다.**
 * 한글은 한 글자가 3바이트라 240자짜리 글 세 개면 이미 3KB에 근접한다.
 * 그래서 실제로 인코딩해 본 뒤 넘치면 오래된 글부터 덜어낸다.
 */
const MAX_COOKIE_BYTES = 3600;

function encode(state: DemoState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

/** Server Action에서만 부른다. 서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없다. */
export async function setDemoState(next: DemoState) {
  const trimmed: DemoState = {
    ...next,
    comments: next.comments
      .slice(-MAX_COMMENTS)
      .map((c) => ({ ...c, body: c.body.slice(0, MAX_BODY) })),
    handoverMessages: (next.handoverMessages ?? [])
      .slice(-MAX_DEMO_MESSAGES)
      .map((m) => ({ ...m, body: m.body.slice(0, MAX_MESSAGE_BODY) })),
  };

  // 넘치면 **둘 중 가장 오래된 것**부터 덜어낸다.
  //
  // 한쪽만 덜어내면 다른 쪽이 쿠키를 다 먹었을 때 방금 적은 글이 조용히
  // 사라진다 — 대화 세 줄이 문답 여섯 줄을 밀어내거나 그 반대다. 갈래가
  // 아니라 시각으로 자르면 어느 쪽에서 적었든 「오래된 것이 먼저 간다」로
  // 한 가지 규칙이 되고, 그건 사람이 예상할 수 있는 유일한 규칙이다.
  let value = encode(trimmed);
  while (
    value.length > MAX_COOKIE_BYTES &&
    (trimmed.comments.length > 0 || trimmed.handoverMessages.length > 0)
  ) {
    const c = trimmed.comments[0];
    const m = trimmed.handoverMessages[0];
    if (c && (!m || c.created_at <= m.created_at)) trimmed.comments.shift();
    else trimmed.handoverMessages.shift();
    value = encode(trimmed);
  }

  const store = await cookies();
  store.set(
    STATE_COOKIE,
    value,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  );
}

export async function resetDemoState() {
  const store = await cookies();
  store.delete(STATE_COOKIE);
}
