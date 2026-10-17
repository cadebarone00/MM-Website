// Accounts Step 3b: what Supabase Auth hard delete vs soft delete actually do, on the ISOLATED local stack only.
//   node scripts/auth-local/setup.mjs
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/deletion-probe.mts
// Test tooling only (no app or migration change). Records observations; prints FINDING lines for the report.
import { randomUUID } from "node:crypto";
import { addr, admin, anon, API, authVersion, browser, call, confirmByEmail, profile, q, account, requestCount, sql, status } from "./harness.mts";
import { createClient } from "@supabase/supabase-js";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../../lib/platform/golfTripCreate.ts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: initializePOST } = await import("../../app/api/account/initialize/route.ts");
const { GET: passwordSessionGET } = await import("../../app/api/auth/password-session/route.ts");

const out = (label: string, value: unknown) => console.log(`   ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
const BUCKET = "deletion-probe";

// Local-only fixture: a bucket signed-in users may upload their own files to (owner = their id).
await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
sql(`drop policy if exists deletion_probe_insert on storage.objects;
     create policy deletion_probe_insert on storage.objects for insert to authenticated with check (bucket_id = '${BUCKET}');
     drop policy if exists deletion_probe_select on storage.objects;
     create policy deletion_probe_select on storage.objects for select to authenticated using (bucket_id = '${BUCKET}' and owner_id = auth.uid()::text);`);

/** A verified, signed-in V2 user with: complete profile, a trip they created, an uploaded file, live tokens. */
async function seededUser(name: string, opts: { blocker?: boolean } = {}) {
  const email = addr(name), password = "probe-password-1";
  await call(browser(), signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  const webJar = browser();
  await call(webJar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password });
  const id = account(email)!.id;
  sql(`update public.profiles set username = ${q(`${name.replace(/-/g, "_")}_${Date.now() % 100000}`)}, display_name = 'Probe Person' where id = ${q(id)}`);
  const draft = { requestId: randomUUID(), tripName: "Probe Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
    playerCount: "8", yourName: "Probe", yourEmail: "probe@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
    includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
  const payload = (golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload }).payload;
  const trip = ((await admin.rpc("create_golf_trip", { p_profile: id, p_input: payload })).data as { tripId: string }).tripId;
  if (opts.blocker) sql(`insert into public.scoring_groups (source, group_number, created_by) values ('personal', 1, ${q(id)})`);
  const client = anon();
  const { data: { session } } = await client.auth.signInWithPassword({ email, password });
  const user = createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session!.access_token}` } } });
  const upload = await user.storage.from(BUCKET).upload(`${id}/avatar.txt`, new Blob(["probe"]), { upsert: true });
  return { email, password, id, trip, session: session!, webJar, uploadError: upload.error?.message ?? null };
}

/** Everything that tells us what is left of the account, without printing secrets. */
function authState(id: string) {
  const row = sql(`select deleted_at is not null, coalesce(email,'<null>'), coalesce(phone,'<null>'), encrypted_password is not null and encrypted_password <> '',
    raw_user_meta_data::text, raw_app_meta_data::text, coalesce(banned_until::text,'<null>'), confirmed_at is not null, is_sso_user
    from auth.users where id = ${q(id)}`);
  const counts = sql(`select (select count(*) from auth.identities where user_id = ${q(id)}), (select count(*) from auth.sessions where user_id = ${q(id)}),
    (select count(*) from auth.refresh_tokens where user_id = ${q(id)}::text and not revoked), (select count(*) from auth.one_time_tokens where user_id = ${q(id)})`).split("|");
  if (!row) return { userRow: "GONE", identities: counts[0], sessions: counts[1], liveRefreshTokens: counts[2], oneTimeTokens: counts[3] };
  const [deleted, email, phone, hasPassword, meta, appMeta, banned, confirmed, sso] = row.split("|");
  return { userRow: "present", softDeleted: deleted === "t", email, phone, passwordHashKept: hasPassword === "t", userMetadata: meta, appMetadata: appMeta,
    banned, confirmedKept: confirmed === "t", sso, identities: counts[0], sessions: counts[1], liveRefreshTokens: counts[2], oneTimeTokens: counts[3] };
}
const ownedObjects = (id: string) => sql(`select count(*) from storage.objects where bucket_id = '${BUCKET}' and owner_id = ${q(id)}`);

