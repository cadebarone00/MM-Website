"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { SocialIcon } from "@/components/profile/SocialIcon";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { PhotoCropper } from "@/components/profile/PhotoCropper";
import { PRIVACY_EXPLAIN } from "@/components/settings/PrivacySetting";
import type { RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";
import {
  BIO_MAX, GENDERS, NAME_MAX, USERNAME_RULE, genderLabel, limitBio, nameProblem, usernameProblem, type Gender, type ProfileEditInput,
} from "@/lib/profile/profileEdit";
import { SOCIAL_PLATFORMS, SOCIALS_MAX, socialDisplay, socialFromInput, socialHint, socialLabel, type ProfileSocial, type SocialPlatform } from "@/lib/profile/profileSocials";
import styles from "./EditProfileScreen.module.css";

/** What the screen starts with (lib/profile/profileEditServer.ts getMyProfileForm, plus photo + privacy). */
export interface EditProfileInitial {
  displayName: string; username: string; bio: string; bioAvailable: boolean;
  gender: Gender | ""; genderAvailable: boolean; links: ProfileSocial[]; linksAvailable: boolean;
  photoUrl: string | null; photoAvailable: boolean;
  /** null = the privacy setting can't be read yet (player_rounds.sql not run): the row is hidden. */
  visibility: RoundsVisibility | null;
}

/** Dev profile preview only: save to the sample profile instead of the account. Each throws to show an error. */
export interface EditProfileSavers {
  profile(body: ProfileEditInput): Promise<void>;
  photo(file: File | null): Promise<string | null>;
  links(links: ProfileSocial[]): Promise<ProfileSocial[]>;
  visibility(visibility: RoundsVisibility): Promise<void>;
}


async function send(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const reply = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !reply?.ok) throw new Error(typeof reply?.error === "string" ? reply.error : "Couldn't save that. Try again.");
  return reply;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The live account's savers (the same routes Settings uses, plus /api/account/links). */
const ACCOUNT: EditProfileSavers = {
  async profile(body) { await send("/api/account/profile", json("PATCH", body)); },
  async photo(file) {
    if (!file) { await send("/api/account/photo", { method: "DELETE" }); return null; }
    const form = new FormData();
    form.append("photo", file);
    const reply = await send("/api/account/photo", { method: "POST", body: form });
    return typeof reply.url === "string" ? reply.url : null;
  },
  async links(links) { return (await send("/api/account/links", json("PUT", { links: links.map(({ platform, url }) => ({ platform, url })) }))).links as ProfileSocial[]; },
  async visibility(visibility) { await send("/api/account/privacy", json("PUT", { visibility })); },
};

/**
 * Edit profile (owner request 2026-11-13, Instagram's layout): back | Edit profile | Save; photo + avatar circles; rows for
 * Name, Username, Bio (typed in place), Socials and Gender (their own screens), then the Private profile switch.
 * Save (dim until something changes) saves Name / Username / Bio / Gender together. Photo, Socials and Private profile save the moment they change.
 */
export function EditProfileScreen({ initial, backHref = "/profile", savers = ACCOUNT }: { initial: EditProfileInitial; backHref?: string; savers?: EditProfileSavers }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [gender, setGender] = useState<Gender | "">(initial.gender);
  const [links, setLinks] = useState(initial.links);
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [panel, setPanel] = useState<null | "links" | "gender" | "picture" | "discard">(null);
  const [busy, setBusy] = useState<null | "save" | "photo" | "visibility">(null);
  const [error, setError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null); // the original, while Move and scale is open
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked); }, [picked]);

  const usernameChanged = username.trim() !== initial.username;
  const changes: ProfileEditInput = {
    ...(displayName.trim() !== initial.displayName.trim() && { displayName }),
    ...(usernameChanged && { username: username.trim() }),
    ...(initial.bioAvailable && bio.trim() !== initial.bio.trim() && { bio }),
    ...(initial.genderAvailable && gender !== initial.gender && { gender }),
  };
  const dirty = Object.keys(changes).length > 0;

  function leave() { router.push(backHref); router.refresh(); }

  async function save() {
    if (!dirty) return;
    const problem = nameProblem(displayName) ?? (usernameChanged ? usernameProblem(username.trim()) : null);
    if (problem) { setError(problem); return; }
    setBusy("save"); setError("");
    try { await savers.profile(changes); leave(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Couldn't save your profile. Try again."); setBusy(null); }
  }

  async function changePhoto(file: File | null) {
    setPanel(null);
    if (file && file.size > 3 * 1024 * 1024) { setError("That photo is too big. Use one under 3 MB."); return; }
    setBusy("photo"); setError("");
    try { setPhotoUrl(await savers.photo(file)); router.refresh(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Couldn't change your photo. Try again."); }
    finally { setBusy(null); if (photoInput.current) photoInput.current.value = ""; }
  }

  async function toggleVisibility() {
    if (!visibility || busy) return;
    const previous = visibility;
    const next = visibility === "private" ? "public" : "private";
    setVisibility(next); setBusy("visibility"); setError("");
    try { await savers.visibility(next); }
    catch (problem) { setVisibility(previous); setError(problem instanceof Error ? problem.message : "We couldn't save that. Try again."); }
    finally { setBusy(null); }
  }

  const name = displayName.trim() || username.trim() || "?";
  return <main className={`${styles.page} app-own-top-clearance`}>
    <div className={styles.inner}>
      <header className={styles.topBar}>
        <button type="button" className={styles.iconButton} aria-label="Back" onClick={() => dirty ? setPanel("discard") : router.push(backHref)}><ChevronLeft size={28} aria-hidden="true" /></button>
        <h1 className={styles.title}>Edit profile</h1>
        <button type="button" className={`${styles.done} ${styles.save}`} onClick={() => void save()} disabled={!dirty || busy === "save"}>{busy === "save" ? "Saving…" : "Save"}</button>
      </header>

      <section className={styles.pictures} aria-label="Picture and avatar">
        <div className={styles.circles}>
          {photoUrl ? <ProfileAvatar name={name} photoUrl={photoUrl} size={92} /> : <span className={styles.emptyPhoto} aria-hidden="true"><Camera size={28} /></span>}
          <ProfileAvatar name={name} size={92} photo={false} />
        </div>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) setPicked(URL.createObjectURL(file)); }} />
        {picked && <PhotoCropper imageUrl={picked} onCancel={() => setPicked(null)} onDone={(framed) => { setPicked(null); void changePhoto(framed); }} />}
        <button type="button" className={styles.editPicture} onClick={() => setPanel("picture")} disabled={busy === "photo"}>{busy === "photo" ? "Saving photo…" : "Edit picture or avatar"}</button>
        {!initial.photoAvailable && <p className={styles.soon}>Profile photos are coming soon.</p>}
      </section>

      <ul className={styles.rows}>
        <li className={styles.row}>
          <label className={styles.label} htmlFor="edit-name">Name</label>
          <div className={styles.value}><input id="edit-name" className={styles.input} value={displayName} maxLength={NAME_MAX} autoComplete="name" placeholder="Name" onChange={(e) => setDisplayName(e.target.value)} /></div>
        </li>
        <li className={styles.row}>
          <label className={styles.label} htmlFor="edit-username">Username</label>
          <div className={styles.valueStack}>
            <input id="edit-username" className={styles.input} value={username} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Username" onChange={(e) => setUsername(e.target.value)} aria-describedby={usernameChanged ? "edit-username-rule" : undefined} />
            {usernameChanged && <p id="edit-username-rule" className={styles.hint}>{USERNAME_RULE}</p>}
          </div>
        </li>
        {initial.bioAvailable && <li className={styles.row}>
          <label className={styles.label} htmlFor="edit-bio">Bio</label>
          <div className={styles.valueStack}>
            <textarea id="edit-bio" className={`${styles.input} ${styles.bio}`} rows={3} value={bio} maxLength={BIO_MAX} placeholder="Bio" onChange={(e) => setBio(limitBio(e.target.value))} aria-describedby="edit-bio-count" />
            <p id="edit-bio-count" className={styles.hint}>{bio.length} / {BIO_MAX}</p>
          </div>
        </li>}
        {initial.linksAvailable && <li>
          <button type="button" className={styles.navRow} onClick={() => setPanel("links")}>
            <span>Socials</span><span className={styles.navCount}>{links.length} of {SOCIALS_MAX}</span><ChevronRight size={20} aria-hidden="true" />
          </button>
        </li>}
        {initial.genderAvailable && <li>
          <button type="button" className={styles.navRow} onClick={() => setPanel("gender")}>
            <span>Gender</span><span className={`${styles.navValue} ${gender ? "" : styles.placeholder}`}>{genderLabel(gender) || "Not set"}</span><ChevronRight size={20} aria-hidden="true" />
          </button>
        </li>}
      </ul>

      {visibility && <div className={styles.toggleRow}>
        <div>
          <p className={styles.toggleTitle} id="edit-private">Private profile</p>
          <p className={styles.toggleText}>{PRIVACY_EXPLAIN[visibility]}</p>
        </div>
        <button type="button" role="switch" className={styles.switch} aria-checked={visibility === "private"} aria-labelledby="edit-private" onClick={() => void toggleVisibility()} disabled={busy === "visibility"} />
      </div>}
    </div>

    {error && <p role="alert" className={styles.toast} onClick={() => setError("")}>{error}</p>}

    {panel === "picture" && <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
      <div className={styles.sheet} role="dialog" aria-label="Edit picture or avatar">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <p className={styles.sheetTitle}>Picture or avatar</p>
        <p className={styles.sheetText}>Your avatar is your initials. It shows anywhere you don&apos;t have a photo.</p>
        <button type="button" className={styles.sheetButton} disabled={!initial.photoAvailable} onClick={() => { setPanel(null); photoInput.current?.click(); }}><Camera size={18} aria-hidden="true" /> {photoUrl ? "Change photo" : "Add a photo"}</button>
        {photoUrl && <button type="button" className={`${styles.sheetButton} ${styles.danger}`} onClick={() => void changePhoto(null)}><Trash2 size={18} aria-hidden="true" /> Remove photo</button>}
        <button type="button" className={styles.sheetButton} onClick={() => setPanel(null)}>Cancel</button>
      </div>
    </div>}

    {panel === "discard" && <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
      <div className={styles.sheet} role="alertdialog" aria-label="Discard changes?">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <p className={styles.sheetTitle}>Discard changes?</p>
        <p className={styles.sheetText}>Your changes to name, username, bio or gender won&apos;t be saved.</p>
        <button type="button" className={`${styles.sheetButton} ${styles.danger}`} onClick={() => router.push(backHref)}>Discard</button>
        <button type="button" className={styles.sheetButton} onClick={() => setPanel(null)}>Keep editing</button>
      </div>
    </div>}

    {panel === "gender" && <div className={styles.panel} role="dialog" aria-label="Gender">
      <div className={styles.topBar}>
        <button type="button" className={styles.iconButton} aria-label="Back to Edit profile" onClick={() => setPanel(null)}><ChevronLeft size={28} aria-hidden="true" /></button>
        <h2 className={styles.title}>Gender</h2><span />
      </div>
      <p className={styles.panelIntro}>This won&apos;t be part of your public profile. Only you can see it. It saves when you tap Save.</p>
      <ul className={styles.options}>
        {GENDERS.map((option) => <li key={option.value}>
          <button type="button" className={styles.option} aria-pressed={gender === option.value} onClick={() => { setGender(option.value); setPanel(null); }}>
            {option.label}{gender === option.value && <Check size={20} aria-hidden="true" />}
          </button>
        </li>)}
      </ul>
    </div>}

    {panel === "links" && <SocialsPanel initial={links} save={savers.links} onClose={(saved) => { if (saved) { setLinks(saved); router.refresh(); } setPanel(null); }} />}
  </main>;
}

