"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SAMPLE_PROFILE, type SampleProfileEdits } from "@/lib/dev/sampleProfile";

/** DEV ONLY: the sample profile's edits (Settings, Edit profile), one per browser tab (sessionStorage). Never a real account. */
const KEY = "maroon-dev-sample-profile-v1";
const listeners = new Set<() => void>();
let state: SampleProfileEdits | null = null;

function parse(raw: string | null): SampleProfileEdits {
  try {
    const value = raw ? JSON.parse(raw) as Partial<SampleProfileEdits> : {};
    const text = (v: unknown, fallback: string) => typeof v === "string" ? v : fallback;
    return {
      displayName: text(value.displayName, DEFAULT_SAMPLE_PROFILE.displayName), username: text(value.username, DEFAULT_SAMPLE_PROFILE.username),
      bio: text(value.bio, DEFAULT_SAMPLE_PROFILE.bio), photoUrl: typeof value.photoUrl === "string" && value.photoUrl.startsWith("data:image/") ? value.photoUrl : null,
      visibility: value.visibility === "public" ? "public" : "private",
    };
  } catch { return DEFAULT_SAMPLE_PROFILE; }
}

function current(): SampleProfileEdits {
  if (state) return state;
  try { state = parse(sessionStorage.getItem(KEY)); } catch { state = DEFAULT_SAMPLE_PROFILE; }
  return state;
}

export function updateSampleProfile(patch: Partial<SampleProfileEdits>) {
  state = { ...current(), ...patch };
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked or full (a big photo): keep it in memory */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useSampleProfile = () => useSyncExternalStore(subscribe, current, () => DEFAULT_SAMPLE_PROFILE);
