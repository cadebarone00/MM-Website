"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountBadge } from "@/components/AccountBadge";

// The "home" page of each Portal-chrome area — Player Portal, Scoring, and
// the Tiger Center. Mirrors HOME_PAGES in components/Header.tsx: exact
// match only, so a sub-page like /portal/admin/matchups still gets a back
// arrow and only the bare hub itself is exempt.
const HOME_PAGES = new Set(["/portal", "/portal/scoring", "/portal/admin"]);

function isHomePage(pathname: string): boolean {
  return HOME_PAGES.has(pathname);
}

/**
 * The Portal/Scoring header — deliberately much simpler than the public
 * site's `Header`: no nav links, no live ticker, no bottom tab bar (that's
 * all a Website feature). Just the wordmark (or, on mobile, a back arrow
 * once you're off the area's home page), a big centered area title, and
 * the account icon (`AccountBadge` already covers "icon + Sign Out" with
 * no Website-specific links, so it's reused as-is). Solid maroon, same on
 * mobile and desktop.
 *
 * Renders as a real `<header>` so `PlayerAreaNav`'s `useHeaderOffset()`
 * keeps measuring it correctly regardless of which header is on screen.
 */
export function PortalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const title = pathname.startsWith("/portal/scoring") ? "Official Scoring" : "The Player Portal";
  const showBack = !isHomePage(pathname);

  return (
    <header className="sticky top-0 z-[100] shadow-lg bg-maroon-900">
      <div className="grid grid-cols-3 items-center gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:px-7 lg:py-4">
        <div className="justify-self-start shrink-0">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              title="Back"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-cream-50 lg:hidden"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <Link href="/portal" className={showBack ? "hidden lg:block" : "block"}>
            <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-5 w-auto lg:h-7" priority />
          </Link>
        </div>
        <span className="justify-self-center text-center font-serif text-base font-bold uppercase tracking-wide text-cream-50 sm:text-lg lg:text-2xl">
          {title}
        </span>
        <div className="justify-self-end">
          <AccountBadge position="header" />
        </div>
      </div>
    </header>
  );
}
