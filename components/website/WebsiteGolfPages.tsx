import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, CalendarDays, Flag, Trophy } from "lucide-react";
import { PageIntro, SectionHeading, WebsiteShell } from "@/components/marketing/WebsiteShell";
import { INSIGHTS_RANGES, SCORE_KIND_LABEL, insights, type InsightsFilter, type ScoreKind } from "@/lib/insights/stats";
import type { WebsiteGolf } from "@/lib/website/playerGolf";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import site from "@/components/marketing/MarketingWebsite.module.css";
import styles from "./Insights.module.css";

/**
 * The website's signed-in pages (project_specs.md "Connected dashboard", "Stats tab, the full breakdown"): the
 * dashboard (every part Connected, with a way in), Stats and History. Look-only: nothing here changes anything.
 */
const signed = (n: number | null, digits = 1) => n === null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const num = (n: number | null, digits = 1) => n === null ? "–" : n.toFixed(digits);
const percent = (n: number | null) => n === null ? "–" : `${Math.round(n)}%`;
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const toPar = (r: ProfileHistoryRound) => r.holes.reduce((a, h) => a + h.strokes - h.par, 0);
const toParText = (n: number) => n === 0 ? "E" : n > 0 ? `+${n}` : String(n);

/** Dashboard: one card per part, each Connected (or not, saying why) with an Open button. */
export function WebsiteDashboard({ golf, accountActions, sampleQuery }: { golf: WebsiteGolf; accountActions: ReactNode; sampleQuery: string }) {
  const rounds = golf.rounds.connected ? golf.rounds.value : [];
  const s = golf.rounds.connected ? insights(rounds, { range: "all", only18: false, today: new Date().toISOString().slice(0, 10) }) : null;
  const trips = golf.trips.connected ? golf.trips.value.current.length + golf.trips.value.past.length : 0;
  const cards = [
    { icon: BarChart3, title: "Stats", part: golf.rounds, detail: s?.overview.handicapIndex != null ? `Handicap ${s.overview.handicapIndex.toFixed(1)} · ${rounds.length} rounds` : `${rounds.length} rounds`, href: `/dashboard/stats${sampleQuery}` },
    { icon: Flag, title: "Round history", part: golf.rounds, detail: `${rounds.length} saved round${rounds.length === 1 ? "" : "s"}`, href: `/dashboard/history${sampleQuery}` },
    { icon: CalendarDays, title: "Golf trips", part: golf.trips, detail: `${trips} trip${trips === 1 ? "" : "s"}`, href: `/dashboard/history${sampleQuery}#trips` },
    { icon: Trophy, title: "Tournaments", part: golf.tournaments, detail: `${golf.tournaments.connected ? golf.tournaments.value.length : 0} tournament${golf.tournaments.connected && golf.tournaments.value.length === 1 ? "" : "s"}`, href: `/dashboard/history${sampleQuery}#tournaments` },
  ];
  return <WebsiteShell active="" accountActions={accountActions}>
    <PageIntro label="YOUR PLAYER DASHBOARD" title={<>Welcome back,<br /><em>{golf.displayName}.</em></>} copy="Everything you've played in The Maroon, connected to your account." />
    <section className={site.section}>
      <SectionHeading label="YOUR GOLF, IN ONE PLACE" title="Connected to your account" />
      <div className={styles.cardGrid}>{cards.map(({ icon: Icon, title, part, detail, href }) => <article key={title} className={styles.partCard}>
        <div className={styles.partTop}><Icon size={24} strokeWidth={1.4} aria-hidden="true" /><span className={part.connected ? styles.connected : styles.notConnected}>{part.connected ? "● Connected" : "Can't load right now"}</span></div>
        <h3>{title}</h3><p>{part.connected ? detail : "We couldn't read this part of your account. Try again soon."}</p>
        {part.connected && <Link className={styles.open} href={href}>Open {title.toLowerCase()} →</Link>}
      </article>)}</div>
    </section>
  </WebsiteShell>;
}

