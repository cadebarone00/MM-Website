import { maroonCategories, type MaroonCategory } from "@/lib/data/theMaroon";
import { MaroonSection } from "./MaroonSection";

export function MaroonCategoryPage({ category }: { category: MaroonCategory["slug"] }) {
  const section = maroonCategories.find((item) => item.slug === category)!;
  return <div className="mx-auto max-w-[1200px] px-4 pb-12 pt-8 sm:px-7 sm:pt-12"><header className="mb-8 max-w-2xl"><p className="font-condensed text-xs font-bold uppercase tracking-widest text-maroon-700">The Maroon · {section.label}</p><h1 className="mt-3 text-4xl font-bold sm:text-5xl">{section.headline}</h1><p className="mt-4 text-sm leading-relaxed text-ink-500 sm:text-base">{section.description}</p></header><MaroonSection category={section} /></div>;
}
