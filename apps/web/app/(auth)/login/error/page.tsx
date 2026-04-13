"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const errorMessages: Record<string, string> = {
  Configuration:
    "There is a problem with the server configuration. Please contact support.",
  AccessDenied: "Access denied. You do not have permission to sign in.",
  Verification:
    "The verification link has expired or has already been used. Please request a new one.",
  Default: "An unexpected error occurred. Please try again.",
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const errorType = searchParams.get("error") ?? "Default";
  const message = errorMessages[errorType] ?? errorMessages.Default;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
      <div className="mb-2 text-3xl">&#x26A0;&#xFE0F;</div>
      <h2 className="text-base font-semibold text-white">
        Authentication Error
      </h2>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
      <Link
        href="/login"
        className="mt-5 inline-block rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy-900 transition-colors hover:bg-brand-teal-600"
      >
        Back to login
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy-900">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal text-lg font-bold tracking-wider text-brand-navy-900">
          R
        </div>
        <Suspense>
          <ErrorContent />
        </Suspense>
      </div>
    </div>
  );
}
