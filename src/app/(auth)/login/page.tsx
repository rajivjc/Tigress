import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-6 shadow-xl backdrop-blur">
      <h2 className="mb-1 text-xl font-semibold text-white">Sign in</h2>
      <p className="mb-6 text-sm text-white/50">
        Access your membership
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
        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-xs uppercase tracking-wider text-white/50"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-xs">
        <Link
          href="/forgot-password"
          className="text-white/50 hover:text-accent"
        >
          Forgot password?
        </Link>
        <span className="text-white/30">Not functional yet</span>
      </div>
    </div>
  );
}
