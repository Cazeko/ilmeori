"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * 좁은 화면의 서랍을 **손으로 끌어 닫는다.**
 *
 * 이 앱에서 손짓이 개입하는 자리는 이 서랍 하나다. 그래서 apple-design 스킬이
 * 말하는 직접 조작의 원칙을 여기에만, 전부 쓴다.
 *
 *   1:1 추적      손가락이 움직인 만큼만 서랍이 움직인다. 끌기가 시작되는 순간의
 *                 자리를 기준으로 삼아 잡은 지점을 지킨다(튀지 않는다).
 *   중단 가능     움직이는 도중에 손이 닿으면 **지금 그려진 자리**에서 멈춰 손
 *                 아래에 붙든다. 끌지 않고 떼면 멈췄던 길을 마저 간다.
 *   속도 이어받기 손을 뗀 순간의 속도가 스프링의 초기 속도다. 안 넘기면 손이
 *                 떨어진 자리에서 한 번 멈췄다 다시 출발한다.
 *   속도로 판정   닫힐지 되돌아갈지는 위치가 아니라 **손을 뗀 방향**이 정한다.
 *                 느리게 뗐거나 멈췄다 뗐을 때만 관성 투사(어디까지 갔을까)로.
 *   고무줄        열린 자리보다 더 오른쪽으로 당기면 점점 덜 따라온다. 딱 멈추면
 *                 「얼었다」로 읽힌다.
 *   스프링        임계 감쇠(감쇠비 1.0 · 응답 0.3초). 되튐이 없다 — 이 서랍은
 *                 던지는 것이 아니라 밀어 닫는 것이다. 수치 적분이 아니라
 *                 닫힌 해로 계산한다 — 프레임이 20fps 로 떨어져도 발산하지 않는다.
 *
 * 스크립트가 없으면 아무 일도 없다. 서랍은 <details> 라 여전히 여닫힌다.
 * 세로 손짓과 두 손가락 확대는 브라우저에 준다(panel 의 touch-action:
 * pan-y pinch-zoom) — 메뉴를 스크롤하거나 키우는 손가락을 뺏지 않는다.
 * 움직임을 줄여 달라는 설정에서는 끌기는 그대로 되고, 손을 뗀 뒤의 스프링만
 * 없다(그 자리에서 바로 닫히거나 되돌아간다).
 *
 * 닫는 길은 이 훅이 돌려주는 close 하나다. ✕·덮개·Esc·화면 이동이 전부 이것을
 * 부른다 — 끌던 도중의 칠(transform·opacity)과 손짓 상태를 같이 지워야 하는데,
 * 그 규약이 네 자리에 흩어져 있으면 하나는 반드시 빠진다.
 */

/** 이 아래는 「누른 것」이지 「끈 것」이 아니다. 링크를 누르는 손가락은 흔들린다. */
const THRESHOLD = 10;
/** 이보다 빠르면 방향이 답이다(px/s). 그보다 느리면 어디까지 갔을지를 본다. */
const DECISIVE = 150;
/** 손을 뗀 순간에서 이만큼 안의 이동으로 속도를 잰다. 그보다 오래 멈춰 있었으면 0 이다. */
const VELOCITY_WINDOW = 100;
/** 임계 감쇠 스프링. 응답 0.3초 — 서랍·시트에 애플이 쓰는 값. */
const RESPONSE = 0.3;
/** 관성 투사의 감속률. 보통 스크롤의 손맛. */
const DECELERATION = 0.998;

function project(velocity: number, d = DECELERATION) {
  return ((velocity / 1000) * d) / (1 - d);
}

