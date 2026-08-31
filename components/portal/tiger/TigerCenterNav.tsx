// components/portal/tiger/TigerCenterNav.tsx
import Link from "next/link";

const BOXES = [
  { label: "Players & Teams", href: "/portal/admin/players-teams", enabled: true },
  { label: "Courses & Format", href: "/portal/admin/courses-format", enabled: true },
  { label: "Matchups", href: "/portal/admin/matchups", enabled: true },
  { label: "Scorecards & Video", href: "/portal/admin/scorecards", enabled: true },
  { label: "Edit Scores", href: "#", enabled: false },
];

export function TigerCenterNav() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {BOXES.map((box) =>
        box.enabled ? (
          <Link
            key={box.label}
            href={box.href}
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
          >
            {box.label}
          </Link>
        ) : (
          <div
            key={box.label}
            className="rounded-lg border-2 border-stone-300 px-6 py-8 text-center font-serif text-xl font-bold text-stone-400"
          >
            {box.label}
            <div className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-stone-400">Coming soon</div>
          </div>
        )
      )}
    </div>
  );
}
