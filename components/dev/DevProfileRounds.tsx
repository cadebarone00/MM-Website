"use client";

import { useState } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEFAULT_DEV_ACCOUNT, DEV_ACCOUNTS, devAccount, devPlayTogether } from "@/lib/dev/devAccounts";
import { visibilityOf } from "@/lib/dev/devPlayerRounds";
import { handicapSummary } from "@/lib/platform/playerRounds";
import { profileAccess, type RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";

const SOURCE: Record<string, string> = { trip: "Golf trip", tournament: "Tournament", personal: "Logged myself", history: "Past trip" };
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const chip = (on: boolean) => `min-h-10 rounded-pill border px-4 font-condensed text-sm font-semibold ${on ? "border-maroon-900 bg-maroon-900 text-cream-50" : "border-ink-200 bg-white text-ink-900"}`;

/**
 * DEV ONLY profile preview. "Signed in as" = the simulator's viewAs account; "Profile of" picks whose profile to look at,
 * so Public / Private can be checked from someone else's side. Rounds + handicap come from the same saved rounds the
 * trip writes; Privacy and Requests show only on your own profile.
 */
export function DevProfileRounds() {
  const viewer = useSimulator()?.state.viewAs ?? DEFAULT_DEV_ACCOUNT;
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const owner = ownerId ?? viewer;
  const store = useDevPlayerRounds();
  const visibility = visibilityOf(store, owner);
  const access = profileAccess({ viewerId: viewer, ownerId: owner, visibility, playTogether: devPlayTogether(viewer, owner) });
  const rounds = store.rounds.filter((r) => r.profileId === owner).sort((a, b) => b.datePlayed.localeCompare(a.datePlayed));
  const summary = handicapSummary(rounds);
  const requests = store.linkRequests.filter((r) => r.profileId === owner && r.status === "pending");
  const isOwner = viewer === owner;

  return <main className="mx-auto max-w-[480px] px-4 py-8">
    <p className="font-condensed text-xs uppercase tracking-wide text-ink-500">Signed in as {devAccount(viewer).name}</p>
    <div role="group" aria-label="Profile of" className="mt-3 flex flex-wrap gap-2">
      {DEV_ACCOUNTS.map((account) => <button key={account.id} type="button" aria-pressed={owner === account.id} className={chip(owner === account.id)} onClick={() => setOwnerId(account.id)}>
        {account.id === viewer ? "Me" : account.name}</button>)}
    </div>
    <h1 className="mt-6 font-serif text-3xl font-bold text-ink-900">{devAccount(owner).name}</h1>

    <section aria-label="Handicap" className="mt-4 rounded-md border border-ink-200 bg-white p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Handicap index</h2>
      {access.handicapIndex ? <p className="mt-1 text-2xl font-bold text-maroon-900">{summary.index ?? "—"}
        <span className="ml-2 text-sm font-normal text-ink-600">{summary.index === null ? `Needs 3 counting rounds (${summary.counting} so far)` : `Low ${summary.lowIndex} · ${summary.counting} counting rounds`}</span></p>
        : <p className="mt-1 text-ink-600">This profile is private.</p>}
    </section>

    {isOwner && requests.length > 0 && <section aria-label="Requests" className="mt-4 rounded-md border border-gold-500 bg-cream-50 p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Requests</h2>
      {requests.map((request) => <div key={request.id} className="mt-3">
        <p className="text-ink-900"><strong>{request.tripName}</strong> ({day(request.arrival)}) wants to add {request.rounds.length} past {request.rounds.length === 1 ? "round" : "rounds"} to your profile as &ldquo;{request.playerName}&rdquo;.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className={chip(true)} onClick={() => dispatchDevRounds({ type: "answerLink", requestId: request.id, accept: true })}>Accept</button>
          <button type="button" className={chip(false)} onClick={() => dispatchDevRounds({ type: "answerLink", requestId: request.id, accept: false })}>Decline</button>
        </div>
      </div>)}
    </section>}

    <section aria-label="Rounds" className="mt-4 rounded-md border border-ink-200 bg-white p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Rounds</h2>
      {!access.rounds ? <p className="mt-1 text-ink-600">Rounds are private.</p>
        : rounds.length === 0 ? <p className="mt-1 text-ink-600">No rounds yet.</p>
        : <ol className="mt-2">{rounds.map((round) => <li key={round.id} className="flex items-start justify-between gap-3 border-t border-ink-100 py-3 first:border-t-0">
          <div>
            <p className="font-semibold text-ink-900">{round.course.name}</p>
            <p className="text-sm text-ink-600">{day(round.datePlayed)} · {SOURCE[round.source]}{round.enteredBy === "organizer" ? " · Entered by organizer" : ""}</p>
            <p className="text-sm text-ink-500">{round.countsForHandicap ? `Counts · differential ${round.differential}` : `Not counted · ${round.notCountedReason}`}</p>
          </div>
          <p className="text-xl font-bold text-maroon-900">{round.total}</p>
        </li>)}</ol>}
    </section>

    {isOwner && <section aria-label="Privacy" className="mt-4 rounded-md border border-ink-200 bg-white p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Privacy</h2>
      <p className="mt-1 text-sm text-ink-600">{visibility === "public" ? "Anyone signed in can see your rounds and handicap." : "Only you see your rounds. People you play with still see your handicap index."}</p>
      <div className="mt-2 flex gap-2">
        {(["public", "private"] as RoundsVisibility[]).map((value) => <button key={value} type="button" aria-pressed={visibility === value} className={chip(visibility === value)}
          onClick={() => dispatchDevRounds({ type: "setVisibility", profileId: owner, visibility: value })}>{value === "public" ? "Public" : "Private"}</button>)}
      </div>
    </section>}
  </main>;
}
