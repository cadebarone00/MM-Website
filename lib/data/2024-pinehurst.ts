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
  roster: {
    maroon: ["Cam", "Drew", "Jackson", "Luke"],
    white: ["Cade", "Collin", "Dalton", "Peyton"],
  },
  maroonPts: 13.5,
  whitePts: 19.5,
  pointsAvailable: 33,
  pointsToWin: 17.75,
  matches: [
    { id: "p24-g1", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["Luke", "Jackson"], whitePlayers: ["Dalton", "Collin"], maroonPts: 2, whitePts: 0, margin: 3, holesRemaining: 1 },
    { id: "p24-g2", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["Cam", "Drew"], whitePlayers: ["Cade", "Peyton"], maroonPts: 0.25, whitePts: 1.75, margin: 3, holesRemaining: 2 },
    { id: "p24-g7", day: 2, session: "Afternoon", format: "Play 4, Take 3", maroonPlayers: ["Team Maroon"], whitePlayers: ["Team White"], maroonPts: 0, whitePts: 3, margin: 3, holesRemaining: 0 },
  ],
  individualLeaderboard: [
    { player: "Cade", team: "white", toPar: 10 },
    { player: "Luke", team: "maroon", toPar: 31 },
    { player: "Cam", team: "maroon", toPar: 39 },
    { player: "Peyton", team: "white", toPar: 42 },
    { player: "Collin", team: "white", toPar: 45 },
    { player: "Drew", team: "maroon", toPar: 51 },
    { player: "Dalton", team: "white", toPar: 53 },
    { player: "Jackson", team: "maroon", toPar: 58 },
  ],
  notes:
    "Several Day 2–4 games at Pinehurst were recorded without player names in the source sheet (scrambles and singles marked only \"Players\"). Final team result and individual standings are complete; only the games with recorded pairings are shown above.",
  individualChampion: "Cade",
  individualChampionPhoto: "/champions/2024.jpg",
};
