import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SimulatorBridge } from "@/components/dev/SimulatorBridge";

export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SimulatorBridge>{children}</SimulatorBridge>;
}
