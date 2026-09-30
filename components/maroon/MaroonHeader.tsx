import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function MaroonHeader() {
  return <header className="sticky top-0 z-[300] border-b border-white/15 bg-maroon-900 text-white">
    <nav aria-label="Main Page navigation" className="flex min-h-16 w-full items-center flex-wrap justify-between gap-x-4 gap-y-3 px-4 py-3 sm:min-h-20 sm:px-7">
      <div className="flex items-center gap-4 sm:gap-7"><Link href="/" aria-label="Main Page" className="shrink-0 font-title text-xl font-bold tracking-tight sm:text-3xl">The Maroon</Link>
        <Link href="/contact" className="font-condensed text-[10px] font-semibold uppercase tracking-wider text-white/85 hover:text-white sm:text-xs">Contact Us</Link>
      </div>
      <div className="ml-auto flex items-center gap-4 sm:gap-6">
        <Link href="/login" className="font-condensed text-[10px] font-semibold uppercase tracking-wider text-white/85 hover:text-white sm:text-xs">Sign In</Link>
      <Link href="/website" className="flex items-center gap-2 border-l border-white/25 pl-4 text-right font-condensed text-[10px] font-semibold uppercase tracking-wider text-white/85 hover:text-white sm:pl-6 sm:text-xs"><span><span className="block text-[9px] font-normal text-white/50 sm:text-[10px]">Our tournament site</span>The Maroon Tournament</span><ArrowUpRight size={15} aria-hidden /></Link>
    </div>
    </nav>
  </header>;
}
