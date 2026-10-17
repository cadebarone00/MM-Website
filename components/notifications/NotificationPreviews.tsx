"use client";

import { AlertTriangle, Bell, CalendarClock, Camera, Check, ClipboardCheck, Flame, Flashlight, Link2, LockKeyhole, Mail, Trophy, UserPlus, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { formatPoints, liveActivityContent, matchMark, newestFirst, timeAgo, unreadCount } from "@/lib/notifications/format";
import type { AppNotification, LiveRoundActivity, NotificationKind } from "@/lib/notifications/types";
import { NOTIFICATION_PREVIEWS, SAMPLE_FINAL_ROUND, SAMPLE_LIVE_MATCH, SAMPLE_LIVE_ROUND, SAMPLE_LIVE_TEAM, SAMPLE_NOTIFICATIONS, SAMPLE_NOW, type NotificationPreview, type NotificationSurface } from "@/lib/dev/sampleNotifications";
import styles from "./NotificationPreviews.module.css";

const APP_ICON = "/icons/mm-192.png";

/** DEV ONLY: one surface of the simulator's Notifications group; the simulator condition picks the screen. */
export function NotificationPreviewScreen({ surface }: { surface: NotificationSurface }) {
  const requested = useSimulator()?.state.notificationPreview;
  const screens: readonly NotificationPreview[] = NOTIFICATION_PREVIEWS[surface];
  const screen = requested && screens.includes(requested) ? requested : screens[0];
  const [latest, ...older] = newestFirst(SAMPLE_NOTIFICATIONS);
  switch (screen) {
    case "lock": case "signed-out-lock": return <LockScreen><PhoneNotification note={latest} /></LockScreen>;
    case "lock-stack": return <LockScreen><PhoneNotificationStack notes={[latest, ...older.slice(0, 2)]} /></LockScreen>;
    case "banner": return <HomeScreen banner={<PhoneNotification note={latest} />} />;
    case "signed-out-tap": return <SignInFirst note={latest} />;
    case "live-lock": return <LockScreen><LiveActivityLock activity={SAMPLE_LIVE_ROUND} /></LockScreen>;
    case "live-lock-match": return <LockScreen><LiveActivityLock activity={SAMPLE_LIVE_MATCH} /></LockScreen>;
    case "live-final": return <LockScreen><LiveActivityLock activity={SAMPLE_FINAL_ROUND} /></LockScreen>;
    case "island-compact": return <HomeScreen island={<IslandCompact activity={SAMPLE_LIVE_MATCH} />} />;
    case "island-compact-team": return <HomeScreen island={<IslandCompactTeam activity={SAMPLE_LIVE_TEAM} />} />;
    case "island-minimal-team": return <HomeScreen island={<IslandMinimalTeam activity={SAMPLE_LIVE_TEAM} />} />;
    case "island-expanded": return <HomeScreen island={<IslandExpanded activity={SAMPLE_LIVE_MATCH} />} />;
    case "island-minimal": return <HomeScreen island={<IslandMinimal activity={SAMPLE_LIVE_MATCH} />} />;
    case "bell-unread": return <AppScreen><NotificationList notes={SAMPLE_NOTIFICATIONS} now={SAMPLE_NOW} /></AppScreen>;
    case "bell-read": return <AppScreen><NotificationList notes={SAMPLE_NOTIFICATIONS.map(note => ({ ...note, read: true }))} now={SAMPLE_NOW} /></AppScreen>;
    case "bell-empty": return <AppScreen><NotificationList notes={[]} now={SAMPLE_NOW} /></AppScreen>;
    case "top-banner": return <AppScreen banner={<TopBanner note={latest} />} />;
  }
}

/* ---------- Phone (lock screen / home screen) ---------- */

function LockScreen({ children }: { children: ReactNode }) {
  return <main className={`${styles.phone} ${styles.wallpaper}`} aria-label="Locked iPhone preview">
    <div className={styles.lockTop}>
      <LockKeyhole size={16} strokeWidth={2.25} aria-hidden />
      <p className={styles.lockDate}>Friday, October 16</p>
      <p className={styles.lockClock}>9:41</p>
    </div>
    <div className={styles.lockStack}>{children}</div>
    <div className={styles.lockButtons} aria-hidden><span><Flashlight size={20} /></span><span><Camera size={20} /></span></div>
  </main>;
}

function HomeScreen({ banner, island }: { banner?: ReactNode; island?: ReactNode }) {
  return <main className={`${styles.phone} ${styles.wallpaper}`} aria-label="iPhone home screen preview">
    {island}
    {banner && <div className={styles.homeBanner}>{banner}</div>}
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

function LiveActivityLock({ activity }: { activity: LiveRoundActivity }) {
  const content = liveActivityContent(activity);
  return <article className={styles.liveCard} aria-label="Live Activity">
    <header className={styles.liveHeader}>
      <img src={APP_ICON} alt="" />
      <span>{activity.groupName} · Round {activity.round}</span>
      <b>{content.final ? "Final" : content.thru}</b>
    </header>
    <div className={styles.liveMain}>
      <div>
        <p className={styles.liveName}>{activity.playerName}</p>
        <p className={styles.liveCourse}>{activity.course}</p>
      </div>
      <p className={styles.liveScore}>{content.toPar}</p>
      {content.position && <p className={styles.livePosition}><small>{content.final ? "Finished" : "Position"}</small>{content.position}</p>}
    </div>
    <div className={styles.liveProgress} aria-label={`${activity.thru} of ${activity.holes} holes`}><span style={{ width: `${content.progress * 100}%` }} /></div>
    {content.matchStatus && <p className={styles.liveMatch}><Trophy size={14} aria-hidden /><b>{content.matchStatus}</b> vs {content.opponent}</p>}
  </article>;
}

function IslandCompact({ activity }: { activity: LiveRoundActivity }) {
  const content = liveActivityContent(activity);
  return <div className={`${styles.island} ${styles.islandCompact}`} aria-label="Dynamic Island, compact">
    <span className={styles.islandLeading}><img src={APP_ICON} alt="" />{content.toPar}</span>
    <span className={styles.islandTrailing}>{content.matchStatus || content.thru}</span>
  </div>;
}

/** Owner idea: left of the camera = team points (each in its team's color); right = my round score, match arrow, thru. */
function IslandCompactTeam({ activity }: { activity: LiveRoundActivity }) {
  const content = liveActivityContent(activity);
  const mark = activity.match ? matchMark(activity.match.status) : null;
  return <div className={`${styles.island} ${styles.islandCompact} ${styles.islandCompactWide}`} aria-label="Dynamic Island, compact (team)">
    <span className={styles.islandTeams}>
      {activity.teams && <><b style={{ color: activity.teams.mine.color }}>{formatPoints(activity.teams.mine.points)}</b><b style={{ color: activity.teams.other.color }}>{formatPoints(activity.teams.other.points)}</b></>}
    </span>
    <span className={styles.islandMine}>
      <b>{content.toPar}</b>
      {mark && <MatchArrow mark={mark} />}
      <small>{activity.thru}</small>
    </span>
  </div>;
}

/** Filled triangle with the holes: ▲3 = 3 up, ▼2 = 2 down; all square = "AS". */
function MatchArrow({ mark }: { mark: NonNullable<ReturnType<typeof matchMark>> }) {
  if (mark.direction === "even") return <span className={styles.matchArrow}>AS</span>;
  return <span className={styles.matchArrow} aria-label={`${mark.holes} ${mark.direction === "up" ? "up" : "down"}`}>
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden><path d={mark.direction === "up" ? "M5 1 L9.5 9 H0.5 Z" : "M5 9 L9.5 1 H0.5 Z"} fill="currentColor" /></svg>{mark.holes}
  </span>;
}

/** The tiny circle fits about 3 characters: my match arrow. */
function IslandMinimalTeam({ activity }: { activity: LiveRoundActivity }) {
  const mark = activity.match ? matchMark(activity.match.status) : null;
  return <div className={styles.islandMinimalRow} aria-label="Dynamic Island, minimal (team)">
    <div className={`${styles.island} ${styles.islandMinimalMain}`} />
    <div className={`${styles.island} ${styles.islandMinimal}`}>{mark ? <MatchArrow mark={mark} /> : formatPoints(activity.teams?.mine.points ?? 0)}</div>
  </div>;
}

function IslandMinimal({ activity }: { activity: LiveRoundActivity }) {
  return <div className={styles.islandMinimalRow} aria-label="Dynamic Island, minimal">
    <div className={`${styles.island} ${styles.islandMinimalMain}`} />
    <div className={`${styles.island} ${styles.islandMinimal}`}>{liveActivityContent(activity).toPar}</div>
  </div>;
}

function IslandExpanded({ activity }: { activity: LiveRoundActivity }) {
  const content = liveActivityContent(activity);
  return <div className={`${styles.island} ${styles.islandExpanded}`} aria-label="Dynamic Island, expanded">
    <div className={styles.islandExpandedTop}>
      <span className={styles.islandLeading}><img src={APP_ICON} alt="" />{content.toPar}</span>
      <span className={styles.islandExpandedRight}>{content.thru}<small>{content.position && `Position ${content.position}`}</small></span>
    </div>
    {/* Apple's center region: below the camera, between the two top corners. */}
    <p className={styles.islandExpandedCenter}>{activity.playerName}</p>
    <div className={styles.liveProgress}><span style={{ width: `${content.progress * 100}%` }} /></div>
    <p className={styles.islandExpandedBottom}>{content.matchStatus ? <><b>{content.matchStatus}</b> vs {content.opponent}</> : `${activity.groupName} · Round ${activity.round}`}</p>
  </div>;
}

/* ---------- In-app ---------- */

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  highlight: Flame, teeTime: CalendarClock, opponentSubmitted: ClipboardCheck, cardMismatch: AlertTriangle, roundFinal: Trophy,
  joinRequest: UserPlus, requestAccepted: Check, requestDeclined: X, invited: Mail, linkRequest: Link2,
};

/** A plain app screen behind the in-app previews: the trip's maroon top bar with the bell. */
function AppScreen({ children, banner }: { children?: ReactNode; banner?: ReactNode }) {
  const unread = unreadCount(SAMPLE_NOTIFICATIONS);
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
