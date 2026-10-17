"use client";

import { useEffect } from "react";

/** One document-wide lock, including nested and portal-mounted pull-ups. */
export function ModalScrollLock() {
  useEffect(() => {
    const selector = 'dialog[open], [role="dialog"], [role="alertdialog"], [data-scroll-modal="true"]';
    const style = document.createElement("style");
    style.textContent = "html,body{overflow:hidden!important;overscroll-behavior:none!important}";
    let active: HTMLElement | undefined;
    let touch: { x: number; y: number } | undefined;
    const sync = () => {
      const panels = [...document.querySelectorAll<HTMLElement>(selector)].filter(panel =>
        !(panel instanceof HTMLDialogElement && !panel.open) &&
        !panel.closest('[hidden], [inert], [aria-hidden="true"]') && panel.getClientRects().length > 0 &&
        getComputedStyle(panel).visibility !== "hidden");
      // Native modal dialogs occupy the browser top layer, above ordinary overlays.
      const native = panels.filter(panel => panel.matches(":modal")).at(-1);
      active = native ? panels.filter(panel => native.contains(panel)).at(-1) : panels.at(-1);
      if (active && !style.isConnected) document.head.append(style);
      if (!active && style.isConnected) style.remove();
    };
    const canScroll = (target: EventTarget | null, dx: number, dy: number) => {
      if (!active || !(target instanceof Element) || !active.contains(target)) return false;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      for (let node: Element | null = target; node; node = node.parentElement) {
        const css = getComputedStyle(node);
        const overflow = horizontal ? css.overflowX : css.overflowY;
        const position = horizontal ? node.scrollLeft : node.scrollTop;
        const maximum = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
        const delta = horizontal ? dx : dy;
        if (/(auto|scroll)/.test(overflow) && maximum > 1 &&
          (delta < 0 ? position > 0 : delta > 0 && position < maximum - 1)) return true;
        if (node === active) break;
      }
      return false;
    };
    const wheel = (event: WheelEvent) => {
      if (active && !event.ctrlKey && !canScroll(event.target, event.deltaX, event.deltaY)) event.preventDefault();
    };
    const start = (event: TouchEvent) => {
      const point = event.touches[0];
      touch = point ? { x: point.clientX, y: point.clientY } : undefined;
    };
    const move = (event: TouchEvent) => {
      const point = event.touches[0];
      if (!point || !touch || event.touches.length !== 1) return;
      const dx = touch.x - point.clientX, dy = touch.y - point.clientY;
      touch = { x: point.clientX, y: point.clientY };
      if (active && !canScroll(event.target, dx, dy) && event.cancelable) event.preventDefault();
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["open", "hidden", "inert", "aria-hidden", "role", "data-scroll-modal", "class", "style", "aria-modal"] });
    document.addEventListener("wheel", wheel, { passive: false, capture: true });
    document.addEventListener("touchstart", start, { passive: true, capture: true });
    document.addEventListener("touchmove", move, { passive: false, capture: true });
    sync();
    return () => {
      observer.disconnect();
      style.remove();
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("touchstart", start, true);
      document.removeEventListener("touchmove", move, true);
    };
  }, []);
  return null;
}
