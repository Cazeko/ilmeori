/**
 * 문서 편집 신호의 규약.
 *
 * 이 파일과 supabase/migrations/0018_rich_document.sql 은 같은 약속을 양쪽에서
 * 적은 것이다. 토픽 이름이나 페이로드 모양이 어긋나면 편집기는 조용히 혼자가
 * 된다 — 오류도 나지 않는다. (0012 · realtime.ts 와 같은 규약이다)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ 여기는 0012 가 세운 규칙의 **명시적 예외**다. 반드시 읽고 고칠 것.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 0012 는 「신호에 내용을 싣지 않는다」고 못박았다. 이유는 broadcast 의 권한
 * 판정이 **채널에 들어올 때 한 번뿐**이기 때문이다. 행 단위 필터가 없으므로
 * 채널에 실은 것은 그 안의 모두에게 그대로 가고, 편집 중에 권한을 잃은
 * 사람도 다시 접속하기 전까지는 계속 받는다.
 *
 * 동시 편집은 원리상 그 규칙을 지킬 수 없다. 「뭔가 바뀌었으니 다시 읽어라」로는
 * 글자 단위로 합칠 수 없고, 서버를 한 번 갔다 오는 순간 남의 커서가 튄다.
 * 그래서 예외를 두되, **좁히고 시한을 건다.**
 *
 *   ① 채널을 따로 판다.  work:<업무> 가 아니라 doc:<문서> 다.
 *      0012 의 정책은 「이 업무를 **볼 수 있는가**」로 판정한다(can_read_work).
 *      이 채널은 「이 문서를 **고칠 수 있는가**」로 판정한다(can_edit_work).
 *      부서 공개로 들어와 구경하는 사람은 이 채널에 아예 못 들어온다.
 *
 *   ② 주기적으로 다시 들어간다(REJOIN_MS).
 *      권한이 회수된 사람은 다음 재합류에서 거부된다. 「한 번 들어오면 끝」이
 *      「길어야 5분」이 된다. 이것이 이 예외의 값을 치르는 방식이다.
 *
 *   ③ 화면에 그려지는 값의 최종 출처는 여전히 서버다.
 *      이 채널로 오는 것은 편집 중인 판이고, 저장·새로고침하면 RLS 를 통과한
 *      값으로 갈린다. 신호를 위조해도 남의 DB 를 고칠 수는 없다 — 저장을 막는
 *      관문은 셋뿐이고 전부 이 채널 밖에 있다. 서버 액션(saveRichDoc),
 *      document_update 정책, 그리고 blocks_rev 를 건 한 문장(0018 §4).
 *      DB 함수는 일부러 만들지 않았다 — 그 이유도 0018 §4 에 있다.
 *
 * ── 신호를 믿지 않는다 ─────────────────────────────────────────────────────
 *
 * 이 채널에 쓸 수 있는 사람(=문서를 고칠 수 있는 사람)은 브라우저 콘솔에서
 * 아무 값이나 보낼 수 있다. 그래서 들어오는 것은 전부 `readOps` 를 통과해야
 * 하고, 모양이 아니면 조용히 버린다. 예외를 던지면 남의 콘솔 한 줄로 내
 * 편집기가 죽는다.
 */

import type { Pos } from "./pos";

/** 문서 하나가 채널 하나다. 토픽 이름이 곧 권한 경계다. */
export function docTopic(documentId: string): string {
  return `doc:${documentId}`;
}

/** 편집 연산 묶음. */
export const DOC_OPS = "doc.ops";
/** 합류 인사 — 「지금 상태를 아는 사람 있나요」 */
export const DOC_HELLO = "doc.hello";
/** 인사에 대한 대답 — 상태 한 벌 */
export const DOC_STATE = "doc.state";
/** 커서·선택 영역. 저장되지 않고 흘러가는 값이다. */
export const DOC_CARET = "doc.caret";
/**
 * 문단에 달린 의견 한 벌.
 *
 * 글자와 달리 통째로 보낸다. 의견은 한 사람이 한 번에 쓰고 끝나는 것이라
 * 글자 단위로 합칠 이유가 없고, 문서 하나에 수백 개가 넘지 않는다.
 * 받는 쪽은 id 별로 나중 것을 택한다(engine.mergeComments).
 */
