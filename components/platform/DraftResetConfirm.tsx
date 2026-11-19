"use client";
import { useEffect, useRef } from "react";
import styles from "./TripDraftRoom.module.css";

export function DraftResetConfirm({ onCancel, onReset, busy }: { onCancel: () => void; onReset: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={styles.resetDialog} aria-labelledby="reset-draft-title" onCancel={onCancel}>
    <h2 id="reset-draft-title">Are you sure?</h2><p>This clears the selections. The organizer must start again.</p>
    <div><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" disabled={busy} onClick={onReset}>Yes, reset</button></div>
  </dialog>;
}
