import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function BookingsPage() {
  return (
    <PlaceholderPage
      title="My Bookings"
      route="/bookings"
      role={ROLES.MEMBER}
      description="View, modify and cancel your reservations."
    />
  );
}
