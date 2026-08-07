# Supabase 연결 절차

SQL로 되는 것은 전부 마이그레이션에 넣어 뒀다. 이 문서는 **대시보드에서 손으로 눌러야 하는 것**과 그 순서를 적는다.

손으로 눌러 놓은 설정은 프로젝트를 다시 만들면 사라진다. 그래서 여기 남긴다.

---

## 0. 시작 전에

| 항목 | 값 | 이유 |
|---|---|---|
| Region | **Northeast Asia (Seoul) — ap-northeast-2** | 지연 시간도 있지만, 발표에서 "데이터가 어디 있느냐"는 반드시 나온다 |
| Plan | Free로 충분 | 예선·본선 기간의 트래픽으로는 한도에 닿지 않는다 |
| Database password | 생성기로 만든 긴 값 | 이 값은 어디에도 커밋하지 않는다. 비밀번호 관리자에 넣는다 |

> Free 플랜은 **7일간 요청이 없으면 프로젝트가 일시정지**된다. 심사 전날 한 번 열어 보는 것을 일정에 넣어 둘 것.

---

## 1. 마이그레이션 적용

대시보드 → **SQL Editor** 에서 순서대로 붙여 넣고 실행한다.

```
supabase/migrations/0001_schema.sql               스키마 · 인덱스
supabase/migrations/0002_rls.sql                  권한 · RLS 정책 35개
supabase/migrations/0003_triggers.sql             이력 자동기록 · 인계 실행 · Storage
supabase/migrations/0004_hardening.sql            기본 권한 잠금 · 점검용 뷰
supabase/migrations/0005_auto_rls.sql             새 표에 RLS 자동 적용
supabase/migrations/0006_activity_wording.sql     이력 문구를 능동형으로
supabase/migrations/0007_visibility_owner_only.sql 공개 범위는 소유자만
supabase/migrations/0008_delete_paths.sql         지울 수 없던 두 곳
supabase/migrations/0009_document_history.sql     문서 이력의 빈자리
supabase/migrations/0010_grant_layer.sql          GRANT 층을 실제로 세운다
supabase/migrations/0011_work_field_guard.sql     업무의 칸마다 주인을 정한다
supabase/migrations/0012_realtime.sql             실시간 공유 — 토픽 정책 · 방송 트리거
supabase/migrations/0013_access_log_session.sql   열람기록을 열람 세션 단위로
supabase/migrations/0014_handover_note.sql        인계서에 인계자가 보태는 칸
supabase/migrations/0015_handover_owner_guard.sql 인계 건의 주인 — 인수자가 가로채지 못하게
supabase/migrations/0016_approval.sql             결재 — 표 · 직급 서열 · 결재유형 8종
supabase/migrations/0017_approval_rls.sql         결재의 권한과 절차 — 서명은 손으로 안 찍힌다
```

적용 전에 로컬에서 먼저 돌려 볼 수 있다. PGlite(Postgres WASM)로 실제 실행한다.

```bash
npm run db:verify   # 마이그레이션이 실제로 도는지
npm run db:test     # RLS가 실제로 막는지 (160개)
```

## 1-0. 0016 · 0017 — 결재 (이미 연결된 프로젝트에 따로 실행)

> ⚠ **이 둘은 코드보다 먼저 돌려야 한다.** 다른 마이그레이션과 순서가 반대다.
>
> 0016이 `profile.rank` 를 만들고, 그 칸이 `src/lib/data/db.ts` 의 조회 목록
> (`PROFILE_SELECT` · `WORK_SELECT`)에 들어갔다. 표에 칸이 없는 채로 코드를 배포하면
> PostgREST 가 `column profile.rank does not exist` 로 거절하고 **업무 목록이 통째로
> 비어 보인다.** 0014가 「적을 칸은 보이는데 저장이 안 되는」 정도로 끝났던 것과 다르다.
>
> 순서: ① SQL Editor 에서 0016 → 0017 → ② 시드 다시 넣기(선택) → ③ 코드 배포

**0016 을 먼저, 0017 을 나중에.** 한 번에 붙여 넣지 않는다.
0016 이 `activity_kind` 열거형에 결재 사건 다섯을 더하는데, **열거형에 더한 값은 같은
트랜잭션 안에서 쓸 수 없다.** SQL Editor 는 붙여 넣은 것을 한 트랜잭션으로 묶으므로,
둘을 함께 붙이면 0017 의 함수들이 그 값을 참조하는 자리에서 막힌다.

