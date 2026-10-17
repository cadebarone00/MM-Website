"use client";

import { AlertTriangle, Bell, CalendarClock, Camera, Check, ClipboardCheck, Flame, Flashlight, Link2, LockKeyhole, Mail, Trophy, UserPlus, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { formatPoints, formatToPar, liveLeaderboard, matchMark, newestFirst, pillStatus, readableOnBlack, textOnFill, timeAgo, unreadCount, type PillStatus } from "@/lib/notifications/format";
import type { AppNotification, LiveRoundActivity, NotificationKind } from "@/lib/notifications/types";
import { NOTIFICATION_PREVIEWS, SAMPLE_LIVE_TOP3, SAMPLE_LOCAL_NOW, SAMPLE_NOTIFICATIONS, SAMPLE_TEAM_STEPS, SAMPLE_NOW, type NotificationPreview, type NotificationSurface } from "@/lib/dev/sampleNotifications";
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
    case "both-live": return <LockScreen><BothLiveActivity activity={SAMPLE_TEAM_STEPS.live} /></LockScreen>;
    case "both-live-top3": return <LockScreen><BothLiveActivity activity={SAMPLE_LIVE_TOP3} /></LockScreen>;
    case "both-pre": case "both-over": case "both-final": return <LockScreen><BothLiveActivity activity={SAMPLE_TEAM_STEPS[screen.slice(5) as "pre" | "over" | "final"]} /></LockScreen>;
    case "both-expanded": return <HomeScreen island={<div className={`${styles.island} ${styles.islandExpanded}`} aria-label="Dynamic Island, expanded"><BothLiveActivity activity={SAMPLE_TEAM_STEPS.live} island /></div>} />;
    case "android-pre": case "android-live": case "android-over": case "android-final":
      return <AndroidHome chip={<AndroidChip activity={SAMPLE_TEAM_STEPS[screen.slice(8) as keyof typeof SAMPLE_TEAM_STEPS]} />} />;
    case "pill-pre": case "pill-live": case "pill-over": case "pill-final": {
      const activity = SAMPLE_TEAM_STEPS[screen.slice(5) as keyof typeof SAMPLE_TEAM_STEPS];
      return <HomeScreen island={<IslandCompactTeam activity={activity} />} below={<IslandMinimalTeam activity={activity} />} />;
    }
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

function HomeScreen({ banner, island, below }: { banner?: ReactNode; island?: ReactNode; below?: ReactNode }) {
  return <main className={`${styles.phone} ${styles.wallpaper}`} aria-label="iPhone home screen preview">
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
 * "Both" Live Activity (team + individual), styled like the Golf tab board: (1) the two teams in their color fills with
 * their points, (2) three leaderboard rows (cream rank badges, mine black; a line before me when I'm not top 3),
 * (3) my match status pill for this step of the round. Lock screen, Android pinned notification and expanded island.
 */
function BothLiveActivity({ activity, island = false }: { activity: LiveRoundActivity; island?: boolean }) {
  const board = liveLeaderboard(activity.leaderboard ?? []);
  return <article className={`${styles.both} ${island ? styles.bothIsland : ""}`} aria-label="Live Activity">
    {activity.teams && <div className={styles.bothTeams}>
      {[activity.teams.mine, activity.teams.other].map((team, index) => <div key={team.name} className={`${styles.bothTeam} ${index ? styles.bothTeamRight : styles.bothTeamLeft}`}
        style={{ background: team.color }} data-text={textOnFill(team.color)}>
        <span>{team.name}</span><b>{formatPoints(team.points)}</b>
      </div>)}
    </div>}
    {board.rows.length > 0 && <ol className={styles.bothBoard} aria-label="Leaderboard">
      {board.rows.map((row, index) => <li key={row.name} className={`${row.me ? styles.bothMe : ""} ${board.split && index === 2 ? styles.bothSplit : ""}`}>
        <span className={styles.bothRank}>{row.position}</span>
        <span className={styles.bothName}>{row.name}</span>
        <b data-par={row.toPar < 0 ? "under" : row.toPar === 0 ? "even" : "over"}>{formatToPar(row.toPar)}</b>
      </li>)}
    </ol>}
    <MatchStatusPill activity={activity} status={pillStatus(activity, SAMPLE_LOCAL_NOW)} />
  </article>;
}

/** My round, by step: popped up → tee time + opponent; live → score, match, thru; over → result + next tee; final → result. */
function MatchStatusPill({ activity, status }: { activity: LiveRoundActivity; status: PillStatus }) {
  const opponent = activity.match?.opponent;
  return <p className={styles.bothStatus}>
    {status.kind === "countdown" && <><span>Tee <b>{status.clock}</b>{opponent && <> vs {opponent}</>}</span><b className={styles.bothStatusRight}>{status.minutes}</b></>}
    {status.kind === "live" && <><span>{status.mark ? <MatchArrow mark={status.mark} /> : null}{status.mark && status.mark.direction !== "even" && <b>{status.mark.direction === "up" ? " UP" : " DN"}</b>}{opponent && <> vs {opponent}</>}</span>
      <span className={styles.bothStatusRight}><b data-par={status.toPar.startsWith("-") ? "under" : status.toPar === "E" ? "even" : "over"}>{status.toPar}</b> · Thru {status.thru}</span></>}
    {status.kind === "next" && <><span><b>{activity.result}</b>{opponent && <> vs {opponent}</>}</span><span className={styles.bothStatusRight}>Next <b>{status.clock}</b>{activity.nextCourse && <> · {activity.nextCourse}</>}</span></>}
    {status.kind === "result" && <><span><b>{status.result}</b>{opponent && <> vs {opponent}</>}</span><span className={styles.bothStatusRight}>Final</span></>}
  </p>;
}

/** Left of the camera: team points, each in its team's color. Right: the player's status for this step of the lifecycle. */
function IslandCompactTeam({ activity }: { activity: LiveRoundActivity }) {
  const status = pillStatus(activity, SAMPLE_LOCAL_NOW);
  return <div className={`${styles.island} ${styles.islandCompact} ${styles.islandCompactWide}`} aria-label="Dynamic Island, compact (team)">
    <span className={styles.islandTeams}>
      {activity.teams && <><b style={{ color: readableOnBlack(activity.teams.mine.color) }}>{formatPoints(activity.teams.mine.points)}</b><b style={{ color: readableOnBlack(activity.teams.other.color) }}>{formatPoints(activity.teams.other.points)}</b></>}
    </span>
    <span className={styles.islandMine}>
      {status.kind === "countdown" && <><b>{status.minutes}</b><small>{status.clock}</small></>}
      {status.kind === "live" && <><b>{status.toPar}</b>{status.mark && <MatchArrow mark={status.mark} />}<small>{status.thru}</small></>}
      {status.kind === "next" && <><small>Next</small><b>{status.clock}</b></>}
      {status.kind === "result" && <b className={styles.matchArrow}>{status.result}</b>}
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

/** The tiny circle fits about 3 characters: the same status, squeezed. */
function IslandMinimalTeam({ activity }: { activity: LiveRoundActivity }) {
  return <span className={styles.tinyCircle}>{pillStatus(activity, SAMPLE_LOCAL_NOW).tiny}</span>;
}

/* ---------- Android (Live Updates) ---------- */

/** Android home screen: status bar (clock + chip on the left, icons on the right) under the Pixel's center camera. */
function AndroidHome({ chip }: { chip: ReactNode }) {
  return <main className={`${styles.phone} ${styles.androidScreen}`} aria-label="Android home screen preview">
    <div className={styles.androidStatus}><span className={styles.androidClock}>2:11</span>{chip}<span className={styles.androidIcons} aria-hidden>▲ ◢ ▮</span></div>
    <div className={styles.homeGrid} aria-hidden>
      {Array.from({ length: 16 }, (_, index) => index === 5
        ? <span key={index} className={styles.homeApp}><img src={APP_ICON} alt="" className={styles.androidIcon} /><small>The Maroon</small></span>
        : <span key={index} className={styles.homeApp}><i className={styles.androidIcon} /><small /></span>)}
    </div>
  </main>;
}

/** Android's status bar chip: our logo + the same short status as the iPhone tiny circle. */
function AndroidChip({ activity }: { activity: LiveRoundActivity }) {
  return <span className={styles.androidChip} aria-label="Live update"><img src={APP_ICON} alt="" />{pillStatus(activity, SAMPLE_LOCAL_NOW).tiny}</span>;
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
