"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { maroonCategories } from "@/lib/data/theMaroon";

export function MaroonNavigation() {
  const pathname = usePathname();
  const links = [{ href: "/the-maroon", label: "Home" }, ...maroonCategories.map((category) => ({ href: `/the-maroon/${category.slug}`, label: category.label }))];
  return <nav aria-label="The Maroon sections" className="flex justify-center border-y border-gold-300 bg-white px-2">
    {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`border-b-2 px-2.5 py-3 font-condensed text-xs font-bold uppercase tracking-wide sm:px-6 sm:py-4 sm:text-sm ${pathname === link.href ? "border-maroon-700 text-maroon-700" : "border-transparent text-ink-500 hover:border-gold-400 hover:text-maroon-700"}`}>{link.label}</Link>)}
  </nav>;
}
