"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { golfTripDraftSnapshot, parseGolfTripDraft, plannedRounds } from "@/lib/platform/golfTripDraft";
import { FORMAT_NAMES } from "@/lib/platform/savedTripSetup";
import { presetById } from "@/lib/platform/tripFormatPresets";
import { SetupStepForm } from "../SetupStepForm";
import styles from "./TripFormatsStep.module.css";

const subscribeNever = () => () => {};
/** The Maroon picture (owner's photo). Until it's saved at public/images/the-maroon.jpg, a same-size placeholder shows. */
const MAROON_PHOTO: string | null = null;

/**
 * Trip Builder → Formats (only when competing). Top to bottom: a picture titled "The Maroon", The Maroon Style with
 * its tag, then the picks — Both (The Maroon Style setup), Individual and Team side by side, Create Your Own (a format
 * per round, or Decide later). Cards never change size when picked.
 */
export function TripFormatsStep() {
  const draft = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const roundCount = useMemo(() => plannedRounds(parseGolfTripDraft(draft)).length, [draft]);
  const [pick, setPick] = useState<string>("");
  const maroon = presetById("maroon")!;
  const [individual, team] = [presetById("individual")!, presetById("team")!];

  const card = (id: string, label: string, blurb: string, wide = false) =>
    <label className={`${styles.card} ${wide ? styles.wide : ""} ${pick === id ? styles.picked : ""}`}>
      <input type="radio" className={styles.radio} name="formatPreset" value={id} required checked={pick === id} onChange={() => setPick(id)} />
      <span className={styles.cardTitle}>{label}</span>
      <span className={styles.cardBlurb}>{blurb}</span>
    </label>;

  return <SetupStepForm step="format" skip={{ formatPreset: "" }} complete={pick !== ""}>
    <div className={styles.scroll}>
      <figure className={styles.photo}>
        {MAROON_PHOTO
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={MAROON_PHOTO} alt="The Maroon" className={styles.photoImage} />
          : <div className={styles.photoPlaceholder} aria-hidden="true"><MaroonMark className={styles.photoMark} /></div>}
        <figcaption className={styles.photoTitle}>The Maroon</figcaption>
      </figure>

      <div className={styles.style}>
        <h2 className={styles.styleTitle}>The Maroon Style</h2>
        <p className={styles.tag}>{maroon.tag}</p>
      </div>

      <div className={styles.picks} role="radiogroup" aria-label="Pick a format">
        {card("maroon", maroon.label, maroon.blurb, true)}
        <div className={styles.pair}>
          {card("individual", individual.label, individual.blurb)}
          {card("team", team.label, team.blurb)}
        </div>
        {card("custom", "Create Your Own", "Mix and match a format for each round.", true)}
      </div>

      {pick === "custom" && <div className={styles.custom}>
        {roundCount === 0 && <p className={styles.note}>No rounds yet. You can pick formats in Settings once rounds are added.</p>}
        {Array.from({ length: roundCount }, (_, index) => <label key={index} className={styles.roundRow}>
          <span>Round {index + 1}</span>
          <select name={`round${index + 1}Format`} className={styles.select} defaultValue="">
            <option value="">Decide later</option>
            {FORMAT_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>)}
      </div>}
    </div>
  </SetupStepForm>;
}