/** Stats: the full breakdown, with the range filter. */
export function WebsiteStats({ golf, accountActions, filter, sampleQuery }: { golf: WebsiteGolf; accountActions: ReactNode; filter: InsightsFilter; sampleQuery: string }) {
  const rounds = golf.rounds.connected ? golf.rounds.value : [];
  const s = insights(rounds, filter);
  const link = (part: Partial<InsightsFilter>) => { const next = { ...filter, ...part }; const q = new URLSearchParams(sampleQuery.replace(/^\?/, "")); q.set("range", next.range); if (next.only18) q.set("only18", "1"); else q.delete("only18"); return `/dashboard/stats?${q}`; };
  const statsNote = (n: number) => n ? `From ${n} round${n === 1 ? "" : "s"} with stats tracked.` : "Turn on Track stats in the app to see these.";
  return <WebsiteShell active="Stats" accountActions={accountActions}>
    <PageIntro label="YOUR STATS" title={<>Every round,<br /><em>broken down.</em></>} copy={`${golf.displayName} · ${s.rounds} round${s.rounds === 1 ? "" : "s"} in this view`} />
    <div className={styles.filters}>
      <nav aria-label="Rounds to include" className={styles.segment}>{INSIGHTS_RANGES.map(([id, label]) => <Link key={id} href={link({ range: id })} aria-current={filter.range === id ? "true" : undefined}>{label}</Link>)}</nav>
      <Link className={styles.toggle} href={link({ only18: !filter.only18 })} aria-pressed={filter.only18}>18-hole rounds only</Link>
    </div>
    {!golf.rounds.connected ? <section className={site.section}><p className={styles.empty}>We couldn&apos;t load your rounds right now. Try again soon.</p></section>
      : s.rounds === 0 ? <section className={site.section}><p className={styles.empty}>No rounds here yet. Play a round in the app and your stats show up here.</p></section> : <>
      <Section label="01 · OVERVIEW" title="The big picture">
        <Tiles items={[["Handicap index", num(s.overview.handicapIndex), s.overview.handicapChange === null ? undefined : `${signed(s.overview.handicapChange)} over 5 rounds`],
          ["Rounds", String(s.overview.rounds), `${s.overview.eighteens} × 18 · ${s.overview.nines} × 9`], ["Scoring average", num(s.overview.scoringAverage), "18-hole rounds"],
          ["Average to par", signed(s.overview.averageToPar), "per 18 holes"], ["Best round", s.overview.best ? String(s.overview.best.total) : "–", s.overview.best ? `${s.overview.best.course.name} · ${day(s.overview.best.datePlayed)}` : undefined],
          ["Worst round", s.overview.worst ? String(s.overview.worst.total) : "–", s.overview.worst?.course.name], ["Lowest 9", num(s.overview.lowestNine, 0)],
          ["Last 5 vs career", num(s.overview.last5Average), s.overview.last5Average !== null && s.overview.careerAverage !== null ? (s.overview.last5Average <= s.overview.careerAverage ? `▼ better than ${s.overview.careerAverage.toFixed(1)}` : `▲ worse than ${s.overview.careerAverage.toFixed(1)}`) : undefined]]} />
      </Section>
      <Section label="02 · SCORING" title="How you score">
        <div className={styles.mixBar} role="img" aria-label="Score mix">{(Object.keys(SCORE_KIND_LABEL) as ScoreKind[]).map((k) => s.scoring.mixPct[k] ? <span key={k} data-kind={k} style={{ flexGrow: s.scoring.mixPct[k]! }} title={`${SCORE_KIND_LABEL[k]} ${percent(s.scoring.mixPct[k])}`} /> : null)}</div>
        <ul className={styles.legend}>{(Object.keys(SCORE_KIND_LABEL) as ScoreKind[]).map((k) => <li key={k}><i data-kind={k} />{SCORE_KIND_LABEL[k]} <b>{percent(s.scoring.mixPct[k])}</b> <small>({s.scoring.mix[k]})</small></li>)}</ul>
        <Tiles items={[["Birdies per round", num(s.scoring.birdiesPerRound)], ["Bogey-free rounds", String(s.scoring.bogeyFreeRounds)], ["Bounce-back", percent(s.scoring.bounceBackPct), "birdie right after a bogey+"],
          ...s.scoring.byPar.map((p): Tile => [`Par ${p.par}s`, signed(p.averageToPar, 2), `average to par · ${p.holes} holes`]), ["Front 9", signed(s.scoring.frontNine), "average to par"], ["Back 9", signed(s.scoring.backNine), "average to par"]]} />
        <h3 className={styles.subhead}>Average to par on each hole</h3>
        <div className={styles.holeBars}>{s.scoring.byHole.map((h) => <div key={h.hole} title={`Hole ${h.hole}: ${signed(h.averageToPar, 2)}`}><span style={{ height: `${Math.min(100, Math.max(4, ((h.averageToPar ?? 0) + 0.5) * 60))}%` }} data-good={(h.averageToPar ?? 0) <= 0 || undefined} /><small>{h.hole}</small></div>)}</div>
      </Section>
      <Section label="03 · OFF THE TEE" title="Driving" note={statsNote(s.offTheTee.rounds)}>
        {s.offTheTee.drives > 0 && <div className={styles.split}><span style={{ flexGrow: s.offTheTee.missLeftPct ?? 0 }}>Left {percent(s.offTheTee.missLeftPct)}</span><span data-hit style={{ flexGrow: s.offTheTee.fairwaysPct ?? 0 }}>Fairway {percent(s.offTheTee.fairwaysPct)}</span><span style={{ flexGrow: s.offTheTee.missRightPct ?? 0 }}>Right {percent(s.offTheTee.missRightPct)}</span></div>}
        <Tiles items={[["Fairways hit", percent(s.offTheTee.fairwaysPct), `${s.offTheTee.drives} drives`], ["Penalties per round", num(s.offTheTee.penaltiesPerRound)], ["When you hit the fairway", signed(s.offTheTee.toParWhenHit, 2), "average to par"], ["When you miss it", signed(s.offTheTee.toParWhenMissed, 2), "average to par"]]} />
      </Section>
      <Section label="04 · APPROACH" title="Greens in regulation" note={statsNote(s.approach.rounds)}>
        <div className={styles.approach}>
          <div className={styles.green} aria-label="Where you miss greens"><span data-dir="long">Long<br />{percent(s.approach.miss.long)}</span><span data-dir="left">Left<br />{percent(s.approach.miss.left)}</span><b>{percent(s.approach.girPct)}<small>GIR</small></b><span data-dir="right">Right<br />{percent(s.approach.miss.right)}</span><span data-dir="short">Short<br />{percent(s.approach.miss.short)}</span></div>
          <Tiles items={[...s.approach.girByPar.map((p): Tile => [`GIR on par ${p.par}s`, percent(p.pct)]), ["With the green", signed(s.approach.toParWithGreen, 2), "average to par"], ["Without it", signed(s.approach.toParWithoutGreen, 2), "average to par"]]} />
        </div>
      </Section>
      <Section label="05 · SHORT GAME & PUTTING" title="On and around the green" note={statsNote(s.putting.rounds)}>
        <Tiles items={[["Putts per round", num(s.putting.puttsPerRound)], ["Putts per green hit", num(s.putting.puttsPerGir, 2)], ["1-putts", percent(s.putting.onePuttPct)], ["3-putts", percent(s.putting.threePuttPct), `${num(s.putting.threePuttsPerRound)} per round`], ["Scrambling", percent(s.putting.scramblingPct), "par or better after missing the green"]]} />
      </Section>
      <Section label="06 · TRENDS" title="Over time">
        <div className={styles.charts}>
          <Chart title="Score (18 holes)" points={s.trends.score} lowerIsBetter />
          <Chart title="Handicap index" points={s.trends.handicap} lowerIsBetter />
          <Chart title="Fairways hit %" points={s.trends.fairways} />
          <Chart title="Greens hit %" points={s.trends.greens} />
          <Chart title="Putts per round" points={s.trends.putts} lowerIsBetter />
        </div>
      </Section>
      <Section label="07 · COURSES" title="Where you've played">
        <Table head={["Course", "Rounds", "Average", "Best"]} rows={s.courses.map((c) => [c.name, String(c.rounds), num(c.average), c.best === null ? "–" : String(c.best)])} />
      </Section>
      <Section label="08 · BY TYPE OF ROUND" title="Play, trips, tournaments, leagues">
        <Table head={["Type", "Rounds", "Average", "Best"]} rows={s.sources.map((c) => [c.name, String(c.rounds), num(c.average), c.best === null ? "–" : String(c.best)])} />
      </Section>
      <Section label="09 · RECORDS" title="Your best moments">
        <Tiles items={[["Best round", s.records.best ? String(s.records.best.total) : "–", s.records.best ? `${s.records.best.course.name} · ${day(s.records.best.datePlayed)}` : undefined],
          ["Most birdies in a round", s.records.mostBirdies ? String(s.records.mostBirdies.birdies) : "–", s.records.mostBirdies ? `${s.records.mostBirdies.round.course.name} · ${day(s.records.mostBirdies.round.datePlayed)}` : undefined],
          ["Longest run of pars or better", `${s.records.longestParStreak} holes`], ["Eagles", String(s.records.eagles.length), s.records.eagles[0] ? `Latest: hole ${s.records.eagles.at(-1)!.hole}, ${s.records.eagles.at(-1)!.course}` : undefined],
          ["Holes-in-one", String(s.records.holesInOne.length), s.records.holesInOne[0] ? `Hole ${s.records.holesInOne[0].hole}, ${s.records.holesInOne[0].course} · ${day(s.records.holesInOne[0].date)}` : undefined]]} />
      </Section>
    </>}
  </WebsiteShell>;
}