/**
 * Edit profile → Socials (project_specs.md "Profile socials"): up to 4, one per app. The list (icon, @name, remove) and
 * + Add social → pick an app → type the username (or paste the profile link) → Save. Every add / remove saves right away.
 */
function SocialsPanel({ initial, save, onClose }: { initial: ProfileSocial[]; save: (links: ProfileSocial[]) => Promise<ProfileSocial[]>; onClose: (saved: ProfileSocial[] | null) => void }) {
  const [socials, setSocials] = useState(initial);
  const [step, setStep] = useState<"list" | "pick" | SocialPlatform>("list");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const used = new Set(socials.map((s) => s.platform));

  async function store(next: ProfileSocial[]) {
    setSaving(true); setError("");
    try { setSocials(await save(next)); setStep("list"); setTyped(""); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Couldn't save your socials. Try again."); }
    finally { setSaving(false); }
  }
  function add(platform: SocialPlatform) {
    const result = socialFromInput(platform, typed);
    if (!result.ok) { setError(result.error); return; }
    void store([...socials, result.social]);
  }
  const back = () => { setError(""); if (step === "list") onClose(socials); else setStep(step === "pick" ? "list" : "pick"); };

  const title = step === "list" ? "Socials" : step === "pick" ? "Add social" : socialLabel(step);
  return <div className={styles.panel} role="dialog" aria-label={title}>
    <div className={styles.topBar}>
      <button type="button" className={styles.iconButton} aria-label={step === "list" ? "Back to Edit profile" : "Back"} onClick={back}><ChevronLeft size={28} aria-hidden="true" /></button>
      <h2 className={styles.title}>{title}</h2>
      {step !== "list" && step !== "pick"
        ? <button type="button" className={`${styles.done} ${styles.save}`} onClick={() => add(step)} disabled={saving || !typed.trim()}>{saving ? "Saving…" : "Save"}</button>
        : <span />}
    </div>

    {step === "list" && <>
      <p className={styles.panelIntro}>Up to {SOCIALS_MAX}. They show on your profile under your bio, two across.</p>
      <ul className={styles.options}>
        {socials.map((social) => <li key={social.platform} className={styles.socialRow}>
          <span className={styles.socialIcon}><SocialIcon platform={social.platform} /></span>
          <span className={styles.socialText}><span>{socialLabel(social.platform)}</span><span className={styles.socialHandle}>{socialDisplay(social)}</span></span>
          <button type="button" className={`${styles.iconButton} ${styles.remove}`} aria-label={`Remove ${socialLabel(social.platform)}`} disabled={saving}
            onClick={() => void store(socials.filter((s) => s.platform !== social.platform))}><Trash2 size={18} aria-hidden="true" /></button>
        </li>)}
      </ul>
      <button type="button" className={styles.addLink} disabled={socials.length >= SOCIALS_MAX || saving} onClick={() => { setError(""); setStep("pick"); }}>
        <Plus size={18} aria-hidden="true" /> {socials.length >= SOCIALS_MAX ? `${SOCIALS_MAX} socials is the most` : "Add social"}
      </button>
    </>}

    {step === "pick" && <ul className={styles.options}>
      {SOCIAL_PLATFORMS.filter((p) => !used.has(p.id)).map((p) => <li key={p.id}>
        <button type="button" className={styles.option} onClick={() => { setTyped(""); setError(""); setStep(p.id); }}>
          <span className={styles.socialPick}><span className={styles.socialIcon}><SocialIcon platform={p.id} /></span>{p.label}</span><ChevronRight size={20} aria-hidden="true" />
        </button>
      </li>)}
    </ul>}

    {step !== "list" && step !== "pick" && <>
      <form className={styles.socialEntry} onSubmit={(e) => { e.preventDefault(); add(step); }}>
        <span className={styles.socialIcon}><SocialIcon platform={step} size={22} /></span>
        <input className={styles.input} autoFocus value={typed} inputMode={step === "website" ? "url" : "text"} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder={socialHint(step)} aria-label={`${socialLabel(step)}: ${socialHint(step)}`} onChange={(e) => setTyped(e.target.value)} />
      </form>
      <p className={styles.panelIntro}>{step === "website" ? "Type your website's address." : `Type your ${socialLabel(step)} username, or paste the link to your profile.`}</p>
    </>}

    {error && <p role="alert" className={styles.toast} onClick={() => setError("")}>{error}</p>}
  </div>;
}
