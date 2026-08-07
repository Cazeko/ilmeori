import type { PostgrestError } from "@supabase/supabase-js";

/**
 * 서버 액션의 결과를 사용자에게 알리는 방법.
 *
 * ── 왜 useActionState가 아닌가 ─────────────────────────────────────────────
 *
 * 이 앱의 화면은 자바스크립트 없이도 전부 동작한다. 탭은 링크이고, 선택은
 * <select>이고, 상태 변경은 제출 버튼이다. 오류 표시만 훅으로 처리하면
 * 스크립트가 아직 안 붙은 순간에 제출된 폼은 결과를 말해 주지 못한다.
 *
 * 그래서 결과는 **주소로** 전달한다. 액션이 끝나면 원래 화면으로 돌려보내되
 * ?msg=<코드> 를 붙이고, 화면이 그 코드를 문구로 바꿔 그린다.
 * 새로고침해도 남고, 링크로 보낼 수도 있고, 스크립트가 없어도 읽힌다.
 *
 * ── 왜 문구가 아니라 코드인가 ──────────────────────────────────────────────
 *
 * 오류 문구를 그대로 주소에 실으면 주소를 고쳐 아무 문장이나 화면에 띄울 수 있다.
 * 우리 화면에 우리가 쓰지 않은 문장이 뜨는 것은 그 자체로 사고다
 * ("보안 점검 결과 계좌 확인이 필요합니다" 같은 문장을 우리 도메인에 띄울 수 있다).
 * 그래서 주소에는 코드만 싣고, 문구는 이 파일에만 있다.
 * 모르는 코드는 아무것도 그리지 않는다.
 */

type Tone = "success" | "warning" | "danger" | "info";

