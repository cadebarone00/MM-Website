/** Shown when nothing is live — venue/date info, same "holding pattern" a real broadcast uses before/between rounds. See the spec's §17. */
export function HoldingScene({ venue, dateLabel }: { venue: string; dateLabel: string }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[color:var(--color-maroon-900)] px-6 text-center text-[color:var(--color-maroon-50)]">
      <p className="font-condensed text-sm uppercase tracking-[0.3em] text-[color:var(--color-maroon-300)]">The Maroon Masters</p>
      <h1 className="mt-4 font-serif text-5xl font-semibold sm:text-6xl">{venue}</h1>
      <p className="mt-4 font-sans text-xl text-[color:var(--color-maroon-200)]">{dateLabel}</p>
    </div>
  );
}