function rubberband(overshoot: number, dimension: number, c = 0.55) {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

export function useDrawerDrag(ref: RefObject<HTMLDetailsElement | null>) {
  /** 효과 안의 「손짓 상태를 버리고 칠을 지운다」. 효과가 없으면 null. */
  const resetRef = useRef<(() => void) | null>(null);

  const close = useCallback(
    (opts?: { focus?: boolean }) => {
      const details = ref.current;
      if (!details) return;
      resetRef.current?.();
      details.open = false;
      if (opts?.focus) details.querySelector<HTMLElement>("summary")?.focus();
    },
    [ref],
  );

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const panel = details.querySelector<HTMLElement>("[data-drawer-panel]");
    const scrim = details.querySelector<HTMLElement>("[data-drawer-scrim]");
    if (!panel || !scrim) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    /** 지금 화면에 그려진 값(px, 0 = 열림, -폭 = 닫힘). 모든 움직임은 여기서 출발한다. */
    let x = 0;
    let velocity = 0;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    /** 끌기가 시작된 순간의 기준. 손가락 이동량을 여기에 더한다. */
    let grabbedAt = 0;
    let dragging = false;
    let gaveUp = false;
    /** 손이 닿아 멈춘 움직임의 목적지. 끌지 않고 떼면 여기로 마저 간다. */
    let pausedTarget: number | null = null;
    /** 손이 닿았을 때 서랍이 움직이고 있었나. 그렇다면 그 손짓은 「멈춤」이지 「누름」이 아니다. */
    let caughtMoving = false;
    const history: Array<{ t: number; x: number }> = [];
    let raf = 0;
    let springTarget: number | null = null;
    let suppressClick = false;

    const width = () => panel.offsetWidth || 1;

    const paint = () => {
      panel.style.transform = x === 0 ? "" : `translateX(${x}px)`;
      // 덮개는 서랍이 닫힌 만큼 옅어진다 — 한 손짓에 두 층이 같은 프레임에 답한다.
      scrim.style.opacity = String(Math.max(0, Math.min(1, 1 + x / width())));
    };
    const clearPaint = () => {
      panel.style.transform = "";
      panel.style.willChange = "";
      panel.style.userSelect = "";
      scrim.style.opacity = "";
      scrim.style.pointerEvents = "";
      x = 0;
      velocity = 0;
    };
    const stopSpring = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      springTarget = null;
    };
    const dropPointer = () => {
      if (pointerId !== null && panel.hasPointerCapture(pointerId)) {
        panel.releasePointerCapture(pointerId);
      }
      pointerId = null;
      dragging = false;
      gaveUp = false;
      pausedTarget = null;
      caughtMoving = false;
    };
    /** 손짓 상태를 버리고 칠을 지운다. 닫는 길(close)이 부른다. */
    const reset = () => {
      stopSpring();
      dropPointer();
      clearPaint();
    };
    resetRef.current = reset;

    const closeNow = () => {
      details.open = false;
      clearPaint();
    };

    /**
     * 들어오는 애니메이션(CSS) 도중이면 그 자리에서 이어받는다. 자리는 계산된
     * translate 가 아니라 실제 사각형에서 읽는다 — 키프레임이 %로 적혀 있어
     * 계산값도 「-31.2%」로 오고, 그걸 px 로 읽으면 자릿수가 틀린다.
     * 판은 left-0 fixed 라 사각형의 left 가 곧 지금의 이동량이다.
     */
    const takeOverPresentation = () => {
      // 자리를 옮기는 애니메이션(drawer-in)만 붙잡는다. 움직임을 줄인 환경의
      // 크로스페이드는 자리가 그대로라 붙잡을 것이 없고, 붙잡았다고 치면
      // 그 위의 첫 탭이 「멈춤」으로 오해되어 삼켜진다.
      const running = panel
        .getAnimations()
        .filter((a) => (a as CSSAnimation).animationName === "ilm-drawer-in");
      if (running.length === 0) return false;
      const left = panel.getBoundingClientRect().left;
      for (const a of running) a.cancel();
      for (const a of scrim.getAnimations()) a.cancel();
      x = Number.isFinite(left) ? Math.min(0, left) : 0;
      velocity = 0;
      paint();
      return true;
    };

    /**
     * 임계 감쇠 스프링의 닫힌 해.
     *   x(t) = target + (A + B·t)·e^(−ωt),  A = x₀ − target,  B = v₀ + ω·A
     * 지금 값(x)과 지금 속도(velocity)에서 출발하므로 끊긴 자리에서 이어지고,
     * 시간의 함수라 프레임이 드문드문 와도 같은 궤적을 그린다.
     */
    const settle = (to: number, done?: () => void) => {
      stopSpring();
      if (reduce.matches) {
        x = to;
        velocity = 0;
        paint();
        done?.();
        return;
      }
      // 닫히러 가는 동안 덮개는 손짓을 막지 않는다. 막으면 서랍이 사라지는
      // 300ms 동안 화면에 한 탭이 죽는다 — 사용자는 이미 서랍을 치웠다고 알고
      // 다음 것을 누른다. 판은 그대로 잡힌다(중단 가능).
      scrim.style.pointerEvents = to < 0 ? "none" : "";
      const omega = (2 * Math.PI) / RESPONSE;
      const A = x - to;
      const B = velocity + omega * A;
      const t0 = performance.now();
      springTarget = to;
      const step = (now: number) => {
        if (springTarget !== to) return;
        const t = Math.max(0, (now - t0) / 1000);
        const decay = Math.exp(-omega * t);
        x = to + (A + B * t) * decay;
        velocity = (B - omega * (A + B * t)) * decay;
        if (Math.abs(x - to) < 0.5 && Math.abs(velocity) < 20) {
          x = to;
          velocity = 0;
          paint();
          raf = 0;
          springTarget = null;
          done?.();
          return;
        }
        paint();
        raf = window.requestAnimationFrame(step);
      };
      raf = window.requestAnimationFrame(step);
    };

    /** 멈춰 세웠던 움직임을 마저 간다(끌지 않고 뗐을 때). */
    const resume = () => {
      const to = pausedTarget;
      pausedTarget = null;
      if (to === null) return;
      if (to < 0) settle(to, closeNow);
      else settle(0, clearPaint);
    };

    const onDown = (e: PointerEvent) => {
      // 두 번째 손가락은 끼어들지 못한다. 첫 손가락이 다 끝내고 나서다.
      if (!details.open || e.button !== 0 || !e.isPrimary || pointerId !== null) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dragging = false;
      gaveUp = false;
      history.length = 0;
      history.push({ t: e.timeStamp, x: e.clientX });
      // 손이 닿는 순간 진행 중인 움직임은 손 아래에 멈춘다. 어디로 가던
      // 길이었는지는 기억해 둔다 — 끌지 않고 떼면 그리로 마저 간다.
      pausedTarget = springTarget;
      stopSpring();
      velocity = 0;
      if (takeOverPresentation()) pausedTarget = 0;
      caughtMoving = pausedTarget !== null;
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId || gaveUp) return;
      // 단추 없이 움직이는 마우스는 끌기가 아니다 — 판 밖에서 놓았다가
      // 돌아온 경우다. 놓은 것으로 친다.
      if (e.pointerType === "mouse" && e.buttons === 0) {
        finish(e, true);
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        // 첫 10px 로 뜻을 읽는다. 세로면 스크롤이다 — 손을 뗀다.
        if (Math.abs(dy) > Math.abs(dx)) {
          gaveUp = true;
          return;
        }
        dragging = true;
        pausedTarget = null;
        panel.setPointerCapture(e.pointerId);
        panel.style.willChange = "transform";
        panel.style.userSelect = "none";
        // 지금 그려진 자리에서 이어받는다. 문턱까지 온 10px 를 기준에서 빼야
        // 끌기가 시작되는 순간 서랍이 튀지 않는다.
        grabbedAt = x - dx;
      }
      history.push({ t: e.timeStamp, x: e.clientX });
      while (history.length > 8) history.shift();
      const raw = grabbedAt + dx;
      // 열린 자리(0)보다 오른쪽은 고무줄이다.
      x = raw > 0 ? rubberband(raw, width()) : raw;
      paint();
      e.preventDefault();
    };

    /** 손을 뗐다(cancelled = 브라우저가 가져갔거나 단추 없이 돌아왔다). */
    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (pointerId !== e.pointerId) return;
      const wasDragging = dragging;
      const wasCaught = caughtMoving;
      const paused = pausedTarget;
      const releasedAt = e.timeStamp;
      dropPointer();
      pausedTarget = paused;
      if (!details.open) {
        clearPaint();
        return;
      }
      if (!wasDragging) {
        // 누르기만 했다. 움직이던 것을 붙잡은 손짓이었다면 그 탭은 「멈춤」이
        // 전부다 — 손 아래 링크가 눌리면 안 된다(iOS 가 움직이는 화면을 잡은
        // 탭을 삼키는 것과 같다). 그리고 멈춰 세운 길을 마저 보낸다.
        if (wasCaught) swallowNextClick();
        resume();
        return;
      }
      // 끈 뒤에 오는 click 은 끈 것이지 누른 것이 아니다(아래 onClick).
      swallowNextClick();

      if (cancelled) {
        velocity = 0;
        settle(0, clearPaint);
        return;
      }

      // 손을 뗀 순간의 속도 — 뗀 시각에서 100ms 안의 이동으로 잰다. 그 안에
      // 이동이 없으면 멈췄다 뗀 것이고, 멈춘 손의 속도는 0 이다.
      const recent = history.filter((h) => releasedAt - h.t <= VELOCITY_WINDOW);
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = Math.max(1, last.t - first.t);
        velocity = ((last.x - first.x) / dt) * 1000;
      } else {
        velocity = 0;
      }

      const w = width();
      const shouldClose =
        Math.abs(velocity) >= DECISIVE
          ? velocity < 0
          : x + project(velocity) < -w / 2;
      if (shouldClose) settle(-w, closeNow);
      else settle(0, clearPaint);
    };
    const swallowNextClick = () => {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    };
    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    /**
     * 끌고 난 뒤 손을 뗀 자리의 링크가 눌리면 안 된다 — 끈 것이지 누른 것이
     * 아니다. document 의 capture 단계에서 막는다: 화면 이동 표시
     * (use-nav-pending.ts)도 같은 자리에서 듣고 defaultPrevented 를 보므로,
     * 이 훅이 그보다 **먼저** 등록되어야 한다(app-shell.tsx 의 훅 순서).
     * 손가락(touch)에서는 click 이 잡은 요소가 아니라 원래 링크로 가기 때문에
     * 판에서 막는 것으로는 늦다.
     */
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
    };

    // 마우스로 링크를 끌면 브라우저가 **링크 자체를** 드래그하기 시작하고,
    // 그 순간 pointercancel 이 와서 우리 끌기가 끊긴다. 서랍 안에서 끌 것은
    // 서랍뿐이다. 글자가 골라지는 것도 같은 이유로 막는다(userSelect).
    const onDragStart = (e: DragEvent) => {
      if (pointerId !== null) e.preventDefault();
    };

    // 다른 경로로 닫혔을 때(✕·Esc·화면 이동) 손짓과 칠을 같이 버린다.
    const onToggle = () => {
      if (!details.open) reset();
    };

    panel.addEventListener("pointerdown", onDown);
    panel.addEventListener("pointermove", onMove);
    // 뗀 자리가 판 밖일 수 있다(문턱 전에는 capture 가 없다). 창에서 듣는다.
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    document.addEventListener("click", onClick, true);
    panel.addEventListener("dragstart", onDragStart);
    details.addEventListener("toggle", onToggle);
    return () => {
      reset();
      resetRef.current = null;
      panel.removeEventListener("pointerdown", onDown);
      panel.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("click", onClick, true);
      panel.removeEventListener("dragstart", onDragStart);
      details.removeEventListener("toggle", onToggle);
    };
  }, [ref]);

  return close;
}
