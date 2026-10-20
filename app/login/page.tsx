import { LoginWelcome } from "@/components/auth/LoginWelcome";

export const metadata = { title: "Log In | The Maroon" };

import { authReturnPath } from "@/lib/auth/returnTo";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginWelcome returnTo={authReturnPath(next)} />;
}
