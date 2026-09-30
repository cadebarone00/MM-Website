/* eslint-disable @next/next/no-img-element -- Optional organizer branding URL, same as the public UI kit; no Next image service dependency. */
import Link from "next/link";
import { ChevronRight, ListOrdered, MoreHorizontal, Swords, Users } from "lucide-react";
import { imageSource, readableText, safeColor } from "@/components/platform/tournament-site/theme";
import type { Match, Player, Team, TournamentSiteData } from "@/components/platform/tournament-site/types";
import { findYourMatch, nextSession, PAIRINGS_HOLDING, tabPath, todayIn, type TournamentHome } from "@/lib/platform/tournamentHome";
import { initials, PlayShell } from "./PlayShell";
import { MatchStatus } from "./MatchCard";
import { TournamentFeed } from "./TournamentFeed";
import styles from "./Play.module.css";

/** Tournament name, year, colors and the team race. Scores stay blank until live scoring exists. */
function IdentityHeader({ site, year }: { site: TournamentSiteData; year: number }) {
  const logo = imageSource(site.branding.logo);
  const teams = site.competition === "teams" ? site.teams : [];
  return <header className={styles.identity}>
    <div className={styles.identityTop}>
      <span className={styles.crest}>{logo ? <img src={logo} alt="" /> : initials(site.branding.shortName)}</span>
      <div>
        <h1>{site.branding.name.replace(new RegExp(`\\s${year}$`), "")}</h1>
        <p>{[String(year), site.destination, site.dates].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
    {teams.length > 0 ? <div className={styles.race} aria-label="Team score">
      {teams.slice(0, 2).map((team, index) => <div key={team.id} className={styles.raceTeam} data-side={index === 0 ? "a" : "b"}>
        <span className={styles.teamSwatch} style={{ background: safeColor(team.color), color: readableText(safeColor(team.color)) }}>{initials(team.name)}</span>
        <span className={styles.teamName}>{team.name}</span>
        <strong className={styles.teamScore} data-scored={typeof team.points === "number" || undefined}>{typeof team.points === "number" ? team.points : "–"}</strong>
      </div>)}
      <p className={styles.raceNote}>{teams.some((t) => typeof t.points === "number") ? "Team points" : "Scoring opens with live play"}</p>
    </div>
      : <p className={styles.fieldNote}>{site.competition === "individual" ? `Individual · ${site.players.length} players` : "Teams to be announced"}</p>}
  </header>;
}

function SideFaces({ side, players, teams, label }: { side: Match["sideA"]; players: Player[]; teams: Team[]; label: string }) {
  const color = safeColor(teams.find((t) => t.id === side.teamId)?.color ?? "", "#3a1620");
  const names = side.players.map((id) => players.find((p) => p.id === id)?.name ?? "TBD");
  return <div className={styles.side}>
    {names.map((name) => <span key={name} className={styles.face} style={{ borderColor: color }}>{initials(name)}</span>)}
    <p>{label}</p>
    <strong className={styles.sideNames}>{names.join(" & ")}</strong>
  </div>;
}

/**
 * The main focus. With posted pairings: your side, the opponents, status and
 * the round's details. Before that: the real next round plus a holding state.
 */
function YourMatch({ home }: { home: TournamentHome }) {
  const { site } = home;
  const yours = findYourMatch(home);
  if (yours) {
    const { match, mine, theirs, session } = yours;
    const course = session ? site.courses.find((c) => c.id === session.courseId) : undefined;
    const partnerCount = mine.players.length - 1;
    return <section className={styles.match} aria-labelledby="your-match">
      <div className={styles.matchHead}><h2 id="your-match">Your Match</h2><MatchStatus match={match} /></div>
      <p className={styles.matchRound}>{session?.label ?? "Match"} <span>· {match.format}</span></p>
      <div className={styles.matchup} aria-label="Pairings">
        <SideFaces side={mine} players={site.players} teams={site.teams} label={partnerCount > 0 ? "You & partner" : "You"} />
        <span className={styles.versus}>vs</span>
        <SideFaces side={theirs} players={site.players} teams={site.teams} label="Opponents" />
      </div>
      {match.result && <p className={styles.matchResult} data-status={match.status}>{match.result}</p>}
      <dl className={styles.matchFacts}>
        <div><dt>Tee time</dt><dd>{match.teeTime}</dd></div>
        <div><dt>Format</dt><dd>{match.format}</dd></div>
        <div><dt>Course</dt><dd>{course?.name ?? "Course TBD"}</dd></div>
      </dl>
    </section>;
  }
  const next = nextSession(site.days, todayIn(site.timezone));
  const course = next.state === "upcoming" ? site.courses.find((c) => c.id === next.session.courseId) : undefined;
  return <section className={styles.match} aria-labelledby="your-match">
    <div className={styles.matchHead}>
      <h2 id="your-match">Your Match</h2>
      {next.state === "upcoming" && <span className={styles.matchStatus}>Upcoming</span>}
    </div>
    {next.state === "upcoming" ? <>
      <p className={styles.matchRound}>{next.session.label} <span>· {next.session.format}</span></p>
      <div className={styles.matchup} aria-label="Pairings">
        <div className={styles.side}><span className={styles.slot} aria-hidden="true">?</span><span className={styles.slot} aria-hidden="true">?</span><p>Your side</p></div>
        <span className={styles.versus}>vs</span>
        <div className={styles.side}><span className={styles.slot} aria-hidden="true">?</span><span className={styles.slot} aria-hidden="true">?</span><p>Opponents</p></div>
      </div>
      <p className={styles.matchHolding}>{PAIRINGS_HOLDING}</p>
      <dl className={styles.matchFacts}>
        <div><dt>Tee time</dt><dd>{next.session.teeTime}</dd></div>
        <div><dt>Day</dt><dd>{next.day.label}</dd></div>
        <div><dt>Course</dt><dd>{course?.name ?? "Course TBD"}</dd></div>
      </dl>
    </> : <p className={styles.matchHolding}>{next.state === "complete" ? "Play is complete for this tournament." : "The schedule hasn't been posted yet."}</p>}
  </section>;
}

function Areas({ basePath }: { basePath: string }) {
  const areas = [
    { tab: "matches" as const, label: "Matches", note: "Schedule & pairings", Icon: Swords },
    { tab: "leaderboard" as const, label: "Leaderboard", note: "Standings", Icon: ListOrdered },
    { tab: "players" as const, label: "Players", note: "The field", Icon: Users },
    { tab: "more" as const, label: "More", note: "Courses & info", Icon: MoreHorizontal },
  ];
  return <nav className={styles.areas} aria-label="Tournament areas">
    {areas.map(({ tab, label, note, Icon }) => <Link key={tab} href={tabPath(basePath, tab)} className={styles.area}>
      <Icon size={20} aria-hidden="true" /><span><strong>{label}</strong><small>{note}</small></span><ChevronRight size={16} aria-hidden="true" />
    </Link>)}
  </nav>;
}

export function TournamentHomeScreen({ home }: { home: TournamentHome }) {
  const { year, site, feed } = home;
  return <PlayShell home={home} tab="home">
    <IdentityHeader site={site} year={year} />
    <div className={styles.stack}>
      <YourMatch home={home} />
      <Areas basePath={home.basePath} />
      {feed && <TournamentFeed timezone={site.timezone} initialFeed={feed} postUrl={home.announcementsUrl} />}
    </div>
  </PlayShell>;
}
