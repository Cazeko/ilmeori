-- 0025 · 알림이 사람을 「회원님」이라고 부르고 있었다
--
-- 0021 의 부름 알림이 이렇게 적었다 —
--   「정유진 주무관 님이 대화에서 **회원님**을 불렀습니다.」
--
-- 이 제품에는 회원이 없다. 가입 절차가 없고, 화면의 다른 모든 자리에서 사람을
-- 부르는 말은 「○○ 주무관 님」이거나 「내」다(「내 차례인 결재」·「내 업무 전체」).
-- 「회원」은 소비자 서비스의 낱말이고, 한 물건에 이름이 둘이면 사용자는 그것을
-- 둘로 센다(DESIGN.md §16.5 가 「바깥에 물어본 것」을 「쪽지」로 되돌린 규칙).
--
-- 문구는 화면이 아니라 **여기서** 만들어진다. 그래서 화면 쪽 목업만 고치면
-- 시연과 실물이 다른 말을 하게 된다 — 이 저장소가 「화면·종이·파일이 같은
-- 모델에서 나온다」고 적어 둔 것과 같은 이유로, 낱말도 한 곳에서 나와야 한다.
--
-- 0021 을 고치지 않고 함수만 다시 만든다. 이미 적용된 마이그레이션은 손대지
-- 않는다 — 트리거는 그대로 이 함수를 가리키므로 다시 걸 것이 없다.
-- 이미 쌓인 알림의 글자는 바꾸지 않는다. 지나간 알림은 그때 일어난 일의
-- 기록이고, 기록을 나중에 고쳐 쓰는 것은 이 제품이 하지 않기로 한 일이다.

create or replace function app.trg_mention_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w uuid := app.comment_work(new.comment_id);
  who text;
begin
  select btrim(p.name || ' ' || coalesce(p.position, '')) into who
  from public.profile p where p.id = (select auth.uid());

  perform app.notify(
    new.profile_id, 'mention', w, new.comment_id,
    format('%s 님이 대화에서 나를 불렀습니다.', coalesce(who, '누군가'))
  );
  return new;
end;
$$;