/** What an attacker or the person could still do with leftovers after deletion. */
async function afterEffects(u: Awaited<ReturnType<typeof seededUser>>) {
  const withToken = createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${u.session.access_token}` } } });
  const getUser = await anon().auth.getUser(u.session.access_token);
  const rest = await withToken.from("profiles").select("id").eq("id", u.id);
  const storageRead = await withToken.storage.from(BUCKET).download(`${u.id}/avatar.txt`);
  const storageWrite = await withToken.storage.from(BUCKET).upload(`${u.id}/after.txt`, new Blob(["x"]), { upsert: true });
  const refresh = await anon().auth.refreshSession({ refresh_token: u.session.refresh_token });
  const bearerApp = await call(browser(), initializePOST, "/api/account/initialize", {}, { headers: { authorization: `Bearer ${u.session.access_token}` } });
  const cookieApp = await call(u.webJar, passwordSessionGET, "/api/auth/password-session", undefined, { method: "GET" });
  const relogin = await anon().auth.signInWithPassword({ email: u.email, password: u.password });
  const otp = await anon().auth.signInWithOtp({ email: u.email, options: { shouldCreateUser: false } });
  const recovery = await anon().auth.resetPasswordForEmail(u.email);
  const adminGet = await admin.auth.admin.getUserById(u.id);
  const revive = await admin.auth.admin.updateUserById(u.id, { ban_duration: "none" });
  await new Promise((r) => setTimeout(r, 1600));
  const resignup = await anon().auth.signUp({ email: u.email, password: "brand-new-password-1" });
  const newId = resignup.data.user?.id ?? null;
  return {
    oldAccessToken_getUser: getUser.error ? `refused (${getUser.error.message})` : "STILL VALID",
    oldAccessToken_RESTreadsOwnProfile: rest.error ? `refused (${rest.error.message})` : `${rest.data?.length ?? 0} row(s) returned`,
    oldAccessToken_storageRead: storageRead.error ? `refused (${storageRead.error.message})` : "STILL READS FILE",
    oldAccessToken_storageWrite: storageWrite.error ? `refused (${storageWrite.error.message})` : "STILL WRITES FILE",
    oldRefreshToken: refresh.error ? `refused (${refresh.error.message})` : "STILL REFRESHES",
    app_bearerPathway: `${bearerApp.status} ${JSON.stringify(bearerApp.json)}`,
    app_cookieSession: `${cookieApp.status} ${JSON.stringify(cookieApp.json)}`,
    passwordLogin: relogin.error ? `refused (${relogin.error.message})` : "STILL SIGNS IN",
    magicLinkOtp: otp.error ? `refused (${otp.error.message})` : "sent (account still reachable by email)",
    passwordRecoveryEmail: recovery.error ? `refused (${recovery.error.message})` : "accepted (no error; may be silent)",
    adminGetUser: adminGet.error ? `not found (${adminGet.error.message})` : `found (deleted_at ${adminGet.data.user?.deleted_at ?? "none"})`,
    adminUpdateUser: revive.error ? `refused (${revive.error.message})` : "ACCEPTED (row can be modified)",
    sameEmailSignsUpAgain: resignup.error ? `refused (${resignup.error.message})` : newId ? (newId === u.id ? "SAME UUID REUSED" : "yes, NEW uuid") : "no user returned",
  };
}

console.log(`Supabase Auth ${await authVersion()} — isolated stack ${API}\n`);

for (const method of ["hard", "soft"] as const) {
  console.log(`=== ${method.toUpperCase()} DELETE — user with profile, created trip, uploaded file, live tokens (no blockers)`);
  const u = await seededUser(`${method}-plain`);
  out("upload as the user", u.uploadError ?? "ok");
  out("before: owned files / trip rows / profile", `${ownedObjects(u.id)} / ${sql(`select count(*) from public.golf_trips where id = ${q(u.trip)}`)} / ${!!profile(u.id)}`);
  const del = await admin.auth.admin.deleteUser(u.id, method === "soft");
  out("deleteUser", del.error ? `ERROR ${del.error.message}` : "ok");
  out("auth state", authState(u.id));
  out("profile row", profile(u.id) ? "KEPT" : "gone (cascade)");
  out("trip they created", sql(`select count(*) from public.golf_trips where id = ${q(u.trip)}`) === "1" ? "KEPT" : "GONE (cascade wiped the trip)");
  out("their storage objects", `${ownedObjects(u.id)} left (owner_id still = old uuid)`);
  out("after effects", await afterEffects(u));

  console.log(`\n=== ${method.toUpperCase()} DELETE — user with a NO ACTION blocker (scoring_groups.created_by)`);
  const b = await seededUser(`${method}-blocked`, { blocker: true });
  const delB = await admin.auth.admin.deleteUser(b.id, method === "soft");
  out("deleteUser", delB.error ? `ERROR ${delB.error.message}` : "ok");
  out("auth state", authState(b.id));
  out("profile / trip / scoring group", `${profile(b.id) ? "kept" : "gone"} / ${sql(`select count(*) from public.golf_trips where id = ${q(b.trip)}`) === "1" ? "kept" : "gone"} / ${sql(`select count(*) from public.scoring_groups where created_by = ${q(b.id)}`)}`);
  if (delB.error) {
    const tokenStillWorks = await anon().auth.getUser(b.session.access_token);
    out("after FAILED delete: old token", tokenStillWorks.error ? "refused" : "still valid (account fully intact)");
    out("after FAILED delete: password login", (await anon().auth.signInWithPassword({ email: b.email, password: b.password })).error ? "refused" : "still works");
  }
  console.log("");
}

{ // Can a soft-deleted account be hard-deleted afterwards (two-phase cleanup)?
  console.log("=== SOFT then HARD delete (two-phase)");
  const u = await seededUser("two-phase");
  await admin.auth.admin.deleteUser(u.id, true);
  const hard = await admin.auth.admin.deleteUser(u.id, false);
  out("hard delete after soft delete", hard.error ? `ERROR ${hard.error.message}` : "ok");
  out("auth row", sql(`select count(*) from auth.users where id = ${q(u.id)}`) === "0" ? "gone" : "present");
  out("profile", profile(u.id) ? "kept" : "gone (cascade)");
}

{ // Is a soft-deleted account recoverable? (requirement: a retained profile must not be a recoverable account)
  console.log("\n=== SOFT DELETE then admin update (recoverability)");
  const u = await seededUser("revive");
  await admin.auth.admin.deleteUser(u.id, true);
  const newEmail = addr("revived"), newPassword = "revived-password-2";
  const upd = await admin.auth.admin.updateUserById(u.id, { email: newEmail, password: newPassword, email_confirm: true });
  out("admin updateUserById(email + password) on the soft-deleted row", upd.error ? `refused (${upd.error.message})` : "accepted");
  const login = await anon().auth.signInWithPassword({ email: newEmail, password: newPassword });
  out("sign in afterwards", login.error ? `refused (${login.error.message})` : `SIGNED IN with the same uuid: ${login.data.user?.id === u.id} (account REVIVED)`);
  const lifetime = JSON.parse(Buffer.from(u.session.access_token.split(".")[1], "base64url").toString()).exp - Math.floor(Date.now() / 1000);
  out("access-token lifetime still left on the deleted user's token (s)", lifetime);
}

{ // Global sign-out before deletion: does revoking sessions kill the outstanding access token?
  console.log("\n=== GLOBAL SIGN-OUT (no delete)");
  const u = await seededUser("signout");
  const out1 = await admin.auth.admin.signOut(u.session.access_token, "global");
  out("admin signOut(global)", out1.error ? `ERROR ${out1.error.message}` : "ok");
  out("sessions / live refresh tokens", `${sql(`select count(*) from auth.sessions where user_id = ${q(u.id)}`)} / ${sql(`select count(*) from auth.refresh_tokens where user_id = ${q(u.id)}::text and not revoked`)}`);
  const g = await anon().auth.getUser(u.session.access_token);
  out("old access token via getUser", g.error ? `refused (${g.error.message})` : "STILL VALID");
  const withToken = createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${u.session.access_token}` } } });
  const rest = await withToken.from("profiles").select("id").eq("id", u.id);
  out("old access token via REST (own profile)", rest.error ? `refused (${rest.error.message})` : `${rest.data?.length ?? 0} row(s)`);
  out("refresh", (await anon().auth.refreshSession({ refresh_token: u.session.refresh_token })).error ? "refused" : "STILL REFRESHES");
}

console.log(`\n${requestCount()} network requests, all to 127.0.0.1.`);
