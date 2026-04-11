import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function InvitesPage() {
  return (
    <PlaceholderPage
      title="Guest Invites"
      route="/invites"
      role={ROLES.MEMBER}
      description="Invite friends to share a booking at the club."
    />
  );
}
