/**
 * 데이터 층 계약 시험 — 배치 조회가 낱개 조회와 **같은 답**을 하는가.
 *
 * 왜 필요한가.
 *
 * `src/lib/data/index.ts` 는 「두 구현의 서명은 같다. 어긋나면 타입 검사에서
 * 걸린다」고 적어 두었다. 맞는 말이지만 타입이 잡는 것은 **모양**뿐이다.
 * 인계 초안의 왕복을 줄이려고 gatherForWorks(표마다 한 번)를 넣으면서,
 * 타입은 그대로인 채 동작만 갈릴 수 있는 자리가 여럿 생겼다.
 *
 *   · 정렬 방향     이력·첨부는 최신순, 대화는 오간 순
 *   · 지운 대화     deleted_at 이 있는 것은 빼야 한다
 *   · 데모 상태     목업은 쿠키에 쌓인 대화를 합쳐 준다
 *   · 문서 한 판    업무당 첫 한 판만 쓴다(created_at 순)
 *   · 키 집합       요청한 id 는 전부 키로 돌아온다. uuid 모양이 아닌 것만 빠진다
 *
 * 이 중 하나라도 어긋나면 인계서에 실리는 근거가 조용히 달라진다. 공문서라
 * 「조용히」가 제일 나쁘다. 그래서 배치와 낱개를 나란히 돌려 못박는다.
 *
 * 여기서 시험하는 것은 **목업 구현**이다. Supabase 구현의 같은 축은
 * supabase/rls.test.mjs 가 실제 DB에 붙어서 본다.
 *
 * 돌리는 법
 *   npm run test:data-contract
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

const mock = await import("../src/lib/data/mock.ts");
const { works } = await import("../src/lib/mock/works.ts");

let pass = 0;
const fails = [];

function ok(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function same(name, a, b) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  ok(name, ja === jb, ja === jb ? "" : `\n      배치: ${ja?.slice(0, 200)}\n      낱개: ${jb?.slice(0, 200)}`);
}

const ids = works.map((w) => w.id);

console.log("\n배치 조회가 낱개 조회와 같은 답을 하는가");

const batch = await mock.gatherForWorks(ids);

for (const id of ids) {
  const got = batch.get(id);
  const [doc, activities, attachments, comments] = await Promise.all([
    mock.getWorkDocument(id),
    mock.getActivities(id),
    mock.getAttachments(id),
    mock.getComments(id),
  ]);

  same(`${id.slice(0, 8)} 문서`, got.document, doc.document);
  same(`${id.slice(0, 8)} 문서 항목`, got.sections, doc.sections);
  same(`${id.slice(0, 8)} 이력`, got.activities, activities);
  same(`${id.slice(0, 8)} 첨부`, got.attachments, attachments);
  same(`${id.slice(0, 8)} 대화`, got.comments, comments);
}

console.log("\n키 집합");

ok("요청한 업무는 전부 키로 돌아온다", ids.every((id) => batch.has(id)));
ok("요청하지 않은 키는 없다", batch.size === new Set(ids).size);

const weird = await mock.gatherForWorks(["not-a-uuid", "", ids[0]]);
ok("uuid 모양이 아닌 id 는 키에 없다", !weird.has("not-a-uuid") && !weird.has(""));
ok("섞여 있어도 멀쩡한 id 는 살아 있다", weird.has(ids[0]));

const upper = await mock.gatherForWorks([ids[0].toUpperCase()]);
ok("대문자 uuid 도 소문자 키로 돌아온다", upper.has(ids[0]));

const dup = await mock.gatherForWorks([ids[0], ids[0], ids[0]]);
ok("같은 id 를 여러 번 넣어도 키는 하나다", dup.size === 1);

const none = await mock.gatherForWorks([]);
ok("빈 목록은 빈 결과다", none.size === 0);

console.log(`\n${pass}개 통과 · ${fails.length}개 실패`);
if (fails.length > 0) {
  console.log("\n실패한 것:");
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("전체 통과");
