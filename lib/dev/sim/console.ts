/** Pure helpers for the Simulators → Scoring control page (components/dev/simulators/SimulatorConsole.tsx). */
export const SIM_ORIGIN = "http://localhost:3005";

/** Address of a phone's own host, without a path (Back and phoneUrl build theirs from this). */
export const phoneHost = (person: string): string => `http://${person}.localhost:${new URL(SIM_ORIGIN).port}`;

/** Address of one pretend phone: logs that host in as `person` (clears its storage), then opens `path`. */
export function phoneUrl(person: string, path: string): string {
  return `${phoneHost(person)}/__sim/login?as=${encodeURIComponent(person)}&next=${encodeURIComponent(path)}`;
}

/** The simulator is only "running" when its front door answered /__sim/status with ok. */
export function consoleState(status: { ok: boolean } | "error"): "running" | "not-running" {
  return status !== "error" && status.ok ? "running" : "not-running";
}


/**
 * One poll that is only applied if nothing changed while it was out: the generation is read when the poll STARTS, so a poll
 * that began after a scenario pick / Reset is accepted and one that began before it is dropped. Returns true when applied.
 */
export async function guardedPoll<T>(generation: { current: number }, alive: () => boolean, load: () => Promise<T>, apply: (value: T) => void): Promise<boolean> {
  const started = generation.current;
  const value = await load();
  if (!alive() || started !== generation.current) return false;
  apply(value);
  return true;
}

import type { DriverAction, DriverMessage, DriverResult } from "./driver/types";
import type { Transport } from "./studio/runner";

/** The bits of an iframe element the transport uses (so tests can pass a plain object). */
export type FrameLike = {
  contentWindow: { postMessage(message: unknown, targetOrigin: string): void } | null;
  addEventListener(type: "load", fn: () => void): void;
  removeEventListener(type: "load", fn: () => void): void;
};
export type MessageLike = { source: unknown; origin: string; data: unknown };
export type IframeTransport = Transport & { onMessage(event: MessageLike): void };

type PhoneState = {
  pending: Map<string, (r: DriverResult | { reloaded: true }) => void>;
  /** A reload / go happened and its `ready` has not arrived yet. */
  awaiting: boolean;
  /** That `ready` arrived (kept until `ready()` takes it). */
  readyArrived: boolean;
  waiters: Set<() => void>;
  /** Removes a `go`'s pending load listener. */
  cancelGo?: () => void;
};

/**
 * The runner's Transport over the pretend phones' iframes (see the Transport doc in studio/runner.ts for the contract).
 * - `done` replies are matched by action id AND by the frame that sent them, so a late reply from an action that already
 *   timed out is ignored and never resolves the next action.
 * - A phone counts as reloaded only when its iframe fires a real `load` while an action is out. A `ready` alone is not
 *   enough: the driver also announces `ready` after a client-side pushState, which keeps the same document.
 * - A `ready` after a reload or after a `go`'s load is kept for `ready()`; any other `ready` (including an old document's
 *   pushState one seen before the load) is dropped. The driver announces after load, so ready always follows its load.
 * `origin` is the simulator's door origin; phones live on <key>.localhost at its port.
 */
