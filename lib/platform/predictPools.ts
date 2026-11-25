import { betDef, type Market } from "./predictBets";
import { STAT_LABELS, type StatKey } from "./predictStats";

/**
 * Golf Trip → Predict: the tradable pools each market is made of (website GolfTripPredict and the app's Predict). A pool's
 * key is what a wallet position points at, so the website and the app must build them the same way.
 */

/** One tradable market: its outcomes (names) and the model's current chance for each. */
export type Pool = { key: string; title: string; outcomes: string[]; chances: number[] };

/** Every pool a market needs: outcome bets = one pool; ladders / spreads = one yes / no pool per line; two-sided = most + least. */
export function poolsFor(market: Market): Pool[] {
  const title = betDef(market.bet).title;
  switch (market.kind) {
    case "outcomes": return [{ key: market.bet, title, outcomes: market.outcomes.map((o) => o.label), chances: market.outcomes.map((o) => o.chance) }];
    case "twoSided": return [
      { key: `${market.bet}:most`, title: `Most ${title.toLowerCase()}`, outcomes: market.most.map((o) => o.label), chances: market.most.map((o) => o.chance) },
      { key: `${market.bet}:least`, title: `Fewest ${title.toLowerCase()}`, outcomes: market.least.map((o) => o.label), chances: market.least.map((o) => o.chance) }];
    case "ladder": return market.lines.map((l) => ({ key: `${market.bet}:${l.line}`, title: `${title}: ${l.label}`, outcomes: ["Yes", "No"], chances: [l.chance, 1 - l.chance] }));
    case "spread": return market.lines.map((l) => ({ key: `${market.bet}:${l.spread}`, title: `${market.teams[0]} ${l.spread > 0 ? "+" : ""}${l.spread}`, outcomes: [`${market.teams[0]} ${l.spread > 0 ? "+" : ""}${l.spread}`, `${market.teams[1]} ${-l.spread > 0 ? "+" : ""}${-l.spread}`], chances: [l.chanceA, 1 - l.chanceA] }));
    case "yesNo": return [{ key: market.bet, title, outcomes: ["Yes", "No"], chances: [market.chance, 1 - market.chance] }];
    case "matches": return market.matches.map((m, i) => ({ key: `${market.bet}:${market.round}:${i}`, title: `Round ${market.round + 1} · ${m.left} vs ${m.right}`, outcomes: [m.left, "Halved", m.right], chances: m.chances }));
    case "playerLines": return market.rows.map((row) => ({ key: `${market.bet}:${market.round}:${row.id}:${row.line}`, title: `${market.round === null ? "Trip" : `Round ${market.round + 1}`} · ${title}`,
      outcomes: [`${row.name} over ${row.line}`, `${row.name} under ${row.line}`], chances: [row.over, 1 - row.over] }));
    case "statLines": return (Object.keys(market.stats) as StatKey[]).flatMap((stat) => market.stats[stat].map((row) => ({
      key: `${market.bet}:${stat}:${row.id}:${row.line}`, title: `${market.round === null ? "Trip" : `Round ${market.round + 1}`} · ${STAT_LABELS[stat]}`,
      outcomes: [`${row.name} over ${row.line} ${STAT_LABELS[stat].toLowerCase()}`, `${row.name} under ${row.line} ${STAT_LABELS[stat].toLowerCase()}`], chances: [row.over, 1 - row.over] })));
  }
}

