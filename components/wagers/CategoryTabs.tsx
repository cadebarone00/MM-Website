import Link from "next/link";

const CATEGORIES = [
  { href: "/wagers/team-futures", label: "Team Futures" },
  { href: "/wagers/player-futures", label: "Player Futures" },
  { href: "/wagers/matches", label: "Matches" },
  { href: "/wagers/fourballs", label: "Fourballs" },
  { href: "/wagers/props", label: "Props" },
];

/**
 * The Wagers hub's 5-way category row — Team Futures, Player Futures,
 * Matches, Fourballs, Props. Tapping one navigates straight to that
 * category's own page; the hub itself renders no wager content.
 */
export function CategoryTabs() {
  return (
    <nav className="grid grid-cols-5 gap-1 px-2 pt-4 sm:px-7">
      {CATEGORIES.map((category) => (
        <Link
          key={category.href}
          href={category.href}
          className="flex flex-col items-center gap-1 rounded-md border border-ink-100 bg-white px-1 py-3 text-center font-condensed text-3xs font-bold uppercase tracking-wide text-maroon-700 hover:bg-maroon-50"
        >
          {category.label}
        </Link>
      ))}
    </nav>
  );
}
