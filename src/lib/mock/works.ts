/**
 * 업무 목업 — 전부 가상이다.
 *
 * 데모는 두 개의 이야기로 짜여 있다.
 *
 *  ① 제108회 전국체육대회 준비 (부서 간 협업, 제품의 70%)
 *     추진단·체육진흥과·교통정책과·안전정책과·공보실·예산재정과가 하나의 일에 얽힌다.
 *     이런 일은 지금 부서별 문서함과 메신저 대화로 흩어져 있고, 전체를 아는 사람이 없다.
 *
 *  ② 자원순환과 박준호 → 이하람 인계 (인수인계, 제품의 30%)
 *     8월 정기인사. 넘겨야 할 업무 중 하나가 매년 반복되는 원가산정 용역이고,
 *     작년 판이 시스템에 그대로 남아 있다. 「작년 이맘때」가 여기서 작동한다.
 *
 * 날짜는 공모전 기간(2026-08 ~ 09)을 기준으로 고정했다.
 * 실행 시각에 따라 값이 변하면 서버와 브라우저의 화면이 어긋나기 때문이다.
 */

import type {
  AccessLog,
  AppNotification,
  Activity,
  Approval,
  ApprovalKind,
  ApprovalStep,
  Attachment,
  Comment,
  DocSection,
  Document,
  Handover,
  HandoverItem,
  Note,
  Work,
  WorkMember,
} from "@/lib/types";
// 서식 문서의 모양은 여기서 다시 적지 않는다. model.ts 의 RichDoc 을 그대로 쓰면
// 갈래 이름을 잘못 적었을 때 타입 검사에서 걸린다 — 목업이 화면에서 조용히
// 「본문」으로 떨어지는 것보다 낫다(parseRichDoc 은 모르는 갈래를 body 로 읽는다).
import type { RichDoc } from "@/lib/editor/model";
import { dept, person } from "./org";

export const workId = (n: number) =>
  `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const docId = (n: number) =>
  `dc000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const secId = (n: number) =>
  `5e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cmtId = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const attId = (n: number) =>
  `a7000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** 인계 시나리오의 주인공 업무 — 화면 여러 곳에서 이 id를 가리킨다. */
export const FEATURED_WORK_ID = workId(1);
export const HANDOVER_WORK_ID = workId(5);
export const HANDOVER_ID = "40000000-0000-4000-8000-000000000001";

type WorkSeed = {
  n: number;
  title: string;
  description: string;
  dept: string;
  owner: string;
  status: Work["status"];
  visibility: Work["visibility"];
  due: string | null;
  created: string;
  updated: string;
  year?: number;
  prev?: number;
  archived?: string;
  /** [사람, 역할] — 주담당자는 자동으로 owner 역할이 되므로 여기 적지 않는다 */
  members?: Array<[string, WorkMember["role"]]>;
};

const SEEDS: WorkSeed[] = [
  {
    n: 1,
    title: "제108회 전국체육대회 종합 준비",
    description:
      "2027년 화성시 개최 전국체전의 부서 간 준비 상황을 한곳에서 관리한다. 경기장·수송·안전·홍보·예산 소관 부서가 각자 진행하던 계획을 하나의 업무로 묶어 일정과 결정 사항을 공유한다.",
    dept: "전국체전추진단",
    owner: "김서연",
    status: "doing",
    visibility: "city",
    due: "2026-10-30",
    created: "2026-03-02T09:14:00+09:00",
    updated: "2026-08-05T17:41:00+09:00",
    members: [
      ["황수아", "editor"],
      ["정유진", "editor"],
      ["한지우", "editor"],
      ["오세훈", "editor"],
      ["고은비", "editor"],
      ["배도현", "viewer"],
    ],
  },
  {
    n: 2,
    title: "전국체전 경기장 시설 개보수",
    description:
      "종합경기타운·실내체육관 등 8개 시설의 개보수 범위와 공정을 관리한다. 대회 규격 충족 여부는 대한체육회 시설 실사에서 확인한다.",
    dept: "체육진흥과",
    owner: "정유진",
    status: "doing",
    visibility: "city",
    due: "2026-09-25",
    created: "2026-03-11T10:02:00+09:00",
    updated: "2026-08-04T11:20:00+09:00",
    members: [
      ["김서연", "editor"],
      ["황수아", "viewer"],
    ],
  },
  {
    n: 3,
    title: "전국체전 수송·교통대책 수립",
    description:
      "선수단·임원·관람객 수송 계획과 대회 기간 교통 통제 방안. 트램 개통 일정과 맞물려 있어 대중교통과·트램건설추진단과 함께 본다.",
    dept: "교통정책과",
    owner: "한지우",
    status: "todo",
    visibility: "city",
    // 기한이 지난 업무. 트램 개통 일정이 확정되지 않아 미뤄지고 있는 상황이고,
    // 부서가 걸쳐 있어 아무도 먼저 손대지 않는, 이 제품이 겨냥하는 전형적인 사례다.
    due: "2026-07-28",
    created: "2026-05-20T14:30:00+09:00",
    updated: "2026-08-03T09:05:00+09:00",
    members: [
      ["김서연", "viewer"],
      ["최민재", "editor"],
      ["노태경", "viewer"],
    ],
  },
  {
    n: 4,
    title: "전국체전 안전관리계획 수립",
    description:
      "다중운집 안전관리계획과 대회 기간 재난 대응 체계. 「공연법」·「재난 및 안전관리 기본법」 검토 결과를 포함한다.",
    dept: "안전정책과",
    owner: "오세훈",
    status: "review",
    visibility: "city",
    due: "2026-08-24",
    created: "2026-04-08T13:11:00+09:00",
    updated: "2026-08-05T15:52:00+09:00",
    members: [["김서연", "editor"]],
  },
  {
    n: 5,
    title: "2026년 음식물류폐기물 수집·운반 대행 원가산정 용역",
    description:
      "「폐기물관리법」 제14조에 따른 대행 원가 산정. 매년 하반기에 다음 연도 대행료 결정을 위해 반복 시행하며, 산정 결과는 대행업체 계약 협상의 기준이 된다.",
    dept: "자원순환과",
    owner: "박준호",
    status: "review",
    visibility: "department",
    due: "2026-08-14",
    created: "2026-06-15T09:40:00+09:00",
    updated: "2026-08-05T18:10:00+09:00",
    prev: 6,
    members: [
      ["이하람", "viewer"],
      ["배도현", "viewer"],
    ],
  },
  {
    n: 6,
    title: "2025년 음식물류폐기물 수집·운반 대행 원가산정 용역",
    description:
      "작년 시행분. 용역 결과 대행료 단가가 전년 대비 4.1% 인상되었고, 인상률 근거 자료가 시의회 행정사무감사에서 다시 요구되었다.",
    dept: "자원순환과",
    owner: "박준호",
    status: "done",
    visibility: "department",
    due: "2025-09-30",
    created: "2025-06-10T10:00:00+09:00",
    updated: "2025-10-14T16:30:00+09:00",
    year: 2025,
    archived: "2025-12-31T23:59:00+09:00",
  },
  {
    n: 7,
    title: "동탄 트램 1호선 개통 대비 시내버스 노선 개편",
    description:
      "트램 개통에 따라 중복 노선을 조정하고 환승 연계를 설계한다. 노선 조정은 주민 민원이 크게 발생하는 사안이라 설명회 이력을 함께 남긴다.",
    dept: "대중교통과",
    owner: "최민재",
    status: "doing",
    visibility: "department",
    due: "2026-11-30",
    created: "2026-02-17T11:25:00+09:00",
    updated: "2026-08-01T14:03:00+09:00",
    members: [
      ["노태경", "editor"],
      ["한지우", "viewer"],
    ],
  },
  {
    n: 8,
    title: "재활용 선별시설 반입수수료 조정",
    description:
      "선별시설 운영원가 상승분을 반영한 반입수수료 조례 개정 검토. 조례 개정이 필요해 의회법무과 협의가 선행되어야 한다.",
    dept: "자원순환과",
    owner: "박준호",
    status: "todo",
    visibility: "department",
    due: "2026-09-04",
    created: "2026-07-02T09:12:00+09:00",
    updated: "2026-07-29T10:44:00+09:00",
  },
  {
    n: 9,
    title: "청소차량 운행기록 전산화",
    description:
      "종량제 수거차량 운행기록을 수기 대장에서 차량 단말 기반으로 전환한다. 민원 발생 시 수거 시각을 확인하는 데 쓰인다.",
    dept: "자원순환과",
    owner: "박준호",
    status: "doing",
    visibility: "department",
    due: "2026-08-28",
    created: "2026-04-21T15:33:00+09:00",
    updated: "2026-08-02T09:58:00+09:00",
    members: [["이하람", "editor"]],
  },
  {
    n: 10,
    title: "AI 행정업무 시범과제 2차 확산",
    description:
      "1차 시범 부서의 활용 결과를 정리하고 확산 대상 부서를 선정한다. 부서별 담당자 교육 일정과 활용 사례를 함께 관리한다.",
    dept: "AI스마트전략실",
    owner: "서나윤",
    status: "doing",
    visibility: "city",
    due: "2026-09-11",
    created: "2026-05-06T10:15:00+09:00",
    updated: "2026-08-05T13:22:00+09:00",
    members: [["김서연", "viewer"]],
  },
  {
    n: 11,
    title: "2027년도 본예산 편성지침 시달",
    description:
      "각 부서 예산 요구서 작성 기준과 제출 일정을 정리해 시달한다. 전국체전 관련 사업은 별도 검토 대상으로 분류한다.",
    dept: "예산재정과",
    owner: "배도현",
    status: "todo",
    visibility: "city",
    due: "2026-09-30",
    created: "2026-07-14T09:00:00+09:00",
    updated: "2026-07-31T17:12:00+09:00",
    prev: 19,
    members: [["김서연", "viewer"]],
  },
  {
    n: 12,
    title: "반도체 특화단지 기반시설 인허가 사전협의",
    description:
      "용수·전력 공급 계획에 대한 관계기관 사전협의. 협의 지연이 입주기업 일정에 직접 영향을 주는 사안이다.",
    dept: "첨단산업과",
    owner: "임채운",
    status: "doing",
    visibility: "department",
    due: "2026-07-31",
    created: "2026-03-30T09:47:00+09:00",
    updated: "2026-07-28T16:05:00+09:00",
  },
  {
    n: 13,
    title: "국공립어린이집 3개소 신규 설치",
    description:
      "동탄권 2개소·향남권 1개소 설치를 위한 부지 선정과 리모델링 설계. 공동주택 관리동 활용 방안을 병행 검토한다.",
    dept: "영유아보육과",
    owner: "강예서",
    status: "doing",
    visibility: "department",
    due: "2026-09-18",
    created: "2026-04-02T11:08:00+09:00",
    updated: "2026-08-04T14:47:00+09:00",
  },
  {
    n: 14,
    title: "화성 뱃놀이 축제 운영계획 수립",
    description:
      "축제 프로그램 구성과 안전관리 계획. 전곡항 일대 교통 통제 범위는 교통정책과와 협의한다.",
    dept: "문화예술과",
    owner: "윤가온",
    status: "review",
    visibility: "department",
    due: "2026-08-18",
    created: "2026-05-13T10:30:00+09:00",
    updated: "2026-08-05T11:19:00+09:00",
    members: [["오세훈", "viewer"]],
  },
  {
    n: 15,
    title: "노후 상수관로 정비 3차",
    description:
      "1990년대 매설 구간의 누수 저감을 위한 관로 교체. 굴착 구간이 통학로와 겹쳐 학교 방학 기간에 시행해야 한다.",
    dept: "물환경생태과",
    owner: "류민석",
    status: "todo",
    visibility: "department",
    due: "2026-07-24",
    created: "2026-06-01T09:20:00+09:00",
    updated: "2026-07-20T15:00:00+09:00",
  },
  {
    n: 16,
    title: "시민 안전보험 갱신 계약",
    description:
      "전 시민 대상 안전보험 보장 항목 조정 및 갱신 계약 체결. 보장 범위 변경 사항은 시 누리집에 공고했다.",
    dept: "안전정책과",
    owner: "오세훈",
    status: "done",
    visibility: "department",
    due: "2026-06-30",
    created: "2026-03-05T13:40:00+09:00",
    updated: "2026-06-27T16:22:00+09:00",
  },
  {
    n: 17,
    title: "전국체전 홍보·미디어 운영계획",
    description:
      "대회 D-500 기점 홍보 로드맵과 미디어센터 운영 방안. 계획 확정 후 추진단 종합계획에 반영했다.",
    dept: "공보실",
    owner: "고은비",
    status: "done",
    visibility: "city",
    due: "2026-07-15",
    created: "2026-04-17T09:55:00+09:00",
    updated: "2026-07-14T18:02:00+09:00",
    members: [["김서연", "viewer"]],
  },
  {
    n: 18,
    title: "동탄 트램 시운전 구간 주민설명회",
    description:
      "시운전 구간 인접 주민 대상 설명회 3회 개최 및 제기된 의견 정리. 소음 관련 의견이 다수였다.",
    dept: "트램건설추진단",
    owner: "노태경",
    status: "done",
    visibility: "city",
    due: "2026-06-20",
    created: "2026-04-28T10:10:00+09:00",
    updated: "2026-06-23T11:35:00+09:00",
    members: [["최민재", "viewer"]],
  },
  {
    // 「작년 이맘때」의 두 번째 짝. 첫 번째(5↔6)는 자원순환과 인계 이야기 안에만
    // 있어서, 첫 화면에 놓인 계정(김서연)으로는 이 기능이 어느 화면에서도
    // 나타나지 않았다. 예산 편성지침은 해마다 같은 시기에 같은 형식으로
    // 시달하는 전형적인 반복 업무이고, 김서연이 열람자로 걸려 있다.
    n: 19,
    title: "2026년도 본예산 편성지침 시달",
    description:
      "작년 시달분. 부서별 요구서 제출 기한을 2주 앞당겼는데 절반 가까운 부서가 지키지 못해, 다음 해에는 기한 설정을 다시 보기로 했다.",
    dept: "예산재정과",
    owner: "배도현",
    status: "done",
    visibility: "city",
    due: "2025-09-30",
    created: "2025-07-15T09:10:00+09:00",
    updated: "2025-10-02T15:42:00+09:00",
    year: 2025,
    archived: "2025-12-31T23:59:00+09:00",
    members: [["김서연", "viewer"]],
  },

  // ── 20~30 ────────────────────────────────────────────────────────────────
  // 처음 열 아홉 건으로는 어느 계정으로 들어가도 보드가 여덟 칸을 넘지 않았고,
  // 네 칸짜리 칸반에서 그것은 절반이 빈 판으로 보인다. 실제 과 하나가 동시에
  // 굴리는 일은 이보다 많다 — 밀도를 실물에 가깝게 올린다.
  //
  // 늘리는 기준은 「칸을 채운다」가 아니라 **각 데모 계정이 자기 화면에서
  // 자기 일을 본다**이다. 특히 최민재(대중교통과)는 소관 업무가 한 건뿐이라
  // 보드도 열람기록도 거의 비어 있었다.
  {
    n: 20,
    title: "전국체전 자원봉사자 모집·운영계획",
    description:
      "대회 기간 자원봉사자 1,200명 모집과 배치 계획. 경기장별 소요 인원은 시설 개보수 완료 시점에 따라 달라져 체육진흥과와 함께 본다.",
    dept: "전국체전추진단",
    owner: "황수아",
    status: "doing",
    visibility: "city",
    due: "2026-10-16",
    created: "2026-04-14T10:20:00+09:00",
    updated: "2026-08-06T15:12:00+09:00",
    members: [
      ["김서연", "editor"],
      ["고은비", "viewer"],
    ],
  },
  {
    n: 21,
    title: "대중교통 환승할인 확대 시행",
    description:
      "광역버스·마을버스 간 환승할인 적용 범위를 넓힌다. 경기도 통합환승 정산 체계와 맞물려 도 협의가 선행되어야 한다.",
    dept: "대중교통과",
    owner: "최민재",
    status: "doing",
    visibility: "department",
    due: "2026-09-30",
    created: "2026-03-24T09:35:00+09:00",
    updated: "2026-08-06T11:48:00+09:00",
    members: [["한지우", "viewer"]],
  },
  {
    n: 22,
    title: "시내버스 정류소 안전시설 정비",
    description:
      "승강장 미설치 정류소 74개소에 대기 공간과 조명을 보강한다. 통학로와 겹치는 구간을 우선 시행한다.",
    dept: "대중교통과",
    owner: "최민재",
    status: "review",
    visibility: "department",
    due: "2026-08-21",
    created: "2026-05-02T13:50:00+09:00",
    updated: "2026-08-05T16:30:00+09:00",
    members: [["오세훈", "viewer"]],
  },
  {
    // 김서연 보드의 두 번째 지연 업무. 지연이 한 건뿐이면 「지연」이라는 상태가
    // 화면에서 예외로 읽히는데, 실제로는 이 제품이 겨냥한 가장 흔한 상태다.
    n: 23,
    title: "전국체전 성화봉송 코스 확정",
    description:
      "봉송 구간과 일자별 통제 범위를 확정한다. 코스가 확정되어야 경찰 협의와 홍보 일정이 함께 움직인다.",
    dept: "체육진흥과",
    owner: "정유진",
    status: "todo",
    visibility: "city",
    due: "2026-08-10",
    created: "2026-06-08T11:14:00+09:00",
    updated: "2026-08-04T10:26:00+09:00",
    members: [
      ["김서연", "editor"],
      ["고은비", "editor"],
    ],
  },
  {
    n: 24,
    title: "음식물류폐기물 감량 시범사업 확대",
    description:
      "공동주택 감량기 보급 시범을 4개 단지에서 12개 단지로 넓힌다. 감량 실적은 대행 원가산정의 물량 추계에 그대로 반영된다.",
    dept: "자원순환과",
    owner: "박준호",
    status: "doing",
    visibility: "department",
    due: "2026-09-18",
    created: "2026-04-09T14:22:00+09:00",
    updated: "2026-08-05T17:05:00+09:00",
    members: [["이하람", "editor"]],
  },
  {
    n: 25,
    title: "AI 행정업무 1차 시범 결과 보고",
    description:
      "1차 시범 6개 부서의 활용 실적과 개선 요구를 정리했다. 2차 확산 대상 선정의 근거 자료로 쓴다.",
    dept: "AI스마트전략실",
    owner: "서나윤",
    status: "done",
    visibility: "city",
    due: "2026-06-30",
    created: "2026-02-10T09:30:00+09:00",
    updated: "2026-06-26T16:15:00+09:00",
    members: [["김서연", "viewer"]],
  },
  {
    n: 26,
    title: "전국체전 개·폐회식 연출 용역 발주",
    description:
      "개·폐회식 연출 기본구상과 용역 과업지시서 작성. 발주 시기가 늦어지면 리허설 일정 전체가 밀린다.",
    dept: "전국체전추진단",
    owner: "김서연",
    status: "todo",
    visibility: "city",
    due: "2026-09-15",
    created: "2026-07-21T10:05:00+09:00",
    updated: "2026-08-04T09:12:00+09:00",
    members: [["문지호", "viewer"]],
  },
  {
    n: 27,
    title: "재활용품 선별장 악취 저감시설 보강",
    description:
      "인근 주민 악취 민원이 반복되는 구간에 탈취설비를 증설한다. 설비 사양은 물환경생태과 검토를 거친다.",
    dept: "자원순환과",
    owner: "이하람",
    status: "doing",
    visibility: "department",
    due: "2026-10-08",
    created: "2026-05-27T09:48:00+09:00",
    updated: "2026-08-03T14:40:00+09:00",
    members: [["류민석", "viewer"]],
  },
  {
    n: 28,
    title: "전국체전 경기장 주변 가로환경 정비",
    description:
      "주 경기장 진입로 보도블록·가로수·안내표지를 대회 전까지 정비한다. 구간이 여러 과에 걸쳐 있어 공정 순서를 맞춰야 한다.",
    dept: "공보실",
    owner: "고은비",
    status: "todo",
    visibility: "city",
    due: "2026-11-20",
    created: "2026-07-08T15:30:00+09:00",
    updated: "2026-07-30T11:05:00+09:00",
    members: [["김서연", "viewer"]],
  },
  {
    n: 29,
    title: "마을버스 준공영제 도입 타당성 검토",
    description:
      "적자 노선 8개에 대한 재정지원 방식 비교. 준공영제 전환 시 연간 소요 재원과 조례 개정 사항을 함께 본다.",
    dept: "대중교통과",
    owner: "최민재",
    status: "done",
    visibility: "department",
    due: "2026-05-29",
    created: "2026-01-20T10:40:00+09:00",
    updated: "2026-05-27T17:20:00+09:00",
    members: [["배도현", "viewer"]],
  },
  {
    n: 30,
    title: "전국체전 대회운영 인력 파견 협의",
    description:
      "대회 기간 부서별 파견 인력 규모와 기간을 인사과와 협의한다. 파견이 확정되어야 각 과의 대체 인력 계획이 선다.",
    dept: "전국체전추진단",
    owner: "김서연",
    status: "doing",
    visibility: "city",
    due: "2026-10-02",
    created: "2026-06-25T09:22:00+09:00",
    updated: "2026-08-06T10:35:00+09:00",
    members: [
      ["황수아", "editor"],
      ["정유진", "viewer"],
      ["최민재", "viewer"],
    ],
  },
];

