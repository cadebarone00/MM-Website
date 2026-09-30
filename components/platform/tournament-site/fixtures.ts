import type { TournamentSiteData } from "./types.ts";

// Entirely fictional identities, venues and results; never sent to an application service.
const names = ["Evan Mercer", "Owen Hale", "Liam Brooks", "Noah Ellis", "Mason Reed", "Theo Hayes", "Jack Rowan", "Finn Carter", "Alex Quinn", "Sam Porter", "Jordan Wells", "Casey Lane", "Riley Nash", "Jamie Cole", "Drew Sutton", "Taylor Price"];
export const texasCup: TournamentSiteData = {
  branding: { name: "Texas Cup 2027", shortName: "Texas Cup", primary: "#123e67", secondary: "#f5f0e4", accent: "#d5ac42" },
  status: "live", competition: "teams", dates: "October 8–10, 2027", destination: "Hill Country, Texas", timezone: "America/Chicago",
  description: "Sixteen friends. Three days. One cup. A match-play tradition among the rolling fairways of the Texas Hill Country.",
  teams: [{ id: "blue", name: "Blue", color: "#174e85", points: 3.5 }, { id: "gold", name: "Gold", color: "#ecd17e", points: 2.5 }],
  players: names.map((name, index) => ({ id: `p${index + 1}`, name, teamId: index < 8 ? "blue" : "gold", captain: index === 0 || index === 8, handicap: { public: index !== 3, value: 4 + index * .7 } })),
  standings: names.map((_, index) => ({ playerId: `p${index + 1}`, position: index + 1, score: index === 0 ? "−3" : index === 1 ? "−1" : index === 2 ? "E" : `+${index - 2}`, status: index < 4 ? "live" : "scheduled", progress: index < 4 ? `Thru ${12 - index}` : undefined })),
  matches: [
    { id: "m1", sideA: { teamId: "blue", players: ["p1", "p2"] }, sideB: { teamId: "gold", players: ["p9", "p10"] }, format: "Fourball", teeTime: "8:00 AM", status: "live", progress: "Thru 12", result: "Blue 1 UP" },
    { id: "m2", sideA: { teamId: "blue", players: ["p3", "p4"] }, sideB: { teamId: "gold", players: ["p11", "p12"] }, format: "Fourball", teeTime: "8:12 AM", status: "final", progress: "Thru 18", result: "Gold wins 2 & 1" },
    { id: "m3", sideA: { teamId: "blue", players: ["p5", "p6"] }, sideB: { teamId: "gold", players: ["p13", "p14"] }, format: "Alternate Shot", teeTime: "1:00 PM", status: "scheduled" },
    { id: "m4", sideA: { teamId: "blue", players: [] }, sideB: { teamId: "gold", players: [] }, format: "Singles", teeTime: "8:00 AM", status: "waiting" },
  ],
  courses: [
    { id: "c1", name: "Cedar Bend Golf Club", location: "Hill Country, TX", tee: "Championship", par: 72, yardage: 6840 },
    { id: "c2", name: "Juniper Ridge", location: "Hill Country, TX", tee: "Member", par: 71, yardage: 6420 },
  ],
  days: [
    { date: "2027-10-08", label: "Friday · Opening day", sessions: [{ id: "s1", label: "Morning fourball", courseId: "c1", format: "Fourball", teeTime: "8:00 AM", status: "live" }, { id: "s2", label: "Afternoon alternate shot", courseId: "c1", format: "Alternate Shot", teeTime: "1:00 PM", status: "scheduled" }] },
    { date: "2027-10-09", label: "Saturday · Moving day", sessions: [{ id: "s3", label: "Morning fourball", courseId: "c2", format: "Fourball", teeTime: "8:30 AM", status: "scheduled" }] },
    { date: "2027-10-10", label: "Sunday · The final round", sessions: [{ id: "s4", label: "Singles", courseId: "c1", format: "Singles", teeTime: "8:00 AM", status: "waiting" }] },
  ],
  information: [{ label: "Field", value: "16 players · 2 teams" }, { label: "Competition", value: "Match play" }, { label: "Scoring", value: "1 point for a win · ½ for a tie" }],
};

export const coastalOpen: TournamentSiteData = {
  branding: { name: "Coastal Open 2028", shortName: "Coastal Open", primary: "#204b43", secondary: "#eef3ee", accent: "#d7e8cf" },
  status: "final", competition: "individual", dates: "May 14, 2028", destination: "North Coast, Oregon", timezone: "America/Los_Angeles",
  description: "A quiet coastline, a demanding links course, and a championship decided one shot at a time.", teams: [],
  players: [{ id: "a", name: "Morgan Lake", handicap: { public: true, value: 3.2 } }, { id: "b", name: "Avery Moss", handicap: { public: false, value: 9.7 } }, { id: "c", name: "Robin Fern" }, { id: "d", name: "Sky River" }],
  standings: [{ playerId: "a", position: 1, score: "−4", status: "final", progress: "Thru 18" }, { playerId: "b", position: 2, score: "−1", status: "final" }, { playerId: "c", position: 3, score: "E", status: "final" }, { playerId: "d", position: 4, score: "+2", status: "final" }],
  matches: [], courses: [{ id: "links", name: "Northwind Links", location: "North Coast, OR", tee: "Coastal", par: 72, yardage: 6210 }],
  days: [{ date: "2028-05-14", label: "Sunday · Championship round", sessions: [{ id: "open", label: "Individual championship", courseId: "links", format: "Stroke play", teeTime: "9:00 AM", status: "final" }] }],
  information: [{ label: "Field", value: "4 players" }, { label: "Competition", value: "Individual stroke play" }],
  results: { headline: "Morgan Lake wins the Coastal Open", detail: "A final-round 68 secures a three-shot victory at Northwind Links." },
};
