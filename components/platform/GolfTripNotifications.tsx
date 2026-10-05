"use client";

import { useState } from "react";
import toggleStyles from "./GolfTripCompetition.module.css";
import styles from "./GolfTripNotifications.module.css";

/** Notification settings by category; laid out like a round's settings (gold labels, On/Off switches). Preview only. */
const CATEGORIES = [
  { name: "Golf", settings: ["Tee time changes", "Scores posted", "Pairings & matches"] },
  { name: "Travel", settings: ["Flight changes", "Arrivals & departures"] },
  { name: "Logistics", settings: ["Lodging updates", "Transportation", "Schedule changes"] },
];

export function GolfTripNotifications() {
  const [off, setOff] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setOff(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return <div className={styles.notifications}>
    <h2 className={styles.title}>Notifications</h2>
    {CATEGORIES.map(category => <section key={category.name} className={styles.category} aria-label={`${category.name} notifications`}>
      <h3 className={styles.categoryTitle}>{category.name}</h3>
      {category.settings.map(setting => {
        const key = `${category.name}:${setting}`, on = !off.has(key);
        return <div key={key} className={styles.row}>
          <span className={styles.label}>{setting}</span>
          <button type="button" role="switch" aria-checked={on} aria-label={`${category.name} · ${setting}`} className={toggleStyles.toggle} onClick={() => toggle(key)}>
            <span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span>
            <span>{on ? "On" : "Off"}</span>
          </button>
        </div>;
      })}
    </section>)}
  </div>;
}
