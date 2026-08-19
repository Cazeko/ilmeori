/**
 * 문서 모델 — 편집기와 내보내기가 함께 보는 하나의 모양.
 *
 * ── 왜 이 파일이 생겼는가 ───────────────────────────────────────────────────
 *
 * 지금까지 문서 항목의 편집 단위는 `<textarea>` 하나, 값은 평문 문자열 하나였다.
 * 그래서 표를 그리려면 띄어쓰기로 칸을 맞춰야 했고, 내보내기는 항목 제목을
 * 문자열로 뒤져 구조를 **추측**해야 했다(approval-export.ts 의 `includes("검토")`).
 * 추측은 사용자가 「사전 협의」라고 적는 순간 틀린다.
 *
 * 여기서는 문단 하나가 블록 하나다. 블록은 자기가 무엇인지(kind)를 알고 있고,
 * 글자마다 굵기·기울임이 붙는다. 내보내기는 물어보기만 하면 된다.
 *
 * ── 바깥을 부르지 않는다 ───────────────────────────────────────────────────
 *
 * `pack.ts` 와 같은 규칙이다 — import 가 하나도 없다. 그래야
 * `tests/editor-model.test.mjs` 가 이 파일을 그대로 불러 돌릴 수 있고,
 * 서버·브라우저 어느 쪽에서 불러도 딸려 오는 것이 없다.
 *
 * ── DB 에서 오는 값은 믿지 않는다 ───────────────────────────────────────────
 *
 * `document.blocks` 는 jsonb 다. 스키마가 강제하는 것은 「JSON 인가」까지이고,
 * 그 안이 우리가 기대하는 모양인지는 아무도 보장하지 않는다. 예전 판이 남아
 * 있을 수도 있고, 요청을 위조해 넣었을 수도 있다. 그래서 화면과 내보내기는
 * **반드시 `parseRichDoc()` 를 거친 값만** 본다.
 */

// ===========================================================================
// 1. 글자에 붙는 것 — 마크
// ===========================================================================

/**
 * 글자 서식.
 *
 *   b 굵게 · i 기울임 · u 밑줄 · s 취소선 · sup 위첨자 · sub 아래첨자
 *
 * 「글꼴 종류」와 「글자 크기」는 여기 없다. 공문서는 어느 자리에서 열어도 같은
 * 모양이어야 하고, 크기·글꼴을 문단마다 손으로 정하기 시작하면 그 순간
 * 문서 한 벌이 스무 가지 모양이 된다. 크기는 블록 갈래(kind)가 정한다.
 */
export const MARKS = ["b", "i", "u", "s", "sup", "sub"] as const;
export type Mark = (typeof MARKS)[number];

/** 위·아래첨자는 동시에 붙을 수 없다. 켜면 반대쪽이 꺼진다. */
const EXCLUSIVE: ReadonlyArray<readonly [Mark, Mark]> = [["sup", "sub"]];

/**
 * 글자색.
 *
 * 임의의 hex 를 받지 않는다. 받으면 KRDS 대비 규칙(4.5:1)이 문서 안에서
 * 조용히 깨지고, 그 문서가 그대로 결재에 올라간다. 고를 수 있는 것은
 * 이미 대비를 재 둔 토큰뿐이다(globals.css 의 실측표 참조).
 */
export const TEXT_COLORS = [
  "default",
  "primary",
  "accent",
  "danger",
  "gray",
] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

/** 형광펜. 같은 이유로 목록을 닫아 둔다. */
export const HIGHLIGHTS = ["none", "yellow", "green", "blue", "pink"] as const;
export type Highlight = (typeof HIGHLIGHTS)[number];

/**
 * 글자 토막 하나.
 *
 * 칸 이름을 한 글자로 줄인 이유는 이 값이 jsonb 로 저장되고 실시간 신호로도
 * 오가기 때문이다. 「bold」 대신 「b」 하나로 문서 하나에서 수 KB 가 준다.
 */
export type Span = {
  /** 글자. 빈 문자열인 토막은 정규화가 지운다. */
  t: string;
  /** 붙은 마크. MARKS 순서로 정렬되어 있다(정규화가 보장한다). */
  m?: Mark[];
  /** default 는 적지 않는다. */
  c?: TextColor;
  /** none 은 적지 않는다. */
  h?: Highlight;
};

// ===========================================================================
// 2. 블록
// ===========================================================================

