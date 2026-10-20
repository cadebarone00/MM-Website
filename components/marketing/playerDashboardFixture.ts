/** Fixed fictional presentation data. No account identifiers, imports, calculations or persistence. */
export const playerDashboardFixture = {
  player: { name: "Avery Turner", username: "avery.turner", initials: "AT", since: "2025", home: "Austin, Texas", bio: "Early tee times. Good company. Always one more round." },
  stats: [
    { label: "Handicap index", value: "8.4", detail: "Your game, over time" },
    { label: "Average score", value: "82.6", detail: "18-hole rounds" },
    { label: "Personal best", value: "76", detail: "Willow Pines GC" },
    { label: "Rounds played", value: "24", detail: "A season well spent" },
  ],
  rounds: [
    { date: "Oct 12, 2026", course: "Willow Pines GC", context: "Personal round", score: "79", par: "+7" },
    { date: "Sep 26, 2026", course: "Cedar Ridge GC", context: "Autumn Invitational", score: "84", par: "+12" },
    { date: "Sep 18, 2026", course: "Lakewood Links", context: "Weekend with the crew", score: "81", par: "+9" },
  ],
  trips: [
    { status: "Upcoming", name: "The Invitational", destination: "Palm Springs, California", date: "Apr 22–25, 2027", detail: "12 players · 3 rounds" },
    { status: "Past", name: "A long weekend north", destination: "Traverse City, Michigan", date: "Aug 14–17, 2026", detail: "8 players · 3 rounds" },
  ],
  tournaments: [
    { name: "Autumn Invitational", year: "2026", team: "Team Maroon", result: "Team winner", detail: "3 rounds · Match play" },
    { name: "Spring Fourball", year: "2026", team: "Turner / Morgan", result: "Runner-up", detail: "2 rounds · Fourball" },
  ],
} as const;
