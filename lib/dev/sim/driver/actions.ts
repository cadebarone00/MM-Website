import type { DriverAction, DriverResult, Target } from "./types";

const DEFAULT_TIMEOUT = 8000;
const POLL_MS = 100;

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const textOf = (el: Element) => norm((el as HTMLElement).innerText ?? el.textContent);

function isVisible(el: Element): boolean {
  if (el.getClientRects().length === 0) return false;
  const view = el.ownerDocument.defaultView;
  return !view || view.getComputedStyle(el).visibility !== "hidden";
}

const BUTTONS = "button, [role=button], input[type=button], input[type=submit]";
const FIELDS = "input, textarea, select";

function candidates(root: ParentNode, role: Target["role"]): Element[] {
  const sel =
    role === "button" ? BUTTONS
    : role === "link" ? "a[href]"
    : role === "input" ? FIELDS
    : `${BUTTONS}, a[href], ${FIELDS}, [data-sim]`;
  return [...root.querySelectorAll(sel)];
}

function labelsOf(el: Element): string[] {
  const out: string[] = [];
  const aria = el.getAttribute("aria-label");
  if (aria) out.push(norm(aria));
  const labels = (el as HTMLInputElement).labels;
  if (labels) for (const l of labels) out.push(norm(l.textContent));
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = norm(by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" "));
    if (t) out.push(t);
  }
  return out;
}

function matches(el: Element, t: Target): boolean {
  if (t.sim !== undefined && el.getAttribute("data-sim") !== t.sim) return false;
  if (t.label !== undefined && !labelsOf(el).includes(t.label)) return false;
  if (t.text !== undefined) {
    const val = el instanceof HTMLInputElement && /^(button|submit)$/.test(el.type) ? norm(el.value) : "";
    if (textOf(el) !== t.text && val !== t.text) return false;
  }
  return true;
}

// The `within` root can be any element (a card), not only a control.
function findRoot(doc: Document, t: Target): Element[] {
  const all = [...doc.body.querySelectorAll("*")].filter((el) => isVisible(el) && matches(el, t));
  // Keep the innermost matches (drop ancestors that merely contain another match).
  return all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
}

function resolve(doc: Document, t: Target): { els: Element[]; root: Element | null } {
  let root: ParentNode = doc;
  let rootEl: Element | null = null;
  if (t.within) {
    const roots = findRoot(doc, t.within);
    if (roots.length !== 1) return { els: [], root: null };
    rootEl = roots[0];
    root = rootEl;
  }
  const found = candidates(root, t.role ?? "any").filter((el) => isVisible(el) && matches(el, t));
  // A wrapper around another match (<a><button>Next</button></a>) is the same control: keep the innermost.
  return { els: found.filter((el) => !found.some((o) => o !== el && el.contains(o))), root: rootEl };
}

function describe(t: Target): string {
  const parts = [t.text !== undefined && `"${t.text}"`, t.label !== undefined && `label "${t.label}"`, t.sim !== undefined && `data-sim "${t.sim}"`].filter(Boolean);
  const own = parts.join(" ") || "anything";
  return t.within ? `${own} within ${describe(t.within)}` : own;
}