/**
 * 블록 갈래.
 *
 *   title      문서 제목 — 가운데, 16pt
 *   heading    큰 항목  — 「1. 추진 배경」
 *   subheading 작은 항목 — 「가. 관련 근거」
 *   body       본문
 *   bullet     글머리표
 *   numbered   번호 목록 — 행정 서식의 항목 구분 순서를 따른다(아래 MARKER 참조)
 *   quote      인용
 *   source     근거 꼬리표 — 이 제품의 주장이 실리는 자리
 *   note       잔글씨 붙임말
 *   spacer     빈 줄
 *   divider    가로줄
 *   pagebreak  쪽 나눔
 *   table      표
 */
export const BLOCK_KINDS = [
  "title",
  "heading",
  "subheading",
  "body",
  "bullet",
  "numbered",
  "quote",
  "source",
  "note",
  "spacer",
  "divider",
  "pagebreak",
  "table",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export type Align = "left" | "center" | "right" | "justify";
export const ALIGNS = ["left", "center", "right", "justify"] as const;

/** 들여쓰기 단계. 0~5 — 아래 MARKER 표가 여섯 단이라 그 이상은 의미가 없다. */
export const MAX_INDENT = 5;

/** 표 한 칸. 칸마다 id 가 있는 이유는 crdt.ts 주석에 적었다. */
export type TableCell = {
  /** 칸을 가리키는 이름. 행·열이 움직여도 이 값은 그 칸을 따라다닌다. */
  id: string;
  spans: Span[];
  align?: Align;
  /** 가로 병합. 세로 병합은 만들지 않는다(pack.ts 와 같은 이유). */
  colSpan?: number;
};

export type TableRow = { cells: TableCell[] };

export type TableData = {
  /** 열 너비 비율. 합이 얼마든 내보낼 때 정규화한다. */
  widths: number[];
  /** 첫 줄이 칸 이름인가. 쪽이 넘어갈 때 되풀이할지를 이 값이 정한다. */
  header: boolean;
  rows: TableRow[];
};

export type Block = {
  id: string;
  kind: BlockKind;
  /** 글자. table·spacer·divider·pagebreak 는 비어 있다. */
  spans: Span[];
  align?: Align;
  /** 0~MAX_INDENT */
  indent?: number;
  /** kind === "table" 일 때만 있다. */
  table?: TableData;
};

/**
 * 문단에 달린 의견 한 줄.
 *
 * ── 왜 표를 새로 만들지 않았는가 ────────────────────────────────────────────
 *
 * 업무의 「대화」(comment 표)는 업무 전체에 대한 것이고, 이것은 **문단 하나**에
 * 대한 것이다. 표를 새로 만들면 RLS 정책 한 벌, 삭제 경로, 이력 트리거가 따라
 * 붙는다. 문서 안에 두면 그 문서를 볼 수 있는 사람이 정확히 이것도 볼 수 있고
 * (같은 행의 같은 칸이므로), 문서를 지우면 함께 사라지며, 이전 판에도 함께 남는다.
 *
 * 대신 잃는 것이 있다 — 「나에게 달린 의견」을 부서 전체에서 모아 볼 수 없다.
 * 그 화면이 필요해지면 그때 표로 옮긴다. 지금 필요한 것은 문단 옆의 한 줄이다.
 *
 * ── 왜 CRDT 를 거치지 않는가 ────────────────────────────────────────────────
 *
 * 의견은 글자 단위로 합칠 이유가 없다 — 한 사람이 한 번에 쓰고 끝난다.
 * id 별 LWW 로 충분하고, 그래서 편집기가 본문과 따로 들고 다닌다.
 */
export type DocComment = {
  id: string;
  /** 어느 블록에 달렸는가. 그 블록이 사라지면 이 의견도 갈 곳을 잃는다. */
  blockId: string;
  /** 블록 안의 글자 범위. 없으면 문단 전체에 달린 것이다. */
  from?: number;
  to?: number;
  /** 쓴 사람. 이름을 함께 박아 두는 것은 인사이동 때문이다(approval_step.position 과 같은 판단). */
  authorId: string;
  authorName: string;
  body: string;
  /** ISO 8601. */
  at: string;
  /** 해결됨 표시. 지우지 않고 접어 둔다 — 왜 그렇게 정했는지가 근거로 남아야 한다. */
  done?: boolean;
  /** 답글. 스레드 하나가 대화 하나다. */
  replies?: Array<{
    id: string;
    authorId: string;
    authorName: string;
    body: string;
    at: string;
  }>;
};

/** 저장되는 문서 한 벌. `v` 는 나중에 모양을 바꿀 때 갈라 읽기 위한 것이다. */
export type RichDoc = {
  v: 1;
  blocks: Block[];
  /**
   * 문단에 달린 의견.
   *
   * 선택 항목이다. CRDT 는 이 칸을 만들지도 읽지도 않는다 — 편집기가 저장할 때
   * 다시 붙인다(components/editor 참조). 그래서 `snapshot()` 의 결과에는 없다.
   */
  comments?: DocComment[];
};

const MAX_COMMENTS = 500;
const MAX_COMMENT_BODY = 2000;

function parseComments(value: unknown, rand: () => number): DocComment[] {
  if (!Array.isArray(value)) return [];
  const out: DocComment[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_COMMENTS)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<DocComment>;
    if (typeof c.blockId !== "string" || !c.blockId) continue;
    if (typeof c.body !== "string" || !c.body.trim()) continue;
    let id = typeof c.id === "string" && c.id ? c.id.slice(0, 32) : newId(rand);
    while (seen.has(id)) id = newId(rand);
    seen.add(id);
    out.push({
      id,
      blockId: c.blockId.slice(0, 32),
      ...(typeof c.from === "number" && c.from >= 0 ? { from: Math.floor(c.from) } : {}),
      ...(typeof c.to === "number" && c.to >= 0 ? { to: Math.floor(c.to) } : {}),
      authorId: typeof c.authorId === "string" ? c.authorId.slice(0, 64) : "",
      authorName: typeof c.authorName === "string" ? c.authorName.slice(0, 64) : "",
      body: c.body.slice(0, MAX_COMMENT_BODY),
      at: typeof c.at === "string" ? c.at.slice(0, 40) : "",
      ...(c.done === true ? { done: true as const } : {}),
      replies: Array.isArray(c.replies)
        ? c.replies.slice(0, 50).flatMap((r) => {
            if (!r || typeof r !== "object") return [];
            const x = r as Record<string, unknown>;
            if (typeof x.body !== "string" || !x.body.trim()) return [];
            return [
              {
                id: typeof x.id === "string" ? x.id.slice(0, 32) : newId(rand),
                authorId: typeof x.authorId === "string" ? x.authorId.slice(0, 64) : "",
                authorName: typeof x.authorName === "string" ? x.authorName.slice(0, 64) : "",
                body: x.body.slice(0, MAX_COMMENT_BODY),
                at: typeof x.at === "string" ? x.at.slice(0, 40) : "",
              },
            ];
          })
        : [],
    });
  }
  return out;
}

