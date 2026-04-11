import { AppHeader } from "@/components/ui/AppHeader";
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
        <main className="min-h-screen flex-1">{children}</main>
      </div>
    </div>
  );
}
