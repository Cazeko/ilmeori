/**
 * 동시 편집 — 여러 자리(브라우저 탭)에서 온 편집을 한 문서로 합친다.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ 글자는 **코드포인트** 단위다. offset 도 전부 코드포인트 기준이다.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 문자열을 자를 때 `str.slice`·`str.length` 를 쓰지 않고 `[...str]` 로 쪼갠다.
 * UTF-16 코드 단위로 쪼개면 이모지·일부 한자가 반쪽 서로게이트로 갈라지고,
 * 그 반쪽이 XML 로 나가는 순간 파일이 통째로 깨진다(pack.ts 의 `esc()` 주석이
 * 같은 사고를 적어 두었다). 자리표 하나에 코드포인트 하나가 들어가므로
 * 반쪽이 생길 자리가 아예 없다.
 *
 * 대신 **자모 묶음(grapheme)은 나뉜다.** 「👨‍👩‍👦」는 코드포인트 다섯 개라
 * 자리표 다섯 개를 차지하고, 가운데를 지우면 다른 그림이 된다. 화면 코드가
 * 커서를 옮길 때 묶음 단위로 건너뛰어야 하는 이유다 — 이 파일은 거기까지
 * 책임지지 않는다.
 *
 * ── 그릇(container) 은 두 종류다 ────────────────────────────────────────────
 *
 * 글자는 블록이 아니라 **그릇**에 담긴다. 그릇 이름이
 *
 *   · 블록 id 면      그 블록의 본문
 *   · 표 칸 id 면     그 칸의 글자
 *
 * 다. 칸마다 id 를 준 것(model.ts 의 TableCell.id)이 이걸 위해서다. 덕분에
 * 표 칸도 문단과 똑같이 글자 단위로 합쳐진다 — 두 사람이 같은 칸을 고쳐도
 * 나중 사람이 앞사람 글을 통째로 덮지 않는다.
 *
 * ⚠ **표의 뼈대는 그렇지 않다.** 몇 줄 몇 칸인지·칸 id·너비·header·colSpan·
 * 칸 정렬은 블록 속성 `table` 하나에 통째로 든 LWW 값이다. 두 사람이 동시에
 * 줄을 더하면 **나중 도장이 이기고 앞사람의 줄 추가는 사라진다.** 칸 안의
 * 글자는 그릇에 그대로 살아 있지만 표에서 그 칸이 없어지면 화면에서도
 * 사라진다. 표 구조를 글자처럼 합치려면 줄·칸도 자리표를 가져야 하는데,
 * 그 값이 전부 실시간 신호에 실리고 상태 한 벌이 서너 배가 된다. 표를 동시에
 * 뜯어고치는 일은 드물고 되돌리기도 쉬워서, 여기서는 값을 치르지 않기로 했다.
 *
 * ── 도착 순서가 결과를 바꾸지 않는다 ────────────────────────────────────────
 *
 * broadcast 는 순서를 보장하지 않는다(wire.ts 머리말). 그래서 **같은 연산
 * 집합이면 어떤 순서로 받아도 같은 문서**여야 한다. 놓치기 쉬운 네 가지:
 *
 *   ① `ti` 가 `bi` 보다 먼저 온다
 *      글자는 블록을 보지 않고 그릇에 넣는다. 블록이 없으면 화면에 안 그려질
 *      뿐이고, 나중에 `bi` 가 오면 그 글자가 그대로 딸려 나온다.
 *      (`ti` 로는 블록 레코드를 만들지 않는다 — 그릇 이름이 블록 id 인지
 *       칸 id 인지 `ti` 만 보고는 알 수 없기 때문이다. 칸 id 로 블록을 만들면
 *       영영 안 그려지는 유령 블록이 상태에 쌓인다)
 *
 *   ② `td` 가 `ti` 보다 먼저 온다
 *      지워진 자리표 열쇠를 `#gone` 에 남긴다. 뒤늦게 온 `ti` 는 그 열쇠면
 *      넣지 않는다. 이 열쇠는 지우지 못한다 — 언제 올지 모르는 `ti` 를
 *      막아야 하기 때문이다(묘비). 문서 수명 동안 지운 글자 수만큼 쌓인다.
 *
 *   ③ `bd` 가 `bi` 보다 먼저 온다
 *      `#dead` 에 블록 id 를 남기고 같은 방식으로 막는다. 죽은 블록의 글자는
 *      그릇에 그대로 두는데, 지워 버리면 「늦게 온 ti 가 그릇을 되살리는」
 *      경우에 자리마다 결과가 갈린다.
 *
 *   ④ `tf`(구간 서식) 가 `ti` 보다 먼저 온다  ← 가장 놓치기 쉽다
 *      구간 서식을 **버리지 않고** `#ranges` 에 남긴다. 새 글자를 넣을 때
 *      그 그릇의 구간 중 [from, to] 안에 드는 것을 전부 먹인다. 이렇게 하지
 *      않으면: A 가 글자 X 를 넣고 B 가 동시에 X 를 품는 구간을 굵게 했을 때,
 *      A 에서는 X 가 굵고 B·C 에서는 안 굵어 **영영 갈린다.**
 *
 * 그리고 글자 서식은 **키별 LWW** 다. 「굵게」와 「형광펜」은 서로 다른 칸이라
 * 동시에 걸어도 둘 다 남고, 같은 칸이 부딪히면 도장 `(t, s)` 가 큰 쪽이 이긴다
 * (램포트 시계 → 자리 이름). 이기고 지는 것이 도장으로만 정해지므로 **먹이는
 * 순서가 달라도 결과가 같다** — ④ 가 성립하는 근거가 이것이다.
 *
 * 블록 속성(kind·align·indent·table)도 같은 규칙의 키별 LWW 다.
 *
 * ── 자리표에는 상한이 있다 ─────────────────────────────────────────────────
 *
 * wire.ts 는 자리표를 80마디까지, `td` 의 열쇠를 1024자까지만 읽는다. 그런데
 * `between` 이 만드는 자리표는 **같은 틈에 자꾸 끼워 넣으면 깊어진다.** 두
 * 사람이 같은 문단 같은 자리에 번갈아 한 자씩 넣는 시험에서 303라운드째부터
 * 내가 낸 `ti` 가 상대의 `readOp` 를 통과하지 못했고(깊이 81), 700라운드 뒤
 * 두 사람의 본문이 서로 달랐다. **내가 만든 것을 남이 못 읽는 것이 갈림의
 * 원인이었다.**
 *
 * 그래서 이 파일은 자리표를 **직접 재고**(`gatePos`), 상한을 넘으면 넣지
 * 않는다. 상한은 wire 보다 좁다(깊이 64·열쇠 1000자). 규칙이 자리표만 보고
 * 정해지므로 **모든 자리가 같은 것을 거른다** — 한쪽만 글자가 남는 일이 없다.
 * 대신 그 틈은 「더 못 넣는 자리」가 된다. 잃는 것을 적어 둔다:
 *
 *   · 두 사람이 **같은 자리에** 동시에 250번쯤 넣으면 그 틈이 막힌다.
 *     한 칸 옆(다른 틈)에는 그대로 넣을 수 있다. 이어 쓰기·따로 쓰기는
 *     깊이가 2를 안 넘으므로 평생 안 걸린다.
 *   · 위조된 깊은 자리표는 아예 안 들어온다. 자리표의 마지막 마디 숫자가
 *     0 인 것도 거른다 — pos.ts 가 「마지막 마디는 1 이상」을 전제로 답을
 *     찾기 때문에, 그런 자리표가 하나라도 섞이면 그 뒤에 넣는 글자가
 *     엉뚱한 쪽으로 가고 깊이가 한 번에 81이 된다.
 *
 * ── 같은 자리 이름으로 다시 붙을 때 ────────────────────────────────────────
 *
 * use-collab 은 5분마다 채널에 다시 들어가고, 그때마다 동료의 state() 를 받아
 * `fromState(state, 내_자리이름)` 으로 **갈아탄다**(engine.adoptState). 자리
 * 이름은 그대로다. 그래서 새 인스턴스가 일련번호·램포트 시계를 0부터 다시
 * 세면 **이미 방송한 자리표와 도장을 그대로 되풀이한다** — 같은 자리표를 가진
 * 글자 두 개가 생겨 받는 순서에 따라 본문이 갈리고, 새 서식이 자기 예전
 * 도장에게 져서 조용히 안 먹는다(500판 중 500판 재현).
 *
 * 상태 한 벌에는 내 번호가 실려 있지 않다(동료가 만든 값이다). 그래서 자리
 * 이름별 **최고 수위표**(`HIGH`)를 모듈에 두고 번호를 거기서 이어 간다.
 * 한 탭이 자리 하나이므로 표에는 사실상 한 줄만 산다. 새로고침하면 자리
 * 이름부터 새로 뽑으므로(newSite) 표가 사라져도 겹칠 일이 없다.
 *
 * ── 검증하지 않은 것 · 남은 한계 ───────────────────────────────────────────
 *
 * ⚠ 이 파일은 `tests/editor-crdt.test.mjs` 의 무작위 수렴 시험(자리 서넛이 각자
 * 200회 편집하고 서로의 연산을 뒤섞어·중복해 주고받기 × 300회, 그리고 같은
 * 자리 이름으로 재합류하는 판)까지만 통과했다. **실제 브라우저 두 대를
 * Supabase broadcast 로 붙여 사람이 동시에 쳐 본 적은 없다.**
 *
 * ⚠ `state()` 는 상한이 없다. 자리표를 눌러 담지만(아래 §5) 고친 자리가
 * 많아질수록 커진다 — 실측으로 씨만 뿌린 30000자가 65KB, 그것을 2000번
 * 고친 판이 165KB 였다. 더 길거나 더 고치면 broadcast 페이로드 한계(256KB)를
 * 넘고, 그러면 DOC_STATE 가 조용히 버려져 **합류가 영영 안 끝난다.**
 * 상태를 쪼개 보내는 것은 use-collab 의 몫이고 아직 없다.
 *
 * ⚠ 묘비(`#gone`)와 구간(`#ranges`)은 지우는 길이 없다. 언제 올지 모르는 늦은
 * 연산을 막아야 하기 때문이다. 구간은 서로 먹는 것끼리 접히고(swallows) 이어
 * 친 되덮기는 한 묶음으로 합쳐지지만(insertText 의 RUN_MAX), 그래도 **문서
 * 수명 동안 단조롭게 는다.** 진짜로 지우려면 「모두가 받았다」를 아는 장치
 * (인과 안정성)가 필요하고 그건 이 파일 밖이다.
 */

import {
  ALIGNS,
  BLOCK_KINDS,
  BLOCK_META,
  MARKS,
  clampIndent,
  normalizeSpans,
  type Align,
  type Block,
  type BlockKind,
  type Highlight,
  type Mark,
  type RichDoc,
  type Span,
  type TableData,
  type TextColor,
} from "./model";
import {
  between,
  cmpPos,
  posKey,
  seedPositions,
  type Pos,
  type Site,
} from "./pos";
import type { BlockAttrs, BlockSkeleton, FmtPatch, Op } from "./wire";

// ===========================================================================
// 1. 값의 모양
// ===========================================================================

/** 키 하나마다 도장이 따로 붙는다. `b` 는 A 가, `h` 는 B 가 이길 수 있다. */
export type Fmt = Record<string, { v: string | boolean; t: number; s: string }>;

