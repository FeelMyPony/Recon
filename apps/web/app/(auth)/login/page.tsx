"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("nodemailer", { email, callbackUrl: "/map" });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/map" });
    } catch {
      setError("Something went wrong. Please try again.");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy-900">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal text-lg font-bold tracking-wider text-brand-navy-900">
            R
          </div>
          <h1 className="text-xl font-bold tracking-wider text-white">RECON</h1>
          <p className="mt-1 text-sm text-slate-400">
            AI-powered outreach automation
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
          {/* Error banner */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Email magic link */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-xs font-medium text-slate-400"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                disabled={loading}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-teal px-3 py-2 text-sm font-medium text-brand-navy-900 transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-700" />
            <span className="text-xs text-slate-500">or</span>
            <div className="h-px flex-1 bg-slate-700" />
          </div>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          By continuing, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}
