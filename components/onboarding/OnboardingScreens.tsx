"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { GolfTripDatePicker } from "@/components/platform/GolfTripDatePicker";
import { suggestUsername } from "@/components/dev/auth/AuthNamePreview";
import { AddPhotoIcon } from "@/components/dev/auth/AuthPhotoPreview";
import { BellIcon, PersonIcon, Setting } from "@/components/dev/auth/AuthSettingsPreview";
import { NAME_MAX, usernameProblem } from "@/lib/profile/profileEdit";
import { errorOf, send } from "@/lib/account/onboardingClient";
import { finishProblem, ONBOARDING, progressWidth, STATUS } from "@/lib/account/onboardingRoutes";
import frame from "@/components/dev/auth/AuthNamePreview.module.css";
import birthdayStyles from "@/components/dev/auth/AuthBirthdayPreview.module.css";
import photoStyles from "@/components/dev/auth/AuthPhotoPreview.module.css";
import settingsStyles from "@/components/dev/auth/AuthSettingsPreview.module.css";

/**
 * Pending accounts Phase 6: the real onboarding steps for a signed-in Pending account — the approved /dev/auth designs
 * (same styles) connected to the real APIs. The server page decides which step may show (lib/account/onboardingRoutes.ts);
 * every save is checked again on the server. Nothing here activates the account except Finish.
 */

/** Name + username → POST /api/account/profile (the database decides whether the username is free). A name from
 *  Google / Apple (Phase 7C) is only a starting value: the person can change it before saving. */
export function NameScreen({ initialFirst = "", initialLast = "" }: { initialFirst?: string; initialLast?: string }) {
  const router = useRouter();
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [typedUsername, setTypedUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const username = typedUsername ?? suggestUsername(first, last);
  const problem = username ? usernameProblem(username) : null;
  const ready = first.trim() !== "" && username !== "" && !problem && !busy;

  async function save() {
    setBusy(true);
    setServerError(null);
    const sent = await send("/api/account/profile", { displayName: `${first.trim()} ${last.trim()}`.trim(), username });
    if (sent.json.ok !== true) { setServerError(errorOf(sent)); setBusy(false); return; }
    router.replace(ONBOARDING.birthday);
    router.refresh();
  }

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={frame.progress} aria-hidden="true"><span style={{ width: progressWidth("name") }} /></div>
    <h1 className={frame.title}>What&apos;s your name?</h1>
    <form className={frame.fields} onSubmit={(e) => { e.preventDefault(); if (ready) void save(); }}>
      <label className={frame.field}><span>First Name</span>
        <input autoComplete="given-name" autoFocus maxLength={NAME_MAX} value={first} onChange={(e) => setFirst(e.target.value)} /></label>
      <label className={frame.field}><span>Last Name</span>
        <input autoComplete="family-name" maxLength={NAME_MAX} value={last} onChange={(e) => setLast(e.target.value)} /></label>
      <label className={frame.field}><span>Username</span>
        <div className={frame.handle}>@<input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} value={username}
          onChange={(e) => setTypedUsername(e.target.value.replace(/\s/g, ""))} /></div></label>
      {/* Always rendered so Continue never moves when a username message appears. */}
      <p className={frame.error} role="alert">{serverError ?? problem}</p>
      <button type="submit" className={frame.continue} disabled={!ready}>{busy ? "Saving…" : "Continue"}</button>
    </form>
  </main>;
}

/** Birthday → POST /api/account/birthday (saved once). Under 13: the server signs this browser out → status page. */
export function BirthdayScreen() {
  const router = useRouter();
  const [birthday, setBirthday] = useState(""); // YYYY-MM-DD
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toLocaleDateString("en-CA");
  const [year, month, day] = birthday ? birthday.split("-") : [];

  async function save() {
    setBusy(true);
    setError(null);
    const sent = await send("/api/account/birthday", { birthdate: birthday });
    if (sent.json.ok === true && sent.json.eligible === true) { router.replace(ONBOARDING.photo); router.refresh(); return; }
    if (sent.json.ok === true || sent.json.signedOut === true) { router.replace(`${STATUS}?reason=ineligible`); router.refresh(); return; }
    setError(errorOf(sent));
    setBusy(false);
  }

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={frame.progress} aria-hidden="true"><span style={{ width: progressWidth("birthday") }} /></div>
    <h1 className={frame.title}>What&apos;s your birthday?</h1>
    <button type="button" className={birthdayStyles.boxes} aria-haspopup="dialog"
      aria-label={birthday ? `Birthday ${month}/${day}/${year}. Change` : "Pick your birthday"} onClick={() => setOpen(true)}>
      {[["Month", month, "MM"], ["Day", day, "DD"], ["Year", year, "YYYY"]].map(([label, value, placeholder]) =>
        <span key={label} className={birthdayStyles.column}>
          <span className={birthdayStyles.label}>{label}</span>
          <strong className={`${birthdayStyles.box} ${value ? "" : birthdayStyles.empty}`}>{value ?? placeholder}</strong>
        </span>)}
    </button>
    <p className={birthdayStyles.note}>We require your date of birth to assist us in complying with privacy laws, as well as manage and personalize your account.</p>
    <p className={frame.error} role="alert">{error}</p>
    <button type="button" className={`${frame.continue} ${birthdayStyles.continue}`} disabled={!birthday || busy} onClick={() => void save()}>
      {busy ? "Saving…" : "Continue"}
    </button>
    {open && createPortal(<GolfTripDatePicker singleDay pickYear label="Birthday" arrival={birthday} departure={birthday} maxDays={1}
      min="1900-01-01" max={today} openMonth="2000-01" onClose={() => setOpen(false)}
      onSubmit={(date) => { setBirthday(date); setOpen(false); }} />, document.body)}
  </main>;
}

