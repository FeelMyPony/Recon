import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy-900">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal text-lg font-bold tracking-wider text-brand-navy-900">
          R
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
          <div className="mb-2 text-3xl">&#x2709;&#xFE0F;</div>
          <h2 className="text-base font-semibold text-white">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            A sign-in link has been sent to your email address. Click the link
            to log in to your account.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            If you don&apos;t see it, check your spam folder.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block text-sm text-brand-teal hover:underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