// ===========================================================================
// 3. 갈래마다의 성질 — 화면·내보내기가 함께 본다
// ===========================================================================

export type BlockMeta = {
  /** 도구모음과 블록 옆 이름표에 뜨는 말. */
  label: string;
  /** 글자를 담는가. 아니면 편집칸을 그리지 않는다. */
  text: boolean;
  /** 들여쓰기를 받는가. */
  indentable: boolean;
  /** 다음 줄에서 Enter 를 쳤을 때 이어질 갈래. 제목 다음은 본문이다. */
  next: BlockKind;
};

export const BLOCK_META: Record<BlockKind, BlockMeta> = {
  title: { label: "문서 제목", text: true, indentable: false, next: "body" },
  heading: { label: "큰 항목", text: true, indentable: false, next: "body" },
  subheading: { label: "작은 항목", text: true, indentable: true, next: "body" },
  body: { label: "본문", text: true, indentable: true, next: "body" },
  bullet: { label: "글머리표", text: true, indentable: true, next: "bullet" },
  numbered: { label: "번호 목록", text: true, indentable: true, next: "numbered" },
  quote: { label: "인용", text: true, indentable: true, next: "quote" },
  source: { label: "근거", text: true, indentable: true, next: "body" },
  note: { label: "붙임말", text: true, indentable: true, next: "note" },
  spacer: { label: "빈 줄", text: false, indentable: false, next: "body" },
  divider: { label: "가로줄", text: false, indentable: false, next: "body" },
  pagebreak: { label: "쪽 나눔", text: false, indentable: false, next: "body" },
  table: { label: "표", text: false, indentable: false, next: "body" },
};

/**
 * 번호 목록의 항목 부호.
 *
 * 이 순서는 우리가 정한 것이 아니다 — 「행정업무의 운영 및 혁신에 관한 규정
 * 시행규칙」제2조가 정한 항목 구분 순서다. 공무원이 손으로 「1.」「가.」를
 * 적어 오던 것을 편집기가 대신 세어 주는 것이므로, **순서를 바꾸면 안 된다.**
 *
 *   1.  →  가.  →  1)  →  가)  →  (1)  →  (가)
 */
const HANGUL_ORDINALS = [
  "가", "나", "다", "라", "마", "바", "사",
  "아", "자", "차", "카", "타", "파", "하",
] as const;

