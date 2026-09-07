import Image from "next/image";
import type { BroadcastMatchBox, BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

function matchStatus(box: BroadcastMatchBox) {
  const final = box.state === "Final";
  if (box.leader === "tie") return { eyebrow: final ? "Final" : box.thru || "Thru", label: "AS", team: "tie" as const };
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
    <div className="grid grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] items-center gap-4 border-b border-white/[0.12] py-5">
      <div className="min-w-0 text-left font-sans text-xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]"><PairingNames names={box.maroonNames} /></div>
      <div className="text-center">
        <p className="font-condensed text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-ink-300)]">{status.eyebrow}</p>
        {status.team === "tie" ? (
          <p className="mt-1 font-condensed text-2xl font-black uppercase tracking-wide text-[color:var(--color-gold-300)]">AS</p>
        ) : (
          <div className={[
            "relative mt-1 flex h-10 items-center justify-center rounded-sm px-3 font-condensed text-base font-black uppercase tracking-wide",
            status.team === "maroon" ? "bg-maroon-700 text-white" : "bg-white text-maroon-800",
          ].join(" ")}>
            {status.team === "white" && <span className="absolute left-3 tabular-nums">{status.score}</span>}
            <span>{status.teamLabel}</span>
            {status.team === "maroon" && <span className="absolute right-3 tabular-nums">{status.score}</span>}
          </div>
        )}
      </div>
      <div className="min-w-0 text-right font-sans text-xl font-bold uppercase tracking-wide text-white"><PairingNames names={box.whiteNames} /></div>
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
