/** The account screens to design, in the order a new person meets them (dev simulator: Authentication group). */
export const AUTH_SCREENS = [
  ["welcome", "Welcome"],
  ["verification-code", "Verification code"],
  ["link-result", "Link confirmed / expired"], // the other way through verification: they tapped the email link
  ["password", "Create password"],
  ["name-username", "Name + username"],
  ["photo", "Profile photo"],
  ["settings", "Settings: profile privacy + notifications"],
  ["all-set", "You're all set"],
  ["sign-in", "Sign in"],
  ["forgot-password", "Forgot password"],
  ["reset-password", "Reset password"],
  ["terms", "Terms of Service"],
  ["privacy", "Privacy Policy"],
  ["apple", "Sign in with Apple"],
  ["google", "Sign in with Google"],
  ["age-check", "Age check"],
] as const;
