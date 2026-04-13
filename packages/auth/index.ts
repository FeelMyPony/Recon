import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@recon/db/client";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@recon/shared/schema/auth";

function createAuthConfig() {
  const db = getDb();

  return NextAuth({
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),

    session: {
      strategy: "database",
    },

    providers: [
      // Email magic link
      Nodemailer({
        server: {
          host: process.env.SMTP_HOST ?? "localhost",
          port: Number(process.env.SMTP_PORT ?? "1025"),
          auth:
            process.env.SMTP_USER && process.env.SMTP_PASS
              ? {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS,
                }
              : undefined,
          // In local dev (Mailpit), no TLS needed
          ...(process.env.NODE_ENV === "development"
            ? { secure: false, tls: { rejectUnauthorized: false } }
            : {}),
        },
        from: process.env.EMAIL_FROM ?? "RECON <noreply@recon.app>",
      }),

      // Google OAuth
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    ],

    pages: {
      signIn: "/login",
      verifyRequest: "/login/check-email",
      error: "/login/error",
    },

    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
  });
}

// Lazy initialisation to avoid errors during build
let _auth: ReturnType<typeof NextAuth> | null = null;

function getAuth() {
  if (!_auth) {
    _auth = createAuthConfig();
  }
  return _auth;
}

export const handlers = {
  GET: (req: any) => getAuth().handlers.GET(req),
  POST: (req: any) => getAuth().handlers.POST(req),
};

export const auth = () => (getAuth().auth as any)();
export const signIn = (provider?: string, options?: any) =>
  (getAuth().signIn as any)(provider, options);
export const signOut = (options?: any) =>
  (getAuth().signOut as any)(options);
