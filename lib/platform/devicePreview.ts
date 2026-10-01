/**
 * DEV ONLY: device sizes for the /dev/play phone preview
 * (components/platform/play/dev/DevicePreview.tsx). The default matches the
 * 390 × 844 frames in Figma "The Maroon — Full App Screens".
 */
export const DEVICE_PRESETS = {
  iphone: { label: "iPhone 390 × 844", width: 390, height: 844 },
  large: { label: "Large Mobile 430 × 932", width: 430, height: 932 },
  responsive: { label: "Responsive / Full Browser", width: null, height: null },
} as const;

export type DeviceKey = keyof typeof DEVICE_PRESETS;

export interface PreviewSettings {
  device: DeviceKey;
  /** Draw the bezel, sensor and home indicator around the screen. */
  frame: boolean;
}

export const DEFAULT_PREVIEW: PreviewSettings = { device: "iphone", frame: true };
export const PREVIEW_STORAGE_KEY = "dev-play-device-preview";

/** Settings from browser storage; anything unexpected falls back to the default. */
export function parsePreviewSettings(raw: unknown): PreviewSettings {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return DEFAULT_PREVIEW; }
  }
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const device = typeof record.device === "string" && Object.hasOwn(DEVICE_PRESETS, record.device) ? record.device as DeviceKey : DEFAULT_PREVIEW.device;
  return { device, frame: typeof record.frame === "boolean" ? record.frame : DEFAULT_PREVIEW.frame };
}
