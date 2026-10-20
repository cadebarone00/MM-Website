import { LoginForm } from "@/components/auth/LoginForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

import { authReturnPath } from "@/lib/auth/returnTo";

export default async function EmailLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthLayout><LoginForm returnTo={authReturnPath(next)} /></AuthLayout>;
}