export const works: Work[] = SEEDS.map((s) => ({
  id: workId(s.n),
  title: s.title,
  description: s.description,
  status: s.status,
  visibility: s.visibility,
  department_id: dept(s.dept).id,
  owner_id: person(s.owner).id,
  due_date: s.due,
  fiscal_year: s.year ?? 2026,
  previous_year_work_id: s.prev ? workId(s.prev) : null,
  archived_at: s.archived ?? null,
  created_by: person(s.owner).id,
  created_at: s.created,
  updated_at: s.updated,
}));

export const workMembers: WorkMember[] = SEEDS.flatMap((s) => {
  const owner: WorkMember = {
    work_id: workId(s.n),
    profile_id: person(s.owner).id,
    role: "owner",
    created_at: s.created,
  };
  const rest = (s.members ?? []).map(([name, role]) => ({
    work_id: workId(s.n),
    profile_id: person(name).id,
    role,
    created_at: s.created,
  }));
  return [owner, ...rest];
});

// ---------------------------------------------------------------------------
// 문서 — 업무 안에서 여럿이 나눠 쓰는 계획서
// ---------------------------------------------------------------------------

/**
 * 데모에 하나 있는 서식 문서 — 「음식물류폐기물 감량 시범사업 확대계획」.
 *
 * ── 왜 목업에 이런 것이 필요한가 ───────────────────────────────────────────
 *
 * 서식 문서가 「항목 + 평문」과 무엇이 다른지는 설명해서 알 수 있는 것이 아니라
 * 한 화면에 제목·큰 항목·글머리표·표·근거 꼬리표가 같이 있는 것을 봐야 안다.
 * 데모 모드에는 DB 가 없으므로, 여기 없으면 심사 동선에서 그 화면을 한 번도
 * 만나지 못한다.
 *
 * ── 왜 이 문서에 붙였는가 ──────────────────────────────────────────────────
 *
 * docId(8) 은 자원순환과 박준호의 감량 시범사업 문서다. 인계 이야기(머리말 ②)의
 * 한복판이라, 「작년 이맘때」와 인계서 초안을 보러 온 사람이 지나는 길에 만난다.
 * 항목(secId 21·22)은 지우지 않고 그대로 두었다 — convertToRichDoc 이 실제로
 * 하는 일이 그것이라(되돌릴 수 없으므로 항목을 안전망으로 남긴다), 목업도 옮긴
 * 직후의 상태를 그대로 보여 준다.
 *
 * ── 블록 id 를 손으로 적는 이유 ────────────────────────────────────────────
 *
 * model.ts 의 newId() 는 난수다. 목업이 실행할 때마다 다른 id 를 내면 서버가
 * 그린 화면과 브라우저가 그린 화면의 React 키가 어긋나 화면이 통째로 다시 붙는다.
 * 목업의 다른 값들을 날짜까지 고정해 둔 것과 같은 이유다(파일 머리말).
 */
const rid = (n: number) => `d8${String(n).padStart(8, "0")}`;

const pilotPlanDoc: RichDoc = {
  v: 1,
  blocks: [
    { id: rid(1), kind: "title", spans: [{ t: "음식물류폐기물 감량 시범사업 확대계획" }] },
    { id: rid(2), kind: "note", spans: [{ t: "자원순환과 · 2026. 8. 5. 기준" }], align: "right" },
    { id: rid(3), kind: "spacer", spans: [] },

    { id: rid(4), kind: "heading", spans: [{ t: "1. 추진 배경" }] },
    {
      id: rid(5),
      kind: "bullet",
      spans: [
        { t: "공동주택 감량기 보급 시범을 " },
        { t: "4개 단지에서 12개 단지", m: ["b"] },
        { t: "로 넓힌다." },
      ],
    },
    {
      id: rid(6),
      kind: "bullet",
      spans: [{ t: "감량 실적은 이듬해 수집·운반 대행 원가산정의 물량 추계에 그대로 들어간다." }],
    },
    {
      id: rid(7),
      kind: "bullet",
      indent: 1,
      spans: [
        { t: "작년 산정에서 보급률 보정을 빠뜨려 중간보고 수치를 한 번 되돌린 적이 있다.", h: "yellow" },
      ],
    },
    {
      id: rid(8),
      kind: "source",
      spans: [{ t: "근거: 「폐기물관리법」 제14조 제1항, 2026년 자원순환과 주요업무계획 3-나" }],
    },
    { id: rid(9), kind: "spacer", spans: [] },

    { id: rid(10), kind: "heading", spans: [{ t: "2. 시범 결과" }] },
    {
      id: rid(11),
      kind: "table",
      spans: [],
      table: {
        widths: [3, 1.2, 1.6, 1.6, 1.2],
        header: true,
        rows: [
          {
            cells: [
              { id: rid(21), spans: [{ t: "단지", m: ["b"] }] },
              { id: rid(22), spans: [{ t: "세대수", m: ["b"] }], align: "right" },
              { id: rid(23), spans: [{ t: "시범 전(kg/일)", m: ["b"] }], align: "right" },
              { id: rid(24), spans: [{ t: "시범 후(kg/일)", m: ["b"] }], align: "right" },
              { id: rid(25), spans: [{ t: "감량률", m: ["b"] }], align: "right" },
            ],
          },
          {
            cells: [
              { id: rid(26), spans: [{ t: "봉담 ○○1단지" }] },
              { id: rid(27), spans: [{ t: "720" }], align: "right" },
              { id: rid(28), spans: [{ t: "412" }], align: "right" },
              { id: rid(29), spans: [{ t: "318" }], align: "right" },
              { id: rid(30), spans: [{ t: "22.8%" }], align: "right" },
            ],
          },
          {
            cells: [
              { id: rid(31), spans: [{ t: "향남 ○○2단지" }] },
              { id: rid(32), spans: [{ t: "540" }], align: "right" },
              { id: rid(33), spans: [{ t: "305" }], align: "right" },
              { id: rid(34), spans: [{ t: "241" }], align: "right" },
              { id: rid(35), spans: [{ t: "21.0%" }], align: "right" },
            ],
          },
          {
            cells: [
              { id: rid(36), spans: [{ t: "동탄 ○○3단지" }] },
              { id: rid(37), spans: [{ t: "1,120" }], align: "right" },
              { id: rid(38), spans: [{ t: "638" }], align: "right" },
              { id: rid(39), spans: [{ t: "511" }], align: "right" },
              { id: rid(40), spans: [{ t: "19.9%" }], align: "right" },
            ],
          },
          {
            cells: [
              { id: rid(41), spans: [{ t: "병점 ○○4단지" }] },
              { id: rid(42), spans: [{ t: "380" }], align: "right" },
              { id: rid(43), spans: [{ t: "214" }], align: "right" },
              { id: rid(44), spans: [{ t: "166" }], align: "right" },
              { id: rid(45), spans: [{ t: "22.4%" }], align: "right" },
            ],
          },
          {
            cells: [
              { id: rid(46), spans: [{ t: "계", m: ["b"] }] },
              { id: rid(47), spans: [{ t: "2,760", m: ["b"] }], align: "right" },
              { id: rid(48), spans: [{ t: "1,569", m: ["b"] }], align: "right" },
              { id: rid(49), spans: [{ t: "1,236", m: ["b"] }], align: "right" },
              { id: rid(50), spans: [{ t: "21.4%", m: ["b"] }], align: "right" },
            ],
          },
        ],
      },
    },
    {
      id: rid(12),
      kind: "note",
      spans: [{ t: "※ 감량률은 2026. 3. ~ 6. 넉 달 평균이다. 배출 양상이 다른 설 연휴 주간은 뺐다." }],
    },
    { id: rid(13), kind: "spacer", spans: [] },

    { id: rid(14), kind: "heading", spans: [{ t: "3. 확대 시행 방안" }] },
    {
      id: rid(15),
      kind: "numbered",
      spans: [
        { t: "관리 주체를 " },
        { t: "관리사무소", m: ["b"] },
        { t: "로 통일한다. 시범 단지 4곳의 관리 주체가 달라(관리사무소 3, 입주자대표회의 1) 유지관리 편차가 컸다." },
      ],
    },
    {
      id: rid(16),
      kind: "numbered",
      spans: [{ t: "감량기 고장 신고 창구를 자원순환과 단일 창구로 둔다." }],
    },
    {
      id: rid(17),
      kind: "numbered",
      indent: 1,
      spans: [{ t: "신고 접수 후 48시간 안에 현장 확인을 마친다." }],
    },
    {
      id: rid(18),
      kind: "numbered",
      spans: [{ t: "원가산정 착수 전에 감량 실적을 먼저 넘긴다(9월 중)." }],
    },
    { id: rid(19), kind: "subheading", spans: [{ t: "가. 소요 예산" }] },
    {
      id: rid(20),
      kind: "body",
      spans: [
        { t: "감량기 8대 추가 보급 " },
        { t: "1억 2,400만 원", m: ["b"] },
        { t: " (2026년 본예산 자원순환 시책추진비에서 충당한다). 부족분은 추경에 반영을 요구한다." },
      ],
    },
    {
      id: rid(51),
      kind: "quote",
      spans: [{ t: "확대 시행 조건을 붙이지 않으면 관리 주체가 다시 갈릴 수 있다는 것이 시범의 결론이다." }],
    },
    {
      id: rid(52),
      kind: "source",
      spans: [{ t: "근거: 2025년 음식물류폐기물 수집·운반 대행 원가산정 용역 최종보고서 42쪽 「보급률 보정계수」" }],
    },
  ],
};

export const documents: Document[] = [
  {
    id: docId(1),
    work_id: workId(1),
    title: "제108회 전국체육대회 종합 준비계획",
    created_by: person("김서연").id,
    created_at: "2026-03-02T09:31:00+09:00",
    updated_at: "2026-08-05T17:41:00+09:00",
    blocks: null,
    blocks_rev: 0,
    blocks_updated_by: null,
    blocks_updated_at: null,
  },
  {
    id: docId(2),
    work_id: workId(5),
    title: "음식물류폐기물 대행 원가산정 추진계획",
    created_by: person("박준호").id,
    created_at: "2026-06-15T10:05:00+09:00",
    updated_at: "2026-08-05T18:10:00+09:00",
    blocks: null,
    blocks_rev: 0,
    blocks_updated_by: null,
    blocks_updated_at: null,
  },
  {
    id: docId(3),
    work_id: workId(6),
    title: "2025년 원가산정 용역 결과 정리",
    created_by: person("박준호").id,
    created_at: "2025-09-22T14:00:00+09:00",
    updated_at: "2025-10-14T16:30:00+09:00",
    blocks: null,
    blocks_rev: 0,
    blocks_updated_by: null,
    blocks_updated_at: null,
  },
  {
    // 홈에서 가장 크게 보이는 업무(기한 17일 지남)의 문서.
    // 예전에는 이 업무에 문서가 한 건도 없어서, 첫 화면에서 가장 눈에 띄는
    // 카드를 누른 사람이 「아직 문서가 없습니다」를 처음 만났다.
    // 비어 있는 것이 사실이라도, 이 업무가 멈춰 있는 이유는 기록에 남아 있어야 한다.
    id: docId(4),
    work_id: workId(3),
    title: "전국체전 수송·교통대책 추진계획",
    created_by: person("한지우").id,
    created_at: "2026-05-20T14:45:00+09:00",
    updated_at: "2026-07-02T16:20:00+09:00",
    blocks: null,
    blocks_rev: 0,
    blocks_updated_by: null,
    blocks_updated_at: null,
  },
  {
    id: docId(5),
    work_id: workId(19),
    title: "2026년도 본예산 편성지침",
    created_by: person("배도현").id,
    created_at: "2025-07-15T09:25:00+09:00",
    updated_at: "2025-10-02T15:40:00+09:00",
    blocks: null,
    blocks_rev: 0,
    blocks_updated_by: null,
    blocks_updated_at: null,
  },
  {
    // 최민재 계정으로 들어가면 문서 탭이 어느 업무에서도 비어 있었다.
    // 「문서를 섹션 단위로 나눠 쓴다」가 이 제품의 첫 번째 주장인데,
    // 네 계정 중 하나는 그 주장을 화면에서 한 번도 못 봤다.
    id: docId(6),
    work_id: workId(21),
    title: "환승할인 확대 시행계획",
    created_by: person("최민재").id,
    created_at: "2026-03-24T10:02:00+09:00",
    updated_at: "2026-08-06T11:48:00+09:00",
    blocks: null,
    blocks_rev: 0,
    blocks_updated_by: null,
    blocks_updated_at: null,
  },
  {
    id: docId(7),
    work_id: workId(30),
    title: "대회운영 인력 파견 협의안",
    created_by: person("김서연").id,
    created_at: "2026-06-25T09:50:00+09:00",
    updated_at: "2026-08-06T10:35:00+09:00",
    blocks: null,
    blocks_rev: 0,
    blocks_updated_by: null,
    blocks_updated_at: null,
  },
  {
    id: docId(8),
    work_id: workId(24),
    title: "음식물류폐기물 감량 시범사업 확대계획",
    created_by: person("박준호").id,
    created_at: "2026-04-09T15:10:00+09:00",
    updated_at: "2026-08-05T17:05:00+09:00",
    // 데모에서 유일한 서식 문서. 항목(secId 21·22)도 그대로 남아 있다.
    blocks: pilotPlanDoc,
    // 옮긴 뒤 몇 번 더 고친 문서로 둔다. 판이 0이면 「한 번도 저장된 적 없는
    // 문서」로 읽히는데, 화면에는 8월 5일에 고친 것으로 적혀 있어 서로 어긋난다.
    blocks_rev: 6,
    blocks_updated_by: person("박준호").id,
    blocks_updated_at: "2026-08-05T17:05:00+09:00",
  },
];

