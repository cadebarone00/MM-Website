"use client";

import { AlertTriangle, Bell, CalendarClock, Camera, Check, ClipboardCheck, Flame, Flashlight, Link2, LockKeyhole, Mail, Megaphone, Plane, Trophy, UserPlus, X, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Inter, Roboto } from "next/font/google";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { androidLiveUpdate, formatPoints, formatToPar, liveLeaderboard, liveTeamText, matchMark, opponentLabel, newestFirst, pillStatus, resultTone, thruLabel, timeAgo, unreadCount, type PillStatus } from "@/lib/notifications/format";
import type { AppNotification, LiveRoundActivity, NotificationKind } from "@/lib/notifications/types";
import { NOTIFICATION_PREVIEWS, SAMPLE_BY_TYPE, SAMPLE_LOST, SAMPLE_PAIRS, SAMPLE_LIVE_TOP3, SAMPLE_LOCAL_NOW, SAMPLE_NOTIFICATIONS, SAMPLE_TEAM_STEPS, SAMPLE_NOW, type NotificationPreview, type NotificationSurface } from "@/lib/dev/sampleNotifications";
import { previewNotes } from "@/lib/dev/highlightScenarios";
import styles from "./NotificationPreviews.module.css";

const APP_ICON = "/icons/mm-192.png";

// What the phone draws itself uses the phone's font, never ours: Inter stands in for Apple's SF Pro (iPhone notifications,
// lock screen clock), Roboto for Android's system font (status bar, chip, notifications). Our Barlow / Spectral appear
// only where the app draws: the iPhone Live Activity / Dynamic Island and in-app.
const appleSystem = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-apple-system" });
const androidSystem = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-android-system" });

/** DEV ONLY: one surface of the simulator's Notifications group; the simulator condition picks the screen. */
export function NotificationPreviewScreen({ surface }: { surface: NotificationSurface }) {
  const simulator = useSimulator();
  const requested = simulator?.state.notificationPreview;
  const wall = WALLPAPERS[simulator?.state.wallpaper ?? "default"];
  const screens: readonly NotificationPreview[] = NOTIFICATION_PREVIEWS[surface];
  const screen = requested && screens.includes(requested) ? requested : screens[0];
  // Highlights scenario (simulator panel): the Highlights Engine's real output for the chosen scenario + the viewer's
  // inbox. Otherwise the original design samples. `latest` is null when the scenario's alert isn't on the phone.
  const highlight = simulator?.state.highlightSim;
  const engine = highlight?.source === "engine" ? previewNotes(highlight, SAMPLE_NOW) : null;
  const notes = engine ? engine.inbox : SAMPLE_NOTIFICATIONS;
  const [latest, ...older]: (AppNotification | null)[] = engine ? [engine.current, ...engine.inbox.filter(note => note.id !== engine.current?.id)] : newestFirst(SAMPLE_NOTIFICATIONS);
  // display: contents — the screen itself stays the page's first box (globals.css top clearance rules).
  return <div className={`${appleSystem.variable} ${androidSystem.variable}`} style={{ display: "contents" }}>{previewScreen(screen, wall, latest, older as AppNotification[], notes)}</div>;
}

