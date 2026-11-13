import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isCatalogScope, catalogScopeForPath } from "@/lib/website/settings";
import { enforceAccountAccess } from "@/lib/account/accessGate";
import { appCorsHeaders, isAppOrigin } from "@/lib/app/appCors";

export async function middleware(request: NextRequest) {
  // The iPhone / Android app calling /api (lib/app/appCors.ts): answer the browser's permission check, and label every
  // response so the app may read it. Website requests have no app origin and are untouched.
  const origin = request.headers.get("origin");
  const fromApp = request.nextUrl.pathname.startsWith("/api/") && isAppOrigin(origin);
  if (fromApp && request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: appCorsHeaders(origin) });
  const result = await handle(request);
  if (fromApp) for (const [key, value] of Object.entries(appCorsHeaders(origin))) result.headers.set(key, value);
  return result;
}

// Refreshes the Supabase auth cookie on every non-static request. Without
// this, a session's access token silently expires (~1hr) and Server
// Components (which can't write cookies themselves) would see the user as
// logged out even though their refresh token is still valid.
async function handle(request: NextRequest) {
  const requestedSection = request.nextUrl.searchParams.get("section");
  // Replace incoming headers rather than trusting a caller-supplied section.
  request.headers.set("x-mm-website-section", request.nextUrl.pathname.startsWith("/api/") && isCatalogScope(requestedSection)
    ? requestedSection : catalogScopeForPath(request.nextUrl.pathname));
  // Without these, an unconfigured deployment would 500 on every single
  // page (not just account pages) since this middleware runs on almost
  // every request. Skip Supabase entirely rather than crash the whole site.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  // Pending accounts Phase 5: Active-only access. Inert unless MAROON_ACCOUNT_ENFORCEMENT=on (lib/account/accessGate.ts).
  const blocked = await enforceAccountAccess(request, user);
  if (blocked) {
    response.cookies.getAll().forEach((cookie) => blocked.cookies.set(cookie));
    return blocked;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|mp4)$).*)"],
};