export const docSections: DocSection[] = [
  {
    id: secId(1),
    document_id: docId(1),
    sort_order: 0,
    heading: "1. 추진 배경 및 경과",
    body: "2027년 제108회 전국체육대회가 우리 시에서 개최된다. 개최지 확정 이후 시설·수송·안전·홍보 소관 부서가 각각 준비에 착수했으나, 부서별 일정이 서로 맞물리는 지점이 정리되지 않아 같은 사안을 두 번 협의하는 일이 반복되었다.\n\n이에 준비 상황을 하나의 업무로 묶어 관리한다. 각 부서의 세부 계획은 부서별 업무로 유지하되, 부서 간 결정이 필요한 사항은 이 문서에 모은다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("김서연").id,
    updated_at: "2026-03-02T09:48:00+09:00",
  },
  {
    id: secId(2),
    document_id: docId(1),
    sort_order: 1,
    heading: "2. 부서별 역할 분담",
    body: "· 전국체전추진단 — 종합 기획, 대한체육회 협의, 개·폐회식\n· 체육진흥과 — 경기장 8개소 개보수, 시설 실사 대응\n· 교통정책과 — 선수단 수송, 대회 기간 교통 통제\n· 대중교통과 — 셔틀 노선 편성, 트램 연계\n· 안전정책과 — 다중운집 안전관리, 재난 대응\n· 공보실 — 홍보 로드맵, 미디어센터\n· 예산재정과 — 사업별 재원 배분 검토",
    // 지금 누군가 편집 중인 섹션. 잠금은 DB 정책이 강제한다.
    //
    // 고정된 시각을 적을 수 없다. 잠금은 5분이 지나면 풀린 것으로 보므로
    // (app.section_lock_active / sectionLockActive) 박아 둔 시각은 시연 당일에
    // 반드시 만료되어 있고, 「편집 중」 배지가 영영 안 보인다.
    // 화면을 열 때마다 1분 전으로 잡아 잠금이 살아 있는 상태를 보여 준다.
    locked_by: person("정유진").id,
    locked_at: new Date(Date.now() - 60_000).toISOString(),
    updated_by: person("정유진").id,
    updated_at: "2026-08-05T17:41:00+09:00",
  },
  {
    id: secId(3),
    document_id: docId(1),
    sort_order: 2,
    heading: "3. 주요 일정",
    body: "· 2026. 9. — 대한체육회 1차 시설 실사\n· 2026. 10. — 종합 준비계획 확정, 시의회 보고\n· 2026. 11. — 수송·교통대책 확정(트램 개통 일정 연동)\n· 2027. 3. — 2차 시설 실사, 개보수 완료\n· 2027. 5. — 종합 리허설",
    locked_by: null,
    locked_at: null,
    updated_by: person("황수아").id,
    updated_at: "2026-07-30T16:24:00+09:00",
  },
  {
    id: secId(4),
    document_id: docId(1),
    sort_order: 3,
    heading: "4. 예산 소요 및 재원",
    body: "총 소요액은 시설 개보수분이 확정되어야 산출 가능하다. 2027년도 본예산 편성지침에 따라 별도 검토 대상으로 분류되었으며, 부서별 요구액은 2026년 9월까지 취합한다.\n\n국비·도비 지원 규모는 대한체육회 실사 결과에 따라 달라질 수 있어 확정 전까지 추계치로 관리한다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("배도현").id,
    updated_at: "2026-08-04T10:11:00+09:00",
  },

  // --- 인계의 핵심 문서 -----------------------------------------------------
  {
    id: secId(5),
    document_id: docId(2),
    sort_order: 0,
    heading: "1. 추진 근거 및 경과",
    body: "「폐기물관리법」 제14조 및 같은 법 시행규칙에 따라 생활폐기물 수집·운반 대행료 산정을 위한 원가 계산 용역을 매년 시행한다.\n\n2026. 6. 15. 용역 착수, 2026. 8. 중 결과 보고 예정. 산정 결과는 2027년도 대행 계약 협상의 기준이 된다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2026-06-15T10:22:00+09:00",
  },
  {
    id: secId(6),
    document_id: docId(2),
    sort_order: 1,
    heading: "2. 작년과 달라진 점",
    body: "① 수거 구역이 4개 구 체제로 개편되면서 권역 구분이 작년과 다르다. 작년 산정서의 권역별 물량을 그대로 쓰면 맞지 않는다.\n\n② 인건비 산정 기준이 되는 노임단가 고시가 2026. 1. 개정되었다.\n\n③ 작년에는 차량 감가상각 내용연수를 7년으로 잡았는데, 시의회 행정사무감사에서 근거를 요구받았다. 올해는 산정 근거를 본문에 명시했다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2026-07-22T14:35:00+09:00",
  },
  {
    id: secId(7),
    document_id: docId(2),
    sort_order: 2,
    heading: "3. 용역 진행 상황",
    body: "· 2026. 6. 15. 착수보고회 완료\n· 2026. 7. 10. 대행업체 원가자료 제출 완료(3개사)\n· 2026. 7. 28. 중간보고 — 권역 개편분 반영 요청\n· 2026. 8. 14. 최종보고 예정",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2026-08-05T18:10:00+09:00",
  },
  {
    id: secId(8),
    document_id: docId(2),
    sort_order: 3,
    heading: "4. 현안 및 유의사항",
    body: "대행업체 3개사 중 1개사가 차량 정비비 자료를 실비가 아닌 추정치로 제출했다. 작년에도 같은 문제가 있었고, 당시에는 최근 3년 평균으로 대체해 산정했다. 같은 방식으로 처리하려면 근거 문서를 남겨야 한다.\n\n최종보고 이후 대행료 인상률이 나오면 곧바로 언론 문의가 들어온다. 작년에는 보고 다음 날 문의가 왔다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2026-08-05T18:10:00+09:00",
  },

  // --- 작년 판 -------------------------------------------------------------
  {
    id: secId(9),
    document_id: docId(3),
    sort_order: 0,
    heading: "1. 산정 결과 요약",
    body: "2025년 원가산정 결과 대행료 단가가 전년 대비 4.1% 인상되었다. 인상 요인은 노임단가 상승(2.8%p)과 유류비 상승(1.0%p)이 대부분이다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2025-09-22T14:20:00+09:00",
  },
  {
    id: secId(10),
    document_id: docId(3),
    sort_order: 1,
    heading: "2. 시의회 행정사무감사 지적사항",
    body: "차량 감가상각 내용연수 7년의 근거를 요구받았다. 「지방자치단체 원가계산 준칙」과 유사 지자체 사례를 근거로 제출해 마무리했으나, 다음 해 산정서에는 근거를 본문에 명시하라는 의견이 있었다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2025-10-14T16:30:00+09:00",
  },

  // --- 멈춰 있는 업무 ------------------------------------------------------
  // 기한이 17일 지난 업무다. 아무도 손대지 않아서 지연된 것이 아니라,
  // 다른 부서의 결정을 기다리느라 멈춰 있다는 사실이 문서에 남아 있어야 한다.
  // 담당자가 바뀌면 가장 먼저 사라지는 것이 바로 이 「왜 멈췄는가」다.
  {
    id: secId(11),
    document_id: docId(4),
    sort_order: 0,
    heading: "1. 추진 배경",
    body: "제108회 전국체육대회 기간 중 선수단·임원·관람객 수송 계획과 대회 기간 교통 통제 방안을 수립한다.\n\n대회 기간 일일 이동 인원은 개·폐회식일 기준 최대 3만 8천 명으로 추계했다. 이 수치는 종합 준비계획의 시설 수용인원이 아니라 실제 관람객 추계치를 쓴다 — 근거가 다르므로 두 문서의 숫자가 다르다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("한지우").id,
    updated_at: "2026-06-04T11:10:00+09:00",
  },
  {
    id: secId(12),
    document_id: docId(4),
    sort_order: 1,
    heading: "2. 검토 중인 노선안",
    body: "· 1안(트램 전제) — 동탄1호선을 주 간선으로 두고 셔틀 6개 노선을 연계한다. 임시노선 운행 소요가 가장 적다.\n· 2안(트램 미전제) — 시내버스 임시노선 11개를 신설한다. 1안 대비 운행 소요 예산이 약 2.4배로 늘어난다.\n\n두 안의 예산 차이가 커서 하나로 좁히지 못한 채 병기하고 있다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("한지우").id,
    updated_at: "2026-07-02T16:20:00+09:00",
  },
  {
    id: secId(13),
    document_id: docId(4),
    sort_order: 2,
    heading: "3. 멈춰 있는 사유",
    body: "동탄 트램 1호선 개통 일정이 확정되지 않아 노선안을 하나로 좁히지 못하고 있다. 트램건설추진단에 두 차례 문의했으나 「개통 시기는 시운전 결과를 본 뒤 판단」이라는 회신을 받았다.\n\n기한(2026. 7. 28.)을 넘긴 것은 이 때문이며, 개통 일정이 확정되는 즉시 1안으로 확정하고 예산을 산출할 수 있도록 2안까지 작성해 두었다.\n\n다음 담당자에게: 트램 시운전 구간 주민설명회 업무에 시운전 일정이 정리되어 있다. 거기부터 보면 된다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("한지우").id,
    updated_at: "2026-07-02T16:32:00+09:00",
  },

  // --- 작년 편성지침 -------------------------------------------------------
  {
    id: secId(14),
    document_id: docId(5),
    sort_order: 0,
    heading: "1. 편성 방향",
    body: "세입 여건을 고려해 신규 사업은 원칙적으로 억제하고, 계속사업은 집행 실적을 근거로 재검토한다. 부서별 요구 총액은 전년도 본예산 대비 증가율 3% 이내로 관리한다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("배도현").id,
    updated_at: "2025-07-15T09:40:00+09:00",
  },
  {
    id: secId(15),
    document_id: docId(5),
    sort_order: 1,
    heading: "2. 시달 결과 및 다음 해 유의사항",
    body: "요구서 제출 기한을 예년보다 2주 앞당겼으나, 68개 과 중 31개 과가 기한을 넘겨 제출했다. 앞당긴 기한이 각 부서의 자체 심의 일정과 맞지 않았던 것이 원인이다.\n\n다음 해에는 기한을 예년 수준으로 되돌리거나, 실·국별 자체 심의 일정을 먼저 받아 역산해 정할 필요가 있다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("배도현").id,
    updated_at: "2025-10-02T15:40:00+09:00",
  },

  // --- 환승할인 (최민재) ----------------------------------------------------
  {
    id: secId(16),
    document_id: docId(6),
    sort_order: 0,
    heading: "1. 추진 배경",
    body: "광역버스와 마을버스 사이에 환승할인이 적용되지 않아, 같은 거리를 이동해도 노선 조합에 따라 요금이 최대 1,450원까지 차이가 난다. 동탄·향남권 출퇴근 통행에서 이 조합이 가장 많다.\n\n2026년 상반기 접수된 대중교통 요금 관련 민원 213건 중 88건이 이 사안이다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("최민재").id,
    updated_at: "2026-03-24T10:18:00+09:00",
  },
  {
    id: secId(17),
    document_id: docId(6),
    sort_order: 1,
    heading: "2. 도(道) 협의 경과",
    body: "환승 정산은 경기도 통합환승 체계 안에서 이루어지므로 우리 시 단독으로는 시행할 수 없다.\n\n· 2026. 4. 15. 1차 협의 — 시 단위 선시행은 정산 로직 분기가 필요하다는 회신\n· 2026. 6. 3. 2차 협의 — 도 차원 개편 일정(2027년 상반기)에 맞추자는 의견\n· 2026. 7. 29. 3차 협의 — 우리 시가 정산 차액을 부담하는 조건이면 선시행 가능",
    locked_by: null,
    locked_at: null,
    updated_by: person("최민재").id,
    updated_at: "2026-07-30T09:44:00+09:00",
  },
  {
    id: secId(18),
    document_id: docId(6),
    sort_order: 2,
    heading: "3. 소요 재원 및 남은 결정",
    body: "정산 차액을 우리 시가 부담할 경우 연간 소요액은 약 18억 원으로 추계된다. 2027년도 본예산 편성지침의 신규사업 억제 방침과 충돌하므로 예산재정과 사전 협의가 필요하다.\n\n남은 결정은 하나다 — 2027년 도 개편을 기다릴 것인가, 차액을 부담하고 먼저 시행할 것인가.",
    locked_by: null,
    locked_at: null,
    updated_by: person("최민재").id,
    updated_at: "2026-08-06T11:48:00+09:00",
  },

  // --- 인력 파견 (김서연) ---------------------------------------------------
  {
    id: secId(19),
    document_id: docId(7),
    sort_order: 0,
    heading: "1. 파견 소요",
    body: "대회 기간(2027. 10. 8. ~ 10. 14.) 운영 인력은 경기장 8개소·종합상황실·수송본부를 합쳐 일 평균 214명으로 산정했다. 이 중 자원봉사자로 충당 가능한 인원을 제외한 96명을 부서 파견으로 채운다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("김서연").id,
    updated_at: "2026-06-25T10:04:00+09:00",
  },
  {
    id: secId(20),
    document_id: docId(7),
    sort_order: 1,
    heading: "2. 부서별 협의 상황",
    body: "· 체육진흥과 — 24명, 합의\n· 교통정책과·대중교통과 — 18명, 합의(대회 기간 노선 상황실 동시 운영이라 조정 필요 의견)\n· 안전정책과 — 16명, 합의\n· 공보실 — 8명, 합의\n· 그 밖의 과 — 30명, 인사과 일괄 배정 요청 중\n\n대중교통과에서 「대회 기간에 우리 과도 상황실을 돌려야 해서 18명을 빼면 남는 인원이 없다」는 의견이 왔다. 인사과 배정분에서 보완하는 방향으로 협의 중이다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("김서연").id,
    updated_at: "2026-08-06T10:35:00+09:00",
  },

  // --- 감량 시범사업 (박준호 → 인계 대상) -----------------------------------
  {
    id: secId(21),
    document_id: docId(8),
    sort_order: 0,
    heading: "1. 시범 결과 및 확대 근거",
    body: "4개 단지 시범 결과 배출량이 단지 평균 21.4% 줄었다. 다만 감량기 관리 주체가 단지마다 달라(관리사무소 3, 입주자대표회의 1) 유지관리 편차가 컸다.\n\n확대 시행 시에는 관리 주체를 관리사무소로 통일하는 조건을 붙인다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2026-04-09T15:28:00+09:00",
  },
  {
    id: secId(22),
    document_id: docId(8),
    sort_order: 1,
    heading: "2. 원가산정과의 연결",
    body: "감량 실적은 다음 해 수집·운반 대행 원가산정의 물량 추계에 그대로 들어간다. 시범 단지의 감량률을 전체에 그대로 적용하면 물량이 과소 추계되므로, 보급률을 곱해 반영해야 한다.\n\n작년 산정에서 이 보정을 빠뜨려 중간보고 수치를 한 번 되돌린 적이 있다. 올해는 산정 착수 전에 감량 실적을 먼저 넘긴다.",
    locked_by: null,
    locked_at: null,
    updated_by: person("박준호").id,
    updated_at: "2026-08-05T17:05:00+09:00",
  },
];

