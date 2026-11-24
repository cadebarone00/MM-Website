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
