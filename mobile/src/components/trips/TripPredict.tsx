import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { BET_CATEGORIES, betDef, type BetCategory, type Market, type PlayerLine } from "@/lib/platform/predictBets";
import { buyPrice, parseBook, STARTING_COINS, type Book, type Trade } from "@/lib/platform/predictBook";
import { tripSetupFromPreview } from "@/lib/platform/predictFromPreview";
import { poolsFor, type Pool } from "@/lib/platform/predictPools";
import { runPredict } from "@/lib/platform/predictRun";
import { STAT_LABELS, type StatKey } from "@/lib/platform/predictStats";
import type { CompetitionStructure } from "@/lib/platform/golfTripNavigation";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { loadingWallet, openWallet, walletTrade, type DeviceWallet, type WalletRequest, type WalletState } from "@/lib/platform/predictWalletClient";
import { apiRaw } from "~/lib/api.ts";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/**
 * Golf → Predict in the app (website GolfTripPredict, project_specs.md Golf Trips part 2d slice 2 + "Predict follows the
 * account"): a play-only prediction market in Maroon Coins. Odds come from the same shared model and seed as the website
 * (runPredict), so the numbers match. My wallet is saved on my account for this trip, so the website and the phone show
 * the same coins and picks; before the account table is installed it stays on this phone.
 */

const pct = (p: number) => `${Math.round(p * 100)}%`;
const coins = (n: number) => Math.round(n).toLocaleString();

