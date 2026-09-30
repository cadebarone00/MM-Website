/* eslint-disable @next/next/no-img-element -- Portable optional fixture/branding assets; no Next image service dependency. */
import React, { type ReactNode } from "react";
import type { Branding, Course, Match, Player, ScheduleDay, SiteLinks, SitePage, Standing, Team, TournamentSiteData, TournamentStatus } from "./types.ts";
import { imageSource, playLabel, readableText, safeColor, statusLabel, themeVariables } from "./theme.ts";

export function TournamentTheme({ branding, children }: { branding: Branding; children: ReactNode }) {
  return <div className="ts-site" style={themeVariables(branding)}>{children}</div>;
}
function Mark({ name, src }: { name: string; src?: string }) {
  const safe = imageSource(src);
  return safe ? <img className="ts-mark" src={safe} alt={`${name} logo`} /> : <span className="ts-mark ts-monogram" aria-hidden="true">{name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span>;
}
export function TournamentHeader({ branding, homeHref }: { branding: Branding; homeHref: string }) {
  return <header className="ts-header"><a className="ts-brand" href={homeHref}><Mark name={branding.shortName} src={branding.logo} /><span>{branding.shortName}<small>THE CHAMPIONSHIP</small></span></a><span className="ts-header-note">Tradition in the making</span></header>;
}
export const PAGE_LABELS: Record<SitePage, string> = { home: "Home", leaderboard: "Leaderboard", matches: "Matches", schedule: "Schedule", players: "Players", teams: "Teams", courses: "Courses", results: "Results", information: "Info" };
export function TournamentNav({ links, current }: { links: SiteLinks; current: SitePage }) {
  return <nav className="ts-nav" aria-label="Tournament pages">{Object.entries(links).filter(([, href]) => href).map(([page, href]) => <a key={page} href={href} aria-current={current === page ? "page" : undefined}>{PAGE_LABELS[page as SitePage] ?? page}</a>)}</nav>;
}
export function TournamentStatusBanner({ status }: { status: TournamentStatus }) {
  return <div className="ts-status-banner"><span className="ts-status" data-state={status}>{statusLabel(status)}</span><span>{({ draft: "Tournament details are being prepared.", scheduled: "The stage is set. Play begins soon.", live: "Competition in progress", final: "Play is complete. Final results are available.", archived: "A championship to remember. Archived results." })[status]}</span></div>;
}
export function TournamentHero({ branding, dates, destination, description }: { branding: Branding; dates: string; destination: string; description: string }) {
  const src = imageSource(branding.heroImage);
  return <section className="ts-hero">{src && <img className="ts-hero-image" src={src} alt="" />}<div className="ts-hero-content"><p className="ts-eyebrow">{destination}</p><h1>{branding.name}</h1><p className="ts-hero-copy">{description}</p><p className="ts-hero-date">{dates}</p></div><div className="ts-hero-seal" aria-hidden="true">THE<br />CUP<span>◆</span></div></section>;
}
export function EmptyState({ title = "Details to follow", children }: { title?: string; children?: ReactNode }) {
  return <div className="ts-empty"><h3>{title}</h3><p>{children ?? "Check back for the next update from the organizer."}</p></div>;
}
export function LockedSection({ title, reason }: { title: string; reason: string }) {
  return <section className="ts-empty"><span className="ts-status">Locked</span><h3>{title}</h3><p>{reason}</p></section>;
}
export function ComingSoonSection({ title }: { title: string }) {
  return <EmptyState title={title}>Coming soon. Details have not been announced.</EmptyState>;
}
/** A scoring page before the event has live scoring: says so plainly instead of showing empty standings. */
export function ScoringPending({ title, notice }: { title: string; notice: string }) {
  return <LockedSection title={title} reason={notice} />;
}
/** Outbound links to media hosted elsewhere (device/external media policy). No uploads, embeds or tracking. */
export function MediaLinks({ links }: { links: { label: string; url: string }[] }) {
  const safe = links.filter(link => { try { return new URL(link.url).protocol === "https:"; } catch { return false; } });
  if (!safe.length) return null;
  return <Section title="Photos & video"><ul className="ts-card ts-media-links">{safe.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc">{link.label}</a></li>)}</ul></Section>;
}
function TeamLabel({ team }: { team: Team }) {
  return <span className="ts-team-label" style={{ background: safeColor(team.color), color: readableText(team.color) }}><Mark name={team.name} src={team.logo} />{team.name}</span>;
}
export function TeamScoreSummary({ teams }: { teams: Team[] }) {
  if (!teams.length) return <EmptyState title="Team standings to follow" />;
  if (teams.every(team => team.points === undefined)) return <div className="ts-score-summary" aria-label="Teams">{teams.map(team => <div key={team.id}><TeamLabel team={team} /><small>SCORES WHEN PLAY BEGINS</small></div>)}</div>;
  return <div className="ts-score-summary" aria-label="Team standings">{teams.map(team => <div key={team.id}><TeamLabel team={team} /><strong>{team.points ?? 0}</strong><small>POINTS</small></div>)}</div>;
}
export function LeaderboardPreview({ standings, players, teams = [] }: { standings: Standing[]; players: Player[]; teams?: Team[] }) {
  if (!standings.length) return <EmptyState title="Leaderboard to follow">Standings will appear when scores are available.</EmptyState>;
  return <div className="ts-table-wrap"><table className="ts-leaderboard"><caption>Individual standings</caption><thead><tr><th scope="col">Pos</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Status</th></tr></thead><tbody>{standings.map(row => {
    const player = players.find(player => player.id === row.playerId);
    const team = teams.find(team => team.id === player?.teamId);
    return <tr key={row.playerId}><td>{row.position}</td><th scope="row">{player?.name ?? "Player TBD"}{team && <small>{team.name}</small>}</th><td className="ts-score">{row.score}</td><td><span className="ts-status" data-state={row.status}>{playLabel(row.status, row.progress)}</span></td></tr>;
  })}</tbody></table></div>;
}
export function MatchPreview({ match, teams, players }: { match: Match; teams: Team[]; players: Player[] }) {
  return <article className="ts-card ts-match"><div className="ts-card-meta"><span>{match.format}</span><span className="ts-status" data-state={match.status}>{playLabel(match.status, match.progress)}</span></div><div className="ts-match-sides">{[match.sideA, match.sideB].map((side, index) => {
    const team = teams.find(team => team.id === side.teamId);
    return <div key={index}>{team ? <TeamLabel team={team} /> : <span className="ts-eyebrow">Side {index === 0 ? "A" : "B"}</span>}<h3>{side.players.length ? side.players.map(id => players.find(player => player.id === id)?.name ?? "Player TBD").join(" / ") : "Pairings to follow"}</h3></div>;
  })}</div><div className="ts-match-result">{match.status === "final" ? match.result || "Result to follow" : match.status === "live" ? match.result || "Match in progress" : `Tee time · ${match.teeTime}`}</div></article>;
}
export function SchedulePreview({ days, courses, timezone }: { days: ScheduleDay[]; courses: Course[]; timezone: string }) {
  if (!days.length) return <EmptyState title="Schedule to follow" />;
  return <div><p className="ts-muted">All tee times · {timezone}</p>{days.map(day => <section className="ts-day" key={day.date}><h3><time dateTime={day.date}>{day.label}</time></h3>{day.sessions.map(session => <article key={session.id} className="ts-session"><time>{session.teeTime}</time><div><h4>{session.label}</h4><p>{courses.find(course => course.id === session.courseId)?.name ?? "Course TBD"} · {session.format}</p></div><span className="ts-status" data-state={session.status}>{statusLabel(session.status)}</span></article>)}</section>)}</div>;
}
export function PlayerGrid({ players, teams }: { players: Player[]; teams: Team[] }) {
  if (!players.length) return <EmptyState title="The field is taking shape" />;
  return <div className="ts-player-grid">{players.map(player => {
    const team = teams.find(team => team.id === player.teamId);
    const photo = imageSource(player.photo);
    return <article className="ts-card ts-player" key={player.id}><div className="ts-avatar">{photo ? <img src={photo} alt={player.name} loading="lazy" /> : <span aria-hidden="true">{player.name.split(" ").map(word => word[0]).join("")}</span>}</div><h3>{player.name}</h3>{team && <TeamLabel team={team} />}{player.captain && <span className="ts-status">Captain</span>}{player.handicap?.public && <p>Handicap <strong>{player.handicap.value.toFixed(1)}</strong></p>}</article>;
  })}</div>;
}
export function TeamCard({ team, players }: { team: Team; players: Player[] }) {
  return <article className="ts-card"><TeamLabel team={team} /><h3>{team.name}</h3><p>{players.filter(player => player.teamId === team.id).length} players{team.points !== undefined ? ` · ${team.points} points` : ""}</p><ul>{players.filter(player => player.teamId === team.id).map(player => <li key={player.id}>{player.name}{player.captain ? " · Captain" : ""}</li>)}</ul></article>;
}
export function CourseCard({ course }: { course: Course }) {
  const src = imageSource(course.image);
  return <article className="ts-card ts-course"><div className="ts-course-image">{src ? <img src={src} alt={course.name} loading="lazy" /> : <span>⛳<small>Course image to follow</small></span>}</div><div className="ts-course-body"><p className="ts-eyebrow">{course.location}</p><h3>{course.name}</h3><p>{course.tee} tees</p><dl><div><dt>Par</dt><dd>{course.par ?? "—"}</dd></div><div><dt>Yards</dt><dd>{course.yardage !== undefined ? course.yardage.toLocaleString("en-US") : "—"}</dd></div></dl></div></article>;
}
export function TournamentInfoCard({ information }: { information: TournamentSiteData["information"] }) {
  return <article className="ts-card"><h3>Tournament information</h3><dl className="ts-info">{information.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></article>;
}
export function SponsorSlot() {
  return <aside className="ts-sponsor" aria-label="Sponsor placeholder"><span className="ts-eyebrow">Tournament partners</span><p>Sponsor space · No partner announced</p></aside>;
}
export function Footer({ branding, dates }: { branding: Branding; dates: string }) {
  return <footer className="ts-footer"><strong>{branding.name}</strong><span>{dates}</span><p>The competition. The camaraderie. The memories.</p></footer>;
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ts-section"><h2>{title}</h2>{children}</section>;
}
