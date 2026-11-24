import type { DriverAction, DriverResult, Target } from "../driver/types";
import type { SimAction, SimStep } from "./script";

/**
 * How the runner reaches a phone.
 *
 * `act(phone, action)` sends one driver action and answers the driver's result, or `{ reloaded: true }` only when the
 * phone's document actually unloaded while the action was in flight (a full page load — never a client-side pushState,
 * which keeps the same document and the same driver). For `go` it answers as soon as the action was handed over.
 *
 * `ready(phone, timeoutMs)` resolves true on the first `ready` message that arrived AFTER the reload was detected or
 * after the `go` was sent — including one that arrived between `act`'s reply and this `ready()` call (the transport keeps
 * it). Readies from before that point (the page's earlier loads, pushState re-announcements, duplicates) are dropped.
 * It resolves false when none arrives within `timeoutMs`. The runner calls `ready()` only right after a `go` or a
 * `reloaded` reply, so extra ready messages at any other time never move it.
 */
export type Transport = {
  act(phone: string, action: DriverAction): Promise<DriverResult | { reloaded: true }>;
  ready(phone: string, timeoutMs: number): Promise<boolean>;
};
export type RunnerState = { index: number; status: "idle" | "running" | "paused" | "stopped" | "failed" | "done"; message: string | null; done: string[] };
export type Runner = {
  state(): RunnerState; next(): Promise<void>; playAll(): Promise<void>; pause(): void; skip(): void;
  jumpTo(index: number): Promise<void>; setDelay(ms: number): void; subscribe(fn: (s: RunnerState) => void): () => void;
};

const EXPECT_MS = 2000;
const READY_MS = 30_000;
const DEFAULT_DELAY = 600;
/** The driver's own default wait (actions.ts), and the extra time we give a reply before calling the phone silent. */
const DRIVER_DEFAULT_MS = 8000;
const REPLY_MARGIN_MS = 4000;
const GO_REPLY_MS = 30_000;
const TAP_IF_LOOK_MS = 1000;

function describe(t: Target): string {
  const own = [t.text !== undefined && `"${t.text}"`, t.label !== undefined && `"${t.label}"`, t.sim !== undefined && `"${t.sim}"`].filter(Boolean).join(" ") || "that screen";
  return t.within ? `${own} in ${describe(t.within)}` : own;
}
const describeAction = (a: DriverAction) => a.kind === "go" ? `going to ${a.path}` : `${a.kind} ${describe(a.target)}`;

type Reply = DriverResult | { reloaded: true } | { timedOut: true };
type Outcome = { ok: true } | { ok: false; status: "stopped" | "failed"; message: string; block?: boolean };

/**
 * Plays the steps one at a time on the phones.
 * - Before a step its `expect` screen is checked (a 2 s waitFor); if it isn't there (the owner tapped the phone by hand),
 *   the runner stops and asks, and never taps blindly.
 * - A phone that reloads mid-step: once it says ready again, `expect` is checked again and the step's remaining actions
 *   are retried once. An `atomic` step (relative +1 stroke taps) is never resumed: it stops and asks the owner to fix the
 *   phone by hand and press Skip, and it won't run again on its own once any of its taps went in.
 * - A driver failure stops the run as failed with the driver's own words; a phone that doesn't answer fails too.
 */