type Char = { pos: Pos; ch: string; fmt: Fmt };

type Attr = { v: unknown; t: number; s: string };

type BlockRec = {
  id: string;
  /** `bi` 가 아직 안 왔으면 null. 이 상태의 블록은 snapshot 에서 뺀다. */
  pos: Pos | null;
  attrs: Record<string, Attr>;
};

type RangeRec = {
  from: Pos;
  to: Pos;
  patch: FmtPatch;
  t: number;
  s: string;
  /** 미리 펼쳐 둔 「키·값」 짝. 글자마다 patch 를 다시 펼치지 않으려고 든다. */
  e: Array<[string, string | boolean]>;
};

/** 표의 뼈대. 칸 글자는 여기 없다 — 그릇으로 따로 산다. */
type SkelCell = { id: string; align?: Align; colSpan?: number };
type SkelRow = { cells: SkelCell[] };
type TableSkel = { widths: number[]; header: boolean; rows: SkelRow[] };

/** 블록 속성으로 받아 주는 칸. 모르는 칸은 버린다 — 안 그러면 무한히 쌓인다. */
const ATTR_KEYS = ["kind", "align", "indent", "table"] as const;

/** 서식 한 벌에 담아 주는 키의 수. 신호 크기와 상태 크기를 함께 묶는다. */
const MAX_PATCH_KEYS = 8;

/**
 * 되덮기 구간을 한 묶음으로 잇는 최대 글자 수(insertText 참조).
 *
 * 크게 잡으면 구간이 덜 쌓이고, 작게 잡으면 한 자 칠 때 다시 훑는 글자가
 * 줄어든다. 512는 「한 문단을 이어 치는 동안 구간 서넛」과 「타건 하나당
 * 최대 512칸 훑기(1ms 아래)」가 만나는 자리다.
 */
const RUN_MAX = 512;

/**
 * 표 크기 상한 — model.ts 의 `parseTable` 과 **같은 값이어야 한다.**
 * 그 파일이 내보내지 않아 여기 한 번 더 적었다. 한쪽만 고치면 저장했다 다시
 * 연 문서의 표가 달라진다.
 */
const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLS = 20;

/**
 * 받아 주는 램포트 시계의 상한.
 *
 * 도장은 신호에 실려 오고 그 신호는 위조할 수 있다. `t = 1e300` 짜리를 한 번
 * 받아 그대로 따라 올리면 그 뒤로 내가 만드는 모든 도장이 그 값을 넘어서서,
 * 남들의 정직한 서식이 영영 못 이긴다. **받은 값을 저장은 하되**(그래야 모두가
 * 같은 승자를 고른다) 내 시계는 여기까지만 따라 올린다.
 */
const MAX_CLOCK = 2 ** 40;

/**
 * 자리표 상한 — wire.ts 보다 **좁게** 잡는다(머리말 「자리표에는 상한이 있다」).
 *
 * isPos 는 80마디까지, `td` 의 열쇠는 1024자까지 읽는다. 거기에 딱 맞추면
 * 「내가 넣을 때는 통과했는데 지울 때 열쇠가 길어 안 통과하는」 어긋남이
 * 생긴다 — 열쇠 길이는 마디 수뿐 아니라 자리 이름·일련번호 자릿수에도 달려
 * 있기 때문이다. 넣기(ti)·지우기(td)·서식(tf)이 **함께** 통과하는 값으로
 * 한 번에 잘라 둔다.
 */
const MAX_POS_DEPTH = 64;
const MAX_POS_KEY = 1000;

/** 상태 한 벌을 되읽을 때 받아 주는 글자 수. 되풀이 표시(§5)가 힙 폭탄이 안 되게. */
const MAX_STATE_CHARS = 400_000;
const MAX_CONTAINER_CHARS = 100_000;

/**
 * 자리 이름별 최고 수위.
 *
 * 같은 자리 이름으로 인스턴스를 다시 만들 때(재합류) 예전에 쓴 일련번호·도장을
 * 되쓰지 않게 하는 표다. 머리말 「같은 자리 이름으로 다시 붙을 때」 참조.
 * 한 탭이 자리 하나라 줄이 하나뿐이고, 자리 이름은 새로고침마다 새로 뽑는다.
 */
const HIGH = new Map<Site, { clock: number; seq: number }>();

function highOf(site: Site): { clock: number; seq: number } {
  let rec = HIGH.get(site);
  if (!rec) {
    rec = { clock: 0, seq: 0 };
    HIGH.set(site, rec);
  }
  return rec;
}

// ===========================================================================
// 2. 자잘한 도구
// ===========================================================================

/** 블록 id·그릇 이름으로 쓸 수 있는가. wire.ts 의 isId 와 **같은 규칙이어야 한다.** */
function okId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 32;
}

/**
 * 자리표를 재고 열쇠를 돌려준다. 못 쓸 자리표면 null.
 *
 * 넣는 길(#putChar·#putBlock·#applyRange)과 되읽는 길(fromState)이 **모두 이
 * 함수 하나만** 본다. 규칙이 자리표만 보고 정해지므로 어느 자리에서 재도 같은
 * 답이 나오고, 그래서 「나는 넣었는데 남은 안 넣은」 갈림이 생기지 않는다.
 *
 * 마지막 마디의 숫자가 0 인 자리표를 거르는 것이 중요하다. pos.ts 의 between
 * 은 「마지막 마디는 1 이상」을 전제로 답을 찾는다. 그 전제를 깨는 자리표가
 * 목록에 하나 섞이면, 그 앞에 넣으려던 글자가 그 뒤로 들어가고(자리표가
 * 접두사가 되어 버린다) 깊이가 한 번에 81이 되어 남이 못 읽는다.
 */
function gatePos(pos: unknown): string | null {
  if (!Array.isArray(pos) || pos.length === 0 || pos.length > MAX_POS_DEPTH) return null;
  let key = "";
  for (let i = 0; i < pos.length; i += 1) {
    const ident = pos[i] as unknown;
    if (!Array.isArray(ident) || ident.length !== 3) return null;
    const [d, s, n] = ident as unknown[];
    if (typeof d !== "number" || !Number.isSafeInteger(d) || d < 0) return null;
    if (typeof s !== "string" || !s || s.length > 8) return null;
    if (typeof n !== "number" || !Number.isSafeInteger(n)) return null;
    if (i === pos.length - 1 && d < 1) return null;
    key += `${d}.${s}.${n}|`;
    if (key.length > MAX_POS_KEY) return null;
  }
  return key;
}

/**
 * 서식을 「뗀다」는 뜻의 값.
 *
 * FmtPatch 의 `null` 은 「떼라」다. 그런데 키를 지워 버리면 도장이 함께
 * 사라져서 **더 오래된 서식이 나중에 도착했을 때 그것을 막을 방법이 없다.**
 * 그래서 지우는 대신 그 키의 「아무것도 아닌 값」을 도장과 함께 적어 둔다.
 * normalizeSpans 가 false·default·none 을 어차피 지우므로 화면 결과는 같다.
 */
function neutralOf(key: string): string | boolean {
  if (key === "c") return "default";
  if (key === "h") return "none";
  return false;
}

/**
 * 새 도장이 이기는가.
 *
 * 램포트 시계 → 자리 이름 순. 도장이 완전히 같은 일은 정직한 연산에서는
 * 없지만(한 자리가 같은 시계로 두 번 도장을 찍지 않는다), 위조된 신호에서는
 * 있을 수 있어서 값 자체로 한 번 더 가른다. 갈림쇠가 없으면 「먼저 온 쪽이
 * 남는」 순서 의존이 생긴다.
 */
function beats(t: number, s: string, v: unknown, cur: { v: unknown; t: number; s: string }): boolean {
  if (t !== cur.t) return t > cur.t;
  if (s !== cur.s) return s > cur.s;
  return stable(v) > stable(cur.v);
}

/** 값 비교용 문자열. 표 뼈대 같은 객체까지 결정적으로 줄 세우기 위한 것이다. */
function stable(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v) ?? "";
}

/**
 * `a` 가 `b` 를 통째로 먹는가 — 범위가 `b` 를 품고, 키를 다 품고, 도장이 크다.
 *
 * 그러면 `b` 는 **어떤 글자에도** 영향을 못 준다. `b` 의 범위 안 글자는 전부
 * `a` 의 범위 안이기도 하고, 그 글자의 모든 키에서 `a` 가 이기기 때문이다.
 * 나중에 그 범위에 떨어지는 글자도 같다(#putChar 가 두 구간을 다 보고, 역시
 * `a` 가 이긴다). 그래서 `b` 를 버려도 화면이 안 바뀐다.
 *
 * 「품는다」가 「겹친다」가 아닌 것이 중요하다. 부분만 겹치면 `a` 밖의 글자에는
 * `b` 가 여전히 살아 있다. 그리고 이 관계는 옮겨간다(품음·키·도장이 다
 * 옮겨가는 관계다) — 그래서 어떤 순서로 받아도 **남는 구간 집합이 같다.**
 */
function swallows(a: RangeRec, b: RangeRec): boolean {
  if (a.t !== b.t ? a.t < b.t : a.s <= b.s) return false;
  if (cmpPos(a.from, b.from) > 0 || cmpPos(a.to, b.to) < 0) return false;
  for (let i = 0; i < b.e.length; i += 1) {
    let found = false;
    for (let j = 0; j < a.e.length; j += 1) {
      if (a.e[j][0] === b.e[i][0]) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  const n = Math.floor(v);
  return n < lo ? lo : n > hi ? hi : n;
}

/** 정렬된 배열에서 `pos` 가 들어갈 첫 자리. */
function lowerBound(arr: Char[], pos: Pos): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmpPos(arr[mid].pos, pos) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 자리표 열쇠를 다시 자리표로.
 *
 * `td` 는 자리표가 아니라 열쇠(문자열)만 싣는다(wire.ts). 열쇠로 글자를 찾으려면
 * 그릇을 통째로 훑어야 하는데, 열쇠를 되읽어 이진 탐색하면 한 문단이 길어도
 * 값이 싸다. 되읽기에 실패하면(위조된 열쇠·소수점 좌표) null 을 주고,
 * 부르는 쪽이 훑기로 넘어간다.
 */
function parseKey(key: string): Pos | null {
  if (!key.endsWith("|")) return null;
  const parts = key.slice(0, -1).split("|");
  if (!parts.length) return null;
  const out: Pos = [];
  for (const part of parts) {
    const m = /^(\d+)\.([^.|]+)\.(-?\d+)$/.exec(part);
    if (!m) return null;
    out.push([Number(m[1]), m[2], Number(m[3])]);
  }
  return out;
}

/**
 * 대입하면 안 되는 키.
 *
 * `out["__proto__"] = v` 는 평범한 객체에서 **칸이 생기지 않는다** — 값이
 * 문자열이면 조용히 삼켜지고, 객체면 그 객체의 조상이 바뀐다. 그래서 세었는데
 * 비어 있는 patch(`{}` 인데 「있다」고 돌려주는 값)가 만들어지고, 아무 서식도
 * 아닌 `tf` 가 구간으로 영영 쌓인다. 값이 문자열·참거짓뿐이라 진짜 오염은
 * 안 되지만, 「빈 서식은 undefined」라는 이 함수의 약속이 깨진다.
 */
function unsafeKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

/** 신호로 나갈 수 있는 모양으로 서식을 다듬는다. 빈 것은 undefined. */
function cleanPatch(raw: FmtPatch | undefined): FmtPatch | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: FmtPatch = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    if (n >= MAX_PATCH_KEYS) break;
    if (!key || key.length > 12 || unsafeKey(key)) continue;
    const v = raw[key];
    if (v !== null && typeof v !== "string" && typeof v !== "boolean") continue;
    if (typeof v === "string" && v.length > 16) continue;
    out[key] = v;
    n += 1;
  }
  return n ? out : undefined;
}

