/**
 * Shown when nothing is live — venue/date info, same "holding pattern" a
 * real broadcast uses before/between rounds. Full-bleed vignette +
 * watermark, matching every other broadcast scene. See the Round 1
 * redesign spec and the master spec's §17.
 */
export function HoldingScene({ venue, dateLabel }: { venue: string; dateLabel: string }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6 text-center text-[color:var(--color-maroon-50)] [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>
      <p className="relative z-[1] font-condensed text-sm uppercase tracking-[0.3em] text-[color:var(--color-gold-300)]">The Maroon Masters</p>
      <h1 className="relative z-[1] mt-4 font-serif text-5xl font-semibold sm:text-6xl">{venue}</h1>
      <p className="relative z-[1] mt-4 font-sans text-xl text-[color:var(--color-maroon-200)]">{dateLabel}</p>
    </div>
  );
}
