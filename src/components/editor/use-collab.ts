"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { parseRichDoc, type DocComment } from "@/lib/editor/model";
import {
  DOC_CARET,
  DOC_COMMENTS,
  DOC_HELLO,
  DOC_OPS,
  DOC_STATE,
  MAX_OPS_PER_MESSAGE,
  REJOIN_MS,
  docTopic,
  readCaret,
  readOps,
  readSender,
  type Op,
} from "@/lib/editor/wire";
import type { Engine } from "./engine";
import type { BlockRange } from "./dom";

/**
 * 동시 편집 배선.
 *
 * ── 합류 절차 ───────────────────────────────────────────────────────────────
 *
 * 문서를 열면 두 갈래가 있다. 아무도 없으면 **DB 스냅숏에서 결정적으로 씨를
 * 뿌리고**(pos.ts 의 seedPositions), 이미 누가 있으면 **그 사람의 상태를
 * 받아 갈아탄다.** 둘을 섞으면 안 된다 — 먼저 들어온 사람이 아직 저장하지
 * 않은 글이 있으면 DB 스냅숏은 그보다 옛것이기 때문이다.
 *
 *   1. 채널에 들어가 HELLO 를 보낸다
 *   2. JOIN_WAIT 동안 STATE 를 기다린다
 *   3. 오면 갈아타고, 안 오면 내 씨앗이 곧 기준이 된다
 *
 * 이미 자리 잡은 사람은 HELLO 를 들으면 STATE 를 보낸다. 다만 **자기 자리
 * 이름으로 정해지는 만큼 늦게** 보내고, 그 사이 남이 먼저 보낸 것을 보면
 * 그만둔다. 열 명이 있는 방에 한 명이 들어올 때 상태 열 벌이 날아가지 않도록.
 *
 * ⚠ 남은 틈: 두 사람이 **거의 동시에** 열었는데 그 사이 저장이 끼어들면,
 * 둘이 서로 다른 스냅숏에서 씨를 뿌리고 아무도 대답하지 않아 갈릴 수 있다.
 * 씨 뿌리기가 결정적이라 같은 스냅숏이면 반드시 같아지므로, 갈리는 조건은
 * 「1초 안에 둘이 열었고 그 사이에 저장이 있었다」로 좁다. 갈리면 다음 저장과
 * 새로고침에서 맞춰진다. 이 틈을 없애려면 순서를 세워 줄 서버가 필요한데,
 * 그건 이 제품이 지금 지지 않기로 한 짐이다.
 *
 * ── 권한 회수를 5분 안에 반영한다 ───────────────────────────────────────────
 *
 * broadcast 의 권한 판정은 채널에 들어올 때 한 번뿐이다(0012 머리말). 이 채널은
 * 내용을 실어 나르므로 그 한 번으로는 부족하다. REJOIN_MS 마다 나갔다 다시
 * 들어가 판정을 새로 받는다 — 권한이 회수된 사람은 그때 거부된다.
 * 자세한 근거는 src/lib/editor/wire.ts 머리말에 있다.
 */

const JOIN_WAIT_MS = 900;
/** 자판 한 번마다 신호를 보내지 않는다. 이만큼 모아서 한 번. */
const OPS_FLUSH_MS = 60;
/** 커서는 더 자주 보내도 되지만, 그래도 마우스를 끌 때마다는 아니다. */
const CARET_MS = 120;
/**
 * 합류 대답에 실을 수 있는 상태의 크기.
 *
 * broadcast 한계가 기본 256KB 다. 봉투와 base64 여유를 두고 180KB 에서 끊는다.
 */
const STATE_LIMIT = 180 * 1024;

export type Peer = {
  /** 자리(브라우저 탭). presence 의 열쇠다. */
  from: string;
  who: string;
  name: string;
  /** 색 번호. 자리 이름에서 뽑아 늘 같은 색이 되게 한다. */
  tone: number;
  container: string | null;
  at: number;
  to: number | null;
};

export type Link = "off" | "connecting" | "live" | "lost";

