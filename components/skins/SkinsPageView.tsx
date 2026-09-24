import Link from "next/link";
import { SkinsLeaderboard, type SkinsLeaderboardPlayer } from "./SkinsLeaderboard";
import { formatSkinsMoney, SKINS_2026_ENTRY_CENTS, SKINS_2026_ROUND_POT_CENTS, type calculateRoundPayouts } from "@/lib/skins/payout";

type Props = {
  tab: "skins" | "payout";
  year: number;
  totalSkins: number | null;
  players: SkinsLeaderboardPlayer[];
  sessions: { day: number; session: string }[];
  eligibleRounds: number[];
  payouts: ReturnType<typeof calculateRoundPayouts> | null;
};

export function SkinsPageView({ tab, year, totalSkins, players, sessions, eligibleRounds, payouts }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl bg-white pb-8 sm:my-6 sm:rounded-md sm:border sm:border-ink-100">
      <div className="mx-2 mt-1 flex min-h-24 flex-col items-center justify-center rounded-md border-2 border-gold-500 bg-maroon-700 px-4 text-center text-white">
        <p className="font-condensed text-xs font-bold tracking-widest">{year}</p>
        <h1 className="m-0 font-serif text-lg font-bold uppercase tracking-wide">Maroon Masters Skins</h1>
      </div>
      <nav aria-label="Skins navigation" className="flex justify-center border-b border-ink-200">
        {(["skins", "payout"] as const).map((item) => <Link key={item} href={item === "skins" ? "/portal/skins" : "/portal/skins?tab=payout"} aria-current={tab === item ? "page" : undefined} className={`relative px-8 py-3 font-condensed text-sm font-bold uppercase tracking-wide ${tab === item ? "text-maroon-700" : "text-ink-400 hover:text-ink-700"}`}>
          {item === "skins" ? "Skins" : "Payout"}{tab === item && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-700" />}
        </Link>)}
      </nav>
      <div className="px-2 py-4 sm:px-4">
        {tab === "payout" ? <section className="space-y-4 px-3 font-sans text-sm text-ink-700">
          <h2 className="font-serif text-xl font-bold text-ink-900">{year} payout</h2>
          <p>Each player enters for {formatSkinsMoney(SKINS_2026_ENTRY_CENTS)}. Every individual-ball round (Fourball or Singles) has a separate {formatSkinsMoney(SKINS_2026_ROUND_POT_CENTS)} pot, split equally across the skins won in that round.</p>
          <dl className="space-y-3">
            <div className="flex justify-between gap-4"><dt>Entry per player</dt><dd className="font-bold tabular-nums">{formatSkinsMoney(SKINS_2026_ENTRY_CENTS)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Pot per round</dt><dd className="font-bold tabular-nums">{formatSkinsMoney(SKINS_2026_ROUND_POT_CENTS)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Total round pots</dt><dd className="font-bold tabular-nums">{formatSkinsMoney(eligibleRounds.length * SKINS_2026_ROUND_POT_CENTS)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Total skins</dt><dd className="font-bold tabular-nums">{totalSkins ?? "—"}</dd></div>
          </dl>
          {payouts ? <div className="overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm">
            <caption className="sr-only">Payout by round</caption>
            <thead><tr className="border-b border-ink-200">{["Day", "Session", "Skins", "Pot", "Per skin"].map((label) => <th scope="col" key={label} className="px-2 py-3">{label}</th>)}</tr></thead>
            <tbody>{payouts.rounds.map((round) => <tr key={round.round} className="border-b border-ink-100">
              <td className="px-2 py-3">{sessions[round.round - 1]?.day ?? "—"}</td>
              <td className="px-2 py-3">{round.round} · {sessions[round.round - 1]?.session}</td>
              <td className="px-2 py-3 tabular-nums">{round.skins}</td>
              <td className="px-2 py-3 tabular-nums">{formatSkinsMoney(round.potCents)}</td>
              <td className="px-2 py-3 tabular-nums">{round.perSkinCents == null ? "Unawarded" : formatSkinsMoney(round.perSkinCents)}</td>
            </tr>)}</tbody>
          </table></div> : <p role="status">Round payouts are unavailable right now. Please try again shortly.</p>}
          <p>$ Earned adds up each player’s round winnings before their entry fee. Earnings are rounded to cents; remaining cents go to the largest fractional shares. Per-skin amounts are shown rounded.</p>
          <p>Each sole lowest gross score earns one skin. Tied holes earn no skin, with no carryover.</p>
          <p>A round with no skins leaves its pot unawarded.</p>
        </section> : totalSkins != null ? <SkinsLeaderboard players={players} payouts={payouts?.earnings ?? null} /> : <p role="status" className="px-3 font-sans text-sm text-ink-500">Skins are unavailable right now. Please try again shortly.</p>}
      </div>
    </main>
  );
}
