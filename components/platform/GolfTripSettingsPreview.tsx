"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ChevronLeft, Clock, Minus, Plus, Trash2 } from "lucide-react";
import { GolfGameScoringSettings } from "./GolfGameScoringSettings";
import { SIDE_GAME_REGISTRY } from "@/lib/platform/golfTripGames";
import type { CompetitionRound } from "@/lib/platform/golfTripCompetitionPreview";
import styles from "./GolfTripSettingsPreview.module.css";
import tripStyles from "./GolfTripHome.module.css";
import { GolfTripCompetition } from "./GolfTripCompetition";
import { useGolfTripCompetitionPreview } from "./GolfTripCompetitionPreviewProvider";

const GENERAL_CARDS = Array.from({ length: 6 }, () => "Place holder");
const ORGANIZER_CARDS = ["Players", "Place holder", "Competition", "Games", "Place holder", "Place holder"];
const GAME_GROUPS = {
  Individual: [{ id: "skins", name: "Skins", description: "Play for the lowest net score on the hole or the round.", players: "1-4 players" }],
  Matches: SIDE_GAME_REGISTRY.map(game => ({ id: game.id, name: game.name, description: game.description, players: `${game.supportedGroupSizes.join(" / ")} players` })),
} as const;
const COMPETITION_TYPES = [
  { key: "individual", title: "Individual", options: ["Stroke Play", "Points Based"] },
  { key: "team", title: "Team", options: ["2 Teams", "Pairs", "3-Ball", "4-Ball"] },
] as const;
const MAX_DAYS = 14;
const GAME_LOOKUP = [...GAME_GROUPS.Individual, ...GAME_GROUPS.Matches];

