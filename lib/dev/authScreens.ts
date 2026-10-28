/** The sign-up path, in order. The bar at the top of each step fills to (its place ÷ how many there are), so on the
 * 7th of 8 it's 87.5% full. Add or remove a step here and every bar adjusts. */
const SIGN_UP_STEPS = ["sign-up", "verification-code", "password", "name-username", "age-check", "photo", "settings", "profile-created"];
export function signUpProgress(slug: string) {
  return `${((SIGN_UP_STEPS.indexOf(slug) + 1) / SIGN_UP_STEPS.length) * 100}%`;
}

/** The account screens to design, in the order a new person meets them (dev simulator: Authentication group). */
export const AUTH_SCREENS = [
  ["welcome", "Welcome: Sign up or Log in"],
  ["sign-up", "Sign up"],
  ["verification-code", "Verification code"],
  ["link-result", "Link confirmed / expired"], // the other way through verification: they tapped the email link
  ["password", "Create password"],
  ["name-username", "Name + username"],
  ["age-check", "Birthday (age check)"],
  ["photo", "Profile photo"],
  ["settings", "Settings: profile privacy + notifications"],
  ["profile-created", "Profile created"],
  ["sign-in", "Log in"],
  ["forgot-password", "Forgot password"],
  ["reset-code", "Reset password code"],
  ["reset-password", "Reset password"],
  ["terms", "Terms of Service"],
  ["privacy", "Privacy Policy"],
  ["apple", "Sign in with Apple"],
  ["google", "Sign in with Google"],
] as const;
