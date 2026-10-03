"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
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
const GAME_LOOKUP = [...GAME_GROUPS.Individual, ...GAME_GROUPS.Matches];

/** Reference layout with local game scoring settings in the site's maroon palette. */
export function GolfTripSettingsPreview({ tripName }: { tripName: string }) {
  const [section, setSection] = useState("General");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
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
        <p className={styles.previewNote}>Preview only. Changes stay during navigation and reset on reload.</p>
        {selectedRound ? <GolfTripCompetition rounds={[selectedRound]} onChange={change => competition.change(change, selectedRound.id)} showBulk={false} />
          : <div className={styles.grid}>
            {competition.rounds.map(round => <button key={round.id} type="button" className={styles.card + " " + styles.cardButton} onClick={() => setSelectedRoundId(round.id)}>
              <h2>Round {round.number}</h2>
              <div className={styles.cardSummary}>
                <span>Day {days.indexOf(round.date) + 1}</span>
                <span>{round.course}</span>
              </div>
            </button>)}
            {!competition.rounds.length && <p>No competition rounds configured yet.</p>}
          </div>}
      </div> : null}

      {<div hidden={!gamesOpen || competitionOpen} className={styles.competition}>
        <p className={styles.previewNote}>Preview only. Game setup resets on reload.</p>
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
