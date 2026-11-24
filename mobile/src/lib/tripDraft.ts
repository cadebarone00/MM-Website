import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseGolfTripDraft, type GolfTripDraft } from "@/lib/platform/golfTripDraft";

/**
 * Trip Builder's answers while you go step to step (website golfTripDraft.ts keeps them in the browser tab). Kept in
 * memory and on the phone, so closing the app mid-way picks up where you were. Same keys as the website's draft.
 */
const KEY = "golfTripDraft";
let current: GolfTripDraft = {};
let loaded = false;

/** Read the saved draft once (call before showing the first question). */
export async function loadTripDraft(): Promise<GolfTripDraft> {
  if (!loaded) {
    try { current = parseGolfTripDraft((await AsyncStorage.getItem(KEY)) ?? ""); } catch { current = {}; }
    loaded = true;
  }
  return current;
}

export const tripDraft = (): GolfTripDraft => current;

const persist = () => { AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {}); };

/** Replace the whole draft (website startGolfTripDraft; a fresh request id unless one is given). */
export function startTripDraft(values: GolfTripDraft): void {
  current = { ...values, requestId: values.requestId ?? "" };
  loaded = true;
  persist();
}

/** Add these answers to the draft (website saveGolfTripDraft). */
export function saveTripDraft(values: GolfTripDraft): void {
  current = { ...current, ...values };
  loaded = true;
  persist();
}

/** After the trip is created: start the next one empty. */
export function clearTripDraft(): void {
  current = {};
  loaded = true;
  AsyncStorage.removeItem(KEY).catch(() => {});
}

/**
 * A tiny synchronous store for the shared "seen" rules (lib/platform/tripTour.ts hasSeen / markSeen), backed by the
 * phone's storage. Call `loadSeenStore` before using it.
 */
const seen = new Map<string, string>();
export async function loadSeenStore(keys: string[]): Promise<void> {
  try { for (const [key, value] of await AsyncStorage.multiGet(keys)) if (value != null) seen.set(key, value); } catch { /* starts empty */ }
}
export const seenStore = {
  getItem: (key: string) => seen.get(key) ?? null,
  setItem: (key: string, value: string) => { seen.set(key, value); AsyncStorage.setItem(key, value).catch(() => {}); },
};