/**
 * 커서 색은 넷이다.
 *
 * 여섯이던 때가 있었는데 그중 둘(보라·자홍)이 팔레트 밖 색이라 문서 화면의
 * 색 갈래를 7개까지 밀어 올렸다. 팔레트 안의 넷으로 줄였다 —
 * 이 숫자를 고치려면 editor.css 의 --cursor-* 도 함께 봐야 한다.
 */
export const CURSOR_TONES = 4;

/** 자리 이름 → 색 번호. 같은 사람은 언제나 같은 색이어야 눈이 따라간다. */
function toneOf(site: string): number {
  let h = 0;
  for (let i = 0; i < site.length; i += 1) h = (h * 31 + site.charCodeAt(i)) >>> 0;
  return h % CURSOR_TONES;
}

export function useCollab({
  documentId,
  engine,
  viewerId,
  viewerName,
  enabled,
  isComposing,
  queueWhileComposing,
}: {
  documentId: string;
  engine: Engine;
  viewerId: string;
  viewerName: string;
  enabled: boolean;
  /** 조합 중인가. 조합 중에는 남의 변경을 반영하지 않는다. */
  isComposing: () => boolean;
  /** 조합이 끝나면 부를 일. */
  queueWhileComposing: (fn: () => void) => void;
}) {
  const [link, setLink] = useState<Link>(enabled ? "connecting" : "off");
  const [peerMap, setPeerMap] = useState<Record<string, Peer>>({});

  const chanRef = useRef<RealtimeChannel | null>(null);
  const outbox = useRef<Op[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCaret = useRef<string>("");
  /** 아직 남의 상태를 기다리는 중인가. */
  const joining = useRef(true);
  /**
   * 합류를 기다리는 동안 받은 연산.
   *
   * ⚠ 이것이 없으면 **합류 순간의 편집이 통째로 사라진다.** 순서를 보면:
   *   1. 내가 HELLO 를 보낸다
   *   2. 상대가 대답을 준비하는 사이(80~600ms) 상대가 글자를 친다 → 연산이 온다
   *   3. 그 연산을 반영한다
   *   4. 상대의 STATE 가 도착한다 → `adoptState` 가 판을 **통째로 갈아 끼운다**
   *      → 3에서 반영한 글자가 지워진다
   *
   * 상태는 2 이전의 것이므로, 갈아 끼운 뒤 쌓아 둔 연산을 **다시 먹인다.**
   * 같은 연산을 두 번 먹여도 CRDT 는 같은 자리표를 알아보고 무시하므로 안전하다.
   *
   * 실제로 창 두 개를 붙여 확인하다 잡았다 — 뒤에 들어온 사람 화면에서
   * 앞사람이 그 순간 친 글자만 빠져 있었고, 그 뒤로는 멀쩡히 오갔다.
   */
  const joinBuffer = useRef<Op[]>([]);
  /** 이번 합류에서 이미 STATE 를 보내 준 상대. */
  const answered = useRef<Set<string>>(new Set());

  const site = engine.site;

  // ── 내보내기 ─────────────────────────────────────────────────────────────
  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    const ch = chanRef.current;
    if (!ch) return;
    void ch.send({ type: "broadcast", event, payload: { ...payload, from: site } });
  }, [site]);

  const flushOps = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const queue = outbox.current;
    if (queue.length === 0) return;
    /**
     * ⚠ **보낼 수 있을 때만 비운다.**
     *
     * 예전에는 비우고 나서 보냈다. 그런데 `send` 는 채널이 없으면 조용히
     * 돌아간다 — 문서를 처음 열어 아직 붙기 전, 그리고 5분마다 도는 재합류
     * 중이 그렇다. 그 사이에 친 글자는 큐에서도 지워지고 나가지도 않아
     * **나만 보이는 글**이 됐다. 자동 저장이 그것을 DB 에 쓰므로 새로고침
     * 전까지는 아무도 눈치채지 못한다.
     */
    if (!chanRef.current) return;
    outbox.current = [];
    // 한 번에 다 실으면 페이로드 한계(기본 256KB)를 넘어 **조용히 버려진다.**
    // 붙여넣기 한 번이 수천 연산이 되므로 반드시 나눠 보낸다.
    for (let i = 0; i < queue.length; i += MAX_OPS_PER_MESSAGE) {
      send(DOC_OPS, { ops: queue.slice(i, i + MAX_OPS_PER_MESSAGE) });
    }
  }, [send]);

  // 엔진이 만든 지역 연산을 모았다 내보낸다.
  useEffect(() => {
    if (!enabled) {
      engine.onLocalOps = null;
      return;
    }
    engine.onLocalOps = (ops) => {
      outbox.current.push(...ops);
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(flushOps, OPS_FLUSH_MS);
      }
    };
    return () => {
      engine.onLocalOps = null;
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, [enabled, engine, flushOps]);

  /**
   * 커서 자리를 알린다.
   *
   * 조르기(throttle)에 **뒷단이 있어야 한다.** 예전에는 타이머가 도는 동안
   * 들어온 자리를 그냥 버렸고, `lastCaret` 은 보내기 전에 갱신해서 같은 자리로
   * 다시 불러도 걸렀다. 그래서 커서가 120ms 안에 한 번 더 움직이면 **마지막
   * 자리가 영영 안 갔다** — 남의 화면에서 내 커서가 엉뚱한 데 멈춰 있었다.
   * 마지막 값을 들고 있다가 타이머가 끝날 때 보낸다.
   */
  const pendingCaretMsg = useRef<Record<string, unknown> | null>(null);

  const sendCaret = useCallback(
    (range: BlockRange) => {
      if (!enabled) return;
      const key = `${range.from}:${range.fromAt}:${range.to}:${range.toAt}`;
      if (key === lastCaret.current) return;
      lastCaret.current = key;

      const msg = {
        who: viewerName,
        container: range.from,
        at: range.fromAt,
        to: range.from === range.to && range.toAt !== range.fromAt ? range.toAt : null,
      };
      if (caretTimer.current) {
        pendingCaretMsg.current = msg;
        return;
      }
      send(DOC_CARET, msg);
      caretTimer.current = setTimeout(() => {
        caretTimer.current = null;
        const held = pendingCaretMsg.current;
        pendingCaretMsg.current = null;
        if (held) send(DOC_CARET, held);
      }, CARET_MS);
    },
    [enabled, send, viewerName],
  );

  /**
   * 의견 목록을 알린다.
   *
   * 지운 것의 id 를 **함께** 보낸다. 목록만 보내면 받는 쪽은 「없어진 것」과
   * 「아직 못 받은 것」을 구별할 수 없어서, 지운 의견이 상대 화면에 남아
   * 있다가 상대가 다음 신호를 보내는 순간 **되살아나 DB 에까지 다시 저장됐다.**
   */
  const sendComments = useCallback(
    (comments: DocComment[], gone: string[] = []) => {
      if (!enabled) return;
      send(DOC_COMMENTS, { comments, gone });
    },
    [enabled, send],
  );

  // ── 채널 ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setLink("off");
      return;
    }

    let stopped = false;
    let channel: RealtimeChannel | null = null;
    let rejoin: ReturnType<typeof setTimeout> | null = null;
    let joinTimer: ReturnType<typeof setTimeout> | null = null;
    let answerTimer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createClient();

    /** 조합 중이면 미뤘다가 끝난 뒤에 한다. 조합 중 DOM 을 갈면 글자가 깨진다. */
    const later = (fn: () => void) => {
      if (isComposing()) queueWhileComposing(fn);
      else fn();
    };

    const open = async (first: boolean) => {
      // 세션을 먼저 확정한다. 이 await 하나를 빠뜨리면 anon 키가 실려 나가고
      // private 채널이 거부된다(work-live.tsx 에 같은 주석이 있다).
      await supabase.auth.getSession();
      if (stopped) return;

      const ch = supabase.channel(docTopic(documentId), {
        config: { private: true, presence: { key: site } },
      });

      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<{ who: string; name: string }>();
        setPeerMap((prev) => {
          const next: Record<string, Peer> = {};
          for (const key of Object.keys(state)) {
            if (key === site) continue;
            const meta = state[key][0];
            const had = prev[key];
            next[key] = {
              from: key,
              who: meta?.who ?? "",
              name: meta?.name ?? "다른 사람",
              tone: toneOf(key),
              container: had?.container ?? null,
              at: had?.at ?? 0,
              to: had?.to ?? null,
            };
          }
          return next;
        });
      });

      ch.on("broadcast", { event: DOC_OPS }, ({ payload }) => {
        const from = readSender(payload);
        if (from === site) return; // 내가 보낸 것이 돌아왔다
        const ops = readOps(payload);
        if (!ops.length) return;
        // 합류 중이면 따로 챙겨 둔다(위 joinBuffer 주석).
        if (joining.current) joinBuffer.current.push(...ops);
        later(() => engine.applyRemote(ops));
      });

      ch.on("broadcast", { event: DOC_HELLO }, ({ payload }) => {
        const from = readSender(payload);
        if (!from || from === site) return;
        // 나도 아직 합류 중이면 대답할 자격이 없다.
        if (joining.current) return;
        if (answered.current.has(from)) return;
        // 자리 이름으로 정해지는 만큼 늦게 대답한다. 그 사이 남이 먼저 보내면 그만둔다.
        const delay = 80 + (toneOf(site) * 90);
        answerTimer = setTimeout(() => {
          if (stopped || answered.current.has(from)) return;
          answered.current.add(from);
          const state = engine.exportState();
          /**
           * 너무 크면 보내지 않는다.
           *
           * broadcast 는 페이로드 한계(기본 256KB)를 넘으면 **조용히 버린다.**
           * 그러면 신참은 아무 대답도 못 받은 것으로 알고 자기 씨앗을 기준으로
           * 삼는데, 그 씨앗은 DB 스냅숏에서 온 것이라 지금 편집 중인 판과
           * 다르다 — 그 뒤로 오는 글자가 엉뚱한 자리에 박힌다.
           *
           * 보내지 못하면 아무 대답도 하지 않는다. 신참은 DB 스냅숏으로
           * 시작하고, 아직 저장되지 않은 몇 초치가 그 사람 화면에만 안 보인다.
           * 자동 저장이 2.5초마다 돌므로 그 창은 짧고, **글자가 뒤섞이는 것보다
           * 낫다.** 쪼개 보내려면 순서·재조립이 필요하고 그건 다음 판의 몫이다.
           */
          const size = JSON.stringify(state).length;
          if (size > STATE_LIMIT) {
            console.warn(
              `[일머리] 문서 상태가 커서(${Math.round(size / 1024)}KB) 합류 대답을 보내지 않았습니다.`,
            );
            return;
          }
          send(DOC_STATE, { to: from, state });
        }, delay);
      });

      ch.on("broadcast", { event: DOC_STATE }, ({ payload }) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const from = readSender(payload);
        if (from === site) return;
        // 남에게 간 대답을 들으면 나는 보내지 않는다(같은 방의 다른 신참).
        if (typeof p.to === "string" && p.to !== site) {
          answered.current.add(p.to);
          return;
        }
        if (!joining.current) return;
        later(() => {
          if (!engine.adoptState(p.state)) return;
          // 갈아 끼운 판은 상대가 **대답을 만든 그 시점**의 것이다. 그 뒤에
          // 도착한 연산은 지금 판에 없으므로 다시 먹인다.
          const held = joinBuffer.current;
          joinBuffer.current = [];
          if (held.length) engine.applyRemote(held);
          joining.current = false;
          if (joinTimer) clearTimeout(joinTimer);
        });
      });

      ch.on("broadcast", { event: DOC_CARET }, ({ payload }) => {
        const c = readCaret(payload);
        if (!c || c.from === site) return;
        setPeerMap((prev) => ({
          ...prev,
          [c.from]: {
            from: c.from,
            who: prev[c.from]?.who ?? "",
            name: c.who || prev[c.from]?.name || "다른 사람",
            tone: toneOf(c.from),
            container: c.container,
            at: c.at,
            to: c.to,
          },
        }));
      });

      ch.on("broadcast", { event: DOC_COMMENTS }, ({ payload }) => {
        const from = readSender(payload);
        if (from === site) return;
        const p = (payload ?? {}) as Record<string, unknown>;
        // 의견도 남이 보낸 값이다. 모델의 검사기를 그대로 태워 거른다.
        const clean = parseRichDoc({
          v: 1,
          blocks: engine.getDoc().blocks,
          comments: p.comments,
        });
        const gone = Array.isArray(p.gone)
          ? p.gone.filter((x): x is string => typeof x === "string" && x.length <= 32)
          : [];
        later(() => engine.mergeComments(clean?.comments ?? [], gone));
      });

      ch.subscribe((status, err) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") {
          setLink("live");
          void ch.track({ who: viewerId, name: viewerName });
          answered.current = new Set();
          if (first) {
            joining.current = true;
            send(DOC_HELLO, {});
            joinTimer = setTimeout(() => {
              // 아무도 대답하지 않았다 — 내 씨앗이 기준이 된다.
              // 그동안 받은 연산은 이미 반영해 두었으므로 버리기만 하면 된다.
              joining.current = false;
              joinBuffer.current = [];
            }, JOIN_WAIT_MS);
          } else {
            /**
             * 다시 들어온 것이다 — **남의 상태로 갈아타지 않는다.**
             *
             * 재합류는 권한 판정을 새로 받으려고 5분마다 도는 것이고(wire.ts ②),
             * 끊긴 시간은 한 프레임 남짓이다. 그런데 예전에는 여기서도 HELLO 를
             * 보내고 오는 상태를 `adoptState` 로 통째로 받았다. adoptState 는
             * 합치는 것이 아니라 **바꿔치기**라, 동료가 아직 못 받은 내 글자가
             * 내 화면에서까지 지워지고 되돌리기 이력이 5분마다 비워졌다.
             *
             * 지금은 내 상태를 그대로 들고, 붙자마자 큐에 남은 연산을 내보낸다.
             * 그 짧은 사이에 남이 보낸 것을 놓쳤을 수는 있다 — broadcast 에는
             * 재전송이 없다. 그건 아래 「끊겼다 붙음」과 같은 문제이고, 거기서
             * 사람에게 알린다. **말없이 글을 지우는 것보다 낫다.**
             */
            joining.current = false;
            flushOps();
          }
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // 끊긴 동안 남이 보낸 글자는 영영 오지 않는다(broadcast 에는 재전송이
          // 없다). 조용히 이어 붙이면 두 화면이 서로 다른 문서를 보여 주면서도
          // 「연결됨」이라고 적혀 있게 된다. 그게 끊긴 것보다 나쁘다.
          setLink("lost");
          setPeerMap({});
          if (err) console.warn("[일머리] 문서 채널:", status, err.message);
        }
      });

      channel = ch;
      chanRef.current = ch;
    };

    void open(true);

    // 권한 회수를 반영하려면 주기적으로 판정을 다시 받아야 한다.
    const cycle = () => {
      rejoin = setTimeout(async () => {
        if (stopped) return;
        flushOps();
        const old = channel;
        channel = null;
        chanRef.current = null;
        if (old) await supabase.removeChannel(old);
        if (stopped) return;
        setLink("connecting");
        await open(false);
        cycle();
      }, REJOIN_MS);
    };
    cycle();

    return () => {
      stopped = true;
      if (rejoin) clearTimeout(rejoin);
      if (joinTimer) clearTimeout(joinTimer);
      if (answerTimer) clearTimeout(answerTimer);
      if (caretTimer.current) clearTimeout(caretTimer.current);
      flushOps();
      // unsubscribe 만으로는 인스턴스가 남아, 같은 이름으로 다시 들어올 때
      // 콜백이 붙지 않은 옛 채널이 돌아온다(work-live.tsx 와 같은 함정).
      if (channel) void supabase.removeChannel(channel);
      chanRef.current = null;
    };
  }, [
    documentId,
    enabled,
    engine,
    flushOps,
    isComposing,
    queueWhileComposing,
    send,
    site,
    viewerId,
    viewerName,
  ]);

  const peers = useMemo(() => Object.values(peerMap), [peerMap]);

  return { link, peers, sendCaret, sendComments };
}
