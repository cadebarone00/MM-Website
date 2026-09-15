import type { Tournament } from "./types";

export const pinehurst2024: Tournament = {
  slug: "2024-pinehurst",
  editionLabel: "The Maroon Masters 2024",
  year: 2024,
  venue: "Pinehurst",
  location: "Pinehurst, NC",
  dateLabel: "January 9–12, 2024",
  startDate: "2024-01-09",
  endDate: "2024-01-12",
  dayDates: { 1: "2024-01-09", 2: "2024-01-10", 3: "2024-01-11", 4: "2024-01-12" },
  roster: {
    maroon: ["cam-latto", "drew-weisser", "jackson-collins", "luke-sherrell"],
    white: ["cade-barone", "collin-ross", "dalton-spriggs", "peyton-vos"],
  },
  maroonPts: 13.5,
  whitePts: 19.5,
  pointsAvailable: 33,
  pointsToWin: 17.75,
  matches: [
    // Day 1 — Mid Pines GC, Morning, Fourball
    { id: "p24-g1", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["luke-sherrell", "jackson-collins"], whitePlayers: ["dalton-spriggs", "collin-ross"], maroonPts: 2, whitePts: 0, margin: 3, holesRemaining: 1, teeTimeCst: "8:05 AM" },
    { id: "p24-g2", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["cam-latto", "drew-weisser"], whitePlayers: ["cade-barone", "peyton-vos"], maroonPts: 0.25, whitePts: 1.75, margin: 3, holesRemaining: 2, teeTimeCst: "8:15 AM" },
    // Day 1 Afternoon: a "Scramble" at Talamore Golf Resort was scheduled in
    // the source sheet but never played — every score cell is blank
    // (confirmed with Cade, 2026-09-15) — so no match here.

    // Day 2 — The Mid South Club, Morning, Fourball
    { id: "p24-g5", day: 2, session: "Morning", format: "Fourball", maroonPlayers: ["drew-weisser", "luke-sherrell"], whitePlayers: ["collin-ross", "cade-barone"], maroonPts: 1, whitePts: 1, teeTimeCst: "8:30 AM" },
    { id: "p24-g6", day: 2, session: "Morning", format: "Fourball", maroonPlayers: ["cam-latto", "jackson-collins"], whitePlayers: ["peyton-vos", "dalton-spriggs"], maroonPts: 2, whitePts: 0, margin: 3, holesRemaining: 1, teeTimeCst: "8:40 AM" },
    // Day 2 — The Cradle (9-hole short course), Afternoon, Play 4 Take 3 —
    // a team format (best 3 of 4 scores per hole), not an individual format;
    // excluded from individual scoring.
    { id: "p24-g7", day: 2, session: "Afternoon", format: "Play 4, Take 3", maroonPlayers: ["Team Maroon"], whitePlayers: ["Team White"], maroonPts: 0, whitePts: 3, margin: 3, holesRemaining: 0 },

    // Day 3 — Pine Needles GC, Morning, Fourball
    { id: "p24-g8", day: 3, session: "Morning", format: "Fourball", maroonPlayers: ["luke-sherrell", "cam-latto"], whitePlayers: ["cade-barone", "dalton-spriggs"], maroonPts: 1, whitePts: 1, teeTimeCst: "8:10 AM" },
    { id: "p24-g9", day: 3, session: "Morning", format: "Fourball", maroonPlayers: ["jackson-collins", "drew-weisser"], whitePlayers: ["collin-ross", "peyton-vos"], maroonPts: 0, whitePts: 2, teeTimeCst: "8:20 AM" },
    // Day 3 — Pine Needles GC, Afternoon, Alternate Shot
    { id: "p24-g10", day: 3, session: "Afternoon", format: "Alt Shot", maroonPlayers: ["drew-weisser", "cam-latto"], whitePlayers: ["dalton-spriggs", "collin-ross"], maroonPts: 2, whitePts: 0, teeTimeCst: "12:50 PM" },
    { id: "p24-g11", day: 3, session: "Afternoon", format: "Alt Shot", maroonPlayers: ["luke-sherrell", "jackson-collins"], whitePlayers: ["cade-barone", "peyton-vos"], maroonPts: 0, whitePts: 2, teeTimeCst: "1:00 PM" },

    // Day 4 — Tobacco Road GC, Morning, Singles
    { id: "p24-g12", day: 4, session: "Morning", format: "Singles", maroonPlayers: ["cam-latto"], whitePlayers: ["cade-barone"], maroonPts: 0, whitePts: 2, teeTimeCst: "7:24 AM" },
    { id: "p24-g13", day: 4, session: "Morning", format: "Singles", maroonPlayers: ["luke-sherrell"], whitePlayers: ["dalton-spriggs"], maroonPts: 1.5, whitePts: 0.5, teeTimeCst: "7:24 AM" },
    { id: "p24-g14", day: 4, session: "Morning", format: "Singles", maroonPlayers: ["drew-weisser"], whitePlayers: ["peyton-vos"], maroonPts: 0.5, whitePts: 1.5, teeTimeCst: "7:36 AM" },
    { id: "p24-g15", day: 4, session: "Morning", format: "Singles", maroonPlayers: ["jackson-collins"], whitePlayers: ["collin-ross"], maroonPts: 1.75, whitePts: 0.25, teeTimeCst: "7:36 AM" },
    // Day 4 — Tobacco Road GC, Afternoon, Singles
    { id: "p24-g16", day: 4, session: "Afternoon", format: "Singles", maroonPlayers: ["drew-weisser"], whitePlayers: ["cade-barone"], maroonPts: 0, whitePts: 2 },
    { id: "p24-g17", day: 4, session: "Afternoon", format: "Singles", maroonPlayers: ["cam-latto"], whitePlayers: ["peyton-vos"], maroonPts: 0, whitePts: 2 },
    { id: "p24-g18", day: 4, session: "Afternoon", format: "Singles", maroonPlayers: ["jackson-collins"], whitePlayers: ["dalton-spriggs"], maroonPts: 1.5, whitePts: 0.5 },
    // Game 19 (Luke vs Collin) is deliberately NOT here — see archiveOnlyMatches below.
  ],
  // Day 4 PM's 4th singles match (Luke vs Collin) never happened — Luke
  // couldn't play, no points were awarded, and it was never a real match
  // (confirmed with Cade, 2026-09-15). Collin's individual score is real,
  // just not a match result, so it lives here rather than in `matches` —
  // the Round & Format Archive shows it as a solo entry; every public page
  // (which only reads `matches`) never sees it.
  archiveOnlyMatches: [
    { id: "p24-g19", day: 4, session: "Afternoon", format: "Singles", maroonPlayers: [], whitePlayers: ["collin-ross"], maroonPts: 0, whitePts: 0 },
  ],
  individualLeaderboard: [
    { player: "cade-barone", team: "white", toPar: 10 },
    { player: "luke-sherrell", team: "maroon", toPar: 31 },
    { player: "cam-latto", team: "maroon", toPar: 39 },
    { player: "peyton-vos", team: "white", toPar: 42 },
    { player: "collin-ross", team: "white", toPar: 45 },
    { player: "drew-weisser", team: "maroon", toPar: 51 },
    { player: "dalton-spriggs", team: "white", toPar: 53 },
    { player: "jackson-collins", team: "maroon", toPar: 58 },
  ],
  notes:
    "Full match pairings and tee times for every round confirmed from the original trip spreadsheet (2026-09-15) — the prior note about missing Day 2–4 pairings was wrong. Two open items: the Talamore Golf Resort \"Scramble\" scheduled for Day 1 afternoon was never played (blank scorecard, no match here), and Day 4's 4th afternoon singles match (Luke vs Collin) never happened — Luke couldn't play, no points were awarded; Collin's individual score is recorded separately (see archiveOnlyMatches), not as a match result. Final team result and individual standings are complete.",
  individualChampion: "cade-barone",
  individualChampionPhoto: "/champions/2024.jpg",
};
