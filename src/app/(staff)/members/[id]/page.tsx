import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function StaffMemberDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <PlaceholderPage
      title="Member Detail"
      route={`/staff/members/${params.id}`}
      role={ROLES.STAFF}
      description="View member profile, booking history and subscription status."
    />
  );
}
