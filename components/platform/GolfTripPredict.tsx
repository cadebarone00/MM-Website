"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Coins, X } from "lucide-react";
import { BET_CATEGORIES, betDef, priceTrip, type BetCategory, type Market, type PlayerLine, type TripSetup } from "@/lib/platform/predictBets";
import { STAT_LABELS, type StatKey } from "@/lib/platform/predictStats";
import { usePredictSettings } from "@/lib/platform/predictSetting";
import { Wheel } from "./Wheel";
import styles from "./GolfTripPredict.module.css";

/**
 * Golf Trip → Golf → Predict: a prediction market in Maroon Coins (play only, no cash value). Every price is the model's
 * chance (lib/platform/predictBets.ts): from history before the trip, then re-run with the live scores, so odds move
 * with play, never with bets (owner decision 2026-10-11). Buying locks in today's price: shares = coins ÷ price, and
 * each share pays 1 coin if it comes true. Selling cashes out at the current price. Three tabs: Winners · Scoring ·
 * Props. Preview: my coins and positions are kept on this device until the trip's market is saved to the database.
 */

const STARTING_COINS = 1000;
const BOOK_KEY = "golfTripPredictBook";
const pct = (p: number) => `${Math.round(p * 100)}%`;
const coins = (n: number) => Math.round(n).toLocaleString();

/** One tradable market: its outcomes (names) and the model's current chance for each. */
type Pool = { key: string; title: string; outcomes: string[]; chances: number[] };
type Book = { balance: number; positions: { key: string; outcome: number; shares: number; paid: number }[] };
/** The price you buy at: the chance, kept between 1% and 99% so nothing is free or impossible to buy. */
const buyPrice = (chance: number) => Math.min(0.99, Math.max(0.01, chance));