/** `replyMarginMs`: extra time a phone gets past the action's own wait before it counts as not answering (tests shorten it). */
export function createRunner(steps: SimStep[], transport: Transport, opts: { delayMs?: number; replyMarginMs?: number } = {}): Runner {
  let delayMs = opts.delayMs ?? DEFAULT_DELAY;
  const margin = opts.replyMarginMs ?? REPLY_MARGIN_MS;
  let s: RunnerState = { index: 0, status: steps.length ? "idle" : "done", message: null, done: [] };
  const listeners = new Set<(s: RunnerState) => void>();
  let busy = false;
  let pauseAsked = false;
  /** The index of an atomic step that was partly played: it waits for Skip. */
  let blocked: number | null = null;

  const set = (part: Partial<RunnerState>) => {
    s = { ...s, ...part };
    for (const fn of listeners) { try { fn(s); } catch { /* a broken listener never stops the run */ } }
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const who = (step: SimStep) => `${step.name ?? step.phone}'s phone`;

  /** One driver action, with a deadline so a silent phone can't wedge the run. */
  async function call(phone: string, action: DriverAction): Promise<Reply> {
    const limit = action.kind === "go" ? GO_REPLY_MS
      : (action.kind === "waitFor" || action.kind === "absent" ? action.timeoutMs ?? DRIVER_DEFAULT_MS : DRIVER_DEFAULT_MS) + margin;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<Reply>((r) => { timer = setTimeout(() => r({ timedOut: true }), limit); });
    try { return await Promise.race([transport.act(phone, action), late]); }
    finally { clearTimeout(timer); }
  }

  /** The step's starting screen. null = it's there. */
  async function checkExpect(step: SimStep): Promise<Outcome | null> {
    if (!step.expect) return null;
    const look: DriverAction = { kind: "waitFor", target: step.expect, timeoutMs: EXPECT_MS };
    let r = await call(step.phone, look);
    if ("reloaded" in r) r = (await transport.ready(step.phone, READY_MS)) ? await call(step.phone, look) : r;
    if ("timedOut" in r) return { ok: false, status: "failed", message: `${who(step)} didn't answer (${describeAction(look)}).` };
    if ("reloaded" in r) return { ok: false, status: "failed", message: `${who(step)} reloaded and didn't come back. Check the phone, then press Skip.` };
    if (r.ok) return null;
    if (r.reason === "ambiguous") return { ok: false, status: "failed", message: `${who(step)}: ${r.message}. The screen showed: "${r.seen}"` };
    return { ok: false, status: "stopped", message: `${who(step)} isn't on ${step.screen ?? describe(step.expect)}. Tap it there or press Skip` };
  }

  async function runStep(step: SimStep): Promise<Outcome> {
    const first = await checkExpect(step);
    if (first) return first;
    let retried = false;
    /** Some action that changes the screen (tap / type / go) was handed to the phone. */
    let touched = false;
    const partly = () => step.atomic === true && touched;
    const handOff = `Check ${step.atomic ? "the hole " : ""}on the phone, fix it by hand, then press Skip`;
    for (let i = 0; i < step.actions.length; i++) {
      const item: SimAction = step.actions[i];
      let action: DriverAction = item.kind === "tapIf" ? { kind: "tap", target: item.target } : item;
      let r: Reply;
      if (item.kind === "tapIf") {
        // Tap only when it's on screen: a short look first (a reload or silence here is handled like any action's).
        const look: DriverAction = { kind: "waitFor", target: item.target, timeoutMs: TAP_IF_LOOK_MS };
        r = await call(step.phone, look);
        if (!("reloaded" in r) && !("timedOut" in r)) {
          if (!r.ok) continue; // not there: nothing to tap
          r = await call(step.phone, action);
        } else action = look;
      } else r = await call(step.phone, action);
      if ("timedOut" in r) {
        if (action.kind !== "waitFor" && action.kind !== "absent") touched = true;
        return { ok: false, status: "failed", message: `${who(step)} didn't answer (${describeAction(action)}).${partly() ? ` ${handOff}.` : ""}`, block: partly() };
      }
      if ("reloaded" in r) {
        if (action.kind !== "waitFor" && action.kind !== "absent") touched = true;
        if (partly()) return { ok: false, status: "stopped", message: `${who(step)} reloaded during "${step.say}". ${handOff}`, block: true };
        if (retried) return { ok: false, status: "failed", message: `${who(step)} reloaded again during "${step.say}". Check the phone, then press Skip or try the step again.` };
        retried = true;
        if (!(await transport.ready(step.phone, READY_MS))) return { ok: false, status: "failed", message: `${who(step)} reloaded and didn't come back. Check the phone, then press Skip.` };
        const again = await checkExpect(step);
        if (again) return again;
        i--; // retry this action and the rest
        continue;
      }
      if (!r.ok) return { ok: false, status: "failed", message: `${who(step)}: ${r.message}. The screen showed: "${r.seen}"${partly() ? `. ${handOff}` : ""}`, block: partly() };
      if (action.kind !== "waitFor" && action.kind !== "absent") touched = true;
      if (action.kind === "go" && !(await transport.ready(step.phone, READY_MS))) {
        return { ok: false, status: "failed", message: `${who(step)} didn't finish loading ${action.path}.` };
      }
    }
    return { ok: true };
  }

  /** Runs the current step. True when it finished and the run may carry on. */
  async function one(): Promise<boolean> {
    const step = steps[s.index];
    if (!step) { set({ status: "done", message: null }); return false; }
    if (blocked === s.index) {
      if (s.status !== "stopped" && s.status !== "failed") set({ status: "stopped" });
      return false; // a partly played atomic step waits for Skip
    }
    set({ status: "running", message: null });
    const out = await runStep(step);
    if (!out.ok) { if (out.block) blocked = s.index; set({ status: out.status, message: out.message }); return false; }
    const index = s.index + 1;
    set({ index, done: [...s.done, step.id], status: index >= steps.length ? "done" : "running" });
    return index < steps.length;
  }

  async function play(until: number, delay: () => number) {
    if (busy) return;
    busy = true; pauseAsked = false;
    try {
      while (s.index < until) {
        const more = await one();
        if (!more) return;
        if (pauseAsked) { set({ status: "paused" }); return; }
        if (s.index < until && delay() > 0) {
          await sleep(delay());
          if (pauseAsked) { set({ status: "paused" }); return; }
        }
      }
      if (s.status === "running") set({ status: "idle" });
    } finally { busy = false; pauseAsked = false; }
  }

  return {
    state: () => s,
    next: () => play(Math.min(s.index + 1, steps.length), () => 0),
    playAll: () => play(steps.length, () => delayMs),
    pause() { if (busy) pauseAsked = true; else if (s.status === "idle") set({ status: "paused" }); },
    skip() {
      if (busy || s.status === "done") return;
      blocked = null;
      const index = s.index + 1;
      set({ index, status: index >= steps.length ? "done" : "idle", message: null });
    },
    jumpTo: (index: number) => play(Math.max(0, Math.min(index, steps.length)), () => 0),
    setDelay(ms: number) { delayMs = Math.max(0, ms); },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
