import type { NoteThread, NoteWithPeople, Profile } from "@/lib/types";

/**
 * 쪽지의 규칙 — db 구현과 목업이 **같은 함수**를 쓴다.
 *
 * 실을 묶는 일은 저장소가 아니라 뜻의 문제다. 두 곳에 따로 적으면 목업에서는
 * 맞고 실물에서는 어긋나는 날이 오고, 그건 화면을 봐도 안 보인다
 * (`approval.ts` 가 같은 이유로 있다).
 */

/** 쪽지 한 통에서 **보는 사람 기준의 상대**를 고른다. */
export function counterpartOf(note: NoteWithPeople, viewerId: string): Profile {
  if (note.author.id === viewerId) return note.recipient;
  if (note.recipient.id === viewerId) return note.author;
  // 제3자(업무를 읽을 수 있는 사람)가 보는 경우다. 그 화면에서 궁금한 것은
  // 「바깥의 누구에게 물었나」이므로 받은 쪽을 준다.
  return note.recipient;
}

/**
 * 쪽지 여러 통을 실로 묶는다.
 *
 * 정렬은 두 겹이다 — 실 안은 **오래된 것부터**(대화는 위에서 아래로 읽는다),
 * 실끼리는 **최근 것부터**(안 본 것이 위로 온다).
 *
 * @param notes    RLS 를 통과해 온 쪽지들. 순서는 상관없다
 * @param viewerId 보는 사람. 안 읽은 수와 상대를 여기서 정한다
 */
export function groupThreads(
  notes: NoteWithPeople[],
  viewerId: string,
  titleOf: (workId: string) => string,
): NoteThread[] {
  const byThread = new Map<string, NoteWithPeople[]>();
  for (const n of notes) {
    const bucket = byThread.get(n.thread_id);
    if (bucket) bucket.push(n);
    else byThread.set(n.thread_id, [n]);
  }

  const threads: NoteThread[] = [];
  for (const [thread_id, bucket] of byThread) {
    bucket.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const root = bucket[0];
    threads.push({
      thread_id,
      work: { id: root.work_id, title: titleOf(root.work_id) },
      counterpart: counterpartOf(root, viewerId),
      notes: bucket,
      // 「안 읽음」은 **나에게 온 것**에만 있다. 내가 보낸 쪽지의 read_at 은
      // 상대가 읽었는지를 말하는 값이지 내가 읽을 것이 아니다.
      unread: bucket.filter((n) => n.recipient_id === viewerId && !n.read_at)
        .length,
      last_at: bucket[bucket.length - 1].created_at,
    });
  }

  return threads.sort((a, b) => b.last_at.localeCompare(a.last_at));
}

/** 쪽지함 배지에 쓰는 수 — 실이 아니라 **통**을 센다. */
export function unreadCount(threads: NoteThread[]): number {
  return threads.reduce((n, t) => n + t.unread, 0);
}

/**
 * 쪽지함이 한 번에 읽는 통 수. 결재함(100건)과 같은 규약이고 **화면이 그 사실을
 * 적는다** — 「말하지 않는 상한은 「전부 다 봤다」로 읽힌다」(approvals/page.tsx).
 *
 * 실 하나를 펴 볼 때는 이 값을 안 쓴다. 화면 상한이 데이터 접근 규칙 노릇을 하면
 * 100통을 넘는 순간 오래된 실이 404 가 된다(getNoteThread 주석).
 */
export const NOTE_LIMIT = 100;