무엇이 들어가는가.

```
0016  profile.rank          결재 서열 10 시장 / 20 국장 / 30 과장 / 40 팀장 / 50 주무관
      approval              내부결재문서(시행규칙 별지 제2호서식)
      approval_step         결재란 한 칸 — 서명 당시 직위를 글자로 박는다
      activity_kind +5      approval.submitted / signed / rejected / completed / withdrawn

0017  정책 7개              approval 4 · approval_step 3 (UPDATE 정책은 **없다**)
      절차 4개              submit_approval / sign_approval / reject_approval / withdraw_approval
      가드 트리거 2개       끝난 결재를 잠그고, 상신된 본문을 얼린다
```

**둘 다 다시 붙여 넣어도 안전하다.** `add column if not exists` · `create table if not exists` ·
`drop policy if exists` · `create or replace` 로만 되어 있다.

시드를 다시 넣으면 `profile.rank` 가 직급대로 채워진다(주무관 50 / 팀장 40).
다시 넣지 않아도 기본값 50 이라 화면은 돌지만, 결재선 자동 생성이 전부 같은 급으로 나온다.

확인:

```
npm run db:verify                                 표 16개 · 정책 47개
npm run db:test                                   160개 ([15] 결재 35개 포함)
```

## 1-1. 0014 · 0015 — 인계서 보충 (이미 연결된 프로젝트에 따로 실행)

**둘을 함께 돌린다.** 0014가 인계자가 서식 항목에 보태는 칸(`handover_note`)을 만들고,
0015가 그 칸이 기대는 전제 — 「인계서는 인계자의 문서다」 — 를 실제로 지킨다.

0015를 빼면 구멍이 하나 열린 채로 남는다. 0002의 `handover_update` 는 당사자 **둘 모두**에게
UPDATE 를 열어 두고 어떤 칸을 고치는지는 보지 않았다. 그래서 인수자가

```sql
update handover set from_profile_id = 나, to_profile_id = 상대 where id = ...;
```

한 줄로 남의 인계서를 자기 것으로 만들고, 거기에 자기 문장을 넣고, 원래 인계자를
자기 문서에서 밀어낼 수 있다(PGlite 로 재현했다). 업무가 실제로 넘어가지는 않지만
서명란에 인계자 이름이 찍혀 나가는 문서의 저자가 바뀐다.

**0014를 돌리기 전에 코드를 배포해도 인계 화면이 죽지는 않는다.** 조회 쪽이 「표 없음」만
0건으로 이어 받고 서버 로그에 무엇을 돌려야 하는지 적는다. 다만 그동안은 **적을 칸은 보이는데
저장은 안 되는** 상태이므로 오래 두지 않는다.

**둘 다 다시 붙여 넣어도 안전하다.** `create table if not exists` · `drop policy if exists` ·
`create or replace` 로만 되어 있어, 이미 적용된 프로젝트에 다시 돌려도 같은 상태가 된다.
0015가 도중에 실패했다면 그냥 다시 돌리면 된다.

> **한 번 물린 것** — 0015의 첫 판이 `alter function ... set app.executing_handover = '1'` 로
> 함수에 사용자 정의 매개변수를 붙이려다 SQL Editor 에서 막혔다.
>
> ```
> ERROR: 42501: permission denied to set parameter "app.executing_handover"
> ```
>
> **그 문장은 superuser 전용이고 Supabase 의 postgres 는 superuser 가 아니다.**
> PGlite 검사는 superuser 로 돌기 때문에 그대로 통과했다 — 이 부류는 로컬에서 원리상
> 안 잡힌다. 지금은 호출 스택을 직접 보는 방식으로 바꿨고, 같은 실수가 다시 나지 않도록
> `npm run db:verify` 가 마이그레이션 글자를 훑어 잡는다.

확인:

```
npm run db:verify                                 superuser 전용 문장이 섞였는지도 본다
npm run db:test                                   125개 (인계서 보충 27개 포함)
BASE=<주소> npm run test:browser                  [7] 마당 — 적고, 종이에 실리고, 지운다
```

## 1-2. 0012 · 0013 — 실시간 공유 (이미 연결된 프로젝트에 따로 실행)

