import Image from "next/image";
import type { Metadata } from "next";
import { MaroonNavigation } from "@/components/maroon/MaroonNavigation";

export const metadata: Metadata = { title: "The Maroon Journal | The Maroon Masters", description: "Courses, equipment, teaching, and news from The Maroon Masters." };

export default function MaroonLayout({ children }: { children: React.ReactNode }) {
  return <main className="bg-cream-50 font-title">
    <section aria-label="The Maroon journal" className="relative flex min-h-[240px] flex-col justify-between overflow-hidden bg-ink-900 px-3 pb-4 pt-10 text-center text-white sm:min-h-[320px] sm:px-7 sm:pb-6 sm:pt-14">
      <Image src="/schedule/mission-hills.webp" alt="Palm trees and fairways at Mission Hills" fill priority sizes="100vw" className="object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-black/75" />
      <div className="relative"><p className="font-condensed text-[10px] uppercase tracking-[0.25em] text-white/80 sm:text-xs">The golf journal</p><p className="mt-3 font-title text-3xl font-bold sm:text-5xl">For the love of the game.</p></div>
      <MaroonNavigation />
    </section>
    {children}
  </main>;
}