type MarkerStyle = "digit-dot" | "hangul-dot" | "digit-paren" | "hangul-paren" | "digit-wrap" | "hangul-wrap";

const NUMBER_STYLE: readonly MarkerStyle[] = [
  "digit-dot",    // 1.
  "hangul-dot",   // 가.
  "digit-paren",  // 1)
  "hangul-paren", // 가)
  "digit-wrap",   // (1)
  "hangul-wrap",  // (가)
];

/**
 * 글머리표 부호.
 *
 * 「○」로 시작하는 것이 행정 문서의 관행이고, 그 아래로 「-」「·」가 붙는다.
 */
const BULLET_MARKS = ["○", "-", "·", "▪", "◦", "‣"] as const;

/** 한글 차례. 14를 넘으면 「가가」가 아니라 숫자로 떨어뜨린다 — 아무도 못 읽는다. */
function hangulOrdinal(n: number): string {
  return n <= HANGUL_ORDINALS.length ? HANGUL_ORDINALS[n - 1] : String(n);
}

function renderMarker(style: MarkerStyle, n: number): string {
  switch (style) {
    case "digit-dot":
      return `${n}.`;
    case "hangul-dot":
      return `${hangulOrdinal(n)}.`;
    case "digit-paren":
      return `${n})`;
    case "hangul-paren":
      return `${hangulOrdinal(n)})`;
    case "digit-wrap":
      return `(${n})`;
    case "hangul-wrap":
      return `(${hangulOrdinal(n)})`;
  }
}

/** 이 블록 앞에 붙는 부호. 번호 목록이면 순번이 필요하다. */
export function markerFor(kind: BlockKind, indent: number, ordinal: number): string {
  const depth = clampIndent(indent);
  if (kind === "numbered") {
    return renderMarker(NUMBER_STYLE[depth % NUMBER_STYLE.length], Math.max(1, ordinal));
  }
  if (kind === "bullet") return BULLET_MARKS[depth % BULLET_MARKS.length];
  return "";
}

/**
 * 문서 전체의 번호를 한 번에 센다.
 *
 * 블록마다 「내가 몇 번째인가」를 들고 있지 않은 이유는, 그러면 블록 하나를
 * 지울 때마다 뒤의 모든 블록을 고쳐야 하고 그 고침이 실시간으로 오가야 하기
 * 때문이다. 번호는 **저장하지 않고 그릴 때 센다.**
 *
 * 세는 규칙: 같은 단(indent)에서 이어지면 +1, 더 얕은 단을 만나면 그보다
 * 깊은 단의 세기를 모두 0으로 되돌린다. 번호 목록이 아닌 블록(본문 등)이
 * 끼어드는 것은 세기를 끊지 않는다 — 「1. …설명… 2.」가 실제 문서의 모양이다.
 * 다만 큰 항목(heading)을 만나면 전부 되돌린다. 절이 바뀐 것이기 때문이다.
 */
export function computeOrdinals(blocks: readonly Block[]): number[] {
  const counters: number[] = new Array(MAX_INDENT + 1).fill(0);
  const out: number[] = [];

  for (const b of blocks) {
    if (b.kind === "heading" || b.kind === "title") {
      counters.fill(0);
      out.push(0);
      continue;
    }
    if (b.kind !== "numbered") {
      out.push(0);
      continue;
    }
    const depth = clampIndent(b.indent ?? 0);
    counters[depth] += 1;
    for (let d = depth + 1; d <= MAX_INDENT; d += 1) counters[d] = 0;
    out.push(counters[depth]);
  }
  return out;
}

// ===========================================================================
// 4. 정규화 — 같은 문서는 언제나 같은 모양이어야 한다
// ===========================================================================

export function clampIndent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return n < 0 ? 0 : n > MAX_INDENT ? MAX_INDENT : n;
}

/** MARKS 에 적은 순서로 정렬한다. 순서가 다르면 같은 서식이 다른 값이 된다. */
function sortMarks(marks: readonly Mark[]): Mark[] {
  const seen = new Set(marks);
  return MARKS.filter((m) => seen.has(m));
}

/** 두 토막의 서식이 같은가. 같으면 이어 붙일 수 있다. */
function sameFormat(a: Span, b: Span): boolean {
  if ((a.c ?? "default") !== (b.c ?? "default")) return false;
  if ((a.h ?? "none") !== (b.h ?? "none")) return false;
  const am = a.m ?? [];
  const bm = b.m ?? [];
  if (am.length !== bm.length) return false;
  for (let i = 0; i < am.length; i += 1) if (am[i] !== bm[i]) return false;
  return true;
}

