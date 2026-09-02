"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

/**
 * 같은 화면 안의 자리로 가는 링크 — 부드럽게, 그리고 **다시 눌러도** 간다.
 *
 * ── 왜 평범한 `<a href="#…">` 가 아닌가 ────────────────────────────────────
 *
 * 주소의 해시가 이미 `#block-1-issues` 인 채로 같은 링크를 다시 누르면
 * 브라우저는 아무 데도 안 간다 — 해시가 안 바뀌었으니 이동할 일이 없다고
 * 본다. 항목으로 갔다가 스크롤로 다른 데를 보다가 같은 항목을 다시 누르는
 * 것은 이 화면에서 제일 흔한 동작이라, 그때 링크가 죽으면 안 된다.
 *
 * 그래서 스크립트가 있을 때는 이동을 직접 한다. 스크립트가 없으면 평범한
 * 링크로 돌아간다(첫 번째 누름은 브라우저가 처리한다).
 *
 * ── 움직임 ─────────────────────────────────────────────────────────────────
 *
 * 처음엔 느리고 가운데서 빨라졌다가 닿을 때 다시 느려진다(ease-in-out).
 * 거리에 비례해 길어지되 0.9초를 넘기지 않는다. 사용자가 그 사이에 휠·터치·
 * 키를 쓰면 즉시 멈춘다 — 화면이 사람과 싸우면 안 된다. 움직임을 줄이라고
 * 한 사용자(prefers-reduced-motion)에게는 바로 옮긴다.
 */
export function AnchorLink({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // 새 탭·가운데 버튼은 브라우저에 맡긴다.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!href.startsWith("#")) return;
    const el = document.getElementById(href.slice(1));
    if (!el) return;
    e.preventDefault();
    scrollToElement(el);
    // 주소는 남긴다 — 새로고침·공유하면 그 자리로 온다. 이력에는 쌓지 않는다.
    history.replaceState(null, "", href);
  };
  return <Link href={href} onClick={handle} {...props} />;
}

/** 요소의 `scroll-margin-top` 을 그대로 존중해서 그 자리로 부드럽게 옮긴다. */
export function scrollToElement(el: HTMLElement) {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const target = Math.max(
    0,
    Math.min(
      el.getBoundingClientRect().top + window.scrollY - margin,
      document.documentElement.scrollHeight - window.innerHeight,
    ),
  );
  const land = () => {
    // 해시 이동처럼 초점도 옮긴다 — 키보드·보조기술 사용자가 어디 왔는지 안다.
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, target);
    land();
    return;
  }
  const start = window.scrollY;
  const dist = target - start;
  if (Math.abs(dist) < 2) {
    land();
    return;
  }
  const duration = Math.min(900, Math.max(320, Math.abs(dist) * 0.3));
  const ease = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let t0: number | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  const opts = { passive: true } as const;
  window.addEventListener("wheel", stop, opts);
  window.addEventListener("touchstart", stop, opts);
  window.addEventListener("keydown", stop, opts);
  const done = () => {
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };
  const step = (now: number) => {
    if (stopped) {
      // 사람이 바퀴·키로 끊었다. 스크롤은 그 자리에 두되 초점은 목표로 옮긴다
      // (preventScroll) — 안 옮기면 초점이 방금 누른 링크에 남는데, 그 링크가
      // 목록과 함께 닫힌 자리(조직도 바로 가기)면 초점이 body 로 떨어진다.
      done();
      land();
      return;
    }
    if (t0 === null) t0 = now;
    const p = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, start + dist * ease(p));
    if (p < 1) requestAnimationFrame(step);
    else {
      done();
      land();
    }
  };
  requestAnimationFrame(step);
}
