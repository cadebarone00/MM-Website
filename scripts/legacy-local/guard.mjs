// Safety rules shared by every scripts/legacy-local/* script (docs/account-retirement-architecture-2026-10-30.md).
// Pure functions only (no network, no Docker), so they are unit tested in guard.test.mjs.
//
// The local legacy-testing copy ("maroon-legacy") is a separate local Supabase stack in Docker: its own project id,
// ports 57xxx and workdir out/legacy-local. It never talks to a hosted project, and nothing here reads .env files.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const LEGACY = {
  project: "maroon-legacy",
  ports: "57",
  workdir: join("out", "legacy-local"),
  dbContainer: "supabase_db_maroon-legacy",
  api: "http://127.0.0.1:57321",
  appPort: 3998,
};

// Hosted projects the legacy copy must never touch. Project ids are not secrets (they are in every public URL).
export const FORBIDDEN_REFS = {
  msvrbifhdvltibafzrdb: "production",
  llqqddiundaptmsgccwj: "maroon-auth-dev",
};

// Settings that would let the legacy app reach a real person or a real service. The legacy app starts with every one
// of these forced to an empty value (start-app.mjs), and refuses to start if one is set in its own settings file.
export const OUTBOUND_SETTINGS = [
  "RESEND_API_KEY", "EMAIL_FROM",                                                     // email
  "NEXT_PUBLIC_WEB_PUSH_VAPID_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT", "TRIP_PUSH_DELIVERY",
  "CRON_SECRET",                                                                       // scheduled jobs
  "LIVE_FEED_URL", "SCOREKEEPER_SERVER_SECRET", "PYTHON_API_URL", "PYTHON_API_SECRET", // Google Sheet / Scorekeeper
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL",
  "OPENAI_API_KEY", "GOOGLE_PLACES_API_KEY", "NWS_CONTACT", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
  "FLIGHT_DATA_API_KEY", "TEE_TIME_API_KEY", "YELP_API_KEY", "INSTAGRAM_ACCESS_TOKEN",
];

/** Problems with a set of values that point somewhere: any hosted Supabase address or a forbidden project id. */
export function hostedTargetProblems(values) {
  const problems = [];
  for (const [name, raw] of Object.entries(values)) {
    const value = String(raw ?? "");
    if (!value) continue;
    for (const [ref, label] of Object.entries(FORBIDDEN_REFS)) {
      if (value.includes(ref)) problems.push(`${name} points at the ${label} project (${ref})`);
    }
    if (/supabase\.(co|in|com)\b|pooler\.supabase|\.supabase\.net/i.test(value)) problems.push(`${name} points at a hosted Supabase address`);
  }
  return problems;
}

/** The legacy app may only use the local legacy stack's API. */
export function legacyApiProblems(url) {
  if (url !== LEGACY.api) return [`Supabase URL must be exactly ${LEGACY.api} (the local maroon-legacy stack)`];
  return [];
}

/** Settings from OUTBOUND_SETTINGS that have a non-empty value. */
export function outboundSettingsPresent(env) {
  return OUTBOUND_SETTINGS.filter((key) => String(env[key] ?? "").trim() !== "");
}

const SYNCED_FOLDER = /(^|[\\/])(OneDrive[^\\/]*|Dropbox|Google Drive|GoogleDrive|My Drive|iCloud ?Drive|iCloudDrive|Box|Box Sync)([\\/]|$)/i;

/**
 * Where backups (personal data) may be written. Must be an absolute folder that is not inside a Git working copy and
 * not inside a cloud-synced folder (OneDrive / Dropbox / Google Drive / iCloud / Box). Encryption of the drive itself
 * is the owner's check (BitLocker / VeraCrypt); this cannot see it. Returns the resolved folder or throws.
 */
export function safeBackupDir(dir, env = process.env, exists = existsSync) {
  if (!dir || !String(dir).trim()) throw new Error("Set MAROON_BACKUP_DIR to an absolute folder on an encrypted drive, outside Git and outside cloud-synced folders.");
  if (!isAbsolute(dir)) throw new Error("MAROON_BACKUP_DIR must be an absolute path (for example D:\\MaroonBackups).");
  const folder = resolve(dir);
  if (SYNCED_FOLDER.test(folder)) throw new Error("MAROON_BACKUP_DIR is inside a cloud-synced folder. Choose a folder outside OneDrive / Dropbox / Google Drive / iCloud / Box.");
  for (const key of ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]) {
    const synced = env[key];
    if (synced && isInside(folder, resolve(synced))) throw new Error(`MAROON_BACKUP_DIR is inside ${key} (${synced}). Choose a folder outside it.`);
  }
  for (let at = folder; ; at = dirname(at)) {
    if (exists(join(at, ".git"))) throw new Error(`MAROON_BACKUP_DIR is inside a Git working copy (${at}). Choose a folder outside every repository.`);
    if (dirname(at) === at) break;
  }
  return folder;
}

export function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel) && !rel.startsWith(`..${sep}`));
}

/** "--confirm maroon-legacy" must be typed for anything that starts, restores into, changes or deletes the copy. */
export function confirmed(args, word = LEGACY.project) {
  const at = args.indexOf("--confirm");
  return at >= 0 && args[at + 1] === word;
}
