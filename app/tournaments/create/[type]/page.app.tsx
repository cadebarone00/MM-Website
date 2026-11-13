import { SETUP_TYPES } from "@/lib/platform/setupTypes";
import { AppSetupNextStep } from "@/components/app/AppSetupNextStep";

/** App → Create → a type (Golf Trip: Welcome to Golf Trips → Get Started). One packaged page per type. */
export function generateStaticParams() {
  return SETUP_TYPES.map((type) => ({ type: type.key }));
}

export default async function AppSetupNextStepPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return <AppSetupNextStep param={type} />;
}
