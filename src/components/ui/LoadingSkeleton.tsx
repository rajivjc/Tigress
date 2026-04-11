import { APP_NAME } from "@/lib/constants";

export function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <h1 className="animate-pulse text-4xl font-bold text-white">
        {APP_NAME}
        <span className="text-accent">.</span>
      </h1>
      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/30">
        Loading
      </p>
    </div>
  );
}
