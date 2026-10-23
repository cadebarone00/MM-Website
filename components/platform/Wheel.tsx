"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./Wheel.module.css";

/**
 * A sideways wheel picker (owner request 2026-10-11; used for every slider): swipe and it snaps; the value in the middle,
 * inside the gold frame, is picked. Tap a value to jump to it. `itemWidth` (px, default 64) for longer labels.
 */
export function Wheel({ items, index, onChange, label, itemWidth = 64 }: { items: string[]; index: number; onChange: (index: number) => void; label: string; itemWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null), settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const center = (i: number, smooth: boolean) => {
    const box = ref.current, el = box?.children[i] as HTMLElement | undefined;
    if (box && el) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => { center(index, true); }, [index]);
  useEffect(() => () => clearTimeout(settle.current), []);
  // Once a swipe stops, pick whichever value is in the middle.
  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const box = ref.current;
      if (!box) return;
      const mid = box.scrollLeft + box.clientWidth / 2;
      let best = 0, gap = Infinity;
      Array.from(box.children).forEach((c, i) => { const el = c as HTMLElement, d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < gap) { gap = d; best = i; } });
      if (best !== index) onChange(best);
    }, 90);
  };
  return <div className={styles.wheelWrap} style={{ "--wheel-item": `${itemWidth}px` } as CSSProperties}>
    <div ref={ref} className={styles.wheel} role="listbox" aria-label={label} onScroll={onScroll}>
      {items.map((item, i) => <button key={i} type="button" role="option" aria-selected={i === index} className={styles.wheelItem} onClick={() => onChange(i)}>{item}</button>)}
    </div>
  </div>;
}
