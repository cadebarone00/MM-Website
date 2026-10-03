"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DEVICE_PRESETS, parsePreviewSettings, PREVIEW_STORAGE_KEY, type DeviceKey, type PreviewSettings } from "@/lib/platform/devicePreview";
import styles from "./DevicePreview.module.css";
import { useSimulator } from "@/components/dev/SimulatorBridge";

/**
 * DEV ONLY — wraps the /dev/play demo (app/dev/play/layout.tsx) in a phone
 * on desktop. The screen is a real 390px-wide box: the app lays out at that
 * width (nothing is scaled), scrolls inside it, and its fixed bottom tabs
 * stay pinned to the phone (the screen is their containing block). On a
 * small screen, or in Responsive mode, every wrapper box collapses
 * (display: contents) and the app renders exactly as it does for real.
 */
function readStored(): string | null {
  try { return window.localStorage.getItem(PREVIEW_STORAGE_KEY); } catch { return null; }
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function DevicePreview({ children }: { children: ReactNode }) {
  const simulator = useSimulator();
  // Remembered per browser (dev convenience); the server render always uses the defaults.
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const [chosen, setChosen] = useState<PreviewSettings | null>(null);
  const settings = chosen ?? parsePreviewSettings(stored);
  const scroller = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // A tab change is a new screen: start it at the top, as the real app does.
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, [pathname]);

  function update(next: Partial<PreviewSettings>) {
    const value = { ...settings, ...next };
    setChosen(value);
    try { window.localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  }

  const preset = DEVICE_PRESETS[settings.device];
  const size = preset.width ? { "--device-w": `${preset.width}px`, "--device-h": `${preset.height}px` } as CSSProperties : undefined;

  // The control center already provides a real iframe viewport; avoid nested frames.
  if (simulator) return <>{children}</>;

  return <div className={styles.stage} data-mode={preset.width ? "device" : "full"} data-frame={settings.frame} data-device-preview="">
    <div className={styles.controls} role="toolbar" aria-label="Device preview (dev only)">
      <strong>Dev preview</strong>
      <label>Device
        <select aria-label="Device" value={settings.device} onChange={(e) => update({ device: e.target.value as DeviceKey })}>
          {(Object.keys(DEVICE_PRESETS) as DeviceKey[]).map((key) => <option key={key} value={key}>{DEVICE_PRESETS[key].label}</option>)}
        </select>
      </label>
      <label className={styles.check}><input type="checkbox" checked={settings.frame} disabled={!preset.width} onChange={(e) => update({ frame: e.target.checked })} />Device frame</label>
      <button type="button" onClick={() => { scroller.current?.scrollTo(0, 0); window.scrollTo(0, 0); }}>Reset scroll</button>
    </div>
    <div className={styles.device} style={size}>
      <span className={styles.sensor} aria-hidden="true" />
      <div className={styles.screen} data-device-screen="">
        <div ref={scroller} className={styles.scroller}>{children}</div>
      </div>
      <span className={styles.homeIndicator} aria-hidden="true" />
    </div>
  </div>;
}
