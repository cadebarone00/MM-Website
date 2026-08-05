"use client";

import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { useWagersMode } from "./WagersModeContext";

/**
 * The layout every Wagers category page shares: a rules blurb, a search
 * box that filters the boxes below by name, and whatever the caller
 * renders for the current search text. When Real Wagers is selected, shows
 * a "Coming soon" placeholder instead — that system isn't built yet, see
 * docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md.
 * Each category page owns its own data/filtering; this only owns the
 * search input's state and the mode gate.
 */
export function CategoryPageShell({
  rulesText,
  searchPlaceholder,
  children,
}: {
  rulesText: string;
  searchPlaceholder: string;
  children: (search: string) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const { mode } = useWagersMode();

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 sm:px-7">
      <p className="m-0 font-sans text-sm text-ink-500">{rulesText}</p>
      {mode === "real" ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-cream-50 p-6 text-center">
          <p className="m-0 font-sans text-sm font-semibold text-ink-500">Real Wagers is coming soon.</p>
          <p className="mt-1 font-sans text-2xs text-ink-400">Switch back to MM Coins to see today&rsquo;s markets.</p>
        </div>
      ) : (
        <>
          <Input
            iconLeft={<Search size={16} />}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-col gap-4">{children(search)}</div>
        </>
      )}
    </div>
  );
}