function previewScreen(screen: NotificationPreview, wall: string, latest: AppNotification | null, older: AppNotification[], notes: AppNotification[]): ReactNode {
  switch (screen) {
    case "lock": case "signed-out-lock": return <LockScreen wall={wall}>{latest && <PhoneNotification note={latest} />}</LockScreen>;
    case "lock-stack": return <LockScreen wall={wall}>{latest && <PhoneNotificationStack notes={[latest, ...older.slice(0, 2)]} />}</LockScreen>;
    case "banner": return <HomeScreen wall={wall} banner={latest && <PhoneNotification note={latest} />} />;
    case "signed-out-tap": return latest ? <SignInFirst note={latest} /> : <LockScreen wall={wall} />;
    case "android-note": return <AndroidNotificationScreen wall={wall} note={latest} />;
    case "both-live": return <LockScreen wall={wall}><RoundLiveActivity activity={SAMPLE_TEAM_STEPS.live} /></LockScreen>;
    case "both-live-top3": return <LockScreen wall={wall}><RoundLiveActivity activity={SAMPLE_LIVE_TOP3} /></LockScreen>;
    case "both-pre": case "both-over": case "both-final": return <LockScreen wall={wall}><RoundLiveActivity activity={SAMPLE_TEAM_STEPS[screen.slice(5) as "pre" | "over" | "final"]} /></LockScreen>;
    case "both-pairs-live": case "both-pairs-over": return <LockScreen wall={wall}><RoundLiveActivity activity={SAMPLE_PAIRS[screen.slice(11) as "live" | "over"]} /></LockScreen>;
    case "both-lost": return <LockScreen wall={wall}><RoundLiveActivity activity={SAMPLE_LOST} /></LockScreen>;
    case "pill-lost": return <HomeScreen wall={wall} island={<IslandCompactTeam activity={SAMPLE_LOST} />} below={<IslandMinimalTeam activity={SAMPLE_LOST} />} />;
    case "android-lost": return <AndroidHome wall={wall} chip={<AndroidChip activity={SAMPLE_LOST} />} />;
    case "android-update-pre": case "android-update-live": case "android-update-over": case "android-update-final":
      return <AndroidLock wall={wall} activity={SAMPLE_TEAM_STEPS[screen.slice(15) as keyof typeof SAMPLE_TEAM_STEPS]} />;
    case "android-update-individual": return <AndroidLock wall={wall} activity={SAMPLE_BY_TYPE.individual} />;
    case "android-update-none": return <AndroidLock wall={wall} activity={SAMPLE_BY_TYPE.none} />;
    case "both-expanded": return <HomeScreen wall={wall} island={<div className={`${styles.island} ${styles.islandExpanded}`} aria-label="Dynamic Island, expanded"><RoundLiveActivity activity={SAMPLE_TEAM_STEPS.live} island /></div>} />;
    case "individual-live": case "team-live": case "none-live": return <LockScreen wall={wall}><RoundLiveActivity activity={SAMPLE_BY_TYPE[screen.split("-")[0] as keyof typeof SAMPLE_BY_TYPE]} /></LockScreen>;
    case "individual-pill": case "team-pill": case "none-pill": {
      const activity = SAMPLE_BY_TYPE[screen.split("-")[0] as keyof typeof SAMPLE_BY_TYPE];
      return <HomeScreen wall={wall} island={<IslandCompactTeam activity={activity} />} below={<IslandMinimalTeam activity={activity} />} />;
    }
    case "android-pre": case "android-live": case "android-over": case "android-final":
      return <AndroidHome wall={wall} chip={<AndroidChip activity={SAMPLE_TEAM_STEPS[screen.slice(8) as keyof typeof SAMPLE_TEAM_STEPS]} />} />;
    case "pill-pre": case "pill-live": case "pill-over": case "pill-final": {
      const activity = SAMPLE_TEAM_STEPS[screen.slice(5) as keyof typeof SAMPLE_TEAM_STEPS];
      return <HomeScreen wall={wall} island={<IslandCompactTeam activity={activity} />} below={<IslandMinimalTeam activity={activity} />} />;
    }
    case "bell-unread": return <AppScreen notes={notes}><NotificationList notes={notes} now={SAMPLE_NOW} /></AppScreen>;
    case "bell-read": return <AppScreen notes={notes}><NotificationList notes={notes.map(note => ({ ...note, read: true }))} now={SAMPLE_NOW} /></AppScreen>;
    case "bell-empty": return <AppScreen notes={[]}><NotificationList notes={[]} now={SAMPLE_NOW} /></AppScreen>;
    case "top-banner": return <AppScreen notes={notes} banner={latest && <TopBanner note={latest} />} />;
  }
}

/* ---------- Phone (lock screen / home screen) ---------- */

/** Lock / home screen wallpaper (simulator condition): default (also when unset), darker or lighter, to check contrast. */
const WALLPAPERS = { default: styles.wallpaper, dark: styles.wallpaperDark, light: styles.wallpaperLight } as const;

