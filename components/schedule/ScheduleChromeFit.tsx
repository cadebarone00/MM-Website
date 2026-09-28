"use client";

import { useEffect } from "react";

/**
 * The schedule screens are full-screen `position: fixed` canvases. On mobile
 * they need to sit between the top chrome (site header + the player/Tiger
 * area switcher, when shown) and the bottom tab bar instead of underneath
 * them. Those bars change height with the safe area and viewport, so this
 * measures them and publishes the gaps as CSS variables the schedule CSS
 * reads (`--schedule-top`, `--schedule-bottom`).
 */
export function ScheduleChromeFit() {
  useEffect(() => {
    const root = document.documentElement;

    function measure() {
      const header = document.querySelector("header");
      const areaNav = document.querySelector("[data-player-area-nav]");
      const tabBar = document.querySelector("[data-mobile-tab-bar]");
      const top = Math.max(header?.getBoundingClientRect().bottom ?? 0, areaNav?.getBoundingClientRect().bottom ?? 0);
      const tabRect = tabBar?.getBoundingClientRect();
      const bottom = tabRect && tabRect.height > 0 ? window.innerHeight - tabRect.top : 0;
      root.style.setProperty("--schedule-top", `${Math.max(0, top)}px`);
      root.style.setProperty("--schedule-bottom", `${Math.max(0, bottom)}px`);
    }

    measure();
    // The area switcher mounts after the account session loads, so watch the body for it appearing.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    document.querySelectorAll("header, [data-player-area-nav], [data-mobile-tab-bar]").forEach((el) => observer.observe(el));
    const mutations = new MutationObserver(() => {
      document.querySelectorAll("[data-player-area-nav]").forEach((el) => observer.observe(el));
      measure();
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--schedule-top");
      root.style.removeProperty("--schedule-bottom");
    };
  }, []);

  return null;
}
