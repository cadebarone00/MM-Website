import { redirect } from "next/navigation";

/** Profile → Friends moved into the Search page's Friends tab (owner request 2026-11-20). Old links land there. */
export default function FriendsPage() {
  redirect("/profile/search?tab=friends");
}
