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
  /* 여러 건을 한 번에 옮길 때.
     「고른 업무를 옮겼습니다」라고 말하지 않는다 — 고른 것 중에 내가 주담당이
     아닌 업무가 섞여 있으면 그건 빠지고(actions/works.ts 의 moveWorks), 그때
     화면이 옮기지 않은 것을 옮겼다고 말하는 셈이 된다.
     주소에는 코드만 싣기로 했으므로 숫자를 실어 나를 수 없다. 그래서 숫자
     대신 **범위**를 말한다 — 언제나 참인 문장이고, 규칙도 함께 가르친다. */
  "work.archived_many": [
    "success",
    "고른 업무 가운데 내가 주담당인 것을 보관했습니다. 이력은 그대로 남습니다.",
  ],
  "work.restored_many": [
    "success",
    "고른 업무 가운데 내가 주담당인 것을 보드로 되돌렸습니다.",
  ],
  "work.too_many": [
    "warning",
    "한 번에 옮길 수 있는 업무는 200건까지입니다. 조건으로 나눠 주세요.",
  ],
  "work.none_selected": ["warning", "옮길 업무를 하나도 고르지 않았습니다."],
  "work.not_owner_only": [
    "warning",
    "보관은 주담당(소유자)만 할 수 있습니다. 고른 업무 중에 내가 소유한 것이 없습니다.",
  ],
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

  // ── 서식 문서 ─────────────────────────────────────────────────────────
  //
  // 항목 문서와 달리 자동 저장이라, 여기 문구는 사람이 단추를 눌러서 보는 것이
  // 아니라 **저장이 실패했을 때만** 눈에 띈다. 그래서 실패 쪽 문장이 길다.
  "rich.created": [
    "success",
    "서식 문서를 만들었습니다. 제목 줄부터 바로 쓰시면 됩니다. 고치는 동안 몇 초마다 저장됩니다.",
  ],
  "rich.saved": ["success", "저장했습니다."],
  "rich.stale": [
    "warning",
    "그 사이 다른 사람이 이 문서를 저장했습니다. 앞사람 글을 덮어쓰지 않으려고 이번 저장은 하지 않았습니다. 새로고침해서 최신본을 받은 뒤, 방금 쓴 부분을 다시 반영해 주세요.",
  ],
  // 위 rich.stale 과 갈래가 다르다. 저쪽(무JS 문단 폼)은 이번 저장을 버리고 끝나고,
  // 여기(서식 편집기)는 서버가 알려 준 판으로 맞춰 다음 저장에 다시 싣는다.
  // 그래서 사용자가 다음에 할 일도 다르다 — 저쪽은 「다시 열기」, 여기는 「확인」이다.
  "rich.stale_retry": [
    "warning",
    "다른 사람이 방금 이 문서를 저장했습니다. 그 판에 맞춰 다음 저장 때 지금 화면의 내용으로 다시 저장합니다. 함께 편집 중이 아닌 사람이 고친 곳은 이 화면에 보이지 않으니, 중요한 문서라면 새로고침해서 한 번 확인해 주세요.",
  ],
  "rich.converted": [
    "success",
    "서식 문서로 옮겼습니다. 옮기기 전의 항목은 지우지 않고 그대로 남겨 두었습니다. 옮긴 결과가 원본과 다르면 항목에서 확인하실 수 있습니다.",
  ],
  "rich.exists": [
    "info",
    "이미 서식 문서입니다. 아무것도 바꾸지 않았습니다. 두 번 옮기면 그 사이 쓴 글이 사라지기 때문입니다.",
  ],
  "rich.too_big": [
    "danger",
    "문서가 너무 커서 저장하지 못했습니다. 한 문서에 담을 수 있는 크기를 넘었습니다. 표나 붙여넣은 내용을 나눠 문서를 둘로 갈라 주세요. 방금 쓴 내용은 화면에 그대로 있으니 잘라내어 옮기시면 됩니다.",
  ],

  // 스크립트 없이 문단을 고치는 길(actions/rich-doc-blocks.ts). 서식 편집기와
  // 같은 칸에 쓰므로 결과 문구도 같은 무리에 둔다.
  "rich.block_added": ["success", "문단을 넣었습니다. 아래에서 바로 쓰시면 됩니다."],
  "rich.block_deleted": ["success", "문단을 지웠습니다."],
  "rich.block_moved": ["success", "문단을 옮겼습니다."],
  "rich.last_block": [
    "warning",
    "마지막 한 문단은 지울 수 없습니다. 문서에 커서를 놓을 자리가 없어지기 때문입니다. 내용만 비우시려면 글을 지우고 저장해 주세요.",
  ],

  // ── 대화 ──────────────────────────────────────────────────────────────
  "comment.created": ["success", "대화를 남겼습니다."],
  "comment.deleted": ["success", "의견을 삭제했습니다. 삭제한 사실은 이력에 남습니다."],

  // ── 쪽지 ──────────────────────────────────────────────────────────────
  "note.sent": ["success", "쪽지를 보냈습니다. 상대가 열면 「읽음」으로 바뀝니다."],
  "note.replied": ["success", "답장을 보냈습니다."],
  "note.deleted": ["success", "쪽지를 지웠습니다. 상대 화면에서도 사라집니다."],
  // 받는 사람이 비었거나 자기 자신인 경우. DB 의 note_not_self 가 최종 방어선이고
  // 여기서는 그 오류를 사람이 읽는 말로 바꾼다.
  "note.no_recipient": ["danger", "쪽지를 받을 사람을 골라 주세요."],
  "note.self": ["danger", "자기 자신에게는 쪽지를 보낼 수 없습니다."],

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
  "handover.talk.posted": [
    "success",
    "문답에 남겼습니다. 이 글은 별지 제12호서식에 실리지 않고 인계 건에 남으며, 고치거나 지울 수 없습니다.",
  ],
  "handover.talk.long": [
    "danger",
    "문답 한 줄이 너무 깁니다. 1000자까지 적을 수 있습니다. 그보다 길어질 말이면 그 업무의 대화에 적고 여기서는 업무를 가리켜 주세요.",
  ],
  "handover.talk.too_many": [
    "danger",
    "이 인계의 문답을 더 담을 수 없습니다. 한 건에 200개까지입니다. 이어지는 이야기는 그 업무의 대화에 적어 주세요 — 거기 적힌 것은 다음 인계서가 다시 읽습니다.",
  ],

  // ── 결재 ──────────────────────────────────────────────────────────────
  "approval.created": [
    "success",
    "결재 문서를 만들었습니다. 아직 상신되지 않았고 나 말고는 아무도 볼 수 없습니다. 결재선을 확인한 뒤 상신해 주세요.",
  ],
  "approval.updated": ["success", "결재 문서를 고쳤습니다."],
  "approval.deleted": [
    "success",
    "기안 중이던 문서를 지웠습니다. 상신한 뒤에는 지울 수 없습니다.",
  ],
  "approval.submitted": [
    "success",
    "상신했습니다. 문서번호가 붙었고 기안란에 서명이 찍혔습니다.",
  ],
  "approval.signed": ["success", "서명했습니다."],
  "approval.rejected": [
    "success",
    "반려했습니다. 사유가 결재란에 남고 기안자에게 그대로 보입니다.",
  ],
  "approval.withdrawn": [
    "success",
    "회수했습니다. 회수한 사실은 업무 이력에 남습니다.",
  ],
  "approval.step_added": ["success", "결재란을 추가했습니다."],
  "approval.step_removed": ["success", "결재란을 뺐습니다."],
  "approval.line_copied": ["success", "결재선을 가져왔습니다."],
  "approval.line_copied_partial": [
    "warning",
    "결재선을 가져왔지만 일부 칸이 빠졌습니다. 우리 부서에 같은 서열이 없거나 이미 결재선에 있는 사람이었습니다. 결재란을 확인하고 필요하면 직접 추가해 주세요.",
  ],
  "approval.source_missing": [
    "danger",
    "가져올 결재 문서를 찾을 수 없습니다. 볼 수 있는 문서에서만 결재선을 가져올 수 있습니다.",
  ],
  "approval.no_work": [
    "danger",
    "결재를 올릴 업무를 골라 주세요. 결재 문서는 업무에 매달립니다.",
  ],
  "approval.title_required": ["danger", "결재 문서의 제목을 적어 주세요."],
  "approval.title_long": ["danger", "제목이 너무 깁니다. 200자까지 적을 수 있습니다."],
  "approval.body_long": [
    "danger",
    "본문이 너무 깁니다. 20,000자까지 적을 수 있습니다. 더 긴 자료는 업무에 첨부해 주세요.",
  ],
  "approval.opinion_long": [
    "danger",
    "의견이 너무 깁니다. 500자까지 적을 수 있습니다.",
  ],
  "approval.need_reason": [
    "danger",
    "반려 사유를 적어 주세요. 사유 없는 반려는 「왜 반려됐는지 물어보러 가야 하는」 상황을 그대로 남깁니다.",
  ],
  "approval.no_approver": [
    "danger",
    "결재선에 결재자가 없습니다. 혼자 서명하고 끝나는 문서는 결재가 아닙니다. 결재란을 추가한 뒤 상신해 주세요.",
  ],
  "approval.no_draft_step": [
    "danger",
    "결재선에 기안란이 없거나 기안자의 자리가 아닙니다. 기안란을 확인해 주세요.",
  ],
  "approval.line_reversed": [
    "danger",
    "기안란이 결재선의 첫 칸이어야 합니다. 기안란보다 앞선 칸을 빼 주세요.",
  ],
  "approval.duplicate_approver": [
    "warning",
    "이미 결재선에 있는 사람입니다. 한 사람이 한 문서에 두 칸을 가질 수 없습니다.",
  ],
  "approval.draft_step_locked": [
    "danger",
    "기안란은 뺄 수 없습니다. 기안자의 자리이고, 상신하는 순간 그 칸에 서명이 찍힙니다.",
  ],
  "approval.cannot_withdraw": [
    "danger",
    "이미 결재가 시작된 문서는 회수할 수 없습니다. 한 사람이라도 읽고 서명했다면 없던 일로 되돌릴 수 없습니다.",
  ],
  "approval.locked": [
    "danger",
    "완결·반려·회수된 결재는 고칠 수 없습니다. 내용을 바꾸려면 새로 기안해 주세요.",
  ],
  "approval.too_many_steps": [
    "danger",
    "결재란이 너무 많습니다. 한 문서에 12칸까지입니다. 결재란은 표가 아니라 서식이라 칸이 옆으로 늘어나고, 그보다 많으면 좁은 화면에서도 종이에서도 읽을 수 없습니다.",
  ],
  "approval.stale_turn": [
    "warning",
    "그 사이 결재가 움직였습니다. 다른 사람이 먼저 처리했거나 앞 순서가 아직 끝나지 않았습니다. 새로고침한 뒤 결재란을 다시 확인해 주세요.",
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

  // 서식 문서의 크기 제한(0018 의 document_blocks_size)에 걸린 것.
  // 액션이 먼저 1.5MB 에서 자르므로 여기까지 오는 것은 액션을 거치지 않은 요청뿐이지만,
  // 두 상한 사이의 틈에 걸린 저장도 여기로 온다. 「저장하지 못했습니다」로 뭉뚱그리면
  // 사용자는 무엇을 줄여야 하는지 알 수 없다.
  if (error.message.includes("document_blocks_size")) return "rich.too_big";

  // 결재 절차가 거절한 것들. 절차는 check_violation(23514)으로 던지므로 코드만
  // 보면 전부 「저장하지 못했습니다」가 된다 — 그러면 사용자는 무엇을 고쳐야
  // 하는지 알 수 없다. 앞에서 미리 거르지 못하는 것들만 여기서 이름을 붙인다
  // (동시에 두 사람이 눌렀거나, 폼을 거치지 않은 요청).
  if (error.message.includes("결재선에 결재자가 없습니다")) {
    return "approval.no_approver";
  }
  if (error.message.includes("반려 사유")) return "approval.need_reason";
  if (error.message.includes("회수할 수 없습니다")) {
    return "approval.cannot_withdraw";
  }
  if (
    error.message.includes("이미 처리한 결재칸") ||
    error.message.includes("앞 순서의 결재") ||
    error.message.includes("전결로 끝난")
  ) {
    return "approval.stale_turn";
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
