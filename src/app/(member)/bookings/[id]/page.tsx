import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function BookingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <PlaceholderPage
      title="Booking Detail"
      route={`/bookings/${params.id}`}
      role={ROLES.MEMBER}
      description="View reservation details, invited guests and cancellation options."
    />
  );
}
