/**
 * DEV ONLY: on the local dev server (localhost), pages that normally bounce a signed-out visitor to Sign in /
 * Create an Account open in their signed-out state instead. Always false in a production build.
 */
export const skipSignInWall = () => process.env.NODE_ENV === "development";
