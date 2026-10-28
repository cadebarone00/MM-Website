import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AUTH_SCREENS } from "@/lib/dev/authScreens";
import { AuthLogInPreview, AuthSignUpPreview, AuthWelcomePreview } from "@/components/dev/auth/AuthWelcomePreview";
import { AuthCodePreview } from "@/components/dev/auth/AuthCodePreview";
import { AuthNamePreview } from "@/components/dev/auth/AuthNamePreview";
import { AuthPasswordPreview } from "@/components/dev/auth/AuthPasswordPreview";
import { AuthLinkResultPreview } from "@/components/dev/auth/AuthLinkResultPreview";
import { AuthPhotoPreview } from "@/components/dev/auth/AuthPhotoPreview";
import { AuthBirthdayPreview } from "@/components/dev/auth/AuthBirthdayPreview";
import { AuthSettingsPreview } from "@/components/dev/auth/AuthSettingsPreview";
import { AuthProfileCreatedPreview } from "@/components/dev/auth/AuthProfileCreatedPreview";
import { AuthForgotPreview } from "@/components/dev/auth/AuthForgotPreview";

export const metadata: Metadata = { title: "Authentication preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: placeholder for each account screen until it is designed (lib/dev/authScreens.ts). */
export default async function DevAuthScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { screen } = await params;
  const index = AUTH_SCREENS.findIndex(([slug]) => slug === screen);
  if (index < 0) notFound();
  if (screen === "welcome") return <AuthWelcomePreview />;
  if (screen === "sign-up") return <AuthSignUpPreview />;
  if (screen === "sign-in") return <AuthLogInPreview />;
  if (screen === "password") return <AuthPasswordPreview />;
  if (screen === "link-result") return <AuthLinkResultPreview />;
  if (screen === "name-username") return <AuthNamePreview />;
  if (screen === "age-check") return <AuthBirthdayPreview />;
  if (screen === "photo") return <AuthPhotoPreview />;
  if (screen === "settings") return <AuthSettingsPreview />;
  if (screen === "profile-created") return <AuthProfileCreatedPreview />;
  if (screen === "forgot-password") return <AuthForgotPreview />;
  if (screen === "reset-code") return <AuthCodePreview title="Enter Code To Reset" nextHref="/dev/auth/reset-password" progress={false} />;
  if (screen === "reset-password") return <AuthPasswordPreview title="Set a new password" nextHref="/" buttonLabel="Save password" progress={false} />;
  if (screen === "verification-code") return <AuthCodePreview />;
  return <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", gap: 8, padding: 24, background: "#240001", color: "#fbf8f1", textAlign: "center", fontFamily: "var(--font-barlow), sans-serif" }}>
    <p style={{ margin: 0, fontSize: 14, color: "#e1cec4" }}>Screen {index + 1} of {AUTH_SCREENS.length}</p>
    <h1 style={{ margin: 0, font: "400 36px/1.2 var(--font-spectral), Georgia, serif" }}>{AUTH_SCREENS[index][1]}</h1>
    <p style={{ margin: 0, fontSize: 14, color: "#c9a86e" }}>Not designed yet</p>
  </main>;
}
