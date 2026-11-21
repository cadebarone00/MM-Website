/**
 * What each app screen last loaded, kept in memory while the app is open (project_specs.md "App: tabs open instantly"),
 * so a screen you've seen shows at once while it loads again quietly. Never written to the phone; signing out wipes it.
 */
export type AppData<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; error: string; code: number };

const saved = new Map<string, unknown>();
// Bumped by clearAppData, so a load that started before sign-out can't save the last person's data after it.
let generation = 0;

export function savedAppData<T>(path: string): T | undefined {
  return saved.get(path) as T | undefined;
}

export function clearAppData(): void {
  saved.clear();
  generation += 1;
}

/** Loads one app data route (`{ ok, data }` or `{ ok: false, error }`) from the live server and saves it when it works. */
export async function loadAppData<T>(path: string): Promise<AppData<T>> {
  const started = generation;
  try {
    const response = await fetch(path, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) return { status: "error", error: body?.error ?? "Something went wrong. Try again.", code: response.status };
    const data = (body?.data ?? body) as T;
    if (started === generation) saved.set(path, data);
    return { status: "ok", data };
  } catch {
    return { status: "error", error: "We couldn't reach The Maroon. Check your connection and try again.", code: 0 };
  }
}

/** Loads the screens not saved yet, quietly (failures are ignored: the screen just loads normally when opened). */
export async function preloadAppData(paths: string[]): Promise<void> {
  await Promise.all(paths.filter((path) => savedAppData(path) === undefined).map((path) => loadAppData(path)));
}