export const DOC_COMMENTS = "doc.comments";

/**
 * 다시 들어가는 주기.
 *
 * 권한 회수가 반영되기까지의 최대 시간이다(위 ② 참조). 짧을수록 안전하지만,
 * 재합류할 때마다 접속자 목록이 한 번 출렁이고 신호가 잠깐 끊긴다.
 * 5분은 문서 항목 잠금(SECTION_LOCK_MINUTES)과 같은 값이다 — 이 제품에서
 * 「편집 권한이 살아 있다고 볼 수 있는 창」의 길이를 한 벌로 맞춰 둔다.
 */
export const REJOIN_MS = 5 * 60_000;

// ===========================================================================
// 연산
//
// 배열로 적는다. 문서 하나를 두 사람이 고치면 글자 하나마다 신호가 오가는데,
// {"kind":"insertText","container":…} 로 적으면 같은 편집이 서너 배가 된다.
// 첫 칸이 갈래다.
// ===========================================================================

/** 글자에 붙는 서식 한 벌. 값이 null 이면 「떼라」는 뜻이다. */
export type FmtPatch = Record<string, string | boolean | null>;

/** 램포트 시계 — 서식·속성의 마지막 승자를 가린다. `[시계, 자리]` */
export type Stamp = [number, string];

export type Op =
  /** 글자 넣기: 그릇, 자리표, 글자, 서식 */
  | ["ti", string, Pos, string, FmtPatch?]
  /** 글자 지우기: 그릇, 자리표 열쇠 */
  | ["td", string, string]
  /** 서식 바꾸기: 그릇, 시작 자리표, 끝 자리표, 서식, 도장 */
  | ["tf", string, Pos, Pos, FmtPatch, Stamp]
  /** 블록 넣기: 자리표, 블록 뼈대(글자는 ti 로 따로 온다) */
  | ["bi", Pos, BlockSkeleton]
  /** 블록 지우기: 블록 id */
  | ["bd", string]
  /** 블록 속성: 블록 id, 바뀐 속성, 도장 */
  | ["ba", string, BlockAttrs, Stamp];

/**
 * 블록의 껍데기.
 *
 * 글자는 여기 없다 — 글자는 자기 그릇(container)에 자기 자리표로 들어간다.
 * 그래야 같은 문단을 둘이 고칠 때 글자 단위로 합쳐진다.
 */
export type BlockSkeleton = {
  id: string;
  kind: string;
  align?: string;
  indent?: number;
  /** 표의 뼈대(몇 줄 몇 칸, 칸 이름, 너비). 칸 안의 글자는 그릇으로 따로 산다. */
  table?: unknown;
};

export type BlockAttrs = {
  kind?: string;
  align?: string;
  indent?: number;
  table?: unknown;
};

// ===========================================================================
// 믿지 않고 읽기
// ===========================================================================

function isPos(v: unknown): v is Pos {
  if (!Array.isArray(v) || v.length === 0 || v.length > 80) return false;
  for (const ident of v) {
    if (!Array.isArray(ident) || ident.length !== 3) return false;
    const [d, s, n] = ident as unknown[];
    if (typeof d !== "number" || !Number.isFinite(d) || d < 0) return false;
    if (typeof s !== "string" || s.length === 0 || s.length > 8) return false;
    if (typeof n !== "number" || !Number.isFinite(n)) return false;
  }
  return true;
}

function isFmt(v: unknown): v is FmtPatch {
  if (v === undefined) return true;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  for (const key of Object.keys(v)) {
    if (key.length > 12) return false;
    const val = (v as Record<string, unknown>)[key];
    if (val !== null && typeof val !== "string" && typeof val !== "boolean") {
      return false;
    }
    if (typeof val === "string" && val.length > 16) return false;
  }
  return true;
}

function isStamp(v: unknown): v is Stamp {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    Number.isFinite(v[0]) &&
    typeof v[1] === "string" &&
    v[1].length <= 8
  );
}

function isId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 32;
}

