"use client";

import { useEffect, useRef, useState } from "react";
import { fitPhones } from "@/lib/dev/sim/studio/grid";
import styles from "./SimulatorConsole.module.css";

export type GridPhone = { person: string; name: string; role: string; src: string; reloadKey: string };

/** Only phones, scaled to fit the area with no scrolling. Name and role sit under each phone; Reload is a small icon there. */
export function PhoneGrid({ phones, active, frames, onReload }: {
  phones: GridPhone[]; active: string | null; frames: React.MutableRefObject<Record<string, HTMLIFrameElement | null>>; onReload: (person: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      // An unmeasured box reports 0 (or NaN); wait for a real size instead of squashing the phones to nothing.
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) setArea({ width, height }); // keep the last good size otherwise
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = area ? fitPhones(phones.length, area) : null;
  const gap = 16;
  return (
    <div ref={box} className={styles.phoneArea}>
      {fit && fit.columns > 0 && (
        <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${fit.columns}, ${fit.frame.width}px)`, gap }}>
          {phones.map((p) => (
            <figure key={p.person} className={styles.phoneCell} style={{ width: fit.frame.width }}>
              <div className={styles.screen} style={{ width: fit.frame.width, height: fit.frame.height }}>
                <iframe
                  key={p.reloadKey}
                  ref={(el) => { frames.current[p.person] = el; }}
                  className={styles.frame}
                  style={{ transform: `scale(${fit.scale})` }}
                  title={`${p.name} phone`}
                  src={p.src}
                />
              </div>
              <figcaption className={`${styles.strip} ${active === p.person ? styles.stripOn : ""}`}>
                <strong>{p.name}</strong><span>{p.role}</span>
                <button type="button" className={styles.icon} aria-label={`Reload ${p.name}'s phone`} title="Reload this phone" onClick={() => onReload(p.person)}>{"↻"}</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
