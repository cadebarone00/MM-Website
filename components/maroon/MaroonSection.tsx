import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { MaroonCategory } from "@/lib/data/theMaroon";

export function MaroonSection({ category }: { category: MaroonCategory }) {
  const destination = category.slug === "courses" ? { href: "/schedule", title: "Explore the tournament courses", text: "Visit the schedule for course photos and session details.", label: "Course guide" }
    : category.slug === "news" ? { href: "/history", title: "The stories start here", text: "Revisit the champions and results in the Maroon Tournament archive.", label: "From the archive" } : null;
  return <section aria-label={category.label}>
    <div className="mb-4 flex items-end justify-between gap-3 border-b-2 border-ink-900 pb-2">
      <h2 className="text-2xl font-bold sm:text-3xl">{category.label}</h2>
      <Link href={`/the-maroon/${category.slug}`} className="flex items-center gap-1 text-xs font-semibold text-maroon-700">Explore <ArrowUpRight size={14} /></Link>
    </div>
    {destination ? <Link href={destination.href} className="group grid overflow-hidden rounded-lg border border-gold-300 bg-white sm:grid-cols-2">
      <div className="relative aspect-[16/10]"><Image src={category.image} alt={category.slug === "courses" ? "Mission Hills golf course" : "The Maroon Tournament team"} fill sizes="(max-width: 640px) 100vw, 45vw" className="object-cover transition-transform duration-300 group-hover:scale-105" /></div>
      <div className="flex flex-col justify-center p-5 sm:p-8"><p className="mb-2 font-condensed text-xs font-bold uppercase tracking-widest text-maroon-700">{destination.label}</p><h3 className="font-serif text-2xl font-bold text-ink-900">{destination.title}</h3><p className="mt-3 text-sm leading-relaxed text-ink-500">{destination.text}</p><span className="mt-5 flex items-center gap-2 text-sm font-semibold text-maroon-700">Take a look <ArrowUpRight size={16} /></span></div>
    </Link> : <div className="rounded-lg border border-gold-300 bg-white p-6 sm:p-8"><p className="font-condensed text-xs font-bold uppercase tracking-widest text-maroon-600">Coming soon</p><h3 className="mt-2 font-serif text-2xl font-bold">{category.headline}</h3><p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-500">{category.description} New stories will appear here.</p></div>}
  </section>;
}