function LockScreen({ children, wall }: { children?: ReactNode; wall: string }) {
  return <main className={`${styles.phone} ${wall}`} aria-label="Locked iPhone preview">
    <div className={styles.lockTop}>
      <LockKeyhole size={16} strokeWidth={2.25} aria-hidden />
      <p className={styles.lockDate}>Friday, October 16</p>
      <p className={styles.lockClock}>9:41</p>
    </div>
    <div className={styles.lockStack}>{children}</div>
    <div className={styles.lockButtons} aria-hidden><span><Flashlight size={20} /></span><span><Camera size={20} /></span></div>
  </main>;
}

function HomeScreen({ banner, island, below, wall }: { banner?: ReactNode; island?: ReactNode; below?: ReactNode; wall: string }) {
  return <main className={`${styles.phone} ${wall}`} aria-label="iPhone home screen preview">
    {island}
    {banner && <div className={styles.homeBanner}>{banner}</div>}
    {below && <div className={styles.tinyCompare}><p>Tiny circle (when another app&rsquo;s Live Activity is also running)</p><div className={styles.tinyCompareRow}>{below}</div></div>}
    <div className={styles.homeGrid} aria-hidden>
      {Array.from({ length: 20 }, (_, index) => index === 6
        ? <span key={index} className={styles.homeApp}><img src={APP_ICON} alt="" /><small>The Maroon</small></span>
        : <span key={index} className={styles.homeApp}><i /><small /></span>)}
    </div>
    <div className={styles.dock} aria-hidden>{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
  </main>;
}

/** iPhone notification card: app icon, title, body, time. Signed in or out, it shows the real update. */
function PhoneNotification({ note }: { note: AppNotification }) {
  return <article className={styles.phoneNote}>
    <img className={styles.phoneNoteIcon} src={APP_ICON} alt="" />
    <div className={styles.phoneNoteText}>
      <p className={styles.phoneNoteTitle}><b>{note.title}</b><time>{timeAgo(note.createdAt, SAMPLE_NOW)}</time></p>
      <p className={styles.phoneNoteBody}>{note.body}</p>
    </div>
  </article>;
}

/** One group's notifications stack (Apple thread-id = the group), with the count on top. */
function PhoneNotificationStack({ notes }: { notes: AppNotification[] }) {
  return <div className={styles.stack}>
    <PhoneNotification note={notes[0]} />
    {notes.length > 1 && <span className={styles.stackLayer} aria-hidden />}
    {notes.length > 2 && <span className={`${styles.stackLayer} ${styles.stackLayerBack}`} aria-hidden />}
    <p className={styles.stackCount}>{notes.length - 1} more from {notes[0].groupName}</p>
  </div>;
}

/** Signed out + tapped a notification: sign in first, then the app opens the notification's screen. */
function SignInFirst({ note }: { note: AppNotification }) {
  return <main className={`${styles.phone} ${styles.appScreen}`} aria-label="Sign in to open a notification">
    <div className={styles.signIn}>
      <img src={APP_ICON} alt="" className={styles.signInIcon} />
      <p className={styles.signInEyebrow}>{note.groupName}</p>
      <h1>{note.title}</h1>
      <p className={styles.signInBody}>{note.body}</p>
      <button type="button" className={styles.primaryButton}>Sign in to see it</button>
      <p className={styles.signInHint}>You&rsquo;ll go straight to this update after signing in.</p>
    </div>
  </main>;
}

/* ---------- Live Activity ---------- */

/**
 * The round's Live Activity, styled like the Golf tab board. Sections by competition type (Both = all three):
 * (1) teams — the two teams in their color fills with their points (Both, Team only);
 * (2) leaderboard — three rows, cream rank badges, mine black (Both, Individual only);
 * (3) my status pill for this step of the round (always). None: the round line above the pill. Individual only: the
 * app icon + "The Maroon" and a line above the leaderboard.
 * Used on the lock screen, the Android pinned notification and the expanded Dynamic Island.
 */
function RoundLiveActivity({ activity, island = false }: { activity: LiveRoundActivity; island?: boolean }) {
  const board = liveLeaderboard(activity.leaderboard ?? []);
  const none = !activity.teams && board.rows.length === 0;
  return <article className={`${styles.both} ${island ? styles.bothIsland : ""}`} aria-label="Live Activity">
    {none && <p className={styles.roundLine}><img src={APP_ICON} alt="" /><b>{activity.groupName}</b></p>}
    {/* Individual only: the app's name over the mini leaderboard, then a line (owner 2026-10-19). */}
    {!activity.teams && board.rows.length > 0 && <p className={`${styles.roundLine} ${styles.appHeader}`}><img src={APP_ICON} alt="" /><b>The Maroon</b></p>}
    {activity.teams && <div className={`${styles.bothTeams} ${board.rows.length ? "" : styles.bothTeamsBig}`}>
      {[activity.teams.mine, activity.teams.other].map((team, index) => <div key={team.name} className={`${styles.bothTeam} ${index ? styles.bothTeamRight : styles.bothTeamLeft}`}
        style={{ color: liveTeamText(team.onDark) }}>
        <span>{team.name}</span><b>{formatPoints(team.points)}</b>
      </div>)}
    </div>}
    {board.rows.length > 0 && <ol className={styles.bothBoard} aria-label="Leaderboard">
      {board.rows.map(row => <li key={row.name} className={row.me ? styles.bothMe : undefined}>
        <span className={styles.bothRank}>{row.position}</span>
        <span className={styles.bothName}>{row.name}</span>
        <b data-par={row.toPar < 0 ? "under" : row.toPar === 0 ? "even" : "over"}>{formatToPar(row.toPar)}</b>
      </li>)}
    </ol>}
    <MatchStatusPill activity={activity} status={pillStatus(activity, SAMPLE_LOCAL_NOW)} />
  </article>;
}

/**
 * My round, by step: popped up → tee time + opponent; live → score, match, thru; over → result + next tee time and course
 * (no "Next" word: a bold time after a finished match reads as the next tee time, and it leaves the course room; owner
 * 2026-10-19); final → result.
 */
function MatchStatusPill({ activity, status }: { activity: LiveRoundActivity; status: PillStatus }) {
  const opponent = activity.match ? opponentLabel(activity.match.opponents) : "";
  // No match (Individual only / None): the left side is the round itself.
  const where = <><span className={styles.fitLead}>Round {activity.round} ·&nbsp;</span><FitText>{activity.course}</FitText></>;
  const score = <b data-par={activity.toPar < 0 ? "under" : activity.toPar === 0 ? "even" : "over"}>{formatToPar(activity.toPar)}</b>;
  return <p className={styles.bothStatus}>
    {status.kind === "countdown" && <><span className={styles.bothStatusLeft}>{opponent ? <span className={styles.fitLead}>Tee <b>{status.clock}</b> vs {opponent}</span> : <><span className={styles.fitLead}>Tee <b>{status.clock}</b> ·&nbsp;</span><FitText>{activity.course}</FitText></>}</span><b className={styles.bothStatusRight}>{status.minutes}</b></>}
    {status.kind === "live" && <><span className={styles.bothStatusLeft}>{activity.match ? <span className={styles.fitLead}>{status.mark ? <MatchArrow mark={status.mark} /> : null}{opponent && <>&nbsp;vs {opponent}</>}</span> : where}</span>
      <span className={styles.bothStatusRight}>{score} · {thruLabel(activity) === "F" ? "Final" : thruLabel(activity)}</span></>}
    {status.kind === "next" && <><span className={styles.bothStatusLeft}><span className={styles.fitLead}>{activity.result ? <><Result text={activity.result} />{opponent && <> vs {opponent}</>}</> : <>Round {activity.round} · {score}</>}</span></span>
      <span className={`${styles.bothStatusRight} ${styles.bothStatusFit}`}><span className={styles.fitLead}><b>{status.clock}</b>{activity.nextCourse && <>&nbsp;·&nbsp;</>}</span>{activity.nextCourse && <FitText>{activity.nextCourse}</FitText>}</span></>}
    {status.kind === "result" && <><span className={styles.bothStatusLeft}><span className={styles.fitLead}><Result text={status.result} />{opponent && <> vs {opponent}</>}</span></span><span className={styles.bothStatusRight}>Final</span></>}
  </p>;
}

/**
 * Left of the camera, by competition type: team points in their colors (Both, Team only), my leaderboard spot
 * (Individual only) or the logo (None). Right: my status for this step of the round.
 */
function IslandCompactTeam({ activity }: { activity: LiveRoundActivity }) {
  const status = pillStatus(activity, SAMPLE_LOCAL_NOW);
  const mine = activity.leaderboard?.find(row => row.me);
  return <div className={`${styles.island} ${styles.islandCompact} ${styles.islandCompactWide}`} aria-label="Dynamic Island, compact">
    <span className={styles.islandTeams}>
      {activity.teams ? <><b style={{ color: liveTeamText(activity.teams.mine.onDark) }}>{formatPoints(activity.teams.mine.points)}</b><b style={{ color: liveTeamText(activity.teams.other.onDark) }}>{formatPoints(activity.teams.other.points)}</b></>
        : mine ? <span className={`${styles.bothRank} ${styles.islandRank}`} aria-label={`Position ${mine.position}`}>{mine.position}</span>
        : <img src={APP_ICON} alt="" className={styles.islandLogo} />}
    </span>
    <span className={styles.islandMine}>
      {status.kind === "countdown" && <><b>{status.minutes}</b><small>{status.clock}</small></>}
      {status.kind === "live" && <><b>{status.toPar}</b>{status.mark && <MatchArrow mark={status.mark} />}<small>{thruLabel(activity) === "F" ? "F" : status.thru}</small></>}
      {status.kind === "next" && <><small>Next</small><b>{status.clock}</b></>}
      {status.kind === "result" && <Result text={status.result} />}
    </span>
  </div>;
}

/**
 * A course name that shrinks to fit its space, down to 85% (what SwiftUI's minimumScaleFactor(0.85) does on the iPhone and
 * auto-size text on Android), then "…" as the last resort.
 */
function FitText({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Exact (sub-pixel) widths: whole-pixel scrollWidth can call a text "fitting" while the browser still draws "…".
    const fit = () => {
      const range = document.createRange();
      range.selectNodeContents(element);
      let scale = 1;
      element.style.fontSize = "";
      const box = () => element.getBoundingClientRect().width;
      // The box is the text's width when it fits, narrower when it doesn't: shrink only while the text is wider.
      while (range.getBoundingClientRect().width > box() + 0.05 && scale > 0.85 + 1e-9) {
        scale = Math.max(0.85, scale - 0.025);
        element.style.fontSize = `${scale}em`;
      }
      element.dataset.scale = String(Math.round(scale * 1000) / 1000);
      element.dataset.fits = String(range.getBoundingClientRect().width <= box() + 0.05);
    };
    fit();
    // Measure again when the space changes (another phone size) or the fonts finish loading.
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement.parentElement ?? element.parentElement);
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) fit(); });
    return () => { alive = false; observer.disconnect(); };
  }, [children]);
  return <span ref={ref} className={styles.fitText}>{children}</span>;
}

