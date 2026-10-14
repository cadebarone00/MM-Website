"use client";
import { BETS, BET_CATEGORIES, betAllowed } from "@/lib/platform/predictBets";
import { savePredictSettings as saveDevicePredictSettings, usePredictSettings, type PredictSettings } from "@/lib/platform/predictSetting";
import { useSavedTripSetup } from "./SavedTripSetupProvider";
import notificationStyles from "./GolfTripNotifications.module.css";
import toggleStyles from "./GolfTripCompetition.module.css";
import styles from "./GolfTripPredict.module.css";

/**
 * Organizer settings → Predict: the prediction market On / Off (Off hides Golf → Predict for everyone), then every bet
 * by tab with its own switch. Team bets are greyed out when the trip has no team competition.
 */
export function GolfTripPredictSettings({ teamEvent }: { teamEvent: boolean }) {
  const settings = usePredictSettings();
  const savedSetup = useSavedTripSetup();
  const savePredictSettings = (next: PredictSettings) => savedSetup ? savedSetup.write("predictSettings", next) : saveDevicePredictSettings(next);
  const toggle = (on: boolean, label: string, onClick: () => void, disabled = false) =>
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={toggleStyles.toggle} onClick={onClick}>
      <span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span><span>{on ? "On" : "Off"}</span>
    </button>;
  return <div className={styles.settings}>
    <section className={notificationStyles.category} aria-label="Prediction market">
      <h2 className={notificationStyles.categoryTitle}>Prediction market</h2>
      <p className={styles.settingsNote}>Players predict with Maroon Coins: a play-only balance for this trip. No money changes hands, and coins can&apos;t be bought or cashed out.</p>
    </section>
    {BET_CATEGORIES.map((category) => <section key={category} className={`${notificationStyles.category} ${settings.on ? "" : styles.settingsDimmed}`} aria-label={`${category} bets`}>
      <h2 className={notificationStyles.categoryTitle}>{category}</h2>
      {BETS.filter((bet) => bet.category === category).map((bet) => {
        const allowed = betAllowed(bet.id, teamEvent);
        const on = allowed && !settings.off.includes(bet.id);
        return <div key={bet.id} className={`${notificationStyles.row} ${allowed ? "" : styles.settingsGreyed}`}>
          <span className={notificationStyles.label}>{bet.title}<small className={styles.settingsBlurb}>{allowed ? bet.blurb : "Needs a team competition"}</small></span>
          {toggle(on, bet.title, () => savePredictSettings({ ...settings, off: on ? [...settings.off, bet.id] : settings.off.filter((id) => id !== bet.id) }), !allowed || !settings.on)}
        </div>;
      })}
    </section>)}
  </div>;
}
