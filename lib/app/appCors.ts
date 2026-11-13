/**
 * Which origins may call /api from the iPhone / Android app (project_specs.md "The Maroon as a real iPhone app"):
 * Capacitor's own app origins, plus the app build's dev server on this Mac (development only). The app signs requests
 * with `Authorization: Bearer`, never cookies, so credentials are never allowed cross-origin. Every other site is still
 * refused by the browser.
 */
const APP_ORIGINS = ["capacitor://localhost", "https://localhost"];
const DEV_APP_ORIGINS = ["http://localhost:3002"];

export function isAppOrigin(origin: string | null, development = process.env.NODE_ENV === "development"): origin is string {
  return !!origin && (APP_ORIGINS.includes(origin) || (development && DEV_APP_ORIGINS.includes(origin)));
}

/** The headers that let the app read the response (and send its login and JSON / form bodies). */
export function appCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
