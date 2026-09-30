"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Sub-pages don't exist yet, so every item points at "#" until they're built.
const menus = [
  { label: "Courses", items: ["Search", "Reviews", "Rankings"] },
  { label: "Equipment", items: ["Search", "The Maroon Standard", "What's in the Bag"] },
  { label: "Teaching", items: ["Find a Pro", "Watch Lessons"] },
  { label: "News", items: ["Feed", "What's New"] },
];

export function MaroonMenu() {
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
    <ul ref={menuRef} className="hidden items-center gap-8 lg:flex">
      {menus.map((menu) => {
        const isOpen = open === menu.label;
        return (
          <li key={menu.label} className="relative" onMouseEnter={() => setOpen(menu.label)} onMouseLeave={() => setOpen(null)}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : menu.label)}
              className={`flex items-center gap-1 py-2 font-condensed text-xs uppercase tracking-[0.25em] hover:text-white ${isOpen ? "text-white" : "text-white/60"}`}
            >
              {menu.label}
              <ChevronDown size={13} aria-hidden className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="absolute left-1/2 top-full -translate-x-1/2 pt-2">
                <ul className="min-w-52 rounded-md border border-gold-400/40 bg-maroon-900 py-2 shadow-xl">
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
