import { palmSprings2026 } from "./2026-palm-springs";
import { fmtPt } from "./index";
import { getPlayerDisplayName } from "./players";

export type HomeHighlight = { id: string; label: string; title: string; body: string; href: string };

/** Follow Home's explicit/calendar year; retain its historical default before legacy handoff. */
export function homeHighlightsYear(catalog: {
  selectedYear?: number | null;
  scheduled: boolean;
  leaderboardOpen: boolean;
  nextTournament: { year: number };
  latestCompleted: { year: number };
}): number {
  return catalog.selectedYear ?? (catalog.scheduled || catalog.leaderboardOpen
    ? catalog.nextTournament.year : catalog.latestCompleted.year);
}

const tournament = palmSprings2026;
const leaderboard = `/leaderboard/${tournament.slug}`;
const matchLink = (id: string) => `${leaderboard}/matches/${id}`;

// Editorial summaries of checked-in final results, not a chronological live event log.
// No shot, streak, or clinching-hole claims are inferred from final match scores.
const highlights2026: readonly HomeHighlight[] = [
  {
    id: "2026-cup", label: "Jan 10, 2026 · Final",
    title: "Maroon wins the Cup by one point",
    body: `Team Maroon finishes ${fmtPt(tournament.maroonPts)}–${fmtPt(tournament.whitePts)} ahead at Mission Hills, reaching the ${tournament.pointsToWin} points needed to win.`,
    href: leaderboard,
  },
  {
    id: "2026-individual", label: "Jan 10, 2026 · Individual title",
    title: "Nate takes the individual crown",
    body: "Nate Wojciechowski finishes at +13, two strokes ahead of Collin Ross (+15). Cade Barone takes third at +16.",
    href: `${leaderboard}/players/nate-wojciechowski`,
  },
  {
    id: "2026-cam-singles", label: "Jan 10, 2026 · Singles",
    title: "Cam goes three for three in singles",
    body: "Cam Latto follows Thursday’s 1-up win over Cade Barone with Saturday wins over Kyle Schnabel, 4 & 3, and Dalton Spriggs, 2 up.",
    href: matchLink("p26-m30"),
  },
  {
    id: "2026-drew-singles", label: "Jan 10, 2026 · Singles",
    title: "Drew completes a perfect singles run",
    body: "Drew Weisser beats Jackson Collins 4 & 3 on Thursday, then Quez Currier 1 up and Kyle Schnabel 3 & 1 on Saturday for three singles points.",
    href: matchLink("p26-m29"),
  },
  ...Array.from({ length: 8 }, (_, index): HomeHighlight => {
    const day = Math.floor(index / 2) + 1;
    const session = index % 2 === 0 ? "Morning" : "Afternoon";
    const matches = tournament.matches.filter(match => match.day === day && match.session === session);
    const maroon = matches.reduce((sum, match) => sum + match.maroonPts, 0);
    const white = matches.reduce((sum, match) => sum + match.whitePts, 0);
    const throughSession = tournament.matches.filter(match => match.day < day || (match.day === day && (session === "Afternoon" || match.session === "Morning")));
    const totalMaroon = throughSession.reduce((sum, match) => sum + match.maroonPts, 0);
    const totalWhite = throughSession.reduce((sum, match) => sum + match.whitePts, 0);
    const titles = [
      "Maroon takes the opening fourball session",
      "Maroon builds a three-point lead",
      "White answers in Thursday fourball",
      "Thursday singles finish level",
      "Maroon stretches its lead on Friday morning",
      "White sweeps alternate shot to draw level",
      "Maroon regains the lead heading into the final session",
      "A split final session seals Maroon’s 17–16 win",
    ];
    return {
      id: `2026-session-${index + 1}`,
      label: `Jan ${day + 6}, 2026 · ${session} · ${matches[0].format}`,
      title: titles[index],
      body: `Session points: Maroon ${fmtPt(maroon)}, White ${fmtPt(white)}. Overall: Maroon ${fmtPt(totalMaroon)}, White ${fmtPt(totalWhite)}.`,
      href: leaderboard,
    };
  }).reverse(),
  {
    id: "2026-opening-win", label: "Jan 7, 2026 · Morning · Fourball",
    title: "Hugo and Nate open with a 4 & 3 win",
    body: `${getPlayerDisplayName("hugo-moebel")} and ${getPlayerDisplayName("nate-wojciechowski")} beat Collin Ross and Dalton Spriggs to help Maroon take the opening session 2–1.`,
    href: matchLink("p26-m3"),
  },
];

/** An unpopulated season must never inherit another year's highlights. */
export function getHomeHighlights(year: number): readonly HomeHighlight[] {
  return year === 2026 ? highlights2026 : [];
}
