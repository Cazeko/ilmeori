"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { AtSign } from "lucide-react";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";

/**
 * 대화 입력칸 + 사람 부르기.
 *
 * ── 부르는 방법은 둘, 저장되는 것은 하나 ───────────────────────────────────
 *
 * `@` 자동완성은 카카오톡이 쓰는 그 모양이고 사람들이 이미 안다. 그런데
 * **스크립트가 있어야만 뜬다.** 이 앱은 스크립트 없이 전부 도는 것이 전제이고
 * `tests/browser.test.mjs` 가 그것을 지킨다. 둘 중 하나를 고르는 대신 합친다.
 *
 *   스크립트 없을 때  「부를 사람」이 참여자 체크박스로 그려진다. @ 없이도 부른다
 *   스크립트 있을 때  그 줄이 칩으로 접히고, @ 를 치면 목록이 뜬다.
 *                     고르면 본문에 `@이름` 이 박히고 **동시에 체크가 켜진다**
 *
 * 폼이 서버로 보내는 값은 두 경우가 **같다**(`mention=<profileId>` 여러 개).
 * 서버 코드는 한 갈래이고 시험도 한 벌이다.
 *
 * ── 칩 줄을 눈에 보이게 남기는 이유 ────────────────────────────────────────
 *
 * 본문에 `@박준호` 라고 **손으로 타이핑만** 하면 목록에서 고른 것이 아니라
 * 아무도 안 불린다. 그 사실이 화면에 안 보이면 **조용히 실패**한다 —
 * 알림 기능에서 제일 나쁜 고장이다. 칩 줄이 있으면 「안 걸렸구나」가 즉시 보인다.
 *
 * ── z 층을 만들지 않는다 ───────────────────────────────────────────────────
 *
 * 목록은 `position: absolute` 이고 z 값이 없다. 위치잡은 요소는 위치 안 잡은
 * 형제보다 나중에 그려지므로, 아래의 칩 줄·단추 위에 저절로 얹힌다.
 * z-index 규약은 다섯이고(globals.css) 여기 맞는 층이 없어서 하나 만들 뻔했는데,
 * 만들 필요가 없었다.
 */

/** 성을 뗀 이름. 아바타와 같은 규칙이라 화면에서 같은 사람으로 읽힌다. */
function given(name: string) {
  return name.length >= 3 ? name.slice(1) : name;
}

/**
 * 스크립트가 붙었는가 — 서버에서는 false, 하이드레이션 뒤에는 true.
 *
 * `useEffect(() => setState(true))` 로도 되지만 그것은 마운트마다 한 번씩
 * 덤 렌더를 만들고 `react-hooks/set-state-in-effect` 가 잡는다.
 * `useSyncExternalStore` 는 서버 스냅숏을 따로 받으므로 그 자리를 위해 있는
 * 물건이다. 구독은 아무 일도 하지 않는다 — 이 값은 한 번 켜지면 안 바뀐다.
 */
const NEVER_CHANGES = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );

