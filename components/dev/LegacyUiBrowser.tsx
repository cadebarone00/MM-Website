import styles from "./LegacyUiBrowser.module.css";

const SCREEN_GROUPS = [
  { label: "Website", screens: [
    ["Tournament home", "/website"], ["History", "/history"],
    ["Schedule", "/schedule"], ["Teams", "/teams"], ["Players", "/players"],
    ["Leaderboard", "/leaderboard"], ["Watch Live", "/watch-live"],
    ["Broadcast", "/broadcast"],
  ] },
  { label: "2026 archive", screens: [
    ["2026 results", "/leaderboard/2026-palm-springs"],
    ["2026 teams", "/teams/2026-palm-springs"],
    ["2026 schedule", "/schedule/2026-palm-springs"],
  ] },
  { label: "Player portal", screens: [
    ["Portal home", "/portal"], ["Edit legacy bio", "/portal/profile"],
    ["My matches", "/portal/scoring"], ["Live scoring", "/portal/scoring/play"],
    ["Handicap", "/portal/handicap"], ["Enter a round", "/portal/handicap/new"],
    ["Career statistics", "/portal/career"], ["Player lookup", "/portal/player-lookup"],
    ["Skins", "/portal/skins"], ["Round videos", "/portal/round-video"],
  ] },
  { label: "Other application screens", screens: [
    ["Fantasy", "/fantasy"], ["My fantasy team", "/my-team"],
    ["Wagers", "/wagers"], ["Wager portfolio", "/wagers/portfolio"],
  ] },
  { label: "Administration", screens: [
    ["Admin Center", "/portal/admin"], ["Players", "/portal/admin/players"],
    ["Course library", "/portal/admin/course-library"],
    ["Scorecards", "/portal/admin/scorecards"],
    ["Scoring editor", "/portal/admin/scoring-preview"],
    ["Broadcast controls", "/portal/admin/broadcast-controls"],
    ["Career data", "/portal/admin/career-stats"],
    ["Website settings", "/portal/admin/website-settings"],
    ["Website editor", "/portal/admin/website-editor"],
    ["Highlights", "/portal/admin/highlights"],
  ] },
] as const;

export function LegacyUiBrowser({ requestedScreen, requestedViewport }: { requestedScreen?: string | string[]; requestedViewport?: string | string[] }) {
  const screen = typeof requestedScreen === "string" && SCREEN_GROUPS.some(group => group.screens.some(item => item[1] === requestedScreen)) ? requestedScreen : "/website";
  const width = requestedViewport === "mobile" ? "mobile" : "desktop";
  const reloadHref = `/dev-v1?${new URLSearchParams({ screen, viewport: width })}`;
  const label = SCREEN_GROUPS.flatMap(group => [...group.screens]).find(item => item[1] === screen)?.[0] ?? "V1";

  return <main className={styles.browser}>
    <header className={styles.toolbar}>
      <div className={styles.title}><span>The Maroon</span><h1>V1 UI review</h1></div>
      <form action="/dev-v1" method="get" className={styles.selection}>
      <label className={styles.control}>Screen
        <select name="screen" defaultValue={screen}>
          {SCREEN_GROUPS.map(group => <optgroup key={group.label} label={group.label}>
            {group.screens.map(([name, href]) => <option key={href} value={href}>{name}</option>)}
          </optgroup>)}
        </select>
      </label>
      <label className={styles.control}>Viewport
        <select name="viewport" defaultValue={width}>
          <option value="desktop">Desktop</option><option value="mobile">Mobile · 393px</option>
        </select>
      </label>
      <button type="submit">View screen</button>
      </form>
      <a href={reloadHref}>Reload screen</a>
      <a href={screen} target="_blank" rel="noopener noreferrer">Open original ↗</a>
      <nav aria-label="Development areas"><a href="/dev" target="_top">V2 simulator</a><a href="/dev?group=Website%20desktop" target="_top">Website desktop</a><a href="/dev?group=Website%20mobile" target="_top">Website mobile</a></nav>
    </header>
    <section className={styles.stage} aria-label="Legacy application screen">
      <iframe src={screen} title={`V1 — ${label}`} className={width === "mobile" ? styles.mobile : styles.desktop} />
    </section>
  </main>;
}
