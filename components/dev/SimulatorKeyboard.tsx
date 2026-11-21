"use client";

import { useEffect, useState } from "react";
import styles from "./SimulatorKeyboard.module.css";

/**
 * DEV ONLY (project_specs.md "Simulator: phone keyboard", 2026-11-20): inside the /dev simulator's phone, tapping any
 * text field slides up a phone keyboard — iOS for the iPhone presets, Android (Gboard-style) for the Pixel ones — at the
 * real height, covering the bottom of the screen like a real phone does, so hidden fields and buttons show up. The layout
 * follows the field (email, number pad, phone pad, search). Keys type into the field; the computer keyboard still works.
 */

type Field = HTMLInputElement | HTMLTextAreaElement;
type Layout = "letters" | "symbols" | "number" | "phone";
const TEXT_TYPES = new Set(["", "text", "search", "email", "password", "tel", "number", "url"]);
const HEIGHT = { ios: 336, android: 312 } as const;

function editable(el: Element | null): Field | null {
  if (el instanceof HTMLTextAreaElement) return el.readOnly || el.disabled ? null : el;
  if (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled) return el;
  return null;
}
function padFor(field: Field): Layout {
  const mode = field.getAttribute("inputmode") ?? "";
  if (field instanceof HTMLInputElement && field.type === "tel" || mode === "tel") return "phone";
  if (field instanceof HTMLInputElement && field.type === "number" || mode === "numeric" || mode === "decimal") return "number";
  return "letters";
}
/** What the return key says (iOS) / which icon it shows (Android), from enterkeyhint or the field type. */
function returnKey(field: Field): "search" | "go" | "next" | "done" | "send" | "return" {
  const hint = field.getAttribute("enterkeyhint");
  if (hint === "search" || hint === "go" || hint === "next" || hint === "done" || hint === "send") return hint;
  if (field instanceof HTMLInputElement && field.type === "search") return "search";
  return field instanceof HTMLTextAreaElement ? "return" : "done";
}

