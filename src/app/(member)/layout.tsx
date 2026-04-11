import { AppHeader } from "@/components/ui/AppHeader";
import { MemberNav } from "@/components/ui/MemberNav";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedRoles={["member", "staff", "manager", "owner"]}>
      <div className="min-h-screen pb-20">
        <AppHeader subtitle="Member" />
        <main className="mx-auto max-w-md">{children}</main>
        <MemberNav />
      </div>
    </RouteGuard>
  );
}