/** Every pool a market needs: outcome bets = one pool; ladders / spreads = one yes / no pool per line; two-sided = most + least. */
function poolsFor(market: Market): Pool[] {
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

const readBook = (): Book | null => { try { return JSON.parse(localStorage.getItem(BOOK_KEY) ?? "null"); } catch { return null; } };

export function GolfTripPredict({ setup }: { setup: TripSetup }) {
  const settings = usePredictSettings();
  // The model's odds with the live scores: re-run whenever scores change (4,000 simulated trips takes a moment).
  const markets = useMemo(() => priceTrip(setup, 4000, 7), [setup]);
  const shown = markets.filter((m) => !settings.off.includes(m.bet));
  const pools = useMemo(() => new Map(markets.flatMap(poolsFor).map((p) => [p.key, p])), [markets]);
  const [book, setBook] = useState<Book>({ balance: STARTING_COINS, positions: [] });
  // Pick up the saved book after the first render (so server and browser agree).
  useEffect(() => { const saved = readBook(); if (saved) setBook(saved); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- reads this device's saved book once
  const save = (next: Book) => { setBook(next); try { localStorage.setItem(BOOK_KEY, JSON.stringify(next)); } catch { /* private mode */ } };
  const priceOf = (pool: Pool) => pool.chances;
  const [tab, setTab] = useState<BetCategory>("Winners");
  const [trade, setTrade] = useState<{ pool: Pool; outcome: number } | null>(null);

  function buy(pool: Pool, outcome: number, spend: number) {
    const paid = Math.min(spend, book.balance);
    if (paid <= 0) return;
    const shares = paid / buyPrice(pool.chances[outcome]);
    save({ balance: book.balance - paid, positions: [...book.positions, { key: pool.key, outcome, shares, paid }] });
    setTrade(null);
  }
  /** Cash out at the model's current chance (100% = paid in full, 0% = nothing back). */
  function sell(index: number) {
    const pos = book.positions[index], pool = pools.get(pos.key);
    if (!pool) return;
    save({ balance: book.balance + pos.shares * pool.chances[pos.outcome], positions: book.positions.filter((_, i) => i !== index) });
  }

  const open = book.positions.map((pos, i) => {
    const pool = pools.get(pos.key);
    const value = pool ? pos.shares * pool.chances[pos.outcome] : 0;
    return { ...pos, index: i, pool, value };
  }).filter((p) => p.pool);
  const invested = open.reduce((a, p) => a + p.value, 0);
  const profit = book.balance + invested - STARTING_COINS;

  return <div className={styles.wrap}>
    <section className={styles.wallet} aria-label="My Maroon Coins">
      <div><span className={styles.walletLabel}><Coins size={14} aria-hidden="true" /> Maroon Coins</span><b className={styles.walletBig}>{coins(book.balance)}</b></div>
      <div><span className={styles.walletLabel}>In play</span><b>{coins(invested)}</b></div>
      <div><span className={styles.walletLabel}>Profit / loss</span><b className={profit >= 0 ? styles.up : styles.down}>{profit >= 0 ? "+" : ""}{coins(profit)}</b></div>
    </section>
    <p className={styles.fine}>Play coins for this trip only. No money changes hands.</p>

    <div className={styles.tabs} role="tablist" aria-label="Bet categories">
      {BET_CATEGORIES.map((c) => <button key={c} type="button" role="tab" aria-selected={tab === c} onClick={() => setTab(c)}>{c}</button>)}
    </div>

    <div className={styles.cards}>
      {shown.filter((m) => betDef(m.bet).category === tab && !(m.bet === "teamSpread" && shown.some((x) => x.bet === "teamWinner"))).map((m) =>
        <MarketCard key={m.bet} market={m} spread={m.bet === "teamWinner" ? shown.find((x) => x.bet === "teamSpread") : undefined} pools={pools} priceOf={priceOf} onPick={(pool, outcome) => setTrade({ pool, outcome })} />)}
      {!shown.some((m) => betDef(m.bet).category === tab) && <p className={styles.empty}>No {tab.toLowerCase()} bets are on for this trip.</p>}
    </div>

    {open.length > 0 && <section className={styles.positions} aria-label="My positions">
      <h3 className={styles.sectionTitle}>My positions</h3>
      {open.map((p) => <div key={p.index} className={styles.positionRow}>
        <span><b>{p.pool!.outcomes[p.outcome]}</b><small>{p.pool!.title} · {p.shares.toFixed(1)} shares · pays {coins(p.shares)} if right</small></span>
        <span className={styles.positionValue}><b className={p.value >= p.paid ? styles.up : styles.down}>{coins(p.value)}</b><small>paid {coins(p.paid)}</small></span>
        <button type="button" className={styles.sell} onClick={() => sell(p.index)}>Sell</button>
      </div>)}
    </section>}

    {trade && <TradeSheet pool={trade.pool} outcome={trade.outcome} balance={book.balance}
      onBuy={(spend) => buy(trade.pool, trade.outcome, spend)} onClose={() => setTrade(null)} />}
  </div>;
}

/** One bet's card. `spread`: a moneyline's spread market, shown under it on the same card (owner rule 2026-10-11). */
function MarketCard({ market, spread, pools, priceOf, onPick }: { market: Market; spread?: Market; pools: Map<string, Pool>; priceOf: (pool: Pool) => number[]; onPick: (pool: Pool, outcome: number) => void }) {
  const def = betDef(market.bet);
  const [side, setSide] = useState<"most" | "least">("most");
  const [stat, setStat] = useState<StatKey>("gir");
  const [ladderIndex, setLadderIndex] = useState<number | null>(null);
  // Bets listing every player show the top 3; "Show all" opens the rest in a scrolling list (owner request 2026-10-11).
  const [expanded, setExpanded] = useState(false);
  const topThree = (items: ReactNode[]) => items.length <= 3 ? items : <>
    {expanded ? <div className={styles.scrollList}>{items}</div> : items.slice(0, 3)}
    <button type="button" className={styles.showAll} onClick={() => setExpanded(!expanded)}>{expanded ? "Show top 3" : `Show all ${items.length}`}</button>
  </>;
  const lineRows = (rows: PlayerLine[], keyOf: (r: PlayerLine) => string) => rows.map((r) => {
    const pool = pools.get(keyOf(r))!, [over] = priceOf(pool);
    return <div key={r.id} className={styles.lineRow}>
      <span className={styles.outcomeName}>{r.name}<small>{r.count > 0 ? `${r.count} so far · ` : ""}O/U {r.line}</small></span>
      <button type="button" className={styles.yes} onClick={() => onPick(pool, 0)}>Over {pct(over)}</button>
      <button type="button" className={styles.no} onClick={() => onPick(pool, 1)}>Under {pct(1 - over)}</button>
    </div>;
  });
  const spreadMarket = market.kind === "spread" ? market : spread?.kind === "spread" ? spread : null;
  const spreadLines = spreadMarket?.lines ?? [];
  const [spreadIndex, setSpreadIndex] = useState(() => Math.max(0, spreadLines.findIndex((l) => l.spread === spreadMarket?.defaultSpread)));
  const spreadBody = spreadMarket && spreadLines.length > 0 ? (() => {
    const line = spreadLines[Math.min(spreadIndex, spreadLines.length - 1)];
    const pool = pools.get(`${spreadMarket.bet}:${line.spread}`)!;
    const [a] = priceOf(pool);
    return <>
      <div className={styles.slider}><span>Spread <b key={pool.outcomes[0]}>{pool.outcomes[0]}</b></span>
        <Wheel label="Alternate spread" index={Math.min(spreadIndex, spreadLines.length - 1)} onChange={setSpreadIndex} items={spreadLines.map((l) => l.spread > 0 ? `+${l.spread}` : String(l.spread))} />
      </div>
      <div className={styles.pair}>
        <button type="button" className={styles.yes} onClick={() => onPick(pool, 0)}>{pool.outcomes[0]}<b>{pct(a)}</b></button>
        <button type="button" className={styles.no} onClick={() => onPick(pool, 1)}>{pool.outcomes[1]}<b>{pct(1 - a)}</b></button>
      </div>
    </>;
  })() : null;
  const row = (pool: Pool, outcome: number, label: string, key: string | number) => {
    const price = priceOf(pool)[outcome];
    return <button key={key} type="button" className={styles.outcome} onClick={() => onPick(pool, outcome)}>
      <span className={styles.outcomeName}>{label}</span>
      <span className={styles.bar} aria-hidden="true"><span style={{ width: pct(price) }} /></span>
      <b className={styles.outcomePrice}>{pct(price)}</b>
    </button>;
  };
  let body;
  if (market.kind === "outcomes") {
    const pool = pools.get(market.bet)!;
    body = <>
      {spreadBody && <p className={styles.subhead}>Moneyline</p>}
      {topThree(pool.outcomes.map((o, i) => row(pool, i, o, i)))}
      {spreadBody && <><p className={styles.subhead}>Spread</p>{spreadBody}</>}
    </>;
  }
  else if (market.kind === "twoSided") {
    const pool = pools.get(`${market.bet}:${side}`)!;
    body = <>
      <div className={styles.switch} role="group" aria-label="Most or fewest">
        {(["most", "least"] as const).map((s) => <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>{s === "most" ? "Most" : "Fewest"}</button>)}
      </div>
      {topThree(pool.outcomes.map((o, i) => row(pool, i, o, `${side}-${i}`)))}
    </>;
  } else if (market.kind === "ladder") {
    // One line at a time: the slider moves between lines (owner request 2026-10-11); starts at the line nearest 50 / 50.
    const index = Math.min(ladderIndex ?? market.lines.reduce((best, l, i) => Math.abs(l.chance - 0.5) < Math.abs(market.lines[best].chance - 0.5) ? i : best, 0), market.lines.length - 1);
    const l = market.lines[index], pool = pools.get(`${market.bet}:${l.line}`)!, [yes] = priceOf(pool);
    body = <>
      <div className={styles.slider}><span>Line <b key={l.label}>{l.label}</b></span>
        <Wheel label="Line" index={index} onChange={setLadderIndex} items={market.lines.map((x) => x.label.replace(/^(Under|Over) /, ""))} />
      </div>
      <div className={styles.pair}>
        <button type="button" className={styles.yes} onClick={() => onPick(pool, 0)}>Yes<b>{pct(yes)}</b></button>
        <button type="button" className={styles.no} onClick={() => onPick(pool, 1)}>No<b>{pct(1 - yes)}</b></button>
      </div>
    </>;
  }
  else if (market.kind === "spread") body = spreadBody;
  else if (market.kind === "playerLines") body = <>
    <p className={styles.roundNote}>{market.round === null ? "Whole trip" : `Round ${market.round + 1}`} · updates hole by hole</p>
    {topThree(lineRows(market.rows, (r) => `${market.bet}:${market.round}:${r.id}:${r.line}`))}
  </>;
  else if (market.kind === "statLines") body = <>
    <div className={`${styles.switch} ${styles.switch3}`} role="group" aria-label="Stat">
      {(Object.keys(STAT_LABELS) as StatKey[]).map((s) => <button key={s} type="button" aria-pressed={stat === s} onClick={() => setStat(s)}>{STAT_LABELS[s]}</button>)}
    </div>
    <p className={styles.roundNote}>{market.round === null ? "Whole trip" : `Round ${market.round + 1}`} · updates hole by hole</p>
    {topThree(lineRows(market.stats[stat], (r) => `${market.bet}:${stat}:${r.id}:${r.line}`))}
  </>;
  else if (market.kind === "matches") body = <>
    <p className={styles.roundNote}>Round {market.round + 1} · odds update hole by hole</p>
    {market.matches.map((m, i) => {
      const pool = pools.get(`${market.bet}:${market.round}:${i}`)!, [l, h, r] = priceOf(pool);
      const done = m.status.includes(" won ") || m.status === "Halved";
      return <div key={i} className={styles.match}>
        <div className={styles.matchHead}><span>Match {i + 1}</span><b data-final={done || undefined}>{m.status}</b></div>
        <div className={styles.matchSides}>
          <button type="button" className={styles.matchSide} onClick={() => onPick(pool, 0)}><span>{m.left}</span><b>{pct(l)}</b></button>
          <button type="button" className={`${styles.matchSide} ${styles.matchHalve}`} onClick={() => onPick(pool, 1)}><span>Halved</span><b>{pct(h)}</b></button>
          <button type="button" className={styles.matchSide} onClick={() => onPick(pool, 2)}><span>{m.right}</span><b>{pct(r)}</b></button>
        </div>
      </div>;
    })}
  </>;
  else { const pool = pools.get(market.bet)!, [yes] = priceOf(pool);
    body = <div className={styles.pair}>
      <button type="button" className={styles.yes} onClick={() => onPick(pool, 0)}>Yes<b>{yes < 0.01 ? "<1%" : pct(yes)}</b></button>
      <button type="button" className={styles.no} onClick={() => onPick(pool, 1)}>No<b>{yes < 0.01 ? ">99%" : pct(1 - yes)}</b></button>
    </div>; }
  return <section className={styles.card} aria-label={def.title}>
    <h3 className={styles.cardTitle}>{spreadBody && market.kind === "outcomes" ? `${def.title} & spread` : def.title}</h3>
    <p className={styles.cardBlurb}>{def.blurb}</p>
    <div className={styles.cardBody}>{body}</div>
  </section>;
}

function TradeSheet({ pool, outcome, balance, onBuy, onClose }: { pool: Pool; outcome: number; balance: number; onBuy: (spend: number) => void; onClose: () => void }) {
  const [spend, setSpend] = useState(Math.min(50, Math.floor(balance)));
  const now = pool.chances[outcome];
  const shares = spend / buyPrice(now);
  // The spend wheel: steps of 5 coins up to my balance.
  const amounts = balance >= 5 ? Array.from({ length: Math.floor(balance / 5) }, (_, i) => (i + 1) * 5) : [Math.max(1, Math.floor(balance))];
  return <div className={styles.sheetOverlay} role="dialog" aria-modal="true" aria-label={`Buy ${pool.outcomes[outcome]}`}>
    <div className={styles.sheet}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close"><X size={18} aria-hidden="true" /></button>
      <p className={styles.sheetKicker}>{pool.title}</p>
      <h3 className={styles.sheetTitle}>{pool.outcomes[outcome]} <span>{pct(now)}</span></h3>
      <p className={styles.sheetNote}>Odds from the model and the live scores. Buying locks in {pct(buyPrice(now))}; your bet doesn&apos;t move the price.</p>
      <div className={styles.chips}>{[10, 25, 50, 100, 250].map((n) => <button key={n} type="button" aria-pressed={spend === n} disabled={n > balance} onClick={() => setSpend(n)}>{n}</button>)}</div>
      <div className={styles.slider}><span>Spend <b key={spend}>{coins(spend)}</b> of {coins(balance)}</span>
        <Wheel label="Coins to spend" index={amounts.reduce((best, a, i) => Math.abs(a - spend) < Math.abs(amounts[best] - spend) ? i : best, 0)} onChange={(i) => setSpend(amounts[i])} items={amounts.map(coins)} />
      </div>
      <dl className={styles.quote}>
        <div><dt>Shares</dt><dd>{shares.toFixed(1)}</dd></div>
        <div><dt>Pays if right</dt><dd className={styles.up}>{coins(shares)}</dd></div>
        <div><dt>Profit if right</dt><dd className={styles.up}>+{coins(shares - spend)}</dd></div>
      </dl>
      <button type="button" className={styles.buy} disabled={spend <= 0 || spend > balance} onClick={() => onBuy(spend)}>Buy for {coins(spend)} coins</button>
    </div>
  </div>;
}

