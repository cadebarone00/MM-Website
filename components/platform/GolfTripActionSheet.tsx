"use client";

import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./GolfTripHome.module.css";

/** Shared presentation for Info Add and New Game popups. */
export function GolfTripActionSheet({ label, onClose, actions, onAction, children }: {
  label: string;
  onClose: () => void;
  actions: { label: string; icon: LucideIcon; pressed?: boolean }[];
  onAction: (label: string) => void;
  children?: ReactNode;
}) {
  return <div className={styles.addSheetOverlay} role="dialog" aria-modal="true" aria-label={label}>
    <div className={styles.addSheet}>
      <button type="button" className={styles.sheetClose} aria-label="Close add sheet" onClick={onClose}><X size={18} strokeWidth={2.25} aria-hidden /></button>
      <div className={styles.sheetActionList}>
        {actions.map(({ label: actionLabel, icon: Icon, pressed }) => <button key={actionLabel} type="button" className={styles.sheetActionRow} aria-pressed={pressed} onClick={() => onAction(actionLabel)}>
          <span className={styles.sheetActionIcon}><Icon size={18} strokeWidth={2} aria-hidden /></span>
          <span className={styles.sheetActionText}>{actionLabel}</span>
        </button>)}
      </div>
      {children}
    </div>
  </div>;
}