// ---------------------------------------------------------------------------
// 대화 — 업무에 붙어 있는 대화. 메신저로 흩어지면 사라지는 맥락이다.
// ---------------------------------------------------------------------------

type CommentSeed = [number, number, string, string, string];

const COMMENT_SEEDS: CommentSeed[] = [
  [
    1,
    1,
    "한지우",
    "2026-07-28T10:12:00+09:00",
    "수송대책 쪽에서 하나 확인 부탁드립니다. 개·폐회식 관람객 수 추계가 시설 개보수 계획서의 수용인원과 다르게 잡혀 있는데, 어느 쪽을 기준으로 할까요?",
  ],
  [
    2,
    1,
    "정유진",
    "2026-07-28T11:40:00+09:00",
    "개보수 계획서 수용인원은 시설 기준이고, 실제 관람객은 그보다 적게 잡는 게 맞습니다. 대한체육회 실사 때 시설 기준으로 제출해야 해서 그렇게 썼습니다.",
  ],
  [
    3,
    1,
    "김서연",
    "2026-07-28T14:05:00+09:00",
    "그럼 수송 계획은 실제 관람객 추계로 가고, 그 숫자를 종합계획 3장에 명시하겠습니다. 두 문서가 다른 숫자를 쓰는 이유가 남아 있어야 나중에 또 묻지 않을 것 같습니다.",
  ],
  [
    4,
    1,
    "오세훈",
    "2026-08-03T09:22:00+09:00",
    "안전관리계획은 시설 기준 인원으로 산정합니다. 다중운집 심사에서 최대 수용인원을 기준으로 보기 때문입니다. 세 문서가 각각 다른 숫자를 쓰게 되는데, 근거가 다르니 그대로 두는 게 맞다고 봅니다.",
  ],
  [
    5,
    1,
    "김서연",
    "2026-08-05T17:38:00+09:00",
    "정리했습니다. 2장에 세 기준을 나란히 적어 두었습니다.",
  ],
  [
    6,
    5,
    "배도현",
    "2026-07-30T13:15:00+09:00",
    "2027년도 예산 요구서에 대행료를 반영해야 하는데, 최종보고가 8월 14일이면 요구서 제출 기한과 겹칩니다. 중간보고 수치라도 먼저 받을 수 있을까요?",
  ],
  [
    7,
    5,
    "박준호",
    "2026-07-30T15:48:00+09:00",
    "중간보고 수치는 권역 개편분이 반영되기 전이라 그대로 쓰면 안 됩니다. 8월 8일까지 반영본을 받기로 했으니 그때 공유드리겠습니다.",
  ],
  [
    8,
    5,
    "박준호",
    "2026-08-05T18:12:00+09:00",
    "정기인사로 이 업무를 이하람 주무관에게 넘기게 됐습니다. 최종보고 일정과 현안은 문서 4장에 정리해 두었습니다.",
  ],
  [
    9,
    7,
    "노태경",
    "2026-07-15T11:00:00+09:00",
    "시운전 구간 설명회에서 나온 소음 관련 의견은 별도 업무로 정리해 두었습니다. 노선 개편 설명회 때 같은 질문이 나올 가능성이 높습니다.",
  ],
  [
    10,
    3,
    "최민재",
    "2026-08-03T09:10:00+09:00",
    "셔틀 노선은 트램 개통 일정이 확정돼야 편성할 수 있습니다. 트램 쪽 일정이 한 달 이상 밀릴 가능성이 있어 두 안을 준비하는 게 안전합니다.",
  ],

  // ── 11~26 ────────────────────────────────────────────────────────────────
  // 대화가 열 건뿐이라 「업무에 붙은 대화」 탭이 대부분의 업무에서 비어 있었다.
  // 이 제품이 인계서에 원문 그대로 싣는 재료가 바로 이 대화다 — 재료가 없으면
  // 근거 꼬리표도 붙을 곳이 없다.
  [
    11,
    30,
    "최민재",
    "2026-07-31T14:20:00+09:00",
    "파견 18명은 우리 과 정원의 절반입니다. 대회 기간에 대중교통 상황실도 같이 돌려야 해서, 이대로면 노선 민원 대응이 멈춥니다. 인사과 배정분에서 일부 채워 주실 수 있을까요?",
  ],
  [
    12,
    30,
    "김서연",
    "2026-08-03T10:44:00+09:00",
    "인사과와 다시 이야기하겠습니다. 대중교통과는 대회 기간에 자체 상황실이 도는 부서라 다른 과와 같은 기준으로 빼면 안 된다는 점을 근거로 들겠습니다.",
  ],
  [
    13,
    30,
    "황수아",
    "2026-08-06T10:30:00+09:00",
    "인사과 회신 왔습니다. 일괄 배정분 30명 중 8명을 대중교통과 몫으로 돌리는 것으로 조정되었습니다. 파견 인원표 2장에 반영해 주세요.",
  ],
  [
    14,
    21,
    "한지우",
    "2026-07-30T11:15:00+09:00",
    "3차 협의 결과 확인했습니다. 차액 부담 조건이면 교통정책과 쪽 광역버스 재정지원과 재원이 겹치는지 먼저 봐야 할 것 같습니다.",
  ],
  [
    15,
    21,
    "최민재",
    "2026-08-06T11:44:00+09:00",
    "겹치지 않습니다. 광역버스 재정지원은 운송원가 보전이고 이건 환승 정산 차액이라 항목이 다릅니다. 다만 총액이 커서 예산재정과 사전 협의는 필요합니다.",
  ],
  [
    16,
    23,
    "고은비",
    "2026-08-04T10:20:00+09:00",
    "코스가 확정돼야 홍보물 제작에 들어갑니다. 인쇄 소요가 3주라 8월 안에는 확정이 필요합니다.",
  ],
  [
    17,
    23,
    "정유진",
    "2026-08-04T10:26:00+09:00",
    "경찰 협의에서 봉송 구간 두 곳이 통제 불가 회신을 받아 대안 구간을 다시 잡고 있습니다. 기한을 넘긴 것은 이 때문입니다. 8월 셋째 주에는 확정하겠습니다.",
  ],
  [
    18,
    24,
    "이하람",
    "2026-08-05T16:50:00+09:00",
    "감량 실적 자료는 어느 형식으로 넘기면 될까요? 원가산정 쪽에서 바로 쓸 수 있는 형태가 있으면 그대로 맞추겠습니다.",
  ],
  [
    19,
    24,
    "박준호",
    "2026-08-05T17:03:00+09:00",
    "단지별 월 배출량과 보급 세대수 두 열이면 됩니다. 작년에는 단지 평균만 넘겨서 보급률 보정을 못 했고, 그게 중간보고를 되돌린 이유였습니다.",
  ],
  [
    20,
    22,
    "오세훈",
    "2026-07-22T13:40:00+09:00",
    "통학로와 겹치는 구간은 안전정책과 어린이보호구역 정비와 시기를 맞추는 편이 낫습니다. 같은 구간을 두 번 파는 일이 작년에 있었습니다.",
  ],
  [
    21,
    22,
    "최민재",
    "2026-08-05T16:26:00+09:00",
    "공정표 맞췄습니다. 통학로 구간 12개소는 어린이보호구역 정비와 같은 주에 들어갑니다.",
  ],
  [
    22,
    20,
    "김서연",
    "2026-08-06T15:05:00+09:00",
    "자원봉사자 배치는 경기장 개보수 완료 시점에 걸립니다. 3개소가 실사 시점까지 안 끝나는 것으로 나와서, 그 세 곳은 배치 인원을 나중에 확정하는 것으로 두겠습니다.",
  ],
  [
    23,
    28,
    "고은비",
    "2026-07-30T11:02:00+09:00",
    "진입로 정비는 도로과·공원녹지 소관이 섞여 있어 우리 실이 총괄만 합니다. 구간별 소관을 먼저 나눠야 공정 순서를 짤 수 있습니다.",
  ],
  [
    24,
    2,
    "정유진",
    "2026-08-04T11:16:00+09:00",
    "8개소 중 3개소는 실사 시점까지 공정이 안 끝납니다. 공정률과 완료 예정일을 함께 제출하는 방식으로 대응하는 게 맞을 것 같습니다.",
  ],
  [
    25,
    5,
    "이하람",
    "2026-08-06T09:45:00+09:00",
    "인계 문서 봤습니다. 4장 현안 중 차량 정비비 추정치 건은 작년 처리 방식을 그대로 따르면 되는 것인지, 아니면 올해는 다르게 가야 하는지 알려 주시면 좋겠습니다.",
  ],
  [
    26,
    5,
    "박준호",
    "2026-08-06T10:20:00+09:00",
    "작년과 같은 방식(최근 3년 평균 대체)으로 가면 됩니다. 다만 올해는 그 근거를 산정서 본문에 적어 두세요. 작년에 감사에서 지적받은 게 정확히 그 지점입니다.",
  ],
];

export const comments: Comment[] = COMMENT_SEEDS.map(
  ([n, w, author, at, body]) => ({
    id: cmtId(n),
    work_id: workId(w),
    author_id: person(author).id,
    body,
    deleted_at: null,
    created_at: at,
  }),
);

// ---------------------------------------------------------------------------
// 첨부 — private 버킷 경로만 남는다. 공개 URL은 존재하지 않는다.
// ---------------------------------------------------------------------------

const HWP = "application/haansofthwp";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF = "application/pdf";

type AttachSeed = [number, number, string, string, number, string, string];

const ATTACH_SEEDS: AttachSeed[] = [
  [1, 1, "전국체전_종합준비계획_초안.hwp", HWP, 284_160, "김서연", "2026-03-02T09:52:00+09:00"],
  [2, 1, "부서별_역할분담표.xlsx", XLSX, 41_984, "김서연", "2026-04-16T15:20:00+09:00"],
  [3, 1, "대한체육회_실사_점검항목.pdf", PDF, 1_204_224, "정유진", "2026-06-11T10:35:00+09:00"],
  [4, 5, "2026_원가산정_중간보고서.pdf", PDF, 2_889_728, "박준호", "2026-07-28T16:40:00+09:00"],
  [5, 5, "대행업체_원가자료_취합.xlsx", XLSX, 156_672, "박준호", "2026-07-10T11:05:00+09:00"],
  [6, 6, "2025_원가산정_최종보고서.pdf", PDF, 3_145_728, "박준호", "2025-09-22T14:12:00+09:00"],
  [7, 6, "행정사무감사_요구자료_회신.hwp", HWP, 98_304, "박준호", "2025-10-14T16:28:00+09:00"],
  [8, 2, "경기장_개보수_공정표.xlsx", XLSX, 73_728, "정유진", "2026-05-08T09:44:00+09:00"],
  [9, 3, "수송대책_노선안_1안2안_대비표.xlsx", XLSX, 62_464, "한지우", "2026-07-02T16:24:00+09:00"],
  [10, 19, "2026년도_본예산_편성지침.hwp", HWP, 218_112, "배도현", "2025-07-15T09:44:00+09:00"],

  // ── 11~24 ────────────────────────────────────────────────────────────────
  // 첨부가 열 건이라 스물여덟 업무 중 스물둘이 「첨부가 없습니다」였다.
  // 인계서 2장(관련 문서 현황)이 세는 것이 바로 이 목록이다.
  [11, 21, "환승할인_확대_시행계획.hwp", HWP, 196_608, "최민재", "2026-03-24T10:30:00+09:00"],
  [12, 21, "경기도_통합환승_협의결과_3차.pdf", PDF, 842_752, "최민재", "2026-07-30T09:50:00+09:00"],
  [13, 21, "정산차액_추계_2027.xlsx", XLSX, 58_368, "최민재", "2026-08-06T11:40:00+09:00"],
  [14, 22, "정류소_안전시설_정비_공정표.xlsx", XLSX, 67_584, "최민재", "2026-08-05T16:20:00+09:00"],
  [15, 30, "대회운영_파견인원표.xlsx", XLSX, 44_032, "김서연", "2026-06-25T10:10:00+09:00"],
  [16, 30, "부서별_파견협의_회신_취합.hwp", HWP, 132_096, "김서연", "2026-08-06T10:28:00+09:00"],
  [17, 20, "자원봉사자_모집요강.hwp", HWP, 174_080, "황수아", "2026-04-14T10:40:00+09:00"],
  [18, 20, "경기장별_배치계획_초안.xlsx", XLSX, 51_200, "황수아", "2026-08-06T15:08:00+09:00"],
  [19, 23, "성화봉송_코스안_1안2안.pdf", PDF, 1_638_400, "정유진", "2026-08-04T10:22:00+09:00"],
  [20, 24, "감량기_시범단지_배출량_집계.xlsx", XLSX, 89_088, "박준호", "2026-08-05T16:58:00+09:00"],
  [21, 24, "감량_시범사업_확대계획.hwp", HWP, 152_576, "박준호", "2026-04-09T15:20:00+09:00"],
  [22, 27, "탈취설비_사양_검토서.pdf", PDF, 967_680, "이하람", "2026-08-03T14:35:00+09:00"],
  [23, 29, "준공영제_타당성_최종보고서.pdf", PDF, 4_194_304, "최민재", "2026-05-27T17:10:00+09:00"],
  [24, 4, "다중운집_안전관리계획_초안.hwp", HWP, 241_664, "오세훈", "2026-08-05T15:44:00+09:00"],
];

/* -----------------------------------------------------------------------------
 * 쪽지 — 부서 밖 사람에게 물은 것
 *
 * 전부 **받는 사람이 그 업무의 참여자가 아니다.** 그게 쪽지의 존재 이유다 —
 * 댓글은 공개 범위 안에서만 보이므로 부서 밖 사람에게는 닿지 않는다.
 *
 * 4번 실이 이 제품의 논지를 보이는 자리다. 박준호가 인계를 넘기기 전에 밖에
 * 물어본 것이고, 이하람이 그 업무를 받으면 **그 문답이 따라온다.**
 * 카톡으로 물었으면 담당이 바뀌는 순간 통째로 사라졌을 것이다.
 *
 * ── 데모 4인의 쪽지함은 비어 있으면 안 된다 ─────────────────────────────────
 *
 * 심사위원은 로그인 화면의 네 사람 중 아무나 고른다. 그 중 한 명이라도 쪽지함이
 * 빈 화면이면 「이 기능은 안 쓰나 보다」로 읽힌다. 그래서 김서연·박준호·이하람·
 * 최민재 **넷 모두** 실 세 개 이상과 안 읽은 쪽지 하나 이상을 갖는다.
 *
 * 보내는 쪽에는 제약이 하나 붙는다 — 정책상 **새 실은 그 업무를 읽을 수 있는
 * 사람만 시작할 수 있다**(0019 note_insert). 그래서 부서 공개 업무의 실은 언제나
 * 그 부서 사람이 밖으로 묻는 방향이고, 밖에서 먼저 물어 오는 실은 전 직원 공개
 * 업무에만 있다. 시드가 이 규칙을 어기면 목업에서만 보이고 실물에서는 못 만드는
 * 쪽지가 된다.
 * -------------------------------------------------------------------------- */