/** Types into a React-controlled field the way a real keystroke does (native setter + input event). */
function setValue(field: Field, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
function caret(field: Field): [number, number] {
  try { if (field.selectionStart !== null && field.selectionEnd !== null) return [field.selectionStart, field.selectionEnd]; } catch { /* email / number fields have no caret */ }
  return [field.value.length, field.value.length];
}
function insert(field: Field, text: string) {
  const [start, end] = caret(field);
  const next = field.value.slice(0, start) + text + field.value.slice(end);
  if (field.maxLength > 0 && next.length > field.maxLength) return;
  setValue(field, next);
  try { field.setSelectionRange(start + text.length, start + text.length); } catch { /* no caret on this field type */ }
}
function backspace(field: Field) {
  const [start, end] = caret(field);
  if (start === end && start === 0) return;
  const from = start === end ? start - 1 : start;
  setValue(field, field.value.slice(0, from) + field.value.slice(end));
  try { field.setSelectionRange(from, from); } catch { /* no caret */ }
}
function pressReturn(field: Field) {
  if (field instanceof HTMLTextAreaElement) { insert(field, "\n"); return; }
  const enter = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
  const go = field.dispatchEvent(enter);
  if (go && field.form) field.form.requestSubmit();
  field.blur();
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SYMBOLS = ["1234567890", "-/:;()$&@\"", ".,?!'"];
const PAD = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
const PAD_LETTERS: Record<string, string> = { 2: "ABC", 3: "DEF", 4: "GHI", 5: "JKL", 6: "MNO", 7: "PQRS", 8: "TUV", 9: "WXYZ" };

export function SimulatorKeyboard({ kind }: { kind: "ios" | "android" }) {
  const [field, setField] = useState<Field | null>(null);
  const [layout, setLayout] = useState<Layout>("letters");
  const [shift, setShift] = useState(false);
  const [, setTick] = useState(0);
  const height = HEIGHT[kind];

  // Follow focus: a text field gets the keyboard; anything else (or nothing) hides it.
  useEffect(() => {
    let hideTimer = 0;
    const onFocusIn = (event: FocusEvent) => {
      const next = editable(event.target as Element);
      window.clearTimeout(hideTimer);
      if (!next) { setField(null); return; }
      setField(next); setLayout(padFor(next)); setShift(next.value.length === 0 && padFor(next) === "letters" && !(next instanceof HTMLInputElement && ["email", "url", "password", "search"].includes(next.type)));
    };
    const onFocusOut = () => { hideTimer = window.setTimeout(() => { if (!editable(document.activeElement)) setField(null); }, 60); };
    const onInput = () => setTick((n) => n + 1);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("input", onInput);
    const initial = editable(document.activeElement);
    if (initial) queueMicrotask(() => { setField(initial); setLayout(padFor(initial)); });
    return () => { window.clearTimeout(hideTimer); document.removeEventListener("focusin", onFocusIn); document.removeEventListener("focusout", onFocusOut); document.removeEventListener("input", onInput); };
  }, []);

  // While it's up the page can scroll the field above it (like a real phone), and the field is brought into view.
  useEffect(() => {
    if (!field) return;
    const before = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${height}px`;
    const timer = window.setTimeout(() => {
      const box = field.getBoundingClientRect();
      const visible = window.innerHeight - height;
      if (box.bottom > visible - 12 || box.top < 0) window.scrollBy({ top: box.bottom - visible + 24, behavior: "smooth" });
    }, 230);
    return () => { window.clearTimeout(timer); document.body.style.paddingBottom = before; };
  }, [field, height]);

  if (!field) return null;
  const type = field instanceof HTMLInputElement ? field.type : "textarea";
  const email = type === "email" || field.getAttribute("inputmode") === "email";
  const secret = type === "password";
  const ret = returnKey(field);
  // Keys never take focus from the field (pointerdown default prevented), so the caret stays put.
  const key = (label: React.ReactNode, onPress: () => void, className = "", aria?: string) =>
    <button type="button" tabIndex={-1} aria-label={aria} className={`${styles.key} ${className}`} onPointerDown={(e) => { e.preventDefault(); onPress(); }}>{label}</button>;
  const type1 = (ch: string) => { insert(field, shift ? ch.toUpperCase() : ch); if (shift) setShift(false); };
  const word = field.value.split(/\s+/).pop() ?? "";
  const returnLabel = kind === "ios" ? (ret === "return" ? "return" : ret) : (ret === "search" ? "⌕" : ret === "next" ? "→" : ret === "return" ? "↵" : "✓");
  const returnClass = kind === "ios" && ret !== "return" ? styles.primary : kind === "android" ? styles.primary : styles.mod;

  const letters = layout === "letters" || layout === "symbols";
  return <div className={`${styles.keyboard} ${styles[kind]}`} style={{ height }} role="group" aria-label={`${kind === "ios" ? "iPhone" : "Android"} keyboard (simulator)`}
    onPointerDown={(e) => e.preventDefault()}>
    {/* Suggestions / predictive bar (no suggestions for passwords, like the real phones). */}
    {letters && <div className={styles.suggest} aria-hidden="true">
      {secret ? <span className={styles.suggestNote}>{kind === "ios" ? "🔑 Passwords" : "Password"}</span>
        : <>{word ? <span>&ldquo;{word}&rdquo;</span> : <span />}<span className={styles.dim}>{word ? `${word}s` : "I"}</span><span className={styles.dim}>{word ? `${word}ing` : "The"}</span></>}
    </div>}

    {letters ? <div className={styles.rows}>
      {(layout === "letters" ? ROWS : SYMBOLS).map((row, r) => <div key={r} className={styles.row}>
        {r === 2 && (layout === "letters"
          ? key("⇧", () => setShift((s) => !s), `${styles.mod} ${shift ? styles.on : ""}`, "Shift")
          : key("#+=", () => {}, styles.mod, "More symbols"))}
        {row.split("").map((ch) => key(layout === "letters" && shift ? ch.toUpperCase() : ch, () => (layout === "letters" ? type1(ch) : insert(field, ch)), "", ch))}
        {r === 2 && key("⌫", () => backspace(field), styles.mod, "Delete")}
      </div>)}
      <div className={styles.row}>
        {key(layout === "letters" ? (kind === "ios" ? "123" : "?123") : "ABC", () => setLayout(layout === "letters" ? "symbols" : "letters"), `${styles.mod} ${styles.wide}`, "Switch keys")}
        {kind === "android" && key(email ? "@" : ",", () => insert(field, email ? "@" : ","), styles.mod)}
        {kind === "ios" && email && key("@", () => insert(field, "@"), styles.mod)}
        {key(kind === "ios" ? "space" : "", () => insert(field, " "), styles.space, "Space")}
        {(kind === "android" || email) && key(".", () => insert(field, "."), styles.mod)}
        {key(returnLabel, () => pressReturn(field), `${returnClass} ${styles.wide}`, ret)}
      </div>
    </div> : <div className={styles.pad}>
      {PAD.map((row, r) => <div key={r} className={styles.row}>{row.map((d) => key(<><b>{d}</b>{layout === "phone" && kind === "ios" && PAD_LETTERS[d] && <small>{PAD_LETTERS[d]}</small>}</>, () => insert(field, d), styles.padKey, d))}</div>)}
      <div className={styles.row}>
        {layout === "phone" ? key("+ * #", () => insert(field, "+"), `${styles.padKey} ${styles.mod}`, "Plus") : key(".", () => insert(field, "."), `${styles.padKey} ${styles.mod}`, "Point")}
        {key(<b>0</b>, () => insert(field, "0"), styles.padKey, "0")}
        {key("⌫", () => backspace(field), `${styles.padKey} ${styles.mod}`, "Delete")}
      </div>
      {kind === "android" && <div className={styles.row}>{key(returnLabel, () => pressReturn(field), `${styles.primary} ${styles.padKey}`, ret)}</div>}
    </div>}

    {/* The strip under the keys: iOS 🌐 · 🎤 and the home indicator; Android the system navigation bar. */}
    {kind === "ios" ? <div className={styles.iosBottom} aria-hidden="true"><span>🌐</span><span className={styles.home} /><span>🎤</span></div>
      : <div className={styles.androidBottom} aria-hidden="true"><span>▼</span><span className={styles.homePill} /><span>⌨</span></div>}
  </div>;
}
