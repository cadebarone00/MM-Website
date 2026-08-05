"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { wagersNavBarContent } from "@/lib/wagers/navBarContent";
import { openMoreMenu } from "@/components/nav/MorePanel";
import { MMToggle } from "./MMToggle";

/**
 * The nav bar shown on every /wagers/* screen — back link/button, screen
 * title, an optional My Portfolio link, and the persistent MM Coins /
 * Real Wagers toggle. Content is derived from the current pathname, so
 * app/wagers/layout.tsx can render one instance for the whole section.
 */
export function WagersNavBar() {
  const pathname = usePathname();
  const { backLabel, backHref, title, showPortfolioLink } = wagersNavBarContent(pathname);

  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 bg-white px-4 py-3 sm:px-7">
      <div className="grid grid-cols-3 items-center">
        <div className="justify-self-start">
          {backHref ? (
            <Link href={backHref} className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-maroon-700">
              <ChevronLeft size={18} />
              {backLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={openMoreMenu}
              className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-maroon-700"
            >
              <ChevronLeft size={18} />
              {backLabel}
            </button>
          )}
        </div>
        <h1 className="m-0 justify-self-center font-serif text-lg font-bold text-ink-900">{title}</h1>
        <div className="justify-self-end">
          {showPortfolioLink && (
            <Link href="/wagers/portfolio" className="font-sans text-sm font-semibold text-maroon-700">
              My Portfolio
            </Link>
          )}
        </div>
      </div>
      <div className="flex justify-center">
        <MMToggle />
      </div>
    </div>
  );
}
