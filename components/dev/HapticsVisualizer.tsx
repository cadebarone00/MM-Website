"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HAPTICS_PREVIEW_CHANNEL, parseHapticsPreview } from "@/lib/dev/hapticsPreview";
import styles from "./HapticsVisualizer.module.css";

export function HapticsVisualizer({ children }: { children: ReactNode }) {
  const phone = useRef<HTMLDivElement>(null);
  const [intensity, setLevel] = useState(0);
  const [last, setLast] = useState("Ready");
  useEffect(() => {
    let animation: Animation | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function show(value: unknown) {
      const pulse = parseHapticsPreview(value);
      if (!pulse) return;
      animation?.cancel();
      clearTimeout(timer);
      setLevel(pulse.intensity);
      setLast(`${pulse.name} · ${pulse.durationMs}ms`);
      if (pulse.intensity > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const tilt = pulse.intensity <= 3 ? pulse.intensity * 0.06 : pulse.intensity <= 6 ? 0.18 + (pulse.intensity - 3) * 0.12 : 0.54 + (pulse.intensity - 6) * 0.16;
        animation = phone.current?.animate([
          { transform: "rotate(0deg)" }, { transform: `rotate(-${tilt}deg)` },
          { transform: `rotate(${tilt}deg)` }, { transform: "rotate(0deg)" },
        ], { duration: 80, iterations: Infinity });
      }
      timer = setTimeout(() => { animation?.cancel(); setLevel(0); }, pulse.durationMs);
    }
    function local(event: Event) { show((event as CustomEvent).detail); }
    function receive(event: MessageEvent) {
      const iframe = phone.current?.querySelector("iframe");
      if (event.origin === window.location.origin && event.source === iframe?.contentWindow && event.data?.channel === HAPTICS_PREVIEW_CHANNEL) show(event.data);
    }
    window.addEventListener(HAPTICS_PREVIEW_CHANNEL, local);
    window.addEventListener("message", receive);
    return () => { animation?.cancel(); clearTimeout(timer); window.removeEventListener(HAPTICS_PREVIEW_CHANNEL, local); window.removeEventListener("message", receive); };
  }, []);
  return <div className={styles.row}>
    <div ref={phone} data-haptics-phone>{children}</div>
    <aside className={styles.meter} aria-label="Haptics visualization">
      <span className={styles.title}>HAPTICS</span>
      <div className={styles.scale} role="meter" aria-label="Haptic level" aria-valuemin={0} aria-valuemax={10} aria-valuenow={intensity}>
        {Array.from({ length: 10 }, (_, index) => 10 - index).map(value => <div key={value} className={styles.tick}><span>{value}</span><i style={{ background: `hsl(${value <= 3 ? 145 - value * 5 : value <= 6 ? 100 - (value - 3) * 15 : 40 - (value - 6) * 10} 65% 48%)`, opacity: intensity >= value ? 1 : 0.15 }} /></div>)}
        <div className={styles.zero}>0</div>
      </div>
      <strong data-haptics-level>{intensity}/10</strong><small title={last}>{last}</small>
    </aside>
  </div>;
}