/** This phone's wallet, per trip: only used before the account table is installed (the app never had a device wallet to move). */
const deviceFor = (tripId: string): DeviceWallet => {
  const key = `golfTripPredictBook.${tripId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  return {
    read: () => { try { return parseBook(JSON.parse(SecureStore.getItem(key) ?? "null")); } catch { return null; } },
    write: (book: Book) => { try { SecureStore.setItem(key, JSON.stringify(book)); } catch { /* too big for the keychain: kept for this visit */ } },
    moved: () => true,
    markMoved: () => {},
  };
};

/** The trip's odds, worked out once after the screen has drawn (the simulation takes a moment), re-run when the scores change. */
function useMarkets(match: GolfMatchPreview, structure: CompetitionStructure): Market[] | null {
  const key = useMemo(() => JSON.stringify(tripSetupFromPreview(match, structure)), [match, structure]);
  const [result, setResult] = useState<{ key: string; markets: Market[] } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => { try { setResult({ key, markets: runPredict(JSON.parse(key)) }); } catch { /* keep the last odds */ } }, 50);
    return () => clearTimeout(timer);
  }, [key]);
  return result?.markets ?? null;
}

/** My wallet for this trip (lib/platform/predictWalletClient.ts does the work). `device` must be the same object every render. */
function usePredictWallet(tripId: string | null, request: WalletRequest | null, device: DeviceWallet) {
  const [state, setState] = useState<WalletState>(loadingWallet);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void openWallet(request, device).then((next) => { if (live) setState(next); });
    return () => { live = false; };
  }, [tripId, request, device]);
  const trade = useCallback(async (next: Trade) => {
    setBusy(true);
    const result = await walletTrade(state, next, request, device);
    setState(result.state);
    setBusy(false);
    return result.ok;
  }, [state, request, device]);
  return { ...state, busy, trade };
}

export function TripPredict({ tripId, match, structure, off }: { tripId: string; match: GolfMatchPreview; structure: CompetitionStructure; off: string[] }) {
  const ready = useMarkets(match, structure);
  const loading = ready === null;
  const markets = useMemo(() => ready ?? [], [ready]);
  const shown = markets.filter((m) => !off.includes(m.bet));
  const pools = useMemo(() => new Map(markets.flatMap(poolsFor).map((p) => [p.key, p])), [markets]);
  const device = useMemo(() => deviceFor(tripId), [tripId]);
  const request = useMemo<WalletRequest>(() => (method, body) => apiRaw<unknown>(`/api/golf-trips/${tripId}/predict-book`, { method, body }), [tripId]);
  const wallet = usePredictWallet(tripId, request, device);
  const book = wallet.book;
  const [tab, setTab] = useState<BetCategory>("Winners");
  const [trade, setTrade] = useState<{ pool: Pool; outcome: number } | null>(null);

  const open = book.positions.map((pos, index) => {
    const pool = pools.get(pos.key);
    return { ...pos, index, pool, value: pool ? pos.shares * pool.chances[pos.outcome] : 0 };
  }).filter((p) => p.pool);
  const invested = open.reduce((a, p) => a + p.value, 0);
  const profit = book.balance + invested - STARTING_COINS;
  const inTab = shown.filter((m) => betDef(m.bet).category === tab && !(m.bet === "teamSpread" && shown.some((x) => x.bet === "teamWinner")));

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.wallet} accessibilityLabel="Wallet">
        <View style={styles.walletTop}>
          <Text style={styles.walletTitle}>Wallet</Text>
          <Text style={styles.walletCoins} accessibilityLabel={`${coins(book.balance)} Maroon Coins`}>{wallet.mode === "loading" ? "…" : `${coins(book.balance)} coins`}</Text>
        </View>
        <Text style={styles.note}>Maroon Coins · play only, no cash value</Text>
        <View style={styles.walletStats}>
          <View><Text style={styles.label}>In play</Text><Text style={styles.value}>{loading ? "…" : coins(invested)}</Text></View>
          <View><Text style={styles.label}>Profit/Loss</Text><Text style={[styles.value, { color: profit >= 0 ? colors.goldBright : colors.errorOnMaroon }]}>{loading ? "…" : `${profit >= 0 ? "+" : ""}${coins(profit)}`}</Text></View>
        </View>
      </View>
      {wallet.error && <Text style={styles.error} accessibilityRole="alert">{wallet.error}</Text>}

      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Bet categories">
        {BET_CATEGORIES.map((c) => <Pressable key={c} accessibilityRole="tab" accessibilityState={{ selected: tab === c }} onPress={() => setTab(c)} style={[styles.tab, tab === c && styles.tabOn]}>
          <Text style={[styles.tabText, tab === c && styles.tabTextOn]}>{c}</Text>
        </Pressable>)}
      </View>

      {inTab.map((m) => <MarketCard key={m.bet} market={m} spread={m.bet === "teamWinner" ? shown.find((x) => x.bet === "teamSpread") : undefined} pools={pools} onPick={(pool, outcome) => setTrade({ pool, outcome })} />)}
      {loading && <Text style={styles.empty} accessibilityRole="text">Working out the odds…</Text>}
      {!loading && !inTab.length && <Text style={styles.empty}>No {tab.toLowerCase()} bets are on for this trip.</Text>}

      {open.length > 0 && <View style={styles.card} accessibilityLabel="My positions">
        <Text style={styles.cardTitle}>My positions</Text>
        {open.map((p) => <View key={p.index} style={styles.position}>
          <View style={{ flex: 1 }}>
            <Text style={styles.outcomeName}>{p.pool!.outcomes[p.outcome]}</Text>
            <Text style={styles.small}>{p.pool!.title} · {p.shares.toFixed(1)} shares · pays {coins(p.shares)} if right</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.value, { fontSize: 15, color: p.value >= p.paid ? colors.goldBright : colors.errorOnMaroon }]}>{coins(p.value)}</Text>
            <Text style={styles.small}>paid {coins(p.paid)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sell ${p.pool!.outcomes[p.outcome]}`} disabled={wallet.busy} style={styles.sell}
            onPress={() => void wallet.trade({ kind: "sell", index: p.index, key: p.key, chance: p.pool!.chances[p.outcome] })}>
            <Text style={styles.sellText}>Sell</Text>
          </Pressable>
        </View>)}
      </View>}

      {trade && <TradeSheet pool={trade.pool} outcome={trade.outcome} balance={book.balance} busy={wallet.busy} error={wallet.error}
        onBuy={async (spend) => { if (await wallet.trade({ kind: "buy", key: trade.pool.key, outcome: trade.outcome, chance: trade.pool.chances[trade.outcome], spend })) setTrade(null); }}
        onClose={() => setTrade(null)} />}
    </View>
  );
}