/** Reference layout with local game scoring settings in the site's maroon palette. */
export function GolfTripSettingsPreview({ tripName }: { tripName: string }) {
  const [section, setSection] = useState("General");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const [competitionSection, setCompetitionSection] = useState("Overview");
  const [gamesOpen, setGamesOpen] = useState(false);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [confirmDeleteRoundId, setConfirmDeleteRoundId] = useState<string | null>(null);
  // Competition type: one choice per grouping (Individual, Team); None applies to its own grouping only.
  // Overview → Days / Rounds: a day count, and 1 or 2 rounds for each day. Lowering Days only hides that day's row.
  const [competitionType, setCompetitionType] = useState<{ individual: string | null; team: string | null }>({ individual: null, team: null });
  const [gameSettings, setGameSettings] = useState<CompetitionRound>({
    id: "game-settings-preview",
    date: "2027-04-22",
    number: 1,
    course: "Desert Pines GC",
    format: "Singles" as const,
    nassau: true,
    handicap: true,
    status: "scheduled" as const,
  });
  const competition = useGolfTripCompetitionPreview();
  const selectedRound = competition?.rounds.find(round => round.id === selectedRoundId);
  const selectedGame = GAME_LOOKUP.find(game => game.id === selectedGameId) ?? null;
  const days = Array.from(new Set(competition?.rounds.map(round => round.date) ?? [])).sort();
  const rounds = competition?.rounds ?? [];
  const [dayCount, setDayCount] = useState(() => Math.max(1, days.length));
  const [roundsPerDay, setRoundsPerDay] = useState<Record<number, 1 | 2>>(() => Object.fromEntries(days.map((date, index) => [index, rounds.filter(round => round.date === date).length >= 2 ? 2 : 1])));
  // Day N's date follows on from the first day; "Date" until the trip has one.
  const dayDate = (index: number) => {
    if (!days[0]) return "Date";
    const date = new Date(`${days[0]}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  };
  const flagSummary = (field: "handicap" | "nassau") => {
    if (!rounds.length) return "Not configured";
    const enabled = rounds.filter(round => round[field]).length;
    return enabled === rounds.length ? "On · All rounds" : enabled === 0 ? "Off · All rounds" : `Mixed · On for ${enabled} of ${rounds.length} rounds`;
  };
  const overview: [string, ReactNode][] = [
    ["Round number", rounds.length ? `${rounds.length} rounds · ${days.length} days` : "Not configured"],
    ["Course & format", rounds.length ? rounds.map(round => <span key={round.id} className={styles.overviewLine}>R{round.number} · {round.course} · {round.format}</span>) : "Not configured"],
    ["Points available", "Not configured"],
    ["Handicap", flagSummary("handicap")],
    ["Tiebreaker", "Not configured"],
    ["Status", `${rounds.filter(round => round.status === "started").length} started · ${rounds.filter(round => round.status === "scheduled").length} scheduled`],
  ];
  const cards = section === "Organizer" ? ORGANIZER_CARDS : GENERAL_CARDS;

  return <main className={`${styles.page} ${competitionOpen || gamesOpen ? styles.competitionPage : ""}`}>
    <div className={styles.content}>
      {(competitionOpen || gamesOpen) ? <header className={styles.competitionHeader}>
        <button type="button" className={styles.close} aria-label={selectedRound ? "Back to competition rounds" : selectedGame ? "Back to games" : "Back to organizer settings"} onClick={() => {
          if (selectedRound) setSelectedRoundId(null);
          else if (selectedGame) setSelectedGameId(null);
          else if (competitionOpen) setCompetitionOpen(false);
          else setGamesOpen(false);
        }}><ChevronLeft size={28} aria-hidden /></button>
        <h1>{selectedRound ? "Round " + selectedRound.number + " Settings" : selectedGame ? selectedGame.name : gamesOpen ? "Games" : "Competition"}</h1>
        {selectedRound || selectedGame ? <motion.button type="button" className={styles.save} onClick={() => {
          if (selectedRound) setSelectedRoundId(null);
          else setSelectedGameId(null);
        }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>SAVE</motion.button> : <span />}
      </header> : <header className={styles.header}>
      <Link href="/dev/tournament" className={styles.close} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <div className={styles.heading}>
        <h1>{tripName}</h1>
        <p>Trip Settings</p>
      </div>
      </header>}

      {!competitionOpen && !gamesOpen && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Settings sections preview">
        {["General", "Organizer"].map((name) => <button key={name} type="button" aria-pressed={section === name}
          className={`${tripStyles.tab} ${section === name ? tripStyles.tabActive : ""} ${styles.tab}`}
          onClick={() => { setSection(name); setCompetitionOpen(false); setGamesOpen(false); }}>{name}</button>)}
      </div>}

      {competitionOpen && competition ? <div className={styles.competition}>
        {!selectedRound && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Competition sections">
          {["Overview", "Rounds"].map(name => <button key={name} type="button" aria-pressed={competitionSection === name}
            className={`${tripStyles.tab} ${competitionSection === name ? tripStyles.tabActive : ""} ${styles.tab}`}
            onClick={() => setCompetitionSection(name)}>{name}</button>)}
        </div>}
        {selectedRound ? <GolfTripCompetition rounds={[selectedRound]} onChange={change => competition.change(change, selectedRound.id)} showBulk={false} />
          : <div className={tripStyles.events}>
            {competitionSection === "Overview" && <section className={tripStyles.infoSection} aria-label="Overview">
              <div className={styles.typePicker}>
                {COMPETITION_TYPES.map(group => <div key={group.key} className={styles.typeGroup} role="group" aria-label={group.title}>
                  <h4 className={styles.typeHeading}>{group.title}</h4>
                  <div className={styles.typeChoices}>
                    {[...group.options, null].map(option => <button key={option ?? "none"} type="button" className={styles.typeChoice} aria-pressed={competitionType[group.key] === option}
                      onClick={() => setCompetitionType(current => ({ ...current, [group.key]: option }))}>{option ?? "None"}</button>)}
                  </div>
                </div>)}
                <div className={styles.scheduleColumn}>
                  <div className={styles.typeGroup} role="group" aria-label="Days">
                    <h4 className={styles.typeHeading}>Days</h4>
                    <div className={`${styles.typeChoice} ${styles.stepper}`}>
                      <button type="button" aria-label="Fewer days" disabled={dayCount <= 1} onClick={() => setDayCount(count => count - 1)}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
                      <span aria-live="polite">{dayCount}</span>
                      <button type="button" aria-label="More days" disabled={dayCount >= MAX_DAYS} onClick={() => setDayCount(count => count + 1)}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
                    </div>
                  </div>
                  <div className={styles.typeGroup} role="group" aria-label="Rounds">
                    <h4 className={styles.typeHeading}>Rounds</h4>
                    {Array.from({ length: dayCount }, (_, index) => {
                      const perDay = roundsPerDay[index] ?? 1;
                      return <div key={index} className={styles.dayRow}>
                        <span className={styles.dayNumber}>{index + 1}</span>
                        <span className={styles.typeChoice}>{dayDate(index)}</span>
                        <button type="button" role="switch" aria-checked={perDay === 2} aria-label={`Day ${index + 1} rounds: ${perDay}`} className={styles.roundSlider} data-value={perDay}
                          onClick={() => setRoundsPerDay(current => ({ ...current, [index]: perDay === 2 ? 1 : 2 }))}>
                          <span className={styles.roundSliderThumb} aria-hidden /><span>1</span><span>2</span>
                        </button>
                      </div>;
                    })}
                  </div>
                </div>
              </div>
              <dl className={styles.overview}>
                {overview.map(([label, value]) => <div key={label} className={styles.overviewRow}>
                  <dt>{label}</dt><dd>{value}</dd>
                </div>)}
              </dl>
            </section>}
            {competitionSection === "Rounds" && days.map((date, index) => <section key={date} className={tripStyles.infoSection}>
              <div className={tripStyles.infoHeaderRow}>
                <h2 className={tripStyles.eventsHeading}>Day {index + 1}</h2>
              </div>
              {competition.rounds.filter(round => round.date === date).map(round => <div key={round.id} className={styles.roundRow}>
                <button type="button" className={`${tripStyles.infoEntry} ${styles.roundEntry}`} onClick={() => setSelectedRoundId(round.id)}>
                <span className={tripStyles.eventInfo}>
                  <span className={tripStyles.eventHost}>Round {round.number}</span>
                  <span className={tripStyles.eventTitle}>{round.course}</span>
                  <span className={tripStyles.eventMeta}><Clock size={14} aria-hidden />
                    <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</time>
                    <span>· {round.format}</span>
                  </span>
                </span>
                </button>
                {round.status !== "started" && <button type="button" className={`${tripStyles.entryDelete} ${styles.roundDelete}`} aria-label={`Delete Round ${round.number}`} onClick={() => setConfirmDeleteRoundId(round.id)}><Trash2 size={16} aria-hidden /></button>}
              </div>)}
              <button type="button" className={tripStyles.addItemButton} onClick={() => competition.addRound(date)}><Plus size={16} strokeWidth={2.5} aria-hidden />Add round</button>
            </section>)}
            {competitionSection === "Rounds" && !competition.rounds.length && <p>No competition rounds configured yet.</p>}
            {confirmDeleteRoundId && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete round confirmation">
              <div className={tripStyles.deleteDialog}>
                <p className={tripStyles.deletePrompt}>Are you sure?</p>
                <button type="button" className={tripStyles.cancelButton} onClick={() => setConfirmDeleteRoundId(null)}>Keep editing</button>
                <button type="button" className={tripStyles.deleteButton} onClick={() => { competition.removeRound(confirmDeleteRoundId); setConfirmDeleteRoundId(null); }}>Delete</button>
              </div>
            </div>}
          </div>}
      </div> : null}

      {<div hidden={!gamesOpen || competitionOpen} className={styles.competition}>
        {selectedGame ? <GolfTripCompetition rounds={[gameSettings]} onChange={change => setGameSettings(current => ({ ...current, ...change }))} showBulk={false} /> : <div className={styles.gameGroups}>
          {Object.entries(GAME_GROUPS).map(([label, games]) => <section key={label} className={styles.gameGroup}>
            <h2 className={styles.gameHeading}>{label}</h2>
            {games.map(game => {
              const isExpanded = expandedGameId === game.id;
              return <div key={game.id} className={styles.gameRowWrapper}>
                <button type="button" className={styles.gameRow} aria-expanded={isExpanded} onClick={() => setExpandedGameId(isExpanded ? null : game.id)}>
                  <span className={styles.gameInfo}>
                    <span className={styles.gameLabel}>{game.name}</span>
                    <span className={styles.gameMeta}>{game.players}</span>
                  </span>
                  <span className={`${styles.gameToggle} ${isExpanded ? styles.gameToggleOpen : ""}`} aria-hidden>▾</span>
                </button>
                <div hidden={!isExpanded} className={styles.gameDropdown}>
                  <GolfGameScoringSettings game={game.id} />
                </div>
              </div>;
            })}
          </section>)}
        </div>}
      </div>}

      {!competitionOpen && !gamesOpen && <div className={styles.grid}>
        {cards.map((title, index) => {
          if (title === "Competition") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setCompetitionOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Games") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => { setGamesOpen(true); setSelectedGameId(null); }}>
            <h2>{title}</h2>
          </button>;
          return <section key={index} className={styles.card} aria-label={title}>
            <h2>{title}</h2>
          </section>;
        })}
      </div>}
    </div>
  </main>;
}
