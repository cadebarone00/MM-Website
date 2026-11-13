"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Plus, Smartphone, Trophy, User, Users, Upload } from "lucide-react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { pastTripTemplate, type PastTripKind } from "@/lib/platform/pastTripTemplates";
import type { ImportProblem, ImportSummary } from "@/lib/platform/pastTripImport";
import styles from "./PastTripImport.module.css";

const KINDS: { kind: PastTripKind; label: string; title: string; icon: typeof User; about: string }[] = [
  { kind: "individual", label: "Individual", title: "Individual trip", icon: User, about: "Everyone plays for themselves." },
  { kind: "team", label: "Team", title: "Team trip", icon: Users, about: "Two teams play matches." },
  { kind: "both", label: "Both", title: "Team + individual trip", icon: Trophy, about: "Team matches plus an individual champion." },
];
const dates = (from: string, to: string) => {
  const f = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
};

type Step = { at: "choose" } | { at: "kind" } | { at: "file"; kind: PastTripKind } | { at: "problems"; kind: PastTripKind; problems: ImportProblem[] }
  | { at: "preview"; kind: PastTripKind; file: File; summary: ImportSummary };

/**
 * Golf Trips → Past Trips → Import past trip: pick Individual / Team / Both, download that template, upload it filled in.
 * The server checks it (nothing saved) and shows the result; you pick which player is you, then Add trip saves it and
 * opens the trip. Spec "Import a past trip from a spreadsheet". `endpoint`: the app simulator's sample import
 * (/api/dev/past-trip-import, nothing saved) instead of the real one.
 */