/** One bet's card (same layout rules as the website: a moneyline's spread sits under it; long player lists show the top 3). */
function MarketCard({ market, spread, pools, onPick }: { market: Market; spread?: Market; pools: Map<string, Pool>; onPick: (pool: Pool, outcome: number) => void }) {
  const def = betDef(market.bet);
  const [side, setSide] = useState<"most" | "least">("most");
  const [stat, setStat] = useState<StatKey>("gir");
  const [ladderIndex, setLadderIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const topThree = (items: ReactNode[]) => items.length <= 3 ? items : <>
    {expanded ? items : items.slice(0, 3)}
    <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)} style={styles.showAll}><Text style={styles.link}>{expanded ? "Show top 3" : `Show all ${items.length}`}</Text></Pressable>
  </>;
  const row = (pool: Pool, outcome: number, label: string, key: string | number) => {
    const price = pool.chances[outcome];
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${label} ${pct(price)}`} onPress={() => onPick(pool, outcome)} style={styles.outcome}>
      <Text style={styles.outcomeName} numberOfLines={1}>{label}</Text>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(price * 100)}%` }]} /></View>
      <Text style={styles.price}>{pct(price)}</Text>
    </Pressable>;
  };
  const pair = (pool: Pool, labels: [string, string]) => <View style={styles.pair}>
    {[0, 1].map((i) => <Pressable key={i} accessibilityRole="button" onPress={() => onPick(pool, i)} style={[styles.pairButton, i === 1 && styles.pairNo]}>
      <Text style={styles.pairLabel} numberOfLines={1}>{labels[i]}</Text><Text style={styles.price}>{pool.chances[i] < 0.01 ? "<1%" : pool.chances[i] > 0.99 ? ">99%" : pct(pool.chances[i])}</Text>
    </Pressable>)}
  </View>;
  const lineRows = (rows: PlayerLine[], keyOf: (r: PlayerLine) => string) => rows.map((r) => {
    const pool = pools.get(keyOf(r))!;
    return <View key={r.id} style={styles.lineRow}>
      <View style={{ flex: 1 }}><Text style={styles.outcomeName} numberOfLines={1}>{r.name}</Text><Text style={styles.small}>{r.count > 0 ? `${r.count} so far · ` : ""}O/U {r.line}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => onPick(pool, 0)} style={styles.chip}><Text style={styles.chipText}>Over {pct(pool.chances[0])}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onPick(pool, 1)} style={[styles.chip, styles.pairNo]}><Text style={styles.chipText}>Under {pct(pool.chances[1])}</Text></Pressable>
    </View>;
  });
  const switcher = <T extends string>(items: [T, string][], value: T, set: (v: T) => void, label: string) => <View style={styles.switch} accessibilityRole="tablist" accessibilityLabel={label}>
    {items.map(([id, text]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: value === id }} onPress={() => set(id)} style={[styles.switchItem, value === id && styles.tabOn]}>
      <Text style={[styles.tabText, value === id && styles.tabTextOn]} numberOfLines={1}>{text}</Text>
    </Pressable>)}
  </View>;

  const spreadMarket = market.kind === "spread" ? market : spread?.kind === "spread" ? spread : null;
  const spreadLines = spreadMarket?.lines ?? [];
  const [spreadIndex, setSpreadIndex] = useState(() => Math.max(0, spreadLines.findIndex((l) => l.spread === spreadMarket?.defaultSpread)));
  const spreadBody = spreadMarket && spreadLines.length > 0 ? (() => {
    const index = Math.min(spreadIndex, spreadLines.length - 1), line = spreadLines[index];
    const pool = pools.get(`${spreadMarket.bet}:${line.spread}`)!;
    return <>
      <Stepper label="Spread" value={pool.outcomes[0]} index={index} count={spreadLines.length} onChange={setSpreadIndex} />
      {pair(pool, [pool.outcomes[0], pool.outcomes[1]])}
    </>;
  })() : null;

  let body: ReactNode;
  if (market.kind === "outcomes") {
    const pool = pools.get(market.bet)!;
    body = <>{spreadBody && <Text style={styles.subhead}>Moneyline</Text>}{topThree(pool.outcomes.map((o, i) => row(pool, i, o, i)))}{spreadBody && <><Text style={styles.subhead}>Spread</Text>{spreadBody}</>}</>;
  } else if (market.kind === "twoSided") {
    const pool = pools.get(`${market.bet}:${side}`)!;
    body = <>{switcher([["most", "Most"], ["least", "Fewest"]], side, setSide, "Most or fewest")}{topThree(pool.outcomes.map((o, i) => row(pool, i, o, `${side}-${i}`)))}</>;
  } else if (market.kind === "ladder" && !market.lines.length) {
    body = <Text style={styles.small}>No open lines: this one is as good as decided.</Text>;
  } else if (market.kind === "ladder") {
    const index = Math.min(ladderIndex ?? market.lines.reduce((best, l, i) => Math.abs(l.chance - 0.5) < Math.abs(market.lines[best].chance - 0.5) ? i : best, 0), market.lines.length - 1);
    const l = market.lines[index], pool = pools.get(`${market.bet}:${l.line}`)!;
    body = <><Stepper label="Line" value={l.label} index={index} count={market.lines.length} onChange={setLadderIndex} />{pair(pool, ["Yes", "No"])}</>;
  } else if (market.kind === "spread") body = spreadBody;
  else if (market.kind === "playerLines") body = <>
    <Text style={styles.small}>{market.round === null ? "Whole trip" : `Round ${market.round + 1}`} · updates hole by hole</Text>
    {topThree(lineRows(market.rows, (r) => `${market.bet}:${market.round}:${r.id}:${r.line}`))}
  </>;
  else if (market.kind === "statLines") body = <>
    {switcher((Object.keys(STAT_LABELS) as StatKey[]).map((s) => [s, STAT_LABELS[s]]), stat, setStat, "Stat")}
    <Text style={styles.small}>{market.round === null ? "Whole trip" : `Round ${market.round + 1}`} · updates hole by hole</Text>
    {topThree(lineRows(market.stats[stat], (r) => `${market.bet}:${stat}:${r.id}:${r.line}`))}
  </>;
  else if (market.kind === "matches") body = <>
    <Text style={styles.small}>Round {market.round + 1} · odds update hole by hole</Text>
    {market.matches.map((m, i) => {
      const pool = pools.get(`${market.bet}:${market.round}:${i}`)!;
      return <View key={i} style={{ gap: 6 }}>
        <View style={styles.matchHead}><Text style={styles.label}>Match {i + 1}</Text><Text style={styles.small}>{m.status}</Text></View>
        <View style={styles.pair}>
          {[m.left, "Halved", m.right].map((label, o) => <Pressable key={o} accessibilityRole="button" onPress={() => onPick(pool, o)} style={[styles.pairButton, o === 1 && styles.pairNo]}>
            <Text style={styles.pairLabel} numberOfLines={2}>{label}</Text><Text style={styles.price}>{pct(pool.chances[o])}</Text>
          </Pressable>)}
        </View>
      </View>;
    })}
  </>;
  else body = pair(pools.get(market.bet)!, ["Yes", "No"]);

  return <View style={styles.card} accessibilityLabel={def.title}>
    <Text style={styles.cardTitle}>{spreadBody && market.kind === "outcomes" ? `${def.title} & spread` : def.title}</Text>
    <Text style={styles.small}>{def.blurb}</Text>
    <View style={{ gap: 8, marginTop: 6 }}>{body}</View>
  </View>;
}

