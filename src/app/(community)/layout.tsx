import { AppHeader } from "@/components/ui/AppHeader";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedRoles={["member", "staff", "manager", "owner"]}>
      <div className="min-h-screen pb-20">
        <AppHeader subtitle="Community" />
        <main className="mx-auto max-w-2xl">{children}</main>
      </div>
    </RouteGuard>
  );
}
