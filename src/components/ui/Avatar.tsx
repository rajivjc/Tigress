import { initials } from "@/lib/format";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
};

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const classes = `inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-accent/20 font-semibold uppercase text-white ${SIZE_CLASS[size]} ${className ?? ""}`;

  if (src) {
    // Using a plain img tag keeps things simple and avoids needing to
    // configure next/image domains for arbitrary avatar URLs.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className={`${classes} object-cover`} />
    );
  }

  return (
    <span className={classes} aria-label={name}>
      {initials(name)}
    </span>
  );
}
