import { redirect } from "next/navigation";

/** Retired V1 URL. Shared data and V2 screens remain in their own modules. */
export default function RetiredPage() {
  redirect("/pickems");
}
