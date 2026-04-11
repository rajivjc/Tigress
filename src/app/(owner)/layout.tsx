import { AppHeader } from "@/components/ui/AppHeader";
import { StaffMobileNav } from "@/components/ui/StaffMobileNav";
import { StaffSidebar } from "@/components/ui/StaffSidebar";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedRoles={["owner"]}>
      <div className="min-h-screen">
        <AppHeader subtitle="Owner" />
        <div className="flex">
          <StaffSidebar />
          <main className="min-h-screen flex-1 pb-20 md:pb-0">{children}</main>
        </div>
        <StaffMobileNav />
      </div>
    </RouteGuard>
  );
}