/** A finished match result in its tone: gold for a win, gray for a loss, white when halved. */
function Result({ text }: { text: string }) {
  return <b data-tone={resultTone(text) ?? undefined}>{text}</b>;
}

/** The holes, then a filled triangle on the right, as tall as the number (like Android's ▲): 3▲ = 3 up, 2▼ = 2 down (no "UP" / "DN" word); all square = "AS". */
function MatchArrow({ mark }: { mark: NonNullable<ReturnType<typeof matchMark>> }) {
  if (mark.direction === "even") return <span className={styles.matchArrow}>AS</span>;
  return <span className={styles.matchArrow} aria-label={`${mark.holes} ${mark.direction === "up" ? "up" : "down"}`}>
    {mark.holes}<svg className={styles.matchTriangle} viewBox="0 0 10 10" aria-hidden><path d={mark.direction === "up" ? "M5 1 L9.5 9 H0.5 Z" : "M5 9 L9.5 1 H0.5 Z"} fill="currentColor" /></svg>
  </span>;
}

/** The tiny circle fits about 3 characters: the same status, squeezed. */
function IslandMinimalTeam({ activity }: { activity: LiveRoundActivity }) {
  const status = pillStatus(activity, SAMPLE_LOCAL_NOW);
  return <span className={styles.tinyCircle} data-tone={status.kind === "result" ? resultTone(status.result) ?? undefined : undefined}>{status.tiny}</span>;
}

