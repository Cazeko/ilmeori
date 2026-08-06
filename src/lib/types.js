"use strict";
/**
 * 데이터베이스 타입
 *
 * supabase/migrations/*.sql 과 1:1로 대응한다.
 * (실제 프로젝트 연결 후에는 `supabase gen types typescript`로 자동생성해 대체할 수 있다)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_TONE = exports.ACCESS_KIND_LABEL = exports.HANDOVER_STATUS_LABEL = exports.VISIBILITY_HINT = exports.VISIBILITY_LABEL = exports.ROLE_LABEL = exports.STATUS_LABEL = void 0;
exports.derivedStatus = derivedStatus;
// ---------------------------------------------------------------------------
// 표시용 레이블 — 화면 전체에서 같은 말을 쓰기 위한 단일 출처
// ---------------------------------------------------------------------------
exports.STATUS_LABEL = {
    todo: "대기",
    doing: "진행중",
    review: "검토",
    done: "완료",
    overdue: "지연",
};
exports.ROLE_LABEL = {
    owner: "소유",
    editor: "편집",
    viewer: "열람",
};
exports.VISIBILITY_LABEL = {
    private: "참여자만",
    department: "부서 공개",
    city: "전체 공개",
};
exports.VISIBILITY_HINT = {
    private: "참여자로 추가된 사람만 열람할 수 있습니다.",
    department: "소관 부서 직원이면 누구나 열람할 수 있습니다.",
    city: "시 전체 직원이 열람할 수 있습니다.",
};
exports.HANDOVER_STATUS_LABEL = {
    draft: "대상 선정",
    generated: "초안 생성",
    confirmed: "인계자 확인",
    completed: "인수 완료",
};
exports.ACCESS_KIND_LABEL = {
    "work.viewed": "업무 열람",
    "document.viewed": "문서 열람",
    "attachment.downloaded": "첨부파일 내려받기",
};
exports.ACTIVITY_TONE = {
    "work.created": "권한",
    "work.updated": "내용",
    "work.status_changed": "내용",
    "work.transferred": "권한",
    "member.added": "권한",
    "member.role_changed": "권한",
    "member.removed": "권한",
    "document.created": "내용",
    "document.updated": "내용",
    "document.deleted": "내용",
    "section.updated": "내용",
    "comment.created": "대화",
    "comment.deleted": "대화",
    "attachment.added": "내용",
    "attachment.removed": "내용",
    "handover.started": "인계",
    "handover.completed": "인계",
};
/**
 * 실제 표시할 상태를 계산한다.
 * '지연'은 DB에 저장하지 않는다. 저장하면 매일 밤 배치로 갱신해야 하고,
 * 그 배치가 실패하면 화면이 거짓말을 한다.
 */
function derivedStatus(work) {
    if (work.status === "done" || !work.due_date)
        return work.status;
    const today = new Date().toISOString().slice(0, 10);
    return work.due_date < today ? "overdue" : work.status;
}
