export type Target = {
  text?: string; // trimmed visible text, exact match
  label?: string; // aria-label or the associated <label> text, exact match
  sim?: string; // data-sim value
  role?: "button" | "link" | "input" | "any";
  within?: Target;
};

export type DriverAction =
  | { kind: "go"; path: string }
  | { kind: "tap"; target: Target }
  | { kind: "type"; target: Target; text: string }
  | { kind: "waitFor"; target: Target; timeoutMs?: number }
  | { kind: "absent"; target: Target; timeoutMs?: number };

export type DriverResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "ambiguous" | "disabled" | "timeout"; message: string; seen: string };

export type DriverMessage =
  | { sim: "act"; id: string; action: DriverAction }
  | { sim: "ready"; path: string }
  | { sim: "done"; id: string; result: DriverResult };
