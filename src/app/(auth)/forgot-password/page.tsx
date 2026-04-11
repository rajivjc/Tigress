import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-6 shadow-xl backdrop-blur">
      <h2 className="mb-1 text-xl font-semibold text-white">Reset password</h2>
      <p className="mb-6 text-sm text-white/50">
        We&apos;ll send a reset link to your email
      </p>

      <form className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-xs uppercase tracking-wider text-white/50"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Send reset link
        </button>
      </form>

      <div className="mt-4 text-center text-xs">
        <Link href="/login" className="text-white/50 hover:text-accent">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