**이걸 돌리지 않으면 실시간이 통째로 꺼진 상태가 된다.** 화면은 「실시간 연결 끊김」이라고
정직하게 적고 나머지는 그대로 동작하지만, 접속자 표시도 자동 갱신도 없다.

0012 가 realtime 스키마에 하는 일은 **정책 두 개**뿐이다. 표도 함수도 만들지 않는다 —
Supabase 가 그 스키마를 잠가 두었기 때문이다(`permission denied for schema realtime`).
검사 하네스(PGlite)에는 흉내용 스텁이 있지만 그건 `supabase/realtime-stub.mjs` 안에만 있고
마이그레이션에는 한 줄도 들어가지 않는다. **둘을 섞으면 로컬은 초록불인데 배포가 죽는다.**

**0013 도 함께 돌린다.** 실시간 갱신은 그 업무를 열어 둔 사람 전원의 화면을 다시 그리게
하고, 그 서버 렌더가 열람기록을 한 줄씩 더 남긴다. 옆자리 사람이 스무 번 저장하면 내
열람기록에 「업무 열람」이 예순 줄 넘게 찍힌다. 0013 이 같은 사람의 같은 업무 열람을
10분 단위로 묶는다(파일 내려받기는 그대로 매번 남는다 — 그건 횟수가 곧 뜻이다).

돌린 뒤 확인:

```bash
node supabase/realtime.probe.mjs    # 또는 npm run db:realtime
```

실제 계정 셋으로 채널에 붙어 본다. 볼 수 있는 사람은 들어가고, 못 보는 사람은 거부되고,
남이 고치면 신호가 오고, 그 신호에 내용이 실려 있지 않은지까지 본다.

> **첫 시도가 `MissingPartition` 으로 실패할 수 있다.** private 채널을 한 번도 쓴 적 없는
> 프로젝트에서 `realtime.messages` 의 당일 파티션이 아직 없을 때 나온다. 실제로 이 프로젝트에서
> 한 번 났고, **두 번째 시도부터는 정상**이었다(Realtime 이 스스로 만든다). 실패 문구가
> `Unauthorized ...` 로 바뀌면 파티션 문제는 끝난 것이고, 남은 것은 정책 문제다.

> 대시보드에서 눌러야 하는 것은 **없다.** publication 에 표를 추가할 필요도 없다 —
> postgres_changes 가 아니라 broadcast 를 쓰기 때문이다.

## 1-1. 0007~0011 — 이미 연결된 프로젝트에 따로 실행해야 하는 것

> 0001~0006 을 적용한 **뒤에** 추가된 파일들이다. 대시보드 SQL Editor 에서
> **0007 → 0008 → 0009 → 0010 → 0011 순서대로** 실행한다.
>
> 적용하지 않아도 화면은 정상 동작한다. 애플리케이션이 같은 규칙을 이미 지키기 때문이다.
> 적용하면 PostgREST 를 직접 호출하는 경로까지 같은 규칙이 걸린다 —
> 서버 액션은 화면을 거치지 않고 POST 로 부를 수 있고, PostgREST 는 더 직접적이다.
> **애플리케이션에만 있는 규칙은 규칙이 아니라 관행이다.**

### 0007 · 0011 — 업무의 칸마다 주인을 정한다

`work_update` 정책은 편집자에게도 UPDATE 를 허용한다. 제목·마감일·진행상태는 그게 맞다.
그런데 같은 표에는 성격이 다른 칸이 섞여 있고, 정책은 **행만 보고 칸은 보지 못한다.**

실제로 뚫려 있던 것(PGlite 로 재현해 확인했다):

| 칸 | 뚫려 있던 일 |
|---|---|
| `department_id` | 편집자가 소관 부서를 남의 과로 옮기면 그 과 전원이 문서·대화·첨부를 읽는다. **이력에는 한 줄도 안 남았다** |
| `owner_id` | 편집자가 주담당을 스스로 가져가고, 지울 수 없는 이력에 없던 인계 기록이 박힌다 |
| `archived_at` | 편집자가 업무를 모두의 보드에서 내린다 |

정책을 소유자로 좁혀서는 풀 수 없다. 그러면 편집자가 진행상태조차 못 바꾸게 되어
협업 도구가 아니게 된다. 칸 단위 규칙은 트리거의 일이다(0003 의 `trg_profile_immutable_fields`
가 같은 이유로 같은 모양을 하고 있다).

### 0008 — 지울 수 없던 두 곳

