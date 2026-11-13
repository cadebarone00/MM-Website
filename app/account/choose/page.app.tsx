import { redirect } from "next/navigation";

/** App → Choose account: the app is always signed in here, so it goes to your profile (as the website does). */
export default function AppChooseAccount() {
  redirect("/profile/");
}