export function PastTripImport({ endpoint = "/api/golf-trips/import", walkthroughHref = "/golf-trips/import" }: { endpoint?: string; walkthroughHref?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState("");
  const requestId = useRef("");
  const close = () => { if (!busy) { setStep(null); setError(""); } };

  async function send(file: File, action: "preview" | "create") {
    const form = new FormData();
    form.set("file", file);
    form.set("action", action);
    if (action === "create") { form.set("me", me); form.set("requestId", requestId.current); }
    const response = await fetch(endpoint, { method: "POST", body: form });
    return response.json().catch(() => ({ ok: false, error: "Something went wrong. Try again." }));
  }

  async function check(kind: PastTripKind, file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const reply = await send(file, "preview");
      if (reply.ok) {
        requestId.current = crypto.randomUUID();
        setMe("");
        setStep({ at: "preview", kind, file, summary: reply.summary });
      } else if (reply.problems) setStep({ at: "problems", kind, problems: reply.problems });
      else setError(reply.error ?? "We couldn't read that file.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function save(file: File) {
    setBusy(true);
    setError("");
    try {
      const reply = await send(file, "create");
      if (reply.ok) return router.push(reply.url);
      setError(reply.error ?? "We couldn't save the trip. Try again.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const upload = (kind: PastTripKind, label: string) => <label className={styles.upload} aria-disabled={busy}>
    <Upload size={17} aria-hidden="true" />{busy ? "Checking…" : label}
    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void check(kind, file); }} />
  </label>;

  return <>
    <button type="button" className={styles.open} onClick={() => setStep({ at: "choose" })}><Plus size={15} strokeWidth={2.5} aria-hidden="true" />Import past trip</button>
    {step?.at === "choose" && <GolfTripActionSheet label="Import past trip" onClose={close}>
      <div className={styles.body}>
        <h2 className={styles.title}>Import past trip</h2>
        <p className={styles.text}>How do you want to add it?</p>
        <div className={styles.kinds}>
          <Link href={walkthroughHref} className={styles.kind}>
            <span className={styles.kindIcon}><Smartphone size={18} aria-hidden="true" /></span>
            <span><span className={styles.kindLabel}>Enter it in the app <span className={styles.badge}>Recommended</span></span><span className={styles.kindAbout}>A few quick steps on your phone: rounds, players, who won.</span></span>
          </Link>
          <button type="button" className={styles.kind} onClick={() => setStep({ at: "kind" })}>
            <span className={styles.kindIcon}><FileSpreadsheet size={18} aria-hidden="true" /></span>
            <span><span className={styles.kindLabel}>Use a spreadsheet</span><span className={styles.kindAbout}>Best on a computer, for lots of history.</span></span>
          </button>
        </div>
      </div>
    </GolfTripActionSheet>}

    {step?.at === "kind" && <GolfTripActionSheet label="Import past trip" onClose={close}>
      <div className={styles.body}>
        <h2 className={styles.title}>Import past trip</h2>
        <p className={styles.text}>What kind of trip was it?</p>
        <div className={styles.kinds}>
          {KINDS.map(({ kind, label, icon: Icon, about }) => <button key={kind} type="button" className={styles.kind} onClick={() => setStep({ at: "file", kind })}>
            <span className={styles.kindIcon}><Icon size={18} aria-hidden="true" /></span>
            <span><span className={styles.kindLabel}>{label}</span><span className={styles.kindAbout}>{about}</span></span>
          </button>)}
        </div>
      </div>
    </GolfTripActionSheet>}

    {step && step.at !== "kind" && step.at !== "choose" && <GolfTripActionSheet label="Import past trip" onClose={close}>
      <div className={styles.body}>
        <h2 className={styles.title}>{KINDS.find((k) => k.kind === step.kind)!.title}</h2>

        {step.at === "file" && <>
          <ol className={styles.steps}>
            <li><a className={styles.download} href={pastTripTemplate(step.kind)} download><Download size={17} aria-hidden="true" />Download the template</a></li>
            <li>Fill it in on a computer, in Excel, Numbers or Google Sheets. Start with the Start Here tab.</li>
            <li>Save it as an Excel (.xlsx) file and upload it here.</li>
          </ol>
          {upload(step.kind, "Upload filled-in template")}
          <button type="button" className={styles.back} onClick={() => setStep({ at: "kind" })} disabled={busy}>Pick a different kind</button>
        </>}

        {step.at === "problems" && <>
          <p className={styles.text}>Fix these in the spreadsheet, then upload it again.</p>
          <ul className={styles.problems} aria-label="Problems in the file">
            {step.problems.map((p, i) => <li key={i}><b>{p.sheet}{p.row ? ` row ${p.row}` : ""}:</b> {p.message}</li>)}
          </ul>
          {upload(step.kind, "Upload it again")}
        </>}

        {step.at === "preview" && <>
          <div className={styles.summary}>
            <p className={styles.tripName}>{step.summary.name}</p>
            <p className={styles.meta}>{step.summary.place} · {dates(step.summary.startDate, step.summary.endDate)}</p>
            <dl className={styles.facts}>
              <div><dt>Players</dt><dd>{step.summary.players.length}</dd></div>
              <div><dt>Rounds</dt><dd>{step.summary.roundCount}</dd></div>
              {step.summary.teams && <div><dt>{step.summary.teams.names[0]} – {step.summary.teams.names[1]}</dt><dd>{step.summary.teams.points[0]} – {step.summary.teams.points[1]}</dd></div>}
              {step.summary.teams && <div><dt>Team winner</dt><dd>{step.summary.teams.winner ?? "No matches"}</dd></div>}
              {step.summary.champion && <div><dt>Champion ({step.summary.champion.method.toLowerCase()})</dt><dd>{step.summary.champion.name ?? "Tied"}</dd></div>}
            </dl>
          </div>
          <label className={styles.field}>Which player is you?
            <select value={me} onChange={(event) => setMe(event.target.value)} disabled={busy}>
              <option value="">I didn&apos;t play</option>
              {step.summary.players.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <p className={styles.note}>Everyone else is added without an account. Send each of them an invite link from the trip&apos;s Settings → Members so it shows up for them too.</p>
          <button type="button" className={styles.primary} onClick={() => save(step.file)} disabled={busy}>{busy ? "Adding…" : "Add trip"}</button>
          {upload(step.kind, "Upload a different file")}
        </>}

        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </GolfTripActionSheet>}
  </>;
}