`work_delete` 정책은 있는데 **실제로는 어떤 방법으로도 업무를 지울 수 없었다.**
연쇄로 지워지는 참여자 행이 「마지막 소유자 보호」 트리거에 걸리고, 그 앞을 비켜서게 해도
이번엔 이력 트리거가 이미 사라진 업무를 참조해 FK 위반이 났다.
정책이 허용한다고 적혀 있는데 실행하면 언제나 실패하는 것은 그 자체로 결함이다.

인계도 마찬가지였다. 시작한 인계를 되돌릴 길이 없어, 인수자를 잘못 고르면
그 사람은 영영 새 인계를 시작할 수 없었다(한 번에 한 건만 진행하기 때문이다).

### 0009 — 문서 이력의 빈자리

화면에서 문서를 실제로 고칠 수 있게 되자 드러난 것들이다.
항목을 지우면 아무 기록도 남지 않았고, 문서 이름 변경도 마찬가지였다.
편집 잠금을 잡았다 풀기만 해도 「마지막 수정」이 밀려, 읽기 화면에
「이전 사람 이름 · 방금」이라는 있지도 않은 사실이 찍혔다.

### 0010 — GRANT 층을 실제로 세운다

0002 는 「RLS 는 어떤 행을 볼지 정하고 GRANT 는 어떤 동작을 할 수 있는지 정한다」고 적었다.
실제 프로젝트에 붙여 찔러 보니 그 문장이 절반만 참이었다.

```
department INSERT      42501  권한층에서 차단   ✓
department DELETE      통과(0행)                ← RLS만 막고 있다
profile    DELETE      통과(0행)                ← RLS만 막고 있다
comment    DELETE      통과(0행)                ← RLS만 막고 있다
```

0004 의 `alter default privileges ... revoke` 는 **앞으로 만들 표**에만 걸리고,
`revoke all on all tables ... from anon` 은 anon 에게만 걸린다.
0001 에서 이미 만들어진 표에 대한 `authenticated` 의 권한은 아무도 걷어내지 않았다.
유출이 일어나고 있던 것은 아니지만(RLS 가 전부 0행으로 막는다), 방어가 한 겹이면서
두 겹인 것처럼 적혀 있었다.

### 0004가 하는 일

Supabase 기본값은 개발 편의 쪽으로 열려 있어서, 그대로 두면 RLS를 아무리 잘 짜도 우회로가 남는다.

- `public` 스키마에 아무나 테이블을 만들지 못하게 한다 — 자기 테이블을 만들면 우리 RLS가 없는 곳에 데이터를 복사할 수 있다
- 앞으로 만들 테이블이 자동으로 `anon`·`authenticated` 권한을 얻지 않게 한다 — 새 테이블에 RLS를 깜빡하면 그 순간 전부 공개된다
- 익명 역할을 완전히 닫는다 — 이 제품에는 로그인 없이 볼 화면이 없다
- 감사 테이블(`activity`, `access_log`)의 UPDATE·DELETE 권한을 테이블 층에서도 회수한다

> ⚠️ **RLS 정책이 부르는 함수의 EXECUTE 권한은 회수하면 안 된다.**
> 정책을 평가할 때 *정책을 평가하는 사용자*의 실행 권한을 검사하기 때문에,
> `app.can_read_work` 를 `authenticated` 에서 회수하면 정책이 통째로 죽는다.
> 0004에 그 이유를 주석으로 남겨 뒀다.

### 0005 — 새 표에 RLS 자동 적용

대시보드의 **Enable automatic RLS** 와 같은 일을 하는 이벤트 트리거다.
`public` 스키마에 표가 새로 만들어지면 곧바로 RLS를 켠다.

이게 막는 것은 공격이 아니라 **우리 실수**다. 외부에서 표를 만들어 데이터를 빼내는
경로는 0004에서 이미 닫혔고(`public` 스키마 CREATE 회수), 여기서 막는 것은
앞으로 기능을 붙이며 표를 추가할 때 RLS를 깜빡하는 경우다.
실패 방향도 안전한 쪽이다 — 정책이 없으면 아무도 못 읽는다.

`CREATE TABLE AS` 와 `SELECT INTO` 도 잡는다.
`create table x as select * from work` 한 줄이면 정책 없는 사본이 생기기 때문이다.

**FORCE ROW LEVEL SECURITY 는 자동으로 걸지 않는다.** 아래 항을 참고할 것.

