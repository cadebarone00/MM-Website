import { SignUpForm } from "@/components/auth/SignUpForm";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <SignUpForm initialCode={code} />;
}