/** Optional photo → POST /api/account/photo. "Skip for now" saves nothing. */
export function PhotoScreen() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function next() {
    if (!file) { router.push(ONBOARDING.settings); return; }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("photo", file);
    const ok = await fetch("/api/account/photo", { method: "POST", body: form })
      .then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) as Record<string, unknown> }))
      .catch(() => ({ status: 0, json: { ok: false, error: "No connection. Check your internet and try again." } as Record<string, unknown> }));
    if (ok.json.ok !== true) { setError(errorOf(ok)); setBusy(false); return; }
    router.push(ONBOARDING.settings);
  }

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={frame.progress} aria-hidden="true"><span style={{ width: progressWidth("photo") }} /></div>
    <h1 className={`${frame.title} ${photoStyles.title}`}>Add a profile image</h1>
    <p className={photoStyles.subtitle}>Pick a photo so your golf buddies know it&apos;s you.</p>
    <label className={photoStyles.tile}>
      <input type="file" accept="image/*" className={photoStyles.file}
        onChange={(e) => { const picked = e.target.files?.[0]; if (picked) { setFile(picked); setPreview(URL.createObjectURL(picked)); } }} />
      {preview
        // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, same as the dev design
        ? <img src={preview} alt="Your profile photo" className={photoStyles.photo} />
        : <><AddPhotoIcon /><span className={photoStyles.tap}>Tap to choose a photo</span></>}
    </label>
    <p className={frame.error} role="alert">{error}</p>
    <button type="button" className={frame.continue} disabled={busy} onClick={() => void next()}>
      {busy ? "Uploading…" : preview ? "Continue" : "Skip for now"}
    </button>
  </main>;
}

/**
 * "Last step!" → Finish: saves Public / Private (PUT /api/account/privacy), records the current Terms when they still
 * need accepting, then POST /api/account/finish. One Finish at a time (the button locks; the server is also repeat-safe).
 * Profile Created opens only after the server confirms the account is Active; any failure keeps the person here with a
 * message, and nothing already saved is lost. Notifications: the choice is shown but there is no setting to save it
 * to yet (the phone's own permission prompt comes with the app).
 */
export function SettingsScreen({ needsTerms }: { needsTerms: boolean }) {
  const router = useRouter();
  const [publicProfile, setPublicProfile] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    setError(null);
    const fail = (message: string) => { setError(message); setBusy(false); finishing.current = false; };

    const privacy = await send("/api/account/privacy", { visibility: publicProfile ? "public" : "private" }, "PUT");
    if (privacy.json.ok !== true) return fail(errorOf(privacy));
    if (needsTerms) {
      const versions = await send("/api/account/terms", undefined, "GET");
      if (typeof versions.json.terms !== "string" || typeof versions.json.privacy !== "string") return fail("Finishing sign-up isn't open yet. Your progress is saved.");
      const accepted = await send("/api/account/terms", { termsVersion: versions.json.terms, privacyVersion: versions.json.privacy });
      if (accepted.json.ok !== true) return fail(errorOf(accepted));
    }
    const done = await send("/api/account/finish");
    if (done.json.ok !== true || done.json.activated !== true) {
      return fail(finishProblem(done.json.code as string | undefined, done.json.error as string | undefined, done.json.missing as string[] | undefined));
    }
    router.replace(ONBOARDING.created);
    router.refresh();
  }

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={frame.progress} aria-hidden="true"><span style={{ width: progressWidth("settings") }} /></div>
    <h1 className={`${frame.title} ${settingsStyles.title}`}>Last step!</h1>
    <p className={settingsStyles.subtitle}>Choose who can see your profile and how we keep you in the loop. You can change both later in Settings.</p>
    <div className={settingsStyles.cards}>
      <Setting icon={<PersonIcon />} title="Public profile" on={publicProfile} onChange={setPublicProfile}>
        {publicProfile
          ? "Anyone on The Maroon can find you and see your profile and rounds."
          : "Off: your profile is private. Only people you play with can see it and your rounds."}
      </Setting>
      <Setting icon={<BellIcon />} title="Notifications" on={notifications} onChange={setNotifications}>
        We only notify you about your trips and rounds: tee times, live scores and results.
      </Setting>
    </div>
    <p className={settingsStyles.privacy}>We take your privacy seriously.
      {needsTerms && <><br />By tapping Finish, you agree to the current Terms of Service and Privacy Policy.</>}</p>
    <p className={frame.error} role="alert">{error}</p>
    <button type="button" className={frame.continue} disabled={busy} onClick={() => void finish()}>{busy ? "Finishing…" : "Finish"}</button>
  </main>;
}