> `CREATE EVENT TRIGGER` 는 슈퍼유저 권한이 필요하다.
> `permission denied to create event trigger` 가 나오면 대시보드의
> **Enable automatic RLS** 버튼을 대신 쓰면 된다. 하는 일은 같다.
> 다만 대시보드 설정은 프로젝트를 다시 만들면 사라지고, 마이그레이션은 남는다.

### FORCE RLS와 소유자 — 시드가 막힐 수 있는 지점

`force row level security` 는 **테이블 소유자에게도** 정책을 적용한다.
소유자 역할에 `BYPASSRLS` 속성이 없으면, 시드를 실행하는 `postgres` 조차
자기 표에 INSERT를 못 한다. (PGlite로 실측했다 — 소유자여도 차단되고,
`BYPASSRLS` 를 주면 통과한다)

특히 `activity`·`access_log` 는 INSERT 정책 자체가 없어서 확실히 막힌다.
평소에는 그게 정확히 우리가 원하는 동작이다. 감사 기록은 아무도 못 쓴다.

그래서 시드는 트랜잭션 안에서 RLS를 잠시 끄고 넣은 뒤 다시 켠다.
실패하면 통째로 롤백되므로 꺼진 채로 남을 일은 없고, 검증 스크립트가
**시드 후 RLS가 다시 켜져 있는지** 확인한다.

Supabase의 `postgres` 역할에 `BYPASSRLS` 가 있는지 궁금하면 이걸로 확인한다.

```sql
select rolname, rolbypassrls from pg_roles where rolname = 'postgres';
```

### ⚠️ SQL Editor의 경고창은 대부분 오탐이다 — 제안을 수락하지 말 것

붙여 넣고 실행하면 이런 경고가 뜬다.

> This query creates a table without enabling Row Level Security.
> Clients using anon or authenticated keys may be able to access **AS**.

`AS` 라는 표는 존재하지 않는다. Supabase의 정적 분석기가 함수 정의의
`... as $fn$` 를 `CREATE ... AS <이름>` 으로 잘못 읽은 것이다.
plpgsql 함수는 `AS` 없이 정의할 방법이 없어 피할 수 없다.

**여기서 "Enable Row Level Security" 제안을 수락하면 안 된다.**
수락하면 Supabase가 `alter table AS enable row level security` 를 덧붙여 실행하고,
없는 표이므로 아래 오류로 끝난다.

```
ERROR: 42P01: relation "AS" does not exist
```

경고를 무시하고 **그대로 실행**한다(Run this query anyway).

`0001` 에서 뜨는 경고는 **진짜**다. 표 13개를 만드는데 RLS는 `0002` 에서 켜기 때문이다.
그때도 제안은 수락하지 말고 그냥 실행한 뒤, 곧바로 `0002` 를 실행한다.

Supabase의 경고보다 아래 점검이 정확하다.

### 적용 후 점검

```sql
select * from app.security_audit;
```

**0행이어야 정상이다.** 한 행이라도 나오면 RLS가 빠졌거나, `search_path`를 고정하지 않은 `SECURITY DEFINER` 함수가 있거나, `anon` 권한이 남아 있다는 뜻이다.

대시보드 → **Advisors → Security Advisor** 도 함께 돌린다. 위 뷰와 겹치지 않는 항목(예: 노출된 확장 기능)을 잡아 준다.

---

## 2. 시드 데이터

```bash
npm run db:seed        # src/lib/mock → supabase/seed/demo.sql 생성
npm run db:seed:test   # 실제로 들어가는지 PGlite로 검증
```

생성된 `supabase/seed/demo.sql` 을 SQL Editor에 붙여 넣되, **맨 위 한 줄만 바꾼다.**

```sql
demo_password text := 'CHANGE-ME-BEFORE-RUNNING';
```

이 값은 파일에 다시 저장하지 않는다. 제출물에 깃헙 주소가 들어가므로 비밀번호 유출이 가장 현실적인 사고 경로다. (`npm run check` 에 자리표시자가 남아 있는지 확인하는 검사가 들어 있다)

같은 값을 배포 환경변수 `DEMO_ACCOUNT_PASSWORD` 에도 넣는다.

시드에 들어가는 것: 부서 89 · 사람 16 · 업무 18 · 문서 3(항목 10) · 대화 10 · 첨부 8 · 이력 64 · 인계 1 · 열람기록 20.
부서명만 화성특례시 공개 조직도(2026. 2. 개편)를 따랐고 **나머지는 전부 지어낸 것**이다.

