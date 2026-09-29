import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { maroonCategories } from "@/lib/data/theMaroon";
import { MaroonSection } from "@/components/maroon/MaroonSection";

export default function MaroonHome() {
  return <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-8">
    <Link href="/the-maroon/courses" className="group relative flex min-h-[320px] items-end overflow-hidden rounded-lg border border-gold-400 bg-maroon-900 p-6 text-white sm:min-h-[480px] sm:p-10">
      <Image src="/schedule/mission-hills.webp" alt="Palm trees and fairways at Mission Hills" fill priority sizes="(max-width: 1440px) 100vw, 1440px" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="relative max-w-2xl"><p className="mb-3 font-condensed text-xs font-bold uppercase tracking-[0.2em] text-gold-300">Courses · The Maroon</p><h1 className="text-4xl font-bold leading-tight text-white sm:text-6xl">Beyond the scorecard.</h1><p className="mt-4 max-w-lg text-sm leading-relaxed text-white/85 sm:text-base">The courses, the gear, the lessons, and the stories that bring us back to golf.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">Explore Courses <ArrowUpRight size={18} /></span></div>
    </Link>
    <section aria-label="Explore The Maroon" className="my-6 grid grid-cols-2 gap-3 sm:my-10 lg:grid-cols-4">
      {maroonCategories.map((category, index) => <Link key={category.slug} href={`/the-maroon/${category.slug}`} className="group rounded-lg border border-gold-300 bg-white p-4 transition-colors hover:bg-cream-100 sm:p-5"><div className="flex justify-between text-maroon-700"><span className="font-condensed text-xs text-ink-400">0{index + 1}</span><ArrowUpRight size={17} /></div><h2 className="mt-4 text-xl font-bold sm:text-2xl">{category.label}</h2><p className="mt-2 text-xs leading-relaxed text-ink-500 sm:text-sm">{category.headline}</p></Link>)}
    </section>
    <div className="space-y-8 pb-8 sm:space-y-12">{maroonCategories.map((category) => <MaroonSection key={category.slug} category={category} />)}</div>
  </div>;
}
