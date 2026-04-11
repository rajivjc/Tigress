interface PlaceholderPageProps {
  title: string;
  route: string;
  role: string;
  description?: string;
}

export function PlaceholderPage({
  title,
  route,
  role,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/60 p-6 shadow-xl backdrop-blur">
        <div className="mb-4 inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent">
          {role}
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-white">{title}</h1>
        <p className="mb-4 font-mono text-xs text-white/50">{route}</p>
        {description && (
          <p className="mb-4 text-sm text-white/70">{description}</p>
        )}
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-4 text-center text-sm text-white/60">
          Coming soon
        </div>
      </div>
    </div>
  );
}