> 첨부는 경로만 넣는다. 실제 파일은 올리지 않는다.

---

## 3. 인증 설정 — 여기가 핵심이다

**Authentication → Sign In / Providers**

| 항목 | 설정 | 이유 |
|---|---|---|
| **Allow new users to sign up** | **끈다** | 제일 중요하다. 켜져 있으면 주소를 아는 누구나 계정을 만들고 `authenticated` 역할을 얻는다. 그 순간 "전체 공개(city)" 업무가 전부 노출된다 |
| Email provider | 켠다 | 데모 계정 로그인에 쓴다 |
| Confirm email | 끈다 | 시드로 만든 계정은 이미 확인 처리되어 있다. 켜 두면 메일 발송에 실패해 로그인이 막힌다 |
| 그 외 소셜 로그인 | 전부 끈다 | 쓰지 않는 경로는 열어 둘 이유가 없다 |

**Authentication → Sessions**

| 항목 | 설정 | 이유 |
|---|---|---|
| JWT expiry | `3600`(1시간) | 기본값. 토큰이 새어도 유효 기간이 짧다 |
| Refresh token rotation | 켠다 | 갱신할 때마다 새 토큰을 발급하고 옛것을 무효화한다 |
| Reuse interval | `10`초 | 이미 쓴 갱신 토큰이 다시 오면 탈취로 보고 세션을 끊는다 |
| Time-box user sessions | `8`시간 | 근무시간 정도. 데모 세션이 무기한 살아 있을 이유가 없다 |

**Authentication → Password**

| 항목 | 설정 |
|---|---|
| Minimum length | `12` 이상 |
| Required characters | 소문자·대문자·숫자·기호 |
| **Leaked password protection** | **켠다** — HaveIBeenPwned에 걸린 비밀번호를 거부한다 |

**Authentication → URL Configuration**

| 항목 | 값 |
|---|---|
| Site URL | 배포 주소 (예: `https://ilmeori.vercel.app`) |
| Redirect URLs | 배포 주소와 `http://localhost:3000` **만** 등록 |

와일드카드(`*`)를 넣지 않는다. 넣으면 아무 주소로나 인증 토큰을 실어 보낼 수 있는 오픈 리다이렉트가 된다.

**Authentication → Rate Limits**

기본값을 그대로 두되, 다음 두 개만 확인한다.

| 항목 | 값 | 이유 |
|---|---|---|
| Sign in / Sign up | 기본(시간당 30회) 유지 | 비밀번호 대입 시도를 늦춘다 |
| Token refresh | 기본 유지 | — |

---

## 4. 저장소(Storage)

버킷 `work-files` 와 정책은 `0003_triggers.sql` 이 만든다. 대시보드에서 확인만 한다.

| 항목 | 값 |
|---|---|
| Public | **꺼짐** — 공개 URL이 존재하지 않아야 한다 |
| File size limit | 20MB |
| Allowed MIME types | hwp·hwpx·pdf·office·이미지 |

내려받기는 매번 권한을 확인하고 단기 만료 signed URL을 발급한다.

---

## 5. API 키

**Project Settings → API**

- 애플리케이션에 넣는 것은 **anon key 하나뿐**이다. 브라우저에 노출되어도 안전하다. 접근제어는 RLS가 한다
- **`service_role` 키는 어디에도 넣지 않는다.** RLS를 전면 우회하므로, 한 번이라도 쓰면 "권한은 DB가 강제한다"는 설계 전제가 무너진다
- 키가 노출된 것 같으면 같은 화면에서 즉시 재발급한다

---

## 6. 환경변수

