import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");

  // Check for auth session cookie (Auth.js v5 uses this cookie name)
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  const isLoggedIn = !!sessionToken;

  // Authenticated users on /login -> redirect to /map
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/map", request.url));
  }

  // Unauthenticated users on protected routes -> redirect to /login
  if (!isLoggedIn && !isAuthRoute) {
    const callbackUrl = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/webhooks|_next|favicon\\.ico|public).*)",
  ],
};
