import { redirect } from "next/navigation";

/** The manual settlement screen was retired: Match Close Out settles the
 * authoritative live-match market automatically. */
export default function RetiredSettlementPage() {
  redirect("/portal/admin");
}