/* ---------- Android (Live Updates) ---------- */

/** Android home screen: status bar (clock + chip on the left, icons on the right) under the Pixel's center camera. */
function AndroidHome({ chip, wall }: { chip: ReactNode; wall: string }) {
  return <main className={`${styles.phone} ${styles.androidScreen} ${wall}`} aria-label="Android home screen preview">
    <div className={styles.androidStatus}><span className={styles.androidClock}>2:11</span>{chip}<span className={styles.androidIcons} aria-hidden>▲ ◢ ▮</span></div>
    <div className={styles.homeGrid} aria-hidden>
      {Array.from({ length: 16 }, (_, index) => index === 5
        ? <span key={index} className={styles.homeApp}><img src={APP_ICON} alt="" className={styles.androidIcon} /><small>The Maroon</small></span>
        : <span key={index} className={styles.homeApp}><i className={styles.androidIcon} /><small /></span>)}
    </div>
  </main>;
}

/**
 * Android's status bar chip: Android draws it — the app's small icon (Android requires a one-color silhouette, not the
 * full-color logo; this "M" stands in until that icon is designed) and a few characters, in the phone's font. The
 * dark maroon is our requested color; Android may show its own.
 */
function AndroidChip({ activity }: { activity: LiveRoundActivity }) {
  const status = pillStatus(activity, SAMPLE_LOCAL_NOW);
  return <span className={styles.androidChip} aria-label="Live update"><SmallIcon /><span data-tone={status.kind === "result" ? resultTone(status.result) ?? undefined : undefined}>{status.tiny}</span></span>;
}

