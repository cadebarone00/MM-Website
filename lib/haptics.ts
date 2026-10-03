import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

import { emitHapticsPreview, type HapticsPreview } from "@/lib/dev/hapticsPreview";

/** Level/duration describe the dev visualization, not hardware calibration. */
export type HapticsPreviewOptions = Partial<Pick<HapticsPreview, "intensity" | "durationMs">>;

/** Optional native feedback. Safe to await or fire with `void` from UI handlers. */
async function nativeFeedback(action: () => Promise<void>, defaults: HapticsPreview, preview?: HapticsPreviewOptions): Promise<void> {
  try {
    if (process.env.NODE_ENV === "development") emitHapticsPreview({ ...defaults, ...preview });
    if (typeof window === "undefined" || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Haptics")) return;
    await action();
  } catch {
    // Missing hardware, an unavailable bridge or plugin failure must not affect UI actions.
  }
}

export const lightTap = (preview?: HapticsPreviewOptions): Promise<void> => nativeFeedback(() => Haptics.impact({ style: ImpactStyle.Light }), { intensity: 2, durationMs: 150, name: "lightTap" }, preview);
export const mediumImpact = (preview?: HapticsPreviewOptions): Promise<void> => nativeFeedback(() => Haptics.impact({ style: ImpactStyle.Medium }), { intensity: 5, durationMs: 200, name: "mediumImpact" }, preview);
export const success = (preview?: HapticsPreviewOptions): Promise<void> => nativeFeedback(() => Haptics.notification({ type: NotificationType.Success }), { intensity: 4, durationMs: 350, name: "success" }, preview);
export const warning = (preview?: HapticsPreviewOptions): Promise<void> => nativeFeedback(() => Haptics.notification({ type: NotificationType.Warning }), { intensity: 7, durationMs: 400, name: "warning" }, preview);
export const error = (preview?: HapticsPreviewOptions): Promise<void> => nativeFeedback(() => Haptics.notification({ type: NotificationType.Error }), { intensity: 9, durationMs: 450, name: "error" }, preview);

/** One discrete selection tick; iOS requires a started selection generator. */
export const selectionChange = (preview?: HapticsPreviewOptions): Promise<void> => nativeFeedback(async () => {
  await Haptics.selectionStart();
  try {
    await Haptics.selectionChanged();
  } finally {
    await Haptics.selectionEnd();
  }
}, { intensity: 1, durationMs: 100, name: "selectionChange" }, preview);