const MESSAGES = {
  // ── 업무 ──────────────────────────────────────────────────────────────
  "work.created": ["success", "업무를 만들었습니다."],
  "work.updated": ["success", "업무 정보를 수정했습니다."],
  "work.status_changed": ["success", "진행 상태를 바꿨습니다."],
  "work.archived": ["success", "업무를 보관했습니다. 이력은 그대로 남습니다."],
  "work.restored": ["success", "보관을 해제했습니다."],
  "work.no_department": [
    "danger",
    "계정에 소속 부서가 등록되어 있지 않아 업무를 만들 수 없습니다. 업무는 소관 부서에 속하기 때문입니다. 인사 담당자에게 소속 등록을 요청해 주세요.",
  ],

  // ── 참여자·권한 ───────────────────────────────────────────────────────
  "member.added": ["success", "참여자를 추가했습니다."],
  "member.role_changed": ["success", "권한을 변경했습니다."],
  "member.removed": ["success", "참여자를 제외했습니다."],
  "member.duplicate": ["warning", "이미 참여하고 있는 사람입니다."],
  "member.last_owner": [
    "danger",
    "마지막 소유자는 해제할 수 없습니다. 다른 사람을 먼저 소유자로 지정해 주세요.",
  ],
  "member.is_lead": [
    "danger",
    "주담당자는 참여자에서 빼거나 권한을 낮출 수 없습니다. 주담당을 먼저 다른 소유자에게 넘겨 주세요.",
  ],
  "lead.changed": ["success", "주담당을 넘겼습니다."],
  "lead.not_owner": [
    "danger",
    "주담당은 소유 권한을 가진 참여자만 맡을 수 있습니다. 먼저 그 사람의 권한을 소유로 올려 주세요.",
  ],
  "visibility.changed": ["success", "공개 범위를 변경했습니다."],

  // ── 문서 ──────────────────────────────────────────────────────────────
  "document.created": ["success", "문서를 만들었습니다."],
  "document.exists": [
    "info",
    "이 업무에는 이미 문서가 있습니다. 그 문서를 열었습니다.",
  ],
  "document.renamed": ["success", "문서 이름을 바꿨습니다."],
  "document.deleted": ["success", "문서를 삭제했습니다."],
  "section.added": ["success", "항목을 추가했습니다."],
  "section.saved": ["success", "항목을 저장했습니다. 이전 판은 이력에 남습니다."],
  "section.deleted": ["success", "항목을 삭제했습니다."],
  "section.locked": [
    "danger",
    "다른 사람이 편집 중인 항목입니다. 편집이 끝나거나 잠금이 풀린 뒤에 다시 시도해 주세요.",
  ],
  "section.unlocked": ["info", "편집을 취소했습니다."],

  // ── 대화 ──────────────────────────────────────────────────────────────
  "comment.created": ["success", "대화를 남겼습니다."],
  "comment.deleted": ["success", "의견을 삭제했습니다. 삭제한 사실은 이력에 남습니다."],

  // ── 첨부 ──────────────────────────────────────────────────────────────
  "file.uploaded": ["success", "파일을 올렸습니다."],
  "file.replaced": ["success", "새 판을 올렸습니다. 이전 판도 그대로 남아 있습니다."],
  "file.deleted": ["success", "파일을 삭제했습니다."],
  "file.too_large": [
    "danger",
    "파일이 너무 큽니다. 한 번에 올릴 수 있는 크기는 4MB까지입니다.",
  ],
  "file.empty": ["danger", "파일을 고르지 않았습니다."],
  "file.rejected": [
    "danger",
    "올릴 수 없는 형식입니다. 문서(hwp·pdf·docx·xlsx·pptx)와 이미지만 받습니다.",
  ],
  "file.ext_mismatch": [
    "danger",
    "이전 판과 확장자가 다릅니다. 같은 문서의 새 판은 같은 형식이어야 합니다. 형식이 바뀌었다면 새 파일로 올려 주세요.",
  ],
  "file.unavailable": [
    "info",
    "데모 모드에는 실제 파일이 없습니다. 목록과 이력만 보여 줍니다.",
  ],

  // ── 인계·인수 ─────────────────────────────────────────────────────────
  "handover.started": ["success", "인계서 초안을 만들었습니다. 내용을 확인해 주세요."],
  "handover.no_items": ["danger", "넘길 업무를 하나 이상 골라 주세요."],
  "handover.no_target": ["danger", "인수자를 골라 주세요."],
  "handover.in_progress": [
    "warning",
    "이미 진행 중인 인계가 있습니다. 그 건을 끝내거나 취소한 뒤에 새로 시작할 수 있습니다.",
  ],
  "handover.executed": [
    "success",
    "인계를 실행했습니다. 각 업무의 이력에 옮겨 간 기록이 남았습니다.",
  ],
  "handover.partial": [
    "warning",
    "일부 업무만 넘어갔습니다. 인계서를 만든 뒤에 소유 권한이 바뀐 업무는 넘길 수 없어 건너뛰었습니다. 아래 목록에서 「인계 완료」 표시가 없는 업무를 확인해 주세요.",
  ],
  "handover.cancelled": [
    "success",
    "인계를 취소했습니다. 아직 실행되지 않은 건이라 넘어간 업무는 없습니다.",
  ],
  "handover.cannot_cancel": [
    "danger",
    "이미 실행된 인계는 취소할 수 없습니다. 권한이 실제로 옮겨 간 기록입니다.",
  ],
  "handover.note.added": [
    "success",
    "보충 내용을 적었습니다. 규칙이 뽑은 문단과 섞지 않고 「인계자 보충」으로 따로 표시하며, 인쇄본에도 그렇게 나옵니다.",
  ],
  "handover.note.deleted": [
    "success",
    "보충 내용을 지웠습니다. 규칙이 뽑은 문단과 인계 대상 업무는 그대로입니다.",
  ],
  "handover.note.long": [
    "danger",
    "보충 내용이 너무 깁니다. 한 번에 1000자까지 적을 수 있습니다. 나눠서 적으면 항목 안에 차례로 쌓입니다.",
  ],
  "handover.note.too_many": [
    "danger",
    "이 인계서에 보충을 더 담을 수 없습니다. 한 건에 30개까지입니다. 필요 없는 것을 지운 뒤 다시 적어 주세요.",
  ],
  "handover.note.locked": [
    "danger",
    "이미 실행된 인계입니다. 보충 내용을 더하거나 지울 수 없습니다. 권한이 실제로 옮겨 간 뒤의 인계서는 그때 무엇이 적혀 있었는지가 곧 기록입니다.",
  ],

  // ── 공통 실패 ─────────────────────────────────────────────────────────
  invalid: ["danger", "입력한 내용을 다시 확인해 주세요."],
  denied: ["danger", "이 작업을 할 권한이 없습니다."],
  /**
   * 0행으로 끝난 UPDATE·DELETE 중 권한이 아니라 대상이 사라진 쪽.
   * 둘을 구분하지 못하는 자리도 있지만, 옆 사람이 방금 지운 경우가 더 흔한
   * 자리에서는 "권한이 없습니다"보다 이쪽이 사실에 가깝다.
   */
  stale: [
    "warning",
    "화면이 오래되었습니다. 그 사이 다른 사람이 바꿨거나 지웠을 수 있습니다. 새로고침한 뒤 다시 시도해 주세요.",
  ],
  "demo.readonly": [
    "info",
    "데모 모드에서는 읽기만 됩니다. 데이터베이스에 연결하면 이 화면에서 직접 고칠 수 있습니다.",
  ],
  failed: ["danger", "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."],
} as const satisfies Record<string, readonly [Tone, string]>;

