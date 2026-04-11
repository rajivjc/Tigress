import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white">
          {APP_NAME}
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/40">
          Members only
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