로컬 `.env.local`, 배포 환경(Vercel 등) 양쪽에 같은 값을 넣는다.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
DEMO_ACCOUNT_PASSWORD=<시드에 넣은 값>
```

- 앞의 둘은 **둘 다 있거나 둘 다 없어야 한다.** 하나만 채우면 앱이 시작 시점에 실패한다(반쯤 설정된 상태가 제일 위험하다)
- 둘 다 비우면 앱은 **데모 모드**로 동작한다. 목업 데이터로 모든 화면이 그대로 돌아간다
- `DEMO_ACCOUNT_PASSWORD` 에는 `NEXT_PUBLIC_` 을 붙이지 않는다. 붙이면 브라우저 번들에 들어간다

---

## 7. 시연 사이의 되돌리기

실제 DB에서는 **인계가 되돌려지지 않는다.** 그게 맞는 동작이다 — 지울 수 있는 감사 기록은 감사 기록이 아니다. 화면의 「시연 처음으로」 버튼도 이 모드에서는 사라진다.

그런데 시연은 여러 사람이 돌아가며 본다. 심사위원 한 명이 인계를 실행하면 다음 사람은 완료된 화면만 보게 된다. 그래서 되돌리기를 **제품 기능이 아니라 운영자가 SQL로 하는 일**로 분리했다.

시연 사이사이에 SQL Editor에서 두 개를 차례로 돌린다.

```
supabase/seed/reset-demo.sql   업무 관련 자료만 비운다 (사람·부서·계정은 그대로)
supabase/seed/demo.sql         다시 채운다
```

> 인계자가 적어 둔 보충(`handover_note`)도 함께 비워진다. 되돌리기가 `handover` 를
> `cascade` 로 지우기 때문이고, 그래서 그 파일에 표 이름을 따로 적지 않았다.

1차예선 심사가 8/20 15:00이니, 그 직전에 한 번 돌려 두면 첫 화면이 깨끗하다.

---

## 8. 확인

연결한 뒤 이 순서로 본다.

1. `select * from app.security_audit;` → 0행
2. Advisors → Security Advisor → 경고 없음
3. 배포 주소에서 데모 계정 입장 → 업무 보드에 18건 중 **볼 수 있는 것만** 나오는지
4. 계정 전환 → 다른 계정에서 **보이는 업무가 달라지는지**
5. 업무 상세 → 이력 탭에 다섯 달치 기록이 있는지
6. 인계·인수 → 확인 → 실행 → 주담당이 실제로 바뀌는지
7. 창 두 개로 같은 업무를 열고 한쪽에서 항목 편집 → **다른 쪽이 저절로 따라오는지**
   (`npm run test:realtime` 이 이걸 자동으로 한다)

4번이 되면 RLS가 실제로 동작한다는 뜻이다. 발표에서 그대로 보여 줄 수 있는 장면이기도 하다.

---

## 애플리케이션 코드

환경변수만 채우면 자동으로 바뀐다. 코드에서 따로 할 일은 없다.

```
src/lib/data/index.ts   화면이 부르는 유일한 창구. 환경변수를 보고 아래 둘 중 하나에 위임한다
src/lib/data/db.ts      Supabase 구현. 권한은 RLS가 강제한다
src/lib/data/mock.ts    목업 구현. 설정이 없을 때
```

목업을 지우지 않고 남겨 둔 이유가 둘 있다.

1. DB가 멎어도 화면을 보여 줄 수 있다. 심사 당일에 이게 보험이 된다
2. 실제 공문서가 들어갈 경로가 없는 상태를 유지할 수 있다

`db.ts` 에는 열람 권한을 검사하는 코드가 **없다.** 필요가 없어서가 아니라 DB가 이미
하고 있어서다. 여기서 한 번 더 거르면 규칙이 두 벌이 되고, 두 벌은 반드시 어긋난다.
어긋나는 순간 느슨한 쪽이 사고가 된다.

### 목업과 달라지는 것

| | 목업 | Supabase |
|---|---|---|
| 로그인 | 쿠키에 계정 id | 실제 세션 발급(`signInWithPassword`) |
| 권한 | 코드가 흉내 | **RLS가 강제** |
| 상태 변경·대화 | 브라우저 쿠키 | 실제 저장, 이력은 트리거가 남김 |
| 인계 실행 | 쿠키 표시만 바뀜 | `execute_handover()` 로 **권한이 실제로 이동** |
| 「시연 처음으로」 | 있음 | **없음** — 인계는 되돌릴 수 없고 그 사실이 이력에 남는다 |

### 아직 실제 DB로 확인하지 못한 것

이 코드는 목업 모드에서만 끝까지 돌려 봤다. 실제 프로젝트에 붙인 뒤
아래 두 가지를 먼저 확인할 것.

- **관계 이름** — 조인 별칭이 외래키 이름과 맞는지. 틀리면 목록 화면이
  `PGRST200` 류의 오류로 뜬다
- **`execute_handover` 호출** — 인계 실행 버튼이 실제로 주담당을 바꾸는지
