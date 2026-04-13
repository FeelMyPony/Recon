export { auth as authMiddleware } from "./index";

/**
 * Route matcher config for Next.js middleware.
 * Protects all dashboard routes, allows auth routes and API webhooks.
 */
export const authConfig = {
  matcher: [
    /*
     * Match all paths except:
     * - /login, /api/auth (auth flow)
     * - /api/webhooks (external callbacks)
     * - /_next (Next.js internals)
     * - /favicon.ico, /public (static assets)
     */
    "/((?!login|api/auth|api/webhooks|_next|favicon.ico|public).*)",
  ],
};
