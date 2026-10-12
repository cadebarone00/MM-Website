import type { HistoricalPackage } from "./historicalPackage";

// Test fixture for the Historical Trip Package tests (not app data).
const holes = (strokes: number[]) => strokes.map((s, i) => ({ number: i + 1, par: 4, strokes: s, putts: 2, fairway: "hit" as const, green: true }));

/** A small, valid package for a made-up group: one year, two people, one individual round, one match. */
export function samplePackage(): HistoricalPackage {
  return {
    format: "historical-trip-package", version: 1,
    dataset: { key: "desert-boys-2023", name: "Desert Boys 2023", source: "Organizer spreadsheet", exportedAt: "2026-10-10" },
    event: { key: "desert-boys", name: "Desert Boys" },
    participants: [{ key: "p:al", name: "Al Moss" }, { key: "p:bo", name: "Bo Lane" }],
    courses: [{ key: "c:canyon", name: "Canyon Ridge", place: "Scottsdale, AZ", ref: null, par: 72 }],
    editions: [{
      key: "2023", year: 2023, label: "Desert Boys 2023", startDate: "2023-04-20", endDate: "2023-04-23", place: "Scottsdale, AZ",
      teams: [{ key: "red", name: "Red", color: "#aa0000" }, { key: "blue", name: "Blue", color: null }],
      roster: [{ participant: "p:al", team: "red", captain: true }, { participant: "p:bo", team: "blue", captain: null }],
      rounds: [{ key: "2023:r1", number: 1, day: 1, session: "Morning", date: "2023-04-21", course: "c:canyon", format: "Singles", scoring: "individual",
        scores: [{ participant: "p:al", holesPlayed: 18, total: 80, holes: holes([...Array(17).fill(4), 12]) }, { participant: "p:bo", holesPlayed: 18, total: null, holes: [] }] }],
      matches: [{ key: "2023:m1", round: "2023:r1", format: "Singles", sides: [{ team: "red", participants: ["p:al"] }, { team: "blue", participants: ["p:bo"] }], points: [1, 0], result: "2&1", winner: "0" }],
      results: { teams: [{ team: "red", points: 1 }, { team: "blue", points: 0 }], pointsAvailable: 1, winnerTeam: "red", individualChampion: "p:al" },
    }],
    flags: [],
  };
}
