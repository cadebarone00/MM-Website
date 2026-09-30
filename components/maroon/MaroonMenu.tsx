"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

// Sub-pages don't exist yet, so every item points at "#" until they're built.
const menus = [
  { label: "Courses", items: ["Search", "Reviews", "Rankings"] },
  { label: "Equipment", items: ["Search", "The Maroon Standard", "What's in the Bag"] },
  { label: "Teaching", items: ["Find a Pro", "Watch Lessons"] },
  { label: "News", items: ["Feed", "What's New"] },
];

export function MaroonMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeWhenClickedOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", closeWhenClickedOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenClickedOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <ul ref={menuRef} className="flex w-full items-center justify-between gap-1 sm:justify-center sm:gap-[clamp(24px,5vw,80px)]">
      <li><Link href="/" aria-current={pathname === "/" || pathname === "/the-maroon" ? "page" : undefined} className="flex min-h-[52px] items-center border-b border-transparent px-1 py-2 font-title text-[10px] font-semibold uppercase tracking-[0.05em] text-white hover:border-white aria-[current=page]:border-white sm:px-2 sm:text-sm sm:tracking-[0.14em]">Home</Link></li>
      {menus.map((menu) => {
        const isOpen = open === menu.label;
        const href = `/the-maroon/${menu.label.toLowerCase()}`;
        const active = pathname === href;
        return (
          <li key={menu.label} className="sm:relative" onMouseLeave={() => setOpen(null)}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`maroon-menu-${menu.label.toLowerCase()}`}
              onClick={() => setOpen(isOpen ? null : menu.label)}
              className={`flex min-h-[52px] items-center gap-1 border-b px-1 py-2 font-title text-[10px] font-semibold uppercase tracking-[0.05em] text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-2 sm:text-sm sm:tracking-[0.14em] ${active || isOpen ? "border-white" : "border-transparent hover:border-white"}`}
            >
              {menu.label}
              <ChevronDown size={12} aria-hidden className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="absolute inset-x-0 top-full z-30 pt-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                <ul id={`maroon-menu-${menu.label.toLowerCase()}`} className="min-w-52 rounded-md border border-gold-400/40 bg-maroon-900 py-2 text-left shadow-xl">
                  <li><Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(null)} className="block border-b border-white/15 px-5 py-2.5 font-sans text-sm text-white hover:bg-maroon-800 hover:text-gold-300">All {menu.label}</Link></li>
                  {menu.items.map((item) => (
                    <li key={item}>
                      <Link
                        href="#"
                        onClick={() => setOpen(null)}
                        className="block px-5 py-2.5 font-sans text-sm text-white/85 hover:bg-maroon-800 hover:text-gold-300"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
