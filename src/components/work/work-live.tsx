"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Users, Wifi, WifiOff } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { josa } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  readWorkTouch,
  touchLabel,
  WORK_TOUCHED,
  workTopic,
  type TouchKind,
} from "@/lib/realtime";
import type { Profile } from "@/lib/types";

/**
 * 실시간 공유 — 남이 고치면 즉시 보이고, 지금 누가 같이 보고 있는지 보인다.
 *
 * ── 이 화면에서 유일하게 자바스크립트가 필요한 자리 ─────────────────────────
 *
 * 이 제품의 화면은 스크립트 없이 전부 돈다. 실시간은 원리상 그럴 수 없으므로
 * **덧붙이는 층**으로만 만든다. 스크립트가 없으면 이 상자는 아예 나타나지 않고,
 * 나머지 화면은 지금까지와 똑같이 동작한다. 새로고침하면 최신 상태가 나온다.
 * (인쇄 버튼과 같은 판단이다 — components/handover/print-button.tsx)
 *
 * ── 신호는 화면을 그리지 않는다 ─────────────────────────────────────────────
 *
 * 웹소켓으로 오는 것은 "이 업무에서 무언가 바뀌었다"는 한 줄뿐이다. 제목도 본문도
 * 이름도 실려 오지 않는다. 그 한 줄을 받으면 router.refresh() 로 **서버에 다시
 * 묻는다.** 그래서 화면에 나타나는 것은 언제나 RLS 를 통과한 데이터이고,
 * 지연·잠금 만료 같은 파생 상태도 서버 시계로 계산된 값 그대로다.
 *
 * 페이로드를 그대로 화면에 병합하는 방식이었다면, 권한 판정과 시각 계산이
 * 브라우저로 내려온다. 이 제품에서 그건 기능이 아니라 결함이다.
 *
 * ── 편집 중에는 화면을 가로채지 않는다 ──────────────────────────────────────
 *
 * 문서 항목을 쓰고 있는 사람의 화면을 남의 변경으로 갈아 끼우지 않는다.
 * 대신 "새 변경 2건"이라고 알리고, 누를지는 그 사람이 정한다.
 */

/** 구독할 외부 상태가 없다. 해지 함수만 돌려주고 아무것도 하지 않는다. */
const noSubscribe = () => () => {};

/** 신호가 몰아칠 때 화면을 매번 다시 부르지 않는다. */
const COALESCE_MS = 400;

type Link = "connecting" | "live" | "lost";

