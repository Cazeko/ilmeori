-- =============================================================================
-- 시연 되돌리기
--
-- 이 파일을 먼저 돌리고, 이어서 seed/demo.sql 을 다시 돌린다.
-- 사람·부서·로그인 계정은 그대로 두고 업무 관련 자료만 비운다.
--
-- 감사 표(activity·access_log)는 평소 아무도 지울 수 없다. 그게 정확히
-- 우리가 원하는 동작이라, 이 정리 작업에서만 잠시 연다.
-- 실패하면 통째로 롤백되므로 열린 채로 남을 일은 없다.
-- =============================================================================

begin;

-- 트리거도 함께 끈다.
-- work_member 에는 마지막 소유자를 지키는 트리거가 걸려 있어서,
-- 그냥 지우면 '마지막 소유자는 해제할 수 없습니다' 로 막힌다.
-- 평소에는 정확히 그래야 하는 동작이다 — 주인 없는 업무가 생기면 안 되니까.
-- 비우는 동안만 끄고 아래에서 반드시 다시 켠다.
alter table access_log    disable trigger user;
alter table activity      disable trigger user;
alter table handover_item disable trigger user;
alter table handover      disable trigger user;
alter table attachment    disable trigger user;
alter table comment       disable trigger user;
alter table doc_section   disable trigger user;
alter table document      disable trigger user;
alter table work_member   disable trigger user;
alter table work          disable trigger user;

alter table access_log    disable row level security;
alter table activity      disable row level security;
alter table handover_item disable row level security;
alter table handover      disable row level security;
alter table attachment    disable row level security;
alter table comment       disable row level security;
alter table doc_section   disable row level security;
alter table document      disable row level security;
alter table work_member   disable row level security;
alter table work          disable row level security;

delete from access_log;
delete from activity;
delete from handover_item;
delete from handover;
delete from attachment;
delete from comment;
delete from doc_section;
delete from document;
delete from work_member;
delete from work;

alter table access_log    enable row level security;
alter table activity      enable row level security;
alter table handover_item enable row level security;
alter table handover      enable row level security;
alter table attachment    enable row level security;
alter table comment       enable row level security;
alter table doc_section   enable row level security;
alter table document      enable row level security;
alter table work_member   enable row level security;
alter table work          enable row level security;
alter table access_log    enable trigger user;
alter table activity      enable trigger user;
alter table handover_item enable trigger user;
alter table handover      enable trigger user;
alter table attachment    enable trigger user;
alter table comment       enable trigger user;
alter table doc_section   enable trigger user;
alter table document      enable trigger user;
alter table work_member   enable trigger user;
alter table work          enable trigger user;

commit;

-- 이제 seed/demo.sql 을 다시 돌린다.
