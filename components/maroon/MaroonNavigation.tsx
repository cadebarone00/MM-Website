"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { maroonCategories } from "@/lib/data/theMaroon";

export function MaroonNavigation() {
  const pathname = usePathname();
  const links = [{ href: "/the-maroon", label: "Home" }, ...maroonCategories.map((category) => ({ href: `/the-maroon/${category.slug}`, label: category.label }))];
  return <nav aria-label="The Maroon sections" className="relative mt-8 flex justify-between gap-1 sm:justify-center sm:gap-[clamp(24px,5vw,80px)]">
    {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`flex min-h-[52px] items-center justify-center border-b px-1 py-2 text-[10px] uppercase tracking-[0.05em] text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-2 sm:text-sm sm:tracking-[0.14em] ${pathname === link.href ? "border-white" : "border-transparent hover:border-white"}`}>{link.label}</Link>)}
  </nav>;
}