export function WorkLive({
  workId,
  viewerId,
  people,
  editing,
  serverAt,
}: {
  workId: string;
  /**
   * 보고 있는 사람의 id 하나만 받는다.
   *
   * Profile 을 통째로 넘기면 그 값이 그대로 페이지 원본(HTML)에 실린다 —
   * 이 컴포넌트에 필요한 것은 「내 변경인가」와 「접속자 목록에서 나」를 가리는
   * id 뿐인데, 이메일·소속·계정 종류까지 함께 나간다.
   */
  viewerId: string;
  /**
   * 이름을 그릴 수 있는 사람들 — 서버가 준 참여자 목록이다.
   *
   * **이 목록에는 화면에 그릴 세 칸만 담아 보내야 한다.** 서버 컴포넌트에서
   * 클라이언트로 넘기는 값은 타입이 아니라 값 그대로 HTML 에 실려 나간다.
   * Profile 을 통째로 넘기면 이메일까지 페이지 원본에 박힌다.
   *
   * ── 접속자 표시는 자기 신고값이다 ──────────────────────────────────────
   *
   * 누가 접속했는지는 각자의 브라우저가 알린다. 이름은 서버가 준 이 목록에서만
   * 찾지만, **어느 이름을 고를지(presence key)도 브라우저가 정한다.** 남의 uuid 를
   * 키로 넣으면 그 사람이 접속한 것처럼 그려진다. 이 층은 DB 가 보증하지 못한다 —
   * 채널 참가 자격만 RLS 가 판정하고, 그 안에서 무엇을 알리는지는 못 본다.
   * 그래서 이 표시는 **어떤 기록에도 쓰지 않는다.** 열람기록은 서버가 따로 남긴다.
   *
   * 목록에 없는 사람(부서 공개로 들어온 다른 직원)은 수로만 센다.
   */
  people: Array<Pick<Profile, "id" | "name" | "position">>;
  /** 문서 항목 편집칸이 열려 있는가. 열려 있으면 화면을 자동으로 바꾸지 않는다. */
  editing: boolean;
  /**
   * 이 화면을 서버가 그린 시각.
   *
   * 값이 바뀌었다는 것은 화면이 새 데이터로 갈렸다는 뜻이다 — 내가 저장해서든,
   * 탭을 옮겨서든, 실시간 갱신이든. 쌓아 둔 변경을 지우는 유일하게 정직한 기준이다.
   * (이게 없으면, 내가 저장해 화면이 이미 최신이 된 뒤에도 「쓰고 있는 내용을
   *  지키기 위해 화면을 그대로 두었습니다」라는 배너가 계속 남는다)
   */
  serverAt: string;
}) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true, // 브라우저 — 스크립트가 돌고 있다
    () => false, // 서버에서 그릴 때 — 아무것도 내보내지 않는다
  );

  const router = useRouter();
  const [link, setLink] = useState<Link>("connecting");
  const [present, setPresent] = useState<string[]>([]);
  const [pending, setPending] = useState<TouchKind[]>([]);
  // 화면을 저절로 갈아 끼웠을 때 읽어 줄 말. 같은 갈래가 연달아 오면 문자열이
  // 그대로라 보조기술이 다시 읽지 않으므로, 순번을 함께 들고 다닌다.
  const [notice, setNotice] = useState<{ text: string; seq: number } | null>(null);
  const seq = useRef(0);

  // 구독은 업무가 바뀔 때만 다시 맺는다. 그 안에서 읽어야 하는 값들은 ref 로 넘긴다.
  // (editing 이 바뀔 때마다 채널을 다시 맺으면 접속자 표시가 깜빡인다)
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  // 화면이 새 데이터로 갈렸으면 쌓아 둔 변경은 이미 반영된 것이다.
  // (내가 저장해서 화면이 최신이 된 뒤에도 배너가 남아 있으면, 화면이 사실과
  //  다른 말을 하는 것이 된다)
  //
  // 효과가 아니라 렌더 중에 맞춘다. React 가 「프롭이 바뀔 때 상태를 조정하는」
  // 방식으로 권하는 형태이고, 효과로 하면 렌더가 한 번 더 돌면서 규칙 검사
  // (react-hooks/set-state-in-effect)에도 걸린다. 알림 문구는 지우지 않는다 —
  // 갱신이 끝난 바로 그 순간에 지우면 아무도 못 읽는다.
  const [seenAt, setSeenAt] = useState(serverAt);
  if (seenAt !== serverAt) {
    setSeenAt(serverAt);
    setPending([]);
  }

  const apply = useCallback(
    (kind: TouchKind | null) => {
      const what = touchLabel(kind);
      seq.current += 1;
      setPending([]);
      // 「불러왔습니다」라고 적지 않는다. router.refresh() 는 비동기라
      // 이 시점에는 아직 안 끝났다.
      setNotice({
        text: kind
          ? `다른 사람이 ${what}${josa(what, "을", "를")} 고쳐 화면을 새로 불러오는 중입니다.`
          : "화면을 새로 불러오는 중입니다.",
        seq: seq.current,
      });
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createClient();

    const start = async () => {
      // 세션을 먼저 확정한다.
      //
      // 채널에 실릴 토큰은 subscribe() 를 부르는 **그 순간** 정해진다. 세션이 아직
      // 안 읽힌 상태로 부르면 anon 키가 실려 나가고, 그 채널은 수명이 끝날 때까지
      // 익명으로 남는다(뒤늦게 토큰이 끼어드는 경로가 없다). private 채널이라
      // 익명은 거부되므로, 이 await 하나를 빠뜨리면 실시간이 통째로 죽는다.
      await supabase.auth.getSession();
      if (stopped) return;

      // 리스너는 subscribe() 전에 전부 걸어야 한다. 참가한 뒤에 거는 presence
      // 리스너는 예외로 떨어진다.
      const ch = supabase.channel(workTopic(workId), {
        config: { private: true, presence: { key: viewerId } },
      });

      ch.on("presence", { event: "sync" }, () => {
        setPresent(Object.keys(ch.presenceState()));
      });

      ch.on("broadcast", { event: WORK_TOUCHED }, ({ payload }) => {
        const { kind, actor } = readWorkTouch(payload);
        // 방금 내가 한 변경이다. 저장하고 돌아온 화면을 한 번 더 부를 이유가 없다.
        if (actor && actor === viewerId) return;

        // 편집 중이거나 화면을 보고 있지 않으면 쌓아 두기만 한다.
        if (editingRef.current || document.visibilityState !== "visible") {
          // 갈래를 못 읽은 신호도 한 건으로 센다. 「변경 N건」이 실제보다 작으면
          // 그 자체가 화면의 거짓말이다.
          setPending((q) => [...q, kind ?? "work"]);
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => apply(kind), COALESCE_MS);
      });

      // 끊겼던 적이 있는가. 되살아난 순간 한 번 따라잡아야 한다.
      let wasLost = false;

      ch.subscribe((status, err) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") {
          setLink("live");
          // 접속 사실만 알린다. 이름·직급은 서버가 준 목록에서 찾는다.
          void ch.track({});
          // broadcast 에는 다시 보내 주는 기능이 없다. 끊겨 있던 동안 나간 신호는
          // 영영 오지 않으므로, 여기서 한 번 따라잡지 않으면 「실시간 연결됨」이라고
          // 적힌 채 옛 화면을 보여 주게 된다. 그게 끊긴 것보다 나쁘다.
          if (wasLost) {
            wasLost = false;
            if (editingRef.current) setPending((q) => (q.length ? q : ["work"]));
            else apply(null);
          }
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          wasLost = true;
          setLink("lost");
          setPresent([]);
          // 조용히 죽는 것이 가장 나쁘다. 원인은 개발자 도구에 남긴다.
          if (err) console.warn("[일머리] 실시간 채널:", status, err.message);
        }
      });

      channel = ch;
    };

    void start();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      // unsubscribe() 만으로는 인스턴스가 남아, 같은 이름으로 다시 들어올 때
      // 콜백이 붙지 않은 옛 채널이 돌아온다.
      if (channel) void supabase.removeChannel(channel);
    };
  }, [workId, viewerId, apply]);

  // 화면으로 돌아왔을 때 쌓아 둔 변경을 반영한다.
  // 편집을 끝낸 것만으로는 반영하지 않는다 — 반영할지는 그 사람이 정한다.
  useEffect(() => {
    if (pending.length === 0 || editing) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !editingRef.current) {
        apply(pending[pending.length - 1] ?? null);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pending, editing, apply]);

  if (!hydrated) return null;

  const byId = new Map(people.map((p) => [p.id, p]));
  const others = present.filter((id) => id !== viewerId);
  const named = others.map((id) => byId.get(id)).filter((p) => p !== undefined);
  const unnamed = others.length - named.length;

  // 접속자 문장. 이름은 서버가 준 목록에서만 찾고, 못 찾은 사람은 수로 센다.
  const who = [
    named
      .slice(0, 3)
      .map((p) => `${p.name}${p.position ? ` ${p.position}` : ""}`)
      .join(" · "),
    named.length > 3 ? `외 ${named.length - 3}명` : "",
    unnamed > 0 ? `다른 직원 ${unnamed}명` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const waiting = pending.length;
  const waitingLabel = waiting > 0 ? touchLabel(pending[pending.length - 1] ?? null) : "";

  return (
    <div className="mt-4 print:hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-gray-10 bg-surface px-4 py-2.5">
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-body-xs font-bold",
            link === "live" ? "text-status-done-text" : "text-gray-60",
          )}
        >
          {link === "lost" ? (
            <WifiOff aria-hidden className="size-3.5" />
          ) : (
            <Wifi aria-hidden className="size-3.5" />
          )}
          {link === "live"
            ? "실시간 연결됨"
            : link === "connecting"
              ? "실시간 연결 중"
              : "실시간 연결 끊김"}
        </p>

        {link === "live" ? (
          <p className="inline-flex items-center gap-2 text-body-xs text-gray-70">
            <Users aria-hidden className="size-3.5 shrink-0 text-gray-40" />
            {others.length === 0 ? (
              <span>지금은 나만 보고 있습니다</span>
            ) : (
              <>
                {/* 겹친 아바타는 눈으로 보는 정보다. 읽어 주는 쪽에는 옆 글자가 간다. */}
                <span aria-hidden className="inline-flex items-center">
                  {named.slice(0, 4).map((p) => (
                    <Avatar
                      key={p.id}
                      profile={p}
                      size="sm"
                      className="-ml-1.5 ring-2 ring-surface first:ml-0"
                    />
                  ))}
                </span>
                <span>{`${who}${josa(who, "이", "가")} 함께 보고 있습니다`}</span>
              </>
            )}
          </p>
        ) : link === "lost" ? (
          <p className="text-body-xs text-gray-60">
            새로고침하면 최신 상태를 볼 수 있습니다.
          </p>
        ) : null}
      </div>

      {/* 편집 중에 쌓인 변경. 반영할지는 쓰고 있는 사람이 정한다. */}
      {waiting > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-status-doing/40 bg-status-doing-bg px-4 py-2.5">
          <p className="min-w-0 flex-1 text-body-sm text-gray-80">
            <span className="font-bold">
              다른 사람이 {waitingLabel}
              {josa(waitingLabel, "을", "를")} 고쳤습니다.
            </span>{" "}
            쓰고 있는 내용을 지키기 위해 화면을 그대로 두었습니다
            {waiting > 1 ? ` (변경 ${waiting}건)` : ""}.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => apply(pending[pending.length - 1] ?? null)}
          >
            <RefreshCw aria-hidden className="size-4" />
            지금 반영
          </Button>
        </div>
      ) : null}

      {/* 화면이 저절로 바뀌면, 보지 않는 사람에게는 아무 일도 일어나지 않은 것이 된다.
          라이브 리전은 **항상 그려진 채 내용만 바뀌어야** 읽힌다. 조건부로 나타나는
          위 배너에 role 을 붙이는 것으로는 읽히지 않는 경우가 있어서, 배너가 떠
          있을 때의 말도 여기서 한다. */}
      <p role="status" aria-live="polite" className="sr-only">
        {waiting > 0
          ? `다른 사람이 ${waitingLabel}${josa(waitingLabel, "을", "를")} 고쳤습니다. 쓰고 있는 내용을 지키려고 화면을 그대로 두었습니다. 「지금 반영」 단추를 누르면 반영됩니다. (변경 ${waiting}건)`
          : notice
            ? // 같은 말이 두 번 오면 글자가 그대로라 다시 읽히지 않는다.
              // 보이지도 읽히지도 않는 폭 없는 빈칸을 번갈아 붙여 매번 다르게 만든다.
              `${notice.text}${"\u200b".repeat(notice.seq % 2)}`
            : ""}
      </p>
    </div>
  );
}
