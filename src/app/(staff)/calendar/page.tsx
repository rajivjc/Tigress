import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function StaffCalendarPage() {
  return (
    <PlaceholderPage
      title="Staff Calendar"
      route="/calendar"
      role={ROLES.STAFF}
      description="All bookings across the day, week, and month."
    />
  );
}
