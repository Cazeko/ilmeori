import { ArrowRight } from "lucide-react";
import type { TransferRequestView, TransferStatus } from "@/lib/types";

/**
 * 이동 한 건을 화면에서 부르는 두 조각.
 *
 * 신청 화면·승인함·지난 신청이 같은 것을 그리므로 한 곳에 둔다. 세 화면에서
 * 화살표 방향이나 상태 이름이 갈리면, 보는 사람은 그것을 「다른 일」로 읽는다.
 */

/** 어디서 어디로. 화살표는 장식이 아니라 방향이므로 글자로도 읽히게 둔다. */
export function TransferRoute({ request }: { request: TransferRequestView }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2 text-body font-bold text-gray-90">
      <span className="text-gray-60">
        {request.from_department_name ?? "소속 없음"}
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-gray-60" />
      <span className="sr-only">에서</span>
      {request.to_department_name}
      <span className="sr-only">(으)로</span>
    </span>
  );
}

/**
 * 처리 상태.
 *
 * status-badge.tsx 와 같은 규칙을 따른다 — **색은 하나뿐이고 나머지는 명도로
 * 나눈다.** 여기서 색이 붙는 것은 반려 하나다. 승인은 좋은 소식이지만 「지금
 * 봐야 하는 것」은 아니고, 이 제품에서 붉은 것은 언제나 그 하나를 뜻한다.
 */
const TONE: Record<TransferStatus, string> = {
  pending: "text-gray-90",
  approved: "text-gray-60",
  rejected: "text-status-overdue-text",
  canceled: "text-gray-60",
};

const LABEL: Record<TransferStatus, string> = {
  pending: "대기",
  approved: "승인",
  rejected: "반려",
  canceled: "취소",
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-body-sm font-bold whitespace-nowrap ${TONE[status]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {LABEL[status]}
    </span>
  );
}
