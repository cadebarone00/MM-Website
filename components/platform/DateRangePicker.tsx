"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GolfTripDatePicker } from "./GolfTripDatePicker";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A start + end date pair (arrival / departure, start / end) that picks BOTH in one calendar (owner request 2026-11-02):
 * tapping either box opens the shared range calendar; tap the first day, then the last, then Set fills both boxes.
 * The two boxes keep the same YYYY-MM-DD values a native date input would, so forms (FormData, `name`, `required`) and
 * saved Golf Trip drafts work as before. Controlled (`start` / `end` + `onChange`) or uncontrolled (`startName` /
 * `endName` inside a form). `fields` lays the two boxes out, so each page keeps its own labels and styling.
 */
export function DateRangePicker({ start, end, onChange, startName, endName, startLabel = "Start date", endLabel = "End date",
  min, max, maxDays = 31, required, className, fields }: {
  start?: string; end?: string; onChange?: (start: string, end: string) => void;
  startName?: string; endName?: string; startLabel?: string; endLabel?: string;
  min?: string; max?: string; maxDays?: number; required?: boolean; className?: string;
  fields: (startInput: ReactNode, endInput: ReactNode) => ReactNode;
}) {
  const [local, setLocal] = useState({ start: "", end: "" });
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLInputElement | null>(null);
  const startInput = useRef<HTMLInputElement>(null);
  const endInput = useRef<HTMLInputElement>(null);
  const range = { start: start ?? local.start, end: end ?? local.end };

  const set = (next: { start: string; end: string }) => {
    setLocal(next);
    onChange?.(next.start, next.end);
    // Let the surrounding form re-check (Next lights up once both are filled).
    requestAnimationFrame(() => endInput.current?.form?.dispatchEvent(new Event("input", { bubbles: true })));
  };
  // Outside the allowed range (or end before start): the browser's own form check refuses it.
  useEffect(() => {
    const outside = (iso: string) => !!iso && ((!!min && iso < min) || (!!max && iso > max));
    startInput.current?.setCustomValidity(outside(range.start) ? "Select a date within the allowed range." : "");
    endInput.current?.setCustomValidity(outside(range.end) || (!!range.end && !!range.start && range.end < range.start) ? "The end date must be on or after the start date." : "");
  }, [range.start, range.end, min, max]);

  const close = () => { setOpen(false); opener.current?.focus(); };
  const take = (which: "start" | "end", value: string) => { if (ISO.test(value) || value === "") set({ ...range, [which]: value }); };
  const openFrom = (target: HTMLInputElement) => { opener.current = target; setOpen(true); };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFrom(event.currentTarget); }
    else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); set({ start: "", end: "" }); }
    else if (event.key !== "Tab") event.preventDefault();
  };
  // A saved draft fills these like typing (SetupStepForm): onChange takes any whole date that arrives that way.
  const startBox = <input ref={startInput} type="text" inputMode="none" className={className} name={startName} required={required} value={range.start}
    placeholder="Select date" aria-label={startLabel} aria-haspopup="dialog" onChange={(event) => take("start", event.target.value)}
    onClick={(event) => openFrom(event.currentTarget)} onKeyDown={keys} />;
  const endBox = <input ref={endInput} type="text" inputMode="none" className={className} name={endName} required={required} value={range.end}
    placeholder="Select date" aria-label={endLabel} aria-haspopup="dialog" onChange={(event) => take("end", event.target.value)}
    onClick={(event) => openFrom(event.currentTarget)} onKeyDown={keys} />;

  return <>
    {fields(startBox, endBox)}
    {open && createPortal(<GolfTripDatePicker arrival={range.start} departure={range.end} maxDays={maxDays} min={min} max={max}
      openMonth={(range.start || min || "").slice(0, 7) || undefined} onClose={close}
      onSubmit={(first, last) => { set({ start: first, end: last }); close(); }} />, document.body)}
  </>;
}