/**
 * 서식 한 벌을 「키·값」 짝의 배열로 미리 펼쳐 둔다.
 *
 * 구간 서식 하나가 글자 2만 개에 먹는 일이 있는데(문단 전체 굵게), 글자마다
 * `Object.keys(patch)` 를 부르면 그 2만 번이 전부 **배열 할당**이다. 위조된
 * 신호 한 통(tf 800개)이 이 길로만 30초를 먹었다. 한 번 펼쳐 두고 돌려 쓴다.
 */
function patchEntries(patch: FmtPatch): Array<[string, string | boolean]> {
  const out: Array<[string, string | boolean]> = [];
  for (const key of Object.keys(patch)) {
    const raw = patch[key];
    out.push([key, raw === null ? neutralOf(key) : raw]);
  }
  return out;
}

/** 같은 서식인지 문자열 하나로 가른다. 구간 중복 열쇠에 쓴다. */
function canonPatch(patch: FmtPatch): string {
  const keys = Object.keys(patch).sort();
  let out = "";
  for (const key of keys) out += `${key}=${String(patch[key])};`;
  return out;
}

/** 글자 하나가 담은 서식을 토막 하나로. 아는 값인지는 normalizeSpans 가 본다. */
function spanOf(ch: Char): Span {
  const span: Span = { t: ch.ch };
  const marks: Mark[] = [];
  for (const m of MARKS) if (ch.fmt[m]?.v === true) marks.push(m);
  if (marks.length) span.m = marks;
  const c = ch.fmt.c?.v;
  if (typeof c === "string" && c !== "default") span.c = c as TextColor;
  const h = ch.fmt.h?.v;
  if (typeof h === "string" && h !== "none") span.h = h as Highlight;
  return span;
}

/** 토막에 붙은 서식을 넣기용 한 벌로. */
function patchOf(span: Span): FmtPatch | undefined {
  const patch: FmtPatch = {};
  if (Array.isArray(span.m)) for (const m of span.m) patch[m] = true;
  if (span.c && span.c !== "default") patch.c = span.c;
  if (span.h && span.h !== "none") patch.h = span.h;
  return cleanPatch(patch);
}

function readKind(v: unknown): BlockKind {
  return (BLOCK_KINDS as readonly string[]).includes(v as string) ? (v as BlockKind) : "body";
}

function readAlign(v: unknown): Align | null {
  return (ALIGNS as readonly string[]).includes(v as string) ? (v as Align) : null;
}

/**
 * 칸 이름을 만든다. 블록 id 와 줄·칸 번호로만 만들어 난수를 안 쓴다 —
 * 같은 연산을 받은 모든 자리가 같은 이름을 얻어야 그 칸의 글자가 한 그릇에 모인다.
 *
 * ⚠ **자르는 자리가 앞이다.** 예전에는 `${blockId}-${r}-${c}`.slice(0, 32) 였는데,
 * 블록 id 가 29자를 넘으면 꼬리(줄·칸 번호)가 통째로 잘려 **모든 칸이 같은 이름**
 * 이 되었다. 그러면 표의 네 칸이 그릇 하나를 함께 써서 한 칸에 친 글자가 모든
 * 칸에 나타난다(32자 id 로 재현했다). 블록 id 는 newId() 가 10자로 만들지만
 * parseRichDoc 은 남이 준 id 를 32자까지 그대로 받으므로 가져온 문서로 닿는다.
 */
function cellId(blockId: string, r: number, c: number): string {
  const tail = `-${r}-${c}`;
  const room = 32 - tail.length;
  return `${room > 0 ? blockId.slice(0, room) : ""}${tail}`;
}

/**
 * 표 뼈대를 믿지 않고 읽는다. model.ts 의 `parseTable` 과 같은 규칙이다 —
 * 다르면 저장했다 다시 연 표가 화면에서 달라진다.
 *
 * 칸 id 가 없거나 겹치면 **블록 id + 줄·칸 번호**로 만들어 준다(cellId).
 * 난수를 쓰지 않는 것이 중요하다: 같은 연산을 받은 모든 자리가 같은 칸 id 를
 * 얻어야 그 칸의 글자 그릇이 하나로 모인다.
 */
function normTable(raw: unknown, blockId: string): TableSkel | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as { rows?: unknown; widths?: unknown; header?: unknown };
  if (!Array.isArray(src.rows) || src.rows.length === 0) return null;

  const rows: SkelRow[] = [];
  const seen = new Set<string>();
  const limit = Math.min(src.rows.length, MAX_TABLE_ROWS);
  for (let r = 0; r < limit; r += 1) {
    const row = src.rows[r] as { cells?: unknown } | null;
    if (!row || typeof row !== "object" || !Array.isArray(row.cells)) continue;
    const cells: SkelCell[] = [];
    const wide = Math.min(row.cells.length, MAX_TABLE_COLS);
    for (let c = 0; c < wide; c += 1) {
      const raw2 = row.cells[c] as { id?: unknown; align?: unknown; colSpan?: unknown } | null;
      if (!raw2 || typeof raw2 !== "object") continue;
      let id = typeof raw2.id === "string" && raw2.id ? raw2.id.slice(0, 32) : cellId(blockId, r, c);
      if (seen.has(id)) id = cellId(blockId, r, c);
      // 만들어 준 이름마저 겹치면(남이 그 이름을 먼저 써 버렸다) 꼬리를 바꿔
      // 가며 빈 이름을 찾는다. 이 되풀이도 난수를 안 쓴다.
      for (let k = 0; seen.has(id) && k < 100; k += 1) {
        id = `${cellId(blockId, r, c).slice(0, 29)}~${k}`;
      }
      if (seen.has(id)) continue; // 여기까지 왔으면 그 칸은 버린다
      seen.add(id);
      const cell: SkelCell = { id };
      const align = readAlign(raw2.align);
      if (align) cell.align = align;
      if (typeof raw2.colSpan === "number" && raw2.colSpan > 1) {
        cell.colSpan = Math.min(Math.floor(raw2.colSpan), MAX_TABLE_COLS);
      }
      cells.push(cell);
    }
    if (cells.length) rows.push({ cells });
  }
  if (!rows.length) return null;

  const cols = Math.max(
    1,
    ...rows.map((r) => r.cells.reduce((n, c) => n + Math.max(1, c.colSpan ?? 1), 0)),
  );
  const widths =
    Array.isArray(src.widths) && src.widths.length === cols
      ? (src.widths as unknown[]).map((w) => (typeof w === "number" && w > 0 ? w : 1))
      : new Array<number>(cols).fill(1);

  return { widths, header: src.header !== false, rows };
}

/** kind 는 table 인데 뼈대가 없을 때. 난수를 안 쓰므로 자리마다 같은 표가 된다. */
function defaultSkel(blockId: string): TableSkel {
  return {
    widths: [1, 1],
    header: true,
    rows: [0, 1].map((r) => ({
      cells: [0, 1].map((c) => ({ id: cellId(blockId, r, c) })),
    })),
  };
}

/**
 * 상태 한 벌에서 되읽을 때 쓴다. 못 쓸 자리표면 null.
 *
 * 남이 통째로 만들어 보낸 값이라 연산으로 들어오는 것과 **같은 자로 재야**
 * 한다(gatePos). 상태로 들어온 것만 상한을 넘어 살아 있으면, 합류한 사람만
 * 가진 글자가 생기고 그 글자는 지울 수도 없다(td 열쇠가 안 통과한다).
 */
function readPos(v: unknown): Pos | null {
  if (!gatePos(v)) return null;
  return (v as unknown[]).map((ident) => {
    const [d, s, n] = ident as [number, string, number];
    return [d, s, n] as [number, string, number];
  });
}

// ===========================================================================
// 3. 본체
// ===========================================================================

export class DocCrdt {
  readonly site: Site;

  #clock = 0;
  /** 자리표 마디에 붙는 일련번호. 같은 자리 안에서만 안 겹치면 된다. */
  #seq = 0;

  #blocks = new Map<string, BlockRec>();
  #text = new Map<string, Char[]>();
  #dead = new Set<string>();
  /** 그릇별로 지워진 자리표 열쇠(묘비). 머리말 ② 참조. */
  #gone = new Map<string, Set<string>>();
  #ranges = new Map<string, RangeRec[]>();
  /** 같은 구간 서식을 두 번 받아도 한 번만 쌓기 위한 색인. */
  #rangeKeys = new Map<string, Set<string>>();

  /**
   * snapshot 은 매 렌더 불린다. 편집이 없었으면 지난번 것을 그대로 준다.
   * ⚠ 돌려준 값을 부르는 쪽에서 고치면 안 된다 — 다음 렌더에 그대로 다시 나온다.
   */
  #snap: RichDoc | null = null;
  #order: BlockRec[] | null = null;
  /**
   * 그릇별로 만들어 둔 토막. 한 글자를 쳤을 뿐인데 문서 전체의 토막을 다시
   * 만들면(글자마다 Span 객체 + normalizeSpans 의 Set) 3만 자 문서에서 타건
   * 하나가 100ms 를 넘는다 — 화면이 손가락을 못 따라온다. 바뀐 그릇만 버린다.
   */
  #spans = new Map<string, Span[]>();

  /** 이 자리 이름의 최고 수위(머리말 참조). 인스턴스를 새로 만들어도 이어진다. */
  #high: { clock: number; seq: number };

  /**
   * 지금 이어 치는 중인 되덮기 구간. insertText 만 본다.
   *
   * 사람은 한 번에 한 곳에서 친다 — 그래서 한 칸이면 충분하다. 이 값이
   * 틀려도 갈리지 않는다(구간을 하나 더 낼 뿐이다).
   */
  #run: { container: string; first: Pos; last: Pos; mark: string; n: number } | null = null;

  /** 원격 묶음을 처리하는 동안 미뤄 둔 구간. 묶음 밖에서는 null 이다(apply 참조). */
  #pending: Array<[string, RangeRec]> | null = null;

  constructor(site: Site) {
    this.site = site;
    this.#high = highOf(site);
  }

  // ── 만들기 ───────────────────────────────────────────────────────────────