/** < value > to step through a ladder's lines or a spread's alternates (the website's wheel). */
function Stepper({ label, value, index, count, onChange }: { label: string; value: string; index: number; count: number; onChange: (i: number) => void }) {
  return <View style={styles.stepper} accessibilityLabel={`${label} ${value}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${label.toLowerCase()}`} disabled={index <= 0} onPress={() => onChange(index - 1)} style={styles.stepButton}><Text style={[styles.stepArrow, index <= 0 && { opacity: 0.3 }]}>‹</Text></Pressable>
    <Text style={styles.stepText}>{label} <Text style={{ fontFamily: fonts.bold }}>{value}</Text></Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Next ${label.toLowerCase()}`} disabled={index >= count - 1} onPress={() => onChange(index + 1)} style={styles.stepButton}><Text style={[styles.stepArrow, index >= count - 1 && { opacity: 0.3 }]}>›</Text></Pressable>
  </View>;
}

function TradeSheet({ pool, outcome, balance, busy, error, onBuy, onClose }: { pool: Pool; outcome: number; balance: number; busy: boolean; error: string | null; onBuy: (spend: number) => void; onClose: () => void }) {
  const [spend, setSpend] = useState(Math.min(50, Math.floor(balance)));
  const now = pool.chances[outcome];
  const shares = spend / buyPrice(now);
  const step = (by: number) => setSpend((s) => Math.max(0, Math.min(Math.floor(balance), s + by)));
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.sheetTop}><Text style={styles.small}>{pool.title}</Text><SheetClose onPress={onClose} /></View>
        <Text style={styles.sheetTitle}>{pool.outcomes[outcome]} <Text style={{ color: colors.goldBright }}>{pct(now)}</Text></Text>
        <Text style={styles.small}>Odds from the model and the live scores. Buying locks in {pct(buyPrice(now))}; your bet doesn't move the price.</Text>
        <View style={styles.chips}>
          {[10, 25, 50, 100, 250].map((n) => <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: spend === n, disabled: n > balance }} disabled={n > balance} onPress={() => setSpend(n)}
            style={[styles.chip, spend === n && styles.tabOn, n > balance && { opacity: 0.35 }]}><Text style={[styles.chipText, spend === n && styles.tabTextOn]}>{n}</Text></Pressable>)}
        </View>
        <View style={styles.stepper} accessibilityLabel={`Spend ${coins(spend)} of ${coins(balance)}`}>
          <Pressable accessibilityRole="button" accessibilityLabel="5 fewer coins" onPress={() => step(-5)} style={styles.stepButton}><Text style={styles.stepArrow}>−</Text></Pressable>
          <Text style={styles.stepText}>Spend <Text style={{ fontFamily: fonts.bold }}>{coins(spend)}</Text> of {coins(balance)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="5 more coins" onPress={() => step(5)} style={styles.stepButton}><Text style={styles.stepArrow}>+</Text></Pressable>
        </View>
        <View style={styles.walletStats}>
          <View><Text style={styles.label}>Shares</Text><Text style={styles.value}>{shares.toFixed(1)}</Text></View>
          <View><Text style={styles.label}>Pays if right</Text><Text style={[styles.value, { color: colors.goldBright }]}>{coins(shares)}</Text></View>
          <View><Text style={styles.label}>Profit if right</Text><Text style={[styles.value, { color: colors.goldBright }]}>+{coins(shares - spend)}</Text></View>
        </View>
        {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy || spend <= 0 || spend > balance} onPress={() => onBuy(spend)} style={[styles.buy, (busy || spend <= 0 || spend > balance) && { opacity: 0.4 }]}>
          <Text style={styles.buyText}>{busy ? "Saving…" : `Buy for ${coins(spend)} coins`}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  wallet: { marginHorizontal: gutter, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorder, backgroundColor: colors.boardTop, gap: 6 },
  walletTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  walletTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  walletCoins: { fontFamily: fonts.bold, fontSize: 18, color: colors.goldBright },
  walletStats: { flexDirection: "row", gap: 28, marginTop: 4 },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  value: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.boardInk },
  error: { marginHorizontal: gutter, fontFamily: fonts.semibold, fontSize: 13, color: colors.errorOnMaroon },
  empty: { marginHorizontal: gutter, fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk, textAlign: "center", paddingVertical: 12 },
  tabs: { flexDirection: "row", marginHorizontal: gutter, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, padding: 3 },
  tab: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  tabOn: { backgroundColor: colors.goldBright },
  tabText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk },
  tabTextOn: { color: colors.maroon900 },
  card: { marginHorizontal: gutter, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom, gap: 4 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.boardInk },
  subhead: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase", marginTop: 4 },
  outcome: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: minTap },
  outcomeName: { flexShrink: 1, width: 120, fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  barFill: { height: 6, backgroundColor: colors.goldBright },
  price: { minWidth: 44, textAlign: "right", fontFamily: fonts.bold, fontSize: 15, color: colors.cream, fontVariant: ["tabular-nums"] },
  pair: { flexDirection: "row", gap: 8 },
  pairButton: { flex: 1, minHeight: minTap, padding: 10, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", gap: 2 },
  pairNo: { borderColor: colors.boardBorderSoft },
  pairLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk, textAlign: "center" },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: minTap },
  chip: { minHeight: 36, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  switch: { flexDirection: "row", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, padding: 3 },
  switchItem: { flex: 1, minHeight: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, paddingHorizontal: 4 },
  showAll: { minHeight: 36, justifyContent: "center" },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardLink },
  matchHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  position: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  sell: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, justifyContent: "center" },
  sellText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepButton: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  stepArrow: { fontFamily: fonts.bold, fontSize: 26, color: colors.goldBright },
  stepText: { fontFamily: fonts.regular, fontSize: 14, color: colors.cream },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { padding: gutter, gap: 12, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  buy: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  buyText: { fontFamily: fonts.bold, fontSize: 16, color: colors.maroon900 },
});
