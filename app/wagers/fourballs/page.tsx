"use client";

import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";

export default function FourballsPage() {
  return (
    <CategoryPageShell
      rulesText="Fourball markets will post here once fourball matchups are scheduled."
      searchPlaceholder="Search a fourball market..."
    >
      {() => <p className="font-sans text-sm text-ink-400">No fourball markets posted yet.</p>}
    </CategoryPageShell>
  );
}
