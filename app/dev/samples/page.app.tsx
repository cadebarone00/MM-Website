import { DevSamples } from "@/components/dev/DevSamples";

/** App → the samples page (dev server only). */
export default function DevSamplesAppPage() {
  return process.env.NODE_ENV === "development" ? <DevSamples /> : null;
}
