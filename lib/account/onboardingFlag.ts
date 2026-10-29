/**
 * Pending accounts Phase 6: the real sign-up / onboarding screens (/start/*, /onboarding/*) and the code check
 * (POST /api/auth/verify-code) exist only when MAROON_V2_ONBOARDING is exactly "on". OFF by default — the registration
 * flow is not open to the public until the legal review of the age-screen order is done (project_specs.md §13).
 */
export const onboardingEnabled = () => process.env.MAROON_V2_ONBOARDING === "on";
