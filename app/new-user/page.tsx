import type { Metadata } from "next";
import { LoginWelcome } from "@/components/auth/LoginWelcome";

export const metadata: Metadata = { title: "Welcome | The Maroon" };

export default function NewUserPage() {
  return <LoginWelcome />;
}