  /**
   * 스냅샷에서 결정적으로 씨를 뿌린다.
   *
   * 난수를 한 번도 쓰지 않는다. 같은 RichDoc 을 연 두 사람은 **반드시 같은
   * 자리표**를 얻고, 그래서 「누가 먼저 열어 기준을 잡느냐」는 경쟁이 사라진다
   * (pos.ts 의 seedPositions 주석). use-collab 의 합류 절차가 이것에 기댄다.
   *
   * 씨로 뿌린 서식·속성의 도장은 `(0, "")` — 가장 약하다. 그래야 나중에 오는
   * 어떤 편집도 씨를 이긴다.
   */
  static seed(doc: RichDoc, site: Site): DocCrdt {
    const out = new DocCrdt(site);
    const blocks = Array.isArray(doc?.blocks) ? doc.blocks : [];
    const spots = seedPositions(blocks.length);

    blocks.forEach((b, i) => {
      // id 가 32자를 넘으면 그 블록의 연산을 남이 못 읽는다(wire.isId). 씨 단계에서
      // 걸러 두면 「나에게만 있는 블록」이 생기지 않는다. parseRichDoc 을 거친
      // 문서는 이미 32자로 잘려 있으므로 여기 걸리는 것은 손으로 만든 값뿐이다.
      if (!b || !okId(b.id)) return;
      if (out.#blocks.has(b.id)) return; // 겹친 id — 뒤엣것을 버린다
      const rec: BlockRec = { id: b.id, pos: spots[i], attrs: {} };
      rec.attrs.kind = { v: b.kind, t: 0, s: "" };
      if (b.align) rec.attrs.align = { v: b.align, t: 0, s: "" };
      if (b.indent) rec.attrs.indent = { v: b.indent, t: 0, s: "" };
      out.#blocks.set(b.id, rec);

      if (b.kind === "table") {
        const skel = normTable(b.table, b.id) ?? defaultSkel(b.id);
        rec.attrs.table = { v: skel, t: 0, s: "" };
        const rows = b.table?.rows ?? [];
        skel.rows.forEach((row, r) => {
          row.cells.forEach((cell, c) => {
            out.#seedText(cell.id, rows[r]?.cells?.[c]?.spans ?? []);
          });
        });
      } else {
        out.#seedText(b.id, b.spans);
      }
    });

    return out;
  }

  #seedText(container: string, spans: readonly Span[] | undefined): void {
    if (!Array.isArray(spans) || !spans.length) return;
    if (this.#text.has(container)) return;
    const cells: Array<{ ch: string; patch: FmtPatch | undefined }> = [];
    for (const span of spans) {
      if (!span || typeof span.t !== "string") continue;
      const patch = patchOf(span);
      for (const ch of span.t) cells.push({ ch, patch });
    }
    if (!cells.length) return;
    const spots = seedPositions(cells.length);
    const arr: Char[] = cells.map((cell, i) => {
      const fmt: Fmt = {};
      if (cell.patch) applyPatch(fmt, cell.patch, 0, "");
      return { pos: spots[i], ch: cell.ch, fmt };
    });
    this.#text.set(container, arr);
  }

  // ── 상태 한 벌 ───────────────────────────────────────────────────────────

  /**
   * 합류한 사람에게 보낼 상태 한 벌.
   *
   * 지도(Map)의 순회 순서는 넣은 순서라 자리마다 다르다. 그대로 내보내면
   * **같은 문서인데 상태 한 벌이 다르게 보여** 시험도 사람도 비교를 못 한다.
   * 그래서 여기서 전부 줄을 세운다(정규형). 값이 싸지는 않지만 이 함수는
   * 합류할 때 한 번 부른다.
   *
   * 글자는 §5 의 눌러 담는 방식으로 적는다. 자리표를 글자마다 그대로 적으면
   * 8000자 문서의 상태가 215KB 라 broadcast 한 통(256KB)에 못 실린다.
   */
  state(): unknown {
    const blocks = [...this.#blocks.values()]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((rec) => [rec.id, rec.pos, packStamped(rec.attrs)]);

    // 빈 그릇은 뺀다. **이게 없으면 자리마다 상태 한 벌이 달라진다:** 글자를
    // 넣었다 지운 자리에는 빈 배열이 남지만, `td` 를 `ti` 보다 먼저 받은 자리는
    // 그 그릇을 만든 적조차 없다(머리말 ②). 화면에는 어차피 같은 값이다.
    const sites = new SiteTable();
    const text = [...this.#text.entries()]
      .filter(([, arr]) => arr.length > 0)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, arr]) => packChars(id, arr, sites));

    const gone = [...this.#gone.entries()]
      .filter(([, keys]) => keys.size > 0)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, keys]) => [id, [...keys].sort()]);

    const ranges = [...this.#ranges.entries()]
      .filter(([, list]) => list.length > 0)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, list]) => [
        id,
        // 도장까지 같은 구간(위조된 신호)이 둘일 수 있어 자리표로 한 번 더
        // 가른다. 여기서 순서가 흔들리면 「같은 문서인가」를 물을 수 없다.
        [...list]
          .sort(
            (a, b) =>
              (a.t !== b.t ? a.t - b.t : 0) ||
              (a.s < b.s ? -1 : a.s > b.s ? 1 : 0) ||
              cmpPos(a.from, b.from) ||
              cmpPos(a.to, b.to),
          )
          .map((r) => [r.from, r.to, r.patch, r.t, r.s]),
      ]);

    return {
      v: 2,
      clock: this.#clock,
      sites: sites.list(),
      blocks,
      text,
      dead: [...this.#dead].sort(),
      gone,
      ranges,
    };
  }

  /** 남이 보낸 상태 한 벌을 읽는다. 모양이 아니면 null — 예외를 던지지 않는다. */
  static fromState(state: unknown, site: Site): DocCrdt | null {
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    const src = state as Record<string, unknown>;
    if (src.v !== 2) return null;
    if (!Array.isArray(src.blocks) || !Array.isArray(src.text)) return null;
    if (!Array.isArray(src.dead) || !Array.isArray(src.gone) || !Array.isArray(src.ranges)) {
      return null;
    }
    const sites: string[] = Array.isArray(src.sites)
      ? (src.sites as unknown[]).map((s) => (typeof s === "string" && s.length <= 8 ? s : ""))
      : [];

    const out = new DocCrdt(site);
    if (typeof src.clock === "number" && Number.isSafeInteger(src.clock) && src.clock > 0) {
      out.#clock = Math.min(src.clock, MAX_CLOCK);
    }
    /**
     * 이 상태에 이미 내 자리 이름으로 찍힌 일련번호가 있으면 거기서 이어 간다.
     * 최고 수위표(#high)가 같은 일을 하지만 그것은 이 탭의 기억이고, 이쪽은
     * **동료가 기억하는 내 흔적**이다. 둘 중 큰 쪽을 쓴다.
     */
    let seen = 0;
    const mark = (p: Pos | null): void => {
      if (!p) return;
      for (const ident of p) {
        if (ident[1] !== site) continue;
        if (Number.isSafeInteger(ident[2]) && ident[2] > seen && ident[2] < MAX_CLOCK) seen = ident[2];
      }
    };

    for (const raw of src.blocks) {
      if (!Array.isArray(raw) || raw.length < 3) continue;
      const [id, pos, attrs] = raw as [unknown, unknown, unknown];
      if (!okId(id)) continue;
      const at = pos === null ? null : readPos(pos);
      if (pos !== null && at === null) continue;
      mark(at);
      const read = readStamped(attrs, true) as Record<string, Attr>;
      // 표 뼈대는 여기서 한 번 더 정돈한다. 연산으로 들어오는 길은 이미
      // normTable 을 거치지만 상태 한 벌은 남이 통째로 만들어 보낸 값이고,
      // 모양이 아닌 것이 그대로 들어오면 **snapshot 이 터진다.**
      if (read.table) {
        const skel = normTable(read.table.v, id);
        if (skel) read.table.v = skel;
        else delete read.table;
      }
      out.#blocks.set(id, { id, pos: at, attrs: read });
    }

    let budget = MAX_STATE_CHARS;
    for (const raw of src.text) {
      const got = unpackChars(raw, sites, budget);
      if (!got) continue;
      budget -= got.arr.length;
      for (const c of got.arr) mark(c.pos);
      // 보낸 쪽이 순서를 어겼을 수도 있다. 정렬은 이 자료구조의 불변식이다.
      got.arr.sort((a, b) => cmpPos(a.pos, b.pos));
      out.#text.set(got.id, got.arr);
    }

    for (const id of src.dead) if (okId(id)) out.#dead.add(id);

    for (const raw of src.gone) {
      if (!Array.isArray(raw) || raw.length < 2) continue;
      const [id, keys] = raw as [unknown, unknown];
      if (!okId(id) || !Array.isArray(keys)) continue;
      const set = new Set<string>();
      // 열쇠도 자로 잰다. 위조된 긴 열쇠(1024자까지 통과한다)를 그대로 담아 두면
      // 상태 한 벌이 몇백 KB 씩 불어나 합류 절차가 죽는다. 정직한 열쇠는 30자 언저리다.
      for (const k of keys) {
        if (typeof k !== "string" || !k) continue;
        const pos = parseKey(k);
        const norm = pos ? gatePos(pos) : null;
        if (norm) set.add(norm);
      }
      if (set.size) out.#gone.set(id, set);
    }

    for (const raw of src.ranges) {
      if (!Array.isArray(raw) || raw.length < 2) continue;
      const [id, list] = raw as [unknown, unknown];
      if (!okId(id) || !Array.isArray(list)) continue;
      for (const item of list) {
        if (!Array.isArray(item) || item.length < 5) continue;
        const from = readPos(item[0]);
        const to = readPos(item[1]);
        const patch = cleanPatch(item[2] as FmtPatch);
        if (!from || !to || !patch) continue;
        if (typeof item[3] !== "number" || !Number.isFinite(item[3])) continue;
        if (typeof item[4] !== "string" || item[4].length > 8) continue;
        mark(from);
        mark(to);
        out.#keepRange(id, from, to, patch, item[3], item[4]);
      }
    }

    if (seen > out.#seq) out.#seq = seen;
    return out;
  }

  // ── 조회 ─────────────────────────────────────────────────────────────────

  /**
   * 지금 상태를 문서로. 편집이 없었으면 지난번 값을 그대로 준다.
   * (React 가 `===` 로 렌더를 건너뛸 수 있게 하는 것이기도 하다)
   */
  snapshot(): RichDoc {
    if (this.#snap) return this.#snap;
    const blocks: Block[] = [];
    for (const rec of this.#sorted()) {
      const kind = readKind(rec.attrs.kind?.v);
      const meta = BLOCK_META[kind];
      // 칸 순서는 model.ts 의 parseRichDoc 과 같아야 한다. 저장 → 다시 읽기를
      // 거친 문서와 글자 그대로 같아야 왕복 시험이 성립한다.
      const block: Block = { id: rec.id, kind, spans: meta.text ? this.#spansOf(rec.id) : [] };
      const align = readAlign(rec.attrs.align?.v);
      if (align && align !== "left") block.align = align;
      if (meta.indentable) {
        const indent = clampIndent(rec.attrs.indent?.v);
        if (indent > 0) block.indent = indent;
      }
      if (kind === "table") block.table = this.#tableOf(rec);
      blocks.push(block);
    }
    this.#snap = { v: 1, blocks };
    return this.#snap;
  }

  containerText(container: string): string {
    const arr = this.#text.get(container);
    if (!arr || !arr.length) return "";
    let out = "";
    for (const c of arr) out += c.ch;
    return out;
  }

  /**
   * 그 자리의 서식. 도구모음이 「지금 굵기가 켜져 있나」를 보이는 데 쓴다.
   *
   * 커서 왼쪽 글자를 본다 — 편집기의 관행이고, 「굵게 켠 뒤 이어 치기」가
   * 그렇게 동작해야 자연스럽다. 맨 앞이면 오른쪽 글자를 본다.
   */
  formatAt(container: string, offset: number): FmtPatch {
    const arr = this.#text.get(container);
    if (!arr || !arr.length) return {};
    const at = clampInt(offset, 0, arr.length);
    const ch = arr[at > 0 ? at - 1 : 0];
    const out: FmtPatch = {};
    for (const key of Object.keys(ch.fmt)) out[key] = ch.fmt[key].v;
    return out;
  }

  /** 문서 순서대로의 블록 id. `bi` 가 안 온 블록은 빠진다. */
  blockIds(): string[] {
    return this.#sorted().map((rec) => rec.id);
  }

  // ── 지역 편집 ────────────────────────────────────────────────────────────

  /**
   * ⚠ 자리표가 상한을 넘으면 **거기서 멈춘다**(머리말 「자리표에는 상한이
   * 있다」). 그때는 돌려주는 연산이 친 글자 수보다 적다 — 부르는 쪽이 화면을
   * snapshot 으로 다시 그리므로 글자 수는 저절로 맞는다.
   */
  insertText(container: string, offset: number, text: string, fmt?: FmtPatch): Op[] {
    if (!okId(container)) return []; // 남이 못 읽을 이름이면 나만 가진 글이 된다
    const cps = [...text];
    if (!cps.length) return [];
    const arr = this.#ensure(container);
    const at = clampInt(offset, 0, arr.length);
    const after: Pos | null = at < arr.length ? arr[at].pos : null;
    let before: Pos | null = at > 0 ? arr[at - 1].pos : null;
    const patch = cleanPatch(fmt);

    const ops: Op[] = [];
    let first: Pos | null = null;
    let last: Pos | null = null;
    for (const ch of cps) {
      const pos = between(before, after, this.site, this.#nextSeq());
      // 내가 만든 자리표도 잰다. 여기서 안 재면 남의 readOp 가 대신 걸러서
      // **나에게만 있는 글자**가 된다(같은 틈에 오래 번갈아 넣으면 깊어진다).
      if (!this.#putChar(container, pos, ch, patch)) break;
      ops.push(patch ? ["ti", container, pos, ch, patch] : ["ti", container, pos, ch]);
      if (!first) first = pos;
      last = pos;
      before = pos;
    }

    // 넣은 글자가 남이 걸어 둔 구간 서식 안에 떨어졌을 수 있다. 그러면 내가
    // 부탁한 서식이 그 구간에 먹히는데(머리말 ④), 사용자가 굵게를 켜고 친
    // 글자가 안 굵게 나오는 것은 버그로 보인다. 그럴 때만 **내 도장을 찍은**
    // 구간 서식을 하나 더 낸다 — 그러면 모두가 같은 결론에 이른다.
    if (patch && first && last) {
      const over: FmtPatch = {};
      let any = false;
      const lo = lowerBound(arr, first);
      for (const key of Object.keys(patch)) {
        const want = patch[key] === null ? neutralOf(key) : patch[key];
        for (let i = lo; i < arr.length && i < lo + cps.length; i += 1) {
          const cur = arr[i].fmt[key];
          if (cur && cur.v !== want) {
            over[key] = patch[key];
            any = true;
            break;
          }
        }
      }
      if (any) {
        // 사람은 한 자씩 친다. 타건마다 되덮기 구간이 하나씩 쌓이면 2000자를
        // 치는 동안 구간이 2001개가 되고 상태 한 벌이 300KB 를 넘는다.
        // **이어 친 것이면 지난 구간을 늘려 다시 낸다** — 늘린 구간이 지난
        // 구간을 통째로 먹으므로(swallows) 모든 자리에서 하나로 접힌다.
        // 「이어 쳤다」는 지난 구간의 끝 바로 다음 칸에 이번 글자가 온 것으로
        // 본다. 사이에 남의 글자가 끼었으면 늘리지 않는다.
        const mark = canonPatch(over);
        let from = first;
        let n = cps.length;
        const run = this.#run;
        // ⚠ 늘린 구간은 그 안의 글자에 **다시** 먹는다. 끝없이 늘리면 한 자
        // 칠 때마다 지금까지 친 글자를 전부 훑어 O(n²) 이 된다. 그래서 한
        // 묶음의 길이를 자른다 — 구간 수는 글자 수의 1/RUN_MAX 로 억제되고
        // 훑는 값은 언제나 RUN_MAX 안이다.
        if (run && run.container === container && run.mark === mark && run.n + n <= RUN_MAX) {
          const at = lowerBound(arr, run.last);
          if (at + 1 === lo && at < arr.length && cmpPos(arr[at].pos, run.last) === 0) {
            from = run.first;
            n += run.n;
          }
        }
        ops.push(this.#format(container, from, last, over));
        this.#run = { container, first: from, last, mark, n };
      }
    }

    this.#touchText(container);
    return ops;
  }

  deleteText(container: string, from: number, to: number): Op[] {
    if (!okId(container)) return [];
    const arr = this.#text.get(container);
    if (!arr || !arr.length) return [];
    const a = clampInt(from, 0, arr.length);
    const b = clampInt(to, 0, arr.length);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi <= lo) return [];

    const cut = arr.splice(lo, hi - lo);
    const gone = this.#tomb(container);
    const ops: Op[] = [];
    for (const c of cut) {
      // 그릇에 든 글자는 넣을 때 이미 상한을 통과했으므로(#putChar) 여기서
      // 만드는 열쇠는 `td` 의 1024자 안에 반드시 든다.
      const key = posKey(c.pos);
      gone.add(key);
      ops.push(["td", container, key]);
    }
    this.#touchText(container);
    return ops;
  }

  formatText(container: string, from: number, to: number, patch: FmtPatch): Op[] {
    if (!okId(container)) return [];
    const arr = this.#text.get(container);
    if (!arr || !arr.length) return [];
    const a = clampInt(from, 0, arr.length);
    const b = clampInt(to, 0, arr.length);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi <= lo) return [];
    const clean = cleanPatch(patch);
    if (!clean) return [];
    const op = this.#format(container, arr[lo].pos, arr[hi - 1].pos, clean);
    this.#touchText(container);
    return [op];
  }

  /**
   * afterId 가 null 이면 맨 앞. 못 찾으면 맨 뒤에 붙인다.
   *
   * 이미 있는 id·죽은 id 로 부르면 아무 연산도 내지 않는다. 그 id 를 그대로
   * 쓰면 **남의 블록을 덮어쓰고 그 사람 글자가 내 그릇으로 흘러든다.**
   * 부르는 쪽이 model.ts 의 newId() 로 새 id 를 받아 오면 될 일이다.
   *
   * 32자를 넘는 id 도 같다. 예전에는 로컬에만 블록이 생기고 낸 `bi` 는 남의
   * wire.isId 에서 걸려 **나에게만 있는 블록**이 됐다(newId 는 10자지만
   * parseRichDoc 은 남이 준 id 를 32자까지 받는다).
   */
  insertBlock(afterId: string | null, block: Block): Op[] {
    if (!block || !okId(block.id)) return [];
    if (this.#dead.has(block.id) || this.#blocks.has(block.id)) return [];

    const order = this.#sorted();
    let idx = -1;
    if (afterId !== null) {
      idx = order.findIndex((rec) => rec.id === afterId);
      if (idx < 0) idx = order.length - 1;
    }
    const before = idx >= 0 ? order[idx].pos : null;
    const after = idx + 1 < order.length ? order[idx + 1].pos : null;
    const pos = between(before, after, this.site, this.#nextSeq());

    const skel: BlockSkeleton = { id: block.id, kind: readKind(block.kind) };
    const align = readAlign(block.align);
    if (align && align !== "left") skel.align = align;
    const indent = clampIndent(block.indent);
    if (indent > 0) skel.indent = indent;
    let table: TableSkel | null = null;
    if (skel.kind === "table") {
      table = normTable(block.table, block.id) ?? defaultSkel(block.id);
      skel.table = table;
    }

    // 블록 자리표도 잰다. 못 쓸 자리표면 아무것도 안 한다 — 나만 가진 블록이
    // 생기느니 「안 만들어졌다」가 낫다(붙임 문단 하나를 다시 누르면 된다).
    if (!this.#putBlock(pos, skel)) return [];
    const ops: Op[] = [["bi", pos, skel]];

    // 글자는 뼈대에 실리지 않는다. 그릇에 자기 자리표로 따로 들어간다.
    if (BLOCK_META[skel.kind as BlockKind]?.text) {
      ops.push(...this.#appendSpans(block.id, block.spans));
    }
    if (table) {
      const rows = block.table?.rows ?? [];
      table.rows.forEach((row, r) => {
        row.cells.forEach((cell, c) => {
          ops.push(...this.#appendSpans(cell.id, rows[r]?.cells?.[c]?.spans ?? []));
        });
      });
    }

    this.#touch();
    return ops;
  }

  deleteBlock(id: string): Op[] {
    if (!okId(id) || this.#dead.has(id)) return [];
    this.#killBlock(id);
    this.#touch();
    return [["bd", id]];
  }

  setBlockAttrs(id: string, attrs: BlockAttrs): Op[] {
    if (!okId(id) || this.#dead.has(id)) return [];
    const clean = this.#cleanAttrs(id, attrs);
    if (!Object.keys(clean).length) return [];
    const t = this.#tick();
    this.#putAttrs(id, clean, t, this.site);
    this.#touch();
    return [["ba", id, clean, [t, this.site]]];
  }

  /**
   * 표의 뼈대만 갈아 끼운다. 칸 글자는 그대로 둔다 — 줄을 더해도 아래 칸의
   * 글자가 안 흔들리는 이유가 이것이다(글자는 칸 id 로 산다).
   *
   * ⚠ 뼈대 전체가 LWW 한 칸이다. 동시에 고치면 나중 도장이 통째로 이긴다.
   */
  setTable(id: string, table: TableData): Op[] {
    if (!okId(id) || this.#dead.has(id)) return [];
    const skel = normTable(table, id);
    if (!skel) return [];
    const t = this.#tick();
    this.#putAttrs(id, { table: skel }, t, this.site);

    const ops: Op[] = [["ba", id, { table: skel }, [t, this.site]]];
    // 새로 생긴 칸에 글자가 실려 왔으면(예: 줄 복제) 그 글자도 넣어 준다.
    // 이미 그릇이 있는 칸은 건드리지 않는다 — 지웠던 글자가 되살아난다.
    const rows = table?.rows ?? [];
    skel.rows.forEach((row, r) => {
      row.cells.forEach((cell, c) => {
        if (this.#text.has(cell.id)) return;
        ops.push(...this.#appendSpans(cell.id, rows[r]?.cells?.[c]?.spans ?? []));
      });
    });

    this.#touch();
    return ops;
  }

  // ── 원격 반영 ────────────────────────────────────────────────────────────

  /**
   * 모르는 모양은 조용히 버린다. 예외를 던지면 남의 콘솔 한 줄로 내 편집기가
   * 죽는다(wire.ts 머리말). 한 연산이 터져도 같은 묶음의 나머지는 반영한다.
   */
  apply(ops: Op[]): boolean {
    if (!Array.isArray(ops)) return false;
    let changed = false;
    // 구간 서식은 여기서 바로 글자에 먹이지 않고 묶음이 끝날 때 한 번에 먹인다
    // (#flush). 한 통에 800개까지 오는데(readOps), 같은 범위를 덮는 것들은
    // 서로를 먹어 하나만 남는다 — 그 하나만 훑으면 된다. 바로 먹이면 2만 자
    // 문단에 tf 800개짜리 한 통이 **주 스레드를 수십 초 멈춘다.**
    const pending: Array<[string, RangeRec]> = [];
    this.#pending = pending;
    try {
      for (const op of ops) {
        try {
          if (this.#one(op)) changed = true;
        } catch {
          // 여기 들어오면 그 연산 하나를 못 읽은 것이다. 문서는 그대로 둔다.
        }
      }
    } finally {
      this.#pending = null;
      this.#flush(pending);
    }
    if (changed) this.#touch();
    return changed;
  }

  /** 미뤄 둔 구간을 그릇별로 모아 한 번에 먹인다. 그 사이 먹힌 구간은 건너뛴다. */
  #flush(pending: Array<[string, RangeRec]>): void {
    if (!pending.length) return;
    const byContainer = new Map<string, RangeRec[]>();
    const live = new Map<string, Set<RangeRec>>();
    for (const [container, rec] of pending) {
      let set = live.get(container);
      if (!set) {
        set = new Set(this.#ranges.get(container) ?? []);
        live.set(container, set);
      }
      if (!set.has(rec)) continue; // 이 묶음 안에서 더 센 구간에 먹혔다
      const list = byContainer.get(container);
      if (list) list.push(rec);
      else byContainer.set(container, [rec]);
    }
    for (const [container, recs] of byContainer) {
      if (recs.length === 1) this.#sweep(container, recs[0]);
      else this.#sweepMany(container, recs);
    }
  }

  /** 구간 하나를 그 범위의 글자에 먹인다. */
  #sweep(container: string, rec: RangeRec): void {
    const arr = this.#text.get(container);
    if (!arr) return;
    for (let i = lowerBound(arr, rec.from); i < arr.length; i += 1) {
      if (cmpPos(arr[i].pos, rec.to) > 0) break;
      applyEntries(arr[i].fmt, rec.e, rec.t, rec.s);
    }
  }

  /**
   * 구간 여럿을 글자 한 번 훑기로 먹인다.
   *
   * 구간마다 따로 훑으면 「구간 수 × 글자 수」다. 위조된 신호 한 통(tf 800개)이
   * 2만 자 문단에 오면 1600만 번이 되고 주 스레드가 1분 넘게 멎는다.
   *
   * 그래서 **도장이 큰 것부터** 먹이고, 글자 하나에서 남은 구간의 키가 전부
   * 이미 더 센 도장으로 채워졌으면 거기서 멈춘다. 결과는 그대로다 — 남은
   * 구간들은 어차피 그 글자의 모든 키에서 지기 때문이다(키별 LWW). 같은 범위를
   * 덮는 tf 800개가 글자마다 두 번 만에 끝난다.
   *
   * 키가 서른 개를 넘으면(위조) 비트로 셀 수 없으니 이른 멈춤 없이 그냥 돈다.
   */
  #sweepMany(container: string, recs: RangeRec[]): void {
    const arr = this.#text.get(container);
    if (!arr || !arr.length) return;
    recs.sort((a, b) => (a.t !== b.t ? b.t - a.t : a.s < b.s ? 1 : a.s > b.s ? -1 : 0));

    const bit = new Map<string, number>();
    let overflow = false;
    for (const r of recs) {
      for (const [k] of r.e) {
        if (bit.has(k)) continue;
        if (bit.size >= 30) {
          overflow = true;
          break;
        }
        bit.set(k, 1 << bit.size);
      }
      if (overflow) break;
    }

    const n = recs.length;
    const mask = new Array<number>(n);
    const lo = new Array<number>(n);
    const hi = new Array<number>(n);
    let from = arr.length;
    let to = 0;
    for (let i = 0; i < n; i += 1) {
      let m = 0;
      if (!overflow) for (const [k] of recs[i].e) m |= bit.get(k) ?? 0;
      mask[i] = m;
      lo[i] = lowerBound(arr, recs[i].from);
      let end = lowerBound(arr, recs[i].to);
      if (end < arr.length && cmpPos(arr[end].pos, recs[i].to) === 0) end += 1;
      hi[i] = end;
      if (lo[i] < from) from = lo[i];
      if (end > to) to = end;
    }
    /** suffix[i] = i번째부터 남은 구간들이 건드리는 키 묶음. */
    const suffix = new Array<number>(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i -= 1) suffix[i] = suffix[i + 1] | mask[i];

    for (let c = from; c < to; c += 1) {
      const fmt = arr[c].fmt;
      let done = 0;
      let lastT = 0;
      let lastS = "";
      let any = false;
      for (let i = 0; i < n; i += 1) {
        // 남은 구간의 키가 이미 **더 센** 도장으로 다 채워졌으면 끝이다.
        // 도장이 같은 구간(위조)이 섞이면 값으로 갈려야 하므로 멈추지 않는다.
        if (any && !overflow && (done & suffix[i]) === suffix[i]) {
          if (lastT !== recs[i].t ? lastT > recs[i].t : lastS > recs[i].s) break;
        }
        if (c < lo[i] || c >= hi[i]) continue;
        applyEntries(fmt, recs[i].e, recs[i].t, recs[i].s);
        done |= mask[i];
        lastT = recs[i].t;
        lastS = recs[i].s;
        any = true;
      }
    }
  }

  #one(op: Op): boolean {
    if (!Array.isArray(op)) return false;
    switch (op[0]) {
      case "ti": {
        const [, container, pos, ch, fmt] = op;
        // 한 자리표에 코드포인트 하나 — 이 규약이 깨지면 offset 셈이 어긋난다.
        if ([...ch].length !== 1) return false;
        return this.#putChar(container, pos, ch, cleanPatch(fmt));
      }
      case "td":
        return this.#killChar(op[1], op[2]);
      case "tf": {
        const [, container, from, to, patch, stamp] = op;
        this.#observe(stamp[0]);
        const clean = cleanPatch(patch);
        if (!clean) return false;
        return this.#applyRange(container, from, to, clean, stamp[0], stamp[1]);
      }
      case "bi":
        return this.#putBlock(op[1], op[2]);
      case "bd":
        return this.#killBlock(op[1]);
      case "ba": {
        const [, id, attrs, stamp] = op;
        this.#observe(stamp[0]);
        const clean = this.#cleanAttrs(id, attrs);
        if (!Object.keys(clean).length) return false;
        return this.#putAttrs(id, clean, stamp[0], stamp[1]);
      }
      default:
        return false;
    }
  }

  // ── 속살 ─────────────────────────────────────────────────────────────────

  /**
   * 다음 도장의 램포트 시계.
   *
   * 내 시계뿐 아니라 **이 자리 이름이 지금까지 찍은 최고값**보다 크게 잡는다.
   * 재합류로 인스턴스를 갈아타면 동료의 상태에서 온 시계로 되감기는데(그
   * 동료는 내 도장을 아직 못 봤을 수 있다), 그대로 두면 내가 방금 찍은 도장을
   * 다시 찍어 서식이 조용히 안 먹는다.
   */
  #tick(): number {
    const t = (this.#clock > this.#high.clock ? this.#clock : this.#high.clock) + 1;
    this.#clock = t;
    this.#high.clock = t;
    return t;
  }

  #observe(t: number): void {
    if (Number.isSafeInteger(t) && t > this.#clock && t <= MAX_CLOCK) this.#clock = t;
  }

  /** 자리표 일련번호. 시계와 같은 이유로 최고 수위에서 이어 간다. */
  #nextSeq(): number {
    const n = (this.#seq > this.#high.seq ? this.#seq : this.#high.seq) + 1;
    this.#seq = n;
    this.#high.seq = n;
    return n;
  }

  #touch(): void {
    this.#snap = null;
    this.#order = null;
  }

  /** 그 그릇의 글자가 바뀌었다. 만들어 둔 토막을 버린다. */
  #touchText(container: string): void {
    this.#spans.delete(container);
    this.#snap = null;
    this.#order = null;
  }

  #ensure(container: string): Char[] {
    let arr = this.#text.get(container);
    if (!arr) {
      arr = [];
      this.#text.set(container, arr);
    }
    return arr;
  }

  #tomb(container: string): Set<string> {
    let set = this.#gone.get(container);
    if (!set) {
      set = new Set();
      this.#gone.set(container, set);
    }
    return set;
  }

  #sorted(): BlockRec[] {
    if (this.#order) return this.#order;
    const out: BlockRec[] = [];
    for (const rec of this.#blocks.values()) if (rec.pos !== null) out.push(rec);
    // 자리표가 같을 수는 없지만(마지막 마디에 자리 이름과 일련번호가 들어간다)
    // 위조된 신호까지 생각해 id 로 한 번 더 가른다. 순서가 흔들리면 화면이 튄다.
    out.sort((a, b) => {
      const c = cmpPos(a.pos as Pos, b.pos as Pos);
      return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    this.#order = out;
    return out;
  }

  /**
   * 그릇 하나의 토막. **만들어 둔 것이 있으면 그대로 준다.**
   *
   * snapshot 은 편집마다 도는데(engine.bump), 글자 하나를 쳤다고 문서 300개
   * 문단의 토막을 전부 다시 만들면 3만 자에서 타건 하나가 100ms 를 넘어간다.
   * 글자가 바뀐 그릇만 #touchText 로 버리므로, 나머지는 여기서 바로 돌아온다.
   */
  #spansOf(container: string): Span[] {
    const memo = this.#spans.get(container);
    if (memo) return memo;
    const arr = this.#text.get(container);
    if (!arr || !arr.length) return [];
    const raw: Span[] = [];
    for (const c of arr) raw.push(spanOf(c));
    // 이웃한 같은 서식을 합치는 것은 normalizeSpans 가 한다. 합치지 않으면
    // 글자 수만큼 토막이 생겨 저장 크기가 열 배가 된다(model.ts 주석).
    const out = normalizeSpans(raw);
    this.#spans.set(container, out);
    return out;
  }

  #tableOf(rec: BlockRec): TableData {
    const skel = (rec.attrs.table?.v as TableSkel | undefined) ?? defaultSkel(rec.id);
    // 이 값은 normTable 을 거쳐 들어오지만, snapshot 은 매 렌더 도는 자리라
    // 여기서 한 번 터지면 편집기가 통째로 하얘진다. 한 겹 더 받쳐 둔다.
    const rows = (Array.isArray(skel.rows) ? skel.rows : defaultSkel(rec.id).rows).filter(
      (row) => row && Array.isArray(row.cells),
    );
    return {
      widths: Array.isArray(skel.widths) ? skel.widths.slice() : [1, 1],
      header: skel.header !== false,
      rows: rows.map((row) => ({
        cells: row.cells.map((cell) => ({
          id: cell.id,
          spans: this.#spansOf(cell.id),
          ...(cell.align ? { align: cell.align } : {}),
          ...(cell.colSpan ? { colSpan: cell.colSpan } : {}),
        })),
      })),
    };
  }

  /** 그릇 맨 뒤에 토막들을 이어 붙이고 그 연산을 돌려준다. */
  #appendSpans(container: string, spans: readonly Span[] | undefined): Op[] {
    if (!okId(container) || !Array.isArray(spans) || !spans.length) return [];
    const arr = this.#ensure(container);
    let before: Pos | null = arr.length ? arr[arr.length - 1].pos : null;
    const ops: Op[] = [];
    for (const span of spans) {
      if (!span || typeof span.t !== "string") continue;
      const patch = patchOf(span);
      for (const ch of span.t) {
        const pos = between(before, null, this.site, this.#nextSeq());
        // insertText 와 같은 이유로 넣기에 실패하면 멈춘다(머리말의 자리표 상한).
        if (!this.#putChar(container, pos, ch, patch)) return ops;
        ops.push(patch ? ["ti", container, pos, ch, patch] : ["ti", container, pos, ch]);
        before = pos;
      }
    }
    return ops;
  }

  /**
   * 글자 하나를 그릇에 넣는다.
   *
   * 넣기 전에 셋을 본다: 쓸 수 있는 자리표인가(gatePos), 이미 지워진 자리인가
   * (머리말 ②), 그 그릇의 구간 서식 중 이 자리를 품는 것이 있는가(머리말 ④).
   * 구간 서식은 도장을 들고 있으므로 **먹이는 순서가 결과를 바꾸지 않는다.**
   */
  #putChar(container: string, pos: Pos, ch: string, patch: FmtPatch | undefined): boolean {
    if (!okId(container)) return false;
    const key = gatePos(pos);
    if (!key) return false; // 상한을 넘거나 모양이 아닌 자리표 — 모두가 똑같이 거른다
    if (this.#gone.get(container)?.has(key)) return false;

    const arr = this.#ensure(container);
    const at = lowerBound(arr, pos);
    if (at < arr.length && cmpPos(arr[at].pos, pos) === 0) {
      // 같은 자리표가 이미 있다. 대개는 같은 신호를 두 번 받은 것이라 할 일이
      // 없지만, **글자나 서식이 다르면 그냥 버리면 안 된다** — 「먼저 온 쪽이
      // 남는」 순서 의존이 되어 본문이 자리마다 영구히 갈린다(beats() 가 도장에
      // 대해 적어 둔 것과 같은 구멍이다). 정직한 연산에서는 자리표 마지막 마디에
      // 자리 이름과 일련번호가 들어가 이런 일이 없지만, 위조된 신호에는 있다.
      //
      // 글자는 큰 쪽이 이기고, 서식은 두 벌을 도장 0 으로 합친다. 둘 다 도착
      // 순서와 무관한 셈(최댓값·합집합)이라 어느 자리에서 봐도 같은 답이 된다.
      const cur = arr[at];
      let changed = false;
      if (ch > cur.ch) {
        cur.ch = ch;
        changed = true;
      }
      if (patch && applyEntries(cur.fmt, patchEntries(patch), 0, "")) changed = true;
      if (changed) this.#touchText(container);
      return changed;
    }

    const fmt: Fmt = {};
    // 넣을 때 붙인 서식은 도장이 가장 약하다(0). 나중에 오는 어떤 구간 서식도
    // 이것을 이긴다 — 그래야 「썼다가 나중에 굵게」가 자리마다 같게 끝난다.
    if (patch) applyEntries(fmt, patchEntries(patch), 0, "");
    const ranges = this.#ranges.get(container);
    if (ranges) {
      for (const r of ranges) {
        if (cmpPos(r.from, pos) <= 0 && cmpPos(pos, r.to) <= 0) applyEntries(fmt, r.e, r.t, r.s);
      }
    }

    arr.splice(at, 0, { pos, ch, fmt });
    this.#touchText(container);
    return true;
  }

  /**
   * 글자 하나를 지운다. 열쇠는 자리표로 되읽어 **정규형으로** 담는다.
   *
   * 되읽지 못하는 열쇠는 버린다. 예전에는 훑기로 넘어갔는데 두 가지가 나빴다:
   * ① 위조된 열쇠 하나가 2만 자 문단을 통째로 훑게 만들고(한 통이면 2초),
   * ② 「0001.z.1|」처럼 겉모습만 다른 열쇠를 그대로 묘비에 담으면 나중에 온
   *    `ti` 가 만드는 열쇠(「1.z.1|」)와 안 맞아 **막아야 할 글자를 못 막는다.**
   *    받은 순서에 따라 글자가 살고 죽는다.
   */
  #killChar(container: string, key: string): boolean {
    if (!okId(container) || !key) return false;
    const pos = parseKey(key);
    const norm = pos ? gatePos(pos) : null;
    if (!pos || !norm) return false;

    const gone = this.#tomb(container);
    if (gone.has(norm)) return false;
    gone.add(norm);

    const arr = this.#text.get(container);
    if (arr && arr.length) {
      const at = lowerBound(arr, pos);
      if (at < arr.length && cmpPos(arr[at].pos, pos) === 0) arr.splice(at, 1);
    }
    this.#touchText(container);
    return true;
  }

  /** 구간 서식을 남기고(④) 이미 있는 글자에 먹인다. */
  #applyRange(
    container: string,
    from: Pos,
    to: Pos,
    patch: FmtPatch,
    t: number,
    s: string,
  ): boolean {
    if (!okId(container)) return false;
    // 구간의 두 끝도 글자와 같은 자로 잰다. 정직한 구간의 끝은 언제나 그
    // 그릇에 있는 글자의 자리표라 반드시 통과한다.
    if (!gatePos(from) || !gatePos(to)) return false;
    // 거꾸로 뒤집힌 구간이 올 수 있다(위조·버그). 버리지 않고 바로 세운다 —
    // 버리면 자리마다 「버렸는가」가 갈릴 여지가 없지만, 바로 세우면 그 서식이
    // 뜻한 대로 먹힌다. 어느 쪽이든 결정적이므로 쓸모 있는 쪽을 골랐다.
    const lo = cmpPos(from, to) <= 0 ? from : to;
    const hi = cmpPos(from, to) <= 0 ? to : from;

    // 이미 받아 둔 구간이거나 더 센 구간에 먹힌 구간이면 여기서 끝난다.
    const rec = this.#keepRange(container, lo, hi, patch, t, s);
    if (!rec) return false;

    // 원격 묶음 안이면 미뤄 둔다(apply 참조). 지역 편집은 바로 먹인다.
    if (this.#pending) this.#pending.push([container, rec]);
    else this.#sweep(container, rec);

    // 글자에 아무것도 안 먹었어도 「바뀌었다」다 — 구간이 하나 늘었고, 그것이
    // 앞으로 들어올 글자의 서식을 정한다(머리말 ④).
    this.#touchText(container);
    return true;
  }

  /**
   * 구간을 쌓아 둔다. 이미 있거나 쓸모없는 구간이면 null.
   *
   * 거르는 것 둘:
   *
   *   ① **똑같은 구간**(도장·범위·서식이 다 같다). 두 번 쌓여도 화면 결과는
   *      같지만 상태 한 벌이 자리마다 달라진다. ⚠ 열쇠에 서식이 들어가야
   *      한다 — 예전에는 도장과 범위만 봐서, 도장·범위가 같고 서식만 다른
   *      두 `tf` 중 **먼저 온 것만 남았다.** 재합류로 도장이 되감기면 실제로
   *      그런 짝이 생겼고, 받는 순서에 따라 굵게와 형광펜이 갈렸다.
   *
   *   ② **더 센 구간에 통째로 먹힌 구간.** 범위가 같고, 키를 다 품고, 도장이
   *      큰 구간이 이미 있으면 새 구간은 어떤 글자에도 영향을 못 준다(모든
   *      키에서 진다). 그런 것은 안 쌓고 글자에 먹이지도 않는다. 반대로 새
   *      구간이 옛 구간을 먹으면 옛 것을 버린다. 「먹힘」은 구간 집합만 보고
   *      정해지고 옮겨가는 관계라, 어떤 순서로 받아도 남는 집합이 같다.
   *      위조된 신호가 전체 구간 `tf` 를 수천 개 보내도 하나로 접힌다.
   */
  #keepRange(
    container: string,
    from: Pos,
    to: Pos,
    patch: FmtPatch,
    t: number,
    s: string,
  ): RangeRec | null {
    let keys = this.#rangeKeys.get(container);
    if (!keys) {
      keys = new Set();
      this.#rangeKeys.set(container, keys);
    }
    const key = `${t}.${s}.${posKey(from)}.${posKey(to)}.${canonPatch(patch)}`;
    if (keys.has(key)) return null;
    keys.add(key);

    let list = this.#ranges.get(container);
    if (!list) {
      list = [];
      this.#ranges.set(container, list);
    }
    const rec: RangeRec = { from, to, patch, t, s, e: patchEntries(patch) };
    let eaten = false;
    for (const old of list) {
      if (swallows(old, rec)) return null;
      if (!eaten && swallows(rec, old)) eaten = true;
    }
    if (eaten) {
      let write = 0;
      for (let i = 0; i < list.length; i += 1) {
        if (!swallows(rec, list[i])) {
          list[write] = list[i];
          write += 1;
        }
      }
      list.length = write;
    }
    list.push(rec);
    return rec;
  }

  #format(container: string, from: Pos, to: Pos, patch: FmtPatch): Op {
    const t = this.#tick();
    this.#applyRange(container, from, to, patch, t, this.site);
    return ["tf", container, from, to, patch, [t, this.site]];
  }

  #putBlock(pos: Pos, skel: BlockSkeleton): boolean {
    if (!skel || !okId(skel.id)) return false;
    if (this.#dead.has(skel.id)) return false; // 머리말 ③
    // 블록 자리표도 글자와 같은 자로 잰다. 상한을 넘으면 어차피 남이 못 읽는다.
    if (!gatePos(pos)) return false;

    let rec = this.#blocks.get(skel.id);
    if (!rec) {
      rec = { id: skel.id, pos: null, attrs: {} };
      this.#blocks.set(skel.id, rec);
    }
    let changed = false;
    // 한 블록에 bi 가 두 번 오는 일은 정직한 연산에서는 없다(id 가 난수다).
    // 그래도 규칙을 정해 둔다 — 앞선 자리를 쓴다. 「먼저 온 것」이 아니라
    // 「작은 것」이라야 도착 순서와 무관하다.
    if (rec.pos === null || cmpPos(pos, rec.pos) < 0) {
      rec.pos = pos;
      changed = true;
    }
    // 뼈대에 실린 속성은 도장이 가장 약하다. 먼저 도착한 ba 가 이긴다.
    if (this.#mergeAttrs(rec, this.#cleanAttrs(skel.id, skel), 0, "")) changed = true;
    if (changed) this.#touch();
    return changed;
  }

  #killBlock(id: string): boolean {
    if (!okId(id) || this.#dead.has(id)) return false;
    this.#dead.add(id);
    // 글자는 그릇에 그대로 둔다 — 머리말 ③ 참조.
    this.#blocks.delete(id);
    this.#touch();
    return true;
  }

  #putAttrs(id: string, attrs: Record<string, unknown>, t: number, s: string): boolean {
    if (!okId(id) || this.#dead.has(id)) return false;
    let rec = this.#blocks.get(id);
    if (!rec) {
      // 아직 bi 가 안 온 블록의 속성이 먼저 왔다(머리말 ①). pos 는 null 로 둔다 —
      // 화면에는 안 그려지고, bi 가 오면 이 속성이 그대로 살아난다.
      rec = { id, pos: null, attrs: {} };
      this.#blocks.set(id, rec);
    }
    const changed = this.#mergeAttrs(rec, attrs, t, s);
    if (changed) this.#touch();
    return changed;
  }

  #mergeAttrs(rec: BlockRec, attrs: Record<string, unknown>, t: number, s: string): boolean {
    let changed = false;
    for (const key of Object.keys(attrs)) {
      const v = attrs[key];
      const cur = rec.attrs[key];
      if (cur && !beats(t, s, v, cur)) continue;
      if (cur && cur.t === t && cur.s === s && stable(cur.v) === stable(v)) continue;
      rec.attrs[key] = { v, t, s };
      changed = true;
    }
    return changed;
  }

  /** 아는 칸만 남기고, 표는 뼈대로 바꾼다(칸 글자는 그릇에 산다). */
  #cleanAttrs(id: string, raw: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!raw || typeof raw !== "object") return out;
    const src = raw as Record<string, unknown>;
    for (const key of ATTR_KEYS) {
      const v = src[key];
      if (v === undefined) continue;
      if (key === "kind") {
        if (typeof v === "string" && v.length <= 16) out.kind = v;
      } else if (key === "align") {
        if (typeof v === "string" && v.length <= 16) out.align = v;
      } else if (key === "indent") {
        if (typeof v === "number" && Number.isFinite(v)) out.indent = clampIndent(v);
      } else {
        const skel = normTable(v, id);
        if (skel) out.table = skel;
      }
    }
    return out;
  }
}

// ===========================================================================
// 4. 키별 LWW — 먹이기
// ===========================================================================

/**
 * 서식 한 벌을 도장과 함께 먹인다. 키마다 따로 겨룬다.
 *
 * 클래스 밖에 둔 이유는 seed 가 인스턴스를 만들기 전에도 쓰기 때문이다.
 */
function applyPatch(fmt: Fmt, patch: FmtPatch, t: number, s: string): boolean {
  return applyEntries(fmt, patchEntries(patch), t, s);
}

/**
 * 미리 펼쳐 둔 「키·값」 짝으로 먹인다.
 *
 * ⚠ 이긴 칸의 도장을 **제자리에서 고친다**(새 객체를 안 만든다). 구간 서식
 * 하나가 2만 자에 먹을 때 글자·키마다 `{v,t,s}` 를 새로 만들면 그것만으로
 * 수천만 번의 할당이 되고, 위조된 신호 한 통이 남의 탭을 수십 초 멈춘다.
 * 도장 객체를 밖으로 넘겨주는 곳이 없으므로(읽는 쪽은 `.v` 만 본다) 제자리
 * 수정이 안전하다 — 넘겨주게 되는 날 이 주석이 근거가 된다.
 */
function applyEntries(
  fmt: Fmt,
  entries: ReadonlyArray<[string, string | boolean]>,
  t: number,
  s: string,
): boolean {
  let changed = false;
  for (let i = 0; i < entries.length; i += 1) {
    const key = entries[i][0];
    const v = entries[i][1];
    const cur = fmt[key];
    if (cur) {
      if (!beats(t, s, v, cur)) continue;
      if (cur.v === v && cur.t === t && cur.s === s) continue;
      cur.v = v;
      cur.t = t;
      cur.s = s;
    } else {
      fmt[key] = { v, t, s };
    }
    changed = true;
  }
  return changed;
}

// ===========================================================================
// 5. 상태 한 벌 눌러 담기
//
// 자리표를 글자마다 그대로 적으면 `[[[524288,"~",5]],"가",[]]` — 글자 하나에
// 27자다. 8000자 문서의 상태 한 벌이 215KB 이고 broadcast 한 통은 256KB 라,
// 조금만 긴 문서는 합류가 **조용히** 실패한다(신호가 버려질 뿐 오류가 없다).
//
// 그릇 하나를 넷으로 나눠 적는다.
//
//   [그릇 이름, "글자들", 자리표 흐름, [[번째, 서식], …]]
//
// 자리표 흐름은 정수만 늘어놓은 배열이고, 한 토막이
//
//   깊이, (숫자차이, 자리 번호, 일련번호 차이) × 깊이, 되풀이
//
// 다. 차이는 **바로 앞 글자의 자리표**를 기준으로 잰다 — 목록이 자리표 순으로
// 정렬되어 있으므로 이웃한 두 자리표는 거의 같고, 차이는 한두 자리 숫자가 된다.
// 「되풀이」는 같은 차이 무늬가 몇 번 더 이어지는가다. 씨만 뿌린 문서는 모든
// 글자의 차이가 똑같아서(seedPositions 가 일정한 간격으로 매긴다) 문단 하나가
// 토막 두 개로 줄어든다 — 실측으로 30000자 문서가 808KB 에서 65KB 가 됐다.
// 서식도 같은 값이 이어지면 되풀이로 접는다(한 번에 건 서식은 도장까지 같다).
//
// ⚠ 되풀이 수는 **되읽는 쪽에서 반드시 잘라야 한다.** 안 그러면 20바이트짜리
// 상태 한 벌이 힙을 통째로 먹는다(압축 폭탄). 글자 수 상한 두 개가 그것이다.
// ===========================================================================

/** 자리 이름 사전. 같은 이름을 글자마다 다시 적지 않게 번호로 바꾼다. */
class SiteTable {
  #idx = new Map<string, number>();
  #list: string[] = [];

  index(s: string): number {
    let i = this.#idx.get(s);
    if (i === undefined) {
      i = this.#list.length;
      this.#list.push(s);
      this.#idx.set(s, i);
    }
    return i;
  }

  list(): string[] {
    return this.#list;
  }
}

function packChars(id: string, arr: Char[], sites: SiteTable): unknown[] {
  let text = "";
  const stream: number[] = [];
  const fmts: unknown[] = [];
  let prev: Pos | null = null;
  /** 지금 되풀이 중인 토막의 「되풀이」 칸이 흐름의 몇 번째인가. */
  let repAt = -1;
  let repKey = "";
  /** 서식도 같은 것이 이어진다 — 한 번에 서식을 건 구간은 도장까지 똑같다. */
  let fmtAt = -1;
  let fmtKey = "";
  let fmtEnd = -1;

  for (let i = 0; i < arr.length; i += 1) {
    const c = arr[i];
    text += c.ch;
    const packed = packStamped(c.fmt);
    if (packed.length) {
      const key = JSON.stringify(packed);
      if (fmtAt >= 0 && key === fmtKey && fmtEnd + 1 === i) {
        (fmts[fmtAt] as unknown[])[2] = ((fmts[fmtAt] as unknown[])[2] as number) + 1;
      } else {
        fmts.push([i, packed, 0]);
        fmtAt = fmts.length - 1;
        fmtKey = key;
      }
      fmtEnd = i;
    }

    const deltas: number[] = [];
    for (let j = 0; j < c.pos.length; j += 1) {
      const base = prev && j < prev.length ? prev[j] : null;
      deltas.push(c.pos[j][0] - (base ? base[0] : 0));
      deltas.push(sites.index(c.pos[j][1]));
      deltas.push(c.pos[j][2] - (base ? base[2] : 0));
    }
    const key = `${c.pos.length}:${deltas.join(",")}`;
    if (repAt >= 0 && key === repKey) {
      stream[repAt] += 1;
    } else {
      stream.push(c.pos.length, ...deltas, 0);
      repAt = stream.length - 1;
      repKey = key;
    }
    prev = c.pos;
  }

  return [id, text, stream, fmts];
}

/** 눌러 담은 그릇 하나를 되읽는다. 모양이 아니면 null, 이상한 데서 끊기면 거기까지. */
function unpackChars(
  raw: unknown,
  sites: string[],
  budget: number,
): { id: string; arr: Char[] } | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const [id, text, stream] = raw as [unknown, unknown, unknown];
  const fmts = raw[3];
  if (!okId(id) || typeof text !== "string" || !Array.isArray(stream)) return null;

  const chars = [...text];
  const limit = Math.min(chars.length, MAX_CONTAINER_CHARS, budget < 0 ? 0 : budget);
  /** 번째마다 한 칸. 걸러진 자리표가 있어도 「몇 번째 글자」가 안 흔들린다. */
  const slots: Array<Char | null> = new Array(limit).fill(null);

  let prev: Pos | null = null;
  let idx = 0;
  let at = 0;
  while (at < stream.length && idx < limit) {
    const depth = stream[at];
    at += 1;
    if (!Number.isSafeInteger(depth) || depth < 1 || depth > MAX_POS_DEPTH) break;
    if (at + depth * 3 >= stream.length) break; // 되풀이 칸까지 있어야 한다
    const base = at;
    at += depth * 3;
    const rep = stream[at];
    at += 1;
    if (!Number.isSafeInteger(rep) || rep < 0) break;

    let broken = false;
    for (let k = 0; k <= rep && idx < limit; k += 1) {
      const pos: Pos = [];
      for (let j = 0; j < depth; j += 1) {
        const b = prev && j < prev.length ? prev[j] : null;
        const dd = stream[base + j * 3];
        const si = stream[base + j * 3 + 1];
        const nd = stream[base + j * 3 + 2];
        if (!Number.isSafeInteger(dd) || !Number.isSafeInteger(nd)) {
          broken = true;
          break;
        }
        const s = typeof si === "number" ? sites[si] : undefined;
        if (typeof s !== "string" || !s || s.length > 8) {
          broken = true;
          break;
        }
        pos.push([(b ? b[0] : 0) + dd, s, (b ? b[2] : 0) + nd]);
      }
      if (broken) break;
      // 차이는 앞 글자를 기준으로 재므로, 걸러진 자리표도 기준으로는 남긴다.
      prev = pos;
      if (gatePos(pos)) slots[idx] = { pos, ch: chars[idx], fmt: {} };
      idx += 1;
    }
    if (broken) break;
  }

  if (Array.isArray(fmts)) {
    for (const item of fmts) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const i = item[0];
      if (typeof i !== "number" || !Number.isSafeInteger(i) || i < 0 || i >= limit) continue;
      const rep = typeof item[2] === "number" && Number.isSafeInteger(item[2]) && item[2] > 0 ? item[2] : 0;
      for (let k = 0; k <= rep && i + k < limit; k += 1) {
        const slot = slots[i + k];
        // 글자마다 따로 읽는다. 한 벌을 나눠 쓰면 한 글자에 걸린 서식이
        // 옆 글자까지 따라간다(도장을 제자리에서 고치기 때문이다).
        if (slot) slot.fmt = readStamped(item[1], false) as Fmt;
      }
    }
  }

  const arr: Char[] = [];
  for (const slot of slots) if (slot) arr.push(slot);
  return { id, arr };
}

// ===========================================================================
// 6. 키별 LWW · 도장 담기
// ===========================================================================

/** 상태 한 벌로 나갈 때: 키를 줄 세워 `[키, 값, 시계, 자리]` 로. */
function packStamped(map: Record<string, { v: unknown; t: number; s: string }>): unknown[] {
  return Object.keys(map)
    .sort()
    .map((key) => [key, map[key].v, map[key].t, map[key].s]);
}

/** 상태 한 벌에서 되읽기. `attrs` 는 아무 값이나, `fmt` 는 문자열·참거짓만. */
function readStamped(raw: unknown, anyValue: boolean): Record<string, { v: unknown; t: number; s: string }> {
  const out: Record<string, { v: unknown; t: number; s: string }> = {};
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 4) continue;
    const [key, v, t, s] = item as [unknown, unknown, unknown, unknown];
    if (typeof key !== "string" || !key || key.length > 12 || unsafeKey(key)) continue;
    if (typeof t !== "number" || !Number.isFinite(t)) continue;
    if (typeof s !== "string" || s.length > 8) continue;
    if (!anyValue && typeof v !== "string" && typeof v !== "boolean") continue;
    if (anyValue && v !== null && typeof v === "object" && Array.isArray(v)) continue;
    out[key] = { v, t, s };
  }
  return out;
}
