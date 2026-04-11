import { APP_NAME } from "@/lib/constants";
import { HeaderAuthControls } from "./HeaderAuthControls";

interface AppHeaderProps {
  subtitle?: string;
}

export function AppHeader({ subtitle }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-primary/80 px-4 py-3 backdrop-blur-md md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white">
            {APP_NAME}
            <span className="text-accent">.</span>
          </h1>
          {subtitle && (
            <p className="text-xs text-white/50">{subtitle}</p>
          )}
        </div>
        <HeaderAuthControls />
      </div>
    </header>
  );
}