/**
 * 토막 목록을 정돈한다.
 *
 *   · 빈 토막을 지운다
 *   · 마크를 정렬하고 기본값(default·none)을 지운다
 *   · 서식이 같은 이웃을 하나로 합친다
 *
 * 합치지 않으면 「가」「나」「다」가 세 토막으로 남아, 글자 하나 고칠 때마다
 * 토막이 늘어난다. 실제로 그렇게 두면 한 문단이 수백 토막이 되고 저장 크기가
 * 글자 수의 열 배가 된다.
 */
export function normalizeSpans(spans: readonly Span[] | undefined): Span[] {
  if (!spans || spans.length === 0) return [];
  const out: Span[] = [];

  for (const raw of spans) {
    if (typeof raw?.t !== "string" || raw.t.length === 0) continue;

    const marks = Array.isArray(raw.m)
      ? sortMarks(raw.m.filter((m): m is Mark => (MARKS as readonly string[]).includes(m)))
      : [];
    // 위·아래첨자가 함께 오면 앞선 것만 남긴다.
    for (const [a, b] of EXCLUSIVE) {
      if (marks.includes(a) && marks.includes(b)) {
        const drop = marks.indexOf(a) < marks.indexOf(b) ? b : a;
        marks.splice(marks.indexOf(drop), 1);
      }
    }

    const color = (TEXT_COLORS as readonly string[]).includes(raw.c as string)
      ? (raw.c as TextColor)
      : "default";
    const highlight = (HIGHLIGHTS as readonly string[]).includes(raw.h as string)
      ? (raw.h as Highlight)
      : "none";

    const span: Span = { t: raw.t };
    if (marks.length) span.m = marks;
    if (color !== "default") span.c = color;
    if (highlight !== "none") span.h = highlight;

    const last = out[out.length - 1];
    if (last && sameFormat(last, span)) last.t += span.t;
    else out.push(span);
  }

  return out;
}

/** 이 토막들이 담은 글자. */
export function spansText(spans: readonly Span[]): string {
  let out = "";
  for (const s of spans) out += s.t;
  return out;
}

/**
 * 코드포인트 단위의 길이·자르기.
 *
 * ⚠ 이 파일에서 글자를 세는 곳은 **전부** 이 둘을 거쳐야 한다.
 * 자바스크립트의 `String.length` 와 `slice` 는 UTF-16 **코드 단위**라
 * 「😀」가 2, 「𠀋」도 2다. 그 단위로 자르면 한 글자가 반으로 갈라져
 * 짝 잃은 서로게이트가 되고, 그 값은 XML 에서 U+FFFD(�)로 바뀐다 —
 * 결재 문서에 마름모가 박혀 나간다는 뜻이다(pack.ts 의 esc() 주석).
 *
 * 실제로 한 번 틀렸다. `sliceSpans` 만 코드 단위로 세고 있었는데, 부르는 쪽
 * (splitBlock·deleteRange·복사)은 전부 코드포인트 번호를 넘겼다. 이모지가
 * 하나 섞인 문단에서 Enter 를 치면 「😀가나다」가 「😀가」+「가나」가 되어
 * **글자가 사라지고 동시에 중복됐다.**
 *
 * 배열을 만들지 않고 서로게이트 상위 짝만 건너뛴다 — 커서가 움직일 때마다
 * 불리는 함수라 할당이 쌓이면 그대로 체감된다.
 * (components/editor/dom.ts 에 같은 함수가 있다. 이 파일은 바깥을 부르지
 *  않기로 한 규약이라 한 벌씩 둔다 — 고칠 때 둘 다 고쳐야 한다)
 */
function cpLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    n += 1;
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) i += 1;
  }
  return n;
}

function cpIndex(s: string, cp: number): number {
  if (cp <= 0) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (n === cp) return i;
    n += 1;
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) i += 1;
  }
  return s.length;
}

/**
 * 토막 목록에서 [from, to) 구간의 글자를 잘라 낸다. 서식은 유지한다.
 *
 * `from`·`to` 는 **코드포인트** 번호다. 편집기 전체가 그 단위로 말한다.
 */
export function sliceSpans(
  spans: readonly Span[],
  from: number,
  to: number,
): Span[] {
  if (to <= from) return [];
  const out: Span[] = [];
  let at = 0;
  for (const s of spans) {
    const len = cpLength(s.t);
    const end = at + len;
    if (end > from && at < to) {
      const a = from - at > 0 ? from - at : 0;
      const b = to - at < len ? to - at : len;
      out.push({ ...s, t: s.t.slice(cpIndex(s.t, a), cpIndex(s.t, b)) });
    }
    at = end;
    if (at >= to) break;
  }
  return normalizeSpans(out);
}

