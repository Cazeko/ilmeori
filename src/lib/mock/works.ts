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
  Activity,
  Attachment,
  Comment,
  DocSection,
  Document,
  Handover,
  HandoverItem,
  Work,
  WorkMember,
} from "@/lib/types";
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

export const documents: Document[] = [
  {
    id: docId(1),
    work_id: workId(1),
    title: "제108회 전국체육대회 종합 준비계획",
    created_by: person("김서연").id,
    created_at: "2026-03-02T09:31:00+09:00",
    updated_at: "2026-08-05T17:41:00+09:00",
  },
  {
    id: docId(2),
    work_id: workId(5),
    title: "음식물류폐기물 대행 원가산정 추진계획",
    created_by: person("박준호").id,
    created_at: "2026-06-15T10:05:00+09:00",
    updated_at: "2026-08-05T18:10:00+09:00",
  },
  {
    id: docId(3),
    work_id: workId(6),
    title: "2025년 원가산정 용역 결과 정리",
    created_by: person("박준호").id,
    created_at: "2025-09-22T14:00:00+09:00",
    updated_at: "2025-10-14T16:30:00+09:00",
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
];

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
    completed_at: null,
    created_at: "2026-08-06T08:31:00+09:00",
  },
];

export const handoverItems: HandoverItem[] = [
  { handover_id: HANDOVER_ID, work_id: workId(5), transferred: false },
  { handover_id: HANDOVER_ID, work_id: workId(8), transferred: false },
  { handover_id: HANDOVER_ID, work_id: workId(9), transferred: false },
];

// ---------------------------------------------------------------------------
// 열람기록 — 누가 무엇을 열어 봤는지. 사용자는 이 표에 쓰기 권한이 없다.
// ---------------------------------------------------------------------------

type AccessSeed = [number | null, string, AccessLog["kind"], string];

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