const noteId = (n: number) =>
  `40e00000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** [n, 실 뿌리 n, 업무 n, 보낸이, 받는이, 시각, 읽은 시각 | null, 본문] */
type NoteSeed = [
  number,
  number,
  number,
  string,
  string,
  string,
  string | null,
  string,
];

const NOTE_SEEDS: NoteSeed[] = [
  [
    1, 1, 1, "김서연", "최민재",
    "2026-08-03T14:02:00+09:00",
    "2026-08-03T14:37:00+09:00",
    "대중교통과 소관이라 여쭙습니다. 개회식 당일 종합운동장 셔틀을 늘리려면 노선 조정 협의를 언제까지 넣어야 하나요? 체전 업무에는 대중교통과가 참여자로 안 들어가 있어 여기로 여쭙니다.",
  ],
  [
    2, 1, 1, "최민재", "김서연",
    "2026-08-03T15:20:00+09:00",
    "2026-08-03T15:41:00+09:00",
    "노선 조정은 운수업체 협의가 앞에 붙어서 행사 두 달 전까지는 안건이 올라와야 합니다. 임시 증차는 별건이라 3주 전에도 되고요. 어느 쪽인지 알려 주시면 서식 보내 드리겠습니다.",
  ],
  [
    3, 3, 1, "김서연", "류민석",
    "2026-08-06T10:12:00+09:00",
    null,
    "체전 기간 하천변 임시주차장 건으로 물환경생태과 의견이 필요합니다. 둔치 사용 협의를 우리가 넣는 게 맞는지, 아니면 주최 측이 직접 넣어야 하는지 알려 주시면 감사하겠습니다.",
  ],
  [
    4, 4, 5, "박준호", "윤가온",
    "2026-07-29T16:05:00+09:00",
    "2026-07-29T17:12:00+09:00",
    "작년 원가산정 때 차량 정비비를 최근 3년 평균으로 잡았는데, 그 방식이 감사에서 지적된 적이 있는지 확인 부탁드립니다. 문화예술과에서 비슷한 대행 용역을 하신 걸로 알아서요.",
  ],
  [
    5, 4, 5, "윤가온", "박준호",
    "2026-07-30T09:30:00+09:00",
    "2026-07-30T09:48:00+09:00",
    "저희도 3년 평균으로 갑니다. 지적받은 건 방식이 아니라 **근거를 본문에 안 적은 것**이었습니다. 산정서에 「최근 3년 평균, 근거 연도 명시」 한 줄만 넣으면 넘어갑니다.",
  ],
  // 반대 방향도 하나 둔다 — 김서연이 **받은** 안 읽은 쪽지. 배지가 실제로 뜨는
  // 것을 시연에서 보여야 하고, 1번 업무는 전 직원 공개라 대중교통과 팀장이
  // 먼저 물어 오는 것이 자연스럽다.
  [
    6, 6, 1, "최민재", "김서연",
    "2026-08-07T09:05:00+09:00",
    null,
    "셔틀 증차 건 진행 상황을 여쭙습니다. 저희 쪽 운수업체 협의 일정을 잡아야 하는데, 개회식 수송 계획 확정이 언제쯤 될지 알려 주시면 맞춰 보겠습니다.",
  ],

  // ── 이하람 ────────────────────────────────────────────────────────────────
  // 인계를 **받는** 사람이다. 인계 화면만 보고 넘어가는 계정이 아니라 자기 일을
  // 하고 있는 사람으로 보여야 한다.
  [
    7, 7, 24, "이하람", "배도현",
    "2026-07-16T10:20:00+09:00",
    "2026-07-16T11:02:00+09:00",
    "감량기 8대 추가 보급분(1억 2,400만 원)을 시책추진비에서 충당하려는데, 부족분을 추경에 넣으려면 요구서를 언제까지 올려야 하는지 여쭙습니다. 자원순환과 업무라 예산재정과가 참여자로 들어가 있지 않아 여기로 여쭙니다.",
  ],
  [
    8, 7, 24, "배도현", "이하람",
    "2026-07-16T14:35:00+09:00",
    "2026-07-16T15:10:00+09:00",
    "추경 요구서는 9월 첫 주까지 받습니다. 다만 같은 목의 시책추진비 안에서 옮기는 것이면 추경까지 안 가고 과장 전결로 됩니다. 어느 목에서 빼실 건지 알려 주시면 전용 가능 여부부터 봐 드리겠습니다.",
  ],
  [
    9, 9, 27, "이하람", "박도윤",
    "2026-08-04T09:40:00+09:00",
    "2026-08-04T10:15:00+09:00",
    "선별장 악취 민원이 같은 구간에서 반복되고 있습니다. 「악취방지법」상 개선명령을 저희가 직접 내리는 게 맞는지, 아니면 도에 요청해야 하는 사안인지 검토를 부탁드립니다.",
  ],
  [
    10, 9, 27, "박도윤", "이하람",
    "2026-08-06T16:20:00+09:00",
    null,
    "명령 권한 자체는 시장에게 있습니다. 다만 배출허용기준 초과가 측정으로 확인되어야 앞단이 서므로, 민원 접수 건만으로는 바로 못 갑니다. 최근 측정 자료가 있으면 보내 주세요. 근거 조문 정리해서 회신드리겠습니다.",
  ],
  [
    11, 11, 28, "고은비", "이하람",
    "2026-07-30T11:20:00+09:00",
    "2026-07-30T13:05:00+09:00",
    "가로환경 정비 구간 폐기물 반출 일정을 여쭙습니다. 보도블록 걷어내는 구간이 세 곳인데 수거 차량이 같은 날 들어와야 노면 정리까지 하루에 끝납니다. 자원순환과 일정에 맞출 수 있을까요?",
  ],
  [
    12, 11, 28, "이하람", "고은비",
    "2026-07-31T09:15:00+09:00",
    "2026-07-31T09:52:00+09:00",
    "대행업체 배차가 화·목요일로 고정되어 있어 그 이틀 중 하루로 잡으시면 됩니다. 구간이 세 곳이면 한 번에는 어렵고 두 번에 나눠야 합니다. 날짜 정해지면 알려 주세요, 배차 요청 넣겠습니다.",
  ],

  // ── 최민재 ────────────────────────────────────────────────────────────────
  // 유일한 팀장 계정이다. 묻는 쪽과 받는 쪽이 반반이어야 직급이 화면에서 읽힌다.
  [
    13, 13, 21, "최민재", "배도현",
    "2026-08-05T14:10:00+09:00",
    "2026-08-05T15:02:00+09:00",
    "환승할인 확대분 정산 분담금을 2027년 본예산에 반영해야 합니다. 도 협의가 9월에 끝나는데 그 결과를 기다렸다가 요구서를 내면 늦는지, 아니면 추계로 먼저 올려도 되는지 알려 주시면 감사하겠습니다.",
  ],
  [
    14, 13, 21, "배도현", "최민재",
    "2026-08-06T09:25:00+09:00",
    null,
    "추계로 먼저 올리셔도 됩니다. 편성지침에 「협의 진행 중인 사항은 추계액과 확정 예정 시기를 함께 적는다」는 항이 있습니다. 다만 확정액이 추계보다 크면 그 차액은 추경으로 가니, 여유를 두고 잡으시는 편이 낫습니다.",
  ],
  [
    15, 15, 22, "최민재", "강예서",
    "2026-06-18T15:30:00+09:00",
    "2026-06-18T16:40:00+09:00",
    "정류소 안전시설 정비 74개소 중 통학로와 겹치는 구간을 먼저 하려고 합니다. 어린이집 통원차량이 상시 정차하는 정류소 목록이 영유아보육과에 있을까요? 있으면 우선순위 산정에 반영하겠습니다.",
  ],
  [
    16, 15, 22, "강예서", "최민재",
    "2026-06-19T10:05:00+09:00",
    "2026-06-19T10:33:00+09:00",
    "통원차량 운행 노선은 어린이집이 각자 정하는 거라 저희가 목록으로 갖고 있지는 않습니다. 대신 국공립 21개소 위치는 드릴 수 있습니다. 정류소 좌표와 겹쳐 보시면 얼추 나올 겁니다.",
  ],
  [
    17, 17, 20, "황수아", "최민재",
    "2026-08-03T10:50:00+09:00",
    "2026-08-03T11:28:00+09:00",
    "자원봉사자 집결지에서 경기장까지 이동을 여쭙습니다. 하루 380명이 오전 7시에 한 곳에 모이는데 시내버스로는 무리일 것 같아서요. 대중교통과에서 임시 셔틀로 잡아 주실 수 있는 사안인지 알려 주시면 계획에 반영하겠습니다.",
  ],
  [
    18, 17, 20, "최민재", "황수아",
    "2026-08-03T16:15:00+09:00",
    "2026-08-03T16:44:00+09:00",
    "임시 증차는 3주 전 신청이면 됩니다. 380명이면 45인승 9대 규모라 전세버스가 오히려 낫습니다. 노선 셔틀은 정류소 신설 협의가 붙어서 대회 준비 일정에는 안 맞습니다. 두 안 견적 뽑아 드릴까요?",
  ],

  // ── 박준호 ────────────────────────────────────────────────────────────────
  // 인계를 **넘기는** 사람이다. 그가 밖에 물어 둔 것이 인계서를 타고 이하람에게
  // 간다 — 4번 실만으로는 그 사실이 「예시 하나」로 보인다.
  [
    19, 19, 8, "박준호", "박도윤",
    "2026-07-22T11:05:00+09:00",
    "2026-07-22T14:20:00+09:00",
    "반입수수료 조정은 조례 개정 사항인데, 입법예고 20일을 넣으면 9월 회기에 상정할 수 있는지 여쭙습니다. 상정이 밀리면 내년 1월 시행이 어려워집니다.",
  ],
  [
    20, 19, 8, "박도윤", "박준호",
    "2026-07-23T09:35:00+09:00",
    "2026-07-23T10:11:00+09:00",
    "9월 회기 안건 마감이 8월 말입니다. 지금 입법예고 들어가면 빠듯하게 맞습니다. 규제심사 대상인지부터 확인하세요 — 대상이면 심사에 3주가 더 붙어서 9월 회기는 못 탑니다.",
  ],
  [
    21, 21, 9, "박준호", "서나윤",
    "2026-08-04T13:40:00+09:00",
    "2026-08-04T14:25:00+09:00",
    "청소차량 운행기록을 지금은 기사가 종이 일지에 적고 월말에 저희가 옮겨 적습니다. AI 2차 확산 과제 대상이 될 수 있는지 여쭙습니다. 대행 원가산정에 이 기록이 그대로 들어가서 옮겨 적는 과정에서 어긋나면 산정이 흔들립니다.",
  ],
  [
    22, 21, 9, "서나윤", "박준호",
    "2026-08-07T10:30:00+09:00",
    null,
    "2차 확산 대상 부서를 이달 말에 정합니다. 말씀하신 건은 문서 요약보다 인식 쪽이라 과제 성격이 좀 다른데, 오히려 그래서 사례가 됩니다. 종이 일지 서식 한 장만 보내 주시면 후보에 올려 보겠습니다.",
  ],

  // ── 김서연 ────────────────────────────────────────────────────────────────
  // 데모의 첫 화면이다. 쪽지함에 실이 하나뿐이면 「기능은 있는데 안 쓴다」로 읽힌다.
  [
    23, 23, 1, "김서연", "박준호",
    "2026-08-05T09:50:00+09:00",
    "2026-08-05T10:26:00+09:00",
    "체전 기간 경기장 주변 폐기물 수거를 여쭙습니다. 대회 9일 동안 관람객이 하루 2만 명 넘게 들어오는데 평소 수거 주기로는 감당이 안 될 것 같습니다. 기간 중 증회가 가능한 사안인지 알려 주시면 감사하겠습니다.",
  ],
  [
    24, 23, 1, "박준호", "김서연",
    "2026-08-05T13:20:00+09:00",
    "2026-08-05T13:58:00+09:00",
    "가능합니다. 다만 대행 계약 물량 밖이라 변경계약을 쳐야 하고, 그러려면 예상 발생량 근거가 필요합니다. 작년 다른 시 체전 자료라도 있으면 보내 주세요. 그걸로 물량 잡아서 계약 부서에 넘기겠습니다.",
  ],
  [
    25, 25, 26, "윤가온", "김서연",
    "2026-08-06T14:05:00+09:00",
    null,
    "개·폐회식 연출 용역 과업지시서 쓰신다는 얘기를 들었습니다. 작년 뱃놀이 축제 연출 용역에서 무대·음향을 분리 발주했다가 책임 소재로 고생한 적이 있어, 그때 고친 과업지시서를 보내 드릴까 합니다. 필요하시면 말씀 주세요.",
  ],

  // ── 한상우 ────────────────────────────────────────────────────────────────
  // 인계의 입회자다. 그 한 번을 누르러 들어오는 계정이면 다른 화면이 전부 비어
  // 있고, 심사위원은 「이 사람은 데모용으로 급히 만든 계정」이라고 읽는다.
  // 과장이 실제로 하는 일 — 밖에 묻고, 밖에서 물어 오는 것을 받는 것 — 을 둔다.
  [
    26, 26, 5, "한상우", "배도현",
    "2026-08-04T16:40:00+09:00",
    "2026-08-05T09:15:00+09:00",
    "올해 원가산정 결과가 나오면 대행료가 작년보다 오를 것으로 봅니다. 내년 본예산에 반영할 규모를 미리 잡아 두려는데, 산정 결과 확정 전에 추계로 올려도 되는지 여쭙습니다.",
  ],
  [
    27, 26, 5, "배도현", "한상우",
    "2026-08-06T11:20:00+09:00",
    null,
    "추계로 올리셔도 됩니다. 대행료처럼 매년 반복되는 경직성 경비는 오히려 미반영이 더 문제가 됩니다. 다만 인상률 근거를 요구서에 한 줄로 적어 주셔야 심사에서 안 깎입니다.",
  ],
  [
    28, 28, 1, "문지호", "한상우",
    "2026-07-27T14:10:00+09:00",
    "2026-07-27T15:02:00+09:00",
    "체전 기간 경기장 주변과 선수촌 폐기물 처리에 자원순환과 협조가 필요합니다. 실무 협의를 어느 분과 하면 될지 알려 주시면 저희 쪽 담당을 붙이겠습니다.",
  ],
  [
    29, 28, 1, "한상우", "문지호",
    "2026-07-28T09:35:00+09:00",
    "2026-07-28T10:04:00+09:00",
    "박준호 주무관이 맡고 있었는데 8월 정기인사로 나갑니다. 후임 이하람 주무관을 붙이겠습니다. 인계가 끝나는 대로 연락드리도록 하겠습니다.",
  ],
  [
    30, 30, 24, "한상우", "고은비",
    "2026-08-05T10:50:00+09:00",
    "2026-08-05T11:30:00+09:00",
    "감량 시범사업을 12개 단지로 넓히는 건인데, 보도자료를 언제 내는 것이 좋을지 여쭙습니다. 확대 시행 전에 내면 주민 문의가 몰리고, 뒤에 내면 시기를 놓칠 것 같습니다.",
  ],
  [
    31, 30, 24, "고은비", "한상우",
    "2026-08-05T14:15:00+09:00",
    "2026-08-05T14:48:00+09:00",
    "설치 완료 시점에 맞추시는 게 낫습니다. 「하겠습니다」보다 「했습니다」가 문의가 적습니다. 자료 초안은 저희가 잡아 드릴 테니 단지 목록과 감량률만 주세요.",
  ],
];

export const notes: Note[] = NOTE_SEEDS.map(
  ([n, root, w, author, recipient, at, readAt, body]) => ({
    id: noteId(n),
    work_id: workId(w),
    thread_id: noteId(root),
    author_id: person(author).id,
    recipient_id: person(recipient).id,
    body,
    read_at: readAt,
    deleted_at: null,
    created_at: at,
  }),
);

/* -----------------------------------------------------------------------------
 * 알림 — 사건만
 *
 * 실물에서는 트리거가 만든다(0021). 데모에는 트리거가 도는 DB 가 없으므로
 * 화면이 어떻게 생기는지 보일 만큼만 시드로 둔다.
 *
 * 「지금 내 차례 결재」가 여기 **없는 것**이 이 목록의 요점이다 — 그것은 상태라
 * 결재함에 있고, 알림은 읽으면 끝나는 것만 담는다.
 * -------------------------------------------------------------------------- */

/** [n, 받는이, 갈래, 업무 n | null, 대상 id | null, 행위자, 시각, 읽은 시각 | null, 요약] */
type NotiSeed = [
  number,
  string,
  AppNotification["kind"],
  number | null,
  string | null,
  string,
  string,
  string | null,
  string,
];

const NOTI_SEEDS: NotiSeed[] = [
  [
    1, "김서연", "note", 1, noteId(6), "최민재",
    "2026-08-07T09:05:00+09:00", null,
    "최민재 팀장 님이 쪽지를 보냈습니다.",
  ],
  [
    2, "김서연", "mention", 2, cmtId(24), "정유진",
    "2026-08-04T11:16:00+09:00", null,
    "정유진 주무관 님이 대화에서 나를 불렀습니다.",
  ],
  [
    3, "김서연", "work_touched", 3, null, "한지우",
    "2026-08-05T14:22:00+09:00", "2026-08-05T18:00:00+09:00",
    "첨부파일 「수송대책_노선안_1안2안_대비표.xlsx」이 등록되었습니다.",
  ],
  [
    4, "박준호", "note", 5, noteId(4), "윤가온",
    "2026-07-30T09:30:00+09:00", "2026-07-30T10:02:00+09:00",
    "윤가온 주무관 님이 쪽지를 보냈습니다.",
  ],
  // 안 읽은 쪽지에는 알림이 따라 붙는다. 하나라도 빠뜨리면 종에는 아무것도 없는데
  // 쪽지함에만 배지가 뜨고, 그 화면은 「알림이 고장 났다」로 읽힌다.
  // target_id 는 실의 뿌리다 — 알림을 누르면 통 하나가 아니라 실로 간다(0021).
  [
    5, "이하람", "note", 27, noteId(9), "박도윤",
    "2026-08-06T16:20:00+09:00", null,
    "박도윤 주무관 님이 쪽지를 보냈습니다.",
  ],
  [
    6, "최민재", "note", 21, noteId(13), "배도현",
    "2026-08-06T09:25:00+09:00", null,
    "배도현 주무관 님이 쪽지를 보냈습니다.",
  ],
  [
    7, "박준호", "note", 9, noteId(21), "서나윤",
    "2026-08-07T10:30:00+09:00", null,
    "서나윤 주무관 님이 쪽지를 보냈습니다.",
  ],
  [
    8, "김서연", "note", 26, noteId(25), "윤가온",
    "2026-08-06T14:05:00+09:00", null,
    "윤가온 주무관 님이 쪽지를 보냈습니다.",
  ],
  // 데모 4인이 아니어도 마찬가지다. 규칙에 예외를 두면 그 예외가 규칙이 된다 —
  // 심사위원이 로그인 화면 밖의 계정으로 들어가 보는 일은 실제로 일어난다.
  [
    9, "류민석", "note", 1, noteId(3), "김서연",
    "2026-08-06T10:12:00+09:00", null,
    "김서연 주무관 님이 쪽지를 보냈습니다.",
  ],
  [
    10, "한상우", "note", 5, noteId(26), "배도현",
    "2026-08-06T11:20:00+09:00", null,
    "배도현 주무관 님이 쪽지를 보냈습니다.",
  ],
];

export const notifications: AppNotification[] = NOTI_SEEDS.map(
  ([n, to, kind, w, target, actor, at, readAt, summary]) => ({
    id: n,
    recipient_id: person(to).id,
    kind,
    work_id: w === null ? null : workId(w),
    target_id: target,
    actor_id: person(actor).id,
    summary,
    // 묶임은 실물 트리거의 일이다. 시드는 낱개로 둔다.
    count: 1,
    read_at: readAt,
    created_at: at,
  }),
);

export const attachments: Attachment[] = ATTACH_SEEDS.map(
  ([n, w, name, mime, size, by, at]) => ({
    id: attId(n),
    work_id: workId(w),
    storage_path: `${workId(w)}/${attId(n)}_${name}`,
    file_name: name,
    mime_type: mime,
    byte_size: size,
    uploaded_by: person(by).id,
    created_at: at,
  }),
);

// ---------------------------------------------------------------------------
// 이력 — 이 제품이 남기는 것. 사람이 적는 게 아니라 트리거가 적는다.
// ---------------------------------------------------------------------------

type ActSeed = [number, string | null, Activity["kind"], string, string];

const ACT_SEEDS: ActSeed[] = [
  // 전국체전 종합 준비 — 다섯 달치 협업이 쌓인 모습
  [1, "김서연", "work.created", "업무를 만들었습니다", "2026-03-02T09:14:00+09:00"],
  [1, "김서연", "document.created", "문서 「제108회 전국체육대회 종합 준비계획」을 만들었습니다", "2026-03-02T09:31:00+09:00"],
  [1, "김서연", "attachment.added", "「전국체전_종합준비계획_초안.hwp」를 올렸습니다", "2026-03-02T09:52:00+09:00"],
  [1, "김서연", "member.added", "황수아 팀장을 편집자로 추가했습니다", "2026-03-04T10:20:00+09:00"],
  [1, "김서연", "member.added", "정유진 주무관을 편집자로 추가했습니다", "2026-03-11T10:08:00+09:00"],
  [1, "김서연", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2026-03-18T14:02:00+09:00"],
  [1, "김서연", "member.added", "오세훈 주무관을 편집자로 추가했습니다", "2026-04-08T13:20:00+09:00"],
  [1, "김서연", "attachment.added", "「부서별_역할분담표.xlsx」를 올렸습니다", "2026-04-16T15:20:00+09:00"],
  [1, "고은비", "section.updated", "「2. 부서별 역할 분담」을 고쳤습니다", "2026-04-22T11:33:00+09:00"],
  [1, "김서연", "member.added", "한지우 주무관을 편집자로 추가했습니다", "2026-05-20T14:36:00+09:00"],
  [1, "정유진", "attachment.added", "「대한체육회_실사_점검항목.pdf」를 올렸습니다", "2026-06-11T10:35:00+09:00"],
  [1, "김서연", "member.added", "배도현 주무관을 열람자로 추가했습니다", "2026-07-14T09:12:00+09:00"],
  [1, "한지우", "comment.created", "대화를 남겼습니다", "2026-07-28T10:12:00+09:00"],
  [1, "정유진", "comment.created", "대화를 남겼습니다", "2026-07-28T11:40:00+09:00"],
  [1, "김서연", "comment.created", "대화를 남겼습니다", "2026-07-28T14:05:00+09:00"],
  [1, "황수아", "section.updated", "「3. 주요 일정」을 고쳤습니다", "2026-07-30T16:24:00+09:00"],
  [1, "오세훈", "comment.created", "대화를 남겼습니다", "2026-08-03T09:22:00+09:00"],
  [1, "배도현", "section.updated", "「4. 예산 소요 및 재원」을 고쳤습니다", "2026-08-04T10:11:00+09:00"],
  [1, "김서연", "comment.created", "대화를 남겼습니다", "2026-08-05T17:38:00+09:00"],
  [1, "정유진", "section.updated", "「2. 부서별 역할 분담」을 고쳤습니다", "2026-08-05T17:41:00+09:00"],

  // 원가산정 용역 — 인계 대상 업무의 이력
  [5, "박준호", "work.created", "업무를 만들었습니다", "2026-06-15T09:40:00+09:00"],
  [5, "박준호", "document.created", "문서 「음식물류폐기물 대행 원가산정 추진계획」을 만들었습니다", "2026-06-15T10:05:00+09:00"],
  [5, "박준호", "section.updated", "「1. 추진 근거 및 경과」를 고쳤습니다", "2026-06-15T10:22:00+09:00"],
  [5, "박준호", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2026-06-16T09:05:00+09:00"],
  [5, "박준호", "attachment.added", "「대행업체_원가자료_취합.xlsx」를 올렸습니다", "2026-07-10T11:05:00+09:00"],
  [5, "박준호", "section.updated", "「2. 작년과 달라진 점」을 고쳤습니다", "2026-07-22T14:35:00+09:00"],
  [5, "박준호", "attachment.added", "「2026_원가산정_중간보고서.pdf」를 올렸습니다", "2026-07-28T16:40:00+09:00"],
  [5, "배도현", "comment.created", "대화를 남겼습니다", "2026-07-30T13:15:00+09:00"],
  [5, "박준호", "comment.created", "대화를 남겼습니다", "2026-07-30T15:48:00+09:00"],
  [5, "박준호", "work.status_changed", "상태를 진행중에서 검토로 바꿨습니다", "2026-08-04T09:30:00+09:00"],
  [5, "박준호", "member.added", "이하람 주무관을 열람자로 추가했습니다", "2026-08-05T18:05:00+09:00"],
  [5, "박준호", "section.updated", "「4. 현안 및 유의사항」을 고쳤습니다", "2026-08-05T18:10:00+09:00"],
  [5, "박준호", "comment.created", "대화를 남겼습니다", "2026-08-05T18:12:00+09:00"],

  // 작년 판 — 여기서 끝난 일이 올해로 이어진다
  [6, "박준호", "work.created", "업무를 만들었습니다", "2025-06-10T10:00:00+09:00"],
  [6, "박준호", "attachment.added", "「2025_원가산정_최종보고서.pdf」를 올렸습니다", "2025-09-22T14:12:00+09:00"],
  [6, "박준호", "work.status_changed", "상태를 검토에서 완료로 바꿨습니다", "2025-09-30T17:20:00+09:00"],
  [6, "박준호", "section.updated", "「2. 시의회 행정사무감사 지적사항」을 고쳤습니다", "2025-10-14T16:30:00+09:00"],

  // 나머지 업무는 최근 움직임만
  [2, "정유진", "work.created", "업무를 만들었습니다", "2026-03-11T10:02:00+09:00"],
  [2, "정유진", "attachment.added", "「경기장_개보수_공정표.xlsx」를 올렸습니다", "2026-05-08T09:44:00+09:00"],
  [2, "정유진", "work.updated", "마감일을 2026년 9월 25일로 바꿨습니다", "2026-08-04T11:20:00+09:00"],
  [3, "한지우", "work.created", "업무를 만들었습니다", "2026-05-20T14:30:00+09:00"],
  [3, "한지우", "document.created", "문서 「전국체전 수송·교통대책 추진계획」을 만들었습니다", "2026-05-20T14:45:00+09:00"],
  [3, "한지우", "member.added", "최민재 팀장을 편집자로 추가했습니다", "2026-05-22T10:15:00+09:00"],
  [3, "한지우", "section.updated", "「1. 추진 배경」을 고쳤습니다", "2026-06-04T11:10:00+09:00"],
  [3, "한지우", "section.updated", "「2. 검토 중인 노선안」을 고쳤습니다", "2026-07-02T16:20:00+09:00"],
  [3, "한지우", "attachment.added", "「수송대책_노선안_1안2안_대비표.xlsx」를 올렸습니다", "2026-07-02T16:24:00+09:00"],
  [3, "한지우", "section.updated", "「3. 멈춰 있는 사유」를 고쳤습니다", "2026-07-02T16:32:00+09:00"],
  [3, "최민재", "comment.created", "대화를 남겼습니다", "2026-08-03T09:10:00+09:00"],
  [4, "오세훈", "work.created", "업무를 만들었습니다", "2026-04-08T13:11:00+09:00"],
  [4, "오세훈", "work.status_changed", "상태를 진행중에서 검토로 바꿨습니다", "2026-08-05T15:52:00+09:00"],
  [7, "최민재", "work.created", "업무를 만들었습니다", "2026-02-17T11:25:00+09:00"],
  [7, "노태경", "comment.created", "대화를 남겼습니다", "2026-07-15T11:00:00+09:00"],
  [8, "박준호", "work.created", "업무를 만들었습니다", "2026-07-02T09:12:00+09:00"],
  [9, "박준호", "work.created", "업무를 만들었습니다", "2026-04-21T15:33:00+09:00"],
  [9, "박준호", "member.added", "이하람 주무관을 편집자로 추가했습니다", "2026-08-02T09:58:00+09:00"],
  [10, "서나윤", "work.created", "업무를 만들었습니다", "2026-05-06T10:15:00+09:00"],
  [10, "서나윤", "work.updated", "설명을 고쳤습니다", "2026-08-05T13:22:00+09:00"],
  [11, "배도현", "work.created", "업무를 만들었습니다", "2026-07-14T09:00:00+09:00"],
  [12, "임채운", "work.created", "업무를 만들었습니다", "2026-03-30T09:47:00+09:00"],
  [12, "임채운", "work.updated", "설명을 고쳤습니다", "2026-07-28T16:05:00+09:00"],
  [13, "강예서", "work.created", "업무를 만들었습니다", "2026-04-02T11:08:00+09:00"],
  [14, "윤가온", "work.created", "업무를 만들었습니다", "2026-05-13T10:30:00+09:00"],
  [14, "윤가온", "work.status_changed", "상태를 진행중에서 검토로 바꿨습니다", "2026-08-05T11:19:00+09:00"],
  [15, "류민석", "work.created", "업무를 만들었습니다", "2026-06-01T09:20:00+09:00"],
  [16, "오세훈", "work.created", "업무를 만들었습니다", "2026-03-05T13:40:00+09:00"],
  [16, "오세훈", "work.status_changed", "상태를 검토에서 완료로 바꿨습니다", "2026-06-27T16:22:00+09:00"],
  [17, "고은비", "work.created", "업무를 만들었습니다", "2026-04-17T09:55:00+09:00"],
  [17, "고은비", "work.status_changed", "상태를 검토에서 완료로 바꿨습니다", "2026-07-14T18:02:00+09:00"],
  [18, "노태경", "work.created", "업무를 만들었습니다", "2026-04-28T10:10:00+09:00"],
  [18, "노태경", "work.status_changed", "상태를 검토에서 완료로 바꿨습니다", "2026-06-23T11:35:00+09:00"],

  // 결재 — 새 이력 표를 만들지 않는다. 결재는 업무에서 일어나는 일이고,
  // 업무의 이력은 activity 하나다(0016 §2). 문구는 0017 의 절차가 쓰는 것과 같다.
  [5, "박준호", "approval.submitted", "결재 「2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청」을 상신했습니다", "2026-08-06T09:20:00+09:00"],
  [5, "정다은", "approval.signed", "「2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청」 결재란에 서명했습니다", "2026-08-06T14:05:00+09:00"],
  [5, "배도현", "approval.signed", "「2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청」 협조란에 서명했습니다 (의견 있음)", "2026-08-07T10:12:00+09:00"],
  [6, "박준호", "approval.submitted", "결재 「2025년 음식물류폐기물 대행 원가산정 용역 결과 보고」를 상신했습니다", "2025-09-30T15:02:00+09:00"],
  [6, "정다은", "approval.signed", "「2025년 음식물류폐기물 대행 원가산정 용역 결과 보고」 전결란에 서명했습니다", "2025-09-30T16:40:00+09:00"],
  [6, "정다은", "approval.completed", "결재 「2025년 음식물류폐기물 대행 원가산정 용역 결과 보고」가 완결되었습니다", "2025-09-30T16:40:00+09:00"],
  [1, "김서연", "approval.submitted", "결재 「제108회 전국체육대회 수송·교통 분야 세부 추진계획」을 상신했습니다", "2026-08-05T11:10:00+09:00"],
  [1, "황수아", "approval.signed", "「제108회 전국체육대회 수송·교통 분야 세부 추진계획」 결재란에 서명했습니다", "2026-08-05T17:22:00+09:00"],
  [8, "박준호", "approval.submitted", "결재 「재활용 선별시설 반입수수료 조정(안)」을 상신했습니다", "2026-07-24T16:30:00+09:00"],
  [8, "정다은", "approval.rejected", "결재 「재활용 선별시설 반입수수료 조정(안)」을 반려했습니다 — 인상 근거가 「폐기물관리법 시행규칙」 개정안과 맞는지 먼저 확인해 주세요. 조례 개정 일정도 함께 적어 주시기 바랍니다.", "2026-07-25T09:40:00+09:00"],
  [1, "황수아", "approval.submitted", "결재 「대한체육회 1차 시설 실사 대응 검토」를 상신했습니다", "2026-08-12T10:30:00+09:00"],

  // 작년 편성지침 — 「작년 이맘때」가 가리키는 곳
  [19, "배도현", "work.created", "업무를 만들었습니다", "2025-07-15T09:10:00+09:00"],
  [19, "배도현", "document.created", "문서 「2026년도 본예산 편성지침」을 만들었습니다", "2025-07-15T09:25:00+09:00"],
  [19, "배도현", "section.updated", "「1. 편성 방향」을 고쳤습니다", "2025-07-15T09:40:00+09:00"],
  [19, "배도현", "attachment.added", "「2026년도_본예산_편성지침.hwp」를 올렸습니다", "2025-07-15T09:44:00+09:00"],
  [19, "배도현", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2025-07-15T09:50:00+09:00"],
  [19, "배도현", "member.added", "김서연 주무관을 열람자로 추가했습니다", "2025-07-16T10:20:00+09:00"],
  [19, "배도현", "section.updated", "「2. 시달 결과 및 다음 해 유의사항」을 고쳤습니다", "2025-10-02T15:40:00+09:00"],
  [19, "배도현", "work.status_changed", "상태를 진행중에서 완료로 바꿨습니다", "2025-10-02T15:42:00+09:00"],

  // ── 20~30번 업무의 이력 ──────────────────────────────────────────────────
  // 홈의 「내 업무에서 일어난 일」은 이 표를 읽는다. 이력이 얇으면 그 칸이
  // 여덟 줄에서 멈추고, 「평소 협업이 쌓인다」는 주장이 화면에서 증명되지 않는다.
  [20, "황수아", "work.created", "업무를 만들었습니다", "2026-04-14T10:20:00+09:00"],
  [20, "황수아", "attachment.added", "「자원봉사자_모집요강.hwp」를 올렸습니다", "2026-04-14T10:40:00+09:00"],
  [20, "황수아", "member.added", "김서연 주무관을 편집자로 추가했습니다", "2026-04-15T09:12:00+09:00"],
  [20, "황수아", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2026-05-06T11:30:00+09:00"],
  [20, "황수아", "member.added", "고은비 주무관을 열람자로 추가했습니다", "2026-06-02T14:18:00+09:00"],
  [20, "황수아", "attachment.added", "「경기장별_배치계획_초안.xlsx」를 올렸습니다", "2026-08-06T15:08:00+09:00"],
  [20, "김서연", "comment.created", "대화를 남겼습니다", "2026-08-06T15:05:00+09:00"],

  [21, "최민재", "work.created", "업무를 만들었습니다", "2026-03-24T09:35:00+09:00"],
  [21, "최민재", "document.created", "문서 「환승할인 확대 시행계획」을 만들었습니다", "2026-03-24T10:02:00+09:00"],
  [21, "최민재", "section.updated", "「1. 추진 배경」을 고쳤습니다", "2026-03-24T10:18:00+09:00"],
  [21, "최민재", "attachment.added", "「환승할인_확대_시행계획.hwp」를 올렸습니다", "2026-03-24T10:30:00+09:00"],
  [21, "최민재", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2026-04-16T09:40:00+09:00"],
  [21, "최민재", "member.added", "한지우 주무관을 열람자로 추가했습니다", "2026-06-04T10:22:00+09:00"],
  [21, "최민재", "section.updated", "「2. 도(道) 협의 경과」를 고쳤습니다", "2026-07-30T09:44:00+09:00"],
  [21, "최민재", "attachment.added", "「경기도_통합환승_협의결과_3차.pdf」를 올렸습니다", "2026-07-30T09:50:00+09:00"],
  [21, "한지우", "comment.created", "대화를 남겼습니다", "2026-07-30T11:15:00+09:00"],
  [21, "최민재", "attachment.added", "「정산차액_추계_2027.xlsx」를 올렸습니다", "2026-08-06T11:40:00+09:00"],
  [21, "최민재", "comment.created", "대화를 남겼습니다", "2026-08-06T11:44:00+09:00"],
  [21, "최민재", "section.updated", "「3. 소요 재원 및 남은 결정」을 고쳤습니다", "2026-08-06T11:48:00+09:00"],

  [22, "최민재", "work.created", "업무를 만들었습니다", "2026-05-02T13:50:00+09:00"],
  [22, "최민재", "member.added", "오세훈 주무관을 열람자로 추가했습니다", "2026-07-20T09:30:00+09:00"],
  [22, "오세훈", "comment.created", "대화를 남겼습니다", "2026-07-22T13:40:00+09:00"],
  [22, "최민재", "attachment.added", "「정류소_안전시설_정비_공정표.xlsx」를 올렸습니다", "2026-08-05T16:20:00+09:00"],
  [22, "최민재", "comment.created", "대화를 남겼습니다", "2026-08-05T16:26:00+09:00"],
  [22, "최민재", "work.status_changed", "상태를 진행중에서 검토로 바꿨습니다", "2026-08-05T16:30:00+09:00"],

  [23, "정유진", "work.created", "업무를 만들었습니다", "2026-06-08T11:14:00+09:00"],
  [23, "정유진", "member.added", "김서연 주무관을 편집자로 추가했습니다", "2026-06-10T10:05:00+09:00"],
  [23, "정유진", "member.added", "고은비 주무관을 편집자로 추가했습니다", "2026-06-10T10:06:00+09:00"],
  [23, "고은비", "comment.created", "대화를 남겼습니다", "2026-08-04T10:20:00+09:00"],
  [23, "정유진", "attachment.added", "「성화봉송_코스안_1안2안.pdf」를 올렸습니다", "2026-08-04T10:22:00+09:00"],
  [23, "정유진", "comment.created", "대화를 남겼습니다", "2026-08-04T10:26:00+09:00"],

  [24, "박준호", "work.created", "업무를 만들었습니다", "2026-04-09T14:22:00+09:00"],
  [24, "박준호", "document.created", "문서 「음식물류폐기물 감량 시범사업 확대계획」을 만들었습니다", "2026-04-09T15:10:00+09:00"],
  [24, "박준호", "attachment.added", "「감량_시범사업_확대계획.hwp」를 올렸습니다", "2026-04-09T15:20:00+09:00"],
  [24, "박준호", "section.updated", "「1. 시범 결과 및 확대 근거」를 고쳤습니다", "2026-04-09T15:28:00+09:00"],
  [24, "박준호", "member.added", "이하람 주무관을 편집자로 추가했습니다", "2026-05-11T09:15:00+09:00"],
  [24, "박준호", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2026-05-11T09:20:00+09:00"],
  [24, "박준호", "attachment.added", "「감량기_시범단지_배출량_집계.xlsx」를 올렸습니다", "2026-08-05T16:58:00+09:00"],
  [24, "이하람", "comment.created", "대화를 남겼습니다", "2026-08-05T16:50:00+09:00"],
  [24, "박준호", "comment.created", "대화를 남겼습니다", "2026-08-05T17:03:00+09:00"],
  [24, "박준호", "section.updated", "「2. 원가산정과의 연결」을 고쳤습니다", "2026-08-05T17:05:00+09:00"],

  [25, "서나윤", "work.created", "업무를 만들었습니다", "2026-02-10T09:30:00+09:00"],
  [25, "서나윤", "member.added", "김서연 주무관을 열람자로 추가했습니다", "2026-03-04T11:40:00+09:00"],
  [25, "서나윤", "work.status_changed", "상태를 검토에서 완료로 바꿨습니다", "2026-06-26T16:15:00+09:00"],

  [26, "김서연", "work.created", "업무를 만들었습니다", "2026-07-21T10:05:00+09:00"],
  [26, "김서연", "member.added", "문지호 단장을 열람자로 추가했습니다", "2026-07-21T10:12:00+09:00"],
  [26, "김서연", "work.updated", "마감일을 2026년 9월 15일로 바꿨습니다", "2026-08-04T09:12:00+09:00"],

  [27, "이하람", "work.created", "업무를 만들었습니다", "2026-05-27T09:48:00+09:00"],
  [27, "이하람", "member.added", "류민석 주무관을 열람자로 추가했습니다", "2026-06-15T10:30:00+09:00"],
  [27, "이하람", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2026-06-15T10:35:00+09:00"],
  [27, "이하람", "attachment.added", "「탈취설비_사양_검토서.pdf」를 올렸습니다", "2026-08-03T14:35:00+09:00"],

  [28, "고은비", "work.created", "업무를 만들었습니다", "2026-07-08T15:30:00+09:00"],
  [28, "고은비", "member.added", "김서연 주무관을 열람자로 추가했습니다", "2026-07-09T09:20:00+09:00"],
  [28, "고은비", "comment.created", "대화를 남겼습니다", "2026-07-30T11:02:00+09:00"],

  [29, "최민재", "work.created", "업무를 만들었습니다", "2026-01-20T10:40:00+09:00"],
  [29, "최민재", "member.added", "배도현 주무관을 열람자로 추가했습니다", "2026-02-11T14:05:00+09:00"],
  [29, "최민재", "attachment.added", "「준공영제_타당성_최종보고서.pdf」를 올렸습니다", "2026-05-27T17:10:00+09:00"],
  [29, "최민재", "work.status_changed", "상태를 검토에서 완료로 바꿨습니다", "2026-05-27T17:20:00+09:00"],

  [30, "김서연", "work.created", "업무를 만들었습니다", "2026-06-25T09:22:00+09:00"],
  [30, "김서연", "document.created", "문서 「대회운영 인력 파견 협의안」을 만들었습니다", "2026-06-25T09:50:00+09:00"],
  [30, "김서연", "attachment.added", "「대회운영_파견인원표.xlsx」를 올렸습니다", "2026-06-25T10:10:00+09:00"],
  [30, "김서연", "section.updated", "「1. 파견 소요」를 고쳤습니다", "2026-06-25T10:04:00+09:00"],
  [30, "김서연", "member.added", "황수아 팀장을 편집자로 추가했습니다", "2026-06-26T09:30:00+09:00"],
  [30, "김서연", "member.added", "최민재 팀장을 열람자로 추가했습니다", "2026-07-28T10:15:00+09:00"],
  [30, "김서연", "work.status_changed", "상태를 대기에서 진행중으로 바꿨습니다", "2026-06-26T09:35:00+09:00"],
  [30, "최민재", "comment.created", "대화를 남겼습니다", "2026-07-31T14:20:00+09:00"],
  [30, "김서연", "comment.created", "대화를 남겼습니다", "2026-08-03T10:44:00+09:00"],
  [30, "황수아", "comment.created", "대화를 남겼습니다", "2026-08-06T10:30:00+09:00"],
  [30, "김서연", "attachment.added", "「부서별_파견협의_회신_취합.hwp」를 올렸습니다", "2026-08-06T10:28:00+09:00"],
  [30, "김서연", "section.updated", "「2. 부서별 협의 상황」을 고쳤습니다", "2026-08-06T10:35:00+09:00"],

  // 기존 업무에 붙은 뒤늦은 움직임 — 홈의 「내 업무에서 일어난 일」이
  // 하루치가 아니라 최근 며칠치로 읽히게 한다.
  [2, "정유진", "comment.created", "대화를 남겼습니다", "2026-08-04T11:16:00+09:00"],
  [4, "오세훈", "attachment.added", "「다중운집_안전관리계획_초안.hwp」를 올렸습니다", "2026-08-05T15:44:00+09:00"],
  [5, "이하람", "comment.created", "대화를 남겼습니다", "2026-08-06T09:45:00+09:00"],
  [5, "박준호", "comment.created", "대화를 남겼습니다", "2026-08-06T10:20:00+09:00"],
];

export const activities: Activity[] = ACT_SEEDS.map(
  ([w, actor, kind, summary, at], i) => ({
    id: i + 1,
    work_id: workId(w),
    actor_id: actor ? person(actor).id : null,
    kind,
    summary,
    detail: {},
    created_at: at,
  }),
).sort((a, b) => a.created_at.localeCompare(b.created_at));

// ---------------------------------------------------------------------------
// 인계·인수 — 「업무인계·인수서」(행정업무규정 시행규칙 별지 제12호서식)
// ---------------------------------------------------------------------------

export const handovers: Handover[] = [
  {
    id: HANDOVER_ID,
    from_profile_id: person("박준호").id,
    to_profile_id: person("이하람").id,
    // 초안까지 만들어 둔 상태. 데모에서 '확인 → 실행'을 눌러 볼 수 있게 한다.
    status: "generated",
    document_draft: null, // 화면에서 서식 구조로 조립한다
    // 무엇으로 만들었는지를 적는 감사용 칸이다. handover-draft.ts 는 쌓인 기록을
    // 서식 순서대로 조립하는 규칙 기반 코드이고 어떤 모델도 부르지 않는다.
    ai_model: "rule-based/v1",
    generated_at: "2026-08-06T08:40:00+09:00",
    confirmed_at: null,
    accepted_at: null,
    // 입회자는 인계자(박준호) 쪽 부서인 자원순환과의 최고서열자다. 실물에서는
    // 0026 의 app.pick_witness 가 같은 규칙으로 고른다 — 여기 손으로 적은 이름과
    // 그 함수의 결과가 어긋나면 목업 데모와 붙인 데모가 다른 사람을 부른다.
    witness_id: person("한상우").id,
    witness_note: null,
    completed_at: null,
    created_at: "2026-08-06T08:31:00+09:00",
  },
];

export const handoverItems: HandoverItem[] = [
  { handover_id: HANDOVER_ID, work_id: workId(5), transferred: false },
  { handover_id: HANDOVER_ID, work_id: workId(8), transferred: false },
  { handover_id: HANDOVER_ID, work_id: workId(9), transferred: false },
  // 감량 시범사업 — **데모에 하나뿐인 서식 문서**가 붙어 있는 업무다(docId 8).
  //
  // 이 업무의 항목(secId 21·22)에는 이미 「박준호 → 인계 대상」이라고 적어
  // 두었는데 정작 이 목록에는 빠져 있었다. 그래서 인계 대상 세 건에 서식
  // 문서가 하나도 없었고, 초안이 서식 문서를 읽는 길을 **화면에서는 한 번도
  // 지나가지 않았다.** 시드가 결함을 드러낼 수 없던 그때와 같은 자리다.
  //
  // 이야기로도 여기 있는 것이 맞다. 이 업무의 문서가 「감량 실적은 다음 해
  // 원가산정의 물량 추계에 그대로 들어간다」고 적고 있고, 그 원가산정이
  // workId(5) — 인계 대상 첫 번째다. 넘겨받는 사람이 둘을 같이 봐야 한다.
  { handover_id: HANDOVER_ID, work_id: workId(24), transferred: false },
];

// ---------------------------------------------------------------------------
// 결재 — 「내부결재문서」(행정업무규정 시행규칙 별지 제2호서식)
//
// 발신문서(별지 제1호서식)는 여기 없다. 그건 온나라의 자리다.
// 이 다섯 건이 결재함의 칸을 하나씩 채운다 — 진행 중 둘, 완결(전결) 하나,
// 반려 하나, 기안 중 하나. 데모 계정마다 다른 칸이 차게 짰다.
//
//   박준호  기안자.   진행 중 1 · 완결 1 · 반려 1 · 기안 중 1
//   최민재  협조자.   대기 1 (전국체전 계획서의 병렬협조 칸)
//   김서연  기안자.   진행 중 1 (최종결재를 기다리는 중)
//   이하람  인수자.   자원순환과 업무를 볼 수 있으므로 전임자의 결재도 그대로 보인다
// ---------------------------------------------------------------------------

const aprId = (n: number) =>
  `ab000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stepId = (n: number) =>
  `57000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type StepSeed = {
  kind: ApprovalKind;
  who: string;
  signed?: string;
  rejected?: string;
  opinion?: string;
};

type ApprovalSeed = {
  n: number;
  work: number;
  form: Approval["form"];
  /** 상신하는 순간 app.next_doc_no() 가 붙인다. 기안 중에는 없다. */
  docNo: string | null;
  title: string;
  body: string;
  retention: number | null;
  state: Approval["state"];
  drafter: string;
  created: string;
  /** 완결·반려·회수된 시각. 셋 중 무엇이었는지는 state 가 말한다. */
  closed?: string;
  steps: StepSeed[];
};

const APPROVAL_SEEDS: ApprovalSeed[] = [
  {
    n: 1,
    work: 5,
    form: "cooperation",
    docNo: "HS-협조-20260806-0001",
    title: "2026년 음식물류폐기물 대행 원가산정 용역 결과 협조 요청",
    body: [
      "1. 관련: 「폐기물관리법」 제14조 및 우리 시 「폐기물 처리 대행 계약 사무처리 규정」 제7조",
      "2. 2026년 음식물류폐기물 수집·운반 대행 원가산정 용역의 중간 결과를 붙임과 같이 알려 드리며, 2027년도 대행료 반영을 위한 협조를 요청합니다.",
      "3. 산정된 대행료 단가는 전년 대비 3.8% 인상으로, 인상 요인은 인건비 2.4%p·유류비 1.1%p·차량 감가상각 0.3%p입니다.",
      "4. 대행업체와의 단가 협의는 8월 넷째 주에 예정되어 있으며, 협의 결과에 따라 최종 수치가 달라질 수 있습니다.",
    ].join("\n\n"),
    retention: 5,
    state: "in_progress",
    drafter: "박준호",
    created: "2026-08-06T09:20:00+09:00",
    steps: [
      { kind: "draft", who: "박준호", signed: "2026-08-06T09:20:00+09:00" },
      { kind: "review", who: "정다은", signed: "2026-08-06T14:05:00+09:00" },
      { kind: "final", who: "한상우" },
      {
        kind: "concur_par",
        who: "배도현",
        signed: "2026-08-07T10:12:00+09:00",
        opinion:
          "2027년도 예산 요구서 제출 기한(8/8)과 겹칩니다. 단가 협의 결과가 나오는 대로 예산재정과에 먼저 알려 주시기 바랍니다.",
      },
    ],
  },
  {
    n: 2,
    work: 6,
    form: "report",
    docNo: "HS-보고-20250930-0001",
    title: "2025년 음식물류폐기물 대행 원가산정 용역 결과 보고",
    body: [
      "1. 2025년 음식물류폐기물 수집·운반 대행 원가산정 용역이 완료되어 그 결과를 보고합니다.",
      "2. 산정 결과 대행료 단가는 전년 대비 4.1% 인상되었으며, 인상률의 근거 자료는 용역 최종보고서 제3장에 정리되어 있습니다.",
      "3. 시의회 행정사무감사에서 인상률 근거 자료가 재차 요구된 바 있어, 산출 근거를 별도 요약본으로 함께 보관하겠습니다.",
    ].join("\n\n"),
    retention: 10,
    state: "completed",
    drafter: "박준호",
    created: "2025-09-30T15:02:00+09:00",
    closed: "2025-09-30T16:40:00+09:00",
    steps: [
      { kind: "draft", who: "박준호", signed: "2025-09-30T15:02:00+09:00" },
      // 전결이 찍히면 문서는 그 자리에서 끝난다. 뒤 칸에는 사선이 그어진다.
      { kind: "delegated", who: "정다은", signed: "2025-09-30T16:40:00+09:00" },
      { kind: "final", who: "한상우" },
    ],
  },
  {
    n: 3,
    work: 1,
    form: "plan",
    docNo: "HS-계획-20260805-0001",
    title: "제108회 전국체육대회 수송·교통 분야 세부 추진계획",
    body: [
      "1. 제108회 전국체육대회(2027년) 개최에 따른 수송·교통 분야 세부 추진계획을 붙임과 같이 수립하고자 합니다.",
      "2. 대회 기간 중 선수단·임원 수송은 전용 차량으로, 관람객 수송은 시내버스 임시노선과 셔틀로 나누어 운영합니다.",
      "3. 동탄 트램 1호선 개통 일정이 확정되지 않아, 트램을 전제로 한 노선안과 전제하지 않은 노선안 두 가지를 함께 담았습니다.",
      "4. 대중교통과 협조를 받아 임시노선 운행 소요 예산을 8월 중 산출할 예정입니다.",
    ].join("\n\n"),
    retention: 5,
    state: "in_progress",
    drafter: "김서연",
    created: "2026-08-05T11:10:00+09:00",
    steps: [
      { kind: "draft", who: "김서연", signed: "2026-08-05T11:10:00+09:00" },
      { kind: "review", who: "황수아", signed: "2026-08-05T17:22:00+09:00" },
      { kind: "final", who: "문지호" },
      // 병렬협조는 줄을 서지 않는다. 최종결재를 기다리지 않고 지금 처리할 수 있다.
      { kind: "concur_par", who: "최민재" },
    ],
  },
  {
    n: 4,
    work: 8,
    form: "plan",
    docNo: "HS-계획-20260724-0001",
    title: "재활용 선별시설 반입수수료 조정(안)",
    body: [
      "1. 선별시설 운영원가 상승분을 반영하여 반입수수료를 조정하고자 합니다.",
      "2. 조정안: 톤당 62,000원 → 71,000원(14.5% 인상)",
      "3. 수수료 조정은 조례 개정 사항으로, 의회법무과 협의를 거쳐 조례규칙심의회에 상정할 예정입니다.",
    ].join("\n\n"),
    retention: 5,
    state: "rejected",
    drafter: "박준호",
    created: "2026-07-24T16:30:00+09:00",
    closed: "2026-07-25T09:40:00+09:00",
    steps: [
      { kind: "draft", who: "박준호", signed: "2026-07-24T16:30:00+09:00" },
      {
        kind: "review",
        who: "정다은",
        rejected: "2026-07-25T09:40:00+09:00",
        opinion:
          "인상 근거가 「폐기물관리법 시행규칙」 개정안과 맞는지 먼저 확인해 주세요. 조례 개정 일정도 함께 적어 주시기 바랍니다.",
      },
      // 앞에서 반려되어 차례가 오지 않은 칸. 사선은 긋지 않는다 — 전결이 아니라
      // 반려로 끝난 문서이고, 둘은 다른 사실이다.
      { kind: "concur_seq", who: "박도윤" },
    ],
  },
  {
    n: 5,
    work: 9,
    form: "review",
    // 기안 중인 문서에는 번호가 없다. 번호는 상신과 함께 태어난다.
    docNo: null,
    title: "청소차량 운행기록 전산화 도입 검토",
    body: [
      "1. 종량제 수거차량 운행기록을 수기 대장에서 차량 단말 기반으로 전환하는 방안을 검토하였습니다.",
      "2. 민원 발생 시 수거 시각 확인에 평균 2일이 소요되던 것을 당일 확인으로 줄일 수 있습니다.",
      "3. 단말 설치 대상 차량과 소요 예산은 별지와 같습니다.",
    ].join("\n\n"),
    retention: 3,
    state: "drafting",
    drafter: "박준호",
    created: "2026-08-07T18:05:00+09:00",
    steps: [
      { kind: "draft", who: "박준호" },
      { kind: "review", who: "정다은" },
      { kind: "final", who: "한상우" },
    ],
  },
  {
    // 첫 화면에 놓인 계정(김서연)의 결재함 「대기」를 채우는 문서.
    // 이것이 없으면 심사위원이 처음 누르는 계정으로 결재함을 열었을 때
    // 「지금 처리할 결재가 없습니다」만 보고, 결재 층 전체를 못 보고 지나간다.
    //
    // 팀장이 기안하면 검토 단계 없이 단장 최종결재로 바로 간다.
    // 김서연은 이 업무의 주담당이라 병렬협조로 걸린다 — 병렬협조는 줄을 서지
    // 않으므로 최종결재를 기다리지 않고 지금 처리할 수 있다.
    n: 6,
    work: 1,
    form: "review",
    docNo: "HS-검토-20260812-0001",
    title: "대한체육회 1차 시설 실사 대응 검토",
    body: [
      "1. 2026. 9. 예정된 대한체육회 1차 시설 실사에 대비하여 소관 부서별 준비 상황을 검토하였습니다.",
      "2. 경기장 8개소 중 3개소는 개보수 공정이 실사 시점까지 완료되지 않아, 공정률과 완료 예정일을 함께 제출하는 방식으로 대응하고자 합니다.",
      "3. 실사 제출 자료의 수용인원은 시설 기준으로 적습니다. 수송·안전 분야가 쓰는 관람객 추계치와 숫자가 다르므로, 제출 전 종합 준비계획 2장의 세 기준 비교표를 함께 확인해야 합니다.",
      "4. 위 3항의 확인을 위해 종합 준비 주담당자를 협조에 포함하였습니다.",
    ].join("\n\n"),
    retention: 5,
    state: "in_progress",
    drafter: "황수아",
    created: "2026-08-12T10:30:00+09:00",
    steps: [
      { kind: "draft", who: "황수아", signed: "2026-08-12T10:30:00+09:00" },
      { kind: "final", who: "문지호" },
      { kind: "concur_par", who: "김서연" },
    ],
  },
];

export const approvals: Approval[] = APPROVAL_SEEDS.map((a) => ({
  id: aprId(a.n),
  work_id: workId(a.work),
  form: a.form,
  doc_no: a.docNo,
  title: a.title,
  body: a.body,
  retention: a.retention,
  security: "normal",
  state: a.state,
  drafter_id: person(a.drafter).id,
  created_at: a.created,
  closed_at: a.closed ?? null,
}));

export const approvalSteps: ApprovalStep[] = APPROVAL_SEEDS.flatMap((a, ai) =>
  a.steps.map((s, si) => ({
    // 문서마다 열 칸까지. 칸이 열을 넘는 결재선은 결재란으로 그릴 수 없다.
    id: stepId(ai * 10 + si + 1),
    approval_id: aprId(a.n),
    seq: si + 1,
    kind: s.kind,
    approver_id: person(s.who).id,
    // 서명 당시의 직위를 글자로 박는다. 인사이동 뒤에 옛 문서의 결재란이
    // 바뀌면 그건 문서 위조다(0016 의 같은 말).
    position: person(s.who).position ?? "직원",
    signed_at: s.signed ?? null,
    rejected_at: s.rejected ?? null,
    opinion: s.opinion ?? null,
  })),
);

// ---------------------------------------------------------------------------
// 열람기록 — 누가 무엇을 열어 봤는지. 사용자는 이 표에 쓰기 권한이 없다.
// ---------------------------------------------------------------------------

type AccessSeed = [number | null, string, AccessLog["kind"], string];

/**
 * 이 표는 **본인 열람만** 보인다(0002 의 access_log_select_self).
 *
 * 그래서 「데모 계정 네 개에 골고루」가 아니라 **계정마다 따로** 채워야 한다.
 * 예전에는 스무 줄을 네 사람이 나눠 가졌고, 최민재 계정에는 한 줄도 없어서
 * 열람기록 화면이 통째로 빈 상태였다. 박준호는 두 줄이었다.
 *
 * 남길 수 있는 것은 **그 사람이 볼 수 있는 업무**뿐이다 —
 * log_access() 가 app.can_read_work() 를 먼저 확인하기 때문에,
 * 볼 수 없는 업무의 열람기록은 애초에 만들어질 수 없다.
 *
 *   김서연  전국체전추진단. 전체 공개 업무 + 참여 업무
 *   박준호  자원순환과. 과 업무 전부 + 전체 공개
 *   이하람  자원순환과. 인수 대상을 읽어 나가는 중
 *   최민재  대중교통과. 자기 과 업무 + 전체 공개
 */
const ACCESS_SEEDS: AccessSeed[] = [
  [5, "이하람", "work.viewed", "2026-08-06T09:41:00+09:00"],
  [5, "이하람", "document.viewed", "2026-08-06T09:42:00+09:00"],
  [6, "이하람", "work.viewed", "2026-08-06T09:44:00+09:00"],
  [6, "이하람", "attachment.downloaded", "2026-08-06T09:47:00+09:00"],
  [9, "이하람", "work.viewed", "2026-08-06T09:52:00+09:00"],
  [1, "배도현", "work.viewed", "2026-08-06T09:15:00+09:00"],
  [1, "배도현", "document.viewed", "2026-08-06T09:16:00+09:00"],
  [1, "정유진", "work.viewed", "2026-08-06T09:10:00+09:00"],
  [1, "한지우", "work.viewed", "2026-08-05T17:52:00+09:00"],
  [5, "배도현", "work.viewed", "2026-08-05T13:20:00+09:00"],
  [5, "박준호", "work.viewed", "2026-08-05T18:02:00+09:00"],
  [2, "김서연", "work.viewed", "2026-08-04T11:35:00+09:00"],
  [1, "오세훈", "work.viewed", "2026-08-03T09:18:00+09:00"],
  [4, "김서연", "work.viewed", "2026-08-03T09:30:00+09:00"],
  [10, "김서연", "work.viewed", "2026-08-02T14:12:00+09:00"],
  [1, "고은비", "work.viewed", "2026-08-01T10:05:00+09:00"],
  [7, "한지우", "work.viewed", "2026-07-31T15:44:00+09:00"],
  [1, "황수아", "work.viewed", "2026-07-30T16:10:00+09:00"],
  [5, "박준호", "attachment.downloaded", "2026-07-28T16:45:00+09:00"],
  [11, "김서연", "work.viewed", "2026-07-27T09:33:00+09:00"],

  // ── 김서연 ───────────────────────────────────────────────────────────────
  [30, "김서연", "work.viewed", "2026-08-06T10:22:00+09:00"],
  [30, "김서연", "document.viewed", "2026-08-06T10:24:00+09:00"],
  [20, "김서연", "work.viewed", "2026-08-06T14:58:00+09:00"],
  [20, "김서연", "attachment.downloaded", "2026-08-06T15:02:00+09:00"],
  [23, "김서연", "work.viewed", "2026-08-05T09:40:00+09:00"],
  [23, "김서연", "attachment.downloaded", "2026-08-05T09:44:00+09:00"],
  [1, "김서연", "document.viewed", "2026-08-05T17:30:00+09:00"],
  [3, "김서연", "work.viewed", "2026-08-04T14:05:00+09:00"],
  [3, "김서연", "document.viewed", "2026-08-04T14:08:00+09:00"],
  [26, "김서연", "work.viewed", "2026-08-04T09:05:00+09:00"],
  [25, "김서연", "work.viewed", "2026-07-29T11:12:00+09:00"],
  [28, "김서연", "work.viewed", "2026-07-28T15:30:00+09:00"],
  [19, "김서연", "work.viewed", "2026-07-27T09:35:00+09:00"],
  [19, "김서연", "attachment.downloaded", "2026-07-27T09:38:00+09:00"],
  [17, "김서연", "work.viewed", "2026-07-24T10:50:00+09:00"],

  // ── 박준호 ───────────────────────────────────────────────────────────────
  [24, "박준호", "work.viewed", "2026-08-06T10:15:00+09:00"],
  [24, "박준호", "attachment.downloaded", "2026-08-06T10:18:00+09:00"],
  [5, "박준호", "document.viewed", "2026-08-06T09:12:00+09:00"],
  [6, "박준호", "work.viewed", "2026-08-05T14:20:00+09:00"],
  [6, "박준호", "document.viewed", "2026-08-05T14:22:00+09:00"],
  [6, "박준호", "attachment.downloaded", "2026-08-05T14:31:00+09:00"],
  [8, "박준호", "work.viewed", "2026-08-04T16:40:00+09:00"],
  [9, "박준호", "work.viewed", "2026-08-04T09:25:00+09:00"],
  [27, "박준호", "work.viewed", "2026-08-03T15:02:00+09:00"],
  [11, "박준호", "work.viewed", "2026-07-31T10:44:00+09:00"],
  [24, "박준호", "document.viewed", "2026-07-30T11:30:00+09:00"],
  [19, "박준호", "work.viewed", "2026-07-22T09:18:00+09:00"],

  // ── 이하람 ───────────────────────────────────────────────────────────────
  // 인수자는 「아무것도 모르는 상태에서 시작한다」. 그 사람의 열람기록은
  // 전임자의 업무를 하나씩 열어 보는 궤적으로 남는다 — 이 화면이 인계의
  // 진행 상황을 옆에서 보여 주는 자리이기도 하다.
  [24, "이하람", "work.viewed", "2026-08-06T10:05:00+09:00"],
  [24, "이하람", "document.viewed", "2026-08-06T10:07:00+09:00"],
  [24, "이하람", "attachment.downloaded", "2026-08-06T10:12:00+09:00"],
  [5, "이하람", "attachment.downloaded", "2026-08-06T09:50:00+09:00"],
  [8, "이하람", "work.viewed", "2026-08-06T09:55:00+09:00"],
  [27, "이하람", "work.viewed", "2026-08-05T11:20:00+09:00"],
  [27, "이하람", "attachment.downloaded", "2026-08-05T11:26:00+09:00"],
  // 업무 9에는 문서가 없다. 없는 문서를 열었다고 기록할 수는 없다.
  [9, "이하람", "work.viewed", "2026-08-05T09:32:00+09:00"],
  [6, "이하람", "document.viewed", "2026-08-04T15:10:00+09:00"],
  [1, "이하람", "work.viewed", "2026-08-03T13:40:00+09:00"],

  // ── 최민재 ───────────────────────────────────────────────────────────────
  // 한 줄도 없어서 화면이 통째로 비어 있던 계정.
  [21, "최민재", "work.viewed", "2026-08-06T11:30:00+09:00"],
  [21, "최민재", "document.viewed", "2026-08-06T11:33:00+09:00"],
  [30, "최민재", "work.viewed", "2026-08-06T09:40:00+09:00"],
  [30, "최민재", "document.viewed", "2026-08-06T09:43:00+09:00"],
  [22, "최민재", "work.viewed", "2026-08-05T16:10:00+09:00"],
  [3, "최민재", "work.viewed", "2026-08-03T09:02:00+09:00"],
  [3, "최민재", "document.viewed", "2026-08-03T09:05:00+09:00"],
  [3, "최민재", "attachment.downloaded", "2026-08-03T09:14:00+09:00"],
  [7, "최민재", "work.viewed", "2026-08-01T13:55:00+09:00"],
  [29, "최민재", "work.viewed", "2026-07-30T10:20:00+09:00"],
  [18, "최민재", "work.viewed", "2026-07-29T15:40:00+09:00"],
  [1, "최민재", "work.viewed", "2026-07-28T10:08:00+09:00"],
  [21, "최민재", "attachment.downloaded", "2026-07-30T09:52:00+09:00"],
];

export const accessLogs: AccessLog[] = ACCESS_SEEDS.map(
  ([w, actor, kind, at], i) => ({
    id: i + 1,
    work_id: w === null ? null : workId(w),
    target_id: null,
    actor_id: person(actor).id,
    kind,
    created_at: at,
  }),
).sort((a, b) => b.created_at.localeCompare(a.created_at));
