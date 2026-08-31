"use client";

import { useState } from "react";
import type { HoleStat } from "@/lib/data";

function StatLabel({ children }: { children: string }) {
  return <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{children}</span>;
}

function NumberEditor({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex flex-col items-center gap-[2px] px-5">
        <span className="font-score text-base font-bold text-ink-900 tabular-nums">{value}</span>
        <StatLabel>{label}</StatLabel>
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-[2px] px-5">
      <input
        type="number"
        inputMode="numeric"
        autoFocus
        defaultValue={value}
        min={0}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 0) onCommit(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-12 rounded-sm border-2 border-maroon-700 text-center font-score text-base font-bold text-ink-900 tabular-nums"
      />
      <StatLabel>{label}</StatLabel>
    </div>
  );
}

function HitMissEditor({
  label,
  value,
  applicable = true,
  onCommit,
}: {
  label: string;
  value: boolean;
  applicable?: boolean;
  onCommit: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!applicable) {
    return (
      <div className="flex flex-col items-center gap-[2px] px-5">
        <span className="font-score text-base font-bold text-ink-900">–</span>
        <StatLabel>{label}</StatLabel>
      </div>
    );
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex flex-col items-center gap-[2px] px-5">
        <span className="font-score text-base font-bold text-ink-900">{value ? "Hit" : "Miss"}</span>
        <StatLabel>{label}</StatLabel>
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 px-5">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => {
            onCommit(true);
            setEditing(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-sm border-2 border-green-600 text-green-600 font-bold"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => {
            onCommit(false);
            setEditing(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-sm border-2 border-red-600 text-red-600 font-bold"
        >
          ✕
        </button>
      </div>
      <StatLabel>{label}</StatLabel>
    </div>
  );
}

export function EditableHoleDetail({ hole, onChange }: { hole: HoleStat; onChange: (next: HoleStat) => void }) {
  const fairwayApplicable = hole.fir !== "X";

  return (
    <div className="flex items-center justify-center divide-x divide-ink-100 py-3 bg-white border-2 border-maroon-700 rounded-md">
      <NumberEditor label="Score" value={hole.score} onCommit={(score) => onChange({ ...hole, score, diff: score - hole.par })} />
      <HitMissEditor
        label="Fairway"
        value={hole.fir === 1}
        applicable={fairwayApplicable}
        onCommit={(hit) => onChange({ ...hole, fir: hit ? 1 : 0 })}
      />
      <HitMissEditor label="Green" value={hole.gir === 1} onCommit={(hit) => onChange({ ...hole, gir: hit ? 1 : 0 })} />
      <NumberEditor label="Putts" value={hole.putts} onCommit={(putts) => onChange({ ...hole, putts })} />
    </div>
  );
}
