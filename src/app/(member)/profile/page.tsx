import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function ProfilePage() {
  return (
    <PlaceholderPage
      title="Profile"
      route="/profile"
      role={ROLES.MEMBER}
      description="Personal details, membership tier and preferences."
    />
  );
}
