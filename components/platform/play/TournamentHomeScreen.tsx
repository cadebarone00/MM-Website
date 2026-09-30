import Link from "next/link";
import { ChevronRight, ListOrdered, MoreHorizontal, Swords, Users } from "lucide-react";
import { imageSource, readableText, safeColor } from "@/components/platform/tournament-site/theme";
import type { TournamentSiteData } from "@/components/platform/tournament-site/types";
import type { TournamentHome } from "@/lib/platform/tournamentHomeServer";
import { nextSession, PAIRINGS_HOLDING, playPath, todayIn } from "@/lib/platform/tournamentHome";
import { initials, PlayShell } from "./PlayShell";
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
        <strong className={styles.teamScore}>{typeof team.points === "number" ? team.points : "–"}</strong>
      </div>)}
      <p className={styles.raceNote}>{teams.some((t) => typeof t.points === "number") ? "Team points" : "Scoring opens with live play"}</p>
    </div>
      : <p className={styles.fieldNote}>{site.competition === "individual" ? `Individual · ${site.players.length} players` : "Teams to be announced"}</p>}
  </header>;
}

/** The main focus. Real schedule details; pairings and live status are a holding state until live scoring posts them. */
function YourMatch({ site }: { site: TournamentSiteData }) {
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

function Areas({ slug, year }: { slug: string; year: number }) {
  const areas = [
    { tab: "matches" as const, label: "Matches", note: "Schedule & pairings", Icon: Swords },
    { tab: "leaderboard" as const, label: "Leaderboard", note: "Standings", Icon: ListOrdered },
    { tab: "players" as const, label: "Players", note: "The field", Icon: Users },
    { tab: "more" as const, label: "More", note: "Courses & info", Icon: MoreHorizontal },
  ];
  return <nav className={styles.areas} aria-label="Tournament areas">
    {areas.map(({ tab, label, note, Icon }) => <Link key={tab} href={playPath(slug, year, tab)} className={styles.area}>
      <Icon size={20} aria-hidden="true" /><span><strong>{label}</strong><small>{note}</small></span><ChevronRight size={16} aria-hidden="true" />
    </Link>)}
  </nav>;
}

export function TournamentHomeScreen({ home }: { home: TournamentHome }) {
  const { slug, year, site, feed } = home;
  return <PlayShell slug={slug} year={year} site={site} tab="home">
    <IdentityHeader site={site} year={year} />
    <div className={styles.stack}>
      <YourMatch site={site} />
      <Areas slug={slug} year={year} />
      {feed && <TournamentFeed slug={slug} year={year} timezone={site.timezone} initialFeed={feed} />}
    </div>
  </PlayShell>;
}
