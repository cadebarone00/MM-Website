import React from "react";
import type { SiteLinks, SitePage, TournamentSiteData } from "./types.ts";
import { TournamentTheme, TournamentHeader, TournamentNav, TournamentHero, TournamentStatusBanner, TeamScoreSummary, LeaderboardPreview, MatchPreview, SchedulePreview, PlayerGrid, TeamCard, CourseCard, TournamentInfoCard, SponsorSlot, Footer, EmptyState, Section } from "./components.tsx";

export function TournamentHome({ data }: { data: TournamentSiteData }) {
  const sessions = data.days.flatMap(day => day.sessions.map(session => ({ ...session, date: day.label })));
  const next = sessions.find(session => session.status === "live") ?? sessions.find(session => session.status !== "final");
  return <><TournamentHero branding={data.branding} dates={data.dates} destination={data.destination} description={data.description} /><div className="ts-content"><TournamentStatusBanner status={data.status} />{data.competition === "teams" && <Section title="The race for the cup"><TeamScoreSummary teams={data.teams} /></Section>}<div className="ts-home-columns"><Section title={next?.status === "live" ? "On the course now" : "Next session"}>{next ? <article className="ts-card ts-feature"><p className="ts-eyebrow">{next.date}</p><h3>{next.label}</h3><p>{data.courses.find(course => course.id === next.courseId)?.name ?? "Course TBD"}</p><strong>{next.teeTime} · {data.timezone}</strong></article> : <EmptyState title={data.status === "final" || data.status === "archived" ? "Play is complete" : "Sessions to follow"} />}</Section><Section title="Individual leaderboard"><LeaderboardPreview standings={data.standings.slice(0, 5)} players={data.players} teams={data.teams} /></Section></div><Section title="Upcoming matches"><MatchList data={data} filter="upcoming" /></Section><Section title="Latest results"><MatchList data={data} filter="final" /></Section><Section title="Championship courses"><div className="ts-grid">{data.courses.length ? data.courses.map(course => <CourseCard key={course.id} course={course} />) : <EmptyState title="Courses to follow" />}</div></Section><TournamentInfoCard information={data.information} /><SponsorSlot /></div></>;
}
function MatchList({ data, filter }: { data: TournamentSiteData; filter?: "upcoming" | "final" }) {
  const matches = data.matches.filter(match => !filter || (filter === "final" ? match.status === "final" : match.status === "scheduled" || match.status === "waiting"));
  return matches.length ? <div className="ts-grid">{matches.map(match => <MatchPreview key={match.id} match={match} teams={data.teams} players={data.players} />)}</div> : <EmptyState title={filter === "final" ? "No match results yet" : "No matches announced"}>{data.competition === "individual" ? "Follow individual standings for this event." : "Match details will appear here when available."}</EmptyState>;
}
export function TournamentLeaderboard({ data }: { data: TournamentSiteData }) {
  return <>{data.competition === "teams" && <Section title="Team standings"><TeamScoreSummary teams={data.teams} /></Section>}<Section title="Individual standings"><LeaderboardPreview standings={data.standings} players={data.players} teams={data.teams} /></Section></>;
}
export function TournamentMatches({ data }: { data: TournamentSiteData }) { return <><p className="ts-muted">Tee times · {data.timezone}</p><MatchList data={data} /></>; }
export function TournamentSchedule({ data }: { data: TournamentSiteData }) { return <SchedulePreview days={data.days} courses={data.courses} timezone={data.timezone} />; }
export function TournamentPlayers({ data }: { data: TournamentSiteData }) { return <PlayerGrid players={data.players} teams={data.teams} />; }
export function TournamentTeams({ data }: { data: TournamentSiteData }) { return data.competition === "individual" ? <EmptyState title="An individual championship">Players compete individually in this event.</EmptyState> : <div className="ts-grid">{data.teams.length ? data.teams.map(team => <TeamCard key={team.id} team={team} players={data.players} />) : <EmptyState title="Teams to follow" />}</div>; }
export function TournamentCourses({ data }: { data: TournamentSiteData }) { return <div className="ts-grid">{data.courses.length ? data.courses.map(course => <CourseCard key={course.id} course={course} />) : <EmptyState title="Courses to follow" />}</div>; }
export function TournamentResults({ data }: { data: TournamentSiteData }) {
  if (data.status !== "final" && data.status !== "archived") return <EmptyState title="The story is still being written">Final tournament results will be published after play is complete.</EmptyState>;
  return <><section className="ts-results"><p className="ts-eyebrow">{data.status === "archived" ? "From the archives" : "The final chapter"}</p><h2>{data.results?.headline ?? "Championship results"}</h2><p>{data.results?.detail ?? "Final standings are shown below."}</p></section><TournamentLeaderboard data={data} /></>;
}
const pages = { leaderboard: TournamentLeaderboard, matches: TournamentMatches, schedule: TournamentSchedule, players: TournamentPlayers, teams: TournamentTeams, courses: TournamentCourses, results: TournamentResults };
/** Presentation only. Caller supplies already-public data and navigation destinations. */
export function TournamentSite({ data, page, links, id = "tournament-content" }: { data: TournamentSiteData; page: SitePage; links: SiteLinks; id?: string }) {
  const Page = page === "home" ? null : pages[page];
  return <TournamentTheme branding={data.branding}><a className="ts-skip" href={`#${id}`}>Skip to tournament content</a><TournamentHeader branding={data.branding} homeHref={links.home} /><TournamentNav links={links} current={page} /><main id={id} tabIndex={-1}>{Page ? <div className="ts-content"><div className="ts-page-heading"><p className="ts-eyebrow">{data.branding.name} · {data.dates}</p><h1>{page[0].toUpperCase() + page.slice(1)}</h1></div><TournamentStatusBanner status={data.status} /><Page data={data} /></div> : <TournamentHome data={data} />}</main><Footer branding={data.branding} dates={data.dates} /></TournamentTheme>;
}
