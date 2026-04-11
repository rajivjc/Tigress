import { AppHeader } from "@/components/ui/AppHeader";
import { StaffMobileNav } from "@/components/ui/StaffMobileNav";
import { StaffSidebar } from "@/components/ui/StaffSidebar";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <AppHeader subtitle="Owner" />
      <div className="flex">
        <StaffSidebar />
        <main className="min-h-screen flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <StaffMobileNav />
    </div>
  );
}
