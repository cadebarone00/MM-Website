import Image from "next/image";
import Link from "next/link";
import type { HandicapSummary } from "@/lib/handicap/types";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function HandicapHome({ playerName, summary }: { playerName: string; summary: HandicapSummary }) {
  return (
    <main className="w-full pb-10">
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <Link href="/portal" className="hidden lg:inline-block font-condensed text-xs font-bold uppercase tracking-wide text-ink-500 hover:text-maroon-700">
          ← Back to Portal
        </Link>
        <h1 className="mt-3 font-serif text-3xl font-bold text-ink-900">My Handicap</h1>
      </div>
      <section className="relative isolate overflow-hidden bg-maroon-950">
        <div className="relative aspect-[16/7] min-h-52 sm:min-h-64">
          <Image src="/loading/desktop.png" alt="Maroon Masters course view" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-950/90 via-maroon-950/40 to-transparent" />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-6">
          <div>
            <p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-white/75">{playerName}</p>
            <p className="mt-1 font-serif text-4xl font-bold leading-none">{summary.index != null ? summary.index.toFixed(1) : "—"}</p>
            <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Handicap Index</p>
          </div>
          <div className="text-right">
            <p className="font-serif text-xl font-bold leading-none">{summary.lowIndex != null ? summary.lowIndex.toFixed(1) : "—"}</p>
            <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Low Index</p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-4xl px-4 sm:px-6">
        <Link
          href="/portal/handicap/new"
          className="block w-full rounded-pill bg-maroon-700 px-4 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-maroon-800"
        >
          Submit a score
        </Link>
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
        <h2 className="font-serif text-xl font-bold text-ink-900">Scores</h2>
        {summary.rounds.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-ink-500">No rounds yet — submit your first score above.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {summary.rounds.map((round) => (
              <article key={round.id} className="rounded-lg border border-stone-300 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-base font-bold text-ink-900">{round.courseName}</h3>
                    <p className="mt-0.5 font-sans text-xs text-ink-500">{round.teeSetName} · Rating {round.rating} · Slope {round.slope}</p>
                  </div>
                  <p className="font-sans text-xs text-ink-500">{formatDate(round.datePlayed)}</p>
                </div>
                <div className="mt-2 flex items-baseline gap-4">
                  <span className="font-serif text-2xl font-bold text-ink-900">{round.totalScore}</span>
                  <span className="font-sans text-sm text-ink-600">Differential {round.differential.toFixed(1)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
