import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Treat requests as "local desktop" when:
 *   - NODE_ENV !== production, AND
 *   - request host is localhost / 127.0.0.1
 *
 * In that mode we skip the login page entirely and bounce straight through
 * /api/dev-login, which mints a session for the seed dev user. Hosted
 * Vercel traffic is never local, so normal Google/magic-link auth applies.
 */
function isLocalDesktop(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const host = request.headers.get("host") ?? "";
  const h = host.toLowerCase().split(":")[0];
  return h === "localhost" || h === "127.0.0.1";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");

  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  const isLoggedIn = !!sessionToken;
  const localDesktop = isLocalDesktop(request);

  // Local desktop: never show the login page — redirect to dev-login.
  if (localDesktop && isAuthRoute) {
    const callbackUrl =
      request.nextUrl.searchParams.get("callbackUrl") || "/map";
    return NextResponse.redirect(
      new URL(
        `/api/dev-login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
        request.url,
      ),
    );
  }

  // Authenticated users on /login -> /map
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/map", request.url));
  }

  // Unauthenticated on protected routes
  if (!isLoggedIn && !isAuthRoute) {
    const callbackUrl = encodeURIComponent(pathname + request.nextUrl.search);
    if (localDesktop) {
      return NextResponse.redirect(
        new URL(`/api/dev-login?callbackUrl=${callbackUrl}`, request.url),
      );
    }
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/dev-login|api/webhooks|api/cron|_next|favicon\\.ico|public).*)",
  ],
};