export function MentionBox({
  id,
  name = "body",
  label,
  hint,
  maxLength,
  placeholder,
  people,
}: {
  id: string;
  name?: string;
  label: string;
  hint?: string;
  maxLength: number;
  placeholder?: string;
  /** 부를 수 있는 사람 = 이 업무의 참여자(나는 뺀다). 0020 의 정책과 같은 범위. */
  people: Profile[];
}) {
  const listId = useId();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  /**
   * 하이드레이션이 끝났는가.
   *
   * 서버가 그린 첫 HTML 은 **체크박스가 전부 보이는 상태**여야 한다 — 스크립트가
   * 오지 않는 브라우저에서 그것이 유일한 부르는 수단이기 때문이다. 마운트 뒤에만
   * 칩으로 접는다. 처음부터 접어 두면 스크립트가 죽은 순간 부를 길이 사라진다.
   */
  const ready = useHydrated();

  const matches =
    query === null
      ? []
      : people.filter((p) => query === "" || p.name.includes(query) || given(p.name).includes(query));

  function toggle(profileId: string) {
    setPicked((prev) =>
      prev.includes(profileId)
        ? prev.filter((x) => x !== profileId)
        : [...prev, profileId],
    );
  }

  /** 캐럿 바로 앞이 `@…` 인가. 맞으면 그 꼬리를 검색어로 쓴다. */
  function readQuery(el: HTMLTextAreaElement) {
    const upto = el.value.slice(0, el.selectionStart ?? 0);
    const m = /@([^\s@]{0,20})$/.exec(upto);
    return m ? m[1] : null;
  }

  function pick(p: Profile) {
    const el = boxRef.current;
    if (el) {
      const at = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, at).replace(/@[^\s@]{0,20}$/, "");
      const after = el.value.slice(at);
      const inserted = `@${p.name} `;
      el.value = before + inserted + after;
      const caret = before.length + inserted.length;
      el.setSelectionRange(caret, caret);
      el.focus();
    }
    // 본문의 글자는 사람이 읽는 것이고, 실제로 부르는 것은 이 목록이다.
    setPicked((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    setQuery(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(matches[cursor] ?? matches[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
    }
  }

  const open = query !== null && matches.length > 0;

  return (
    <div>
      <div className="relative">
        <Field id={id} label={label} hint={hint}>
          {(p) => (
            <Textarea
              {...p}
              ref={boxRef}
              name={name}
              maxLength={maxLength}
              placeholder={placeholder}
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                open ? `${listId}-${cursor}` : undefined
              }
              onChange={(e) => {
                setQuery(readQuery(e.currentTarget));
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setQuery(null)}
            />
          )}
        </Field>

        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="부를 사람 고르기"
            /* 아래로 연다. 위로 열면 방금 읽던 **대화를 가린다** — 부르려는
               사람이 누구인지는 대개 그 대화를 보고 정한다. 아래에 있는 것은
               칩 줄과 단추뿐이고, 칩 줄은 지금 고치고 있는 그것이다.
               폭은 이름 길이에 맞춘다. 입력칸 폭(800px)을 그대로 쓰면 세 줄짜리
               목록이 화면을 가로지른다. */
            className="absolute top-full left-0 mt-1 max-h-56 w-72 overflow-y-auto rounded-sm border border-rule-frame bg-surface"
          >
            {matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === cursor}
                  // blur 가 먼저 돌면 목록이 닫혀 클릭이 허공으로 간다.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 px-3 text-left text-body-sm",
                    i === cursor ? "bg-primary-5 text-primary" : "text-gray-80",
                  )}
                >
                  <span className="font-bold">{p.name}</span>
                  {p.position ? (
                    <span className="text-gray-60">{p.position}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ── 부를 사람 — 여기가 진실이다 ─────────────────────────────────── */}
      <fieldset className="mt-3">
        {/* 「— 본문에 @ 를 치면 목록이 뜹니다」가 붙어 있었다. 그 사실은 실제로
            @ 를 쳐 본 사람에게 즉시 드러나고, 안 쳐 본 사람은 아래 체크박스로
            이미 부를 수 있다. 어느 쪽에게도 필요하지 않은 줄이었다. */}
        <legend className="mb-2 flex items-center gap-1 text-body-xs font-bold text-gray-70">
          <AtSign aria-hidden className="size-3.5 text-gray-40" />
          부를 사람
        </legend>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => {
            const on = picked.includes(p.id);
            // 스크립트가 붙은 뒤에는 **고른 사람만** 남긴다. 참여자가 열 명이면
            // 체크박스 열 개가 입력칸보다 커진다.
            if (ready && !on) return null;
            return (
              <label
                key={p.id}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-3 text-body-sm transition-colors duration-150",
                  on
                    ? "border-accent-text bg-accent-bg font-bold text-accent-text"
                    : "border-rule-frame bg-surface text-gray-70 hover:bg-gray-5",
                )}
              >
                <input
                  type="checkbox"
                  name="mention"
                  value={p.id}
                  checked={on}
                  onChange={() => toggle(p.id)}
                  className="size-4 accent-primary"
                />
                {p.name}
                {p.position ? (
                  <span className="font-normal text-gray-60">{p.position}</span>
                ) : null}
              </label>
            );
          })}
          {/* 「아무도 부르지 않았습니다. 부르면 그 사람에게 알림이 갑니다.」가
              여기 있었다. 아무도 안 골랐을 때 칩이 없는 것이 곧 그 말이라,
              빈 자리에 그 사실을 글로 또 적고 있었다. 칩 줄이 비어 있는 것으로
              족하다 — 이 줄이 있는 이유(조용한 실패를 막는 것)는 그대로다. */}
        </div>
      </fieldset>
    </div>
  );
}
