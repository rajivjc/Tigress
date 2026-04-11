import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function StaffMembersPage() {
  return (
    <PlaceholderPage
      title="Members"
      route="/members"
      role={ROLES.MANAGER}
      description="Manage membership records, tiers and access."
    />
  );
}
