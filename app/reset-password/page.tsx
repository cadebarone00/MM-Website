import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

import { authReturnPath } from "@/lib/auth/returnTo";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <ResetPasswordForm returnTo={authReturnPath(next)} />;
}
