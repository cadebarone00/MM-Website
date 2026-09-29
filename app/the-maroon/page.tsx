import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { maroonCategories } from "@/lib/data/theMaroon";
import { MaroonSection } from "@/components/maroon/MaroonSection";

export default function MaroonHome() {
  return <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-8">
    <header className="pt-2"><p className="font-condensed text-xs uppercase tracking-widest text-maroon-700">The Maroon Journal</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Beyond the scorecard.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500">The courses, the gear, the lessons, and the stories that bring us back to golf.</p></header>
    <section aria-label="Explore The Maroon" className="my-6 grid grid-cols-2 gap-3 sm:my-10 lg:grid-cols-4">
      {maroonCategories.map((category, index) => <Link key={category.slug} href={`/the-maroon/${category.slug}`} className="group rounded-lg border border-gold-300 bg-white p-4 transition-colors hover:bg-cream-100 sm:p-5"><div className="flex justify-between text-maroon-700"><span className="font-condensed text-xs text-ink-400">0{index + 1}</span><ArrowUpRight size={17} /></div><h2 className="mt-4 text-xl font-bold sm:text-2xl">{category.label}</h2><p className="mt-2 text-xs leading-relaxed text-ink-500 sm:text-sm">{category.headline}</p></Link>)}
    </section>
    <div className="space-y-8 pb-8 sm:space-y-12">{maroonCategories.map((category) => <MaroonSection key={category.slug} category={category} />)}</div>
  </div>;
}