/** 토막 목록이 담은 글자 수(코드포인트). */
export function spansLength(spans: readonly Span[]): number {
  let n = 0;
  for (const s of spans) n += cpLength(s.t);
  return n;
}

// ===========================================================================
// 5. 만들기
// ===========================================================================

/**
 * 블록 id.
 *
 * `crypto.randomUUID()` 를 쓰지 않는 이유는 두 가지다. 하나는 이 파일이
 * 아무것도 부르지 않기로 한 것이고(위 머리말), 다른 하나는 길이다 — 문서
 * 하나에 블록이 수백 개고 그 id 가 실시간 신호에 매번 실린다. 36자와 10자는
 * 문서 한 벌에서 수 KB 차이가 난다.
 *
 * 난수는 바깥에서 받는다. 그래야 시험이 같은 문서를 두 번 만들 수 있다.
 */
export function newId(rand: () => number = Math.random): string {
  const A = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 10; i += 1) out += A[Math.floor(rand() * A.length)];
  return out;
}

export function makeBlock(
  kind: BlockKind,
  text = "",
  rand: () => number = Math.random,
): Block {
  const block: Block = { id: newId(rand), kind, spans: text ? [{ t: text }] : [] };
  if (kind === "table") block.table = makeTable(2, 2, rand);
  return block;
}

export function makeTable(
  rows: number,
  cols: number,
  rand: () => number = Math.random,
): TableData {
  return {
    widths: new Array(Math.max(1, cols)).fill(1),
    header: true,
    rows: Array.from({ length: Math.max(1, rows) }, () => ({
      cells: Array.from({ length: Math.max(1, cols) }, () => ({
        id: newId(rand),
        spans: [] as Span[],
      })),
    })),
  };
}

/**
 * 빈 문서.
 *
 * 진짜로 비워 두지 않는다. 아무것도 없는 화면에는 커서를 놓을 자리가 없어서
 * 「어디를 눌러야 쓰기 시작하나」를 사용자가 알아내야 한다. 제목 한 줄과
 * 본문 한 줄을 놓아 두면 그 물음이 없어진다.
 */
export function emptyDoc(title = "", rand: () => number = Math.random): RichDoc {
  return {
    v: 1,
    blocks: [makeBlock("title", title, rand), makeBlock("body", "", rand)],
  };
}

// ===========================================================================
// 6. 믿지 않고 읽기
// ===========================================================================

const MAX_BLOCKS = 2000;
const MAX_SPAN_TEXT = 20000;
const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLS = 20;

function parseSpans(value: unknown): Span[] {
  if (!Array.isArray(value)) return [];
  const raw: Span[] = [];
  let budget = MAX_SPAN_TEXT;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const t = (item as Span).t;
    if (typeof t !== "string" || !t) continue;
    const cut = t.length > budget ? t.slice(0, budget) : t;
    budget -= cut.length;
    raw.push({ ...(item as Span), t: cut });
    if (budget <= 0) break;
  }
  return normalizeSpans(raw);
}

function parseTable(value: unknown, rand: () => number): TableData | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Partial<TableData>;
  if (!Array.isArray(src.rows) || src.rows.length === 0) return null;

  const rows: TableRow[] = [];
  for (const r of src.rows.slice(0, MAX_TABLE_ROWS)) {
    if (!r || typeof r !== "object" || !Array.isArray((r as TableRow).cells)) continue;
    const cells: TableCell[] = [];
    for (const c of (r as TableRow).cells.slice(0, MAX_TABLE_COLS)) {
      if (!c || typeof c !== "object") continue;
      const cell = c as Partial<TableCell>;
      cells.push({
        id: typeof cell.id === "string" && cell.id ? cell.id.slice(0, 32) : newId(rand),
        spans: parseSpans(cell.spans),
        ...((ALIGNS as readonly string[]).includes(cell.align as string)
          ? { align: cell.align as Align }
          : {}),
        ...(typeof cell.colSpan === "number" && cell.colSpan > 1
          ? { colSpan: Math.min(Math.floor(cell.colSpan), MAX_TABLE_COLS) }
          : {}),
      });
    }
    if (cells.length) rows.push({ cells });
  }
  if (!rows.length) return null;

  // 열 수는 「병합을 펼쳤을 때 가장 넓은 줄」로 잡는다. 이 값이 틀리면
  // 내보내기에서 표가 삐져나가거나 칸이 모자란다.
  const cols = Math.max(
    1,
    ...rows.map((r) => r.cells.reduce((n, c) => n + Math.max(1, c.colSpan ?? 1), 0)),
  );
  const widths =
    Array.isArray(src.widths) && src.widths.length === cols
      ? src.widths.map((w) => (typeof w === "number" && w > 0 ? w : 1))
      : new Array(cols).fill(1);

  return { widths, header: src.header !== false, rows };
}

