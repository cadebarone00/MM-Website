import { redirect } from "next/navigation";

/** The old "What are you creating?" page: Create a Tournament now goes straight to the tournament setup. */
export default function CreatePage() {
  redirect("/tournaments/code/new");
}
