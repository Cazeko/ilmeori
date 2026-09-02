-- =============================================================================
-- 시연 되돌리기
--
-- 이 파일을 먼저 돌리고, 이어서 seed/demo.sql 을 다시 돌린다.
-- 사람(profile)·부서(department)·로그인 계정(auth.users)은 건드리지 않는다.
--
-- delete 가 아니라 truncate 를 쓴다. delete 는 행 단위 트리거를 타기 때문에
-- work_member 를 지울 때 「마지막 소유자 보호」 트리거에 막힌다.
-- 트리거와 RLS를 껐다 켜서 우회할 수도 있지만, 껐다 켜는 단계가 있으면
-- 중간에 어긋날 여지가 생긴다. truncate 는 애초에 그 둘을 타지 않는다.
-- =============================================================================

truncate
  work,
  work_member,
  document,
  doc_section,
  doc_version,
  attachment,
  comment,
  activity,
  access_log,
  handover,
  handover_item,
  note,
  notification
restart identity cascade;

-- 이제 seed/demo.sql 을 다시 돌린다.
