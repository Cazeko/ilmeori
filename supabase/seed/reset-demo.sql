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

commit;

-- 이제 seed/demo.sql 을 다시 돌린다.
