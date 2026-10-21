import { SignUpForm } from "@/components/auth/SignUpForm";
import { authReturnPath } from "@/lib/auth/returnTo";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const { code, next } = await searchParams;
  // Website dashboard and existing invite returns are validated before reaching the signup form.
  return <SignUpForm initialCode={code} returnTo={authReturnPath(next)} />;
}
