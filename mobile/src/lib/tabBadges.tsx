import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Red badge counts on the tab bar. Play's = waiting round invites (filled in by Play home, Step 1a). 0 = no badge. */
type TabBadges = { play: number; setPlay: (count: number) => void };
const TabBadgesContext = createContext<TabBadges>({ play: 0, setPlay: () => {} });

export function TabBadgesProvider({ children }: { children: ReactNode }) {
  const [play, setPlay] = useState(0);
  const value = useMemo(() => ({ play, setPlay }), [play]);
  return <TabBadgesContext.Provider value={value}>{children}</TabBadgesContext.Provider>;
}

export const useTabBadges = () => useContext(TabBadgesContext);

/** What the badge shows: nothing at 0, the number up to 9, then "9+". */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}
