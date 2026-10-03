export const HAPTICS_PREVIEW_CHANNEL = "maroon-dev-haptics-v1";
export type HapticsPreview = { intensity: number; durationMs: number; name: string };
export function parseHapticsPreview(value: unknown): HapticsPreview | null {
  if (!value || typeof value !== "object") return null;
  const { intensity, durationMs, name } = value as HapticsPreview;
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 10 || !Number.isFinite(durationMs) || durationMs < 50 || durationMs > 5000 || typeof name !== "string" || name.length > 40) return null;
  return { intensity, durationMs, name };
}
/** Device-local visual diagnostics; never requests browser vibration. */
export function emitHapticsPreview(value: HapticsPreview) {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined" || !parseHapticsPreview(value)) return;
  try {
    if (window.location.pathname === "/dev") window.dispatchEvent(new CustomEvent(HAPTICS_PREVIEW_CHANNEL, { detail: value }));
    else if (window.parent !== window && window.parent.location.origin === window.location.origin && window.parent.location.pathname === "/dev") window.parent.postMessage({ channel: HAPTICS_PREVIEW_CHANNEL, ...value }, window.location.origin);
  } catch { /* Unrelated/cross-origin frames have no simulator diagnostics. */ }
}
