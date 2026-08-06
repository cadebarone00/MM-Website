/**
 * Shown wherever a Wagers screen would normally show real markets, but
 * Real Wagers is selected — that system is being built separately, see
 * docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md.
 */
export function ComingSoonNotice() {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-cream-50 p-6 text-center">
      <p className="m-0 font-sans text-sm font-semibold text-ink-500">Real Wagers is coming soon.</p>
      <p className="mt-1 font-sans text-2xs text-ink-400">Switch back to MM Coins to see today&rsquo;s markets.</p>
    </div>
  );
}
