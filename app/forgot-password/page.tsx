import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { legacyAuthRedirect } from "@/lib/account/legacyAuthRedirect";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // MAROON_V2_ONBOARDING=on: the V2 forgot-password screen replaces this page (lib/account/legacyAuthRedirect.ts).
  if (onboardingEnabled()) redirect(legacyAuthRedirect("/forgot-password", {}, { signedIn: false })!);
  return <ForgotPasswordForm />;
}
