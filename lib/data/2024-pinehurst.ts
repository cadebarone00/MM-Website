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
    maroon: ["cam-latto", "drew-weisser", "jackson-collins", "luke-sherrell"],
    white: ["cade-barone", "collin-ross", "dalton-spriggs", "peyton-vos"],
  },
  maroonPts: 13.5,
  whitePts: 19.5,
  pointsAvailable: 33,
  pointsToWin: 17.75,
  matches: [
    { id: "p24-g1", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["luke-sherrell", "jackson-collins"], whitePlayers: ["dalton-spriggs", "collin-ross"], maroonPts: 2, whitePts: 0, margin: 3, holesRemaining: 1 },
    { id: "p24-g2", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["cam-latto", "drew-weisser"], whitePlayers: ["cade-barone", "peyton-vos"], maroonPts: 0.25, whitePts: 1.75, margin: 3, holesRemaining: 2 },
    { id: "p24-g7", day: 2, session: "Afternoon", format: "Play 4, Take 3", maroonPlayers: ["Team Maroon"], whitePlayers: ["Team White"], maroonPts: 0, whitePts: 3, margin: 3, holesRemaining: 0 },
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
    "Several Day 2–4 games at Pinehurst were recorded without player names in the source sheet (scrambles and singles marked only \"Players\"). Final team result and individual standings are complete; only the games with recorded pairings are shown above.",
  individualChampion: "cade-barone",
  individualChampionPhoto: "/champions/2024.jpg",
};
