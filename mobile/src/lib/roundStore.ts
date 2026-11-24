import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersonalRoundSetup } from "@/lib/platform/personalRound";
import { builtParsFor } from "./setupHelpers.ts";

/**
 * What this phone remembers about rounds (website PlayRound's localStorage keys, same names):
 * - the round kept only on this phone (when rounds with friends aren't set up in the database yet), and
 * - scorecards built by hand at a course, so the next round there starts with those pars.
 * Failures are quiet: the worst case is the phone forgets.
 */
const ROUND_KEY = "maroonPersonalRound";
const BUILT_KEY = "maroonBuiltCourses";

export type PhoneRound = { setup: PersonalRoundSetup; startedAt: string };

export async function readPhoneRound(): Promise<PhoneRound | null> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(ROUND_KEY)) ?? "null") as PhoneRound | null;
    return saved?.setup?.course?.name ? saved : null;
  } catch {
    return null;
  }
}

export async function savePhoneRound(round: PhoneRound | null): Promise<void> {
  try {
    if (round) await AsyncStorage.setItem(ROUND_KEY, JSON.stringify(round));
    else await AsyncStorage.removeItem(ROUND_KEY);
  } catch { /* the round just isn't remembered */ }
}

export async function builtPars(ref: string): Promise<number[] | undefined> {
  try { return builtParsFor(await AsyncStorage.getItem(BUILT_KEY), ref); } catch { return undefined; }
}

/** A course picked on the search screen, handed back to the setup page that opened it. */
export type PickedCourse = { ref: string; name: string; place: string };
let pending: PickedCourse | null = null;
export const setPickedCourse = (course: PickedCourse) => { pending = course; };
export const takePickedCourse = (): PickedCourse | null => { const course = pending; pending = null; return course; };
