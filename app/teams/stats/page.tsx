import Link from "next/link";

export default function StatsHubPage() {
  return (
    <div className="mx-auto max-w-[800px] px-7 py-16 text-center">
      <Link
        href="/teams"
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        ← Back to Teams
      </Link>

      <h1 className="mt-6 font-sans text-4xl font-black text-ink-900">Statistics Hub</h1>
      <p className="mt-4 font-sans text-base leading-relaxed text-ink-500">
        This page will house career stats, player-vs-player comparisons, course-by-course breakdowns, and automated
        graphs once the full dataset is in place. Some player and course stats are still missing from the source
        sheets — once those are filled in, this becomes the home for everything tracked across every Maroon Masters.
      </p>
    </div>
  );
}
