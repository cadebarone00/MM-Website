"use client";

import { ChevronLeft, Search } from "lucide-react";
import styles from "./Search.module.css";

/**
 * The standard search bar (owner request 2026-11-22): Back · rounded search box · Cancel (only while something is typed).
 * Every search screen uses it so they all look like Friends search. Put it inside `styles.top` so it stays put on scroll.
 */
export function SearchBar({ value, onChange, onBack, placeholder = "Search", label, maxLength = 60, autoFocus = false }: {
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  placeholder?: string;
  /** What screen readers hear for the box. */
  label: string;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  return <div className={styles.bar}>
    <button type="button" className={styles.back} aria-label="Back" onClick={onBack}><ChevronLeft size={28} aria-hidden="true" /></button>
    <label className={styles.field}>
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input type="search" placeholder={placeholder} value={value} maxLength={maxLength} autoComplete="off" autoCapitalize="none" autoCorrect="off"
        spellCheck={false} enterKeyHint="search" autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </label>
    {value && <button type="button" className={styles.cancel} onClick={() => onChange("")}>Cancel</button>}
  </div>;
}