/** History: every saved round (open one for the card), then trips and tournaments. */
export function WebsiteHistory({ golf, accountActions }: { golf: WebsiteGolf; accountActions: ReactNode }) {
  const rounds = golf.rounds.connected ? [...golf.rounds.value].sort((a, b) => b.datePlayed.localeCompare(a.datePlayed)) : [];
  return <WebsiteShell active="History" accountActions={accountActions}>
    <PageIntro label="YOUR HISTORY" title={<>Every round.<br /><em>Every trip.</em></>} copy="Look back at everything you've played. Open a round to see the scorecard." />
    <section className={site.section} id="rounds">
      <SectionHeading label={`${rounds.length} SAVED ROUNDS`} title="Rounds" />
      {!golf.rounds.connected ? <p className={styles.empty}>We couldn&apos;t load your rounds right now.</p> : rounds.length === 0 ? <p className={styles.empty}>No rounds yet. Play a round in the app and it shows up here.</p>
        : <div className={styles.rounds}>{rounds.map((r) => <details key={r.id} className={styles.roundRow}>
          <summary><span className={styles.roundDate}>{day(r.datePlayed)}</span><span className={styles.roundCourse}><b>{r.course.name}</b><small>{[r.tee?.name, r.holesPlayed === 9 ? "9 holes" : "18 holes", r.format].filter(Boolean).join(" · ")}</small></span><span className={styles.roundScore}>{r.total}<small>{toParText(toPar(r))}</small></span></summary>
          <Scorecard round={r} />
        </details>)}</div>}
    </section>
    <section className={site.how} id="trips">
      <SectionHeading label="GOLF TRIPS" title="Trips" />
      {!golf.trips.connected ? <p className={styles.empty}>We couldn&apos;t load your trips right now.</p> : <div className={styles.cardGrid}>
        {[...golf.trips.value.current.map((t) => ({ t, when: "Coming up" })), ...golf.trips.value.past.map((t) => ({ t, when: "Played" }))].map(({ t, when }) => <article key={`${t.name}${t.startDate}`} className={styles.partCard}>
          <p className={site.eyebrow}>{when.toUpperCase()}{t.role === "organizer" ? " · ORGANIZER" : ""}</p><h3>{t.name}</h3><p>{[t.destination, t.startDate ? day(t.startDate) : null, `${t.playerCount} players`].filter(Boolean).join(" · ")}</p>
        </article>)}
        {golf.trips.value.current.length + golf.trips.value.past.length === 0 && <p className={styles.empty}>No trips yet.</p>}
      </div>}
    </section>
    <section className={site.section} id="tournaments">
      <SectionHeading label="TOURNAMENTS" title="Tournaments" />
      {!golf.tournaments.connected ? <p className={styles.empty}>We couldn&apos;t load your tournaments right now.</p> : golf.tournaments.value.length === 0 ? <p className={styles.empty}>No tournaments yet.</p>
        : <Table head={["Tournament", "Year", "Where", "Team"]} rows={golf.tournaments.value.map((t) => [t.name, String(t.year), t.destination ?? "–", t.team ? `${t.team.name}${t.isCaptain ? " (captain)" : ""}` : "–"])} />}
    </section>
  </WebsiteShell>;
}

