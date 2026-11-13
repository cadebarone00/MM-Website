import Link from "next/link";
import { AuthLayout } from "./AuthLayout";
import { START } from "@/lib/account/onboardingRoutes";
import type { AccountLifecycle } from "@/lib/profile/currentProfile";

/**
 * What the account-status screen says for each account state (shared by the website's /account/status and the
 * iPhone / Android app's). Shows nothing private: no birthday, age or reason. `ineligibleNotice`: the under-13 message
 * after the Birthday step signed out. `v2`: the real onboarding screens are on (log-in links go to them).
 */
export function AccountStatusView({ state, ineligibleNotice, v2 }: { state: AccountLifecycle["state"]; ineligibleNotice: boolean; v2: boolean }) {
  const lifecycle = { state };
  const support = <p>Questions? Email <a href="mailto:themaroonadmin@gmail.com">themaroonadmin@gmail.com</a>.</p>;
  let body;
  switch (lifecycle.state) {
    case "signed-out":
      body = ineligibleNotice
        ? <><h1>This account can&apos;t use The Maroon</h1><p>The Maroon is for people 13 and older.</p>
          <p>If your birthday was entered wrong, log in again to ask for a correction, or to delete this account.</p>{support}</>
        : <><h1>Log in</h1><p>Log in to continue.</p><Link href={v2 ? START.logIn : "/login"}>Log in</Link></>;
      break;
    case "active":
      body = <><h1>You&apos;re all set</h1><Link href="/">Go to Play</Link></>;
      break;
    case "pending":
      body = <><h1>Finish setting up your account</h1><p>A few steps are left before you can play. Your progress is saved.</p>{support}</>;
      break;
    case "active_needs_birthday":
      body = <><h1>Add your birthday</h1><p>We need your date of birth before you can keep playing. Your golf history is safe.</p>{support}</>;
      break;
    case "ineligible":
      body = <><h1>This account can&apos;t use The Maroon</h1><p>The Maroon is for people 13 and older.</p>
        <p>If your birthday was entered wrong, you can ask for a correction, or delete this account.</p>
        <Link href="/settings/delete-account">Delete this account</Link>{support}</>;
      break;
    case "restricted":
      body = <><h1>Your account is being reviewed</h1><p>We&apos;ll be in touch.</p>{support}</>;
      break;
    case "deleted":
      body = <><h1>This account is closed</h1><Link href="/login">Log in with another account</Link></>;
      break;
    default:
      body = <><h1>We couldn&apos;t check your account</h1><p>Something went wrong on our side. Try again in a moment.</p>
        <Link href="/account/status">Try again</Link>{support}</>;
  }
  return <AuthLayout>{body}</AuthLayout>;
}