/**
 * DB·요청에서 온 값을 문서로 읽는다. 모양이 아니면 null 이다.
 *
 * 빈 문서(블록 0개)도 null 로 떨어뜨린다. 편집기가 커서 놓을 자리를 잃기
 * 때문이고, 부르는 쪽은 그 경우 `emptyDoc()` 을 쓰면 된다.
 */
export function parseRichDoc(
  value: unknown,
  rand: () => number = Math.random,
): RichDoc | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Partial<RichDoc>;
  if (!Array.isArray(src.blocks)) return null;

  const blocks: Block[] = [];
  const seenIds = new Set<string>();

  for (const item of src.blocks.slice(0, MAX_BLOCKS)) {
    if (!item || typeof item !== "object") continue;
    const b = item as Partial<Block>;
    const kind = (BLOCK_KINDS as readonly string[]).includes(b.kind as string)
      ? (b.kind as BlockKind)
      : "body";

    // id 가 겹치면 React 키가 겹치고, 실시간에서 남의 블록을 고치게 된다.
    let id = typeof b.id === "string" && b.id ? b.id.slice(0, 32) : newId(rand);
    while (seenIds.has(id)) id = newId(rand);
    seenIds.add(id);

    const meta = BLOCK_META[kind];
    const block: Block = {
      id,
      kind,
      spans: meta.text ? parseSpans(b.spans) : [],
    };
    if ((ALIGNS as readonly string[]).includes(b.align as string) && b.align !== "left") {
      block.align = b.align as Align;
    }
    if (meta.indentable) {
      const indent = clampIndent(b.indent);
      if (indent > 0) block.indent = indent;
    }
    if (kind === "table") {
      block.table = parseTable(b.table, rand) ?? makeTable(2, 2, rand);
    }
    blocks.push(block);
  }

  if (!blocks.length) return null;

  // 갈 곳을 잃은 의견은 버린다. 블록이 사라진 뒤에도 남아 있으면 화면 오른쪽에
  // 붙을 자리 없는 쪽지가 떠다닌다.
  const live = new Set(blocks.map((b) => b.id));
  const comments = parseComments(src.comments, rand).filter((c) =>
    live.has(c.blockId),
  );

  return comments.length ? { v: 1, blocks, comments } : { v: 1, blocks };
}

// ===========================================================================
// 7. 평문으로 눕히기
// ===========================================================================

/**
 * 문서를 평문 한 벌로.
 *
 * 이 값이 `doc_section.body` 에 그대로 들어간다. 그래야 **자바스크립트가 없는
 * 화면·검색·인계 초안·기존 내보내기가 지금까지처럼 계속 돈다.** 서식 문서를
 * 만들었다고 해서 그 문서가 다른 화면에서 안 보이게 되면 안 된다.
 *
 * 표는 탭으로 칸을 나눈다. 붙여넣기로 엑셀·한/글에 들어갈 때 칸이 살아난다.
 */
