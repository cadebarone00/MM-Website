"use client";

import { DateRangePicker } from "./DateRangePicker";
import styles from "./CreateTournament.module.css";

/** Trip Basics: Start Date + End Date picked together in one calendar (owner request 2026-11-02); form names startDate / endDate. */
export function TripDatesField() {
  return <DateRangePicker startName="startDate" endName="endDate" startLabel="Start Date" endLabel="End Date" required className={styles.input}
    fields={(startInput, endInput) => <div className={styles.fieldRow}>
      <label className={styles.field}><span className={styles.fieldLabel}>Start Date</span>{startInput}</label>
      <label className={styles.field}><span className={styles.fieldLabel}>End Date</span>{endInput}</label>
    </div>} />;
}