export function iframeTransport(getFrame: (phone: string) => FrameLike | null, origin: string): IframeTransport {
  const port = new URL(origin).port;
  const phones = new Map<string, PhoneState>();
  let counter = 0;
  const stateOf = (phone: string): PhoneState => {
    let s = phones.get(phone);
    if (!s) { s = { pending: new Map(), awaiting: false, readyArrived: false, waiters: new Set() }; phones.set(phone, s); }
    return s;
  };
  const fromPhone = (from: string) => {
    try { const u = new URL(from); return u.port === port && (u.hostname === "localhost" || u.hostname.endsWith(".localhost")); } catch { return false; }
  };

  return {
    act(phone, action: DriverAction) {
      const frame = getFrame(phone);
      const s = stateOf(phone);
      if (!frame?.contentWindow) return Promise.resolve({ ok: false, reason: "not-found", message: "that phone isn't on the page", seen: "" });
      const id = `a${++counter}`;
      return new Promise((resolve) => {
        const finish = (r: DriverResult | { reloaded: true }) => { s.pending.delete(id); frame.removeEventListener("load", onLoad); resolve(r); };
        const onLoad = () => { s.awaiting = true; s.readyArrived = false; finish({ reloaded: true }); };
        if (action.kind === "go") {
          // Count a `ready` only once the new document has loaded: the driver announces two frames AFTER load, while an old
          // document's pushState ready can still arrive between this send and its unload and must not count.
          s.cancelGo?.();
          const onGoLoad = () => { s.cancelGo = undefined; frame.removeEventListener("load", onGoLoad); s.awaiting = true; s.readyArrived = false; };
          s.cancelGo = () => { frame.removeEventListener("load", onGoLoad); s.cancelGo = undefined; };
          s.awaiting = false; s.readyArrived = false;
          frame.addEventListener("load", onGoLoad);
        } else frame.addEventListener("load", onLoad);
        s.pending.set(id, finish);
        frame.contentWindow!.postMessage({ sim: "act", id, action } satisfies DriverMessage, `http://${phone}.localhost:${port}`);
        if (action.kind === "go") finish({ ok: true });
      });
    },
    ready(phone, timeoutMs) {
      const s = stateOf(phone);
      if (s.readyArrived) { s.readyArrived = false; return Promise.resolve(true); }
      return new Promise((resolve) => {
        const wake = () => { clearTimeout(timer); s.waiters.delete(wake); s.readyArrived = false; resolve(true); };
        const timer = setTimeout(() => { s.waiters.delete(wake); resolve(false); }, timeoutMs);
        s.waiters.add(wake);
      });
    },
    onMessage(event) {
      const msg = event.data as DriverMessage | null;
      if (!msg || typeof msg !== "object" || !fromPhone(event.origin)) return;
      for (const [phone, s] of phones) {
        if (getFrame(phone)?.contentWindow !== event.source) continue;
        if (msg.sim === "done" && typeof msg.id === "string") s.pending.get(msg.id)?.(msg.result);
        else if (msg.sim === "ready" && s.awaiting) {
          s.awaiting = false; s.readyArrived = true;
          for (const wake of [...s.waiters]) wake();
        }
        return;
      }
    },
  };
}

export type ConsoleModel<S, R> = { status: S | "error" | null; steps: unknown[]; runner: R | null };
export type ConsoleEvent<S, R> =
  | { type: "status"; status: S | "error" }
  | { type: "created"; status: S; steps: unknown[]; runner: R }
  | { type: "restarted"; status: S | "error" };

/**
 * The page's state. A status that says the simulator isn't running (error or ok:false) throws the runner and the steps
 * away, so a restarted simulator never resumes an old script (Review Focus 5).
 */
export function consoleReducer<S extends { ok: boolean }, R>(model: ConsoleModel<S, R>, ev: ConsoleEvent<S, R>): ConsoleModel<S, R> {
  if (ev.type === "restarted") return { status: ev.status, steps: [], runner: null }; // a restarted simulator never resumes an old script
  if (ev.type === "created") return { status: ev.status, steps: ev.steps, runner: ev.runner };
  if (consoleState(ev.status) !== "running") return { status: ev.status, steps: [], runner: null };
  return { ...model, status: ev.status };
}

/**
 * Runs `run` only when `wait` says go AND nothing bumped the epoch since `started` (a Create / Reset in between means the
 * script belongs to a round that no longer exists). Returns true when `run` ran.
 */
export async function replayWhenCurrent(epoch: { current: number }, started: number, wait: () => Promise<boolean>, run: () => Promise<void>): Promise<boolean> {
  if (!(await wait()) || epoch.current !== started) return false;
  await run();
  return true;
}
