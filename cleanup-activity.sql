-- 시드를 두 번 실행해 이력·열람기록이 겹쳐 들어갔을 때 정리한다.
-- 같은 내용이 여러 벌 있으면 가장 먼저 들어간 하나만 남긴다.
-- 여러 번 돌려도 안전하다.

begin;

-- 감사 표는 평소 아무도 지울 수 없다. 그게 정확히 우리가 원하는 동작이라,
-- 이 정리 작업에서만 잠시 연다. 실패하면 통째로 롤백된다.
alter table activity   disable row level security;
alter table access_log disable row level security;

delete from activity a
using activity b
where a.id > b.id
  and a.work_id    = b.work_id
  and a.kind       = b.kind
  and a.summary    = b.summary
  and a.created_at = b.created_at
  and a.actor_id is not distinct from b.actor_id;

delete from access_log a
using access_log b
where a.id > b.id
  and a.work_id    = b.work_id
  and a.kind       = b.kind
  and a.created_at = b.created_at
  and a.actor_id is not distinct from b.actor_id;

alter table activity   enable row level security;
alter table access_log enable row level security;

commit;

-- 확인 — 이력 64, 열람기록 20 이어야 한다.
select 'activity' as 표, count(*) as 건수 from activity
union all
select 'access_log', count(*) from access_log;