export type FeedbackCode = keyof typeof MESSAGES;

/** 주소에 실린 코드를 문구로. 모르는 값이면 아무것도 그리지 않는다. */
export function readFeedback(
  raw: unknown,
): { tone: Tone; text: string } | null {
  if (typeof raw !== "string") return null;
  const hit = (MESSAGES as Record<string, readonly [Tone, string]>)[raw];
  return hit ? { tone: hit[0], text: hit[1] } : null;
}

/**
 * 돌아갈 주소에 결과 코드를 붙인다. 기존 검색 조건은 그대로 둔다.
 *
 * 조각(#항목)이 붙어 있으면 맨 뒤로 옮긴다. 주소에서 조각은 언제나 질의 문자열
 * 뒤에 와야 하는데, 그냥 이어 붙이면 `/handover#3-assets?msg=…` 가 되어
 * 조각 이름이 `3-assets?msg=…` 로 읽히고 어느 항목으로도 가지 못한다.
 * (인계서처럼 항목이 일곱 개인 화면은 결과를 그 자리에서 봐야 한다)
 */
export function withFeedback(path: string, code: FeedbackCode): string {
  // split("#") 로 나누지 않는다. 조각 안에 #이 또 있으면 뒤가 잘려 나가고,
  // 그러면 돌아갈 자리를 잃는다. 첫 #부터 끝까지가 통째로 조각이다.
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const [base, query = ""] = (hashAt >= 0 ? path.slice(0, hashAt) : path).split(
    "?",
  );
  const params = new URLSearchParams(query);
  params.set("msg", code);
  return `${base}?${params.toString()}${hash}`;
}

/**
 * DB가 거부한 이유를 사용자가 읽을 코드로 바꾼다.
 *
 * Postgres 예외 문구를 그대로 화면에 옮기지 않는다. 그 문장에는 테이블·정책 이름 같은
 * 내부 구조가 섞여 나오고, 그것은 공격자에게 지도를 그려 주는 것과 같다.
 * 우리가 미리 알고 있는 실패만 이름을 붙여 안내하고, 나머지는 하나로 뭉뚱그린다.
 */
export function classifyError(error: PostgrestError | null): FeedbackCode {
  if (!error) return "failed";

  // 트리거가 막은 것들 — 화면이 정확히 설명해 줄 수 있는 유일한 실패들이다.
  if (error.message.includes("마지막 소유자")) return "member.last_owner";
  if (error.message.includes("보충을 더 담을 수 없습니다")) {
    return "handover.note.too_many";
  }

  switch (error.code) {
    case "23505": // unique_violation — 이미 참여자인 사람을 다시 추가
      return "member.duplicate";
    case "42501": // insufficient_privilege — GRANT 단계에서 막힘
      return "denied";
    default:
      // RLS가 막으면 오류가 아니라 "0행 수정"으로 조용히 끝난다.
      // 그 경우는 여기까지 오지 않고 호출부가 denied로 처리한다.
      return "failed";
  }
}
