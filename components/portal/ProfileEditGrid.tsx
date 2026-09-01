// components/portal/ProfileEditGrid.tsx
"use client";

import { useState } from "react";
import type { PlayerProfile } from "@/lib/data/types";

export interface PendingEdit {
  field: string;
  proposedValue: string | string[];
  submittedAt: string;
}

interface FieldSpec {
  key: keyof PlayerProfile;
  label: string;
  multiline?: boolean;
}

interface Section {
  key: string;
  title: string;
  fields: FieldSpec[];
}

export const SECTIONS: Section[] = [
  { key: "bio", title: "Bio Text", fields: [{ key: "bio", label: "Bio", multiline: true }] },
  {
    key: "facts",
    title: "Bio Facts",
    fields: [
      { key: "classYear", label: "Class Year" },
      { key: "major", label: "Major" },
      { key: "occupation", label: "Occupation" },
      { key: "hometown", label: "Hometown" },
      { key: "college", label: "College" },
      { key: "residence", label: "Residence" },
      { key: "playsFrom", label: "Plays From" },
      { key: "status", label: "Status" },
      { key: "handicap", label: "Handicap" },
      { key: "rankingNotes", label: "Ranking" },
      { key: "clubGolfYears", label: "Club Golf" },
      { key: "debut", label: "Debut" },
      { key: "debutLocation", label: "Debut Location" },
      { key: "height", label: "Height" },
      { key: "weight", label: "Weight" },
      { key: "age", label: "Age" },
      { key: "birthday", label: "Birthday" },
      { key: "nickname", label: "Nickname" },
    ],
  },
  {
    key: "notes",
    title: "Notes",
    fields: [
      { key: "strengths", label: "Strengths", multiline: true },
      { key: "careerHighlights", label: "Career Highlights", multiline: true },
      { key: "personal", label: "Family", multiline: true },
      { key: "hobbies", label: "Hobbies", multiline: true },
      { key: "goals", label: "Goals", multiline: true },
      { key: "misc", label: "Misc", multiline: true },
    ],
  },
  { key: "history", title: "History", fields: [{ key: "history", label: "One per line", multiline: true }] },
  {
    key: "social",
    title: "Social Links",
    fields: [
      { key: "instagram", label: "Instagram URL" },
      { key: "linkedin", label: "LinkedIn URL" },
    ],
  },
];

function toFieldValue(profile: PlayerProfile, key: keyof PlayerProfile): string {
  const value = profile[key];
  if (Array.isArray(value)) return value.join("\n");
  return typeof value === "string" ? value : "";
}

function fromFieldValue(key: keyof PlayerProfile, raw: string): string | string[] {
  if (key === "history") {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return raw;
}

export function ProfileEditGrid({ profile, pendingEdits }: { profile: PlayerProfile; pendingEdits: PendingEdit[] }) {
  const [pendingByField, setPendingByField] = useState(new Map(pendingEdits.map((e) => [e.field, e])));
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  function openSectionFor(section: Section) {
    const initial: Record<string, string> = {};
    for (const field of section.fields) {
      const pending = pendingByField.get(field.key as string);
      initial[field.key as string] = pending
        ? Array.isArray(pending.proposedValue)
          ? pending.proposedValue.join("\n")
          : pending.proposedValue
        : toFieldValue(profile, field.key);
    }
    setValues(initial);
    setInitialValues(initial);
    setError(null);
    setSavedSection(null);
    setOpenSection(section.key);
  }

  async function handleSave(section: Section) {
    setSaving(true);
    setError(null);
    try {
      const edits = section.fields
        .filter((field) => (values[field.key as string] ?? "") !== (initialValues[field.key as string] ?? ""))
        .map((field) => ({
          field: field.key as string,
          value: fromFieldValue(field.key, values[field.key as string] ?? ""),
        }));
      if (edits.length === 0) {
        setSavedSection(section.key);
        return;
      }
      const res = await fetch("/api/portal/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not save your changes.");
        return;
      }
      setPendingByField((current) => {
        const next = new Map(current);
        for (const edit of edits) {
          next.set(edit.field, { field: edit.field, proposedValue: edit.value, submittedAt: new Date().toISOString() });
        }
        return next;
      });
      setInitialValues(values);
      setSavedSection(section.key);
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setSaving(false);
    }
  }

  const activeSection = SECTIONS.find((s) => s.key === openSection) ?? null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => openSectionFor(section)}
            className="cursor-pointer rounded-md border border-ink-200 bg-white px-4 py-6 text-center font-sans text-sm font-semibold text-maroon-700 hover:border-maroon-400"
          >
            {section.title}
          </button>
        ))}
      </div>

      {activeSection && (
        <div className="mt-6 rounded-md border border-ink-100 bg-white p-5">
          <h2 className="m-0 font-serif text-xl font-bold text-maroon-700">{activeSection.title}</h2>
          {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
          {savedSection === activeSection.key && (
            <p className="mt-3 rounded-sm bg-cream-100 px-3 py-2 font-sans text-sm text-ink-700">Saved — waiting on Tiger&rsquo;s approval.</p>
          )}
          <div className="mt-4 flex flex-col gap-4">
            {activeSection.fields.map((field) => {
              const pending = pendingByField.get(field.key as string);
              const currentDisplay = toFieldValue(profile, field.key);
              return (
                <div key={field.key as string}>
                  <label className="font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">{field.label}</label>
                  {pending && (
                    <p className="mt-1 font-sans text-xs text-ink-500">
                      Current: {currentDisplay || "—"} · Pending approval:{" "}
                      {Array.isArray(pending.proposedValue) ? pending.proposedValue.join(", ") : pending.proposedValue}
                    </p>
                  )}
                  {field.multiline ? (
                    <textarea
                      value={values[field.key as string] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key as string]: e.target.value }))}
                      rows={field.key === "bio" ? 6 : 3}
                      className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[field.key as string] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key as string]: e.target.value }))}
                      className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(activeSection)}
            className="mt-4 cursor-pointer rounded-pill bg-maroon-700 px-5 py-2 font-sans text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
