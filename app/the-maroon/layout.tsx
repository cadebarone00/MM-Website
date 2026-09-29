import Link from "next/link";
import type { Metadata } from "next";
import { MaroonNavigation } from "@/components/maroon/MaroonNavigation";

export const metadata: Metadata = { title: "The Maroon | The Maroon Masters", description: "Courses, equipment, teaching, and news from The Maroon Masters." };

export default function MaroonLayout({ children }: { children: React.ReactNode }) {
  return <main className="bg-cream-50">
    <header className="px-4 py-6 text-center sm:py-9"><p className="mb-2 font-condensed text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-500">The Maroon Masters Journal</p><Link href="/the-maroon" className="font-title text-4xl font-bold text-maroon-700 sm:text-6xl">The Maroon</Link><p className="mt-2 text-xs text-ink-500 sm:text-sm">For the love of the game.</p></header>
    <MaroonNavigation />
    {children}
  </main>;
}
