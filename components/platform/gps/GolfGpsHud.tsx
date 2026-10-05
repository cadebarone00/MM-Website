import type { Ref } from "react";
import type { GpsHole } from "@/lib/platform/golfGps/types";
import styles from "./GolfGps.module.css";

type Yards = number | null;

/**
 * The yardage card over the map: hole and par, then Front / Center / Back (Center biggest), the hazards, and the
 * tap-to-measure distance. A dash means there's no player position yet.
 */
export function GolfGpsHud({ hole, front, center, back, hazards, target, notice, ref }: {
  hole: GpsHole;
  front: Yards;
  center: Yards;
  back: Yards;
  hazards: { id: string; label: string; yards: Yards }[];
  /** Yards to the tapped point, or null before the first tap. */
  target: Yards;
  /** One line about GPS (e.g. "Location blocked — using Mock GPS"), or null. */
  notice: string | null;
  /** The card + measure pill, so the map can keep the hole out from under them. */
  ref?: Ref<HTMLDivElement>;
}) {
  const show = (yards: Yards) => yards === null ? "—" : yards.toLocaleString("en-US");
  return <div ref={ref} className={styles.topStack}>
    <section className={styles.hud} aria-label="Yardages">
      <div className={styles.hudHole}>
        <span className={styles.hudHoleNumber}>Hole {hole.number}</span>
        <span className={styles.hudPar}>Par {hole.par}</span>
      </div>
      <dl className={styles.hudYards}>
        <div><dt>Front</dt><dd>{show(front)}<small>YDS</small></dd></div>
        <div className={styles.hudCenter}><dt>Center</dt><dd>{show(center)}<small>YDS</small></dd></div>
        <div><dt>Back</dt><dd>{show(back)}<small>YDS</small></dd></div>
      </dl>
      <ul className={styles.hudHazards} aria-label="Hazards">
        {hazards.map((hazard) => <li key={hazard.id}>{hazard.label} <strong>{show(hazard.yards)}</strong></li>)}
      </ul>
      {notice && <p className={styles.hudNotice} role="status">{notice}</p>}
    </section>
    <div className={styles.measure} aria-live="polite">
      {target === null
        ? <span className={styles.measureHint}>Tap to measure</span>
        : <><span className={styles.measureLabel}>Target</span><strong>{show(target)}</strong><small>YDS</small></>}
    </div>
  </div>;
}
