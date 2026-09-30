import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronRight, History, ListOrdered, Settings2, Users } from "lucide-react";
import { readableText, safeColor } from "@/components/platform/tournament-site/theme";
import type { Match, Player, Standing } from "@/components/platform/tournament-site/types";
import { PAIRINGS_HOLDING, parTone, positionLabel, SCORING_HOLDING, sessionFor, tabPath, type TournamentHome } from "@/lib/platform/tournamentHome";
import { MatchCard } from "./MatchCard";
import { Holding, initials, PlaySection, PlayShell } from "./PlayShell";
import styles from "./Play.module.css";

const STATUS_ORDER: Match["status"][] = ["live", "waiting", "scheduled", "final"];
const STATUS_TITLES: Record<Match["status"], string> = { live: "Live now", waiting: "Waiting", scheduled: "Upcoming", final: "Final" };

/** Matches: posted matches by status (live first), then the round schedule. Before pairings exist, a holding state. */
export function PlayMatches({ home }: { home: TournamentHome }) {
  const { site } = home;
  return <PlayShell home={home} tab="matches">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>Matches</h1>
      {site.matches.length === 0 ? <Holding title={PAIRINGS_HOLDING}>Matchups appear here once the commissioner posts them.</Holding>
        : STATUS_ORDER.map((status) => {
          const matches = site.matches.filter((m) => m.status === status);
          return matches.length > 0 && <PlaySection key={status} title={STATUS_TITLES[status]} id={`matches-${status}`}>
            <div className={styles.matchList}>{matches.map((match) =>
              <MatchCard key={match.id} match={match} players={site.players} teams={site.teams} round={sessionFor(home, match.id)?.label} />)}</div>
          </PlaySection>;
        })}
      <PlaySection title="Schedule" id="matches-schedule">
        {site.days.length === 0 ? <Holding title="The schedule hasn't been posted yet." />
          : <ul className={styles.rows}>{site.days.flatMap((day) => day.sessions.map((session) => <li key={session.id} className={styles.row}>
            <span className={styles.rowMain}><strong>{session.label}</strong><small>{day.label} · {session.format} · {site.courses.find((c) => c.id === session.courseId)?.name ?? "Course TBD"}</small></span>
            <span className={styles.rowSide}>{session.teeTime}</span>
          </li>))}</ul>}
      </PlaySection>
      <p className={styles.footnote}>Times shown in {site.timezone}.</p>
    </div>
  </PlayShell>;
}

function standingProgress(standing: Standing): string {
  if (standing.status === "final") return "F";
  if (standing.status === "live") return standing.progress ?? "Live";
  return standing.progress ?? "–";
}

/** Leaderboard: team points and the individual board once scores exist; a holding state before that. */
export function PlayLeaderboard({ home }: { home: TournamentHome }) {
  const { site } = home;
  const positions = site.standings.map((s) => s.position);
  const scored = site.teams.some((t) => typeof t.points === "number");
  return <PlayShell home={home} tab="leaderboard">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>Leaderboard</h1>
      {site.standings.length === 0 && !scored && <Holding title={SCORING_HOLDING}>Standings update here once rounds are scored.</Holding>}
      {site.competition === "teams" && site.teams.length > 0 && <PlaySection title="Teams">
        <ul className={styles.rows}>{[...site.teams].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).map((team) => <li key={team.id} className={styles.row}>
          <span className={styles.teamSwatch} style={{ background: safeColor(team.color), color: readableText(safeColor(team.color)) }}>{initials(team.name)}</span>
          <span className={styles.rowMain}><strong>{team.name}</strong></span>
          <span className={styles.bigScore}>{typeof team.points === "number" ? team.points : "–"}</span>
        </li>)}</ul>
      </PlaySection>}
      {site.standings.length > 0 && <PlaySection title="Individual">
        <ol className={styles.board}>
          <li className={styles.boardHead} aria-hidden="true"><span>Pos</span><span>Player</span><span>To par</span><span>Thru</span></li>
          {site.standings.map((standing) => {
            const player = site.players.find((p) => p.id === standing.playerId);
            const team = site.teams.find((t) => t.id === player?.teamId);
            return <li key={standing.playerId} className={styles.boardRow}>
              <span className={styles.boardPos}>{positionLabel(standing.position, positions)}</span>
              <span className={styles.boardName}>
                {team && <span className={styles.teamDot} style={{ background: safeColor(team.color) }} aria-hidden="true" />}
                {player?.name ?? "Player"}
              </span>
              <span className={styles.boardScore} data-tone={parTone(standing.score)}>{standing.score}</span>
              <span className={styles.boardThru} data-live={standing.status === "live" || undefined}>{standingProgress(standing)}</span>
            </li>;
          })}
        </ol>
      </PlaySection>}
    </div>
  </PlayShell>;
}