export function docPlainText(doc: RichDoc): string {
  const ordinals = computeOrdinals(doc.blocks);
  const lines: string[] = [];

  doc.blocks.forEach((b, i) => {
    switch (b.kind) {
      case "spacer":
        lines.push("");
        return;
      case "divider":
        lines.push("─".repeat(30));
        return;
      case "pagebreak":
        lines.push("");
        return;
      case "table": {
        if (!b.table) return;
        for (const row of b.table.rows) {
          lines.push(row.cells.map((c) => spansText(c.spans)).join("\t"));
        }
        return;
      }
      default: {
        const indent = "  ".repeat(clampIndent(b.indent));
        const marker = markerFor(b.kind, b.indent ?? 0, ordinals[i]);
        const text = spansText(b.spans);
        lines.push(marker ? `${indent}${marker} ${text}` : `${indent}${text}`);
      }
    }
  });

  // 끝에 붙은 빈 줄은 저장할 이유가 없다.
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** 글자 수 · 낱말 수 — 상태 표시줄이 쓴다. */
export function docStats(doc: RichDoc): { chars: number; words: number; blocks: number } {
  let chars = 0;
  let words = 0;
  for (const b of doc.blocks) {
    const texts = b.kind === "table" && b.table
      ? b.table.rows.flatMap((r) => r.cells.map((c) => spansText(c.spans)))
      : [spansText(b.spans)];
    for (const t of texts) {
      // 공백을 빼고 센다. 공문서의 「글자 수」는 그 뜻으로 쓰인다.
      chars += t.replace(/\s/g, "").length;
      const trimmed = t.trim();
      if (trimmed) words += trimmed.split(/\s+/).length;
    }
  }
  return { chars, words, blocks: doc.blocks.length };
}

/**
 * 문서의 제목.
 *
 * title 블록이 있으면 그 글자, 없으면 첫 글자 있는 블록. 둘 다 없으면 빈 문자열.
 * 부르는 쪽이 「제목 없는 문서」 같은 말을 붙일지 정한다.
 */
export function docTitle(doc: RichDoc): string {
  const titled = doc.blocks.find((b) => b.kind === "title" && spansText(b.spans).trim());
  if (titled) return spansText(titled.spans).trim();
  const first = doc.blocks.find((b) => BLOCK_META[b.kind].text && spansText(b.spans).trim());
  return first ? spansText(first.spans).trim() : "";
}

/**
 * 개요 — 왼쪽 사이드바가 쓴다.
 *
 * title·heading·subheading 만 뽑는다. 본문까지 넣으면 개요가 아니라 문서를
 * 한 번 더 그린 것이 된다.
 */
export function docOutline(
  doc: RichDoc,
): Array<{ id: string; kind: "title" | "heading" | "subheading"; text: string }> {
  const out: Array<{ id: string; kind: "title" | "heading" | "subheading"; text: string }> = [];
  for (const b of doc.blocks) {
    if (b.kind !== "title" && b.kind !== "heading" && b.kind !== "subheading") continue;
    const text = spansText(b.spans).trim();
    if (!text) continue;
    out.push({ id: b.id, kind: b.kind, text });
  }
  return out;
}

// ===========================================================================
// 8. 항목 문서 → 서식 문서
// ===========================================================================

/**
 * 지금까지의 「항목 + 평문」 문서를 블록으로 옮긴다.
 *
 * 한 번만 도는 길이다. 이미 쓰던 문서를 새 편집기로 열 때, 화면이 빈 종이를
 * 보여 주면 그 사람은 자기 문서가 사라졌다고 읽는다.
 *
 * 줄 앞의 「1.」「가.」「-」를 알아보고 갈래를 맞춘다. 못 알아보면 본문이다 —
 * 틀리게 알아보는 것보다 안전한 쪽이다. 사용자가 한 번 고르면 그만이지만,
 * 잘못 바꾼 것은 되돌리는 방법을 알아내야 한다.
 */
export function fromSections(
  sections: ReadonlyArray<{ heading: string | null; body: string }>,
  title: string,
  rand: () => number = Math.random,
): RichDoc {
  const blocks: Block[] = [makeBlock("title", title, rand)];

  for (const s of sections) {
    if (s.heading?.trim()) blocks.push(makeBlock("heading", s.heading.trim(), rand));

    const lines = s.body.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/\s+$/, "");
      if (!line.trim()) {
        blocks.push(makeBlock("spacer", "", rand));
        continue;
      }
      // 앞의 공백은 들여쓰기 단계로 읽는다. 두 칸이 한 단이다.
      const lead = line.length - line.trimStart().length;
      const indent = clampIndent(Math.floor(lead / 2));
      const text = line.trim();

      // 마침표·괄호를 **필수**로 둔다. 예전에는 `[.)]?` 라 선택 항목이었고,
      // 그래서 「2026년 자원순환의 날 행사」 같은 평범한 문장이 번호 목록으로
      // 바뀌면서 앞의 「2026」이 통째로 지워졌다. 「1」 하나만으로 번호를
      // 알아보는 이득보다, 문장 첫 낱말을 잃는 손해가 훨씬 크다.
      const numbered = /^(\([0-9]+\)|[0-9]+[.)]|\([가-힣]\)|[가-힣][.)])\s+(.*)$/.exec(text);
      const bulleted = /^[-·○▪◦‣*]\s+(.*)$/.exec(text);

      if (bulleted) {
        const b = makeBlock("bullet", bulleted[1], rand);
        if (indent) b.indent = indent;
        blocks.push(b);
      } else if (numbered && numbered[2]) {
        const b = makeBlock("numbered", numbered[2], rand);
        if (indent) b.indent = indent;
        blocks.push(b);
      } else {
        const b = makeBlock("body", text, rand);
        if (indent) b.indent = indent;
        blocks.push(b);
      }
    }
  }

  if (blocks.length === 1) blocks.push(makeBlock("body", "", rand));
  return { v: 1, blocks };
}
