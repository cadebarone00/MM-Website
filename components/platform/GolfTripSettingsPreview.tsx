"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Check, ChevronLeft, Clock, Minus, Plus, Trash2 } from "lucide-react";
import { GolfGameScoringSettings } from "./GolfGameScoringSettings";
import { SIDE_GAME_REGISTRY } from "@/lib/platform/golfTripGames";
import type { CompetitionRound } from "@/lib/platform/golfTripCompetitionPreview";
import styles from "./GolfTripSettingsPreview.module.css";
import tripStyles from "./GolfTripHome.module.css";
import leaderboardStyles from "./GolfTripMatch.module.css";
import { GolfTripCompetition } from "./GolfTripCompetition";
import { GolfTripDatePicker } from "./GolfTripDatePicker";
import { TripScheduleCoursePicker, type PickedCourse } from "./TripScheduleCoursePicker";
import toggleStyles from "./GolfTripCompetition.module.css";
import notificationStyles from "./GolfTripNotifications.module.css";
import { SCORING_VIEWS, setScoringView, useScoringView } from "@/lib/platform/scoringViewPreference";
import { useGolfTripCompetitionPreview } from "./GolfTripCompetitionPreviewProvider";

import { useSimulator, useSimulatorNavigationReporter } from "@/components/dev/SimulatorBridge";

const GENERAL_CARDS = ["Scorecard View", ...Array.from({ length: 5 }, () => "Place holder")];
const ORGANIZER_CARDS = ["Players", "Trip Schedule", "Competition", "Games", "Allowed", "Player Scoring"];
const GAME_GROUPS = {
  Individual: [{ id: "skins", name: "Skins", description: "Play for the lowest net score on the hole or the round.", players: "1-4 players" }],
  Matches: SIDE_GAME_REGISTRY.filter(game => game.id !== "skins").map(game => ({ id: game.id, name: game.name, description: game.description, players: `${game.supportedGroupSizes.join(" / ")} players` })),
} as const;
const COMPETITION_TYPES = [
  { key: "individual", title: "Individual", options: ["Stroke Play", "Points Based"] },
  { key: "team", title: "Team", options: ["2 Teams", "Pairs", "3-Ball", "4-Ball"] },
] as const;
const MAX_DAYS = 14;
const MAX_PLAYERS = 100;
// Allowed: the trip's house rules, grouped like the Competition Rounds tab. Preview only; resets on reload.
type AllowedRule = { id: string; section: string; name: string; detail: string };
const ALLOWED_SECTIONS = ["On the course", "Scoring", "Equipment"];
const ALLOWED_PRESET: AllowedRule[] = [
  { id: "mulligans", section: "On the course", name: "Mulligans", detail: "1 per nine · Not on the 18th" },
  { id: "gimmes", section: "On the course", name: "Gimmes", detail: "Inside the leather" },
  { id: "breakfast-ball", section: "On the course", name: "Breakfast ball", detail: "First tee only" },
  { id: "max-score", section: "Scoring", name: "Max score", detail: "Pick up at double par" },
  { id: "winter-rules", section: "Scoring", name: "Winter rules", detail: "Lift, clean & place in the fairway" },
  { id: "hazard-drop", section: "Scoring", name: "Hazard drop", detail: "One-stroke penalty" },
  { id: "rangefinders", section: "Equipment", name: "Rangefinders", detail: "Slope off" },
  { id: "golf-carts", section: "Equipment", name: "Golf carts", detail: "Cart path only when posted" },
  { id: "music", section: "Equipment", name: "Music", detail: "Low volume · Off on the greens" },
];
// Player Scoring: what players fill in on the Scoring sheet for each hole. Preview only; resets on reload.
const PLAYER_SCORING_FIELDS = ["Opponent's score", "Putts", "Fairway", "Greens in regulation"];
const GAME_LOOKUP = [...GAME_GROUPS.Individual, ...GAME_GROUPS.Matches];

