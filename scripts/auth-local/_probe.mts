import { addr, admin, anon, account, openLink, pastThrottle, latestLink, mailCount, sql, q } from "./harness.mts";
const email = addr("probe-invited");
await admin.auth.admin.inviteUserByEmail(email);
const before = account(email)!;
const pw = sql(`select coalesce(encrypted_password,'') <> '' from auth.users where id = ${q(before.id)}`);
await pastThrottle();
const r = await anon().auth.signUp({ email, password: "stranger-password-1" });
const after = account(email)!;
console.log("invited account had a password before:", pw);
console.log("signUp by stranger: error", r.error?.message ?? "none", "| same id", r.data.user?.id === before.id);
console.log("password set/changed by stranger's signup:", after.passwordFingerprint !== before.passwordFingerprint);
console.log("emails to that address:", await mailCount(email));
const inviteRedirect = await openLink(email, "invite").catch((e) => "ERR " + e.message);
console.log("old invite link ->", inviteRedirect.slice(0, 120));
const signupLink = await latestLink(email, "signup").then(() => "a signup-confirmation email exists", () => "no signup email");
console.log(signupLink);
const login = await anon().auth.signInWithPassword({ email, password: "stranger-password-1" });
console.log("stranger can sign in before anyone verifies:", !!login.data.session, login.error?.message ?? "");
if (signupLink.startsWith("a signup")) {
  await openLink(email, "signup");
  const after2 = await anon().auth.signInWithPassword({ email, password: "stranger-password-1" });
  console.log("after the REAL owner clicks the newest email, the stranger's password works:", !!after2.data.session, after2.error?.message ?? "");
}
