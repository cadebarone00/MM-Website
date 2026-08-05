/**
 * The Wagers nav bar's back label/link, screen title, and whether to show
 * the My Portfolio link — derived purely from the current /wagers/*
 * pathname so app/wagers/layout.tsx can render one nav bar for every route
 * in the section without each page configuring it individually.
 */
export interface WagersNavBarContent {
  backLabel: string;
  /** null means "open the More menu" instead of navigating anywhere. */
  backHref: string | null;
  title: string;
  showPortfolioLink: boolean;
}

const CATEGORY_TITLES: Record<string, string> = {
  "team-futures": "Team Futures",
  "player-futures": "Player Futures",
  matches: "Matches",
  fourballs: "Fourballs",
  props: "Props",
};

export function wagersNavBarContent(pathname: string): WagersNavBarContent {
  if (pathname === "/wagers") {
    return { backLabel: "More", backHref: null, title: "Wagers", showPortfolioLink: true };
  }
  if (pathname === "/wagers/portfolio") {
    return { backLabel: "Wagers", backHref: "/wagers", title: "My Portfolio", showPortfolioLink: false };
  }
  const segment = pathname.replace(/^\/wagers\//, "");
  return {
    backLabel: "Wagers",
    backHref: "/wagers",
    title: CATEGORY_TITLES[segment] ?? "Wagers",
    showPortfolioLink: true,
  };
}
