import { SignUpForm } from "@/components/auth/SignUpForm";
import { inviteReturnPath } from "@/lib/auth/returnTo";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const { code, next } = await searchParams;
  // From a Golf Trip invite: after verifying, signing in returns to the invite (only invite pages are allowed).
  return <SignUpForm initialCode={code} returnTo={inviteReturnPath(next)} />;
}
