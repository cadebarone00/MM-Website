import Image from "next/image";
import type { BroadcastMatchBox, BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

function matchStatus(box: BroadcastMatchBox) {
  const final = box.state === "Final";
  if (box.leader === "tie") return { eyebrow: final ? "Final" : box.thru || "Thru", score: null, team: "tie" as const, teamLabel: "AS" };
  const team = box.leader === "maroon" ? "Maroon" : "White";
  // A match that reaches 18 can legitimately finish 1 UP or 2 UP. A
  // closed-out match instead uses its conventional score, such as 4 & 2.
  const score = final && box.holesRemaining > 0 ? `${box.margin} & ${box.holesRemaining}` : `${box.margin} UP`;
  return { eyebrow: final ? "Final" : box.thru || "Thru", score, team: box.leader, teamLabel: team };
}

function PairingNames({ names }: { names: string[] }) {
  return <span className="block truncate">{names.join(" & ")}</span>;
}

function MatchRow({ box }: { box: BroadcastMatchBox }) {
  const status = matchStatus(box);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] items-center gap-4 border-b border-white/[0.12] py-5">
      <div className="relative flex min-w-0 items-center gap-3 overflow-hidden rounded-md border border-[color:var(--color-gold-400)]/45 bg-[linear-gradient(112deg,#4c0711_0%,#7b1020_48%,#38040b_100%)] px-5 py-4 text-left font-sans text-xl font-bold uppercase tracking-wide text-white shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[color:var(--color-gold-400)]" />
        <div className="pointer-events-none absolute -right-10 top-0 h-full w-24 -skew-x-[22deg] bg-white/[0.06]" />
        <div className="relative min-w-0 flex-1"><PairingNames names={box.maroonNames} /></div>
        {status.team === "maroon" && <span className="relative shrink-0 rounded border border-white/25 bg-black/20 px-2 py-1 font-condensed text-lg font-black tabular-nums shadow-inner">{status.score}</span>}
      </div>
      <div className="relative text-center before:absolute before:inset-x-3 before:top-1/2 before:-z-10 before:h-px before:bg-[color:var(--color-gold-400)]/35">
        <p className="font-condensed text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-ink-300)]">{status.eyebrow}</p>
        <p className={["relative mt-1 inline-block rounded-sm border px-3 py-1 font-condensed text-xl font-black uppercase tracking-wide shadow-[0_5px_14px_rgba(0,0,0,0.2)]", status.team === "maroon" ? "border-[color:var(--color-gold-400)]/50 bg-maroon-800 text-[color:var(--color-cream-50)]" : status.team === "white" ? "border-white/50 bg-white text-maroon-800" : "border-[color:var(--color-gold-400)]/70 bg-maroon-950/75 text-[color:var(--color-gold-300)]"].join(" ")}>{status.teamLabel}</p>
      </div>
      <div className="relative flex min-w-0 items-center gap-3 overflow-hidden rounded-md border border-white/65 bg-[linear-gradient(112deg,#fffdf8_0%,#f2ede4_56%,#d8d0c4_100%)] px-5 py-4 text-right font-sans text-xl font-bold uppercase tracking-wide text-maroon-800 shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
        <div className="pointer-events-none absolute -left-10 top-0 h-full w-24 -skew-x-[22deg] bg-[rgba(61,7,16,0.06)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-[color:var(--color-gold-400)]" />
        {status.team === "white" && <span className="relative shrink-0 rounded border border-maroon-800/25 bg-white/70 px-2 py-1 font-condensed text-lg font-black tabular-nums shadow-inner">{status.score}</span>}
        <div className="relative min-w-0 flex-1"><PairingNames names={box.whiteNames} /></div>
      </div>
    </div>
  );
}

/** Maroon is always left, White right; each row is a live or finished match. */
export function MatchPlayScene({ matchPlay }: { matchPlay: BroadcastMatchPlay }) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10">
      <Image src="/loading/desktop.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-maroon-900/80" />
      <Image src="/broadcast/oak-motif.png" alt="" width={980} height={980} aria-hidden className="pointer-events-none absolute -bottom-60 -right-44 opacity-[0.27]" />
      <div className="relative z-[1] w-full max-w-[980px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">Match Play{matchPlay.roundLabel ? ` · ${matchPlay.roundLabel}` : ""}</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">{matchPlay.final ? "Final" : "Live"}</span>
        </div>
        {matchPlay.matchBoxes.length === 0 ? <p className="px-2 py-16 text-center font-sans text-lg text-[color:var(--color-ink-300)]">No live or completed round is available yet.</p> : <div>{matchPlay.matchBoxes.map((box) => <MatchRow key={box.boxNumber} box={box} />)}</div>}
      </div>
    </div>
  );
}
