"use client";

import { DatePicker } from "@/components/platform/DatePicker";


import { useState } from "react";
import { TimePicker } from "./TimePicker";

/** Local date-time fields retain their existing YYYY-MM-DDTHH:MM form value. */
export function DateTimePicker({ label, value, defaultValue = "", onChange, name, required, className, invalid }: {
  label: string; value?: string; defaultValue?: string; onChange?: (value: string) => void;
  name?: string; required?: boolean; className?: string; invalid?: boolean;
}) {
  const [local, setLocal] = useState(defaultValue);
  const current = value ?? local;
  const [date = "", time = ""] = current.split("T");
  const change = (nextDate: string, nextTime: string) => {
    const next = nextDate || nextTime ? `${nextDate}T${nextTime}` : "";
    setLocal(next);
    onChange?.(next);
  };
  return <>
    {name && <input type="hidden" name={name} value={date && time ? current : ""} />}
    <DatePicker aria-label={`${label} date`} aria-invalid={invalid} className={className} required={required}
      value={date} onChange={event => change(event.target.value, time)} />
    <TimePicker label={`${label} time`} className={className} required={required} value={time} onChange={next => change(date, next)} />
  </>;
}
