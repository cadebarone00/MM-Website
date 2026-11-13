import { redirect } from "next/navigation";

/** App → Create: straight to a new code tournament, as on the website. */
export default function AppCreatePage() {
  redirect("/tournaments/code/new/");
}