function isSkeleton(v: unknown): v is BlockSkeleton {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const b = v as Record<string, unknown>;
  if (!isId(b.id)) return false;
  if (typeof b.kind !== "string" || b.kind.length > 16) return false;
  if (b.align !== undefined && typeof b.align !== "string") return false;
  if (b.indent !== undefined && typeof b.indent !== "number") return false;
  return true;
}

/**
 * 연산 한 개를 읽는다. 모양이 아니면 null.
 *
 * 여기서 하는 것은 **모양 검사뿐**이다. 「이 블록이 있는가」·「이 서식이 아는
 * 값인가」는 CRDT 가 반영하면서 본다. 두 곳에서 같은 것을 보면 반드시 어긋난다.
 */
export function readOp(raw: unknown): Op | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  switch (raw[0]) {
    case "ti":
      return isId(raw[1]) &&
        isPos(raw[2]) &&
        typeof raw[3] === "string" &&
        raw[3].length > 0 &&
        raw[3].length <= 8 &&
        isFmt(raw[4])
        ? (raw as Op)
        : null;
    case "td":
      return isId(raw[1]) &&
        typeof raw[2] === "string" &&
        raw[2].length > 0 &&
        raw[2].length <= 1024
        ? (raw as Op)
        : null;
    case "tf":
      return isId(raw[1]) &&
        isPos(raw[2]) &&
        isPos(raw[3]) &&
        isFmt(raw[4]) &&
        isStamp(raw[5])
        ? (raw as Op)
        : null;
    case "bi":
      return isPos(raw[1]) && isSkeleton(raw[2]) ? (raw as Op) : null;
    case "bd":
      return isId(raw[1]) ? (raw as Op) : null;
    case "ba":
      return isId(raw[1]) &&
        raw[2] &&
        typeof raw[2] === "object" &&
        !Array.isArray(raw[2]) &&
        isStamp(raw[3])
        ? (raw as Op)
        : null;
    default:
      return null;
  }
}

/**
 * 한 묶음에 실을 수 있는 연산의 수.
 *
 * Supabase 의 broadcast 는 페이로드 크기에 한계가 있고(기본 256KB), 넘으면
 * 조용히 버려진다. 붙여넣기 한 번이 수천 연산이 되므로 반드시 나눠 보낸다.
 */
export const MAX_OPS_PER_MESSAGE = 200;

/** 연산 묶음을 믿지 않고 읽는다. 모양이 아닌 것은 버리고 나머지는 살린다. */
export function readOps(payload: unknown): Op[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const raw = p.ops;
  if (!Array.isArray(raw)) return [];
  const out: Op[] = [];
  // 한 번에 처리할 상한. 없으면 콘솔 한 줄로 남의 탭을 멈출 수 있다.
  for (const item of raw.slice(0, MAX_OPS_PER_MESSAGE * 4)) {
    const op = readOp(item);
    if (op) out.push(op);
  }
  return out;
}

/** 이 신호를 보낸 자리. 내 것이면 다시 반영하지 않는다. */
export function readSender(payload: unknown): string | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  return typeof p.from === "string" && p.from.length <= 8 ? p.from : null;
}

// ===========================================================================
// 커서
// ===========================================================================

export type CaretSignal = {
  /** 보내는 자리(브라우저 탭). */
  from: string;
  /** 보는 사람. 이름을 붙이는 데만 쓴다 — 서버가 준 참여자 목록에서 찾는다. */
  who: string;
  /** 커서가 있는 블록. 표 안이면 칸 id 다. */
  container: string | null;
  /** 그 그릇 안의 글자 번호. */
  at: number;
  /** 선택 영역의 끝. 없으면 커서 하나다. */
  to: number | null;
};

export function readCaret(payload: unknown): CaretSignal | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.from !== "string" || p.from.length > 8) return null;
  if (typeof p.who !== "string" || p.who.length > 64) return null;
  const container =
    typeof p.container === "string" && p.container.length <= 32
      ? p.container
      : null;
  const at = typeof p.at === "number" && Number.isFinite(p.at) ? p.at : 0;
  const to = typeof p.to === "number" && Number.isFinite(p.to) ? p.to : null;
  return { from: p.from, who: p.who, container, at, to };
}
