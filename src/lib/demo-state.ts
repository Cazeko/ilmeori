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
  /** 인계 실행으로 주인이 바뀐 업무 id */
  transferred: string[];
  /** 데모 중 남긴 대화. 쿠키 크기 때문에 최근 것만 남긴다. */
  comments: DemoComment[];
};

export const EMPTY_STATE: DemoState = {
  workStatus: {},
  transferred: [],
  comments: [],
};

const MAX_COMMENTS = 3;
const MAX_BODY = 240;

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

    return { workStatus, handoverStatus, transferred, comments };
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
  };

  let value = encode(trimmed);
  while (value.length > MAX_COOKIE_BYTES && trimmed.comments.length > 0) {
    trimmed.comments.shift();
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
