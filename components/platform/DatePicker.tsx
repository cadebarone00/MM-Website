"use client";

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { GolfTripDatePicker } from "./GolfTripDatePicker";

/** Calendar field with the same ISO form value and constraints as a native date input. */
export function DatePicker({ value, defaultValue = "", onChange, min, max, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue"> & {
  value?: string; defaultValue?: string;
}) {
  const [local, setLocal] = useState(String(defaultValue));
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = value ?? local;
  useEffect(() => {
    const outside = current && ((min && current < String(min)) || (max && current > String(max)));
    input.current?.setCustomValidity(outside ? "Select a date within the allowed range." : "");
  }, [current, min, max]);
  const label = String(props["aria-label"] || "Date");
  const close = () => { setOpen(false); input.current?.focus(); };
  const change = (date: string) => {
    setLocal(date);
    if (input.current) {
      input.current.value = date;
      onChange?.({ target: input.current, currentTarget: input.current } as ChangeEvent<HTMLInputElement>);
    }
  };
  return <>
    <input {...props} ref={input} type="text" inputMode="none" value={current} placeholder={props.placeholder || "Select date"}
      aria-haspopup="dialog" onChange={() => {}} onClick={() => setOpen(true)} onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(true); }
        else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); change(""); }
        else if (event.key !== "Tab") event.preventDefault();
      }} />
    {open && !props.disabled && createPortal(<GolfTripDatePicker singleDay label={label} arrival={current} departure={current}
      min={min === undefined ? undefined : String(min)} max={max === undefined ? undefined : String(max)} maxDays={1} onClose={close}
      onSubmit={date => {
        change(date);
        close();
      }} />, document.body)}
  </>;
}
