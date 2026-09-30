import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <AuthLayout><SignUpForm initialCode={code} /></AuthLayout>;
}
