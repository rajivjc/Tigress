import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Member Dashboard"
      route="/dashboard"
      role={ROLES.MEMBER}
      description="Your upcoming bookings, credits, and club activity."
    />
  );
}
