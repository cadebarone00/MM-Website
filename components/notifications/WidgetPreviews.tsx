"use client";

import { Camera, Flashlight, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { appleSystem, androidSystem } from "@/lib/fonts/notifications";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { widgetTimeline, type WidgetSnapshot } from "@/lib/notifications/widget";
import { sampleWidgetItems, WIDGET_SAMPLE_NOW, type WidgetPhone, type WidgetSize } from "@/lib/dev/sampleWidget";
import phone from "./NotificationPreviews.module.css";
import styles from "./WidgetPreviews.module.css";

const APP_ICON = "/icons/mm-192.png";
const WALLPAPERS = { default: phone.wallpaper, dark: phone.wallpaperDark, light: phone.wallpaperLight } as const;
/** Home screen cells each size covers, like the real 4-column grid: small 2×2, medium 4×2, large 4×4. */
const CELLS: Record<Exclude<WidgetSize, "lock">, number> = { small: 4, medium: 8, large: 16 };

/** DEV ONLY: Notifications → Home screen widget. The simulator picks size, state and phone. */
export function WidgetPreviewScreen() {
  const simulator = useSimulator();
  const size = simulator?.state.widgetSize ?? "small";
  const os = simulator?.state.widgetPhone ?? "ios";
  const wall = WALLPAPERS[simulator?.state.wallpaper ?? "default"];
  const timeline = widgetTimeline(sampleWidgetItems(simulator?.state.widgetState ?? "next"), WIDGET_SAMPLE_NOW);
  const snap = timeline[0];
  const screen = size === "lock"
    ? os === "ios" ? <IosLock wall={wall} snap={snap} /> : <AndroidNoLock wall={wall} />
    : <Home wall={wall} os={os} size={size} snap={snap} />;
  return <div className={`${appleSystem.variable} ${androidSystem.variable}`} style={{ display: "contents" }}>
    {screen}
    {timeline.length > 1 && <ol className={styles.timeline} aria-label="When the words change by themselves">
      {timeline.map(entry => <li key={entry.at}><time>{entry.at.replace("T", " ")}</time> {entry.state === "nothing" ? "No rounds yet" : entry.line2}</li>)}
    </ol>}
  </div>;
}

function Home({ wall, os, size, snap }: { wall: string; os: WidgetPhone; size: Exclude<WidgetSize, "lock">; snap: WidgetSnapshot }) {
  const apps = 20 - CELLS[size];
  return <main className={`${phone.phone} ${os === "android" ? phone.androidScreen : ""} ${wall}`} aria-label={`${os === "ios" ? "iPhone" : "Android"} home screen with the widget`}>
    {os === "android" && <div className={phone.androidStatus}><span className={phone.androidClock}>10:00</span><span className={phone.androidIcons} aria-hidden>▲ ◢ ▮</span></div>}
    <div className={styles.grid}>
      <div className={styles.slot} data-size={size}>
        <Widget size={size} snap={snap} os={os} />
        <small className={styles.widgetName}>The Maroon</small>
      </div>
      {Array.from({ length: apps }, (_, index) => <span key={index} className={phone.homeApp} aria-hidden><i /><small /></span>)}
    </div>
    {os === "ios" && <div className={phone.dock} aria-hidden>{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>}
  </main>;
}

/** The widget box. Fixed size per size; only the words change between states. */
function Widget({ size, snap, os }: { size: Exclude<WidgetSize, "lock">; snap: WidgetSnapshot; os: WidgetPhone }) {
  const live = snap.state === "live";
  return <a className={styles.widget} data-size={size} data-os={os} data-state={snap.state} href={snap.link} title={`Opens ${snap.link}`}>
    <div className={styles.main}>
      <p className={styles.eyebrow}>{live && <i className={styles.liveDot} aria-hidden />}{snap.eyebrow}</p>
      <p className={styles.title}>{snap.title}</p>
      <p className={styles.line1}>{snap.line1}</p>
      <p className={styles.line2}>{snap.line2}</p>
    </div>
    {size !== "small" && <div className={styles.extra}>{live ? <Group snap={snap} /> : <Upcoming snap={snap} rows={size === "large" ? 4 : 2} />}</div>}
    {size === "large" && live && <Holes snap={snap} />}
  </a>;
}

function Group({ snap }: { snap: WidgetSnapshot }) {
  return <ul className={styles.rows}>{snap.group.map(row => <li key={row.name}><span>{row.name}</span><b>{row.score}</b><small>{row.thru}</small></li>)}</ul>;
}

function Upcoming({ snap, rows }: { snap: WidgetSnapshot; rows: number }) {
  if (snap.state === "nothing") return <ul className={styles.rows}><li><span>Start a round</span><b>+</b></li></ul>;
  return <ul className={styles.rows}>{snap.upcoming.slice(0, rows).map(row => <li key={row.title + row.when}><span>{row.title}</span><small>{row.when}</small></li>)}</ul>;
}

function Holes({ snap }: { snap: WidgetSnapshot }) {
  return <ul className={styles.holes} aria-label="Last holes">{snap.holes.map(hole => (
    <li key={hole.hole} data-tone={hole.strokes < hole.par ? "under" : hole.strokes > hole.par ? "over" : "par"}>
      <small>{hole.hole}</small><b>{hole.strokes}</b><small>Par {hole.par}</small>
    </li>))}</ul>;
}

/** iPhone lock screen: the one line above the clock, the circle + rectangle under it. */
function IosLock({ wall, snap }: { wall: string; snap: WidgetSnapshot }) {
  return <main className={`${phone.phone} ${wall}`} aria-label="Locked iPhone with lock screen widgets">
    <div className={phone.lockTop}>
      <LockKeyhole size={16} strokeWidth={2.25} aria-hidden />
      <p className={phone.lockDate}>Saturday, November 21{snap.lock.inline && <span className={styles.inline}> · {snap.lock.inline}</span>}</p>
      <p className={phone.lockClock}>10:00</p>
      <div className={styles.lockRow}>
        <span className={styles.circle} aria-label="Circle widget">{snap.lock.circle || <img src={APP_ICON} alt="" />}</span>
        <span className={styles.rect} aria-label="Rectangle widget"><b>{snap.lock.rect[0]}</b><span>{snap.lock.rect[1]}</span></span>
      </div>
    </div>
    <div className={phone.lockButtons} aria-hidden><span><Flashlight size={20} /></span><span><Camera size={20} /></span></div>
  </main>;
}

function AndroidNoLock({ wall }: { wall: string }): ReactNode {
  return <main className={`${phone.phone} ${phone.androidScreen} ${wall}`} aria-label="Android lock screen">
    <p className={styles.note}>Android has no lock screen widgets. During a round, the pinned Live Update shows there instead (see Live Activity).</p>
  </main>;
}