/** Signed in, but the account isn't set up yet: that happens in the app. */
export function WebsiteUnfinished({ accountActions, active }: { accountActions: ReactNode; active: string }) {
  return <WebsiteShell active={active} accountActions={accountActions}>
    <PageIntro label="ALMOST THERE" title={<>Finish setting up<br /><em>in the app.</em></>} copy="Your account is signed in, but its setup isn't finished. Open The Maroon app to finish, then your stats and history show up here." />
  </WebsiteShell>;
}

type Tile = [string, string, string?];
function Tiles({ items }: { items: Tile[] }) {
  return <div className={styles.tiles}>{items.map(([label, value, note]) => <div key={label} className={styles.tile}><p>{label}</p><b>{value}</b>{note && <small>{note}</small>}</div>)}</div>;
}
function Section({ label, title, note, children }: { label: string; title: string; note?: string; children: ReactNode }) {
  return <section className={styles.statSection}><div className={site.sectionHeading}><p className={site.eyebrow}>{label}</p><h2>{title}</h2>{note && <p>{note}</p>}</div>{children}</section>;
}
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.join("|")}>{row.map((cell, i) => i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

/** A small line chart: newest on the right; a dashed line at the average. */
function Chart({ title, points, lowerIsBetter = false }: { title: string; points: { date: string; value: number }[]; lowerIsBetter?: boolean }) {
  if (points.length < 2) return <figure className={styles.chart}><figcaption>{title}</figcaption><p className={styles.chartEmpty}>Not enough rounds yet.</p></figure>;
  const values = points.map((p) => p.value), min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * 300, y = (v: number) => 90 - ((v - min) / span) * 80;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const first = values[0], last = values.at(-1)!, better = lowerIsBetter ? last < first : last > first;
  return <figure className={styles.chart}>
    <figcaption>{title}<span data-better={better || undefined}>{last.toFixed(title.includes("%") ? 0 : 1)}</span></figcaption>
    <svg viewBox="0 0 300 100" role="img" aria-label={`${title}: from ${first} to ${last}`} preserveAspectRatio="none">
      <line x1="0" x2="300" y1={y(mean)} y2={y(mean)} className={styles.chartMean} />
      <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} className={styles.chartLine} />
    </svg>
    <small>{day(points[0].date)} – {day(points.at(-1)!.date)}</small>
  </figure>;
}

/** One round's card: front and back nine with par, score and (when tracked) putts. */
function Scorecard({ round }: { round: ProfileHistoryRound }) {
  const nines = [round.holes.filter((h) => h.number <= 9), round.holes.filter((h) => h.number > 9)].filter((n) => n.length);
  const putts = round.holes.some((h) => h.putts != null);
  return <div className={styles.card}>{nines.map((nine, i) => <div className={styles.tableWrap} key={i}><table className={styles.cardTable}>
    <thead><tr><th scope="row">Hole</th>{nine.map((h) => <th key={h.number}>{h.number}</th>)}<th>{i === 0 ? "Out" : "In"}</th></tr></thead>
    <tbody>
      <tr><th scope="row">Par</th>{nine.map((h) => <td key={h.number}>{h.par}</td>)}<td>{nine.reduce((a, h) => a + h.par, 0)}</td></tr>
      <tr><th scope="row">Score</th>{nine.map((h) => <td key={h.number} data-mark={h.strokes - h.par <= -2 ? "eagle" : h.strokes < h.par ? "birdie" : h.strokes === h.par ? undefined : h.strokes - h.par === 1 ? "bogey" : "double"}>{h.strokes}</td>)}<td><b>{nine.reduce((a, h) => a + h.strokes, 0)}</b></td></tr>
      {putts && <tr><th scope="row">Putts</th>{nine.map((h) => <td key={h.number}>{h.putts ?? "–"}</td>)}<td>{nine.reduce((a, h) => a + (h.putts ?? 0), 0)}</td></tr>}
    </tbody>
  </table></div>)}</div>;
}
