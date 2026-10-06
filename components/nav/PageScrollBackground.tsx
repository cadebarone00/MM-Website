"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Match the browser canvas to the page surface nearest its visible lower edge. */
export function PageScrollBackground() {
  const pathname = usePathname();
  useEffect(() => {
    let frame = 0;
    const root = document.documentElement;
    function update() {
      frame = 0;
      const width = window.innerWidth;
      let color = "";
      for (let y = window.innerHeight - 2; y > 0 && !color; y -= 24) {
        for (const element of document.elementsFromPoint(width / 2, y)) {
          if (!(element instanceof HTMLElement) || !element.closest(".app-camera-buffer")) continue;
          if (element.matches("header, nav, button, dialog") || element.getBoundingClientRect().width < width * 0.9) continue;
          let floating = false;
          for (let parent: HTMLElement | null = element; parent && parent !== document.body; parent = parent.parentElement) {
            const position = getComputedStyle(parent).position;
            if (position === "fixed" || position === "sticky") { floating = true; break; }
          }
          if (floating) continue;
          const style = getComputedStyle(element);
          // Multi-section gradients finish in their final color at the lower edge.
          const stops = style.backgroundImage.includes("gradient(")
            ? style.backgroundImage.match(/rgba?\([^)]+\)/g) : null;
          const candidate = stops?.at(-1) ?? style.backgroundColor;
          if (candidate !== "transparent" && candidate !== "rgba(0, 0, 0, 0)") {
            color = candidate;
            break;
          }
        }
      }
      if (color) root.style.setProperty("--app-scroll-background", color);
      else root.style.removeProperty("--app-scroll-background");
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    const observer = new MutationObserver(schedule);
    const content = document.querySelector(".app-camera-buffer");
    if (content) observer.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.style.removeProperty("--app-scroll-background");
    };
  }, [pathname]);
  return null;
}
