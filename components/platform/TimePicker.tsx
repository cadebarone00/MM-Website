"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TeeTimePicker } from "./TeeTimePicker";

/** Single-time fields use the same sheet and wheels as group tee times; values remain HH:MM. */
export function TimePicker({ value, onChange, label = "Time", className, disabled, required }: {
  value: string; onChange: (value: string) => void; label?: string;
  className?: string; disabled?: boolean; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = () => { setOpen(false); input.current?.focus(); };
  const [hour, minute] = value.split(":");
  const display = value ? `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? "AM" : "PM"}` : "";
  return <>
    <input ref={input} type="text" inputMode="none" aria-label={label} aria-haspopup="dialog" className={className}
      disabled={disabled} required={required} value={display} placeholder="Set time" onChange={() => {}}
      onClick={() => setOpen(true)} onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(true); }
        else if (event.key !== "Tab") event.preventDefault();
      }} />
    {open && !disabled && createPortal(<TeeTimePicker singleTime course={label} date="" round={0} value={value ? [value] : undefined}
      onClose={close} onSave={times => { onChange(times[0]); close(); }} />, document.body)}
  </>;
}
