"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import styles from "./AppSelect.module.css";

type OptionProps = { value?: string | number; disabled?: boolean; hidden?: boolean; children?: ReactNode };
type Choice = { value: string; label: ReactNode; disabled: boolean };
/** What a native <select>'s onChange gives (`event.target.value`), so screens switch over by renaming the tag. */
export type AppSelectChange = { target: { value: string; name: string }; currentTarget: { value: string; name: string } };

/** The <option>s inside, however they're written (a list, a map, fragments). Hidden options aren't offered. */
function choicesFrom(children: ReactNode): Choice[] {
  const out: Choice[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<OptionProps & { children?: ReactNode }>;
    if (el.type === "option") {
      if (!el.props.hidden) out.push({ value: String(el.props.value ?? (typeof el.props.children === "string" ? el.props.children : "")), label: el.props.children, disabled: Boolean(el.props.disabled) });
    } else if (el.props.children) out.push(...choicesFrom(el.props.children));
  });
  return out;
}

/**
 * The app's dropdown, used in place of the browser's own <select> (which looks different on every device). Same inputs
 * as <select> — value / defaultValue, onChange (event.target.value), name, disabled, aria-label, className and <option>
 * children — so a screen switches by renaming the tag and keeps its own button styling. Tapping it slides a sheet up
 * from the bottom with big rows and a check on the current choice, like an iPhone app.
 * With `name` (a form field) a real <select> sits underneath, unseen, kept in step both ways: forms read it (FormData,
 * required, checkValidity), a choice here fires its input / change events, and a value a page puts into it (e.g. the
 * trip builder refilling a saved draft) shows here.
 */
export function AppSelect({ value, defaultValue, onChange, name, disabled = false, required, id, className, style, title, children, ...aria }: {
  value?: string | number; defaultValue?: string | number; onChange?: (event: AppSelectChange) => void; name?: string; disabled?: boolean;
  required?: boolean; id?: string; className?: string; style?: CSSProperties; title?: string; children?: ReactNode;
  "aria-label"?: string; "aria-labelledby"?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false";
}) {
  const choices = choicesFrom(children);
  const [own, setOwn] = useState(String(defaultValue ?? choices.find((c) => !c.disabled)?.value ?? ""));
  const current = value !== undefined ? String(value) : own;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const titleId = useId();
  const shown = choices.find((c) => c.value === current) ?? choices[0];

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    // The current choice gets focus, so the keyboard starts there.
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-app-select="${titleId}"] [aria-selected="true"]`)?.focus(), 0);
    return () => document.removeEventListener("keydown", escape);
  }, [open, titleId]);

  // A value put into the form field by the page (draft refill, autofill) shows here too.
  useEffect(() => {
    const field = native.current;
    if (!field || value !== undefined) return;
    const follow = () => setOwn(field.value);
    field.addEventListener("input", follow); field.addEventListener("change", follow);
    return () => { field.removeEventListener("input", follow); field.removeEventListener("change", follow); };
  }, [value]);

  function pick(next: string) {
    setOpen(false);
    button.current?.focus();
    if (next === current) return;
    if (value === undefined) setOwn(next);
    const target = { value: next, name: name ?? "" };
    onChange?.({ target, currentTarget: target });
    // The form field follows, with the events a real choice makes (so the form's own checks and saves run).
    const field = native.current;
    if (field) { field.value = next; field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true })); }
  }

  const heading = aria["aria-label"] ?? title;
  return <>
    <button ref={button} type="button" id={id} className={`${styles.trigger} ${className ?? ""}`} style={style} title={title} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} {...aria} onClick={() => setOpen(true)}>
      <span className={styles.value}>{shown?.label}</span><ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
    </button>
    {name && <select ref={native} name={name} value={current} required={required} disabled={disabled} onChange={() => undefined}
      aria-hidden="true" tabIndex={-1} className={styles.field}>{children}</select>}
    {open && typeof document !== "undefined" && createPortal(
      <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) { setOpen(false); button.current?.focus(); } }}>
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={heading ? titleId : undefined} data-app-select={titleId}>
          {heading && <p id={titleId} className={styles.title}>{heading}</p>}
          <ul className={styles.list} role="listbox" aria-label={heading}>
            {/* A greyed-out blank placeholder ("Move to…", "Choose…") labels the button but isn't a choice. */}
            {choices.filter((c) => !(c.disabled && c.value === "")).map((c) => <li key={c.value}>
              <button type="button" role="option" aria-selected={c.value === current} disabled={c.disabled} className={styles.option} onClick={() => pick(c.value)}>
                <span>{c.label}</span>{c.value === current && <Check size={18} aria-hidden="true" />}
              </button>
            </li>)}
          </ul>
          <button type="button" className={styles.cancel} onClick={() => { setOpen(false); button.current?.focus(); }}>Cancel</button>
        </div>
      </div>, document.body)}
  </>;
}
