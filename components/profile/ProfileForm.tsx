"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BIO_MAX, NAME_MAX, USERNAME_RULE, nameProblem, usernameProblem } from "@/lib/profile/profileEdit";

const field = "flex flex-col gap-1.5 font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700";
const hint = "m-0 text-xs text-maroon-900/60";
const input = "min-h-12 w-full rounded-md border border-maroon-900/25 bg-white px-3 py-2 font-sans text-base normal-case tracking-normal text-maroon-900";

/**
 * Finish profile setup (mode "setup": name + username, creates the profile) and Edit profile (mode "edit": name,
 * username, bio). Only those fields exist here — history, teams, results and the legacy link aren't editable.
 */
export function ProfileForm({ mode, initial }: { mode: "setup" | "edit"; initial: { displayName: string; username: string; bio: string; bioAvailable?: boolean } }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const usernameChanged = username.trim() !== initial.username;

  async function submit() {
    // Same checks as the server; the database still decides whether a username is free.
    const problem = nameProblem(displayName) ?? (mode === "setup" || usernameChanged ? usernameProblem(username.trim()) : null);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError("");
    const body = mode === "setup" ? { displayName, username: username.trim() }
      : { displayName, ...(usernameChanged && { username: username.trim() }), ...(initial.bioAvailable !== false && { bio }) };
    try {
      const response = await fetch("/api/account/profile", { method: mode === "setup" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const reply = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.ok && reply?.ok) {
        router.push("/profile");
        router.refresh();
        return;
      }
      setError(reply?.error ?? "Couldn't save your profile. Try again.");
    } catch {
      setError("Couldn't reach the server. Nothing was saved.");
    }
    setSaving(false);
  }

  return <form className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-5 pb-32 pt-24 text-maroon-900" noValidate
    aria-label={mode === "setup" ? "Finish profile setup" : "Edit profile"} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <div>
      <h2 className="m-0 font-serif text-2xl font-bold">{mode === "setup" ? "Finish setting up your profile" : "Edit profile"}</h2>
      {mode === "setup" && <p className="mt-2 text-maroon-900/70">Pick the name people see and a username for your profile link.</p>}
    </div>
    {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    <label className={field}>Name
      <input className={input} value={displayName} maxLength={NAME_MAX} autoComplete="name" onChange={(e) => setDisplayName(e.target.value)} required />
    </label>
    <div className="flex flex-col gap-1.5">
      <label className={field}>Username
        <input className={input} value={username} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setUsername(e.target.value)} required aria-describedby="username-rule" />
      </label>
      <p id="username-rule" className={hint}>{USERNAME_RULE} Your profile link is /profile/{username.trim() || "username"}.</p>
    </div>
    {mode === "edit" && initial.bioAvailable !== false && <div className="flex flex-col gap-1.5">
      <label className={field}>Bio
        <textarea className={`${input} min-h-32`} value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} aria-describedby="bio-count" />
      </label>
      <p id="bio-count" className={hint}>{bio.length} / {BIO_MAX}</p>
    </div>}
    <div className="flex gap-3">
      {mode === "edit" && <button type="button" className="min-h-12 flex-1 rounded-pill border border-maroon-900/30 font-condensed text-sm font-semibold uppercase tracking-wide" onClick={() => router.back()} disabled={saving}>Cancel</button>}
      <button type="submit" className="min-h-12 flex-1 rounded-pill bg-maroon-900 font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 disabled:opacity-60" disabled={saving}>
        {saving ? "Saving…" : mode === "setup" ? "Create my profile" : "Save"}
      </button>
    </div>
  </form>;
}
