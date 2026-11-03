"use client";

import { X, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./GolfTripHome.module.css";

/**
 * Shared presentation for Info Add and New Game popups. `slideUp` (Itinerary / My travel, owner request 2026-11-02): instead
 * of a white card in the middle, a maroon sheet that slides up from the bottom in the date / time picker's style (title,
 * gold accents, tap outside or X to close).
 */
export function GolfTripActionSheet({ label, onClose, actions = [], onAction, children, className, style, slideUp = false }: {
  label: string;
  onClose: () => void;
  actions?: { label: string; icon: LucideIcon; pressed?: boolean }[];
  onAction?: (label: string) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  slideUp?: boolean;
}) {
  return <div className={`${styles.addSheetOverlay} ${slideUp ? styles.slideOverlay : ""}`} role="dialog" aria-modal="true" aria-label={label}
    onClick={slideUp ? (event) => { if (event.target === event.currentTarget) onClose(); } : undefined}>
    <div className={`${styles.addSheet} ${slideUp ? styles.slideSheet : ""} ${className ?? ""}`} style={style}>
      <button type="button" className={styles.sheetClose} aria-label="Close add sheet" onClick={onClose}><X size={slideUp ? 20 : 18} strokeWidth={2.25} aria-hidden /></button>
      {slideUp && actions.length > 0 && <h2 className={styles.slideTitle}>{label}</h2>}
      {actions.length > 0 && <div className={styles.sheetActionList}>
        {actions.map(({ label: actionLabel, icon: Icon, pressed }) => <button key={actionLabel} type="button" className={styles.sheetActionRow} aria-pressed={pressed} onClick={() => onAction?.(actionLabel)}>
          <span className={styles.sheetActionIcon}><Icon size={18} strokeWidth={2} aria-hidden /></span>
          <span className={styles.sheetActionText}>{actionLabel}</span>
        </button>)}
      </div>}
      {children}
    </div>
  </div>;
}