function seenOn(doc: Document, t: Target): string {
  const rootEl = t.within ? findRoot(doc, t.within)[0] : null;
  return textOf(rootEl ?? doc.body).slice(0, 200);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fail = (reason: "not-found" | "ambiguous" | "disabled" | "timeout", message: string, seen: string): DriverResult => ({ ok: false, reason, message, seen });

function isDisabled(el: Element): boolean {
  return el.matches(":disabled") || el.getAttribute("aria-disabled") === "true";
}

// A Next/React app: server-rendered markup has no click handlers until React hydrates and tags each element.
function needsHydration(doc: Document): boolean {
  const w = doc.defaultView as (Window & { __next_f?: unknown; next?: unknown }) | null;
  return !!w && (w.__next_f !== undefined || w.next !== undefined);
}
const isHydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactProps$"));

function shortDescription(el: Element): string {
  const sim = el.getAttribute("data-sim");
  const text = textOf(el).slice(0, 30);
  return `<${el.tagName.toLowerCase()}${sim ? ` data-sim="${sim}"` : ""}${text ? ` "${text}"` : ""}>`;
}

// Waits (up to 1.5s) for exactly one visible, enabled, hydrated match; otherwise says why not.
async function settleTarget(doc: Document, t: Target): Promise<{ el: HTMLElement } | { result: DriverResult }> {
  const end = Date.now() + 1500;
  const what = describe(t);
  for (;;) {
    const els = resolve(doc, t).els;
    let blocked: DriverResult | null = null;
    if (els.length > 1) return { result: fail("ambiguous", `${els.length} matches for ${what}`, seenOn(doc, t)) };
    if (els.length === 0) blocked = fail("not-found", `Nothing matches ${what}`, seenOn(doc, t));
    else if (isDisabled(els[0])) blocked = fail("disabled", `${what} is disabled`, seenOn(doc, t));
    else if (needsHydration(doc) && !isHydrated(els[0])) blocked = fail("timeout", "the screen never finished loading", seenOn(doc, t));
    else return { el: els[0] as HTMLElement };
    if (Date.now() >= end) return { result: blocked };
    await sleep(POLL_MS);
  }
}

async function waitForMatch(doc: Document, t: Target, timeoutMs: number): Promise<Element[]> {
  const end = Date.now() + timeoutMs;
  let els = resolve(doc, t).els;
  while (els.length === 0 && Date.now() < end) { await sleep(POLL_MS); els = resolve(doc, t).els; }
  return els;
}

export async function runAction(doc: Document, action: DriverAction, hooks?: { onTap?: (el: Element) => void }): Promise<DriverResult> {
  switch (action.kind) {
    case "go": {
      doc.defaultView!.location.href = action.path;
      return { ok: true };
    }
    case "tap":
    case "type": {
      const settled = await settleTarget(doc, action.target);
      if ("result" in settled) return settled.result;
      const el = settled.el;
      const what = describe(action.target);
      el.scrollIntoView({ block: "center" });
      if (action.kind === "tap") {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = doc.elementFromPoint(x, y);
        if (hit && hit !== el && !el.contains(hit)) return fail("not-found", `${what} is covered by ${shortDescription(hit)}`, seenOn(doc, action.target));
        hooks?.onTap?.(el);
        const view = doc.defaultView!;
        const pos = { bubbles: true, cancelable: true, view, clientX: x, clientY: y, button: 0 };
        el.dispatchEvent(new view.PointerEvent("pointerdown", { ...pos, pointerType: "touch", isPrimary: true }));
        el.dispatchEvent(new view.MouseEvent("mousedown", pos));
        el.dispatchEvent(new view.PointerEvent("pointerup", { ...pos, pointerType: "touch", isPrimary: true }));
        el.dispatchEvent(new view.MouseEvent("mouseup", pos));
        el.click();
        return { ok: true };
      }
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        return fail("not-found", `${what} is not a field you can type in`, seenOn(doc, action.target));
      }
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, action.text);
      else el.value = action.text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }
    case "waitFor": {
      const els = await waitForMatch(doc, action.target, action.timeoutMs ?? DEFAULT_TIMEOUT);
      if (els.length > 0) return { ok: true };
      return fail("timeout", `Timed out waiting for ${describe(action.target)}`, seenOn(doc, action.target));
    }
    case "absent": {
      const end = Date.now() + (action.timeoutMs ?? DEFAULT_TIMEOUT);
      while (resolve(doc, action.target).els.length > 0) {
        if (Date.now() >= end) return fail("timeout", `${describe(action.target)} is still showing`, seenOn(doc, action.target));
        await sleep(POLL_MS);
      }
      return { ok: true };
    }
    default:
      return fail("not-found", "unknown action", "");
  }
}
