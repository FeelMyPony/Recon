/**
 * Dev-only auto-login.
 *
 * Skips Google/magic-link auth entirely — looks up (or creates) the seed
 * dev user, inserts a fresh sessions row, and sets the Auth.js DB-session
 * cookie. The user is redirected to `callbackUrl` (or /map).
 *
 * HARD GUARDS:
 *   - Refuses when NODE_ENV === "production"
 *   - Refuses when the request host isn't localhost / 127.0.0.1
 *
 * This is the "just open the desktop app and you're in" shortcut. It does
 * not replace Auth.js for the hosted Vercel deployment — that still uses
 * Google + magic link normally.
 */

import { randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { getDb } from "@recon/db/client";
import { users, sessions } from "@recon/shared/schema/auth";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "seed-dev-user-001";
const DEV_USER_EMAIL = "dev@recon.local";
const DEV_USER_NAME = "Dev User";
const SESSION_TTL_DAYS = 30;

function isLocalhost(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not available in production", { status: 404 });
  }

  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!isLocalhost(host)) {
    return new Response(`Dev login only works on localhost (got host: ${host})`, {
      status: 403,
    });
  }

  const url = new URL(req.url);
  const callbackUrl = url.searchParams.get("callbackUrl") || "/map";

  const db = getDb();

  // 1. Upsert the dev user (safe if seed never ran)
  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      name: DEV_USER_NAME,
      email: DEV_USER_EMAIL,
      emailVerified: new Date(),
    })
    .onConflictDoNothing({ target: users.id });

  // 2. Mint a new session token
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000);

  await db.insert(sessions).values({
    sessionToken,
    userId: DEV_USER_ID,
    expires,
  });

  // 3. Set the Auth.js DB-session cookie
  const cookieStore = await cookies();
  cookieStore.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: false, // localhost only
  });

  // 4. Redirect to the original target
  const safeTarget = callbackUrl.startsWith("/") ? callbackUrl : "/map";
  return Response.redirect(new URL(safeTarget, req.url), 302);
}
