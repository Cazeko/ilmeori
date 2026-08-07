/**
 * Realtime 스텁 — 검사 하네스 전용.
 *
 * ⚠ 이 SQL 을 마이그레이션 파일로 옮기면 안 된다.
 *   Supabase 는 realtime 스키마를 잠가 두었고, create table/function 은
 *   permission denied for schema realtime 으로 실패한다. 로컬만 초록불이 되고
 *   실물 배포가 죽는 가장 전형적인 경로다.
 *
 * 여기서 실물의 모양을 흉내 내는 이유는, 0012 의 정책과 트리거를 **문법이 아니라
 * 행동으로** 검사하기 위해서다. 조건부 실행(있으면 만들고 없으면 건너뛰기)으로
 * 피해 가면 세 검사가 realtime 부분을 조용히 건너뛰고, 초록불이 거짓이 된다.
 *
 * 세 하네스(verify / rls.test / seed.test)가 이 파일 하나를 함께 쓴다.
 * 세 곳에 복사해 두면 반드시 한 곳이 뒤처진다.
 */
export const REALTIME_STUB = `
create schema if not exists realtime;

-- 실물과 같이 inserted_at 범위 파티션이다. 기본 파티션이 없으면 insert 가
-- 실패하는데, realtime.send 가 예외를 삼키므로 "조용히 0건"이 되어 원인을 못 찾는다.
create table if not exists realtime.messages (
  topic       text not null,
  extension   text not null,
  payload     jsonb,
  event       text,
  private     boolean default false,
  updated_at  timestamp without time zone not null default now(),
  inserted_at timestamp without time zone not null default now(),
  id          uuid not null default gen_random_uuid(),
  primary key (id, inserted_at)
) partition by range (inserted_at);
create table if not exists realtime.messages_default partition of realtime.messages default;
alter table realtime.messages enable row level security;

-- 채널 참가 권한을 판정할 때 Realtime 이 세팅하는 값.
create or replace function realtime.topic() returns text
language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text $$;

-- 인자 순서까지 실물과 같아야 한다. 바꾸면 PGlite 는 통과하는데 실물에서
-- "함수를 찾을 수 없다"로 죽는다.
-- 실패를 예외로 올리지 않고 warning 만 남기는 것도 실물과 같다 — 그래서
-- 신호가 유실돼도 업무 트랜잭션은 그대로 성공한다.
create or replace function realtime.send(
  payload jsonb, event text, topic text, private boolean default true
) returns void language plpgsql as $$
begin
  begin
    execute format('set local realtime.topic to %L', topic);
    insert into realtime.messages (payload, event, topic, private, extension)
    values (payload, event, topic, private, 'broadcast');
  exception when others then
    raise warning 'ErrorSendingBroadcastMessage: %', sqlerrm;
  end;
end $$;

grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated, service_role;
`;