/** Reference layout with local game scoring settings in the site's maroon palette. */
export function GolfTripSettingsPreview({ tripName, backHref = "/dev/tournament", playerCount = 0, players = [] }: { tripName: string; backHref?: string; playerCount?: number; players?: string[] }) {
  const [section, setSection] = useState("General");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const [competitionSection, setCompetitionSection] = useState("Overview");
  const [gamesOpen, setGamesOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [allowedOpen, setAllowedOpen] = useState(false);
  const [playerScoringOpen, setPlayerScoringOpen] = useState(false);
  const [scorecardViewOpen, setScorecardViewOpen] = useState(false);
  const scoringView = useScoringView();
  const [scoringFieldsOff, setScoringFieldsOff] = useState<Set<string>>(new Set());
  const [allowedRules, setAllowedRules] = useState(ALLOWED_PRESET);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(null);
  // Players: the expected count can't drop below the players who already joined; open spots show as "Player N".
  const [playerTotal, setPlayerTotal] = useState(() => Math.min(MAX_PLAYERS, Math.max(1, playerCount, players.length)));
  const [removedPlayers, setRemovedPlayers] = useState<Set<string>>(() => new Set());
  const joinedPlayers = players.map((name, index) => ({ name, key: `${index}:${name}` })).filter(player => !removedPlayers.has(player.key));
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [confirmDeleteRoundId, setConfirmDeleteRoundId] = useState<string | null>(null);
  // Competition type: one choice per grouping (Individual, Team); None applies to its own grouping only.
  // Rounds page: a day count, and 0, 1 or 2 round slots for each day. Lowering Days only hides that day's row.
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
  const rounds = useMemo(() => competition?.rounds ?? [], [competition?.rounds]);
  const [dayCount, setDayCount] = useState(() => Math.max(1, days.length));
  const [roundsPerDay, setRoundsPerDay] = useState<Record<number, 0 | 1 | 2>>(() => Object.fromEntries(days.map((date, index) => [index, Math.min(2, rounds.filter(round => round.date === date).length) as 0 | 1 | 2])));
  // Arrival / Departure: moving Arrival keeps Departure where it is, so the day count grows or shrinks with it.
  const [arrivalShift, setArrivalShift] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Trip Schedule: tap a round's course → the course pop-up (like New game). Picks are kept per day/round slot.
  const [pickedCourses, setPickedCourses] = useState<Record<string, PickedCourse>>({});
  const [coursePicker, setCoursePicker] = useState<{ key: string; label: string } | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const baseDate = days[0] ?? today;
  const isoForDay = (index: number) => {
    const date = new Date(`${baseDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + arrivalShift + index);
    return date.toISOString().slice(0, 10);
  };
  const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
  const arrivalIso = isoForDay(0);
  const departureIso = isoForDay(dayCount - 1);
  // The trip dates popup sets both ends at once; the Day rows follow (1 to MAX_DAYS days).
  const setTripDates = (arrival: string, departure: string) => {
    setArrivalShift(daysBetween(baseDate, arrival));
    setDayCount(daysBetween(arrival, departure) + 1);
    setDatePickerOpen(false);
  };
  // Day N's date follows on from Arrival; "Date" until the trip has one.
  const dayDate = (index: number) => {
    if (!days[0]) return "Date";
    const date = new Date(`${days[0]}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + arrivalShift + index);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  };
  const flagSummary = (field: "handicap" | "nassau") => {
    if (!rounds.length) return "Not configured";
    const enabled = rounds.filter(round => round[field]).length;
    return enabled === rounds.length ? "On · All rounds" : enabled === 0 ? "Off · All rounds" : `Mixed · On for ${enabled} of ${rounds.length} rounds`;
  };
  const overview: [string, ReactNode][] = [
    ["Points available", "Not configured"],
    ["Handicap", flagSummary("handicap")],
    ["Tiebreaker", "Not configured"],
    ["Status", `${rounds.filter(round => round.status === "started").length} started · ${rounds.filter(round => round.status === "scheduled").length} scheduled`],
  ];
  // Summary: a read-only recap of every competition choice, one row each.
  const chosenTypes = [competitionType.individual, competitionType.team].filter(Boolean).join(" · ");
  const summary: [string, ReactNode][] = [
    ["Type", chosenTypes || "Not chosen"],
    ["Rounds", rounds.length ? `${rounds.length} rounds · ${days.length} days` : "Not configured"],
    ...rounds.map((round): [string, ReactNode] => [`R${round.number}`, `${round.course} · ${round.format}`]),
    ...overview,
  ];
  const simulator = useSimulator();
  const reportNavigation = useSimulatorNavigationReporter();
  const appliedCommand = useRef<number | undefined>(undefined);
  const [placeholder, setPlaceholder] = useState<number | null>(null);
  useEffect(() => {
    const request = simulator?.navigation;
    if (!request?.settingsView || request.command === appliedCommand.current) return;
    appliedCommand.current = request.command;
    const view = request.settingsView;
    setSection(view === "player" || view === "scorecard-view" || /^placeholder-[1-6]$/.test(view) ? "General" : "Organizer");
    setPlayersOpen(view === "players");
    setRoundsOpen(view === "schedule");
    setCompetitionOpen(view === "competition" || view === "competition-rounds" || view.startsWith("round-"));
    setCompetitionSection(view === "competition-rounds" || view.startsWith("round-") ? "Rounds" : "Overview");
    setGamesOpen(view === "games" || view.startsWith("game-"));
    setExpandedGameId(view.startsWith("game-") ? view.slice(5) : null);
    setSelectedGameId(null);
    setSelectedRoundId(view.startsWith("round-") ? view.slice(6) : null);
    setPlaceholder(view.startsWith("placeholder-") ? Number(view.slice(12)) : null);
    setAllowedOpen(view === "allowed");
    setPlayerScoringOpen(view === "player-scoring");
    setScorecardViewOpen(view === "scorecard-view");
  }, [simulator?.navigation]);
  useEffect(() => {
    if (!reportNavigation) return;
    const settingsView = scorecardViewOpen ? "scorecard-view" : playerScoringOpen ? "player-scoring" : allowedOpen ? "allowed" : playersOpen ? "players" : roundsOpen ? "schedule" : competitionOpen ? selectedRoundId ? `round-${selectedRoundId}` : competitionSection === "Rounds" ? "competition-rounds" : "competition" : gamesOpen ? expandedGameId ? `game-${expandedGameId}` : "games" : placeholder ? `placeholder-${placeholder}` : section === "General" ? "player" : "organizer";
    reportNavigation({ tab: "Home", settingsView }, rounds.map(({ id, number }) => ({ id, number })));
  }, [reportNavigation, scorecardViewOpen, playerScoringOpen, allowedOpen, playersOpen, roundsOpen, competitionOpen, competitionSection, gamesOpen, expandedGameId, placeholder, section, selectedRoundId, rounds]);
  const cards = section === "Organizer" ? ORGANIZER_CARDS : GENERAL_CARDS;
  // Back arrow and SAVE both step back one level; preview changes are already kept as you make them.
  const goBack = () => {
    if (selectedRound) setSelectedRoundId(null);
    else if (selectedGame) setSelectedGameId(null);
    else if (competitionOpen) setCompetitionOpen(false);
    else if (roundsOpen) setRoundsOpen(false);
    else if (playersOpen) setPlayersOpen(false);
    else if (allowedOpen) setAllowedOpen(false);
    else if (playerScoringOpen) setPlayerScoringOpen(false);
    else if (scorecardViewOpen) setScorecardViewOpen(false);
    else setGamesOpen(false);
  };

  return <main className={`${styles.page} ${competitionOpen || gamesOpen || roundsOpen || playersOpen || allowedOpen || playerScoringOpen || scorecardViewOpen ? styles.competitionPage : ""}`}>
    <div className={styles.content}>
      {(competitionOpen || gamesOpen || roundsOpen || playersOpen || allowedOpen || playerScoringOpen || scorecardViewOpen) ? <header className={styles.competitionHeader}>
        <button type="button" className={styles.close} aria-label={selectedRound ? "Back to competition rounds" : selectedGame ? "Back to games" : "Back to organizer settings"} onClick={goBack}><ChevronLeft size={28} aria-hidden /></button>
        <h1>{selectedRound ? "Round " + selectedRound.number + " Settings" : selectedGame ? selectedGame.name : gamesOpen ? "Games" : roundsOpen ? "Trip Schedule" : playersOpen ? "Players" : allowedOpen ? "Allowed" : playerScoringOpen ? "Player Scoring" : scorecardViewOpen ? "Scorecard View" : "Competition"}</h1>
        <motion.button type="button" className={styles.save} onClick={goBack} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>SAVE</motion.button>
      </header> : <header className={styles.header}>
      <Link href={backHref} className={styles.close} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <div className={styles.heading}>
        <h1>{tripName}</h1>
        <p>Trip Settings</p>
      </div>
      </header>}

      {!competitionOpen && !gamesOpen && !roundsOpen && !playersOpen && !allowedOpen && !playerScoringOpen && !scorecardViewOpen && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Settings sections preview">
        {["General", "Organizer"].map((name) => <button key={name} type="button" aria-pressed={section === name}
          className={`${tripStyles.tab} ${section === name ? tripStyles.tabActive : ""} ${styles.tab}`}
          onClick={() => { setSection(name); setPlaceholder(null); setCompetitionOpen(false); setGamesOpen(false); setRoundsOpen(false); setPlayersOpen(false); }}>{name}</button>)}
      </div>}

      {competitionOpen && competition ? <div className={styles.competition}>
        {!selectedRound && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Competition sections">
          {["Overview", "Rounds", "Summary"].map(name => <button key={name} type="button" aria-pressed={competitionSection === name}
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
              </div>
              <dl className={styles.overview}>
                {overview.map(([label, value]) => <div key={label} className={styles.overviewRow}>
                  <dt>{label}</dt><dd>{value}</dd>
                </div>)}
              </dl>
            </section>}
            {competitionSection === "Summary" && <section className={tripStyles.infoSection} aria-label="Summary">
              <dl className={styles.overview}>
                {summary.map(([label, value]) => <div key={label} className={styles.overviewRow}>
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

      {coursePicker && <TripScheduleCoursePicker roundLabel={coursePicker.label} current={pickedCourses[coursePicker.key]} onClose={() => setCoursePicker(null)}
        onPick={(course) => { setPickedCourses(current => ({ ...current, [coursePicker.key]: course })); setCoursePicker(null); }} />}
      {datePickerOpen && <GolfTripDatePicker arrival={arrivalIso} departure={departureIso} maxDays={MAX_DAYS}
        onSubmit={setTripDates} onClose={() => setDatePickerOpen(false)} />}

      {roundsOpen && <div className={styles.competition}>
        <section className={tripStyles.infoSection} aria-label="Trip Schedule">
          <div className={styles.scheduleColumn}>
            <div className={styles.arrivalDeparture}>
              <div className={styles.typeGroup} role="group" aria-label="Arrival">
                <h4 className={styles.typeHeading}>Arrival</h4>
                <button type="button" className={styles.typeChoice} aria-haspopup="dialog" onClick={() => setDatePickerOpen(true)}>{dayDate(0)}</button>
              </div>
              <div className={styles.typeGroup} role="group" aria-label="Departure">
                <h4 className={styles.typeHeading}>Departure</h4>
                <button type="button" className={styles.typeChoice} aria-haspopup="dialog" onClick={() => setDatePickerOpen(true)}>{dayDate(dayCount - 1)}</button>
              </div>
            </div>
          </div>
        </section>
        {/* Day rows use the same look as Competition → Rounds. */}
        <div className={tripStyles.events}>
          {Array.from({ length: dayCount }, (_, index) => {
            const perDay = roundsPerDay[index] ?? 1;
            const dayRounds = rounds.filter(round => round.date === days[index]);
            const roundsBefore = Array.from({ length: index }, (_, day) => roundsPerDay[day] ?? 1).reduce<number>((sum, count) => sum + count, 0);
            return <section key={index} className={tripStyles.infoSection} aria-label={`Day ${index + 1}`}>
              <div className={tripStyles.infoHeaderRow}>
                <h2 className={tripStyles.eventsHeading}>Day {index + 1}</h2>
                <div className={styles.roundSlider} role="radiogroup" aria-label={`Day ${index + 1} rounds`} data-value={perDay}>
                  <span className={styles.roundSliderThumb} aria-hidden />
                  {([0, 1, 2] as const).map(value => <button key={value} type="button" role="radio" aria-checked={perDay === value}
                    onClick={() => setRoundsPerDay(current => ({ ...current, [index]: value }))}>{value}</button>)}
                </div>
              </div>
              {Array.from({ length: perDay }, (_, slot) => {
                const key = `${index}-${slot}`, picked = pickedCourses[key], label = `Round ${roundsBefore + slot + 1} · ${dayDate(index)}`;
                return <button type="button" key={slot} className={`${tripStyles.infoEntry} ${styles.roundEntry}`} aria-haspopup="dialog"
                  aria-label={`${label}: ${picked?.name ?? dayRounds[slot]?.course ?? "Course TBD"}. Choose course`} onClick={() => setCoursePicker({ key, label })}>
                  <span className={tripStyles.eventInfo}>
                    <span className={tripStyles.eventHost}>Round {roundsBefore + slot + 1}</span>
                    <span className={tripStyles.eventTitle}>{picked?.name ?? dayRounds[slot]?.course ?? "Course TBD"}</span>
                    <span className={tripStyles.eventMeta}><Clock size={14} aria-hidden />
                      <span>{dayDate(index)}</span>
                      {picked?.settings ? <span>· {teeTimeLabel(picked.settings.teeTime)}{picked.settings.tees ? ` · ${picked.settings.tees} tees` : ""}</span>
                        : picked ? <span>· Course settings later</span>
                        : dayRounds[slot] && <span>· {dayRounds[slot].format}</span>}
                    </span>
                  </span>
                </button>;
              })}
            </section>;
          })}
        </div>
      </div>}

      {playersOpen && <div className={styles.competition}>
        <section className={leaderboardStyles.match} aria-label="Players">
            <div className={leaderboardStyles.lineupHeader} role="group" aria-label="Number of players">
              <h2 className={leaderboardStyles.headerTitle}>Players</h2>
              <div className={`${styles.typeChoice} ${styles.stepper}`}>
                <button type="button" aria-label="Fewer players" disabled={playerTotal <= Math.max(1, joinedPlayers.length)} onClick={() => setPlayerTotal(count => count - 1)}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
                <span aria-live="polite">{playerTotal}</span>
                <button type="button" aria-label="More players" disabled={playerTotal >= MAX_PLAYERS} onClick={() => setPlayerTotal(count => count + 1)}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
              </div>
            </div>
            <div>
              <div className={`${leaderboardStyles.single} ${leaderboardStyles.columns} ${styles.playerRow} ${styles.playerListRow}`} aria-hidden="true">
                <span className={leaderboardStyles.columnPlayer}>Player</span>
              </div>
              <ol className={leaderboardStyles.lineup}>
                {Array.from({ length: playerTotal }, (_, index) => <li key={index} className={`${leaderboardStyles.single} ${styles.playerRow} ${styles.playerListRow}`}>
                  <span className={leaderboardStyles.rank}>{index + 1}</span>
                  <div className={leaderboardStyles.golfer}>
                    <span className={leaderboardStyles.golferName}>{joinedPlayers[index]?.name ?? `Player ${index + 1}`}</span>
                    {!joinedPlayers[index] && <span className={leaderboardStyles.tee}>Open spot</span>}
                  </div>
                  {joinedPlayers[index] && <button type="button" className={styles.playerDelete} aria-label={`Delete ${joinedPlayers[index].name}`} onClick={() => setRemovedPlayers(previous => new Set([...previous, joinedPlayers[index].key]))}><Trash2 size={18} aria-hidden /></button>}
                </li>)}
              </ol>
              <button type="button" className={`${leaderboardStyles.single} ${styles.playerRow} ${styles.addPlayer}`} disabled={playerTotal >= MAX_PLAYERS} onClick={() => setPlayerTotal(count => count + 1)}>
                <span className={leaderboardStyles.rank}><Plus size={16} aria-hidden="true" /></span>
                <span className={leaderboardStyles.cardButton} aria-hidden="true">ADD</span>
                <span className={leaderboardStyles.golferName}>Add player</span>
              </button>
            </div>
        </section>
      </div>}

      {placeholder && <section className={styles.card}><button type="button" onClick={() => setPlaceholder(null)}>Back to settings</button><h2>Place holder {placeholder <= 6 ? placeholder : placeholder - 6}</h2></section>}
      {scorecardViewOpen && <div className={styles.competition}>
        <div className={styles.typeGroup} role="radiogroup" aria-label="Scorecard view">
          <h4 className={styles.typeHeading}>How scoring opens on your phone</h4>
          <div className={styles.typeChoices}>
            {SCORING_VIEWS.map(option => <button key={option.value} type="button" role="radio" aria-checked={scoringView === option.value} aria-pressed={scoringView === option.value}
              className={styles.typeChoice} onClick={() => setScoringView(option.value)}>{option.label}</button>)}
          </div>
          <p className={styles.scorecardViewNote}>{scoringView === "slide" ? "Pull the Scoring bar up from the bottom of the trip page." : scoringView === "hold" ? "Press and hold anywhere on the trip page for 2 seconds to open scoring full screen." : "Tap the Scoring button above the bottom menu to open scoring full screen."}</p>
        </div>
      </div>}

      {playerScoringOpen && <div className={styles.competition}>
        <section className={notificationStyles.category} aria-label="What players enter">
          <h2 className={notificationStyles.categoryTitle}>What players enter</h2>
          <div className={notificationStyles.row}><span className={notificationStyles.label}>Their own score</span><span className={styles.alwaysOn}>Always on</span></div>
          {PLAYER_SCORING_FIELDS.map(field => {
            const on = !scoringFieldsOff.has(field);
            return <div key={field} className={notificationStyles.row}>
              <span className={notificationStyles.label}>{field}</span>
              <button type="button" role="switch" aria-checked={on} aria-label={field} className={toggleStyles.toggle}
                onClick={() => setScoringFieldsOff(current => { const next = new Set(current); if (on) next.add(field); else next.delete(field); return next; })}>
                <span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span><span>{on ? "On" : "Off"}</span>
              </button>
            </div>;
          })}
        </section>
      </div>}

      {allowedOpen && <div className={styles.competition}>
        <div className={tripStyles.events}>
          {ALLOWED_SECTIONS.map(name => <section key={name} className={tripStyles.infoSection}>
            <div className={tripStyles.infoHeaderRow}>
              <h2 className={tripStyles.eventsHeading}>{name}</h2>
            </div>
            {allowedRules.filter(rule => rule.section === name).map(rule => <div key={rule.id} className={styles.roundRow}>
              <div className={`${tripStyles.infoEntry} ${styles.roundEntry} ${styles.allowedEntry}`}>
                <span className={tripStyles.eventInfo}>
                  <span className={tripStyles.eventHost}>Allowed</span>
                  <span className={tripStyles.eventTitle}>{rule.name}</span>
                  <span className={tripStyles.eventMeta}><Check size={14} aria-hidden /><span>{rule.detail}</span></span>
                </span>
              </div>
              <button type="button" className={`${tripStyles.entryDelete} ${styles.roundDelete}`} aria-label={`Delete ${rule.name}`} onClick={() => setConfirmDeleteRuleId(rule.id)}><Trash2 size={16} aria-hidden /></button>
            </div>)}
            <button type="button" className={tripStyles.addItemButton} onClick={() => setAllowedRules(current => [...current, { id: `rule-${Date.now()}`, section: name, name: "New rule", detail: "Details TBD" }])}><Plus size={16} strokeWidth={2.5} aria-hidden />Add rule</button>
          </section>)}
        </div>
        {confirmDeleteRuleId && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete rule confirmation">
          <div className={tripStyles.deleteDialog}>
            <p className={tripStyles.deletePrompt}>Are you sure?</p>
            <button type="button" className={tripStyles.cancelButton} onClick={() => setConfirmDeleteRuleId(null)}>Keep editing</button>
            <button type="button" className={tripStyles.deleteButton} onClick={() => { setAllowedRules(current => current.filter(rule => rule.id !== confirmDeleteRuleId)); setConfirmDeleteRuleId(null); }}>Delete</button>
          </div>
        </div>}
      </div>}

      {!placeholder && !competitionOpen && !gamesOpen && !roundsOpen && !playersOpen && !allowedOpen && !playerScoringOpen && !scorecardViewOpen && <div className={styles.grid}>
        {cards.map((title, index) => {
          if (title === "Competition") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setCompetitionOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Players") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setPlayersOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Trip Schedule") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setRoundsOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Scorecard View") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setScorecardViewOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Player Scoring") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setPlayerScoringOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Allowed") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setAllowedOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Games") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => { setGamesOpen(true); setSelectedGameId(null); }}>
            <h2>{title}</h2>
          </button>;
          return <button type="button" onClick={() => setPlaceholder(section === "General" ? index + 1 : index + 3)} key={index} className={`${styles.card} ${styles.cardButton}`} aria-label={title}>
            <h2>{title}</h2>
          </button>;
        })}
      </div>}
    </div>
  </main>;
}

/** "08:30" → "8:30 AM" (a tee time from the course pop-up). */
function teeTimeLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}
