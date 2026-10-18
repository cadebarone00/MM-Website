"use client";
import styles from "./GolfTripSettingsPreview.module.css";
export type MatchDraftTiming = { rankMinutes?: number; putForwardMinutes?: number; responseMinutes?: number };
export function MatchDraftTimingFields({type,value,onChange}:{type: string | null;value:MatchDraftTiming;onChange:(change:MatchDraftTiming)=>void}) {
 const fields: [keyof MatchDraftTiming,string][] = type==="Ranks" ? [["rankMinutes","Time to set ranks (minutes)"]] : type==="Response" ? [["putForwardMinutes","Time to put forward (minutes)"],["responseMinutes","Time to respond (minutes)"]] : [];
 return <>{fields.map(([key,label])=><label key={key} className={styles.totalPlayers}><span className={styles.typeHeading}>{label}</span><input className={styles.draftInput} type="number" min={1} max={120} step={1} aria-label={label} value={value[key]??10} onChange={event=>{const minutes=Number(event.target.value);if(Number.isInteger(minutes)&&minutes>=1&&minutes<=120)onChange({[key]:minutes});}}/></label>)}</>;
}