/** Stand-in for the Android small icon: a one-color "M" silhouette. */
function SmallIcon() {
  return <svg className={styles.smallIcon} viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M3 19V5h3.2L12 13.2 17.8 5H21v14h-3V10.2l-6 8.2-6-8.2V19z" /></svg>;
}

/**
 * Android lock screen with the pinned Live Update: Google's standard notification (no custom layout or fonts allowed for
 * a Live Update) — header (small icon, app, trip, when), title, one text line, a progress bar while the round is live.
 */
function AndroidLock({ activity, wall }: { activity: LiveRoundActivity; wall: string }) {
  const update = androidLiveUpdate(activity, SAMPLE_LOCAL_NOW);
  return <main className={`${styles.phone} ${styles.androidScreen} ${wall}`} aria-label="Android lock screen preview">
    <div className={styles.androidStatus}><span className={styles.androidClock}>2:11</span><AndroidChip activity={activity} /><span className={styles.androidIcons} aria-hidden>▲ ◢ ▮</span></div>
    <div className={styles.androidLockClock}><span>2:11</span><small>Fri, Oct 16</small></div>
    <article className={styles.androidNote} aria-label="Live update">
      <header><span className={styles.androidNoteIcon}><SmallIcon /></span><span>The Maroon · {activity.groupName} · now</span></header>
      <p className={styles.androidNoteTitle}>{update.title}</p>
      <p className={styles.androidNoteText}>{update.text}</p>
      {update.progress !== null && <div className={styles.androidProgress} aria-label={`${activity.thru} of ${activity.holes} holes`}><span style={{ width: `${update.progress * 100}%` }} /></div>}
    </article>
  </main>;
}