/** Where a player is right now, from posted matches: live first, then next up, then their last result. */
function playerStatus(home: TournamentHome, player: Player): string | null {
  const theirs = home.site.matches.filter((m) => m.sideA.players.includes(player.id) || m.sideB.players.includes(player.id));
  const live = theirs.find((m) => m.status === "live");
  if (live) return `${sessionFor(home, live.id)?.label.split(" · ")[0] ?? "Playing"} · ${live.progress ?? "Live"}`;
  const next = theirs.find((m) => m.status === "scheduled" || m.status === "waiting");
  if (next) return `Next: ${sessionFor(home, next.id)?.label.split(" · ")[0] ?? "Match"} · ${next.teeTime}`;
  return theirs.length ? "Finished" : null;
}

/** Players: the roster, grouped by team when there are teams. */
export function PlayPlayers({ home }: { home: TournamentHome }) {
  const { site } = home;
  const groups = site.competition === "teams" && site.teams.length
    ? [...site.teams.map((team) => ({ key: team.id, title: team.name, color: team.color, players: site.players.filter((p) => p.teamId === team.id) })),
      { key: "none", title: "Not on a team yet", color: null, players: site.players.filter((p) => !p.teamId || !site.teams.some((t) => t.id === p.teamId)) }]
    : [{ key: "all", title: "The field", color: null, players: site.players }];
  return <PlayShell home={home} tab="players">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>Players</h1>
      {site.players.length === 0 ? <Holding title="No players listed yet." />
        : groups.filter((g) => g.players.length).map((group) => <PlaySection key={group.key} title={`${group.title} · ${group.players.length}`} id={`group-${group.key}`}>
          <ul className={styles.rows}>{group.players.map((player) => {
            const status = playerStatus(home, player);
            return <li key={player.id} className={styles.row}>
              <span className={styles.avatar} style={group.color ? { borderColor: safeColor(group.color) } : undefined}>{initials(player.name)}</span>
              <span className={styles.rowMain}><strong>{player.name}{player.captain && <em className={styles.captain}> · Captain</em>}</strong>{status && <small>{status}</small>}</span>
              {player.handicap?.public && <span className={styles.rowSide} aria-label={`Handicap ${player.handicap.value}`}>{player.handicap.value.toFixed(1)}</span>}
            </li>;
          })}</ul>
        </PlaySection>)}
    </div>
  </PlayShell>;
}

/** More: tournament navigation, courses, info and outbound links. */
export function PlayMore({ home }: { home: TournamentHome }) {
  const { site, basePath, links, demo } = home;
  const nav = [
    { label: "Schedule", note: "Rounds, formats and tee times", href: tabPath(basePath, "matches"), Icon: CalendarDays },
    { label: "Teams", note: site.competition === "teams" ? `${site.teams.length} teams` : "Individual event", href: tabPath(basePath, "players"), Icon: Users },
    { label: "Results", note: "Standings and final scores", href: tabPath(basePath, "leaderboard"), Icon: ListOrdered },
  ];
  return <PlayShell home={home} tab="more">
    <div className={styles.stack}>
      <h1 className={styles.tabTitle}>More</h1>
      <nav className={styles.rows} aria-label="Tournament sections">
        {nav.map(({ label, note, href, Icon }) => <Link key={label} href={href} className={styles.navRow}>
          <Icon size={18} aria-hidden="true" /><span className={styles.rowMain}><strong>{label}</strong><small>{note}</small></span><ChevronRight size={16} aria-hidden="true" />
        </Link>)}
        <div className={styles.navRow} aria-disabled="true">
          <History size={18} aria-hidden="true" /><span className={styles.rowMain}><strong>History</strong><small>Past seasons appear here once this tournament has one.</small></span>
        </div>
        {links.commissioner ? <Link href={links.commissioner} className={styles.navRow}>
          <Settings2 size={18} aria-hidden="true" /><span className={styles.rowMain}><strong>Commissioner tools</strong><small>Tournament Studio: setup, players, schedule</small></span><ChevronRight size={16} aria-hidden="true" />
        </Link> : demo && <div className={styles.navRow} aria-disabled="true">
          <Settings2 size={18} aria-hidden="true" /><span className={styles.rowMain}><strong>Commissioner tools</strong><small>Opens Tournament Studio in the live app (not linked in the demo).</small></span>
        </div>}
      </nav>
      <PlaySection title="Courses">
        {site.courses.length === 0 ? <Holding title="Courses to be announced." />
          : <ul className={styles.rows}>{site.courses.map((course) => <li key={course.id} className={styles.row}>
            <span className={styles.rowMain}><strong>{course.name}</strong><small>{[course.location, course.tee !== "TBD" ? `${course.tee} tees` : null, course.par ? `Par ${course.par}` : null, course.yardage ? `${course.yardage.toLocaleString("en-US")} yds` : null].filter(Boolean).join(" · ")}</small></span>
          </li>)}</ul>}
      </PlaySection>
      <PlaySection title="Tournament info">
        <dl className={styles.info}>{site.information.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      </PlaySection>
      <nav className={styles.rows} aria-label="Links">
        {links.website && <a className={styles.linkRow} href={links.website}>Tournament website <ArrowUpRight size={16} aria-hidden="true" /></a>}
        <Link className={styles.linkRow} href={links.allTournaments}>All tournaments <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </nav>
    </div>
  </PlayShell>;
}
