import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { formatCode } from "@/lib/platform/codeTournaments";
import type { LeagueLookup } from "@/lib/platform/leagues";
import { Wizard, WizardField, WizardNote } from "~/components/setup/Wizard.tsx";
import { apiJson } from "~/lib/api.ts";
import { dayLabel, handicapOk, handicapValue, playersText } from "~/lib/leaguesUi.ts";
import { typedJoinCode } from "~/lib/play.ts";

type Look = { status: "loading" } | { status: "found"; league: LeagueLookup } | { status: "missing" } | { status: "error"; message: string };

/**
 * Join a league by code (website LeagueJoin; part 5a), from the Leagues tab's code card or a shared link: what it is,
 * my handicap (optional), Join → the league. Already in → Open league; ended → says so.
 */
export default function JoinLeague() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typedJoinCode(params.code ?? "");
  const [look, setLook] = useState<Look>({ status: "loading" });
  const [handicap, setHandicap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (code.length !== 6) { setLook({ status: "missing" }); return; }
    apiJson<{ league?: LeagueLookup | null }>(`/api/leagues/lookup?code=${encodeURIComponent(code)}`, { messages: { not_installed: "Leagues aren't set up in the database yet." } }).then((r) => {
      if (!r.ok) setLook({ status: "error", message: r.error });
      else setLook(r.body.league ? { status: "found", league: r.body.league } : { status: "missing" });
    });
  }, [code]);

  const open = (id: string) => router.replace({ pathname: "/leagues/[id]", params: { id } });
  async function join(league: LeagueLookup) {
    setBusy(true); setError(null);
    const r = await apiJson<{ id?: string }>("/api/leagues/join", { method: "POST", body: { code, handicap: handicapValue(handicap) } });
    setBusy(false);
    if (r.ok && r.body.id) { open(r.body.id); return; }
    setError(r.ok ? `Couldn't join ${league.name}. Try again.` : r.error);
  }

  const back = () => router.back();
  if (look.status !== "found") {
    return (
      <Wizard step={0} steps={1} title={`Join with code · ${formatCode(code)}`} backLabel="Back" onBack={back}
        nextLabel={look.status === "loading" ? "Looking…" : "Try another code"} onNext={back} nextDisabled={look.status === "loading"}>
        {look.status === "loading" ? <WizardNote>Looking up the code…</WizardNote>
          : look.status === "missing" ? <WizardNote tone="error">{`No league has the code ${formatCode(code)}. Check it with your organizer and try again.`}</WizardNote>
          : <WizardNote tone="error">{look.message}</WizardNote>}
      </Wizard>
    );
  }
  const { league } = look;
  const ended = league.status === "ended";
  return (
    <Wizard step={0} steps={1} title={league.name} onBack={back}
      nextLabel={league.member ? "You're in. Open league" : ended ? "Back to Leagues" : busy ? "Joining…" : "Join league"}
      onNext={() => league.member ? open(league.id) : ended ? back() : void join(league)}
      nextDisabled={!league.member && !ended && !handicapOk(handicap)} busy={busy}>
      <WizardNote>{`${league.course} · ${dayLabel(league.date)} · Organized by ${league.organizerName} · ${playersText(league.playerCount)}`}</WizardNote>
      {ended && !league.member ? <WizardNote tone="error">This league has ended.</WizardNote> : !league.member && (
        <>
          <WizardField label="Your handicap index" value={handicap} onChange={setHandicap} placeholder="e.g. 12.3" keyboard="numbers-and-punctuation" maxLength={5} />
          <WizardNote>{handicapOk(handicap) ? "Used for anything net. Leave it blank if you don't have one." : "Enter a handicap from -10 to 54, or leave it blank."}</WizardNote>
        </>
      )}
      {error && <WizardNote tone="error">{error}</WizardNote>}
    </Wizard>
  );
}
