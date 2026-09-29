import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function MaroonHeader() {
  return <header className="sticky top-0 z-[300] border-b border-white/15 bg-[#141414] text-white">
    <nav aria-label="The Maroon main navigation" className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:min-h-20 sm:px-7">
      <Link href="/the-maroon" aria-label="The Maroon home" className="shrink-0 font-title text-2xl font-bold tracking-tight sm:text-4xl">The Maroon</Link>
      <span className="hidden font-condensed text-xs uppercase tracking-[0.25em] text-white/60 lg:block">Courses. Equipment. Teaching. News.</span>
      <Link href="/" className="flex items-center gap-2 border-l border-white/25 pl-4 text-right font-condensed text-[10px] font-semibold uppercase tracking-wider text-white/85 hover:text-white sm:pl-6 sm:text-xs"><span><span className="block text-[9px] font-normal text-white/50 sm:text-[10px]">Tournament site</span>The Maroon Masters</span><ArrowUpRight size={15} aria-hidden /></Link>
    </nav>
  </header>;
}