/**
 * Android lock screen with an ordinary notification (not a Live Update): Google's standard layout in the phone's font —
 * small icon, app · trip · time, title, text. Same styles as the pinned Live Update above. Emoji are drawn by the
 * phone, so they will look like Android's own set, not exactly like this preview.
 */
function AndroidNotificationScreen({ note, wall }: { note: AppNotification | null; wall: string }) {
  return <main className={`${styles.phone} ${styles.androidScreen} ${wall}`} aria-label="Android lock screen preview">
    <div className={styles.androidStatus}><span className={styles.androidClock}>2:11</span><span className={styles.androidIcons} aria-hidden>▲ ◢ ▮</span></div>
    <div className={styles.androidLockClock}><span>2:11</span><small>Fri, Oct 16</small></div>
    {note && <article className={styles.androidNote} aria-label="Notification">
      <header><span className={styles.androidNoteIcon}><SmallIcon /></span><span>The Maroon · {note.groupName} · {timeAgo(note.createdAt, SAMPLE_NOW)}</span></header>
      <p className={styles.androidNoteTitle}>{note.title}</p>
      <p className={styles.androidNoteText}>{note.body}</p>
    </article>}
  </main>;
}

/* ---------- In-app ---------- */

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  highlight: Flame, teeTime: CalendarClock, opponentSubmitted: ClipboardCheck, cardMismatch: AlertTriangle, roundFinal: Trophy,
  joinRequest: UserPlus, requestAccepted: Check, requestDeclined: X, invited: Mail, linkRequest: Link2,
  travel: Plane, announcement: Megaphone,
};

/** A plain app screen behind the in-app previews: the trip's maroon top bar with the bell. */
function AppScreen({ children, banner, notes = SAMPLE_NOTIFICATIONS }: { children?: ReactNode; banner?: ReactNode; notes?: AppNotification[] }) {
  const unread = unreadCount(notes);
  return <main className={`${styles.phone} ${styles.appScreen}`} aria-label="App preview">
    <header className={styles.appBar}>
      <span>Desert Classic</span>
      <span className={styles.bell}><Bell size={24} strokeWidth={1.75} aria-hidden />{!children && unread > 0 && <b aria-label={`${unread} unread`}>{unread}</b>}</span>
    </header>
    {banner}
    {children ? <div className={styles.sheet}>{children}</div> : <div className={styles.appPlaceholder} aria-hidden><i /><i /><i /></div>}
  </main>;
}

/** The bell's list: newest first, unread marked, tap opens the link. */
export function NotificationList({ notes, now }: { notes: AppNotification[]; now: Date }) {
  const sorted = newestFirst(notes);
  const unread = unreadCount(notes);
  return <section className={styles.list} aria-label="Notifications">
    <header className={styles.listHeader}><h2>Notifications</h2>{unread > 0 && <span>{unread} new</span>}</header>
    {sorted.length === 0
      ? <p className={styles.listEmpty}>No notifications yet. Scores, tee times and requests for your groups will show up here.</p>
      : <ul>{sorted.map(note => {
        const Icon = KIND_ICONS[note.kind];
        return <li key={note.id} className={note.read ? undefined : styles.unread}>
          <span className={styles.listIcon}><Icon size={18} aria-hidden /></span>
          <div><p className={styles.listTitle}>{note.title}</p><p className={styles.listBody}>{note.body}</p><p className={styles.listMeta}>{note.groupName} · {timeAgo(note.createdAt, now)}</p></div>
          {!note.read && <i className={styles.dot} aria-label="Unread" />}
        </li>;
      })}</ul>}
  </section>;
}

/** Slides down over the app while it's open; tap opens the link. */
export function TopBanner({ note }: { note: AppNotification }) {
  const Icon = KIND_ICONS[note.kind];
  return <div className={styles.topBanner} role="status">
    <span className={styles.listIcon}><Icon size={18} aria-hidden /></span>
    <div><p className={styles.listTitle}>{note.title}</p><p className={styles.topBannerBody}>{note.body}</p></div>
  </div>;
}
