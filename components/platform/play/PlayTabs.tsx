import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { readableText, safeColor } from "@/components/platform/tournament-site/theme";
import { publicBasePath } from "@/lib/platform/publicSite";
import { PAIRINGS_HOLDING, SCORING_HOLDING } from "@/lib/platform/tournamentHome";
import type { TournamentHome } from "@/lib/platform/tournamentHomeServer";
import { Holding, initials, PlaySection, PlayShell } from "./PlayShell";
import styles from "./Play.module.css";

/** Matches: the real round schedule; pairings wait for live scoring. */
export function PlayMatches({ home: { slug, year, site } }: { home: TournamentHome }) {
  return <PlayShell slug={slug} year={year} site={site} tab="matches">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>Matches</h1>
      <Holding title={PAIRINGS_HOLDING}>Matchups appear here once the commissioner posts them.</Holding>
      {site.days.length === 0 ? <Holding title="The schedule hasn't been posted yet." />
        : site.days.map((day) => <PlaySection key={day.date} title={day.label} id={`day-${day.date}`}>
          <ul className={styles.rows}>{day.sessions.map((session) => <li key={session.id} className={styles.row}>
            <span className={styles.rowMain}><strong>{session.label}</strong><small>{session.format} · {site.courses.find((c) => c.id === session.courseId)?.name ?? "Course TBD"}</small></span>
            <span className={styles.rowSide}>{session.teeTime}</span>
          </li>)}</ul>
        </PlaySection>)}
      <p className={styles.footnote}>Times shown in {site.timezone}.</p>
    </div>
  </PlayShell>;
}

/** Leaderboard: nothing to rank until live scoring exists, so a holding state plus the teams. */
export function PlayLeaderboard({ home: { slug, year, site } }: { home: TournamentHome }) {
  return <PlayShell slug={slug} year={year} site={site} tab="leaderboard">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>Leaderboard</h1>
      <Holding title={SCORING_HOLDING}>Standings update here once rounds are scored.</Holding>
      {site.competition === "teams" && site.teams.length > 0 && <PlaySection title="Teams">
        <ul className={styles.rows}>{site.teams.map((team) => <li key={team.id} className={styles.row}>
          <span className={styles.teamSwatch} style={{ background: safeColor(team.color), color: readableText(safeColor(team.color)) }}>{initials(team.name)}</span>
          <span className={styles.rowMain}><strong>{team.name}</strong></span>
          <span className={styles.rowSide}>–</span>
        </li>)}</ul>
      </PlaySection>}
    </div>
  </PlayShell>;
}

/** Players: the real roster, grouped by team when there are teams. */
export function PlayPlayers({ home: { slug, year, site } }: { home: TournamentHome }) {
  const groups = site.competition === "teams" && site.teams.length
    ? [...site.teams.map((team) => ({ key: team.id, title: team.name, color: team.color, players: site.players.filter((p) => p.teamId === team.id) })),
      { key: "none", title: "Not on a team yet", color: null, players: site.players.filter((p) => !p.teamId || !site.teams.some((t) => t.id === p.teamId)) }]
    : [{ key: "all", title: "The field", color: null, players: site.players }];
  return <PlayShell slug={slug} year={year} site={site} tab="players">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>Players</h1>
      {site.players.length === 0 ? <Holding title="No players listed yet." />
        : groups.filter((g) => g.players.length).map((group) => <PlaySection key={group.key} title={`${group.title} · ${group.players.length}`} id={`group-${group.key}`}>
          <ul className={styles.rows}>{group.players.map((player) => <li key={player.id} className={styles.row}>
            <span className={styles.avatar} style={group.color ? { borderColor: safeColor(group.color) } : undefined}>{initials(player.name)}</span>
            <span className={styles.rowMain}><strong>{player.name}</strong>{player.captain && <small>Captain</small>}</span>
          </li>)}</ul>
        </PlaySection>)}
    </div>
  </PlayShell>;
}

/** More: courses, tournament info and the public website. */
export function PlayMore({ home: { slug, year, site } }: { home: TournamentHome }) {
  return <PlayShell slug={slug} year={year} site={site} tab="more">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>More</h1>
      <PlaySection title="Courses">
        {site.courses.length === 0 ? <Holding title="Courses to be announced." />
          : <ul className={styles.rows}>{site.courses.map((course) => <li key={course.id} className={styles.row}>
            <span className={styles.rowMain}><strong>{course.name}</strong><small>{[course.location, course.tee !== "TBD" ? `${course.tee} tees` : null, course.par ? `Par ${course.par}` : null].filter(Boolean).join(" · ")}</small></span>
          </li>)}</ul>}
      </PlaySection>
      <PlaySection title="Tournament info">
        <dl className={styles.info}>{site.information.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      </PlaySection>
      <nav className={styles.rows} aria-label="Links">
        <a className={styles.linkRow} href={publicBasePath(slug, year)}>Tournament website <ArrowUpRight size={16} aria-hidden="true" /></a>
        <Link className={styles.linkRow} href="/tournaments/join">All tournaments <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </nav>
    </div>
  </PlayShell>;
}
